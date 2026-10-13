import crypto from 'node:crypto';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { db, newId, grantInitialFreeSlots } from './sqliteDb.js';
import { createSession } from './auth.js';
import {normalizeLoginReturn} from '../src/auth-return';

const WALLET_CHALLENGE_MS = 10 * 60 * 1000;
const EMAIL_LINK_MS = 15 * 60 * 1000;
const EMAIL_REQUEST_WINDOW_MS = 15 * 60 * 1000;

function tokenHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizedAddress(value: unknown): string | null {
  return typeof value === 'string' && isAddress(value) ? getAddress(value).toLowerCase() : null;
}

export function createWalletLoginChallenge(addressValue: unknown, origin: string) {
  const address = normalizedAddress(addressValue);
  if (!address) return null;
  const nonce = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WALLET_CHALLENGE_MS).toISOString();
  const message = `Carpan cüzdan girişi\n\nSite: ${origin}\nCüzdan: ${address}\nOluşturulma: ${now.toISOString()}\nSon kullanma: ${expiresAt}\nTek kullanımlık kod: ${nonce}\n\nBu imza işlem göndermez ve ücret gerektirmez.`;
  db.run(`INSERT INTO wallet_login_challenges(nonce_hash,address,message,expires_at,created_at)
    VALUES(?,?,?,?,?)`, [tokenHash(nonce), address, message, expiresAt, now.toISOString()]);
  return { nonce, message, expiresAt };
}

export async function finishWalletLogin(input: { address: unknown; nonce: unknown; signature: unknown; message: unknown }) {
  const address = normalizedAddress(input.address);
    if (!address || typeof input.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.nonce) || typeof input.signature !== 'string' ||
      typeof input.message !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) return null;
  const row = db.query(`SELECT address,message,expires_at,used FROM wallet_login_challenges WHERE nonce_hash=?`)
    .get(tokenHash(input.nonce)) as { address: string; message: string; expires_at: string; used: number } | null;
  if (!row || row.used || row.address !== address || row.message !== input.message ||
      new Date(row.expires_at).getTime() <= Date.now()) return null;
  const valid = await verifyMessage({ address: address as `0x${string}`,
    message: row.message, signature: input.signature as `0x${string}` }).catch(() => false);
  if (!valid) return null;

  return db.transaction(() => {
    const consumed = db.run(`UPDATE wallet_login_challenges SET used=1
      WHERE nonce_hash=? AND used=0 AND expires_at>?`, [tokenHash(input.nonce as string), new Date().toISOString()]);
    if (consumed.changes !== 1) return null;
    const users = db.query('SELECT id,is_demo FROM users WHERE lower(wallet_address)=?').all(address) as
      { id: string; is_demo: number }[];
    if (users.length > 1 || users.some(user => Boolean(user.is_demo))) return null;
    let userId = users[0]?.id;
    if (!userId) {
      userId = newId('user');
      const now = new Date().toISOString();
      const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
      db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,wallet_address,wallet_verified_at,
        role,is_demo,auth_method,created_at) VALUES(?,?,?,?,?,?,'user',0,'wallet',?)`,
      [userId, `wallet:${address}`, short, `Cüzdan ${short}`, address, now, now]);
      grantInitialFreeSlots(userId);
    }
    db.run('UPDATE users SET wallet_verified_at=COALESCE(wallet_verified_at,?) WHERE id=?',[new Date().toISOString(),userId]);
    return { userId, sessionToken: createSession(userId,'wallet') };
  }).immediate();
}

export function emailDeliveryConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export function createEmailLoginLink(email: string, origin: string, requestIp: string, redirect?: unknown) {
  const since = new Date(Date.now() - EMAIL_REQUEST_WINDOW_MS).toISOString();
  return db.transaction(() => {
    const emailCount = db.query(`SELECT COUNT(*) AS n FROM email_login_links WHERE email=? AND created_at>?`)
      .get(email, since) as { n: number };
    const ipCount = db.query(`SELECT COUNT(*) AS n FROM email_login_links WHERE request_ip=? AND created_at>?`)
      .get(requestIp, since) as { n: number };
    if (emailCount.n >= 3 || ipCount.n >= 20) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    db.run(`INSERT INTO email_login_links(token_hash,email,request_ip,expires_at,created_at)
      VALUES(?,?,?,?,?)`, [tokenHash(token), email, requestIp,
        new Date(now.getTime() + EMAIL_LINK_MS).toISOString(), now.toISOString()]);
    const next = encodeURIComponent(normalizeLoginReturn(redirect));
    return { tokenHash: tokenHash(token), url: `${origin}/login?next=${next}#email_token=${token}` };
  }).immediate();
}

export async function sendEmailLoginLink(email: string, url: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: 'Carpan giriş bağlantın',
        text: `Carpan hesabına giriş yapmak için bu bağlantıyı aç:\n\n${url}\n\nBağlantı 15 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Bu isteği sen yapmadıysan e-postayı yok say.` }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function invalidateEmailLoginLink(hash: string): void {
  db.run('UPDATE email_login_links SET used=1 WHERE token_hash=?', [hash]);
}

export function finishEmailLogin(token: unknown) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return db.transaction(() => {
    const hash = tokenHash(token);
    const row = db.query(`SELECT email FROM email_login_links
      WHERE token_hash=? AND used=0 AND expires_at>?`).get(hash, new Date().toISOString()) as { email: string } | null;
    if (!row) return null;
    const consumed = db.run('UPDATE email_login_links SET used=1 WHERE token_hash=? AND used=0', [hash]);
    if (consumed.changes !== 1) return null;
    const existing = db.query('SELECT id,is_demo,auth_method FROM users WHERE lower(email)=?').get(row.email) as
      { id: string; is_demo: number; auth_method: string } | null;
    if (existing?.is_demo) return null;
    if (existing && existing.auth_method !== 'email') throw new Error('Email belongs to another login method');
    let userId = existing?.id;
    if (!userId) {
      userId = newId('user');
      const display = row.email.split('@')[0].slice(0, 24);
      db.run(`INSERT INTO users(id,x_id,x_handle,x_display_name,email,role,is_demo,auth_method,created_at)
        VALUES(?,?,?,?,?,'user',0,'email',?)`,
      [userId, `email:${row.email}`, display, display, row.email, new Date().toISOString()]);
      grantInitialFreeSlots(userId);
    }
    return { userId, sessionToken: createSession(userId,'email') };
  }).immediate();
}
