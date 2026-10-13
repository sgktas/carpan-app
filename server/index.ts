import {createAccountSessionsRoutes} from './accountSessionRoutes';
import {AccountLinkError,initGoogleWalletLink,prepareGoogleWalletLink,completeGoogleWalletLink} from './googleWalletLink';
import {initFinanceWorkspace} from './financeWorkspace';
import {createFinanceWorkspaceRoutes} from './financeWorkspaceRoutes';
import {initFinanceOrganizations} from './financeOrganizations';
import {initFinanceOperationsStore} from './financeOperationsStore';
import {createFinanceOperationsRoutes} from './financeOperationsRoutes';
import {initFinanceIntegrations} from './financeIntegrations';
import {createFinanceIntegrationsRoutes,createFinanceExternalApiRoutes} from './financeIntegrationsRoutes';
import {initFinanceWebhooks,runFinanceWebhookWorker} from './financeWebhooks';
import {collectionRoutes} from './collectionRoutes';
import {bridgeHistoryRoutes} from './bridgeHistoryRoutes';
import {createAuthMaintenance} from './authMaintenance';
import {createAuthRequestGuard} from './authRequestGuard';
import {createArcWalletReadGuard} from './arcWalletRateLimit';
import {createProductUsage} from './productUsage';
import {FINANCE_API_ENABLED,createFinanceApiAvailabilityGuard} from './apiAvailability';
import {linkVerifiedXAccount,XAccountLinkConflictError} from './xAccountLink';
import {initExplorerBudget,explorerBudgetStatus} from './explorerBudget';
import {initProjectAddresses,projectAddresses,saveProjectAddress,relatedProjects} from './projectAddresses';
import {parseProjectSubmission} from './projectSubmission';
import {ecosystemCatalog,curatedProject,curatedRelatedProjects} from './ecosystemCatalog';
import {createMarketRoutes} from './marketRoutes';
import {initEcosystemNotifications,reconcileEcosystemUpdates,startEcosystemUpdateWorker} from './ecosystemNotifications';
import {createEcosystemUpdateRoutes} from './ecosystemUpdateRoutes';
import {networkDirectory,explorerData,parseExplorerQuery,ExplorerError,initNetworkWatch,networkWatchlist,saveNetworkWatch,discoveryFeed} from './chainExplorer';
/**
 * Carpan API Server — port 3001
 *
 * All business logic server-side. SQLite persistence. Wallet sign-in is available without social providers.
 *
 * PAYMENT RELEASE AUTHORITY:
 * Oracle address on RefBridgeEscrow is the platform deployer wallet.
 * releasePayment can only be called by that oracle. The demo-only
 * /payments/release endpoint is admin-only. In live mode, an administrator
 * signs with the oracle wallet in the browser and confirms the receipt here.
 * The smart contract cannot verify offchain referral relationships itself.
 *
 * Env vars required for real operation:
 *   X_CLIENT_ID, X_CLIENT_SECRET — X OAuth 2.0
 *   VITE_ESCROW_ADDRESS          — RefBridgeEscrow contract (Arc Testnet)
 *   VITE_ARC_RPC                 — Arc Testnet public RPC URL (falls back to proxy)
 *   RPC_PROXY_BASE_URL, RPC_PROXY_TOKEN, RPC_PROXY_CHAINS — proxy RPC (preferred)
 */

import express,{type Request,type Response} from 'express';
import cors from 'cors';
import { formatUnits, getAddress, isAddress, keccak256, stringToHex, verifyMessage } from 'viem';
import { arcRpc, assertArcTestnet, escrowOracle, bytes32Id, verifyReleaseReceipt, verifyRefundReceipt, type ChainReceipt } from './chain.js';
import { getArcAddressIntelligence, getArcExplorerAddress, getArcRecentlyVerified,ExplorerHistoryError } from './arcExplorer.js';
import { initWalletTables, getWalletOverview, getWalletResearch, getWalletHistory, getArcTransferFeed, parseWalletFilters, decodeWalletCursor, walletLabel, saveWalletLabel } from './arcWallet.js';
import {initAlertTables,createAlertRule,resolveAlertAsset,alertDashboard,setAlertEnabled,deleteAlertRule,markAlertsRead,startAlertWorker} from './arcAlerts.js';
import {
  db, seedDemo, newId, grantInitialFreeSlots, getPlatformConfig, setConfig, logAdmin,
  rowToUser, rowToProject, rowToReferralLink, rowToReservation,
  rowToParticipation, rowToOrder, rowToPayment,
} from './sqliteDb.js';
import {
  ensureReferralProgram, reconcileExistingContributions, grantEarnedBatches, availableForProject,
  assignNextBatch, referralStatus, leaderboard,
} from './referralProgram.js';
import {
  requireAuth, requireAdmin, createSession, deleteSession,
  getSessionUserId, getSessionDetails, hashSessionToken, DEMO_MODE, X_OAUTH_CONFIGURED, X_LOGIN_ENABLED, GOOGLE_OAUTH_CONFIGURED, createWalletNonce, consumeWalletNonce,
  generateCodeVerifier, generateState, walletVerificationMessage, walletNonceMessageMatches,
  readSessionCookie, setSessionCookie, clearSessionCookie,
  setOAuthStateCookie, clearOAuthStateCookie, readOAuthStateCookie,
  setGoogleStateCookie, clearGoogleStateCookie, readGoogleStateCookie,
  AuthRequest,
} from './auth.js';
import { createXAuthorizationUrl, normalizePostLoginPath, oauthErrorCode, sameOAuthState } from './xOAuth.js';
import { createGoogleAuthorizationUrl, googleCallbackUrl, verifyGoogleIdToken } from './googleAuth.js';
import { createWalletLoginChallenge, finishWalletLogin, normalizedEmail,
  emailDeliveryConfigured, createEmailLoginLink, sendEmailLoginLink,
  invalidateEmailLoginLink, finishEmailLogin } from './alternativeAuth.js';
import { hasTrustedProjectProof } from './project-validation.js';

initExplorerBudget(db);
initGoogleWalletLink(db);
if (DEMO_MODE) seedDemo();
initWalletTables(db);
initFinanceWorkspace(db);
initFinanceOrganizations(db);
initFinanceOperationsStore(db);
initFinanceIntegrations(db);
initFinanceWebhooks(db);
initAlertTables(db);
initProjectAddresses(db);
initEcosystemNotifications(db);
if(!DEMO_MODE)reconcileEcosystemUpdates(db);
ensureReferralProgram();
reconcileExistingContributions();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/auth', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const configuredAppOrigin = process.env.VITE_APP_URL?.trim()
  ? new URL(process.env.VITE_APP_URL.trim()).origin
  : '';
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [configuredAppOrigin].filter(Boolean)
  : [...new Set([configuredAppOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean))];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.set('trust proxy', 1);
const productUsage=createProductUsage(db,{resolveAccount:req=>{
  const token=readSessionCookie(req);return token?getSessionUserId(token):null;
}});
app.use(productUsage.middleware);
app.use(createArcWalletReadGuard());
app.use('/admin',productUsage.router(requireAdmin as express.RequestHandler));
const maintainAuth = createAuthMaintenance(db);
const authRequestGuard = createAuthRequestGuard(configuredAppOrigin, maintainAuth);
app.use('/auth', authRequestGuard);
app.use('/wallet', authRequestGuard);
app.use('/bridge',authRequestGuard,bridgeHistoryRoutes);
app.use('/account',authRequestGuard,createAccountSessionsRoutes(db,requireAuth as express.RequestHandler,req=>{const token=readSessionCookie(req);return token?hashSessionToken(token):null;}));
// Closure precedes the broad /finance authentication router so every API
// request, including guest requests, sees the same unavailable-service boundary.
app.use('/finance/integrations',createFinanceApiAvailabilityGuard());
app.use('/v1/finance',createFinanceApiAvailabilityGuard());
app.use('/finance',collectionRoutes);

const ESCROW_ADDRESS = (process.env.VITE_ESCROW_ADDRESS || '').toLowerCase();
function configuredEscrow(): string {
  if (!/^0x[0-9a-f]{40}$/.test(ESCROW_ADDRESS)) throw new Error('Arc Testnet escrow address is not configured');
  return ESCROW_ADDRESS;
}

class XApiAccessDeniedError extends Error {
  constructor() {
    super('X API endpoint access is not enabled for this app.');
    this.name = 'XApiAccessDeniedError';
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.get('/auth/status', (req, res) => {
  const token = readSessionCookie(req);
  const userId = token ? getSessionUserId(token) : null;
  const userRow = userId ? db.query('SELECT * FROM users WHERE id=?').get(userId) as Record<string,unknown> | null : null;
  res.json({ demoMode: DEMO_MODE, xLoginAvailable: X_LOGIN_ENABLED && !DEMO_MODE,
    googleLoginAvailable: GOOGLE_OAUTH_CONFIGURED && !DEMO_MODE,
    emailLoginAvailable: emailDeliveryConfigured() && !DEMO_MODE,
    authenticated: !!userId, user: userRow ? rowToUser(userRow) : null,
    session: token&&userId?getSessionDetails(token):null });
});

app.get('/auth/me', requireAuth as any, (req: AuthRequest, res) => {
  const userRow = db.query('SELECT * FROM users WHERE id=?').get(req.userId!) as Record<string,unknown> | null;
  if (!userRow) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  res.json({ user: rowToUser(userRow), demoMode: DEMO_MODE });
});

app.post('/auth/logout', (req, res) => {
  const token = readSessionCookie(req);
  if (token) deleteSession(token);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// Retired demo entry points never list identities, create sessions or set cookies.
app.get('/auth/demo-users', (_req, res) => res.status(410).json({ error: 'Demo sign-in has been removed.' }));
app.post('/auth/demo-login', (_req, res) => res.status(410).json({ error: 'Demo sign-in has been removed.' }));

// ── Independent wallet and email sign-in ─────────────────────────────────────

app.post('/auth/wallet/challenge', (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda gerçek cüzdan girişi kapalı' });
  if (!configuredAppOrigin) return res.status(503).json({ error: 'VITE_APP_URL ayarlanmamış' });
  const challenge = createWalletLoginChallenge(req.body?.address, configuredAppOrigin);
  if (!challenge) return res.status(400).json({ error: 'Geçerli bir cüzdan adresi gerekli' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(challenge);
});

app.post('/auth/wallet/complete', async (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda gerçek cüzdan girişi kapalı' });
  try {
    const result = await finishWalletLogin(req.body || {});
    if (!result) return res.status(400).json({ error: 'Cüzdan imzası geçersiz veya süresi dolmuş. Yeniden deneyin.' });
    productUsage.recordLogin(result.userId,'wallet',req.get('User-Agent'));
    setSessionCookie(req, res, result.sessionToken);
    const row = db.query('SELECT * FROM users WHERE id=?').get(result.userId) as Record<string,unknown>;
    res.json({ user: rowToUser(row) });
  } catch {
    res.status(409).json({ error: 'Bu cüzdan başka bir hesapla ilişkili. Hesap desteğine başvurun.' });
  }
});

app.post('/auth/email/start', async (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda gerçek e-posta girişi kapalı' });
  if (!emailDeliveryConfigured()) return res.status(503).json({ error: 'E-posta gönderimi henüz yapılandırılmadı' });
  if (!configuredAppOrigin) return res.status(503).json({ error: 'VITE_APP_URL ayarlanmamış' });
  const email = normalizedEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
  const link = createEmailLoginLink(email, configuredAppOrigin, req.ip || 'unknown', req.body?.redirect);
  if (!link) return res.status(429).json({ error: 'Çok fazla giriş isteği. 15 dakika sonra tekrar deneyin.' });
  if (!await sendEmailLoginLink(email, link.url)) {
    invalidateEmailLoginLink(link.tokenHash);
    return res.status(502).json({ error: 'Giriş e-postası gönderilemedi. Biraz sonra tekrar deneyin.' });
  }
  res.json({ ok: true, message: 'Giriş bağlantısını e-postanıza gönderdik.' });
});

app.post('/auth/email/complete', (req, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda gerçek e-posta girişi kapalı' });
  try {
    const result = finishEmailLogin(req.body?.token);
    if (!result) return res.status(400).json({ error: 'Giriş bağlantısı geçersiz, kullanılmış veya süresi dolmuş.' });
    productUsage.recordLogin(result.userId,'email',req.get('User-Agent'));
    setSessionCookie(req, res, result.sessionToken);
    const row = db.query('SELECT * FROM users WHERE id=?').get(result.userId) as Record<string,unknown>;
    res.json({ user: rowToUser(row) });
  } catch {
    res.status(409).json({ error: 'Bu e-posta başka bir hesapla ilişkili. Hesap desteğine başvurun.' });
  }
});

// ── Google OpenID Connect, authorization code + PKCE ─────────────────────────

class GoogleEmailConflictError extends Error {
  constructor() { super('Google email already belongs to another account'); }
}

app.get('/auth/google/start', (req, res) => {
  if (DEMO_MODE || !GOOGLE_OAUTH_CONFIGURED) {
    return res.status(503).json({ error: 'Google girişi henüz yapılandırılmadı' });
  }
  let callback: string;
  try { callback = googleCallbackUrl(configuredAppOrigin); }
  catch { return res.status(503).json({ error: 'Uygulama adresi yapılandırılmadı' }); }
  const state = generateState();
  const nonce = generateCodeVerifier();
  const verifier = generateCodeVerifier();
  const now = Date.now();
  db.run(`INSERT INTO google_oauth_states(state,nonce,code_verifier,redirect_after,expires_at)
    VALUES(?,?,?,?,?)`, [state, nonce, verifier, normalizePostLoginPath(req.query.redirect),
      new Date(now + 10 * 60 * 1000).toISOString()]);
  setGoogleStateCookie(req, res, state);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authUrl: createGoogleAuthorizationUrl(process.env.GOOGLE_CLIENT_ID!.trim(), callback,
    state, nonce, verifier) });
});

app.get('/auth/google/callback', async (req, res) => {
  if (DEMO_MODE || !GOOGLE_OAUTH_CONFIGURED) {
    clearGoogleStateCookie(req, res);
    return res.redirect('/?error=google_unavailable');
  }
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  if (!state || !sameOAuthState(state, readGoogleStateCookie(req))) {
    clearGoogleStateCookie(req, res);
    return res.redirect('/?error=invalid_state');
  }
  const pending = db.transaction(() => {
    const row = db.query('SELECT * FROM google_oauth_states WHERE state=?').get(state) as
      { nonce: string; code_verifier: string; redirect_after: string; expires_at: string } | null;
    if (row) db.run('DELETE FROM google_oauth_states WHERE state=?', [state]);
    return row;
  }).immediate();
  clearGoogleStateCookie(req, res);
  if (!pending) return res.redirect('/?error=invalid_state');
  if (pending.expires_at <= new Date().toISOString()) return res.redirect('/?error=state_expired');
  if (req.query.error) return res.redirect('/?error=google_denied');
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) return res.redirect('/?error=missing_code');
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: googleCallbackUrl(configuredAppOrigin), grant_type: 'authorization_code',
        code_verifier: pending.code_verifier }),
    });
    if (!tokenResponse.ok) throw new Error(`Google token exchange: ${tokenResponse.status}`);
    const tokens = await tokenResponse.json() as { id_token?: unknown };
    const identity = await verifyGoogleIdToken(tokens.id_token, process.env.GOOGLE_CLIENT_ID!.trim(), pending.nonce);
    const token = db.transaction(() => {
      const existing = db.query('SELECT id,is_demo FROM users WHERE google_id=?').get(identity.sub) as
        { id: string; is_demo: number } | null;
      if (existing?.is_demo) throw new Error('Demo Google identity collision');
      const emailOwner = db.query('SELECT id FROM users WHERE lower(email)=?').get(identity.email) as { id: string } | null;
      if (emailOwner && emailOwner.id !== existing?.id) throw new GoogleEmailConflictError();
      let userId = existing?.id;
      if (userId) {
        db.run('UPDATE users SET email=?,x_display_name=? WHERE id=?', [identity.email, identity.name, userId]);
      } else {
        userId = newId('user');
        const handle = identity.email.split('@')[0].slice(0, 24);
        db.run(`INSERT INTO users(id,x_id,google_id,x_handle,x_display_name,email,role,is_demo,auth_method,created_at)
          VALUES(?,?,?,?,?,?,'user',0,'google',?)`,
          [userId, `google:${identity.sub}`, identity.sub, handle, identity.name, identity.email, new Date().toISOString()]);
        grantInitialFreeSlots(userId);
      }
      const session=createSession(userId,'google');
      productUsage.recordLogin(userId,'google',req.get('User-Agent'));
      return session;
    }).immediate();
    setSessionCookie(req, res, token);
    res.redirect(normalizePostLoginPath(pending.redirect_after));
  } catch (error) {
    console.error('[Google OAuth] callback failed:', error instanceof Error ? error.message : 'unknown error');
    res.redirect(error instanceof GoogleEmailConflictError ? '/?error=google_email_conflict' : '/?error=google_failed');
  }
});

// ── X OAuth 2.0 PKCE ─────────────────────────────────────────────────────────

function getXCallbackUrl(): string {
  let appUrl = process.env.VITE_APP_URL?.trim();
  if (!appUrl) throw new Error('VITE_APP_URL must be set to the app origin for X OAuth.');
  const parsed = new URL(appUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('VITE_APP_URL must be an absolute HTTP(S) app origin without a path.');
  }
  return `${parsed.origin}/api/auth/x/callback`;
}

function startXFlow(req:Request,res:Response,linkUserId:string|null=null){
  if (X_OAUTH_CONFIGURED && !X_LOGIN_ENABLED && !DEMO_MODE) {
    return res.status(503).json({ error: 'X ile giriş şu an kapalı. Cüzdanla giriş yapabilirsiniz.', demoMode: false });
  }
  if (DEMO_MODE || !X_OAUTH_CONFIGURED) {
    let callbackUrl: string;
    try { callbackUrl = getXCallbackUrl(); }
    catch { callbackUrl = 'http://127.0.0.1:5173/api/auth/x/callback'; }
    return res.status(503).json({
      error: 'X OAuth yapılandırılmamış',
      demoMode: true,
      setup: {
        required_env: ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'VITE_APP_URL'],
        callback_url: callbackUrl,
        scopes: 'users.read',
        note: 'X Developer Portal → App Settings → User authentication settings → Callback URI/Redirect URL must match exactly'
      },
    });
  }
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  let callbackUrl: string;
  try { callbackUrl = getXCallbackUrl(); }
  catch (error) { return res.status(503).json({ error: (error as Error).message }); }
  const redirectAfter = normalizePostLoginPath(req.query.redirect);
  const sessionToken=linkUserId?readSessionCookie(req):null;
  db.run('INSERT INTO x_oauth_states(state,code_verifier,redirect_after,created_at,expires_at,link_user_id,link_session_hash) VALUES(?,?,?,?,?,?,?)',
    [state, codeVerifier, redirectAfter, new Date().toISOString(),
     new Date(Date.now() + 10 * 60 * 1000).toISOString(),linkUserId,sessionToken?hashSessionToken(sessionToken):null]);
  setOAuthStateCookie(req, res, state);
  res.json({ authUrl: createXAuthorizationUrl({
    clientId: process.env.X_CLIENT_ID!.trim(), callbackUrl, state, codeVerifier,
  }) });
}
app.get('/auth/x/start',(req,res)=>startXFlow(req,res));
app.post('/auth/x/link/start',requireAuth as any,(req:AuthRequest,res)=>startXFlow(req,res,req.userId!));

app.get('/auth/x/callback', async (req, res) => {
  if (X_OAUTH_CONFIGURED && !X_LOGIN_ENABLED && !DEMO_MODE) return res.redirect('/?error=x_unavailable');
  if (DEMO_MODE || !X_OAUTH_CONFIGURED) {
    clearOAuthStateCookie(req, res);
    return res.redirect('/?error=demo_mode');
  }
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const stateCookie = readOAuthStateCookie(req);
  if (!state || !sameOAuthState(state, stateCookie)) return res.redirect('/?error=invalid_state');
  const stateRow = db.transaction(() => {
    const row = db.query('SELECT * FROM x_oauth_states WHERE state=?').get(state) as
      { code_verifier: string; redirect_after: string; expires_at: string;link_user_id:string|null;link_session_hash:string|null } | null;
    if (row) db.run('DELETE FROM x_oauth_states WHERE state=?', [state]);
    return row;
  }).immediate();
  clearOAuthStateCookie(req, res);
  if (!stateRow) return res.redirect('/?error=invalid_state');
  if (new Date(stateRow.expires_at) < new Date()) return res.redirect('/?error=state_expired');
  if(stateRow.link_user_id){
    const currentToken=readSessionCookie(req);
    if(!currentToken||getSessionUserId(currentToken)!==stateRow.link_user_id||hashSessionToken(currentToken)!==stateRow.link_session_hash)
      return res.redirect('/?error=invalid_state');
  }

  const providerError = typeof req.query.error === 'string' ? req.query.error : null;
  if (providerError) return res.redirect(`/?error=${oauthErrorCode(providerError)}`);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code) return res.redirect('/?error=missing_code');
  try {
    const callbackUrl = getXCallbackUrl();
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${process.env.X_CLIENT_ID!.trim()}:${process.env.X_CLIENT_SECRET!.trim()}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code,
        redirect_uri: callbackUrl, code_verifier: stateRow.code_verifier }),
    });
    if (!tokenRes.ok) throw new Error(`Token exchange: ${tokenRes.status}`);
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error('Token response did not contain an access token.');
    const meRes = await fetch('https://api.x.com/2/users/me?user.fields=id,username,name', {
      headers: { Accept: 'application/json',
        Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!meRes.ok) {
      const apiError = await meRes.json().catch(() => null) as {
        title?: unknown; reason?: unknown; required_enrollment?: unknown;
      } | null;
      const safeDiagnostic = [apiError?.title, apiError?.reason, apiError?.required_enrollment]
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.replace(/[\r\n\t]/g, ' ').slice(0, 120))
        .filter(Boolean).join('; ');
      if (meRes.status === 403) {
        console.error('[X OAuth] profile lookup denied by X API:', safeDiagnostic || '403 Forbidden');
        throw new XApiAccessDeniedError();
      }
      throw new Error(`User fetch: ${meRes.status}${safeDiagnostic ? ` (${safeDiagnostic})` : ''}`);
    }
    const xUser = (await meRes.json() as { data?: { id?: string; username?: string; name?: string } }).data;
    if (!xUser || !xUser.id || !/^\d+$/.test(xUser.id) || !xUser.username) {
      throw new Error('X /users/me returned an incomplete identity.');
    }
    if(stateRow.link_user_id){
      const currentToken=readSessionCookie(req);
      if(!currentToken||getSessionUserId(currentToken)!==stateRow.link_user_id||hashSessionToken(currentToken)!==stateRow.link_session_hash)
        return res.redirect('/?error=invalid_state');
      linkVerifiedXAccount(stateRow.link_user_id,{id:xUser.id,username:xUser.username,name:xUser.name});
      return res.redirect(normalizePostLoginPath(stateRow.redirect_after));
    }
    const admins = new Set((process.env.ADMIN_X_IDS || '').split(',').map(id => id.trim()).filter(Boolean));
    const role = admins.has(xUser.id) ? 'admin' : 'user';
    const sessionToken = db.transaction(() => {
      const existingRow = db.query('SELECT * FROM users WHERE x_id=?').get(xUser.id!) as Record<string,unknown> | null;
      let userId: string;
      if (existingRow) {
        if (Boolean(existingRow.is_demo)) throw new Error('X identity conflicts with a demo account.');
        userId = existingRow.id as string;
        db.run('UPDATE users SET x_handle=?,x_display_name=?,role=? WHERE id=?',
          [xUser.username!, xUser.name || xUser.username!, role, userId]);
      } else {
        userId = newId('user');
        db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,role,is_demo,created_at) VALUES(?,?,?,?,?,0,?)",
          [userId, xUser.id!, xUser.username!, xUser.name || xUser.username!, role, new Date().toISOString()]);
        grantInitialFreeSlots(userId);
      }
      const session=createSession(userId,'x');
      productUsage.recordLogin(userId,'x',req.get('User-Agent'));
      return session;
    }).immediate();
    setSessionCookie(req, res, sessionToken);
    const target = normalizePostLoginPath(stateRow.redirect_after);
    res.redirect(target);
  } catch (e: any) {
    console.error('[X OAuth] callback failed:', e instanceof Error ? e.message : 'unknown error');
    res.redirect(e instanceof XApiAccessDeniedError ? '/?error=x_api_access' : e instanceof XAccountLinkConflictError ? '/?error=x_link_conflict' : '/?error=oauth_failed');
  }
});

// ── Wallet nonce + verification ───────────────────────────────────────────────

app.post('/wallet/nonce', requireAuth as any, (req: AuthRequest, res) => {
  const nonce = createWalletNonce(req.userId!);
  const message = walletVerificationMessage(req.userId!, nonce);
  res.json({ nonce, message });
});

app.post('/wallet/verify', requireAuth as any, async (req: AuthRequest, res) => {
  const { address, signature, message, nonce, chainId } = req.body as {
    address: string; signature: string; message: string; nonce: string; chainId?: number;
  };
  if (!isAddress(address || '') || typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
      typeof message !== 'string' || typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce)) {
    return res.status(400).json({ error: 'Geçerli adres, imza, mesaj ve nonce gerekli' });
  }
  if (!walletNonceMessageMatches(req.userId!, nonce, message, chainId)) {
    return res.status(400).json({ error: 'İmza mesajı değiştirilmiş' });
  }
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) return res.status(400).json({ error: 'İmza doğrulanamadı' });
  } catch (e: any) {
    return res.status(400).json({ error: `İmza hatası: ${e.message}` });
  }
  if (!consumeWalletNonce(req.userId!, nonce)) {
    return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş nonce. Yeniden deneyin.' });
  }
  const linkedElsewhere = db.query('SELECT id FROM users WHERE lower(wallet_address)=? AND id<>?')
    .get(address.toLowerCase(), req.userId!);
  if (linkedElsewhere) return res.status(409).json({ error: 'Bu cüzdan başka bir hesaba bağlı' });
  const previous = db.query('SELECT wallet_address FROM users WHERE id=?').get(req.userId!) as
    { wallet_address: string | null };
  if (previous.wallet_address && previous.wallet_address.toLowerCase() !== address.toLowerCase()) {
    const funded = db.query("SELECT id FROM orders WHERE buyer_id=? AND onchain_confirmed=1 AND status='active' LIMIT 1")
      .get(req.userId!);
    const pendingPayout = db.query(`SELECT p.id FROM participations p WHERE p.participant_id=?
      AND p.participation_type='paid' AND p.status IN ('pending_verification','disputed','verified')
      AND NOT EXISTS (SELECT 1 FROM payments pay WHERE pay.participation_id=p.id) LIMIT 1`).get(req.userId!);
    if (funded || pendingPayout) return res.status(409).json({ error: 'Aktif sipariş veya bekleyen ödül varken cüzdan değiştirilemez' });
  }
  const now = new Date().toISOString();
  try {
    db.run('UPDATE users SET wallet_address=?,wallet_verified_at=? WHERE id=?',
      [address.toLowerCase(), now, req.userId!]);
  } catch {
    return res.status(409).json({ error: 'Bu cüzdan başka bir hesaba bağlı' });
  }
  logAdmin('system', 'wallet_verified', 'user', req.userId!, address);
  res.json({ ok: true, address: address.toLowerCase(),
    user: rowToUser(db.query('SELECT * FROM users WHERE id=?').get(req.userId!) as Record<string,unknown>) });
});

// ── Projects ──────────────────────────────────────────────────────────────────

app.post('/wallet/google-link/preview',requireAuth as any,(req:AuthRequest,res)=>{
  if(DEMO_MODE)return res.status(403).json({error:'Real account linking is unavailable in demo mode.'});
  const token=readSessionCookie(req);
  try{res.json(prepareGoogleWalletLink(db,req.userId!,hashSessionToken(token!),req.body?.address,configuredAppOrigin));}
  catch(e){res.status(e instanceof AccountLinkError?e.status:503).json({error:e instanceof AccountLinkError?e.message:'Account linking is currently unavailable.'});}
});
app.post('/wallet/google-link/complete',requireAuth as any,async(req:AuthRequest,res)=>{
  if(DEMO_MODE)return res.status(403).json({error:'Real account linking is unavailable in demo mode.'});
  const token=readSessionCookie(req);
  try{
    const result=await completeGoogleWalletLink(db,req.userId!,hashSessionToken(token!),req.body||{},id=>createSession(id,'google'));
    setSessionCookie(req,res,result.sessionToken);
    res.json({user:rowToUser(db.query('SELECT * FROM users WHERE id=?').get(result.userId) as Record<string,unknown>)});
  }catch(e){res.status(e instanceof AccountLinkError?e.status:503).json({error:e instanceof AccountLinkError?e.message:'Account linking is currently unavailable.'});}
});

// Arc Radar is a read-only, public view of Arc Mainnet. Authentication is
// required only for saving a personal contract watchlist.
const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_EVENT_TOPICS = {
  transfer: keccak256(stringToHex('Transfer(address,address,uint256)')).toLowerCase(),
  approval: keccak256(stringToHex('Approval(address,address,uint256)')).toLowerCase(),
  ownership: keccak256(stringToHex('OwnershipTransferred(address,address)')).toLowerCase(),
};

function arcEventAddress(topic: string | undefined) {
  return topic && /^0x[0-9a-fA-F]{64}$/.test(topic) ? `0x${topic.slice(-40).toLowerCase()}` : null;
}

function arcEventView(row: Record<string, unknown>, tokenDecimals: number | null) {
  let topics: string[] = [];
  try { topics = JSON.parse(String(row.topics_json)); } catch { /* Unknown event topics stay unlabeled. */ }
  const signature = String(row.topic0 || '').toLowerCase();
  const kind = signature === ARC_EVENT_TOPICS.transfer ? 'transfer'
    : signature === ARC_EVENT_TOPICS.approval ? 'approval'
      : signature === ARC_EVENT_TOPICS.ownership ? 'ownership' : 'other';
  const data = String(row.data || '0x');
  let amount: string | null = null;
  let tokenId: string | null = null;
  if ((kind === 'transfer' || kind === 'approval') && /^0x[0-9a-fA-F]{64}$/.test(data)) {
    const raw = BigInt(data);
    amount = tokenDecimals === null ? raw.toString() : formatUnits(raw, tokenDecimals);
  } else if (kind === 'transfer' && topics[3] && /^0x[0-9a-fA-F]{64}$/.test(topics[3])) {
    tokenId = BigInt(topics[3]).toString();
  }
  return {
    blockNumber: Number(row.block_number), timestamp: row.block_timestamp,
    transactionHash: row.tx_hash, logIndex: Number(row.log_index), kind,
    fromAddress: arcEventAddress(topics[1]), toAddress: arcEventAddress(topics[2]),
    amount, tokenId, topic0: row.topic0,
  };
}

app.get('/arc/status', (_req, res) => {
  const state = db.query(`SELECT last_processed_block,updated_at,last_observed_head,head_observed_at
    FROM arc_indexer_state WHERE chain_id=?`)
    .get(ARC_MAINNET_CHAIN_ID) as { last_processed_block: number; updated_at: string;
      last_observed_head: number | null; head_observed_at: string | null } | null;
  const deployments = db.query('SELECT COUNT(*) AS count FROM arc_contract_deployments WHERE chain_id=?')
    .get(ARC_MAINNET_CHAIN_ID) as { count: number };
  const lagBlocks = state?.last_observed_head === null || state?.last_observed_head === undefined
    ? null : Math.max(0, state.last_observed_head - state.last_processed_block);
  res.json({
    chainId: ARC_MAINNET_CHAIN_ID,
    network: 'Arc Mainnet',
    lastProcessedBlock: state?.last_processed_block ?? null,
    lastObservedHead: state?.last_observed_head ?? null,
    lagBlocks,
    indexedAt: state?.updated_at ?? null,
    deploymentCount: deployments.count,
    live: Boolean(state && state.head_observed_at && lagBlocks !== null && lagBlocks <= 100 &&
      Date.now() - Date.parse(state.updated_at) < 30000 &&
      Date.now() - Date.parse(state.head_observed_at) < 30000),
    deploymentCoverage: 'direct',
  });
});

app.get('/arc/deployments', (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 30;
  const requestedOffset = Number(req.query.offset);
  const offset = Number.isInteger(requestedOffset) ? Math.max(0, Math.min(requestedOffset, 10000)) : 0;
  const token = readSessionCookie(req);
  const viewerId = token ? getSessionUserId(token) : null;
  const search = `%${query}%`;
  const rows = db.query(`SELECT d.*,
      (SELECT COUNT(*) FROM arc_contract_watches w WHERE w.chain_id=d.chain_id
        AND w.contract_address=d.contract_address) AS follower_count
    FROM arc_contract_deployments d
    WHERE d.chain_id=? AND (?='' OR d.contract_address LIKE ? OR d.deployer_address LIKE ?)
    ORDER BY d.block_number DESC,d.contract_address ASC LIMIT ? OFFSET ?`)
    .all(ARC_MAINNET_CHAIN_ID, query, search, search, limit, offset) as Record<string, unknown>[];
  const watched = viewerId
    ? new Set((db.query('SELECT contract_address FROM arc_contract_watches WHERE user_id=? AND chain_id=?')
      .all(viewerId, ARC_MAINNET_CHAIN_ID) as { contract_address: string }[])
      .map(row => row.contract_address.toLowerCase()))
    : new Set<string>();

  res.json(rows.map(row => ({
    chainId: Number(row.chain_id),
    contractAddress: row.contract_address,
    deployerAddress: row.deployer_address,
    transactionHash: row.tx_hash,
    blockNumber: Number(row.block_number),
    deployedAt: row.block_timestamp,
    deploymentKind: row.deployment_kind,
    followerCount: Number(row.follower_count),
    isFollowing: watched.has(String(row.contract_address).toLowerCase()),
  })));
});

app.get('/arc/verified', async (_req, res) => {
  try {
    res.json(await getArcRecentlyVerified());
  } catch {
    res.status(503).json({ error: 'Arc Explorer doğrulanmış kontrat verisi şu anda alınamıyor' });
  }
});

initNetworkWatch(db);
app.get('/admin/onchain/api-usage',requireAdmin as any,(_req,res)=>{res.set('Cache-Control','private, no-store');res.json(explorerBudgetStatus());});
app.get('/onchain/networks',async(_req,res)=>{const directory=await networkDirectory();res.json({...directory,networks:directory.networks.filter(n=>n.id==='5042')});});
app.get('/onchain/transfers',async(req,res)=>{
  try{res.json(await discoveryFeed(req.query.testnets==='1',typeof req.query.type==='string'?req.query.type:'',req.query.scope==='all'?'all':'priority'));}
  catch(e){res.status(e instanceof ExplorerError?e.status:503).json({error:e instanceof ExplorerError?e.message:'Çoklu ağ akışı alınamadı.'});}
});
app.get('/onchain/networks/:chainId/data',async(req,res)=>{
  try{res.json(await explorerData(req.params.chainId,parseExplorerQuery(req.query)));}
  catch(e){res.status(e instanceof ExplorerError?e.status:503).json({error:e instanceof ExplorerError?e.message:'Zincir verisi alınamadı.'});}
});
app.get('/onchain/watchlist',requireAuth as any,(req:AuthRequest,res)=>{res.set('Cache-Control','private, no-store');res.json(networkWatchlist(db,req.userId!));});
for(const method of ['put','delete'] as const)app[method]('/onchain/networks/:chainId/watchlist',requireAuth as any,async(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  try{res.json(await saveNetworkWatch(db,req.userId!,req.params.chainId,req.body,method==='delete'));}
  catch(e){res.status(e instanceof ExplorerError?e.status:503).json({error:e instanceof ExplorerError?e.message:'Takip kaydedilemedi.'});}
});
app.get('/arc/transfers', async (req,res)=>{
  const minimum=typeof req.query.minimum==='string'?req.query.minimum:'1';
  const cursor=typeof req.query.cursor==='string'?req.query.cursor:'';
  try {const filters=parseWalletFilters({minimum});if(cursor)decodeWalletCursor(cursor,'arc-usdc-feed',filters);}
  catch {return res.status(400).json({error:'Geçersiz transfer filtresi veya sayfa. Akışı yenile.'});}
  try {res.json(await getArcTransferFeed(minimum,cursor));}
  catch {res.status(503).json({error:'Arc transfer akışı şu anda alınamıyor. Yeniden dene.'});}
});
app.get('/arc/wallets/:address', async (req, res) => {
  if (!isAddress(req.params.address)) return res.status(400).json({ error: 'Geçerli bir Arc adresi gerekli.' });
  try { res.json(await getWalletOverview(db,req.params.address.toLowerCase())); }
  catch { res.status(503).json({error:'Cüzdan verileri alınamadı. Yeniden dene.'}); }
});
app.get('/arc/wallets/:address/transfers', async (req, res) => {
  if (!isAddress(req.params.address)) return res.status(400).json({ error: 'Geçerli bir Arc adresi gerekli.' });
  const address=req.params.address.toLowerCase();
  let filters;const cursor=typeof req.query.cursor==='string'?req.query.cursor:'';
  try { filters=parseWalletFilters(req.query);if(cursor)decodeWalletCursor(cursor,address,filters); }
  catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Geçersiz filtre.'});}
  try { res.json(await getWalletHistory(address,filters,cursor)); }
  catch(error) { res.status(503).json({error:error instanceof ExplorerHistoryError?error.message:'Transfer geçmişi alınamadı. Mevcut kayıtlar korunuyor; yeniden dene.',code:error instanceof ExplorerHistoryError?error.code:'history_unavailable'}); }
});
app.get('/arc/wallets/:address/research',async(req,res)=>{
  if(!isAddress(req.params.address))return res.status(400).json({error:'Geçerli bir Arc adresi gerekli.'});
  try{res.json(await getWalletResearch(req.params.address.toLowerCase()));}
  catch{res.status(503).json({error:'Cüzdan araştırma verisi alınamadı.'});}
});
app.use('/arc/finance',createFinanceWorkspaceRoutes(db,requireAuth as express.RequestHandler));
app.use('/finance/operations',authRequestGuard,createFinanceOperationsRoutes(db,requireAuth as express.RequestHandler));
app.use('/finance/integrations',authRequestGuard,createFinanceIntegrationsRoutes(db,requireAuth as express.RequestHandler));
app.use('/v1/finance',createFinanceExternalApiRoutes(db));
app.get('/arc/alerts',requireAuth as any,(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');res.json(alertDashboard(db,req.userId!));
});
app.post('/arc/alerts',requireAuth as any,async(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  try{const asset=await resolveAlertAsset(req.body);const id=createAlertRule(db,req.userId!,req.body,new Date().toISOString(),asset);res.status(201).json({id});}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:'Alarm kaydedilemedi.'});}
});
app.patch('/arc/alerts/:id',requireAuth as any,(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Geçerli bir alarm durumu seç.'});
  if(!setAlertEnabled(db,req.userId!,req.params.id,req.body.enabled))return res.status(404).json({error:'Alarm bulunamadı.'});
  res.json({ok:true});
});
app.delete('/arc/alerts/:id',requireAuth as any,(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!deleteAlertRule(db,req.userId!,req.params.id))return res.status(404).json({error:'Alarm bulunamadı.'});
  res.json({ok:true});
});
app.post('/arc/alerts/read',requireAuth as any,(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');markAlertsRead(db,req.userId!);res.json({ok:true});
});
app.get('/arc/wallets/:address/label', requireAuth as any, (req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!isAddress(req.params.address))return res.status(400).json({error:'Geçerli bir adres gerekli.'});
  res.json({label:walletLabel(db,req.userId!,req.params.address.toLowerCase())});
});
app.put('/arc/wallets/:address/label', requireAuth as any, (req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  if(!isAddress(req.params.address))return res.status(400).json({error:'Geçerli bir adres gerekli.'});
  try {res.json({label:saveWalletLabel(db,req.userId!,req.params.address.toLowerCase(),req.body?.label)});}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:'Etiket kaydedilemedi.'});}
});

app.get('/arc/addresses/:address', async (req, res) => {
  if (!isAddress(req.params.address)) return res.status(400).json({ error: 'Geçerli bir Arc adresi gerekli' });
  const address = getAddress(req.params.address).toLowerCase();
  try {
    const [explorer, indexedDeployments, deploymentCount] = await Promise.all([
      getArcAddressIntelligence(address),
      Promise.resolve(db.query(`SELECT contract_address,tx_hash,block_number,block_timestamp
        FROM arc_contract_deployments WHERE chain_id=? AND deployer_address=?
        ORDER BY block_number DESC LIMIT 12`).all(ARC_MAINNET_CHAIN_ID, address) as Record<string, unknown>[]),
      Promise.resolve(db.query(`SELECT COUNT(*) AS count FROM arc_contract_deployments
        WHERE chain_id=? AND deployer_address=?`).get(ARC_MAINNET_CHAIN_ID, address) as { count: number }),
    ]);
    res.json({
      chainId: ARC_MAINNET_CHAIN_ID,
      ...explorer,
      indexedDeploymentCount: deploymentCount.count,
      indexedDeployments: indexedDeployments.map(row => ({
        contractAddress: String(row.contract_address),
        transactionHash: String(row.tx_hash),
        blockNumber: Number(row.block_number),
        deployedAt: String(row.block_timestamp),
      })),
    });
  } catch {
    res.status(503).json({ error: 'Arc adres profili şu anda alınamıyor. Arc Explorer daha sonra tekrar denenebilir.' });
  }
});

app.get('/arc/contracts/:address', async (req, res) => {
  if (!isAddress(req.params.address)) return res.status(400).json({ error: 'Geçerli bir Arc kontrat adresi gerekli' });
  const address = getAddress(req.params.address).toLowerCase();
  const local = db.query('SELECT * FROM arc_contract_deployments WHERE chain_id=? AND contract_address=?')
    .get(ARC_MAINNET_CHAIN_ID, address) as Record<string, unknown> | null;
  let explorer: Awaited<ReturnType<typeof getArcExplorerAddress>> | null = null;
  try { explorer = await getArcExplorerAddress(address); } catch { /* The local chain record remains available. */ }
  if (!local && !explorer) return res.status(503).json({ error: 'Kontrat bilgisi şu anda alınamıyor' });
  if (explorer && !explorer.is_contract) return res.status(404).json({ error: 'Bu adres bir kontrat değil' });

  const token = explorer?.token ?? null;
  const parsedDecimals = token?.decimals === null || token?.decimals === undefined ? null : Number(token.decimals);
  const decimals = parsedDecimals !== null && Number.isInteger(parsedDecimals) && parsedDecimals >= 0 && parsedDecimals <= 36
    ? parsedDecimals : null;
  const projectRow = db.query(`SELECT * FROM projects WHERE id IN (SELECT project_id FROM project_addresses WHERE address=? AND revoked_at IS NULL) AND status='approved' AND is_demo=?
    ORDER BY approved_at DESC LIMIT 1`).get(address, DEMO_MODE ? 1 : 0) as Record<string, unknown> | null;
  const viewerToken = readSessionCookie(req);
  const viewerId = viewerToken ? getSessionUserId(viewerToken) : null;
  const followCount = db.query('SELECT COUNT(*) AS count FROM arc_contract_watches WHERE chain_id=? AND contract_address=?')
    .get(ARC_MAINNET_CHAIN_ID, address) as { count: number };
  let watch: { last_seen_block: number } | null = null;
  if (viewerId) {
    watch = db.query(`SELECT last_seen_block FROM arc_contract_watches
      WHERE user_id=? AND chain_id=? AND contract_address=?`)
      .get(viewerId, ARC_MAINNET_CHAIN_ID, address) as { last_seen_block: number } | null;
  }
  let unreadEvents = 0;
  if (watch) {
    const unread = db.query(`SELECT COUNT(*) AS count FROM arc_contract_events
      WHERE chain_id=? AND contract_address=? AND block_number>?`)
      .get(ARC_MAINNET_CHAIN_ID, address, watch.last_seen_block) as { count: number };
    unreadEvents = unread.count;
  }
  const events = db.query(`SELECT block_number,block_timestamp,tx_hash,log_index,topic0,topics_json,data
    FROM arc_contract_events WHERE chain_id=? AND contract_address=?
    ORDER BY block_number DESC,log_index DESC LIMIT 20`)
    .all(ARC_MAINNET_CHAIN_ID, address) as Record<string, unknown>[];
  const curatedId=DEMO_MODE?undefined:curatedRelatedProjects(address)[0]?.id;
  const project = projectRow ? rowToProject(projectRow) : curatedId?curatedProject(curatedId):null;
  res.json({
    chainId: ARC_MAINNET_CHAIN_ID,
    contractAddress: address,
    name: token?.name || explorer?.name || null,
    token: token ? { name: token.name, symbol: token.symbol, type: token.type,
      decimals, holdersCount: token.holders_count } : null,
    sourceVerified: explorer?.is_verified ?? null,
    proxyType: explorer?.proxy_type ?? null,
    explorerAvailable: Boolean(explorer),
    deployerAddress: (local?.deployer_address || explorer?.creator_address_hash || null) as string | null,
    deploymentTransactionHash: (local?.tx_hash || explorer?.creation_transaction_hash || null) as string | null,
    deploymentBlock: local ? Number(local.block_number) : null,
    deployedAt: local?.block_timestamp ?? null,
    followerCount: followCount.count,
    isFollowing: Boolean(watch),
    unreadEvents,
    linkedProject: project ? { id: project.id, name: project.name, description: project.description,
      officialDomain: project.officialDomain } : null,
    events: events.map(event => arcEventView(event, decimals)),
  });
});

app.get('/arc/following', requireAuth as any, (req: AuthRequest, res) => {
  res.set('Cache-Control','private, no-store');
  const rows = db.query(`SELECT w.contract_address,w.followed_at,w.last_seen_block,
      d.deployer_address,d.tx_hash AS deployment_tx_hash,d.block_number AS deployment_block,
      d.block_timestamp AS deployed_at,
      (SELECT COUNT(*) FROM (
        SELECT e.tx_hash FROM arc_contract_events e WHERE e.chain_id=w.chain_id
          AND e.contract_address=w.contract_address AND e.block_number>w.last_seen_block
        UNION
        SELECT a.tx_hash FROM arc_address_activity a WHERE a.chain_id=w.chain_id
          AND a.address=w.contract_address AND a.block_number>w.last_seen_block
      )) AS unread_events,
      (SELECT MAX(block_number) FROM (
        SELECT e.block_number FROM arc_contract_events e WHERE e.chain_id=w.chain_id AND e.contract_address=w.contract_address
        UNION ALL
        SELECT a.block_number FROM arc_address_activity a WHERE a.chain_id=w.chain_id AND a.address=w.contract_address
      )) AS latest_activity_block,
      COALESCE(
        (SELECT a.tx_hash FROM arc_address_activity a WHERE a.chain_id=w.chain_id AND a.address=w.contract_address
          ORDER BY a.block_number DESC,a.log_index DESC LIMIT 1),
        (SELECT e.tx_hash FROM arc_contract_events e WHERE e.chain_id=w.chain_id AND e.contract_address=w.contract_address
          ORDER BY e.block_number DESC,e.log_index DESC LIMIT 1)
      ) AS latest_activity_tx
    FROM arc_contract_watches w
    LEFT JOIN arc_contract_deployments d ON d.chain_id=w.chain_id AND d.contract_address=w.contract_address
    WHERE w.user_id=? AND w.chain_id=?
    ORDER BY latest_activity_block DESC,w.followed_at DESC`)
    .all(req.userId!, ARC_MAINNET_CHAIN_ID) as Record<string, unknown>[];
  res.json(rows.map(row => ({
    chainId: ARC_MAINNET_CHAIN_ID,
    contractAddress: row.contract_address,
    privateLabel: walletLabel(db,req.userId!,String(row.contract_address)),
    followedAt: row.followed_at,
    deployerAddress: row.deployer_address ?? null,
    deploymentTransactionHash: row.deployment_tx_hash ?? null,
    deploymentBlock: row.deployment_block === null ? null : Number(row.deployment_block),
    deployedAt: row.deployed_at ?? null,
    unreadEvents: Number(row.unread_events),
    latestActivityBlock: row.latest_activity_block === null ? null : Number(row.latest_activity_block),
    latestActivityTransactionHash: row.latest_activity_tx ?? null,
  })));
});

app.post('/arc/following', requireAuth as any, (req: AuthRequest, res) => {
  const rawAddress = req.body?.contractAddress;
  if (typeof rawAddress !== 'string' || !isAddress(rawAddress)) {
    return res.status(400).json({ error: 'Geçerli bir Arc adresi gerekli' });
  }
  const contractAddress = getAddress(rawAddress).toLowerCase();
  const existing = db.query(`SELECT contract_address FROM arc_contract_watches
    WHERE user_id=? AND chain_id=? AND contract_address=?`)
    .get(req.userId!, ARC_MAINNET_CHAIN_ID, contractAddress);
  const count = db.query('SELECT COUNT(*) AS count FROM arc_contract_watches WHERE user_id=? AND chain_id=?')
    .get(req.userId!, ARC_MAINNET_CHAIN_ID) as { count: number };
  if (!existing && count.count >= 100) return res.status(400).json({ error: 'Takip listesi en fazla 100 kontrat içerebilir' });

  const state = db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=?')
    .get(ARC_MAINNET_CHAIN_ID) as { last_processed_block: number } | null;
  db.run(`INSERT OR IGNORE INTO arc_contract_watches(user_id,chain_id,contract_address,followed_at,last_seen_block)
    VALUES(?,?,?,?,?)`, [req.userId!, ARC_MAINNET_CHAIN_ID, contractAddress,
      new Date().toISOString(), state?.last_processed_block ?? 0]);
  res.json({ following: true, contractAddress });
});

app.delete('/arc/following/:contractAddress', requireAuth as any, (req: AuthRequest, res) => {
  const rawAddress = req.params.contractAddress;
  if (!isAddress(rawAddress)) return res.status(400).json({ error: 'Geçerli bir Arc kontrat adresi gerekli' });
  const contractAddress = getAddress(rawAddress).toLowerCase();
  db.run('DELETE FROM arc_contract_watches WHERE user_id=? AND chain_id=? AND contract_address=?',
    [req.userId!, ARC_MAINNET_CHAIN_ID, contractAddress]);
  res.json({ following: false, contractAddress });
});

app.post('/arc/following/:contractAddress/seen', requireAuth as any, (req: AuthRequest, res) => {
  const rawAddress = req.params.contractAddress;
  if (!isAddress(rawAddress)) return res.status(400).json({ error: 'Geçerli bir Arc kontrat adresi gerekli' });
  const contractAddress = getAddress(rawAddress).toLowerCase();
  db.run(`UPDATE arc_contract_watches SET last_seen_block=COALESCE((
    SELECT MAX(block_number) FROM (
      SELECT block_number FROM arc_contract_events WHERE chain_id=? AND contract_address=?
      UNION ALL
      SELECT block_number FROM arc_address_activity WHERE chain_id=? AND address=?
    )
  ),last_seen_block) WHERE user_id=? AND chain_id=? AND contract_address=?`,
  [ARC_MAINNET_CHAIN_ID, contractAddress, ARC_MAINNET_CHAIN_ID, contractAddress,
    req.userId!, ARC_MAINNET_CHAIN_ID, contractAddress]);
  res.json({ ok: true });
});

// Public discovery only exposes approved projects from the active demo/real
// realm. It never claims that visiting a referral link completed a referral.
app.get('/discover/projects', (_req, res) => {
  const rows = db.query(`SELECT * FROM projects WHERE status='approved' AND is_demo=?
    ORDER BY (sponsored_until>?) DESC, created_at DESC`)
    .all(DEMO_MODE ? 1 : 0, new Date().toISOString()) as Record<string, unknown>[];
  res.json(rows.map(rowToProject));
});

app.use('/ecosystem/markets',createMarketRoutes(db,DEMO_MODE));
app.use('/ecosystem/notifications',authRequestGuard);
app.use('/ecosystem',createEcosystemUpdateRoutes(db,DEMO_MODE,requireAuth as express.RequestHandler));
app.get('/ecosystem', (_req,res)=>{
  const rows=db.query("SELECT * FROM projects WHERE status='approved' AND is_demo=? ORDER BY created_at DESC").all(DEMO_MODE?1:0) as Record<string,unknown>[];
  res.set('Cache-Control','public, max-age=60').json(ecosystemCatalog(db,rows.map(rowToProject),DEMO_MODE));
});

app.get('/arc/addresses/:address/projects', (req,res)=>{
  if(!isAddress(req.params.address))return res.status(400).json({error:'Geçerli bir adres gerekli.'});
  res.json([...relatedProjects(db,req.params.address.toLowerCase(),DEMO_MODE),...(DEMO_MODE?[]:curatedRelatedProjects(req.params.address))]);
});
app.get('/discover/projects/:id/addresses',(req,res)=>{
  const project=db.query("SELECT id FROM projects WHERE id=? AND status='approved' AND is_demo=?").get(req.params.id,DEMO_MODE?1:0);
  if(!project)return res.status(404).json({error:'Proje bulunamadı.'});
  res.json(projectAddresses(db,req.params.id));
});
app.post('/projects/:id/addresses',requireAdmin as any,(req:AuthRequest,res)=>{
  const project=db.query("SELECT official_domain FROM projects WHERE id=? AND status='approved' AND is_demo=?").get(req.params.id,DEMO_MODE?1:0) as {official_domain:string}|null;
  if(!project)return res.status(404).json({error:'Onaylanmış proje bulunamadı.'});
  try{const result=saveProjectAddress(db,req.params.id,project.official_domain,req.userId!,req.body);
    logAdmin(req.userId!,'review_project_address','project',req.params.id,String(req.body?.address));res.json(result);
  }catch(e){res.status(400).json({error:e instanceof Error?e.message:'Adres kaydedilemedi.'});}
});
app.delete('/projects/:id/addresses/:addressId',requireAdmin as any,(req:AuthRequest,res)=>{
  const project=db.query('SELECT id FROM projects WHERE id=? AND is_demo=?').get(req.params.id,DEMO_MODE?1:0);
  if(!project)return res.status(404).json({error:'Proje bulunamadı.'});
  const result=db.run('UPDATE project_addresses SET revoked_at=? WHERE id=? AND project_id=? AND revoked_at IS NULL',[new Date().toISOString(),req.params.addressId,req.params.id]);
  if(!result.changes)return res.status(404).json({error:'Adres bağlantısı bulunamadı.'});
  logAdmin(req.userId!,'revoke_project_address','project',req.params.id,req.params.addressId);res.json({ok:true});
});
app.get('/discover/projects/:id', (req, res) => {
  const row = db.query("SELECT * FROM projects WHERE id=? AND status='approved' AND is_demo=?")
    .get(req.params.id, DEMO_MODE ? 1 : 0) as Record<string, unknown> | null;
  if (!row) return res.status(404).json({ error: 'Proje bulunamadı' });
  res.json(rowToProject(row));
});

app.post('/discover/projects/:id/open', (req, res) => {
  const row = db.query("SELECT * FROM projects WHERE id=? AND status='approved' AND is_demo=?")
    .get(req.params.id, DEMO_MODE ? 1 : 0) as Record<string, unknown> | null;
  if (!row) return res.status(404).json({ error: 'Proje bulunamadı' });
  const project = rowToProject(row);
  const selected = db.transaction(() => {
    const links = db.query(`SELECT rl.id, rl.user_id, rl.full_link AS url, rl.referral_code FROM referral_links rl
      JOIN users u ON u.id=rl.user_id
      LEFT JOIN referral_link_clicks c ON c.referral_link_id=rl.id
      WHERE rl.project_id=? AND rl.active=1 AND u.is_demo=?
      GROUP BY rl.id
      ORDER BY COUNT(c.id) ASC, rl.queue_position ASC`)
      .all(project.id, DEMO_MODE ? 1 : 0) as { id: string; user_id: string; url: string; referral_code: string }[];
    const link = links.find(candidate => availableForProject(candidate.user_id, project.id) > 0);
    if (!link) return null;
    try {
      const url = new URL(link.url);
      if (url.protocol !== 'https:' || url.username || url.password ||
          (url.hostname !== project.officialDomain && !url.hostname.endsWith(`.${project.officialDomain}`))) return null;
    } catch { return null; }
    db.run('INSERT INTO referral_link_clicks(id,referral_link_id,project_id,created_at) VALUES(?,?,?,?)',
      [newId('clk'), link.id, project.id, new Date().toISOString()]);
    return link;
  })();
  if (selected) return res.json({ url: selected.url, referral: true,
    ...(project.referralMode === 'code' ? { referralCode: selected.referral_code } : {}) });
  return res.json({ url: `https://${project.officialDomain}`, referral: false });
});

app.get('/saved-projects', requireAuth as any, (req: AuthRequest, res) => {
  const rows = db.query(`SELECT p.* FROM saved_projects s JOIN projects p ON p.id=s.project_id
    WHERE s.user_id=? AND p.status='approved' AND p.is_demo=? ORDER BY s.created_at DESC`)
    .all(req.userId!, DEMO_MODE ? 1 : 0) as Record<string, unknown>[];
  const curated=DEMO_MODE?[]:(db.query('SELECT project_id AS id FROM saved_projects WHERE user_id=? ORDER BY created_at DESC').all(req.userId!) as {id:string}[]).map(row=>curatedProject(row.id)).filter(Boolean);
  res.set('Cache-Control','private, no-store').json([...rows.map(rowToProject),...curated]);
});

app.post('/saved-projects/:id', requireAuth as any, (req: AuthRequest, res) => {
  const row = db.query("SELECT id FROM projects WHERE id=? AND status='approved' AND is_demo=?")
    .get(req.params.id, DEMO_MODE ? 1 : 0);
  if (!row && (DEMO_MODE || !curatedProject(req.params.id))) return res.status(404).json({ error: 'Proje bulunamadı' });
  db.run('INSERT OR IGNORE INTO saved_projects(user_id,project_id,created_at) VALUES(?,?,?)',
    [req.userId!, req.params.id, new Date().toISOString()]);
  res.json({ saved: true });
});

app.delete('/saved-projects/:id', requireAuth as any, (req: AuthRequest, res) => {
  db.run('DELETE FROM ecosystem_subscriptions WHERE user_id=? AND project_id=?',[req.userId!,req.params.id]);
  db.run('DELETE FROM saved_projects WHERE user_id=? AND project_id=?', [req.userId!, req.params.id]);
  res.json({ saved: false });
});

app.get('/projects', requireAuth as any, (req: AuthRequest, res) => {
  const { status } = req.query as { status?: string };
  const rows = req.isAdmin
    ? (status ? db.query('SELECT * FROM projects WHERE status=? ORDER BY created_at DESC').all(status)
               : db.query('SELECT * FROM projects ORDER BY created_at DESC').all()) as Record<string,unknown>[]
    : db.query("SELECT * FROM projects WHERE status='approved' ORDER BY (sponsored_until>?) DESC, created_at DESC")
      .all(new Date().toISOString()) as Record<string,unknown>[];
  res.json(rows.filter(row => Boolean(row.is_demo) === DEMO_MODE).map(rowToProject));
});

app.get('/projects/:id', requireAuth as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM projects WHERE id=?').get(req.params.id) as Record<string,unknown> | null;
  if (!row || Boolean(row.is_demo) !== DEMO_MODE) return res.status(404).json({ error: 'Proje bulunamadı' });
  const proj = rowToProject(row);
  if (proj.status !== 'approved' && !req.isAdmin) return res.status(404).json({ error: 'Proje bulunamadı' });
  res.json(proj);
});

app.post('/projects/submit', requireAuth as any, (req: AuthRequest, res) => {
  let d:ReturnType<typeof parseProjectSubmission>;
  try { d=parseProjectSubmission(req.body); }
  catch(error) { return res.status(400).json({error:error instanceof Error?error.message:'Proje bilgileri geçersiz'}); }
  const id = newId('proj');
  const now = new Date().toISOString();
  db.run(`INSERT INTO projects(id,submitted_by,name,description,official_domain,referral_link_pattern,referral_mode,
    valid_participation_condition,validation_method,allows_free_participation,allows_paid_participation,
    status,is_demo,created_at,participant_benefit,arc_contract_address) VALUES(?,?,?,?,?,?,?,?,'admin_review',?,?,?,?,?,?,?)`,
    [id, req.userId!, d.name, d.description, d.officialDomain, d.referralLinkPattern, d.referralMode,
     d.validParticipationCondition, d.allowsFreeParticipation ? 1 : 0, 0, 'pending', DEMO_MODE ? 1 : 0, now,
     d.participantBenefit, d.arcContractAddress]);
  logAdmin(req.userId!, 'submit_project', 'project', id, d.name);
  res.json(rowToProject(db.query('SELECT * FROM projects WHERE id=?').get(id) as Record<string,unknown>));
});

app.post('/projects/:id/approve', requireAdmin as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM projects WHERE id=?').get(req.params.id) as Record<string,unknown> | null;
  if (!row) return res.status(404).json({ error: 'Proje bulunamadı' });
  db.run("UPDATE projects SET status='approved',approved_by=?,approved_at=? WHERE id=?",
    [req.userId!, new Date().toISOString(), req.params.id]);
  logAdmin(req.userId!, 'approve_project', 'project', req.params.id, row.name as string);
  res.json(rowToProject(db.query('SELECT * FROM projects WHERE id=?').get(req.params.id) as Record<string,unknown>));
});

app.post('/projects/:id/reject', requireAdmin as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM projects WHERE id=?').get(req.params.id) as Record<string,unknown> | null;
  if (!row) return res.status(404).json({ error: 'Proje bulunamadı' });
  const reason = (req.body as any).reason || '';
  db.run("UPDATE projects SET status='rejected',rejection_reason=? WHERE id=?", [reason, req.params.id]);
  logAdmin(req.userId!, 'reject_project', 'project', req.params.id, reason);
  res.json(rowToProject(db.query('SELECT * FROM projects WHERE id=?').get(req.params.id) as Record<string,unknown>));
});

// Sponsorship is an admin-recorded advertising placement; this endpoint never
// charges a member or promises a number of referrals.
app.post('/projects/:id/sponsor', requireAdmin as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM projects WHERE id=? AND is_demo=?').get(req.params.id, DEMO_MODE ? 1 : 0) as Record<string,unknown> | null;
  if (!row || row.status !== 'approved') return res.status(404).json({ error: 'Onaylı proje bulunamadı' });
  const days = Number(req.body?.days);
  if (![0, 30].includes(days)) return res.status(400).json({ error: '30 gün veya kapatmak için 0 seçin' });
  const until = days ? new Date(Date.now() + days * 86400_000).toISOString() : null;
  db.run('UPDATE projects SET sponsored_until=? WHERE id=?', [until, req.params.id]);
  logAdmin(req.userId!, 'sponsor_project', 'project', req.params.id, until || 'disabled');
  res.json(rowToProject(db.query('SELECT * FROM projects WHERE id=?').get(req.params.id) as Record<string,unknown>));
});

// ── Referral Links ────────────────────────────────────────────────────────────

app.get('/referral-program/mine', requireAuth as any, (req: AuthRequest, res) => {
  ensureReferralProgram();
  res.json(referralStatus(req.userId!, DEMO_MODE));
});

app.get('/referral-program/leaderboard', (_req, res) => {
  const period = String(_req.query.period || 'week');
  if (!['week', 'month', 'all'].includes(period)) return res.status(400).json({ error: 'Dönem geçersiz' });
  res.json(leaderboard(period as 'week' | 'month' | 'all', DEMO_MODE));
});

app.get('/profile/me', requireAuth as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM users WHERE id=?').get(req.userId!) as Record<string,unknown>;
  const user = rowToUser(row);
  res.json({ handle: user.publicHandle || `uye_${user.id.slice(-8)}`,
    name: user.publicName || 'Carpan üyesi' });
});

app.patch('/profile/me', requireAuth as any, (req: AuthRequest, res) => {
  const handle = String(req.body?.handle || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  if (!/^[a-z0-9_]{3,24}$/.test(handle) || /^(admin|refvox|carpan|support|moderator|system)$/.test(handle)) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-24 karakter ve harf, rakam veya _ içermeli' });
  }
  if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Görünen ad 2-40 karakter olmalı' });
  try {
    db.run('UPDATE users SET public_handle=?,public_name=? WHERE id=?', [handle, name, req.userId!]);
    return res.json({ handle, name });
  } catch (error) {
    if (String(error).includes('UNIQUE')) return res.status(409).json({ error: 'Bu kullanıcı adı alınmış' });
    throw error;
  }
});

app.get('/referral-center/cards', (_req, res) => {
  const rows = db.query(`SELECT rl.*, u.public_handle,u.public_name,
      p.name AS project_name,p.referral_mode,p.valid_participation_condition,p.participant_benefit
    FROM referral_links rl JOIN users u ON u.id=rl.user_id
    JOIN projects p ON p.id=rl.project_id
    WHERE rl.active=1 AND p.status='approved' AND p.is_demo=? AND u.is_demo=?
    ORDER BY rl.times_referred ASC,rl.queue_position ASC`)
    .all(DEMO_MODE ? 1 : 0, DEMO_MODE ? 1 : 0) as Record<string,unknown>[];
  res.json(rows.map(row => ({
    id: row.id as string,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    referralMode: row.referral_mode === 'code' ? 'code' : 'url',
    participantBenefit: row.participant_benefit as string,
    condition: row.valid_participation_condition as string,
    ownerHandle: (row.public_handle as string | null) || `uye_${String(row.user_id).slice(-8)}`,
    ownerName: (row.public_name as string | null) || 'Carpan üyesi',
    verifiedReferrals: row.times_referred as number,
    availableSlots: availableForProject(row.user_id as string, row.project_id as string),
  })).filter(card => card.availableSlots > 0));
});

app.get('/referral-links/mine', requireAuth as any, (req: AuthRequest, res) => {
  ensureReferralProgram();
  const rows = db.query(`SELECT rl.*, (SELECT COUNT(*) FROM referral_link_clicks c WHERE c.referral_link_id=rl.id) AS clicks
    FROM referral_links rl WHERE rl.user_id=? ORDER BY rl.queued_at`).all(req.userId!) as Record<string,unknown>[];
  res.json(rows.map(row => ({ ...rowToReferralLink(row), clicks: row.clicks as number,
    availableSlots: availableForProject(req.userId!, row.project_id as string),
    remainingSlots: (db.query(`SELECT COALESCE(SUM(remaining_slots),0) AS n FROM referral_batches
      WHERE user_id=? AND project_id=?`).get(req.userId!, row.project_id) as { n: number }).n,
  })));
});

app.post('/referral-links', requireAuth as any, (req: AuthRequest, res) => {
  const { projectId, referralCode } = req.body as { projectId: string; referralCode: string };
  if (!projectId || !referralCode) return res.status(400).json({ error: 'Proje ve referans kodu gerekli' });
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(referralCode)) {
    return res.status(400).json({ error: 'Kod 3-64 karakter: harf, rakam, _ veya -' });
  }
  const projRow = db.query("SELECT * FROM projects WHERE id=? AND status='approved' AND is_demo=?")
    .get(projectId, DEMO_MODE ? 1 : 0) as Record<string,unknown> | null;
  if (!projRow) return res.status(404).json({ error: 'Onaylı proje bulunamadı' });
  const project = rowToProject(projRow);
  if (!project.allowsFreeParticipation) return res.status(400).json({ error: 'Bu proje ücretsiz referans paylaşımına açık değil' });
  const fullLink = project.referralMode === 'code'
    ? project.referralLinkPattern
    : project.referralLinkPattern.replace('{code}', referralCode);
  try {
    const url = new URL(fullLink);
    if (url.protocol !== 'https:' || url.username || url.password ||
        (url.hostname !== project.officialDomain && !url.hostname.endsWith('.'+project.officialDomain))) {
      return res.status(400).json({ error: 'Link proje alan adıyla eşleşmiyor' });
    }
  } catch { return res.status(400).json({ error: 'Geçersiz link formatı' }); }
  ensureReferralProgram();
  const result = db.transaction(() => {
    if (db.query('SELECT id FROM referral_links WHERE user_id=? AND project_id=?').get(req.userId!, projectId)) {
      return { status: 409, error: 'Bu proje için zaten bir kartınız var' };
    }
    if (!assignNextBatch(req.userId!, projectId)) {
      return { status: 409, error: 'Yeni kart için 5 farklı doğrulanmış görev tamamlayıp beşli hak kazanmalısınız.' };
    }
    const maxPos = (db.query('SELECT MAX(queue_position) as mp FROM referral_links WHERE project_id=? AND active=1')
      .get(projectId) as { mp: number|null }).mp || 0;
    const id = newId('rl');
    const now = new Date().toISOString();
    db.run(`INSERT INTO referral_links(id,user_id,project_id,referral_code,full_link,
      slots_allocated,times_referred,queue_position,queued_at,active) VALUES(?,?,?,?,?,?,?,?,?,1)`,
      [id, req.userId!, projectId, referralCode, fullLink, 0, 0, maxPos+1, now]);
    return { status: 200, link: rowToReferralLink(db.query('SELECT * FROM referral_links WHERE id=?').get(id) as Record<string,unknown>) };
  }).immediate();
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ...result.link, availableSlots: availableForProject(req.userId!, projectId), remainingSlots: 5 });
});

app.post('/referral-links/:id/activate', requireAuth as any, (req: AuthRequest, res) => {
  ensureReferralProgram();
  const result = db.transaction(() => {
    const link = db.query(`SELECT rl.* FROM referral_links rl JOIN projects p ON p.id=rl.project_id
      WHERE rl.id=? AND rl.user_id=? AND p.status='approved' AND p.is_demo=?`)
      .get(req.params.id, req.userId!, DEMO_MODE ? 1 : 0) as Record<string,unknown> | null;
    if (!link) return { status: 404, error: 'Referans kartı bulunamadı' };
    const remaining = (db.query(`SELECT COALESCE(SUM(remaining_slots),0) AS n FROM referral_batches
      WHERE user_id=? AND project_id=?`).get(req.userId!, link.project_id) as { n: number }).n;
    if (remaining > 0) return { status: 409, error: 'Bu kartın mevcut hakları henüz dolmadı' };
    if (!assignNextBatch(req.userId!, link.project_id as string)) {
      return { status: 409, error: 'Yeni 5 hak için 5 farklı doğrulanmış görev tamamlayın' };
    }
    db.run('UPDATE referral_links SET active=1 WHERE id=?', [req.params.id]);
    return { status: 200, link: rowToReferralLink(db.query('SELECT * FROM referral_links WHERE id=?').get(req.params.id) as Record<string,unknown>) };
  }).immediate();
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ ...result.link, availableSlots: availableForProject(req.userId!, result.link.projectId), remainingSlots: 5 });
});

// ── Participations ────────────────────────────────────────────────────────────

// Paid campaigns are not part of the current free individual product. Keep
// this legacy URL empty so older clients cannot surface funded order capacity.
app.get('/orders/available', requireAuth as any, (_req, res) => res.json([]));

function expireReservations() {
  db.run("UPDATE reservations SET status='expired' WHERE status='active' AND expires_at < ?",
    [new Date().toISOString()]);
}

function hasFreeReferralCapacity(referrerId: string, projectId: string): boolean {
  return availableForProject(referrerId, projectId) > 0;
}

function pickReferralLink(projectId: string, participantId: string, preferredLinkId?: string) {
  // Check if already joined this project in any non-terminal state
  const alreadyJoined = db.query(
    "SELECT id FROM participations WHERE participant_id=? AND project_id=? AND status NOT IN ('rejected','expired')"
  ).get(participantId, projectId);
  if (alreadyJoined) return null;

  const rows = db.query(`SELECT rl.* FROM referral_links rl JOIN users u ON u.id=rl.user_id
    WHERE rl.project_id=? AND rl.active=1 AND rl.user_id != ? AND u.is_demo=?
    ORDER BY rl.times_referred ASC,rl.queue_position ASC`).all(projectId, participantId, DEMO_MODE ? 1 : 0) as Record<string,unknown>[];

  for (const row of rows) {
    const link = rowToReferralLink(row);
    if (preferredLinkId && link.id !== preferredLinkId) continue;
    if (!hasFreeReferralCapacity(link.userId, projectId)) continue;
    return link;
  }
  return null;
}

app.post('/participations/reserve', requireAuth as any, (req: AuthRequest, res) => {
  const { projectId, participationType, referralLinkId } = req.body as {
    projectId: string; participationType: 'free'|'paid'; referralLinkId?: string; orderId?: string;
  };
  let result: { status: number; body: unknown };
  try {
    // Reserve against one SQLite write lock so simultaneous requests cannot
    // both observe the same last free slot or funded order capacity.
    result = db.transaction(() => {
      expireReservations();
      if (participationType !== 'free' && participationType !== 'paid') {
        return { status: 400, body: { error: 'Katılım türü geçersiz' } };
      }
      if (participationType === 'paid') {
        return { status: 403, body: { error: 'Ücretli katılım şu an kapalı. Carpan bireysel kullanımda ücretsizdir.' } };
      }
      const projRow = db.query("SELECT * FROM projects WHERE id=? AND status='approved'").get(projectId) as Record<string,unknown> | null;
      if (!projRow || Boolean(projRow.is_demo) !== DEMO_MODE) return { status: 404, body: { error: 'Proje bulunamadı' } };
      const project = rowToProject(projRow);
      if (!project.allowsFreeParticipation) {
        return { status: 400, body: { error: 'Ücretsiz katılım bu proje için kapalı' } };
      }

      if (db.query("SELECT id FROM participations WHERE participant_id=? AND project_id=? AND status NOT IN ('rejected','expired')")
        .get(req.userId!, projectId)) {
        return { status: 409, body: { error: 'Bu projeye zaten katıldınız' } };
      }
      if (db.query("SELECT id FROM reservations WHERE participant_id=? AND project_id=? AND status='active' AND expires_at > ?")
        .get(req.userId!, projectId, new Date().toISOString())) {
        return { status: 409, body: { error: 'Bu proje için aktif rezervasyonunuz var' } };
      }

      const link = pickReferralLink(projectId, req.userId!, referralLinkId);
      if (!link) return { status: 503, body: { error: 'Şu an uygun referans sahibi yok. Daha sonra deneyin.' } };
      const config = getPlatformConfig();
      const expiresAt = new Date(Date.now() + config.reservationTtlMinutes * 60 * 1000).toISOString();
      const id = newId('res');
      const now = new Date().toISOString();
      db.run(`INSERT INTO reservations(id,participant_id,referral_link_id,project_id,referrer_id,
        participation_type,order_id,expires_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,'active',?)`,
        [id, req.userId!, link.id, projectId, link.userId, 'free', null, expiresAt, now]);
      return {
        status: 200,
        body: {
          reservation: rowToReservation(db.query('SELECT * FROM reservations WHERE id=?').get(id) as Record<string,unknown>),
          referralLink: link.fullLink, referralCode: link.referralCode, project, expiresAt,
        },
      };
    }).immediate();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(message)) {
      return res.status(503).json({ error: 'Aynı anda başka bir başvuru işlendi. Lütfen yeniden deneyin.' });
    }
    throw error;
  }
  res.status(result.status).json(result.body);
});

app.post('/participations/submit', requireAuth as any, (req: AuthRequest, res) => {
  const { reservationId, proof } = req.body as { reservationId: string; proof?: string };
  if (typeof proof === 'string' && proof.length > 2000) return res.status(400).json({ error: 'Kanıt en fazla 2000 karakter olabilir' });
  if (!DEMO_MODE && (!proof || !proof.trim())) {
    return res.status(400).json({ error: 'Gerçek katılım için inceleme kanıtı gerekli' });
  }
  const result = db.transaction(() => {
    const resRow = db.query('SELECT * FROM reservations WHERE id=?').get(reservationId) as Record<string,unknown> | null;
    if (!resRow) return { status: 404, error: 'Rezervasyon bulunamadı' };
    const reservation = rowToReservation(resRow);
    if (reservation.participantId !== req.userId) return { status: 403, error: 'Yetkisiz' };
    if (reservation.status !== 'active') return { status: 409, error: 'Rezervasyon aktif değil' };
    if (new Date(reservation.expiresAt) < new Date()) {
      db.run("UPDATE reservations SET status='expired' WHERE id=?", [reservationId]);
      return { status: 410, error: 'Rezervasyon süresi dolmuş. Yeniden rezervasyon yapın.' };
    }
    const now = new Date().toISOString();
    const id = newId('part');
    const projRow = db.query('SELECT * FROM projects WHERE id=?').get(reservation.projectId) as Record<string,unknown>;
    const project = rowToProject(projRow);
    db.run(`INSERT INTO participations(id,reservation_id,participant_id,referrer_id,project_id,
      referral_link_id,participation_type,order_id,submitted_proof,status,
      verified_by,verified_at,rejection_reason,disputed_at,dispute_note,is_demo,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,'pending_verification',null,null,null,null,null,?,?)`,
      [id, reservationId, req.userId!, reservation.referrerId, reservation.projectId,
       reservation.referralLinkId, reservation.participationType, reservation.orderId, proof||null, DEMO_MODE ? 1 : 0, now]);
    db.run("UPDATE reservations SET status='completed' WHERE id=?", [reservationId]);
    return { status: 200, participation: rowToParticipation(db.query('SELECT * FROM participations WHERE id=?').get(id) as Record<string,unknown>),
      autoVerify: DEMO_MODE && project.validationMethod === 'demo' };
  }).immediate();
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  if (result.autoVerify) setTimeout(() => autoVerifyDemo(result.participation.id), 2500);
  res.json(result.participation);
});

function autoVerifyDemo(participationId: string) {
  applyVerifyLogic(participationId, 'demo');
}

app.get('/participations/mine', requireAuth as any, (req: AuthRequest, res) => {
  const rows = db.query('SELECT * FROM participations WHERE participant_id=? AND is_demo=? ORDER BY created_at DESC')
    .all(req.userId!, DEMO_MODE ? 1 : 0) as Record<string,unknown>[];
  res.json(rows.map(rowToParticipation));
});

app.get('/participations/incoming', requireAuth as any, (req: AuthRequest, res) => {
  const rows = db.query('SELECT * FROM participations WHERE referrer_id=? AND is_demo=? ORDER BY created_at DESC')
    .all(req.userId!, DEMO_MODE ? 1 : 0) as Record<string,unknown>[];
  res.json(rows.map(rowToParticipation));
});

function applyVerifyLogic(participationId: string, verifiedBy: string) {
  const row = db.query('SELECT * FROM participations WHERE id=?').get(participationId) as Record<string,unknown>|null;
  if (!row) return null;
  const part = rowToParticipation(row);
  if (!['pending_verification','disputed'].includes(part.status)) return { error: 'Doğrulanabilir durumda değil' };
  if (part.participationType === 'paid' && !part.isDemo) {
    const project = db.query('SELECT validation_method FROM projects WHERE id=?').get(part.projectId) as
      { validation_method: string } | null;
    if (!project || !hasTrustedProjectProof(project.validation_method)) {
      return { error: 'Ücretli referans, güvenilir proje kanıtı olmadan doğrulanamaz' };
    }
  }
  const now = new Date().toISOString();
  return db.transaction(() => {
    const current = db.query('SELECT * FROM participations WHERE id=?').get(participationId) as Record<string,unknown>|null;
    if (!current) return null;
    if (!['pending_verification','disputed'].includes(current.status as string)) {
      return { error: 'Doğrulanabilir durumda değil' };
    }

    if (part.participationType === 'free') {
      if (db.query(`SELECT id FROM participations WHERE participant_id=? AND project_id=?
        AND status='verified' AND id!=?`).get(part.participantId, part.projectId, participationId)) {
        return { error: 'Bu kullanıcı bu projede zaten doğrulanmış' };
      }
      const batch = db.query(`SELECT id FROM referral_batches WHERE user_id=? AND project_id=?
        AND remaining_slots>0 ORDER BY assigned_at,id LIMIT 1`)
        .get(part.referrerId, part.projectId) as { id: string } | null;
      if (!batch) return { error: 'Referans sahibinin bu proje için hakkı kalmadı' };
      const debit = db.run('UPDATE users SET free_slots=free_slots-1 WHERE id=? AND free_slots>0', [part.referrerId]);
      if (debit.changes === 0) return { error: 'Referans sahibinin kullanılabilir slotu kalmadı' };
      db.run('UPDATE referral_batches SET remaining_slots=remaining_slots-1 WHERE id=? AND remaining_slots>0', [batch.id]);
      db.run(`INSERT INTO free_slots_ledger(id,user_id,delta,reason,reference_id,granted_by,created_at)
        VALUES(?,?,?,?,?,?,?)`, [newId('fsl'), part.referrerId, -1, 'referral_verified', participationId, verifiedBy, now]);
      db.run('UPDATE referral_links SET times_referred=times_referred+1 WHERE id=?', [part.referralLinkId]);

      db.run('UPDATE users SET total_free_participations=total_free_participations+1 WHERE id=?',
        [part.participantId]);
    }

    db.run("UPDATE participations SET status='verified',verified_by=?,verified_at=? WHERE id=?", [verifiedBy, now, participationId]);
    if (part.participationType === 'free') grantEarnedBatches(part.participantId, part.isDemo);
    return rowToParticipation(db.query('SELECT * FROM participations WHERE id=?').get(participationId) as Record<string,unknown>);
  }).immediate();
}

app.post('/participations/:id/verify', requireAdmin as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT is_demo FROM participations WHERE id=?').get(req.params.id) as { is_demo: number } | null;
  if (row && Boolean(row.is_demo) !== DEMO_MODE) return res.status(404).json({ error: 'Katılım bulunamadı' });
  const result = applyVerifyLogic(req.params.id, req.userId!);
  if (!result) return res.status(404).json({ error: 'Katılım bulunamadı' });
  if ('error' in result) return res.status(400).json(result);
  logAdmin(req.userId!, 'verify_participation', 'participation', req.params.id, '');
  res.json(result);
});

app.post('/participations/:id/reject', requireAdmin as any, (req: AuthRequest, res) => {
  const reason = (req.body as any).reason || '';
  const result = db.transaction(() => {
    const row = db.query('SELECT * FROM participations WHERE id=?').get(req.params.id) as Record<string,unknown>|null;
    if (!row || Boolean(row.is_demo) !== DEMO_MODE) return { status: 404, error: 'Katılım bulunamadı' };
    if (!['pending_verification','disputed'].includes(row.status as string)) {
      return { status: 409, error: 'Yalnızca bekleyen katılım reddedilebilir' };
    }
    db.run("UPDATE participations SET status='rejected',rejection_reason=? WHERE id=?", [reason, req.params.id]);
    return { status: 200, participation: rowToParticipation(db.query('SELECT * FROM participations WHERE id=?').get(req.params.id) as Record<string,unknown>) };
  }).immediate();
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  logAdmin(req.userId!, 'reject_participation', 'participation', req.params.id, reason);
  res.json(result.participation);
});

app.post('/participations/:id/dispute', requireAuth as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM participations WHERE id=?').get(req.params.id) as Record<string,unknown>|null;
  if (!row) return res.status(404).json({ error: 'Katılım bulunamadı' });
  const part = rowToParticipation(row);
  if (part.isDemo !== DEMO_MODE) return res.status(404).json({ error: 'Katılım bulunamadı' });
  if (part.participantId !== req.userId && !req.isAdmin) return res.status(403).json({ error: 'Yetkisiz' });
  if (!['pending_verification','rejected'].includes(part.status)) return res.status(400).json({ error: 'İtiraz edilemez durumda' });
  db.run("UPDATE participations SET status='disputed',disputed_at=?,dispute_note=? WHERE id=?",
    [new Date().toISOString(), (req.body as any).note||'', req.params.id]);
  res.json(rowToParticipation(db.query('SELECT * FROM participations WHERE id=?').get(req.params.id) as Record<string,unknown>));
});

// Historical pilot grants remain in the ledger; the old mutation is disabled.
app.post('/admin/grant-founder-access', requireAdmin as any, (_req, res) => {
  res.status(410).json({ error: 'Pilot hak dağıtımı sona erdi. Yeni haklar doğrulanmış katkıyla kazanılır.' });
});

// ── Config & Orders ───────────────────────────────────────────────────────────

app.get('/config', requireAuth as any, (_req, res) => res.json(getPlatformConfig()));

app.patch('/admin/config', requireAdmin as any, (req: AuthRequest, res) => {
  const allowed = ['reservationTtlMinutes'];
  for (const key of allowed) {
    if (key in req.body && req.body[key] !== undefined) setConfig(key, String(req.body[key]));
  }
  logAdmin(req.userId!, 'update_config', 'config', 'platform', JSON.stringify(req.body));
  res.json(getPlatformConfig());
});

app.get('/orders/mine', requireAuth as any, (req: AuthRequest, res) => {
  const rows = db.query('SELECT * FROM orders WHERE buyer_id=? ORDER BY created_at DESC').all(req.userId!) as Record<string,unknown>[];
  res.json(rows.map(rowToOrder));
});

app.get('/orders/:id', requireAuth as any, (req: AuthRequest, res) => {
  const row = db.query('SELECT * FROM orders WHERE id=?').get(req.params.id) as Record<string,unknown>|null;
  if (!row) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const order = rowToOrder(row);
  if (order.isDemo !== DEMO_MODE) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  if (order.buyerId !== req.userId && !req.isAdmin) return res.status(403).json({ error: 'Yetkisiz' });
  res.json(order);
});

app.post('/orders', requireAuth as any, (req: AuthRequest, res) => {
  res.status(403).json({ error: 'USDC kampanya paketleri şu an kapalı. Bireysel kullanım ücretsizdir.' });
});

app.post('/orders/:id/confirm-deposit', requireAuth as any, (_req, res) => {
  res.status(403).json({ error: 'USDC kampanya akışı şu an kapalıdır.' });
});

// ── Payments ────────────────────────────────────────────────────────────────

app.get('/payments/mine', requireAuth as any, (req: AuthRequest, res) => {
  const myPartIds = (db.query('SELECT id FROM participations WHERE participant_id=?').all(req.userId!) as {id:string}[]).map(r => r.id);
  if (!myPartIds.length) return res.json([]);
  const rows = db.query(`SELECT * FROM payments WHERE participation_id IN (${myPartIds.map(()=>'?').join(',')}) ORDER BY created_at DESC`).all(...myPartIds) as Record<string,unknown>[];
  res.json(rows.map(rowToPayment));
});

/**
 * Release payment for a verified paid participation.
 * PRODUCTION: sign + submit RefBridgeEscrow.releasePayment() from oracle wallet.
 * DEMO: marks released immediately (onchainConfirmed=false).
 * Idempotent. Prevents double-payment via INSERT OR IGNORE.
 */
app.post('/payments/release', requireAdmin as any, (req: AuthRequest, res) => {
  const { participationId } = req.body as { participationId: string };
  const partRow = db.query('SELECT * FROM participations WHERE id=?').get(participationId) as Record<string,unknown>|null;
  if (!partRow) return res.status(404).json({ error: 'Katılım bulunamadı' });
  const part = rowToParticipation(partRow);
  if (part.status !== 'verified') return res.status(400).json({ error: 'Katılım doğrulanmamış' });
  if (part.participationType !== 'paid' || !part.orderId) return res.status(400).json({ error: 'Sadece ücretli katılımlar ödül alabilir' });
  const existing = db.query('SELECT * FROM payments WHERE participation_id=?').get(participationId) as Record<string,unknown>|null;
  if (existing) return res.status(409).json({ error: 'Zaten işlendi', payment: rowToPayment(existing) });
  const orderRow = db.query('SELECT * FROM orders WHERE id=?').get(part.orderId) as Record<string,unknown>|null;
  if (!orderRow) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const order = rowToOrder(orderRow);
  if (!DEMO_MODE || !order.isDemo) {
    return res.status(501).json({ error: 'Gerçek USDC serbest bırakma henüz uygulanmadı. Zincir üzerinde oracle işlemi doğrulanmadan ödeme yapılamaz.' });
  }
  if (order.slotsUsed >= order.packageSize) return res.status(400).json({ error: 'Sipariş bütçesi tükendi' });
  const platformShare = Math.floor((order.pricePerReferral * order.platformFeeBps) / 10000);
  const participantShare = order.pricePerReferral - platformShare;
  const id = newId('pay');
  const now = new Date().toISOString();
  db.run(`INSERT OR IGNORE INTO payments(id,participation_id,order_id,recipient_id,participant_share,
    platform_share,status,tx_hash,onchain_confirmed,released_at,refunded_at,is_demo,created_at)
    VALUES(?,?,?,?,?,?,'released',null,0,?,null,1,?)`,
    [id, participationId, part.orderId, part.participantId, participantShare, platformShare, now, now]);
  db.run('UPDATE orders SET slots_used=slots_used+1 WHERE id=?', [order.id]);
  logAdmin(req.userId!, 'release_payment', 'payment', id, `order:${order.id} share:${participantShare}`);
  // TODO (production): submit RefBridgeEscrow.releasePayment() from oracle wallet
  res.json(rowToPayment(db.query('SELECT * FROM payments WHERE participation_id=?').get(participationId) as Record<string,unknown>));
});

function payoutContext(participationId: string) {
  const partRow = db.query('SELECT * FROM participations WHERE id=?').get(participationId) as Record<string,unknown>|null;
  if (!partRow) throw new Error('Katılım bulunamadı');
  const part = rowToParticipation(partRow);
  if (part.status !== 'verified' || part.participationType !== 'paid' || !part.orderId || part.isDemo) {
    throw new Error('Sadece doğrulanmış gerçek ücretli katılım ödenebilir');
  }
  const orderRow = db.query('SELECT * FROM orders WHERE id=?').get(part.orderId) as Record<string,unknown>|null;
  if (!orderRow) throw new Error('Sipariş bulunamadı');
  const order = rowToOrder(orderRow);
  const project = db.query('SELECT validation_method FROM projects WHERE id=?').get(part.projectId) as
    { validation_method: string } | null;
  if (!project || !hasTrustedProjectProof(project.validation_method)) {
    throw new Error('Güvenilir proje doğrulaması olmadan ücretli referans ödenemez');
  }
  if (order.isDemo || !order.onchainConfirmed || order.status !== 'active' || order.slotsUsed >= order.packageSize) {
    throw new Error('Sipariş aktif veya zincirde doğrulanmış değil');
  }
  const user = db.query('SELECT wallet_address FROM users WHERE id=?').get(part.participantId) as
    { wallet_address: string | null } | null;
  if (!user?.wallet_address || !/^0x[0-9a-fA-F]{40}$/.test(user.wallet_address)) {
    throw new Error('Katılımcının doğrulanmış cüzdanı yok');
  }
  if (order.platformFeeBps < 0 || order.platformFeeBps > 10000 || order.pricePerReferral <= 0) {
    throw new Error('Sipariş fiyatı veya komisyonu geçersiz');
  }
  const participantShare = BigInt(order.pricePerReferral) * BigInt(10000 - order.platformFeeBps) / 10000n;
  const platformShare = BigInt(order.pricePerReferral) - participantShare;
  return { part, order, participant: user.wallet_address.toLowerCase(), participantShare, platformShare };
}

// The administrator signs using the oracle wallet in the browser. No oracle key
// is stored in the API. A payout is recorded only after its event is verified.
app.post('/payments/prepare', requireAdmin as any, async (req: AuthRequest, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda zincir üstü ödeme kapalı' });
  try {
    const participationId = req.body?.participationId as string;
    const { part, order, participant, participantShare, platformShare } = payoutContext(participationId);
    if (db.query('SELECT id FROM payments WHERE participation_id=?').get(participationId)) {
      return res.status(409).json({ error: 'Bu katılım için ödeme zaten kaydedilmiş' });
    }
    const escrow = configuredEscrow();
    const oracle = await escrowOracle(escrow);
    res.json({ escrow, oracle, orderId: bytes32Id(order.id), participationId: bytes32Id(part.id),
      participant, participantShare: participantShare.toString(), platformShare: platformShare.toString() });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/payments/confirm', requireAdmin as any, async (req: AuthRequest, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda zincir üstü ödeme kapalı' });
  const participationId = req.body?.participationId as string;
  const txHash = req.body?.txHash as string;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) return res.status(400).json({ error: 'Geçersiz tx hash' });
  try {
    const existing = db.query('SELECT * FROM payments WHERE participation_id=?').get(participationId) as Record<string,unknown>|null;
    if (existing) {
      if ((existing.tx_hash as string)?.toLowerCase() === txHash.toLowerCase()) return res.json(rowToPayment(existing));
      return res.status(409).json({ error: 'Bu katılım için başka bir ödeme kaydedilmiş' });
    }
    const { part, order, participant, participantShare, platformShare } = payoutContext(participationId);
    await assertArcTestnet();
    const receipt = await arcRpc<ChainReceipt|null>('eth_getTransactionReceipt', [txHash]);
    if (!receipt) return res.status(202).json({ pending: true, message: 'Zincir işlemi henüz doğrulanmadı' });
    verifyReleaseReceipt(receipt, { escrow: configuredEscrow(), orderId: order.id,
      participationId: part.id, participant, participantShare, platformShare });
    const now = new Date().toISOString();
    const payment = db.transaction(() => {
      if (db.query('SELECT id FROM payments WHERE participation_id=? OR tx_hash=?').get(part.id, txHash.toLowerCase())) {
        throw new Error('Bu katılım veya tx hash zaten kullanılmış');
      }
      const current = rowToOrder(db.query('SELECT * FROM orders WHERE id=?').get(order.id) as Record<string,unknown>);
      if (current.slotsUsed >= current.packageSize) throw new Error('Sipariş kapasitesi doldu');
      const id = newId('pay');
      db.run(`INSERT INTO payments(id,participation_id,order_id,recipient_id,participant_share,
        platform_share,status,tx_hash,onchain_confirmed,released_at,refunded_at,is_demo,created_at)
        VALUES(?,?,?,?,?,?,'released',?,1,?,null,0,?)`,
        [id, part.id, order.id, part.participantId, Number(participantShare), Number(platformShare), txHash.toLowerCase(), now, now]);
      db.run("UPDATE orders SET slots_used=slots_used+1 WHERE id=?", [order.id]);
      return rowToPayment(db.query('SELECT * FROM payments WHERE id=?').get(id) as Record<string,unknown>);
    })();
    logAdmin(req.userId!, 'release_payment_onchain', 'payment', payment.id, `tx:${txHash.toLowerCase()}`);
    res.json(payment);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

function refundableAmount(order: ReturnType<typeof rowToOrder>): number {
  const row = db.query('SELECT COALESCE(SUM(amount),0) AS refunded FROM refunds WHERE order_id=?').get(order.id) as { refunded: number };
  return order.totalCost - order.slotsUsed * order.pricePerReferral - row.refunded;
}

app.get('/admin/orders', requireAdmin as any, (_req, res) => {
  const orders = db.query('SELECT * FROM orders WHERE is_demo=? ORDER BY created_at DESC LIMIT 100')
    .all(DEMO_MODE ? 1 : 0) as Record<string,unknown>[];
  res.json(orders.map(rowToOrder).map(order => ({ ...order, refundable: refundableAmount(order) })));
});

app.get('/admin/payments', requireAdmin as any, (_req, res) => {
  const rows = db.query('SELECT * FROM payments WHERE is_demo=? ORDER BY created_at DESC LIMIT 500')
    .all(DEMO_MODE ? 1 : 0) as Record<string,unknown>[];
  res.json(rows.map(rowToPayment));
});

app.post('/orders/:id/refund/prepare', requireAdmin as any, async (req: AuthRequest, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda zincir üstü iade kapalı' });
  const orderRow = db.query('SELECT * FROM orders WHERE id=?').get(req.params.id) as Record<string,unknown>|null;
  if (!orderRow) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const order = rowToOrder(orderRow);
  const amount = req.body?.amount;
  if (order.isDemo || !order.onchainConfirmed || order.status !== 'active' || !order.payerAddress ||
      !Number.isSafeInteger(amount) || amount <= 0 || amount % order.pricePerReferral !== 0 || amount > refundableAmount(order)) {
    return res.status(400).json({ error: 'İade tutarı veya sipariş durumu geçersiz' });
  }
  const activeReservations = db.query("SELECT COUNT(*) AS n FROM reservations WHERE order_id=? AND status='active' AND expires_at>?")
    .get(order.id, new Date().toISOString()) as { n: number };
  const unsettled = db.query(`SELECT COUNT(*) AS n FROM participations p WHERE p.order_id=?
    AND p.status IN ('pending_verification','disputed','verified')
    AND NOT EXISTS (SELECT 1 FROM payments pay WHERE pay.participation_id=p.id)`).get(order.id) as { n: number };
  if (activeReservations.n || unsettled.n) return res.status(409).json({ error: 'Bekleyen katılımlar çözülmeden iade yapılamaz' });
  try {
    const escrow = configuredEscrow();
    const oracle = await escrowOracle(escrow);
    res.json({ escrow, oracle, orderId: bytes32Id(order.id), amount: String(amount), owner: order.payerAddress });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.post('/orders/:id/refund/confirm', requireAdmin as any, async (req: AuthRequest, res) => {
  if (DEMO_MODE) return res.status(403).json({ error: 'Demo modunda zincir üstü iade kapalı' });
  const txHash = req.body?.txHash as string;
  const amount = req.body?.amount;
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '') || !Number.isSafeInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Geçersiz iade veya tx hash' });
  }
  const existing = db.query('SELECT * FROM refunds WHERE tx_hash=?').get(txHash.toLowerCase()) as Record<string,unknown>|null;
  if (existing) return existing.order_id === req.params.id && existing.amount === amount
    ? res.json(existing) : res.status(409).json({ error: 'Bu tx hash başka bir iade için kullanılmış' });
  const orderRow = db.query('SELECT * FROM orders WHERE id=?').get(req.params.id) as Record<string,unknown>|null;
  if (!orderRow) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const order = rowToOrder(orderRow);
  if (!order.onchainConfirmed || order.isDemo || !order.payerAddress ||
      amount % order.pricePerReferral !== 0 || amount > refundableAmount(order)) {
    return res.status(400).json({ error: 'İade siparişle uyuşmuyor' });
  }
  try {
    await assertArcTestnet();
    const receipt = await arcRpc<ChainReceipt|null>('eth_getTransactionReceipt', [txHash]);
    if (!receipt) return res.status(202).json({ pending: true, message: 'İade henüz doğrulanmadı' });
    verifyRefundReceipt(receipt, { escrow: configuredEscrow(), orderId: order.id,
      owner: order.payerAddress, amount: BigInt(amount) });
    const refund = db.transaction(() => {
      if (db.query('SELECT id FROM refunds WHERE tx_hash=?').get(txHash.toLowerCase())) throw new Error('İade zaten işlendi');
      const current = rowToOrder(db.query('SELECT * FROM orders WHERE id=?').get(order.id) as Record<string,unknown>);
      if (amount > refundableAmount(current)) throw new Error('İade mevcut bütçeyi aşıyor');
      const id = newId('ref');
      db.run('INSERT INTO refunds(id,order_id,amount,tx_hash,refunded_by,created_at) VALUES(?,?,?,?,?,?)',
        [id, order.id, amount, txHash.toLowerCase(), req.userId!, new Date().toISOString()]);
      if (refundableAmount(current) === 0) db.run("UPDATE orders SET status='refunded' WHERE id=?", [order.id]);
      return db.query('SELECT * FROM refunds WHERE id=?').get(id);
    })();
    logAdmin(req.userId!, 'refund_budget_onchain', 'order', order.id, `tx:${txHash.toLowerCase()} amount:${amount}`);
    res.json(refund);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/admin/stats', requireAdmin as any, (_req, res) => {
  const mode = DEMO_MODE ? 1 : 0;
  const count = (table: string, clause = '') =>
    (db.query(`SELECT COUNT(*) as c FROM ${table} WHERE is_demo=?${clause}`).get(mode) as { c: number }).c;
  res.json({
    users: count('users'),
    projects: count('projects'),
    pendingProjects: count('projects', " AND status='pending'"),
    participations: count('participations'),
    pendingParticipations: count('participations', " AND status='pending_verification'"),
    disputedParticipations: count('participations', " AND status='disputed'"),
  });
});

app.get('/admin/users', requireAdmin as any, (_req, res) => {
  res.json((db.query('SELECT * FROM users WHERE is_demo=? ORDER BY created_at DESC')
    .all(DEMO_MODE ? 1 : 0) as Record<string,unknown>[]).map(rowToUser));
});

app.get('/admin/participations', requireAdmin as any, (req, res) => {
  const { status } = req.query as { status?: string };
  const rows = (status
    ? db.query('SELECT * FROM participations WHERE is_demo=? AND status=? ORDER BY created_at DESC').all(DEMO_MODE ? 1 : 0, status)
    : db.query('SELECT * FROM participations WHERE is_demo=? ORDER BY created_at DESC LIMIT 200').all(DEMO_MODE ? 1 : 0)) as Record<string,unknown>[];
  res.json(rows.map(rowToParticipation));
});

app.get('/admin/logs', requireAdmin as any, (_req, res) => {
  res.json((db.query(`SELECT * FROM admin_logs WHERE admin_id IN
    (SELECT id FROM users WHERE is_demo=?) ORDER BY created_at DESC LIMIT 100`).all(DEMO_MODE ? 1 : 0) as Record<string,unknown>[]));
});

app.get('/health', (_req, res) =>
  res.json({ ok: true, demoMode: DEMO_MODE, ts: new Date().toISOString() }));

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
if (import.meta.main) {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid API PORT');
  setInterval(()=>productUsage.prune(),60*60*1000).unref();
  startAlertWorker(db);
  if(!DEMO_MODE)startEcosystemUpdateWorker(db);
  if(!DEMO_MODE&&FINANCE_API_ENABLED){
    // One bounded worker per process; persistent leases survive a service restart.
    let webhookRunning=false;
    const tick=async()=>{if(webhookRunning)return;webhookRunning=true;try{await runFinanceWebhookWorker(db);}catch{console.error('[Carpan] Finance webhook worker could not run.');}finally{webhookRunning=false;}};
    setInterval(()=>{void tick();},15_000).unref();void tick();
  }
  maintainAuth();
  setInterval(maintainAuth, 300_000).unref();
  app.listen(PORT, HOST, () => {
    console.log(`[Carpan] Server on port ${PORT} | demo=${DEMO_MODE}`);
    if (DEMO_MODE) console.log('[Carpan] Explicit local fixture data mode; public demo sign-in is retired.');
  });
}

export { app };
