import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'refvox-program-'));
process.env.REFBRIDGE_DB_PATH = path.join(tempDir, 'test.db');
process.env.REFVOX_AUTH_MODE = 'live';
process.env.NODE_ENV = 'test';

const [{ app }, { db, grantInitialFreeSlots }, { createSession }] = await Promise.all([
  import('./index.ts'), import('./sqliteDb.ts'), import('./auth.ts'),
]);

let server: ReturnType<typeof app.listen>;
let baseUrl = '';
const cookies = new Map<string, string>();

function addUser(id: string, role = 'user') {
  db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,role,is_demo,created_at)
    VALUES(?,?,?,?,?,0,?)`, [id, `test-${id}`, id, id, role, new Date().toISOString()]);
  grantInitialFreeSlots(id);
  cookies.set(id, `refbridge_session=${createSession(id)}`);
}

async function api(user: string | null, method: string, route: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { ...(user ? { cookie: cookies.get(user)! } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server failed to start');
  baseUrl = `http://127.0.0.1:${address.port}`;
  addUser('admin', 'admin');
  addUser('alice');
  for (let i = 1; i <= 8; i++) addUser(`owner${i}`);
  for (let i = 1; i <= 7; i++) {
    db.run(`INSERT INTO projects(id,submitted_by,name,official_domain,referral_link_pattern,
      valid_participation_condition,participant_benefit,status,allows_free_participation,
      allows_paid_participation,is_demo,created_at) VALUES(?,?,?,?,?,?,?,'approved',1,0,0,?)`,
      [`p${i}`, `owner${i}`, `Project ${i}`, `p${i}.example`, `https://p${i}.example/join?ref={code}`,
        'Complete project signup', 'Project access', new Date().toISOString()]);
  }
  db.run(`INSERT INTO projects(id,submitted_by,name,official_domain,referral_link_pattern,referral_mode,
    valid_participation_condition,participant_benefit,status,allows_free_participation,
    allows_paid_participation,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,'approved',1,0,0,?)`,
  ['p8', 'owner8', 'Conso', 'conso.xyz', 'https://conso.xyz/extension', 'code',
    'Install the extension and submit proof that the inviter code was accepted.',
    'Zaps and referral bonuses subject to CONSO rules.', new Date().toISOString()]);
});

afterAll(async () => {
  if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('one free card, five distinct verified tasks, earned next card, guarded capacity and public leaderboard', async () => {
  const ownerLinks: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const created = await api(`owner${i}`, 'POST', '/referral-links', { projectId: `p${i}`, referralCode: `owner${i}` });
    expect(created.status).toBe(200);
    expect(created.body.availableSlots).toBe(5);
    ownerLinks.push(created.body.id);
  }
  const first = await api('alice', 'POST', '/referral-links', { projectId: 'p6', referralCode: 'alice6' });
  expect(first.status).toBe(200);
  expect(first.body.availableSlots).toBe(5);
  const premature = await api('alice', 'POST', '/referral-links', { projectId: 'p7', referralCode: 'alice7' });
  expect(premature.status).toBe(409);

  for (let i = 1; i <= 5; i++) {
    const reserved = await api('alice', 'POST', '/participations/reserve', {
      projectId: `p${i}`, participationType: 'free', referralLinkId: ownerLinks[i - 1],
    });
    expect(reserved.status).toBe(200);
    const submitted = await api('alice', 'POST', '/participations/submit', {
      reservationId: reserved.body.reservation.id, proof: `Project signup evidence ${i}`,
    });
    expect(submitted.status).toBe(200);
    const duplicateSubmit = await api('alice', 'POST', '/participations/submit', {
      reservationId: reserved.body.reservation.id, proof: 'duplicate',
    });
    expect(duplicateSubmit.status).toBe(409);
    const verified = await api('admin', 'POST', `/participations/${submitted.body.id}/verify`);
    expect(verified.status).toBe(200);
    expect(verified.body.status).toBe('verified');
    const repeatVerify = await api('admin', 'POST', `/participations/${submitted.body.id}/verify`);
    expect(repeatVerify.status).toBe(400);
    const duplicateProject = await api('alice', 'POST', '/participations/reserve', {
      projectId: `p${i}`, participationType: 'free',
    });
    expect(duplicateProject.status).toBe(409);
    const status = await api('alice', 'GET', '/referral-program/mine');
    expect(status.body.progress).toBe(i === 5 ? 0 : i);
  }

  const earned = await api('alice', 'GET', '/referral-program/mine');
  expect(earned.body.earnedBatches).toBe(1);
  expect(earned.body.unassignedSlots).toBe(5);
  expect(earned.body.remainingSlots).toBe(10);
  const second = await api('alice', 'POST', '/referral-links', { projectId: 'p7', referralCode: 'alice7' });
  expect(second.status).toBe(200);
  expect(second.body.availableSlots).toBe(5);

  const publicCards = await api(null, 'GET', '/referral-center/cards');
  expect(publicCards.status).toBe(200);
  expect(publicCards.body.some((card: any) => card.id === first.body.id && card.availableSlots === 5)).toBe(true);
  expect(JSON.stringify(publicCards.body)).not.toContain('test-alice');
  const leaders = await api(null, 'GET', '/referral-program/leaderboard?period=all');
  expect(leaders.status).toBe(200);
  expect(leaders.body[0].score).toBe(5);

  for (let i = 1; i <= 6; i++) addUser(`joiner${i}`);
  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, i) => api(`joiner${i + 1}`, 'POST', '/participations/reserve', {
    projectId: 'p6', participationType: 'free', referralLinkId: first.body.id,
  })));
  expect(concurrent.filter(result => result.status === 200).length).toBe(5);
  expect(concurrent.filter(result => result.status !== 200).length).toBe(1);
  const held = await api('alice', 'GET', '/referral-program/mine');
  expect(held.body.availableSlots).toBe(5);
  expect(held.body.pendingSlots).toBe(5);

  const rejectedIndex = concurrent.findIndex(result => result.status === 200);
  const rejectedUser = `joiner${rejectedIndex + 1}`;
  const rejectedSubmission = await api(rejectedUser, 'POST', '/participations/submit', {
    reservationId: concurrent[rejectedIndex].body.reservation.id, proof: 'Evidence for manual review',
  });
  expect(rejectedSubmission.status).toBe(200);
  const rejected = await api('admin', 'POST', `/participations/${rejectedSubmission.body.id}/reject`, {
    reason: 'Project signup not found',
  });
  expect(rejected.status).toBe(200);
  expect(rejected.body.status).toBe('rejected');
  const afterRejection = await api('alice', 'GET', '/referral-program/mine');
  expect(afterRejection.body.availableSlots).toBe(6);
  expect(afterRejection.body.remainingSlots).toBe(10);
  const rejectedUserStatus = await api(rejectedUser, 'GET', '/referral-program/mine');
  expect(rejectedUserStatus.body.contributionCount).toBe(0);
});

test('code-based project keeps the inviter code separate from its official destination', async () => {
  const created = await api('owner8', 'POST', '/referral-links', {
    projectId: 'p8', referralCode: 'CONSO-58DQ8',
  });
  expect(created.status).toBe(200);
  expect(created.body.referralCode).toBe('CONSO-58DQ8');
  expect(created.body.fullLink).toBe('https://conso.xyz/extension');

  const reserved = await api('alice', 'POST', '/participations/reserve', {
    projectId: 'p8', participationType: 'free', referralLinkId: created.body.id,
  });
  expect(reserved.status).toBe(200);
  expect(reserved.body.referralCode).toBe('CONSO-58DQ8');
  expect(reserved.body.referralLink).toBe('https://conso.xyz/extension');

  const opened = await api(null, 'POST', '/discover/projects/p8/open', {});
  expect(opened.status).toBe(200);
  expect(opened.body).toMatchObject({
    url: 'https://conso.xyz/extension', referral: true, referralCode: 'CONSO-58DQ8',
  });
});
