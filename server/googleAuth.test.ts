import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'refvox-google-'));
process.env.REFBRIDGE_DB_PATH = path.join(tempDir, 'test.db');
process.env.REFVOX_AUTH_MODE = 'live';
process.env.GOOGLE_CLIENT_ID = 'test-google-client';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.VITE_APP_URL = 'http://127.0.0.1:5173';
process.env.NODE_ENV = 'test';

const [{ app }, { db }] = await Promise.all([import('./index.ts'), import('./sqliteDb.ts')]);
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'refvox-test-key', alg: 'RS256', use: 'sig' };
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let originalFetch: typeof fetch;
let issuedNonce = '';
let issuedEmail = 'tester@example.test';
let issuedSubject = 'google-123';

function idToken(overrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID, sub: issuedSubject, email: issuedEmail,
    email_verified: true, name: 'Google Tester', nonce: issuedNonce,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides })).toString('base64url');
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server port');
  baseUrl = `http://127.0.0.1:${address.port}`;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('redirect_uri')).toBe('http://127.0.0.1:5173/api/auth/google/callback');
      expect(form.get('code_verifier')).toBeTruthy();
      return Response.json({ id_token: idToken() });
    }
    if (String(input) === 'https://www.googleapis.com/oauth2/v3/certs') {
      return Response.json({ keys: [jwk] }, { headers: { 'cache-control': 'public, max-age=60' } });
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

async function start(redirect = '/dashboard') {
  const response = await originalFetch(baseUrl + '/auth/google/start?redirect=' + encodeURIComponent(redirect), { redirect: 'manual' });
  expect(response.status).toBe(200);
  const { authUrl } = await response.json() as { authUrl: string };
  const url = new URL(authUrl);
  issuedNonce = url.searchParams.get('nonce') || '';
  expect(url.origin).toBe('https://accounts.google.com');
  expect(url.searchParams.get('scope')).toBe('openid email profile');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  return { state: url.searchParams.get('state')!, cookie: response.headers.get('set-cookie')!.split(';', 1)[0] };
}

test('Google callback validates state and signed identity, persists and logs out', async () => {
  const flow = await start();
  expect((await originalFetch(`${baseUrl}/auth/google/callback?state=${flow.state}&code=test`,
    { redirect: 'manual' })).headers.get('location')).toBe('/?error=invalid_state');
  const callback = await originalFetch(`${baseUrl}/auth/google/callback?state=${flow.state}&code=test`,
    { redirect: 'manual', headers: { cookie: flow.cookie } });
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toBe('/dashboard');
  const session = callback.headers.get('set-cookie')!.split(', ').find(item => item.startsWith('refbridge_session='))!
    .split(';', 1)[0];
  const status = await originalFetch(baseUrl + '/auth/status', { headers: { cookie: session } });
  const user = (await status.json() as { user: { authMethod: string; xId: null; email: string; role: string; freeSlots: number } }).user;
  expect(user.authMethod).toBe('google');
  expect(user.xId).toBeNull();
  expect(user.email).toBe(issuedEmail);
  expect(user.role).toBe('user');
  expect(user.freeSlots).toBe(5);
  const replay = await originalFetch(`${baseUrl}/auth/google/callback?state=${flow.state}&code=test`,
    { redirect: 'manual', headers: { cookie: flow.cookie } });
  expect(replay.headers.get('location')).toBe('/?error=invalid_state');
  await originalFetch(baseUrl + '/auth/logout', { method: 'POST', headers: { cookie: session } });
  expect((await (await originalFetch(baseUrl + '/auth/status', { headers: { cookie: session } })).json() as
    { authenticated: boolean }).authenticated).toBe(false);
});

test('Google callback preserves the requested module filters and anchor', async () => {
  const destination = '/onchain/projects?saved=1#projects';
  const flow = await start(destination);
  const callback = await originalFetch(`${baseUrl}/auth/google/callback?state=${flow.state}&code=test`,
    { redirect: 'manual', headers: { cookie: flow.cookie } });
  expect(callback.status).toBe(302);
  expect(callback.headers.get('location')).toBe(destination);
});

test('Google ID token rejects wrong audience, nonce, expired token and signature', async () => {
  const { verifyGoogleIdToken } = await import('./googleAuth.ts');
  const keys = async () => [jwk];
  await expect(verifyGoogleIdToken(idToken({ aud: 'another-client' }), 'test-google-client', issuedNonce, keys)).rejects.toThrow();
  await expect(verifyGoogleIdToken(idToken({ nonce: 'wrong' }), 'test-google-client', issuedNonce, keys)).rejects.toThrow();
  await expect(verifyGoogleIdToken(idToken({ exp: 1 }), 'test-google-client', issuedNonce, keys)).rejects.toThrow();
  await expect(verifyGoogleIdToken(idToken({ email_verified: false }), 'test-google-client', issuedNonce, keys)).rejects.toThrow();
  const tampered = idToken().split('.');
  tampered[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
  await expect(verifyGoogleIdToken(tampered.join('.'), 'test-google-client', issuedNonce, keys)).rejects.toThrow();
});

test('Google email cannot silently become an existing email-login account', async () => {
  const before = (db.query('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,email,role,is_demo,auth_method,created_at)
    VALUES('email-owner','email:other','other','Other','other@example.test','user',0,'email',?)`, [new Date().toISOString()]);
  issuedSubject = 'google-456';
  issuedEmail = 'other@example.test';
  const flow = await start();
  const callback = await originalFetch(`${baseUrl}/auth/google/callback?state=${flow.state}&code=test`,
    { redirect: 'manual', headers: { cookie: flow.cookie } });
  expect(callback.headers.get('location')).toBe('/?error=google_email_conflict');
  expect((db.query('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(before + 1);
});

test('returning Google login reuses the linked wallet admin and preserves its identity and capacity', async () => {
  issuedSubject = 'linked-wallet-google';
  issuedEmail = 'linked@example.test';
  const address = '0x' + 'ab'.repeat(20);
  const now = new Date().toISOString();
  db.run(`INSERT INTO users(id,x_id,google_id,email,x_handle,x_display_name,wallet_address,
    wallet_verified_at,auth_method,role,is_demo,free_slots,created_at)
    VALUES('linked-wallet-admin','unlinked:linked-wallet-admin',?,?,'linked','Linked',?,?,'wallet','admin',0,3,?)`,
    [issuedSubject, issuedEmail, address, now, now]);
  const countBefore = (db.query('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  for (let attempt = 0; attempt < 2; attempt++) {
    const flow = await start('/settings?tab=sessions');
    const callback = await originalFetch(`${baseUrl}/auth/google/callback?state=${flow.state}&code=test`,
      { redirect: 'manual', headers: { cookie: flow.cookie } });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/settings?tab=sessions');
    const cookie = callback.headers.get('set-cookie')!.split(', ')
      .find(item => item.startsWith('refbridge_session='))!.split(';', 1)[0];
    const status = await (await originalFetch(baseUrl + '/auth/status', { headers: { cookie } })).json() as {
      user: { id: string; role: string; walletAddress: string; walletVerifiedAt: string; freeSlots: number; xId: null };
      session: { method: string };
    };
    expect(status.user).toMatchObject({ id: 'linked-wallet-admin', role: 'admin',
      walletAddress: address, walletVerifiedAt: now, freeSlots: 3, xId: null });
    expect(status.session.method).toBe('google');
    expect((db.query('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(countBefore);
  }
});
