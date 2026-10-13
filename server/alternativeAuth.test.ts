import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'refvox-login-'));
process.env.REFBRIDGE_DB_PATH = path.join(tempDir, 'test.db');
process.env.X_CLIENT_ID = 'login-test-client';
process.env.X_CLIENT_SECRET = 'login-test-secret';
process.env.RESEND_API_KEY = 'test-key';
process.env.RESEND_FROM_EMAIL = 'RefVox <login@example.test>';
process.env.VITE_APP_URL = 'http://127.0.0.1:5173';
process.env.NODE_ENV = 'test';

const [{ app }, { db, grantInitialFreeSlots }] = await Promise.all([import('./index.ts'), import('./sqliteDb.ts')]);
const wallet = privateKeyToAccount('0x' + '11'.repeat(32) as `0x${string}`);
const otherWallet = privateKeyToAccount('0x' + '22'.repeat(32) as `0x${string}`);
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let originalFetch: typeof fetch;
let latestEmailText = '';

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === 'https://api.resend.com/emails') {
      const body = JSON.parse(String(init?.body)) as { text: string };
      latestEmailText = body.text;
      return Response.json({ id: 'email-test' });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

async function post(pathname: string, body: unknown, cookie?: string) {
  return originalFetch(baseUrl + pathname, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
}

test('wallet login requires an exact one-use signature and keeps its session after refresh', async () => {
  const challengeRes = await post('/auth/wallet/challenge', { address: wallet.address });
  expect(challengeRes.status).toBe(200);
  const challenge = await challengeRes.json() as { nonce: string; message: string };
  expect((await post('/auth/wallet/complete', { address: wallet.address, ...challenge,
    signature: await otherWallet.signMessage({ message: challenge.message }) })).status).toBe(400);
  const signature = await wallet.signMessage({ message: challenge.message });
  expect((await post('/auth/wallet/complete', { address: otherWallet.address, ...challenge, signature })).status).toBe(400);
  const login = await post('/auth/wallet/complete', { address: wallet.address, ...challenge, signature });
  expect(login.status).toBe(200);
  const user = (await login.json() as { user: { id: string; authMethod: string; walletVerifiedAt: string; freeSlots: number } }).user;
  expect(user.authMethod).toBe('wallet');
  expect(user.walletVerifiedAt).toBeTruthy();
  expect(user.freeSlots).toBe(5);
  const cookie = login.headers.get('set-cookie')!.split(';', 1)[0];
  const status = await originalFetch(baseUrl + '/auth/status', { headers: { cookie } });
  expect((await status.json() as { user: { id: string } }).user.id).toBe(user.id);
  expect((await post('/auth/wallet/complete', { address: wallet.address, ...challenge, signature })).status).toBe(400);
  expect((await post('/auth/logout', {}, cookie)).status).toBe(200);
  const loggedOut = await originalFetch(baseUrl + '/auth/status', { headers: { cookie } });
  expect((await loggedOut.json() as { authenticated: boolean }).authenticated).toBe(false);

  const expired = await (await post('/auth/wallet/challenge', { address: wallet.address })).json() as
    { nonce: string; message: string };
  db.run("UPDATE wallet_login_challenges SET expires_at='2000-01-01T00:00:00.000Z'");
  expect((await post('/auth/wallet/complete', { address: wallet.address, ...expired,
    signature: await wallet.signMessage({ message: expired.message }) })).status).toBe(400);
});

test('email link is delivered, single-use, expiring, and creates only one account', async () => {
  expect((await post('/auth/email/start', { email: 'bad' })).status).toBe(400);
  expect((await post('/auth/email/start', { email: 'Alice@Example.test' })).status).toBe(200);
  const token = new URL(latestEmailText.match(/http:\/\/127\.0\.0\.1:5173\/\S+/)![0])
    .hash.slice('#email_token='.length);
  expect((db.query('SELECT COUNT(*) AS n FROM users WHERE email=?').get('alice@example.test') as { n: number }).n).toBe(0);
  const login = await post('/auth/email/complete', { token });
  expect(login.status).toBe(200);
  const user = (await login.json() as { user: { id: string; authMethod: string; email: string; freeSlots: number } }).user;
  expect(user.authMethod).toBe('email');
  expect(user.email).toBe('alice@example.test');
  expect(user.freeSlots).toBe(5);
  expect((await post('/auth/email/complete', { token })).status).toBe(400);
  expect((await post('/auth/email/start', { email: 'alice@example.test' })).status).toBe(200);
  const secondToken = latestEmailText.match(/#email_token=([A-Za-z0-9_-]+)/)![1];
  const secondLogin = await post('/auth/email/complete', { token: secondToken });
  expect((await secondLogin.json() as { user: { id: string } }).user.id).toBe(user.id);
  expect((await post('/auth/email/start', { email: 'alice@example.test' })).status).toBe(200);
  const expiringToken = latestEmailText.match(/#email_token=([A-Za-z0-9_-]+)/)![1];
  db.run("UPDATE email_login_links SET expires_at='2000-01-01T00:00:00.000Z' WHERE used=0");
  expect((await post('/auth/email/complete', { token: expiringToken })).status).toBe(400);
  expect((await post('/auth/email/start', { email: 'alice@example.test' })).status).toBe(429);
});

test('email opened in another tab retains its module destination and rejects external redirects', async () => {
  const target = '/onchain/projects?saved=1#projects';
  expect((await post('/auth/email/start', { email: 'return@example.test', redirect: target })).status).toBe(200);
  const link = new URL(latestEmailText.match(/http:\/\/127\.0\.0\.1:5173\/\S+/)![0]);
  expect(link.pathname).toBe('/login');
  expect(link.searchParams.get('next')).toBe(target);
  expect(link.search).not.toContain('email_token');
  const token = new URLSearchParams(link.hash.slice(1)).get('email_token');
  expect((await post('/auth/email/complete', {token})).status).toBe(200);
  expect((await post('/auth/email/complete', {token})).status).toBe(400);

  for (const [index, redirect] of ['https://evil.test', '//evil.test', '/login?next=%2Farc'].entries()) {
    expect((await post('/auth/email/start', {email: `guard-${index}@example.test`, redirect})).status).toBe(200);
    const unsafe = new URL(latestEmailText.match(/http:\/\/127\.0\.0\.1:5173\/\S+/)![0]);
    expect(unsafe.origin).toBe('http://127.0.0.1:5173');
    expect(unsafe.searchParams.get('next')).toBe('/');
  }
});

test('legacy real account receives only unspent initial capacity once', () => {
  const now = new Date().toISOString();
  db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,free_slots,role,is_demo,created_at)
    VALUES('legacy_slots','legacy:slots','legacy','Legacy',1,'user',0,?)`, [now]);
  for (let i = 0; i < 2; i++) {
    db.run(`INSERT INTO free_slots_ledger(id,user_id,delta,reason,created_at)
      VALUES(?,?,-1,'referral_verified',?)`, [`legacy_spent_${i}`, 'legacy_slots', now]);
  }
  grantInitialFreeSlots('legacy_slots');
  expect((db.query('SELECT free_slots AS slots FROM users WHERE id=?').get('legacy_slots') as { slots: number }).slots).toBe(3);
  grantInitialFreeSlots('legacy_slots');
  expect((db.query(`SELECT COUNT(*) AS count,SUM(delta) AS granted FROM free_slots_ledger
    WHERE user_id=? AND reason='initial_free_grant'`).get('legacy_slots') as { count: number; granted: number }))
    .toEqual({ count: 1, granted: 2 });
  expect((db.query('SELECT free_slots AS slots FROM users WHERE id=?').get('legacy_slots') as { slots: number }).slots).toBe(3);
});

test('a wallet already verified on an X account reopens that account', async () => {
  db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,wallet_address,wallet_verified_at,
    role,is_demo,created_at) VALUES('linked_x','123456789','linked','Linked X',?,?,'user',0,?)`,
    [otherWallet.address.toLowerCase(), new Date().toISOString(), new Date().toISOString()]);
  const challenge = await (await post('/auth/wallet/challenge', { address: otherWallet.address })).json() as
    { nonce: string; message: string };
  const login = await post('/auth/wallet/complete', { address: otherWallet.address, ...challenge,
    signature: await otherWallet.signMessage({ message: challenge.message }) });
  expect(login.status).toBe(200);
  const user = (await login.json() as { user: { id: string; authMethod: string } }).user;
  expect(user.id).toBe('linked_x');
  expect(user.authMethod).toBe('x');
  const cookie=login.headers.get('set-cookie')!.split(';',1)[0];
  const status=await (await originalFetch(baseUrl+'/auth/status',{headers:{cookie}})).json() as
    {session:{method:string};user:{id:string;linkedMethods:{method:string;identifier:string}[]}};
  expect(status.session.method).toBe('wallet');
  expect(status.user.id).toBe('linked_x');
  expect(status.user.linkedMethods).toEqual([{method:'x',identifier:'linked'},{method:'wallet',identifier:otherWallet.address.toLowerCase()}]);
});
