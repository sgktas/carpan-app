/** Google OpenID Connect identity verification. No Google API profile call. */
import crypto from 'crypto';
import { generateCodeChallenge } from './auth.js';

const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
type GoogleKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
let cachedKeys: GoogleKey[] = [];
let keysExpireAt = 0;

export function googleCallbackUrl(origin: string): string {
  if (!origin) throw new Error('VITE_APP_URL must be set for Google login');
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || url.origin !== origin) {
    throw new Error('VITE_APP_URL must be an HTTP(S) origin without a path');
  }
  return `${url.origin}/api/auth/google/callback`;
}

export function createGoogleAuthorizationUrl(clientId: string, callbackUrl: string,
  state: string, nonce: string, verifier: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbackUrl,
    response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: generateCodeChallenge(verifier), code_challenge_method: 'S256' }).toString();
  return url.toString();
}

async function googleKeys(): Promise<GoogleKey[]> {
  if (cachedKeys.length && Date.now() < keysExpireAt) return cachedKeys;
  const response = await fetch(GOOGLE_KEYS_URL, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Google signing keys unavailable: ${response.status}`);
  const data = await response.json() as { keys?: GoogleKey[] };
  if (!Array.isArray(data.keys) || !data.keys.length) throw new Error('Google signing keys missing');
  const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') || '')?.[1] || 300);
  cachedKeys = data.keys;
  keysExpireAt = Date.now() + Math.min(Math.max(maxAge, 60), 3600) * 1000;
  return cachedKeys;
}

export interface GoogleIdentity { sub: string; email: string; name: string }

export async function verifyGoogleIdToken(token: unknown, clientId: string, expectedNonce: string,
  loadKeys: () => Promise<GoogleKey[]> = googleKeys): Promise<GoogleIdentity> {
  if (typeof token !== 'string' || token.length > 16_384) throw new Error('Invalid Google ID token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid Google ID token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; kid?: string; typ?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported Google ID token');
  const key = (await loadKeys()).find(item => item.kid === header.kid && item.kty === 'RSA' &&
    (!item.use || item.use === 'sig') && (!item.alg || item.alg === 'RS256'));
  if (!key) throw new Error('Google signing key not found');
  const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey,
    Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid Google signature');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(String(claims.iss)) ||
      claims.aud !== clientId || typeof claims.exp !== 'number' || claims.exp <= now ||
      typeof claims.iat !== 'number' || claims.iat > now + 60 ||
      claims.nonce !== expectedNonce || claims.email_verified !== true ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
      typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) {
    throw new Error('Google identity claims invalid');
  }
  return { sub: claims.sub, email: claims.email.toLowerCase(),
    name: typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 100) : claims.email };
}
