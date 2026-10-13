import { test, expect, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import express, { Router, type Request, type Response as ExpressResponse, type RequestHandler } from 'express';
import { EventEmitter } from 'node:events';
import { createProductUsage, recordProductLogin } from './productUsage';
import type { ProductUsageSummary } from '../src/product-usage-contract';

const initial = Date.parse('2026-10-12T23:59:59.000Z');
function fixture() {
  const db = new Database(':memory:'); db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT NOT NULL,is_demo INTEGER NOT NULL,merged_into TEXT,wallet_address TEXT,wallet_verified_at TEXT)');
  for (const [id, role, demo, merged] of [['alice', 'user', 0, null], ['bob', 'user', 0, null], ['admin', 'admin', 0, null], ['demo', 'user', 1, null], ['alias', 'user', 0, 'alice']] as const)
    db.run('INSERT INTO users VALUES(?,?,?,?,?,?)', [id, role, demo, merged, '0x' + '1'.repeat(40), '2026-10-12T00:00:00Z']);
  let now = initial;
  const usage = createProductUsage(db, { clock: () => now, resolveAccount: req => req.get('cookie') === 'valid=alice' ? 'alice' : null });
  const observe = (url: string, input: { userId?: string; ua?: string; cookie?: string; method?: string; status?: number; body?: unknown; claimedId?: string } = {}) => {
    const req = Object.assign(Object.create(express.request), { url, originalUrl: url, method: input.method || 'GET', headers: { 'user-agent': input.ua || 'ordinary-browser', cookie: input.cookie || '', 'x-user-id': input.claimedId || '' }, body: input.body, socket: { remoteAddress: '123.123.123.123' } }) as Request & { userId?: string };
    const res = Object.assign(new EventEmitter(), { statusCode: input.status || 200 }) as unknown as ExpressResponse;
    usage.middleware(req, res, () => {});
    // Only the real route's session middleware establishes this field.
    if (input.userId) req.userId = input.userId;
    res.emit('finish');
  };
  return { db, usage, observe, setNow: (value: number) => { now = value; } };
}

test('public counts do not infer visitors or trust IDs supplied in headers, body or query', () => {
  const { db, usage, observe } = fixture();
  try {
    observe('/arc/wallets/0x' + 'a'.repeat(40) + '/research?email=private@example.com&token=secret', { claimedId: 'alice', body: { userId: 'alice' } });
    observe('/api/arc/wallets/%30x' + 'a'.repeat(40) + '/transfers', { ua: 'Mozilla AhrefsBot/7.0', status: 403, cookie: 'valid=alice', userId: 'alice' });
    observe('/arc/wallets/0x' + 'b'.repeat(40) + '/research', { ua: 'GPTBot/1.0', status: 403 });
    observe('/arc/wallets/0x' + 'c'.repeat(40), { cookie: 'valid=alice' });
    const summary = usage.summary(7);
    expect(summary.totals).toMatchObject({ activeAccounts: 1, crawlerRequests: 2, unclassifiedRequests: 1, authenticatedRequests: 1 });
    expect(summary.traffic).toContainEqual({ module: 'terminal', client: 'ahrefsbot', status: 'client_error', requests: 1 });
    const columns = db.query('PRAGMA table_info(product_usage_traffic)').all() as { name: string }[];
    expect(columns.map(row => row.name)).toEqual(['day', 'module', 'client', 'status', 'requests']);
    const all = JSON.stringify(db.query('SELECT * FROM product_usage_traffic').all()) + JSON.stringify(db.query('SELECT * FROM product_usage_accounts').all());
    for (const value of ['private@example.com', 'secret', '123.123.123.123', 'Mozilla', '0xaaaa', 'x-user-id']) expect(all.includes(value)).toBe(false);
    expect(JSON.stringify(summary).includes('alice')).toBe(false);
  } finally { db.close(); }
});

test('crawler cookies, polling, status and automatic personal initialization never create active accounts', () => {
  const { db, usage, observe } = fixture();
  try {
    for (const url of ['/auth/me', '/auth/status', '/health', '/admin/usage', '/metrics']) observe(url, { userId: 'alice' });
    for (const url of ['/arc/alerts', '/ecosystem/notifications', '/account/sessions', '/arc/following', '/arc/status', '/arc/deployments', '/arc/verified', '/arc/transfers', '/arc/addresses/0xabc', '/arc/contracts/0xabc', '/onchain/networks/5042/data', '/onchain/transfers', '/ecosystem/markets', '/ecosystem/updates', '/participations/mine', '/arc/following/0xabc/seen', '/finance/operations/organizations/personal']) observe(url, { userId: 'alice', method: url.endsWith('/seen') || url.endsWith('/personal') ? 'POST' : 'GET' });
    observe('/finance/requests', { userId: 'alice', cookie: 'valid=alice', ua: 'GPTBot', method: 'POST' });
    usage.recordLogin('alice', 'google', 'AhrefsBot');
    expect(usage.summary(7).totals).toMatchObject({ activeAccounts: 0, loginEvents: 0, actionRequests: 0 });
    expect(db.query('SELECT count(*) AS n FROM product_usage_accounts').get()).toEqual({ n: 0 });
  } finally { db.close(); }
});

test('external accounting API traffic remains service traffic even with a valid cookie', () => {
  const { db, usage, observe } = fixture();
  try {
    observe('/v1/finance/movements', { cookie: 'valid=alice', userId: 'alice' });
    observe('/api/v1/finance/exports', { method: 'POST', cookie: 'valid=alice', userId: 'alice', status: 401 });
    expect(usage.summary(7).totals).toMatchObject({ integrationRequests: 2, activeAccounts: 0, actionRequests: 0, authenticatedRequests: 0 });
  } finally { db.close(); }
});

test('explicit alarm changes count as Terminal requests and legacy Finance belongs to Finance', () => {
  const { db, usage, observe } = fixture();
  try {
    observe('/arc/alerts', { userId: 'alice', method: 'POST' });
    observe('/arc/alerts/rule', { userId: 'alice', method: 'PATCH' });
    observe('/arc/alerts/read', { userId: 'alice', method: 'POST' });
    observe('/arc/finance', { userId: 'alice', method: 'PUT' });
    observe('/ecosystem/notifications/subscriptions/project', { userId: 'alice', method: 'PUT' });
    expect(usage.summary(7).events).toEqual([
      { module: 'terminal', event: 'terminal_change_request', requests: 2, activeAccounts: 1 },
      { module: 'ecosystem', event: 'ecosystem_change_request', requests: 1, activeAccounts: 1 },
      { module: 'finance', event: 'finance_change_request', requests: 1, activeAccounts: 1 },
    ]);
  } finally { db.close(); }
});

test('successful product requests count requests, including replays, never objects or executed transfers', () => {
  const { db, usage, observe } = fixture();
  try {
    const path = '/finance/operations/organizations/org/wallets/wallet/exports';
    observe(path, { userId: 'alice', method: 'POST' }); observe(path, { userId: 'alice', method: 'POST' });
    observe('/finance/operations/organizations/org/wallets/wallet/history', { userId: 'alice', method: 'POST', status: 429 });
    const summary = usage.summary(7);
    expect(summary.totals.actionRequests).toBe(2);
    expect(summary.events).toEqual([{ module: 'finance', event: 'export_request', requests: 2, activeAccounts: 1 }]);
    expect(summary.stock.find(row => row.id === 'export_batches')).toMatchObject({ value: null, available: false, basis: 'current_records' });
  } finally { db.close(); }
});

test('UTC range uses exactly the requested inclusive days and distinct accounts across days', () => {
  const { db, usage, observe, setNow } = fixture();
  try {
    observe('/saved-projects', { userId: 'alice' }); usage.recordLogin('alice', 'google');
    setNow(initial + 2000); observe('/saved-projects', { userId: 'alice' }); observe('/saved-projects', { userId: 'bob' }); usage.recordLogin('bob', 'email');
    const summary = usage.summary(7);
    expect(summary.range).toMatchObject({ fromDay: '2026-10-07', toDay: '2026-10-13', timezone: 'UTC' });
    expect(summary.days).toHaveLength(7); expect(summary.days[5]).toMatchObject({ day: '2026-10-12', activeAccounts: 1, loginEvents: 1 });
    expect(summary.days[6]).toMatchObject({ day: '2026-10-13', activeAccounts: 2, loginEvents: 1 });
    expect(summary.totals.activeAccounts).toBe(2); expect(summary.totals.loginEvents).toBe(2);
    for (const days of [30, 90] as const) expect(usage.summary(days).days).toHaveLength(days);
  } finally { db.close(); }
});

test('demo, merged aliases and admin QA are consistently excluded; login alone is not activity', () => {
  const { db, usage, observe } = fixture();
  try {
    for (const id of ['alice', 'admin', 'demo', 'alias']) { usage.recordLogin(id, 'wallet'); observe('/saved-projects', { userId: id }); }
    usage.recordLogin('bob', 'email');
    expect(usage.summary(7).totals).toMatchObject({ activeAccounts: 1, loginEvents: 2, authenticatedRequests: 1 });
    expect(usage.summary(7, true).totals).toMatchObject({ activeAccounts: 2, loginEvents: 3, authenticatedRequests: 2 });
    expect(usage.summary(7).stock.find(row => row.id === 'accounts')?.value).toBe(2);
    expect(usage.summary(7, true).stock.find(row => row.id === 'accounts')?.value).toBe(3);
    db.run("UPDATE users SET merged_into='bob' WHERE id='alice'");
    expect(usage.summary(7).totals.activeAccounts).toBe(0);
  } finally { db.close(); }
});

test('current stock distinguishes business workspaces, real export batches and missing tables', () => {
  const { db, usage } = fixture();
  try {
    db.run('CREATE TABLE finance_organizations(id TEXT,owner_id TEXT,kind TEXT,disabled_at TEXT)');
    db.run('CREATE TABLE finance_business_wallets(id TEXT,organization_id TEXT,registered_by TEXT,disabled_at TEXT)');
    db.run('CREATE TABLE finance_export_batches(id TEXT,organization_id TEXT,created_by TEXT)');
    for (const [id, owner, kind] of [['business', 'alice', 'business'], ['personal', 'alice', 'personal'], ['internal', 'admin', 'business'], ['old', 'alias', 'business'], ['fixture', 'demo', 'business']]) {
      db.run('INSERT INTO finance_organizations VALUES(?,?,?,NULL)', [id, owner, kind]);
      db.run('INSERT INTO finance_business_wallets VALUES(?,?,?,NULL)', ['wallet-' + id, id, owner]);
      db.run('INSERT INTO finance_export_batches VALUES(?,?,?)', ['batch-' + id, id, owner]);
    }
    const stock = usage.summary(7).stock;
    expect(stock.find(row => row.id === 'business_workspaces')?.value).toBe(1);
    expect(stock.find(row => row.id === 'business_wallets')?.value).toBe(1);
    expect(stock.find(row => row.id === 'export_batches')?.value).toBe(2);
    expect(stock.find(row => row.id === 'collection_receipts')).toMatchObject({ available: false, value: null });
    expect(usage.summary(7, true).stock.find(row => row.id === 'business_workspaces')?.value).toBe(2);
  } finally { db.close(); }
});

test('measurement start survives reinitialization, has no historical session reconstruction, prunes 90 days and cascades user deletion', () => {
  const { db, usage, observe, setNow } = fixture();
  try {
    db.run('CREATE TABLE sessions(user_id TEXT,created_at TEXT)'); db.run("INSERT INTO sessions VALUES('alice','2026-01-01T00:00:00Z')");
    observe('/saved-projects', { userId: 'alice' }); usage.recordLogin('alice', 'google');
    const start = usage.summary(90).range.measurementSince;
    setNow(initial + 90 * 86_400_000); usage.prune();
    expect(db.query('SELECT count(*) AS n FROM product_usage_accounts').get()).toEqual({ n: 0 });
    expect(db.query('SELECT count(*) AS n FROM product_usage_traffic').get()).toEqual({ n: 0 });
    const next = createProductUsage(db, { clock: () => initial + 90 * 86_400_000 });
    expect(next.summary(90).range.measurementSince).toBe(start);
    expect(next.summary(90).totals.loginEvents).toBe(0);
    next.recordLogin('alice', 'google'); db.run("DELETE FROM users WHERE id='alice'");
    expect(db.query('SELECT count(*) AS n FROM product_usage_accounts').get()).toEqual({ n: 0 });
  } finally { db.close(); }
});

test('telemetry failures cannot break authentication or completed requests', () => {
  const { db, usage, observe } = fixture();
  db.run('DROP TABLE product_usage_accounts');
  expect(() => usage.recordLogin('alice', 'google')).not.toThrow();
  expect(() => observe('/saved-projects', { userId: 'alice' })).not.toThrow();
  db.close();
  expect(() => recordProductLogin(db, 'alice', 'google')).not.toThrow();
  expect(() => usage.prune()).not.toThrow();
});

test('recording and report reads use local SQLite and make no provider requests', () => {
  const { db, usage, observe } = fixture();
  const network = spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Analytics cannot spend upstream credits.'); });
  try {
    observe('/arc/wallets/0x' + '1'.repeat(40) + '/research', { cookie: 'valid=alice' });
    observe('/finance/requests', { userId: 'alice', method: 'POST' });
    usage.recordLogin('alice', 'google'); usage.prune();
    const summary = usage.summary(90);
    expect(summary.totals).toMatchObject({ activeAccounts: 1, actionRequests: 1, loginEvents: 1 });
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); db.close(); }
});

test('admin endpoint applies trusted auth before summary, validates queries and uses private no-store', async () => {
  const { db, usage } = fixture();
  const auth: RequestHandler = (req, res, next) => {
    const cookie = req.get('cookie');
    if (cookie !== 'valid=admin' && cookie !== 'valid=alice') return void res.status(401).json({ error: 'Unauthorized' });
    if (cookie === 'valid=alice') return void res.status(403).json({ error: 'Admin required' });
    next();
  };
  const router = Router(); router.use('/admin', usage.router(auth));
  const request = (url: string, cookie = '') => new Promise<Response>(resolve => {
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of new URL(url, 'http://localhost').searchParams) query[key] = key in query ? [query[key] as string, value] : value;
    const req = Object.assign(Object.create(express.request), { method: 'GET', url, query, headers: { cookie, 'x-user-id': 'admin' }, body: { userId: 'admin' }, socket: { remoteAddress: '127.0.0.1' } }) as Request;
    let status = 200; const headers: Record<string, string> = {};
    const res = { set(key: string, value: string) { headers[key] = value; return this; }, status(code: number) { status = code; return this; }, json(body: unknown) { resolve(new Response(JSON.stringify(body), { status, headers })); return this; } } as unknown as ExpressResponse;
    router(req, res, () => resolve(new Response('{}', { status: 404 })));
  });
  try {
    for (const cookie of ['', 'valid=alice']) { const response = await request('/admin/usage', cookie); expect(response.status).toBe(cookie ? 403 : 401); expect(response.headers.get('cache-control')).toBe('private, no-store'); }
    for (const query of ['days=1', 'days=7&days=30', 'includeAdmin=1', 'includeAdmin[foo]=true', 'userId=alice']) expect((await request('/admin/usage?' + query, 'valid=admin')).status).toBe(400);
    const good = await request('/admin/usage?days=7&includeAdmin=true', 'valid=admin'); expect(good.status).toBe(200);
    const body = await good.json() as ProductUsageSummary; expect(body.schema).toBe('carpan.product-usage.v1'); expect(body.includeAdmin).toBe(true);
    expect(JSON.stringify(body).includes('admin')).toBe(false); expect(good.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  } finally { db.close(); }
});
