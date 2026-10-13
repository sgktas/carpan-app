import crypto from 'node:crypto';
import {normalizeLoginReturn} from '../src/auth-return';

// RefVox only identifies the authenticated user via /2/users/me. Keep the
// request to the profile scope; reading Posts is not part of sign-in.
export const X_OAUTH_SCOPES = ['users.read'] as const;

export function createXAuthorizationUrl(input: {
  clientId: string;
  callbackUrl: string;
  state: string;
  codeVerifier: string;
}): string {
  const codeChallenge = crypto.createHash('sha256').update(input.codeVerifier).digest('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: input.callbackUrl,
    scope: X_OAUTH_SCOPES.join(' '),
    state: input.state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

export function normalizePostLoginPath(value: unknown): string {
  return normalizeLoginReturn(value);
}

export function parseCookieHeader(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); }
    catch { return null; }
  }
  return null;
}

export function oauthErrorCode(value: unknown): 'access_denied' | 'invalid_request' | 'server_error' | 'oauth_failed' {
  if (value === 'access_denied' || value === 'invalid_request' || value === 'server_error') return value;
  return 'oauth_failed';
}

export function sameOAuthState(receivedState: unknown, cookieState: string | null): boolean {
  if (typeof receivedState !== 'string' || !cookieState) return false;
  const left = Buffer.from(receivedState);
  const right = Buffer.from(cookieState);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
