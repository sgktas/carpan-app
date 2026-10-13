import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import crypto from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'refbridge-oauth-'));
process.env.REFBRIDGE_DB_PATH = path.join(tempDir, 'test.db');
process.env.X_CLIENT_ID = 'oauth-test-client';
process.env.X_CLIENT_SECRET = 'oauth-test-secret';
process.env.VITE_APP_URL = 'http://127.0.0.1:5173';
process.env.ADMIN_X_IDS = '123456789';
process.env.NODE_ENV = 'test';

const [{ app }, { db }, { createSession, isUserModeAllowed, DEMO_MODE, ARC_TESTNET_CHAIN_ID, walletVerificationMessage }, oauth, proof] = await Promise.all([
  import('./index.ts'),
  import('./sqliteDb.ts'),
  import('./auth.ts'),
  import('./xOAuth.ts'),
  import('./project-validation.ts'),
]);

let server: ReturnType<typeof app.listen>;
let baseUrl = '';
let originalFetch: typeof fetch;
let username = 'oauth_test_user';
let tokenExchangeCount = 0;
let userLookupCount = 0;
let observedTokenAuthorization = '';
let observedTokenBody = new URLSearchParams();
let userLookupOverride: { status: number; body: unknown } | null = null;

beforeAll(async () => {
  if (DEMO_MODE) throw new Error('OAuth integration tests require the dummy confidential-client credentials above.');
  db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,role,is_demo,created_at)
    VALUES('demo_isolation','demo_identity','demo_user','Demo User','user',1,?)`, [new Date().toISOString()]);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.');
  baseUrl = `http://127.0.0.1:${address.port}`;

  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://api.x.com/2/oauth2/token') {
      tokenExchangeCount += 1;
      observedTokenAuthorization = new Headers(init?.headers).get('authorization') || '';
      observedTokenBody = new URLSearchParams(String(init?.body || ''));
      return Response.json({ access_token: `fake-access-${tokenExchangeCount}`, token_type: 'bearer' });
    }
    if (url.startsWith('https://api.x.com/2/users/me?')) {
      userLookupCount += 1;
      if (userLookupOverride) return Response.json(userLookupOverride.body, { status: userLookupOverride.status });
      return Response.json({ data: { id: '123456789', username, name: 'OAuth Test User' } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
});

afterAll(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (server?.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('X OAuth 2.0 PKCE authentication', () => {
  test('uses X endpoints, binds and consumes state, stores identity and issues an HttpOnly session', async () => {
    expect(oauth.X_OAUTH_SCOPES).toEqual(['users.read']);
    expect(oauth.normalizePostLoginPath('/dashboard?next=https://evil.example')).toBe('/dashboard');
    expect(oauth.normalizePostLoginPath('//evil.example')).toBe('/');
    expect(oauth.normalizePostLoginPath('/\\\\evil.example')).toBe('/');
    expect(oauth.oauthErrorCode('access_denied')).toBe('access_denied');
    expect(oauth.oauthErrorCode('https://evil.example')).toBe('oauth_failed');
    expect(proof.paidReferralFlowEnabled(false, 'admin_review')).toBe(false);
    expect(proof.paidReferralFlowEnabled(false, 'official_api')).toBe(false);
    expect(proof.paidReferralFlowEnabled(false, 'signed_webhook')).toBe(false);
    expect(proof.paidReferralFlowEnabled(true, 'demo')).toBe(true);
    expect(isUserModeAllowed(true, true)).toBe(true);
    expect(isUserModeAllowed(false, false)).toBe(true);
    expect(isUserModeAllowed(true, false)).toBe(false);
    expect(isUserModeAllowed(false, true)).toBe(false);

    const start = await originalFetch(`${baseUrl}/auth/x/start?redirect=%2Fdashboard%3Fignored%3D1`);
    expect(start.status).toBe(200);
    const stateHeader = start.headers.get('set-cookie') || '';
    const stateCookie = oauth.parseCookieHeader(stateHeader, 'refbridge_oauth_state');
    expect(stateCookie).toBeTruthy();
    const { authUrl } = await start.json() as { authUrl: string };
    const authorize = new URL(authUrl);
    expect(authorize.origin).toBe('https://x.com');
    expect(authorize.pathname).toBe('/i/oauth2/authorize');
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('client_id')).toBe('oauth-test-client');
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5173/api/auth/x/callback');
    expect(authorize.searchParams.get('scope')).toBe('users.read');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const state = authorize.searchParams.get('state')!;
    expect(state).toBe(stateCookie);
    const storedState = db.query('SELECT code_verifier,redirect_after FROM x_oauth_states WHERE state=?').get(state) as
      { code_verifier: string; redirect_after: string };
    const expectedChallenge = crypto.createHash('sha256').update(storedState.code_verifier).digest('base64url');
    expect(authorize.searchParams.get('code_challenge')).toBe(expectedChallenge);
    expect(storedState.redirect_after).toBe('/dashboard?ignored=1');

    const noBrowserCookie = await originalFetch(`${baseUrl}/auth/x/callback?code=code-1&state=${state}`, { redirect: 'manual' });
    expect(noBrowserCookie.status).toBe(302);
    expect(noBrowserCookie.headers.get('location')).toBe('/?error=invalid_state');
    expect(db.query('SELECT state FROM x_oauth_states WHERE state=?').get(state)).toBeTruthy();

    const callback = await originalFetch(`${baseUrl}/auth/x/callback?code=code-1&state=${state}`, {
      redirect: 'manual', headers: { cookie: `refbridge_oauth_state=${stateCookie}` },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/dashboard?ignored=1');
    expect(tokenExchangeCount).toBe(1);
    expect(userLookupCount).toBe(1);
    expect(observedTokenAuthorization).toBe(`Basic ${Buffer.from('oauth-test-client:oauth-test-secret').toString('base64')}`);
    expect(observedTokenBody.get('grant_type')).toBe('authorization_code');
    expect(observedTokenBody.get('redirect_uri')).toBe('http://127.0.0.1:5173/api/auth/x/callback');
    expect(observedTokenBody.get('code_verifier')).toBe(storedState.code_verifier);
    expect(db.query('SELECT state FROM x_oauth_states WHERE state=?').get(state)).toBeNull();
    const setCookie = callback.headers.get('set-cookie') || '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure'); // test server is HTTP; production uses Secure cookies.
    expect(callback.headers.get('location')).not.toContain('session_token');

    const sessionMatch = setCookie.match(/refbridge_session=([^;, ]+)/);
    expect(sessionMatch).toBeTruthy();
    const sessionToken = decodeURIComponent(sessionMatch![1]);
    const storedSession = db.query('SELECT token FROM sessions WHERE user_id=(SELECT id FROM users WHERE x_id=?)')
      .get('123456789') as { token: string };
    expect(storedSession.token).not.toBe(sessionToken);
    expect(storedSession.token).toMatch(/^[a-f0-9]{64}$/);

    const status = await originalFetch(`${baseUrl}/auth/status`, { headers: { cookie: `refbridge_session=${sessionToken}` } });
    const statusBody = await status.json() as { demoMode: boolean; authenticated: boolean; user: { xId: string; isDemo: boolean; role: string; freeSlots: number } };
    expect(statusBody).toMatchObject({ demoMode: false, authenticated: true,
      user: { xId: '123456789', isDemo: false, role: 'admin', freeSlots: 5 } });

    const verifiedAccount = privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const otherAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`);
    const walletNonceResponse = await originalFetch(`${baseUrl}/wallet/nonce`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    const { nonce, message } = await walletNonceResponse.json() as { nonce: string; message: string };
    expect(message).toContain('Site: http://127.0.0.1:5173');
    expect(message).toContain('Ağ değiştirmeniz gerekmez.');
    const walletSignature = await verifiedAccount.signMessage({ message });
    const changedMessage = await originalFetch(`${baseUrl}/wallet/verify`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ address: verifiedAccount.address, signature: walletSignature, message: message + ' changed', nonce, chainId: 1 }),
    });
    expect(changedMessage.status).toBe(400);
    expect(await changedMessage.json()).toMatchObject({ error: 'İmza mesajı değiştirilmiş' });
    const wrongAccount = await originalFetch(`${baseUrl}/wallet/verify`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ address: otherAccount.address, signature: walletSignature, message, nonce, chainId: ARC_TESTNET_CHAIN_ID }),
    });
    expect(wrongAccount.status).toBe(400);
    const walletVerified = await originalFetch(`${baseUrl}/wallet/verify`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ address: verifiedAccount.address, signature: walletSignature, message, nonce, chainId: 5042 }),
    });
    expect(walletVerified.status).toBe(200);
    expect(await walletVerified.json()).toMatchObject({ ok: true, address: verifiedAccount.address.toLowerCase() });
    const walletAfterReload = await originalFetch(`${baseUrl}/auth/status`, {
      headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    expect(await walletAfterReload.json()).toMatchObject({ authenticated: true,
      user: { walletAddress: verifiedAccount.address.toLowerCase() } });
    const reusedNonce = await originalFetch(`${baseUrl}/wallet/verify`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ address: verifiedAccount.address, signature: walletSignature, message, nonce, chainId: ARC_TESTNET_CHAIN_ID }),
    });
    expect(reusedNonce.status).toBe(400);

    const expiredNonceResponse = await originalFetch(`${baseUrl}/wallet/nonce`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    const expired = await expiredNonceResponse.json() as { nonce: string; message: string };
    db.run("UPDATE auth_nonces SET expires_at='2000-01-01T00:00:00.000Z' WHERE nonce=?", [expired.nonce]);
    const expiredSignature = await verifiedAccount.signMessage({ message: expired.message });
    const expiredResponse = await originalFetch(`${baseUrl}/wallet/verify`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ address: verifiedAccount.address, signature: expiredSignature,
        message: expired.message, nonce: expired.nonce, chainId: ARC_TESTNET_CHAIN_ID }),
    });
    expect(expiredResponse.status).toBe(400);
    expect(await expiredResponse.json()).toMatchObject({ error: 'Geçersiz veya süresi dolmuş nonce. Yeniden deneyin.' });

    const now = new Date().toISOString();
    db.run(`INSERT INTO projects(id,submitted_by,name,official_domain,referral_link_pattern,
      valid_participation_condition,status,is_demo,created_at) VALUES(?,?,?,?,?,?,'approved',?,?)`,
      ['live_project', 'oauth_test_user', 'Live Project', 'live.example', 'https://live.example/{code}', 'live verification', 0, now]);
    db.run(`INSERT INTO projects(id,submitted_by,name,official_domain,referral_link_pattern,
      valid_participation_condition,status,is_demo,created_at) VALUES(?,?,?,?,?,?,'approved',?,?)`,
      ['demo_project', 'demo_isolation', 'Demo Project', 'demo.example', 'https://demo.example/{code}', 'demo verification', 1, now]);
    db.run(`INSERT INTO orders(id,project_id,buyer_id,package_size,price_per_referral,platform_fee_bps,
      total_cost,slots_used,status,onchain_confirmed,is_demo,created_at)
      VALUES('unproven_order','live_project','oauth_test_user',10,1000000,500,10000000,0,'active',1,0,?)`, [now]);
    db.run(`INSERT INTO participations(id,reservation_id,participant_id,referrer_id,project_id,referral_link_id,
      participation_type,order_id,status,is_demo,created_at)
      VALUES('unproven_paid_part','reservation-test','oauth_test_user','referrer-test','live_project','link-test',
      'paid','unproven_order','verified',0,?)`, [now]);
    db.run(`INSERT INTO participations(id,reservation_id,participant_id,referrer_id,project_id,referral_link_id,
      participation_type,order_id,status,is_demo,created_at)
      VALUES('pending_unproven_paid_part','reservation-pending','oauth_test_user','referrer-test','live_project','link-test',
      'paid','unproven_order','pending_verification',0,?)`, [now]);
    const realProjects = await originalFetch(`${baseUrl}/projects`, { headers: { cookie: `refbridge_session=${sessionToken}` } });
    const realProjectRows = await realProjects.json() as Array<{ id: string }>;
    expect(realProjectRows.map(project => project.id)).toContain('live_project');
    expect(realProjectRows.map(project => project.id)).not.toContain('demo_project');
    const paidReservation = await originalFetch(`${baseUrl}/participations/reserve`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'live_project', participationType: 'paid' }),
    });
    expect(paidReservation.status).toBe(403);
    expect(await paidReservation.json()).toMatchObject({ error: 'Ücretli katılım şu an kapalı. Carpan bireysel kullanımda ücretsizdir.' });
    const unavailablePaidOrders = await originalFetch(`${baseUrl}/orders/available`, {
      headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    expect(await unavailablePaidOrders.json()).toEqual([]);
    const blockedPaidVerification = await originalFetch(`${baseUrl}/participations/pending_unproven_paid_part/verify`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(blockedPaidVerification.status).toBe(400);
    expect(await blockedPaidVerification.json()).toMatchObject({ error: 'Ücretli referans, güvenilir proje kanıtı olmadan doğrulanamaz' });
    const orderCountBefore = (db.query('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;
    const paidOrder = await originalFetch(`${baseUrl}/orders`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'live_project', packageSize: 10 }),
    });
    expect(paidOrder.status).toBe(403);
    expect(await paidOrder.json()).toMatchObject({ error: 'USDC kampanya paketleri şu an kapalı. Bireysel kullanım ücretsizdir.' });
    const blockedDeposit = await originalFetch(`${baseUrl}/orders/unproven_order/confirm-deposit`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: `0x${'1'.repeat(64)}` }),
    });
    expect(blockedDeposit.status).toBe(403);
    expect(await blockedDeposit.json()).toMatchObject({ error: 'USDC kampanya akışı şu an kapalıdır.' });
    expect((db.query('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n).toBe(orderCountBefore);
    const blockedPayout = await originalFetch(`${baseUrl}/payments/prepare`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ participationId: 'unproven_paid_part' }),
    });
    expect(blockedPayout.status).toBe(400);
    expect(await blockedPayout.json()).toMatchObject({ error: 'Güvenilir proje doğrulaması olmadan ücretli referans ödenemez' });
    const hiddenDemoProject = await originalFetch(`${baseUrl}/projects/demo_project`, {
      headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    expect(hiddenDemoProject.status).toBe(404);
    const demoUsers = await originalFetch(`${baseUrl}/auth/demo-users`);
    expect(demoUsers.status).toBe(410);
    expect(demoUsers.headers.get('set-cookie')).toBeNull();
    const demoLogin = await originalFetch(`${baseUrl}/auth/demo-login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'demo_isolation' }),
    });
    expect(demoLogin.status).toBe(410);
    expect(demoLogin.headers.get('set-cookie')).toBeNull();
    const adminUsers = await originalFetch(`${baseUrl}/admin/users`, { headers: { cookie: `refbridge_session=${sessionToken}` } });
    const adminRows = await adminUsers.json() as Array<{ isDemo: boolean }>;
    expect(adminRows.every(user => !user.isDemo)).toBe(true);

    const demoSession = createSession('demo_isolation');
    const isolatedDemoStatus = await originalFetch(`${baseUrl}/auth/status`, {
      headers: { cookie: `refbridge_session=${demoSession}` },
    });
    expect(await isolatedDemoStatus.json()).toMatchObject({ demoMode: false, authenticated: false, user: null });

    username = 'renamed_x_handle';
    const secondStart = await originalFetch(`${baseUrl}/auth/x/start`);
    const secondStateCookie = oauth.parseCookieHeader(secondStart.headers.get('set-cookie') || '', 'refbridge_oauth_state')!;
    const secondAuth = new URL((await secondStart.json() as { authUrl: string }).authUrl);
    const secondState = secondAuth.searchParams.get('state')!;
    const secondCallback = await originalFetch(`${baseUrl}/auth/x/callback?code=code-2&state=${secondState}`, {
      redirect: 'manual', headers: { cookie: `refbridge_oauth_state=${secondStateCookie}` },
    });
    expect(secondCallback.headers.get('location')).toBe('/');
    expect(db.query('SELECT COUNT(*) AS count FROM users WHERE x_id=?').get('123456789')).toMatchObject({ count: 1 });
    expect(db.query('SELECT x_handle FROM users WHERE x_id=?').get('123456789')).toMatchObject({ x_handle: 'renamed_x_handle' });

    userLookupOverride = { status: 403, body: {
      title: 'Client Forbidden', reason: 'client-not-enrolled', required_enrollment: 'Basic',
      detail: 'diagnostic detail should not be shown to the browser',
    } };
    const accessDeniedStart = await originalFetch(`${baseUrl}/auth/x/start`);
    const accessDeniedCookie = oauth.parseCookieHeader(accessDeniedStart.headers.get('set-cookie') || '', 'refbridge_oauth_state')!;
    const accessDeniedState = new URL((await accessDeniedStart.json() as { authUrl: string }).authUrl).searchParams.get('state')!;
    const accessDeniedCallback = await originalFetch(`${baseUrl}/auth/x/callback?code=code-3&state=${accessDeniedState}`, {
      redirect: 'manual', headers: { cookie: `refbridge_oauth_state=${accessDeniedCookie}` },
    });
    userLookupOverride = null;
    expect(accessDeniedCallback.headers.get('location')).toBe('/?error=x_api_access');

    userLookupOverride = { status: 403, body: { title: 'Forbidden' } };
    const genericForbiddenStart = await originalFetch(`${baseUrl}/auth/x/start`);
    const genericForbiddenCookie = oauth.parseCookieHeader(genericForbiddenStart.headers.get('set-cookie') || '', 'refbridge_oauth_state')!;
    const genericForbiddenState = new URL((await genericForbiddenStart.json() as { authUrl: string }).authUrl).searchParams.get('state')!;
    const genericForbiddenCallback = await originalFetch(`${baseUrl}/auth/x/callback?code=code-4&state=${genericForbiddenState}`, {
      redirect: 'manual', headers: { cookie: `refbridge_oauth_state=${genericForbiddenCookie}` },
    });
    userLookupOverride = null;
    expect(genericForbiddenCallback.headers.get('location')).toBe('/?error=x_api_access');

    const replay = await originalFetch(`${baseUrl}/auth/x/callback?code=code-1&state=${state}`, {
      redirect: 'manual', headers: { cookie: `refbridge_oauth_state=${stateCookie}` },
    });
    expect(replay.headers.get('location')).toBe('/?error=invalid_state');

    const deniedStart = await originalFetch(`${baseUrl}/auth/x/start`);
    const deniedStateCookie = oauth.parseCookieHeader(deniedStart.headers.get('set-cookie') || '', 'refbridge_oauth_state')!;
    const deniedState = new URL((await deniedStart.json() as { authUrl: string }).authUrl).searchParams.get('state')!;
    const denied = await originalFetch(`${baseUrl}/auth/x/callback?error=access_denied&state=${deniedState}`, {
      redirect: 'manual', headers: { cookie: `refbridge_oauth_state=${deniedStateCookie}` },
    });
    expect(denied.headers.get('location')).toBe('/?error=access_denied');
    expect(tokenExchangeCount).toBe(4);

    const logout = await originalFetch(`${baseUrl}/auth/logout`, {
      method: 'POST', headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    const afterLogout = await originalFetch(`${baseUrl}/auth/status`, {
      headers: { cookie: `refbridge_session=${sessionToken}` },
    });
    expect(await afterLogout.json()).toMatchObject({ authenticated: false, user: null });
  });
});
