/**
 * Carpan — Auth middleware (sessions stored in SQLite)
 *
 * Modes:
 *   REAL: default; wallet login works without a social/email provider.
 *   DEMO: explicit non-production fixture data only; public demo login is retired.
 *
 * Sessions are stored in the DB and survive server restarts.
 * Session TTL: 7 days. Sessions cleaned up on startup.
 */

import { Request, Response, NextFunction } from 'express';
import { db, rowToUser, newId } from './sqliteDb.js';
import crypto from 'crypto';

// Additive migration keeps already-issued legacy nonces valid until their original expiry.
if (!(db.query('PRAGMA table_info(auth_nonces)').all() as { name: string }[]).some(column => column.name === 'message')) {
  db.run('ALTER TABLE auth_nonces ADD COLUMN message TEXT');
}

export type AuthRequest = Request & {
  userId?: string;
  isAdmin?: boolean;
};

const xClientId = process.env.X_CLIENT_ID?.trim() || '';
const xClientSecret = process.env.X_CLIENT_SECRET?.trim() || '';
if (Boolean(xClientId) !== Boolean(xClientSecret)) {
  throw new Error('X_CLIENT_ID and X_CLIENT_SECRET must both be set, or both be empty.');
}

export const X_OAUTH_CONFIGURED = Boolean(xClientId && xClientSecret);
export const X_LOGIN_ENABLED = X_OAUTH_CONFIGURED && process.env.X_LOGIN_ENABLED !== 'false';
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set, or both be empty.');
}
export const GOOGLE_OAUTH_CONFIGURED = Boolean(googleClientId && googleClientSecret);
// Fixture data must be explicitly selected; production always uses real accounts.
export const DEMO_MODE = process.env.REFVOX_AUTH_MODE === 'demo' && process.env.NODE_ENV !== 'production';
export const SESSION_COOKIE = 'refbridge_session';
export const OAUTH_STATE_COOKIE = 'refbridge_oauth_state';
export const GOOGLE_STATE_COOKIE = 'refbridge_google_state';
export const ARC_TESTNET_CHAIN_ID = 5042002;

// Clean expired sessions on startup
db.run(`DELETE FROM sessions WHERE expires_at < ?`, [new Date().toISOString()]);
// Revoke legacy raw bearer sessions; current sessions are stored as SHA-256 hashes.
db.run("DELETE FROM sessions WHERE length(token) != 64 OR token GLOB '*[^0-9a-f]*'");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SessionLoginMethod='x'|'wallet'|'email'|'google'|'demo';
export function createSession(userId: string, method:SessionLoginMethod|null=null): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.run(
    'INSERT INTO sessions(token,user_id,created_at,expires_at,auth_method) VALUES(?,?,?,?,?)',
    [tokenHash, userId, now, expiresAt, method],
  );
  return token;
}

export function getSessionDetails(token:string) {
  if(!getSessionUserId(token))return null;
  const row=db.query('SELECT auth_method,created_at,expires_at FROM sessions WHERE token=?').get(hashSessionToken(token)) as
    {auth_method:SessionLoginMethod|null;created_at:string;expires_at:string}|null;
  return row?{method:row.auth_method,createdAt:row.created_at,expiresAt:row.expires_at}:null;
}

export function getSessionUserId(token: string): string | null {
  const row = db.query(
    'SELECT user_id, expires_at FROM sessions WHERE token = ?'
  ).get(hashSessionToken(token)) as { user_id: string; expires_at: string } | null;
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    db.run('DELETE FROM sessions WHERE token = ?', [hashSessionToken(token)]);
    return null;
  }
  const user = db.query('SELECT is_demo,merged_into FROM users WHERE id=?').get(row.user_id) as { is_demo: number; merged_into:string|null } | null;
  if (!user || user.merged_into || !isUserModeAllowed(Boolean(user.is_demo), DEMO_MODE)) {
    db.run('DELETE FROM sessions WHERE token = ?', [hashSessionToken(token)]);
    return null;
  }
  return row.user_id;
}

export function deleteSession(token: string): void {
  db.run('DELETE FROM sessions WHERE token = ?', [hashSessionToken(token)]);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function isUserModeAllowed(isDemo: boolean, demoMode: boolean): boolean {
  return isDemo === demoMode;
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); }
    catch { return null; }
  }
  return null;
}

function cookieOptions(req: Request, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' || req.secure;
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

function appendSetCookie(res: Response, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  const cookies = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [...cookies, cookie]);
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  appendSetCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(req, SESSION_TTL_MS)}`);
}

export function clearSessionCookie(req: Request, res: Response): void {
  appendSetCookie(res, `${SESSION_COOKIE}=; ${cookieOptions(req, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function readSessionCookie(req: Request): string | null {
  return readCookie(req, SESSION_COOKIE);
}

export function setOAuthStateCookie(req: Request, res: Response, state: string): void {
  appendSetCookie(res, `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieOptions(req, 10 * 60)}`);
}

export function clearOAuthStateCookie(req: Request, res: Response): void {
  appendSetCookie(res, `${OAUTH_STATE_COOKIE}=; ${cookieOptions(req, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function readOAuthStateCookie(req: Request): string | null {
  return readCookie(req, OAUTH_STATE_COOKIE);
}

export function setGoogleStateCookie(req: Request, res: Response, state: string): void {
  appendSetCookie(res, `${GOOGLE_STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieOptions(req, 10 * 60)}`);
}

export function clearGoogleStateCookie(req: Request, res: Response): void {
  appendSetCookie(res, `${GOOGLE_STATE_COOKIE}=; ${cookieOptions(req, 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export function readGoogleStateCookie(req: Request): string | null {
  return readCookie(req, GOOGLE_STATE_COOKIE);
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = readSessionCookie(req);
  if (!token) return res.status(401).json({ error: 'Oturum açılmamış' });
  const userId = getSessionUserId(token);
  if (!userId) return res.status(401).json({ error: 'Oturum süresi dolmuş' });
  const userRow = db.query('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | null;
  if (!userRow) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
  const user = rowToUser(userRow);
  if (!DEMO_MODE && user.isDemo) return res.status(401).json({ error: 'Demo oturumu gerçek girişte kullanılamaz' });
  req.userId = userId;
  req.isAdmin = user.role === 'admin';
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Yönetici erişimi gerekli' });
    next();
  });
}

// ── PKCE helpers (for X OAuth 2.0) ────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ── Nonce helpers (for wallet signing) ────────────────────────────────────────

export function createWalletNonce(userId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  db.run(
    'INSERT INTO auth_nonces(id,user_id,nonce,purpose,expires_at,used,created_at,message) VALUES(?,?,?,?,?,0,?,?)',
    [newId('nonce'), userId, nonce, 'wallet_verify_v2', expiresAt, new Date().toISOString(), walletVerificationMessage(userId, nonce)],
  );
  return nonce;
}

export function walletVerificationMessage(userId: string, nonce: string): string {
  const site = process.env.VITE_APP_URL?.trim() ? new URL(process.env.VITE_APP_URL.trim()).origin : 'Carpan';
  return `Carpan Cüzdan Doğrulama\n\nSite: ${site}\nHesap: ${userId}\n\nCüzdan adresini Carpan hesabınıza bağlamak için bu mesajı imzalayın. Ağ değiştirmeniz gerekmez.\n\nNonce: ${nonce}\n\nBu imza işlem göndermez ve gaz ücreti gerektirmez.`;
}

export function walletNonceMessageMatches(userId: string, nonce: string, message: string, chainId?: number): boolean {
  const row = db.query('SELECT purpose,message FROM auth_nonces WHERE user_id=? AND nonce=?').get(userId, nonce) as
    { purpose: string; message: string | null } | null;
  if (!row) return false;
  if (row.purpose === 'wallet_verify_v2') return row.message === message;
  // Exact old message only; do not reinterpret a previously-issued Testnet challenge.
  const legacy = `Carpan Cüzdan Doğrulama\n\nHesap: ${userId}\nAğ: Arc Testnet (Chain ID: ${ARC_TESTNET_CHAIN_ID})\n\nCüzdan adresini hesabınıza bağlamak için bu mesajı imzalayın.\n\nNonce: ${nonce}\n\nBu imza gaz ücreti gerektirmez.`;
  return row.purpose === 'wallet_verify' && chainId === ARC_TESTNET_CHAIN_ID && message === legacy;
}

export function consumeWalletNonce(userId: string, nonce: string): boolean {
  return db.transaction(() => {
    const row = db.query(
      "SELECT id, expires_at, used FROM auth_nonces WHERE user_id=? AND nonce=? AND purpose IN ('wallet_verify','wallet_verify_v2')"
    ).get(userId, nonce) as { id: string; expires_at: string; used: number } | null;
    if (!row || row.used || new Date(row.expires_at).getTime() <= Date.now()) return false;
    db.run('UPDATE auth_nonces SET used=1 WHERE id=? AND used=0', [row.id]);
    return true;
  }).immediate();
}

export { DEMO_MODE as default };
