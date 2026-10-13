import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

type Mode = { nodeEnv: 'test' | 'production'; authMode?: 'demo' };

/** A fresh process prevents auth module/env caches or fixtures leaking between modes. */
function inspectMode(mode: Mode) {
  const directory = mkdtempSync(join(tmpdir(), 'carpan-no-demo-login-'));
  const indexUrl = new URL('./index.ts', import.meta.url).href;
  const dbUrl = new URL('./sqliteDb.ts', import.meta.url).href;
  const authUrl = new URL('./auth.ts', import.meta.url).href;
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: mode.nodeEnv,
    REFBRIDGE_DB_PATH: join(directory, 'auth.sqlite'), VITE_APP_URL: 'http://127.0.0.1:5173',
    X_CLIENT_ID: '', X_CLIENT_SECRET: '', X_LOGIN_ENABLED: 'false',
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' };
  // Removing the override is essential: a wallet-only installation must default to live.
  delete env.REFVOX_AUTH_MODE;
  if (mode.authMode) env.REFVOX_AUTH_MODE = mode.authMode;
  const script = `
    const { app } = await import(${JSON.stringify(indexUrl)});
    const { db } = await import(${JSON.stringify(dbUrl)});
    const { DEMO_MODE } = await import(${JSON.stringify(authUrl)});
    const count = table => db.query('SELECT COUNT(*) AS n FROM ' + table).get().n;
    const seededDemoUsers = db.query('SELECT COUNT(*) AS n FROM users WHERE is_demo=1').get().n;
    db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,role,is_demo,created_at) VALUES('audit_demo_admin','audit:demo:admin','audit_demo','Audit Demo','admin',1,?)", [new Date().toISOString()]);
    const before = { users: count('users'), sessions: count('sessions') };
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      const requests = [
        ['/auth/demo-users', undefined],
        ['/auth/demo-login', { userId: 'audit_demo_admin' }],
        ['/auth/demo-login', { userId: 'does-not-exist' }],
      ];
      const endpoints = [];
      for (const [path, body] of requests) {
        const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
          headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        endpoints.push({ status: response.status, cookie: response.headers.get('set-cookie'),
          cache: response.headers.get('cache-control'), body: await response.json() });
      }
      const after = { users: count('users'), sessions: count('sessions') };
      const status = await (await fetch(base + '/auth/status')).json();
      const wallet = await fetch(base + '/auth/wallet/challenge', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: '0x1111111111111111111111111111111111111111' }) });
      console.log('CARPAN_AUTH_RESULT=' + JSON.stringify({ mode: DEMO_MODE, seededDemoUsers,
        before, after, endpoints, status, walletStatus: wallet.status }));
    } finally {
      await new Promise(resolve => server.close(resolve));
      db.close();
    }
  `;
  try {
    const result = spawnSync(process.execPath, ['--eval', script], {
      cwd: directory, env, encoding: 'utf8', timeout: 20_000,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Isolated auth check failed: ${result.error?.message || result.stderr || result.stdout}`);
    }
    const output = result.stdout.split(/\r?\n/).find(line => line.startsWith('CARPAN_AUTH_RESULT='));
    if (!output) throw new Error(`Missing isolated auth result: ${result.stdout}`);
    return JSON.parse(output.slice('CARPAN_AUTH_RESULT='.length)) as {
      mode: boolean; seededDemoUsers: number;
      before: { users: number; sessions: number }; after: { users: number; sessions: number };
      endpoints: { status: number; cookie: string | null; cache: string | null; body: Record<string, unknown> }[];
      status: { demoMode: boolean; authenticated: boolean; user: unknown; xLoginAvailable: boolean;
        googleLoginAvailable: boolean; emailLoginAvailable: boolean };
      walletStatus: number;
    };
  } finally {
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep)) throw new Error('Test cleanup escaped temporary directory');
    rmSync(target, { recursive: true, force: true });
  }
}

function expectDemoEndpointsClosed(result: ReturnType<typeof inspectMode>) {
  for (const response of result.endpoints) {
    expect(response.status).toBe(410);
    expect(response.cookie).toBeNull();
    expect(response.cache).toContain('no-store');
    expect(typeof response.body.error).toBe('string');
    expect(response.body).not.toHaveProperty('user');
    expect(response.body).not.toHaveProperty('users');
    expect(response.body).not.toHaveProperty('id');
  }
  expect(result.after).toEqual(result.before);
  expect(result.status).toMatchObject({ authenticated: false, user: null,
    xLoginAvailable: false, googleLoginAvailable: false, emailLoginAvailable: false });
}

test('wallet-only installs default to live without seeding or exposing demo accounts', () => {
  const result = inspectMode({ nodeEnv: 'test' });
  expect(result.mode).toBe(false);
  expect(result.status.demoMode).toBe(false);
  expect(result.seededDemoUsers).toBe(0);
  expect(result.walletStatus).toBe(200);
  expectDemoEndpointsClosed(result);
}, 30_000);

test('explicit local fixture mode cannot expose accounts or create a demo admin session', () => {
  const result = inspectMode({ nodeEnv: 'test', authMode: 'demo' });
  expect(result.mode).toBe(true);
  expect(result.status.demoMode).toBe(true);
  expect(result.seededDemoUsers).toBeGreaterThan(0);
  expect(result.walletStatus).toBe(403);
  expectDemoEndpointsClosed(result);
}, 30_000);

test('production ignores demo override and preserves wallet-only real authentication', () => {
  const result = inspectMode({ nodeEnv: 'production', authMode: 'demo' });
  expect(result.mode).toBe(false);
  expect(result.status.demoMode).toBe(false);
  expect(result.seededDemoUsers).toBe(0);
  expect(result.walletStatus).toBe(200);
  expectDemoEndpointsClosed(result);
}, 30_000);
