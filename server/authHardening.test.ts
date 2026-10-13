import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { privateKeyToAccount } from 'viem/accounts';
import { AuthRequestLimiter } from './authRequestGuard';
import { cleanupAuthRecords, createAuthMaintenance } from './authMaintenance';

const folder = mkdtempSync(join(tmpdir(), 'carpan-auth-hardening-'));
process.env.REFBRIDGE_DB_PATH = join(folder, 'auth.sqlite');
process.env.NODE_ENV = 'test'; process.env.REFVOX_AUTH_MODE = 'live';
process.env.VITE_APP_URL = 'http://127.0.0.1:5173';
process.env.X_CLIENT_ID = 'hardening-client'; process.env.X_CLIENT_SECRET = 'hardening-secret';
process.env.X_LOGIN_ENABLED = 'true';
const { app } = await import('./index');
const { db } = await import('./sqliteDb');
const { createSession, ARC_TESTNET_CHAIN_ID } = await import('./auth');
const wallet = privateKeyToAccount(`0x${'44'.repeat(32)}`);
let server: ReturnType<typeof app.listen>, base: string, cookie: string;
beforeAll(async () => {
  db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,created_at) VALUES('hardening_owner','hardening:x','owner','Owner',?)", [new Date().toISOString()]);
  cookie = `refbridge_session=${createSession('hardening_owner')}`;
  server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  const target = resolve(folder); if (!target.startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup');
  rmSync(target, { recursive: true, force: true });
});
function post(path: string, body: unknown, extra: Record<string, string> = {}) {
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...extra }, body: JSON.stringify(body) });
}

test('bounded limiter keeps active limits, isolates keys and expires them', () => {
  const limiter = new AuthRequestLimiter(2);
  expect(limiter.consume('one', 2, 1000, 100).allowed).toBe(true);
  expect(limiter.consume('one', 2, 1000, 101).allowed).toBe(true);
  expect(limiter.consume('one', 2, 1000, 102)).toEqual({ allowed: false, retryAfter: 1 });
  expect(limiter.consume('two', 2, 1000, 102).allowed).toBe(true);
  expect(limiter.consume('three', 2, 1000, 103).allowed).toBe(false);
  expect(limiter.size).toBe(2);
  expect(limiter.consume('three', 2, 1000, 1103).allowed).toBe(true);
  expect(limiter.size).toBe(1);
});

test('cross-site auth mutation is rejected before issuing a challenge', async () => {
  const before = db.query('SELECT COUNT(*) AS n FROM wallet_login_challenges').get();
  expect((await post('/auth/wallet/challenge', { address: wallet.address }, { Origin: 'https://another.example' })).status).toBe(403);
  expect((await post('/auth/wallet/challenge', { address: wallet.address }, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  expect(db.query('SELECT COUNT(*) AS n FROM wallet_login_challenges').get()).toEqual(before);
});

test('wallet challenge rate limit rejects before growing the database', async () => {
  const headers = { 'X-Forwarded-For': '198.51.100.20' };
  for (let i = 0; i < 20; i++) expect((await post('/auth/wallet/challenge', { address: wallet.address }, headers)).status).toBe(200);
  const before = db.query('SELECT COUNT(*) AS n FROM wallet_login_challenges').get();
  const limited = await post('/auth/WALLET/challenge/', { address: wallet.address }, headers);
  expect(limited.status).toBe(429); expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(db.query('SELECT COUNT(*) AS n FROM wallet_login_challenges').get()).toEqual(before);
});

test('OAuth starts share a per-IP limit without issuing another state cookie', async () => {
  const headers = { 'X-Forwarded-For': '198.51.100.30' };
  for (let i = 0; i < 30; i++) expect((await fetch(base + '/auth/x/start', { headers })).status).toBe(200);
  const before = db.query('SELECT COUNT(*) AS n FROM x_oauth_states').get();
  const limited = await fetch(base + '/auth/google/start', { headers });
  expect(limited.status).toBe(429); expect(limited.headers.get('set-cookie')).toBeNull();
  expect(db.query('SELECT COUNT(*) AS n FROM x_oauth_states').get()).toEqual(before);
});

test('wallet linking uses chain-neutral exact one-use ownership proof', async () => {
  const challenge = await (await post('/wallet/nonce', {})).json() as { nonce: string; message: string };
  expect(challenge.message).toContain('Ağ değiştirmeniz gerekmez.'); expect(challenge.message).not.toContain('Arc Testnet');
  const signature = await wallet.signMessage({ message: challenge.message });
  const body = { address: wallet.address, signature, ...challenge };
  expect((await post('/wallet/verify', { ...body, message: challenge.message + ' tampered' })).status).toBe(400);
  expect((await post('/wallet/verify', { ...body, chainId: 5042 })).status).toBe(200);
  expect((await post('/wallet/verify', body)).status).toBe(400);
  const next = await (await post('/wallet/nonce', {})).json() as { nonce: string; message: string };
  expect((await post('/wallet/verify', { address: wallet.address, ...next, signature: await wallet.signMessage({ message: next.message }) })).status).toBe(200);
});

test('already-issued legacy nonce accepts only its exact original Testnet message', async () => {
  const nonce = 'ab'.repeat(16), now = new Date().toISOString();
  const message = `Carpan Cüzdan Doğrulama\n\nHesap: hardening_owner\nAğ: Arc Testnet (Chain ID: ${ARC_TESTNET_CHAIN_ID})\n\nCüzdan adresini hesabınıza bağlamak için bu mesajı imzalayın.\n\nNonce: ${nonce}\n\nBu imza gaz ücreti gerektirmez.`;
  db.run("INSERT INTO auth_nonces(id,user_id,nonce,purpose,expires_at,created_at) VALUES('legacy_link','hardening_owner',?,'wallet_verify',?,?)", [nonce, new Date(Date.now() + 60_000).toISOString(), now]);
  const body = { nonce, message, address: wallet.address, signature: await wallet.signMessage({ message }) };
  expect((await post('/wallet/verify', { ...body, chainId: 5042 })).status).toBe(400);
  expect((await post('/wallet/verify', { ...body, chainId: ARC_TESTNET_CHAIN_ID })).status).toBe(200);
});

test('bounded cleanup preserves unexpired records and email anti-abuse history', () => {
  const isolated = new Database(':memory:'), tables = ['auth_nonces', 'wallet_login_challenges', 'email_login_links', 'google_oauth_states', 'x_oauth_states', 'sessions'];
  try {
    for (const table of tables) {
      isolated.exec(`CREATE TABLE ${table}(expires_at TEXT, used INTEGER)`);
      isolated.run(`INSERT INTO ${table} VALUES(?,1),(?,1),(?,1)`, ['2000-01-01T00:00:00.000Z', '2001-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z']);
    }
    const first = cleanupAuthRecords(isolated, '2026-10-09T00:00:00.000Z', 1);
    expect(Object.values(first)).toEqual([1, 1, 1, 1, 1, 1]);
    const maintain = createAuthMaintenance(isolated); maintain(Date.parse('2026-10-09T00:00:00.000Z'));
    for (const table of tables) expect(isolated.query(`SELECT * FROM ${table}`).all()).toEqual([{ expires_at: '2099-01-01T00:00:00.000Z', used: 1 }]);
  } finally { isolated.close(); }
});
