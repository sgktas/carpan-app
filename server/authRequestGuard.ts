import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; expiresAt: number };

/** Bounded process-local limits; a full map rejects new keys rather than evicting active limits. */
export class AuthRequestLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private maxKeys = 4096) {}
  consume(key: string, limit: number, windowMs: number, now = Date.now()) {
    for (const [entry, bucket] of this.buckets) if (bucket.expiresAt <= now) this.buckets.delete(entry);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) return { allowed: false, retryAfter: 60 };
      bucket = { count: 0, expiresAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)) };
    bucket.count++;
    return { allowed: true, retryAfter: 0 };
  }
  get size() { return this.buckets.size; }
}

const policies: Record<string, { group: string; limit: number }> = {
  'POST /wallet/challenge': { group: 'wallet-start', limit: 20 },
  'POST /wallet/complete': { group: 'wallet-complete', limit: 60 },
  'GET /google/start': { group: 'oauth-start', limit: 30 },
  'GET /x/start': { group: 'oauth-start', limit: 30 },
  'POST /x/link/start': { group: 'oauth-start', limit: 30 },
  'POST /email/start': { group: 'email-start', limit: 20 },
  'POST /email/complete': { group: 'email-complete', limit: 60 },
  'POST /nonce': { group: 'wallet-link-start', limit: 10 },
  'POST /verify': { group: 'wallet-link-complete', limit: 30 },
  'POST /google-link/preview': { group: 'google-wallet-link-start', limit: 10 },
  'POST /google-link/complete': { group: 'google-wallet-link-complete', limit: 30 },
};

export function createAuthRequestGuard(origin: string, maintenance: () => void, limiter = new AuthRequestLimiter()) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'private, no-store');
    // Browser mutations must come from this site. Missing Origin supports non-browser clients.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const requestOrigin = req.get('Origin');
      if ((requestOrigin && requestOrigin !== origin) || req.get('Sec-Fetch-Site') === 'cross-site') {
        return res.status(403).json({ error: 'Giriş isteği bu siteden başlatılmalıdır.' });
      }
    }
    // Express accepts case-insensitive paths and one trailing slash by default.
    const path = req.path.replace(/\/+$/, '').toLowerCase() || '/';
    const policy = policies[`${req.method} ${path}`];
    if (policy) {
      const result = limiter.consume(`${policy.group}:${req.ip || req.socket.remoteAddress || 'unknown'}`, policy.limit, 900_000);
      if (!result.allowed) {
        res.set('Retry-After', String(result.retryAfter));
        return res.status(429).json({ error: 'Çok fazla giriş isteği. Biraz sonra tekrar deneyin.' });
      }
    }
    maintenance();
    next();
  };
}
