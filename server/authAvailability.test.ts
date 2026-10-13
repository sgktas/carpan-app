import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folder = mkdtempSync(join(tmpdir(), 'carpan-auth-availability-'));
process.env.REFBRIDGE_DB_PATH = join(folder, 'auth.sqlite');
process.env.NODE_ENV = 'test';
process.env.REFVOX_AUTH_MODE = 'live';
process.env.X_CLIENT_ID = 'test-configured-client';
process.env.X_CLIENT_SECRET = 'test-configured-secret';
process.env.X_LOGIN_ENABLED = 'false';
process.env.VITE_APP_URL = 'http://127.0.0.1:5173';
const { app } = await import('./index');
const { db } = await import('./sqliteDb');
const { createSession } = await import('./auth');
let server: ReturnType<typeof app.listen>, base: string;
beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const info = server.address();
  if (!info || typeof info === 'string') throw new Error('Test server has no port');
  base = `http://127.0.0.1:${info.port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.close(); rmSync(folder, { recursive: true, force: true });
});
test('disabled X login is not offered, starts no OAuth flow and keeps wallet-only live mode', async () => {
  const status = await fetch(`${base}/auth/status`);
  expect(status.headers.get('cache-control')).toContain('no-store');
  expect(await status.json()).toMatchObject({ demoMode: false, xLoginAvailable: false, authenticated: false });
  const start = await fetch(`${base}/auth/x/start`);
  expect(start.status).toBe(503);
  expect(start.headers.get('set-cookie')).toBeNull();
  expect(db.query('SELECT COUNT(*) AS n FROM x_oauth_states').get()).toEqual({ n: 0 });
  const callback = await fetch(`${base}/auth/x/callback?code=unused&state=unused`, { redirect: 'manual' });
  expect(callback.headers.get('location')).toBe('/?error=x_unavailable');
});
test('disabling new X sign-ins preserves an existing account session and linked wallet', async () => {
  db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,wallet_address,created_at) VALUES('existing','123456789','old_handle','Existing',?,?)", ['0x1111111111111111111111111111111111111111', new Date().toISOString()]);
  const session = createSession('existing');
  const link=await fetch(`${base}/auth/x/link/start`,{method:'POST',headers:{cookie:`refbridge_session=${session}`}});
  expect(link.status).toBe(503);
  expect(db.query('SELECT COUNT(*) AS n FROM x_oauth_states').get()).toEqual({n:0});
  const result = await fetch(`${base}/auth/status`, { headers: { cookie: `refbridge_session=${session}` } });
  expect(await result.json()).toMatchObject({ demoMode: false, xLoginAvailable: false, authenticated: true, user: { id: 'existing', walletAddress: '0x1111111111111111111111111111111111111111' } });
});
