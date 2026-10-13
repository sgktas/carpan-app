import { Router, type Request, type RequestHandler } from 'express';
import type { Database } from 'bun:sqlite';
import type { ProductUsageClient, ProductUsageDaily, ProductUsageEvent, ProductUsageModule, ProductUsageStatus, ProductUsageStock, ProductUsageStockId, ProductUsageSummary } from '../src/product-usage-contract';

type UserRequest = Request & { userId?: string };
type Options = { clock?: () => number; resolveAccount?: (req: Request) => string | null };
type UserRow = { id: string; role: string; is_demo: number; merged_into: string | null };
const dayMs = 86_400_000;
const crawler = /\b(?:ahrefsbot|gptbot|googlebot|bingbot|petalbot|bytespider|semrushbot|claudebot|claude-web|ccbot|anthropic-ai|facebookexternalhit|meta-externalagent|amazonbot|applebot|yandexbot|duckduckbot|dotbot|mj12bot|sogou|baiduspider)\b|(?:bot\b|crawler|spider)/i;
const loginEvents: Record<string, ProductUsageEvent> = { google: 'login_google', email: 'login_email', wallet: 'login_wallet', x: 'login_x' };
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const placeholders = (items: readonly string[]) => items.map(item => `'${item}'`).join(',');
const modules: ProductUsageModule[] = ['finance', 'terminal', 'ecosystem', 'auth', 'account', 'bridge', 'integration'];
const clients: ProductUsageClient[] = ['ahrefsbot', 'gptbot', 'other_crawler', 'authenticated_account', 'internal_admin', 'unclassified', 'service_api'];
const statuses: ProductUsageStatus[] = ['success', 'redirect', 'client_error', 'server_error'];
const events: ProductUsageEvent[] = ['product_read', 'finance_refresh_request', 'finance_change_request', 'collection_change_request', 'export_request', 'watchlist_change_request', 'terminal_change_request', 'ecosystem_change_request', 'referral_change_request', 'account_change_request', 'bridge_history_request', 'login_google', 'login_email', 'login_wallet', 'login_x'];
const loginList = placeholders(Object.values(loginEvents));
const account = (db: Database, userId: unknown): UserRow | null => {
  if (typeof userId !== 'string' || !userId || userId.length > 200) return null;
  const user = db.query('SELECT id,role,is_demo,merged_into FROM users WHERE id=?').get(userId) as UserRow | null;
  return user && !user.is_demo && !user.merged_into ? user : null;
};
const eligible = (alias: string, includeAdmin: boolean) => `${alias}.is_demo=0 AND ${alias}.merged_into IS NULL${includeAdmin ? '' : ` AND ${alias}.role<>'admin'`}`;
function crawlerClient(ua: string): ProductUsageClient | null {
  // Only a claimed client label is retained, never the original User-Agent.
  if (/\bahrefsbot\b/i.test(ua)) return 'ahrefsbot';
  if (/\bgptbot\b/i.test(ua)) return 'gptbot';
  return crawler.test(ua) ? 'other_crawler' : null;
}
function normalizedPath(req: Request): string | null {
  try { return decodeURIComponent(req.path).replace(/^\/api(?=\/)/i, '').replace(/\/+$/, '') || '/'; }
  catch { return null; }
}
function routeModule(path: string): ProductUsageModule | null {
  if (/^\/admin(?:\/|$)|^\/(?:health|metrics|config)(?:\/|$)|^\/auth\/(?:status|me|demo-users|demo-login)$/.test(path)) return null;
  if (/^\/(?:v1\/finance|finance\/v1)(?:\/|$)/.test(path)) return 'integration';
  if (/^\/finance(?:\/|$)|^\/arc\/finance(?:\/|$)/.test(path)) return 'finance';
  if (/^\/(?:arc|onchain)(?:\/|$)/.test(path)) return 'terminal';
  if (/^\/(?:ecosystem|discover|saved-projects|projects|referral-program|referral-center|referral-links|participations)(?:\/|$)/.test(path)) return 'ecosystem';
  if (/^\/auth(?:\/|$)/.test(path)) return 'auth';
  if (/^\/(?:account|profile|wallet)(?:\/|$)/.test(path)) return 'account';
  if (/^\/bridge(?:\/|$)/.test(path)) return 'bridge';
  return null;
}
function productEvent(path: string, method: string, module: ProductUsageModule): ProductUsageEvent | null {
  if (['auth', 'integration'].includes(module) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  // Polling and automatic account initialization cannot establish active use.
  if (/^\/arc\/alerts\/read$|\/following\/[^/]+\/seen$|\/organizations\/personal$/.test(path)) return null;
  if (/\/(?:notifications)(?:\/|$)/.test(path) && !/^\/ecosystem\/notifications\/subscriptions\/[^/]+$/.test(path)) return null;
  if (module === 'account' && method === 'GET') return null;
  if (module === 'bridge' && method === 'GET') return null;
  if (method === 'GET') {
    // Explicit read allowlist: many Terminal/feed endpoints are polled by the UI.
    const interactive = /^\/finance\/(?:requests(?:\/[^/]+\/audit)?|inbox)$|^\/finance\/operations(?:\/|$)|^\/arc\/finance$|^\/arc\/wallets\/[^/]+(?:\/(?:research|transfers|label))?$|^\/onchain\/watchlist$|^\/(?:saved-projects|ecosystem)$|^\/discover\/projects(?:\/|$)|^\/projects(?:\/[^/]+)?$|^\/referral-(?:links|program)\/mine$|^\/participations\/incoming$/;
    return interactive.test(path) ? 'product_read' : null;
  }
  if (module === 'finance') {
    if (/\/(?:refresh|history|import)$/.test(path)) return 'finance_refresh_request';
    if (/\/exports$/.test(path)) return 'export_request';
    return /^\/finance\/(?:requests|inbox)(?:\/|$)/.test(path) ? 'collection_change_request' : 'finance_change_request';
  }
  if (module === 'terminal') return /^\/(?:arc\/following|onchain\/watchlist)(?:\/|$)/.test(path) ? 'watchlist_change_request' : 'terminal_change_request';
  if (module === 'ecosystem') return /^\/(?:referral-links|participations)(?:\/|$)/.test(path) ? 'referral_change_request' : 'ecosystem_change_request';
  if (module === 'account') return 'account_change_request';
  if (module === 'bridge') return 'bridge_history_request';
  return null;
}
function init(db: Database, now: number): void {
  db.run('CREATE TABLE IF NOT EXISTS product_usage_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  db.run(`CREATE TABLE IF NOT EXISTS product_usage_traffic(day TEXT NOT NULL,module TEXT NOT NULL CHECK(module IN (${placeholders(modules)})),client TEXT NOT NULL CHECK(client IN (${placeholders(clients)})),status TEXT NOT NULL CHECK(status IN (${placeholders(statuses)})),requests INTEGER NOT NULL CHECK(requests>0),PRIMARY KEY(day,module,client,status))`);
  db.run(`CREATE TABLE IF NOT EXISTS product_usage_accounts(day TEXT NOT NULL,user_id TEXT NOT NULL,module TEXT NOT NULL CHECK(module IN (${placeholders(modules)})),event TEXT NOT NULL CHECK(event IN (${placeholders(events)})),requests INTEGER NOT NULL CHECK(requests>0),PRIMARY KEY(day,user_id,module,event),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);
  db.run('CREATE INDEX IF NOT EXISTS product_usage_account_day ON product_usage_accounts(day,user_id)');
  db.run("INSERT OR IGNORE INTO product_usage_meta(key,value) VALUES('measurement_since',?)", [new Date(now).toISOString()]);
}
function retain(db: Database, now: number): void {
  const today = utcDay(now), last = db.query("SELECT value FROM product_usage_meta WHERE key='retention_day'").get() as { value: string } | null;
  if (last?.value === today) return;
  const oldest = utcDay(Date.parse(today) - 89 * dayMs);
  db.transaction(() => {
    db.run('DELETE FROM product_usage_accounts WHERE day<?', [oldest]);
    db.run('DELETE FROM product_usage_traffic WHERE day<?', [oldest]);
    db.run("INSERT INTO product_usage_meta(key,value) VALUES('retention_day',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [today]);
  })();
}
function incrementAccount(db: Database, day: string, user: UserRow, module: ProductUsageModule, event: ProductUsageEvent): void {
  db.run(`INSERT INTO product_usage_accounts(day,user_id,module,event,requests) VALUES(?,?,?,?,1) ON CONFLICT(day,user_id,module,event) DO UPDATE SET requests=requests+1`, [day, user.id, module, event]);
}
/** Call only after a newly completed, verified sign-in. Session rotation is not a login.
 * Missing telemetry tables / failed writes never affect authentication. */
export function recordProductLogin(db: Database, userId: string, method: string | null, userAgent = '', now = Date.now()): void {
  try {
    const event = method && Object.prototype.hasOwnProperty.call(loginEvents, method) ? loginEvents[method] : undefined;
    if (!event || crawlerClient(userAgent.slice(0, 1000))) return;
    if (!db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='product_usage_accounts'").get()) return;
    const user = account(db, userId); if (!user) return;
    retain(db, now); incrementAccount(db, utcDay(now), user, 'auth', event);
  } catch { /* Best-effort observations must never become an auth dependency. */ }
}
function stock(db: Database, includeAdmin: boolean): ProductUsageStock[] {
  const u = eligible('u', includeAdmin), v = eligible('v', includeAdmin);
  const queries: [ProductUsageStockId, string][] = [
    ['accounts', `SELECT count(*) AS n FROM users u WHERE ${u}`],
    ['verified_wallet_accounts', `SELECT count(*) AS n FROM users u WHERE ${u} AND u.wallet_verified_at IS NOT NULL AND u.wallet_address IS NOT NULL`],
    ['business_workspaces', `SELECT count(*) AS n FROM finance_organizations o JOIN users u ON u.id=o.owner_id WHERE ${u} AND o.kind='business' AND o.disabled_at IS NULL`],
    ['business_wallets', `SELECT count(*) AS n FROM finance_business_wallets w JOIN finance_organizations o ON o.id=w.organization_id JOIN users u ON u.id=o.owner_id JOIN users v ON v.id=w.registered_by WHERE ${u} AND ${v} AND o.kind='business' AND w.disabled_at IS NULL AND o.disabled_at IS NULL`],
    ['collection_requests', `SELECT count(*) AS n FROM arc_collection_requests r JOIN users u ON u.id=r.user_id WHERE ${u} AND r.cancelled=0`],
    ['collection_receipts', `SELECT count(*) AS n FROM arc_collection_proofs p JOIN users u ON u.id=p.user_id WHERE ${u}`],
    ['saved_projects', `SELECT count(*) AS n FROM saved_projects p JOIN users u ON u.id=p.user_id WHERE ${u}`],
    ['terminal_watches', `SELECT count(*) AS n FROM arc_contract_watches w JOIN users u ON u.id=w.user_id WHERE ${u}`],
    ['network_watches', `SELECT count(*) AS n FROM onchain_watchlist w JOIN users u ON u.id=w.user_id WHERE ${u}`],
    ['referral_cards', `SELECT count(*) AS n FROM referral_links r JOIN users u ON u.id=r.user_id JOIN projects p ON p.id=r.project_id WHERE ${u} AND p.is_demo=0 AND r.active=1`],
    ['referral_participations', `SELECT count(*) AS n FROM participations p JOIN users u ON u.id=p.participant_id JOIN users v ON v.id=p.referrer_id WHERE ${u} AND ${v} AND p.is_demo=0`],
    ['export_batches', `SELECT count(*) AS n FROM finance_export_batches b JOIN finance_organizations o ON o.id=b.organization_id JOIN users u ON u.id=o.owner_id JOIN users v ON v.id=b.created_by WHERE ${u} AND ${v}`],
  ];
  return queries.map(([id, query]) => {
    try { const row = db.query(query).get() as { n: number }; return { id, value: row.n, available: true, basis: 'current_records' }; }
    catch { return { id, value: null, available: false, basis: 'current_records' }; }
  });
}
function zero(day: string): ProductUsageDaily { return { day, activeAccounts: 0, loginEvents: 0, actionRequests: 0, authenticatedRequests: 0, crawlerRequests: 0, unclassifiedRequests: 0, integrationRequests: 0 }; }
export function createProductUsage(db: Database, options: Options = {}) {
  const clock = options.clock || Date.now;
  let enabled = true;
  try { init(db, clock()); retain(db, clock()); } catch { enabled = false; }
  const middleware: RequestHandler = (req: UserRequest, res, next) => {
    const path = normalizedPath(req), module = path ? routeModule(path) : null;
    if (!enabled || !path || !module) return next();
    const event = productEvent(path, req.method, module), bot = crawlerClient(String(req.get('User-Agent') || '').slice(0, 1000));
    // Capture no path/query/body/IP/UA. Read actual auth state only after its handler.
    res.once('finish', () => {
      try {
        const now = clock(); retain(db, now);
        const code = res.statusCode, status: ProductUsageStatus = code >= 500 ? 'server_error' : code >= 400 ? 'client_error' : code >= 300 ? 'redirect' : 'success';
        let user: UserRow | null = null;
        if (!bot && module !== 'integration') {
          const id = req.userId || (event && status === 'success' ? options.resolveAccount?.(req) : null);
          user = account(db, id);
        }
        const client: ProductUsageClient = bot || (module === 'integration' ? 'service_api' : user ? user.role === 'admin' ? 'internal_admin' : 'authenticated_account' : 'unclassified');
        const day = utcDay(now);
        db.transaction(() => {
          db.run(`INSERT INTO product_usage_traffic(day,module,client,status,requests) VALUES(?,?,?,?,1) ON CONFLICT(day,module,client,status) DO UPDATE SET requests=requests+1`, [day, module, client, status]);
          if (user && event && status === 'success') incrementAccount(db, day, user, module, event);
        })();
      } catch { /* No telemetry failure may change a finished product request. */ }
    });
    next();
  };
  const summary = (days: 7 | 30 | 90 = 30, includeAdmin = false): ProductUsageSummary => {
    if (!enabled) throw new Error('Usage measurement is unavailable.');
    const now = clock(), toDay = utcDay(now), fromDay = utcDay(Date.parse(toDay) - (days - 1) * dayMs);
    retain(db, now);
    const measurement = db.query("SELECT value FROM product_usage_meta WHERE key='measurement_since'").get() as { value: string };
    const filter = eligible('u', includeAdmin), range = [fromDay, toDay];
    const activity = db.query(`SELECT a.day,a.module,a.event,sum(a.requests) AS requests,count(DISTINCT a.user_id) AS accounts FROM product_usage_accounts a JOIN users u ON u.id=a.user_id WHERE ${filter} AND a.day BETWEEN ? AND ? GROUP BY a.day,a.module,a.event`).all(...range) as { day: string; module: ProductUsageModule; event: ProductUsageEvent; requests: number; accounts: number }[];
    const traffic = db.query(`SELECT day,module,client,status,sum(requests) AS requests FROM product_usage_traffic WHERE day BETWEEN ? AND ?${includeAdmin ? '' : " AND client<>'internal_admin'"} GROUP BY day,module,client,status`).all(...range) as { day: string; module: ProductUsageModule; client: ProductUsageClient; status: ProductUsageStatus; requests: number }[];
    const daily = Array.from({ length: days }, (_, index) => zero(utcDay(Date.parse(fromDay) + index * dayMs))), map = new Map(daily.map(row => [row.day, row]));
    for (const row of activity) { const target = map.get(row.day)!; if (row.event.startsWith('login_')) target.loginEvents += row.requests; else if (row.event !== 'product_read') target.actionRequests += row.requests; }
    for (const row of db.query(`SELECT a.day,count(DISTINCT a.user_id) AS n FROM product_usage_accounts a JOIN users u ON u.id=a.user_id WHERE ${filter} AND a.day BETWEEN ? AND ? AND a.event NOT IN (${loginList}) GROUP BY a.day`).all(...range) as { day: string; n: number }[]) map.get(row.day)!.activeAccounts = row.n;
    for (const row of traffic) {
      const target = map.get(row.day)!;
      if (['ahrefsbot', 'gptbot', 'other_crawler'].includes(row.client)) target.crawlerRequests += row.requests;
      else if (['authenticated_account', 'internal_admin'].includes(row.client)) target.authenticatedRequests += row.requests;
      else if (row.client === 'service_api') target.integrationRequests += row.requests;
      else target.unclassifiedRequests += row.requests;
    }
    const totals = zero(''); for (const row of daily) for (const key of Object.keys(totals).filter(key => key !== 'day') as (keyof Omit<ProductUsageDaily, 'day'>)[]) totals[key] += row[key];
    totals.activeAccounts = (db.query(`SELECT count(DISTINCT a.user_id) AS n FROM product_usage_accounts a JOIN users u ON u.id=a.user_id WHERE ${filter} AND a.day BETWEEN ? AND ? AND a.event NOT IN (${loginList})`).get(...range) as { n: number }).n;
    const eventRows = db.query(`SELECT a.module,a.event,sum(a.requests) AS requests,count(DISTINCT a.user_id) AS activeAccounts FROM product_usage_accounts a JOIN users u ON u.id=a.user_id WHERE ${filter} AND a.day BETWEEN ? AND ? GROUP BY a.module,a.event ORDER BY requests DESC,a.module,a.event`).all(...range) as ProductUsageSummary['events'];
    const trafficRows = db.query(`SELECT module,client,status,sum(requests) AS requests FROM product_usage_traffic WHERE day BETWEEN ? AND ?${includeAdmin ? '' : " AND client<>'internal_admin'"} GROUP BY module,client,status ORDER BY requests DESC,module,client,status`).all(...range) as ProductUsageSummary['traffic'];
    const { day: _day, ...totalFields } = totals;
    return { schema: 'carpan.product-usage.v1', generatedAt: new Date(now).toISOString(), includeAdmin, range: { days, fromDay, toDay, timezone: 'UTC', measurementSince: measurement.value, retentionDays: 90 }, totals: totalFields, days: daily, events: eventRows, traffic: trafficRows, stock: stock(db, includeAdmin) };
  };
  const router = (requireAdmin: RequestHandler) => {
    const result = Router();
    result.use('/usage', (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); }, requireAdmin);
    result.get('/usage', (req, res) => {
      const day = req.query.days ?? '30', includeAdmin = req.query.includeAdmin ?? 'false';
      if (Object.keys(req.query).some(key => !['days', 'includeAdmin'].includes(key)) || !['7', '30', '90'].includes(String(day)) || !['true', 'false'].includes(String(includeAdmin)) || typeof day !== 'string' || typeof includeAdmin !== 'string') return void res.status(400).json({ error: 'Use days=7,30,90 and includeAdmin=true,false.' });
      try { res.json(summary(Number(day) as 7 | 30 | 90, includeAdmin === 'true')); }
      catch { res.status(503).json({ error: 'Usage measurement is unavailable.' }); }
    });
    return result;
  };
  const prune = () => { try { if (enabled) retain(db, clock()); } catch { /* Best effort; retried on the next request or timer. */ } };
  return { middleware, router, summary, prune, recordLogin: (userId: string, method: string | null, userAgent = '') => recordProductLogin(db, userId, method, userAgent, clock()) };
}
