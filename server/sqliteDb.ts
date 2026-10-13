/**
 * Carpan — SQLite-backed persistent store using bun:sqlite (built-in, no install).
 *
 * DB file: <project root>/refbridge.db — survives server restarts.
 * Migrations are additive (CREATE TABLE IF NOT EXISTS) — safe to re-run.
 * Demo data is seeded once (idempotent check by demo user id).
 * All USDC amounts are stored as INTEGER (micro-USDC, 6-decimal raw).
 *
 * PAYMENT RELEASE AUTHORITY:
 * releasePayment can only be called by the designated oracle address on the
 * RefBridgeEscrow contract (0x9f0fde304d80e15e57f22f1c6f15e48dd6e16a9a, Arc Testnet).
 * The oracle is 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42 (platform deployer wallet).
 * The legacy /payments/release endpoint is demo-only. In live mode the admin
 * signs with the oracle wallet and the API verifies the resulting receipt.
 */

import { Database } from 'bun:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.REFBRIDGE_DB_PATH || path.join(__dirname, '..', 'refbridge.db');

export const db = new Database(DB_PATH, { create: true });
db.run('PRAGMA busy_timeout = 5000');
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA synchronous = NORMAL');

// ── Schema migrations ──────────────────────────────────────────────────────────

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  x_id TEXT UNIQUE NOT NULL,
  x_handle TEXT NOT NULL,
  x_display_name TEXT NOT NULL,
  wallet_address TEXT,
  wallet_verified_at TEXT,
  free_slots INTEGER NOT NULL DEFAULT 0,
  free_slots_granted_at TEXT,
  total_free_participations INTEGER NOT NULL DEFAULT 0,
  onboarding_unlocked INTEGER NOT NULL DEFAULT 0,
  pilot_founder_access INTEGER NOT NULL DEFAULT 0,
  pilot_founder_granted_by TEXT,
  pilot_founder_granted_at TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

// Keep the existing X identity column and every user ID stable. Other login
// methods use namespaced internal IDs there; auth_method identifies their type.
const userColumns = db.query('PRAGMA table_info(users)').all() as { name: string }[];
if (!userColumns.some(column => column.name === 'auth_method')) {
  db.run("ALTER TABLE users ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'x'");
}
if (!userColumns.some(column => column.name === 'email')) {
  db.run('ALTER TABLE users ADD COLUMN email TEXT');
}
if (!userColumns.some(column => column.name === 'google_id')) {
  db.run('ALTER TABLE users ADD COLUMN google_id TEXT');
}
if (!userColumns.some(column => column.name === 'merged_into')) {
  db.run('ALTER TABLE users ADD COLUMN merged_into TEXT');
}
if (!userColumns.some(column => column.name === 'public_handle')) {
  db.run('ALTER TABLE users ADD COLUMN public_handle TEXT');
}
if (!userColumns.some(column => column.name === 'public_name')) {
  db.run('ALTER TABLE users ADD COLUMN public_name TEXT');
}
db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email)) WHERE email IS NOT NULL');
db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_unique ON users(lower(wallet_address)) WHERE wallet_address IS NOT NULL');
db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_google_unique ON users(google_id) WHERE google_id IS NOT NULL');
db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_public_handle_unique ON users(lower(public_handle)) WHERE public_handle IS NOT NULL');

db.run(`CREATE TABLE IF NOT EXISTS wallet_login_challenges (
  nonce_hash TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS email_login_links (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  request_ip TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);
db.run(`CREATE TABLE IF NOT EXISTS google_oauth_states (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_after TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`);

db.run(`
CREATE TABLE IF NOT EXISTS auth_nonces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'wallet_verify',
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

db.run(`
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`);
// Historical sessions have no recorded sign-in method. Never infer it from users.auth_method.
if (!(db.query('PRAGMA table_info(sessions)').all() as {name:string}[]).some(c=>c.name==='auth_method')) {
  db.run('ALTER TABLE sessions ADD COLUMN auth_method TEXT');
}

db.run(`
CREATE TABLE IF NOT EXISTS x_oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  redirect_after TEXT NOT NULL DEFAULT '/',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`);
const xStateColumns=db.query('PRAGMA table_info(x_oauth_states)').all() as {name:string}[];
if (!xStateColumns.some(c=>c.name==='link_user_id')) db.run('ALTER TABLE x_oauth_states ADD COLUMN link_user_id TEXT');
if (!xStateColumns.some(c=>c.name==='link_session_hash')) db.run('ALTER TABLE x_oauth_states ADD COLUMN link_session_hash TEXT');

db.run(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  submitted_by TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  official_domain TEXT NOT NULL,
  referral_link_pattern TEXT NOT NULL,
  valid_participation_condition TEXT NOT NULL,
  validation_method TEXT NOT NULL DEFAULT 'admin_review',
  allows_free_participation INTEGER NOT NULL DEFAULT 1,
  allows_paid_participation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  approved_at TEXT,
  rejection_reason TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);
const projectColumns = db.query('PRAGMA table_info(projects)').all() as { name: string }[];
if (!projectColumns.some(column => column.name === 'participant_benefit')) {
  db.run("ALTER TABLE projects ADD COLUMN participant_benefit TEXT NOT NULL DEFAULT ''");
}
if (!projectColumns.some(column => column.name === 'sponsored_until')) {
  db.run('ALTER TABLE projects ADD COLUMN sponsored_until TEXT');
}
if (!projectColumns.some(column => column.name === 'referral_mode')) {
  db.run("ALTER TABLE projects ADD COLUMN referral_mode TEXT NOT NULL DEFAULT 'url'");
}
if (!projectColumns.some(column => column.name === 'arc_contract_address')) {
  db.run('ALTER TABLE projects ADD COLUMN arc_contract_address TEXT');
}
db.run('CREATE INDEX IF NOT EXISTS idx_projects_arc_contract ON projects(arc_contract_address,status,is_demo)');

db.run(`
CREATE TABLE IF NOT EXISTS referral_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  full_link TEXT NOT NULL,
  slots_allocated INTEGER NOT NULL DEFAULT 0,
  times_referred INTEGER NOT NULL DEFAULT 0,
  queue_position INTEGER NOT NULL DEFAULT 1,
  queued_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, project_id)
)`);

// Public discovery measures outbound clicks only. A click never verifies a
// third-party referral and cannot trigger a payout.
db.run(`CREATE TABLE IF NOT EXISTS referral_link_clicks (
  id TEXT PRIMARY KEY,
  referral_link_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_referral_clicks_link ON referral_link_clicks(referral_link_id)');
db.run(`CREATE TABLE IF NOT EXISTS saved_projects (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, project_id)
)`);

// Arc Radar indexes public mainnet contract deployments and events emitted by
// contracts users follow. This chain data is separate from user-submitted
// campaign projects: a deployment is not automatically a reviewed project.
db.run(`CREATE TABLE IF NOT EXISTS arc_contract_deployments (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  deployer_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp TEXT NOT NULL,
  deployment_kind TEXT NOT NULL DEFAULT 'direct',
  indexed_at TEXT NOT NULL,
  PRIMARY KEY(chain_id, contract_address),
  UNIQUE(chain_id, tx_hash)
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_arc_deployments_recent ON arc_contract_deployments(chain_id,block_number DESC)');
db.run('CREATE INDEX IF NOT EXISTS idx_arc_deployments_deployer ON arc_contract_deployments(chain_id,deployer_address)');

db.run(`CREATE TABLE IF NOT EXISTS arc_contract_watches (
  user_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  followed_at TEXT NOT NULL,
  last_seen_block INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, chain_id, contract_address)
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_arc_watches_address ON arc_contract_watches(chain_id,contract_address)');

db.run(`CREATE TABLE IF NOT EXISTS arc_contract_events (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  topic0 TEXT,
  topics_json TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(chain_id, tx_hash, log_index)
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_arc_events_contract_recent ON arc_contract_events(chain_id,contract_address,block_number DESC)');

// Per-address activity keeps wallet and token-transfer alerts available even
// when a user is not viewing the Arc Radar page.
db.run(`CREATE TABLE IF NOT EXISTS arc_address_activity (
  chain_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  activity_type TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT,
  token_address TEXT,
  amount_raw TEXT,
  method TEXT,
  PRIMARY KEY(chain_id,address,tx_hash,activity_type,log_index)
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_arc_address_activity_recent ON arc_address_activity(chain_id,address,block_number DESC)');

db.run(`CREATE TABLE IF NOT EXISTS arc_indexer_state (
  chain_id INTEGER PRIMARY KEY,
  last_processed_block INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`);
const arcIndexerColumns = db.query('PRAGMA table_info(arc_indexer_state)').all() as { name: string }[];
if (!arcIndexerColumns.some(column => column.name === 'last_observed_head')) {
  db.run('ALTER TABLE arc_indexer_state ADD COLUMN last_observed_head INTEGER');
}
if (!arcIndexerColumns.some(column => column.name === 'head_observed_at')) {
  db.run('ALTER TABLE arc_indexer_state ADD COLUMN head_observed_at TEXT');
}

db.run(`
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  referral_link_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  referrer_id TEXT NOT NULL,
  participation_type TEXT NOT NULL,
  order_id TEXT,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
)`);

db.run(`
CREATE TABLE IF NOT EXISTS participations (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  referrer_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  referral_link_id TEXT NOT NULL,
  participation_type TEXT NOT NULL,
  order_id TEXT,
  submitted_proof TEXT,
  status TEXT NOT NULL DEFAULT 'pending_verification',
  verified_by TEXT,
  verified_at TEXT,
  rejection_reason TEXT,
  disputed_at TEXT,
  dispute_note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

db.run(`
CREATE TABLE IF NOT EXISTS free_slots_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  granted_by TEXT,
  created_at TEXT NOT NULL
)`);

// Each five-referral allowance is assigned to one project card. Historical
// users.free_slots remains an aggregate balance for old clients and records.
db.run(`CREATE TABLE IF NOT EXISTS referral_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  source TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  total_slots INTEGER NOT NULL CHECK(total_slots > 0),
  remaining_slots INTEGER NOT NULL CHECK(remaining_slots >= 0),
  created_at TEXT NOT NULL,
  assigned_at TEXT,
  UNIQUE(user_id, source, source_reference)
)`);
db.run('CREATE INDEX IF NOT EXISTS idx_referral_batches_user_project ON referral_batches(user_id,project_id)');

db.run(`
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  package_size INTEGER NOT NULL,
  price_per_referral INTEGER NOT NULL,
  platform_fee_bps INTEGER NOT NULL,
  total_cost INTEGER NOT NULL,
  slots_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  tx_hash TEXT UNIQUE,
  onchain_confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_block INTEGER,
  confirmed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

if (!(db.query('PRAGMA table_info(orders)').all() as { name: string }[]).some(column => column.name === 'payer_address')) {
  db.run('ALTER TABLE orders ADD COLUMN payer_address TEXT');
}

// Migration: add UNIQUE index on tx_hash for existing DBs (safe no-op if already exists)
db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tx_hash ON orders(tx_hash) WHERE tx_hash IS NOT NULL`);

db.run(`
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  participation_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  participant_share INTEGER NOT NULL,
  platform_share INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  onchain_confirmed INTEGER NOT NULL DEFAULT 0,
  released_at TEXT,
  refunded_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);
db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tx_hash ON payments(tx_hash) WHERE tx_hash IS NOT NULL');

db.run(`CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  refunded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);

db.run(`
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
)`);

db.run(`
CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

// Indexes
db.run(`CREATE INDEX IF NOT EXISTS idx_part_participant ON participations(participant_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_part_referrer ON participations(referrer_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_part_project ON participations(project_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_part_status ON participations(status)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_res_participant ON reservations(participant_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_res_project ON reservations(project_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_rl_project ON referral_links(project_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_payments_participation ON payments(participation_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_nonces_user ON auth_nonces(user_id)`);

// Preserve isolation for activity created before all write paths tagged demo rows.
db.transaction(() => {
  db.run(`UPDATE projects SET is_demo=1 WHERE is_demo=0 AND submitted_by IN
    (SELECT id FROM users WHERE is_demo=1)`);
  db.run(`UPDATE participations SET is_demo=1 WHERE is_demo=0 AND
    (participant_id IN (SELECT id FROM users WHERE is_demo=1) OR referrer_id IN (SELECT id FROM users WHERE is_demo=1))`);
  db.run(`UPDATE orders SET is_demo=1 WHERE is_demo=0 AND buyer_id IN
    (SELECT id FROM users WHERE is_demo=1)`);
  db.run(`UPDATE payments SET is_demo=1 WHERE is_demo=0 AND participation_id IN
    (SELECT id FROM participations WHERE is_demo=1)`);
})();

// ── Config ─────────────────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  freeSlotGrant: '5',
  reservationTtlMinutes: '30',
};

for (const [k, v] of Object.entries(DEFAULTS)) {
  const row = db.query('SELECT value FROM platform_config WHERE key = ?').get(k) as { value: string } | null;
  if (!row) {
    db.run('INSERT INTO platform_config(key,value,updated_at) VALUES(?,?,?)', [k, v, new Date().toISOString()]);
  }
}

// Move unused per-link allocations back into each user's shared slot pool.
// Only restore allocations recorded in the old ledger; demo seed links were
// never debited from users and must not create extra slots during migration.
if (!db.query('SELECT value FROM platform_config WHERE key=?').get('referralSlotPoolV2')) {
  db.transaction(() => {
    const links = db.query('SELECT id,user_id,slots_allocated,times_referred FROM referral_links').all() as
      { id: string; user_id: string; slots_allocated: number; times_referred: number }[];
    const restoreByUser = new Map<string, number>();

    for (const link of links) {
      const allocation = Math.max(0, link.slots_allocated - link.times_referred);
      if (!allocation) continue;
      const ledger = db.query(`SELECT COALESCE(SUM(delta),0) AS net FROM free_slots_ledger
        WHERE reference_id=? AND reason IN ('slot_allocated','slot_deallocated')`).get(link.id) as { net: number };
      const restorable = Math.min(allocation, Math.max(0, -ledger.net));
      if (restorable) restoreByUser.set(link.user_id, (restoreByUser.get(link.user_id) || 0) + restorable);
    }

    const now = new Date().toISOString();
    for (const [userId, amount] of restoreByUser) {
      db.run('UPDATE users SET free_slots=free_slots+? WHERE id=?', [amount, userId]);
      db.run(`INSERT INTO free_slots_ledger(id,user_id,delta,reason,reference_id,granted_by,created_at)
        VALUES(?,?,?,?,null,null,?)`, [newId('fsl'), userId, amount, 'slot_pool_migration', now]);
    }
    db.run('UPDATE referral_links SET slots_allocated=0');
    db.run('INSERT INTO platform_config(key,value,updated_at) VALUES(?,?,?)',
      ['referralSlotPoolV2', '1', now]);
  })();
}

export function getConfig(key: string): string | null {
  const row = db.query('SELECT value FROM platform_config WHERE key = ?').get(key) as { value: string } | null;
  return row ? row.value : null;
}

export function setConfig(key: string, value: string) {
  db.run(
    'INSERT INTO platform_config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
    [key, value, new Date().toISOString()],
  );
}

export function getPlatformConfig() {
  return {
    freeSlotGrant: parseInt(getConfig('freeSlotGrant') || '5'),
    reservationTtlMinutes: parseInt(getConfig('reservationTtlMinutes') || '30'),
  };
}

// ── ID generator ───────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// New users start with five free verified-referral slots. For accounts
// created under the old five-participation rule, top up only to five once.
export const INITIAL_FREE_SLOTS = 5;
export function grantInitialFreeSlots(userId: string): void {
  const user = db.query('SELECT is_demo,free_slots FROM users WHERE id=?').get(userId) as
    { is_demo: number; free_slots: number } | null;
  if (!user || db.query(`SELECT id FROM free_slots_ledger
    WHERE user_id=? AND reason='initial_free_grant'`).get(userId)) return;
  // Count slots already spent under the previous rule so migration grants the
  // remaining part of the first five, rather than replacing used capacity.
  const spent = db.query(`SELECT COUNT(*) AS count FROM free_slots_ledger
    WHERE user_id=? AND reason='referral_verified'`).get(userId) as { count: number };
  const amount = Math.max(0, INITIAL_FREE_SLOTS - spent.count - user.free_slots);
  const now = new Date().toISOString();
  db.run(`UPDATE users SET free_slots=free_slots+?,onboarding_unlocked=1,
    free_slots_granted_at=COALESCE(free_slots_granted_at,?) WHERE id=?`, [amount, now, userId]);
  db.run(`INSERT INTO free_slots_ledger(id,user_id,delta,reason,reference_id,granted_by,created_at)
    VALUES(?,?,?,'initial_free_grant',null,null,?)`, [newId('fsl'), userId, amount, now]);
  const balance = user.free_slots + amount;
  const firstLink = db.query(`SELECT project_id FROM referral_links WHERE user_id=?
    ORDER BY times_referred DESC, queued_at ASC LIMIT 1`).get(userId) as { project_id: string } | null;
  db.run(`INSERT OR IGNORE INTO referral_batches(id,user_id,project_id,source,source_reference,
    total_slots,remaining_slots,created_at,assigned_at)
    VALUES(?,?,?,'initial','first',?,?,?,?)`,
    [newId('batch'), userId, firstLink?.project_id ?? null, INITIAL_FREE_SLOTS,
      Math.min(INITIAL_FREE_SLOTS, balance), now, firstLink ? now : null]);
}

// The marker prevents existing real accounts from being topped up again on
// every restart. Demo accounts and historical ledger entries are unchanged.
db.transaction(() => {
  const realUsers = db.query('SELECT id FROM users WHERE is_demo=0').all() as { id: string }[];
  for (const user of realUsers) grantInitialFreeSlots(user.id);
})();

export function initializeReferralBatches(): void {
  db.transaction(() => {
    const users = db.query('SELECT id,free_slots FROM users').all() as { id: string; free_slots: number }[];
    for (const user of users) {
      const firstLink = db.query(`SELECT rl.project_id FROM referral_links rl WHERE rl.user_id=?
        ORDER BY rl.times_referred DESC, rl.queued_at ASC LIMIT 1`).get(user.id) as { project_id: string } | null;
      const now = new Date().toISOString();
      const initial = db.query("SELECT id,project_id FROM referral_batches WHERE user_id=? AND source='initial'")
        .get(user.id) as { id: string; project_id: string | null } | null;
      if (initial) {
        if (firstLink && !initial.project_id) {
          db.run('UPDATE referral_batches SET project_id=?,assigned_at=? WHERE id=?',
            [firstLink.project_id, now, initial.id]);
        }
        const recorded = db.query('SELECT COALESCE(SUM(remaining_slots),0) AS n FROM referral_batches WHERE user_id=?')
          .get(user.id) as { n: number };
        const unrecorded = Math.max(0, user.free_slots - recorded.n);
        if (unrecorded) {
          db.run(`INSERT INTO referral_batches(id,user_id,project_id,source,source_reference,total_slots,
            remaining_slots,created_at,assigned_at) VALUES(?,?,?,?,?,?,?,?,?)`,
            [newId('batch'), user.id, null, 'legacy', 'preserved-balance', unrecorded, unrecorded, now, null]);
        }
        continue;
      }
      const firstRemaining = Math.min(INITIAL_FREE_SLOTS, Math.max(0, user.free_slots));
      db.run(`INSERT INTO referral_batches(id,user_id,project_id,source,source_reference,total_slots,
        remaining_slots,created_at,assigned_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        [newId('batch'), user.id, firstLink?.project_id ?? null, 'initial', 'first',
          INITIAL_FREE_SLOTS, firstRemaining, now, firstLink ? now : null]);
      const extra = Math.max(0, user.free_slots - INITIAL_FREE_SLOTS);
      if (extra) {
        db.run(`INSERT INTO referral_batches(id,user_id,project_id,source,source_reference,total_slots,
          remaining_slots,created_at,assigned_at) VALUES(?,?,?,?,?,?,?,?,?)`,
          [newId('batch'), user.id, null, 'legacy', 'preserved-balance', extra, extra, now, null]);
      }
    }
  }).immediate();
}

// ── Type helpers ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export function rowToUser(row: Row) {
  const hasX=typeof row.x_id==='string'&&/^\d+$/.test(row.x_id);
  const linkedMethods:{method:'x'|'wallet'|'email'|'google';identifier:string}[]=[];
  if(hasX)linkedMethods.push({method:'x',identifier:row.x_handle as string});
  if(row.wallet_address&&row.wallet_verified_at)linkedMethods.push({method:'wallet',identifier:row.wallet_address as string});
  if(row.google_id)linkedMethods.push({method:'google',identifier:(row.email as string)||'Google'});
  if(row.auth_method==='email'&&row.email)linkedMethods.push({method:'email',identifier:row.email as string});
  return {
    id: row.id as string,
    xId: hasX ? row.x_id as string : null,
    linkedMethods,
    authMethod: row.auth_method as 'x' | 'wallet' | 'email' | 'google',
    email: (row.email as string | null) ?? null,
    xHandle: row.x_handle as string, xDisplayName: row.x_display_name as string,
    publicHandle: (row.public_handle as string | null) ?? null,
    publicName: (row.public_name as string | null) ?? null,
    walletAddress: (row.wallet_address as string | null) ?? null,
    walletVerifiedAt: (row.wallet_verified_at as string | null) ?? null,
    freeSlots: row.free_slots as number,
    freeSlotsGrantedAt: (row.free_slots_granted_at as string | null) ?? null,
    totalFreeParticipations: row.total_free_participations as number,
    onboardingUnlocked: !!(row.onboarding_unlocked as number),
    pilotFounderAccess: !!(row.pilot_founder_access as number),
    pilotFounderGrantedBy: (row.pilot_founder_granted_by as string | null) ?? null,
    pilotFounderGrantedAt: (row.pilot_founder_granted_at as string | null) ?? null,
    role: row.role as 'user' | 'admin',
    isDemo: !!(row.is_demo as number),
    createdAt: row.created_at as string,
  };
}

export function rowToProject(row: Row) {
  return {
    id: row.id as string, submittedBy: row.submitted_by as string,
    name: row.name as string, description: row.description as string,
    officialDomain: row.official_domain as string,
    arcContractAddress: (row.arc_contract_address as string | null) ?? null,
    referralLinkPattern: row.referral_link_pattern as string,
    referralMode: row.referral_mode === 'code' ? 'code' : 'url',
    validParticipationCondition: row.valid_participation_condition as string,
    participantBenefit: (row.participant_benefit as string) || '',
    sponsoredUntil: (row.sponsored_until as string | null) ?? null,
    validationMethod: row.validation_method as string,
    allowsFreeParticipation: !!(row.allows_free_participation as number),
    allowsPaidParticipation: !!(row.allows_paid_participation as number),
    status: row.status as string,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    isDemo: !!(row.is_demo as number), createdAt: row.created_at as string,
  };
}

export function rowToReferralLink(row: Row) {
  return {
    id: row.id as string, userId: row.user_id as string,
    projectId: row.project_id as string, referralCode: row.referral_code as string,
    fullLink: row.full_link as string,
    timesReferred: row.times_referred as number, queuePosition: row.queue_position as number,
    queuedAt: row.queued_at as string, active: !!(row.active as number),
  };
}

export function rowToReservation(row: Row) {
  return {
    id: row.id as string, participantId: row.participant_id as string,
    referralLinkId: row.referral_link_id as string, projectId: row.project_id as string,
    referrerId: row.referrer_id as string,
    participationType: row.participation_type as 'free' | 'paid',
    orderId: (row.order_id as string | null) ?? null,
    expiresAt: row.expires_at as string, status: row.status as string,
    createdAt: row.created_at as string,
  };
}

export function rowToParticipation(row: Row) {
  return {
    id: row.id as string, reservationId: row.reservation_id as string,
    participantId: row.participant_id as string, referrerId: row.referrer_id as string,
    projectId: row.project_id as string, referralLinkId: row.referral_link_id as string,
    participationType: row.participation_type as 'free' | 'paid',
    orderId: (row.order_id as string | null) ?? null,
    submittedProof: (row.submitted_proof as string | null) ?? null,
    status: row.status as string,
    verifiedBy: (row.verified_by as string | null) ?? null,
    verifiedAt: (row.verified_at as string | null) ?? null,
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    disputedAt: (row.disputed_at as string | null) ?? null,
    disputeNote: (row.dispute_note as string | null) ?? null,
    isDemo: !!(row.is_demo as number), createdAt: row.created_at as string,
  };
}

export function rowToOrder(row: Row) {
  return {
    id: row.id as string, projectId: row.project_id as string,
    buyerId: row.buyer_id as string, packageSize: row.package_size as number,
    pricePerReferral: row.price_per_referral as number,
    platformFeeBps: row.platform_fee_bps as number, totalCost: row.total_cost as number,
    slotsUsed: row.slots_used as number, status: row.status as string,
    txHash: (row.tx_hash as string | null) ?? null,
    onchainConfirmed: !!(row.onchain_confirmed as number),
    confirmedBlock: (row.confirmed_block as number | null) ?? null,
    confirmedAt: (row.confirmed_at as string | null) ?? null,
    isDemo: !!(row.is_demo as number), createdAt: row.created_at as string,
    payerAddress: (row.payer_address as string | null) ?? null,
  };
}

export function rowToPayment(row: Row) {
  return {
    id: row.id as string, participationId: row.participation_id as string,
    orderId: row.order_id as string, recipientId: row.recipient_id as string,
    participantShare: row.participant_share as number,
    platformShare: row.platform_share as number, status: row.status as string,
    txHash: (row.tx_hash as string | null) ?? null,
    onchainConfirmed: !!(row.onchain_confirmed as number),
    releasedAt: (row.released_at as string | null) ?? null,
    refundedAt: (row.refunded_at as string | null) ?? null,
    isDemo: !!(row.is_demo as number), createdAt: row.created_at as string,
  };
}

// ── Admin log ──────────────────────────────────────────────────────────────────

export function logAdmin(adminId: string, action: string, targetType: string, targetId: string, details: string) {
  db.run(
    'INSERT INTO admin_logs(id,admin_id,action,target_type,target_id,details,created_at) VALUES(?,?,?,?,?,?,?)',
    [newId('al'), adminId, action, targetType, targetId, details, new Date().toISOString()],
  );
}

// ── Seed demo data (idempotent) ────────────────────────────────────────────────

export function seedDemo() {
  const existing = db.query('SELECT id FROM users WHERE id = ?').get('user_admin');
  if (existing) return;
  const now = new Date().toISOString();

  db.run(`INSERT OR IGNORE INTO users(id,x_id,x_handle,x_display_name,wallet_address,free_slots,
    free_slots_granted_at,total_free_participations,onboarding_unlocked,pilot_founder_access,
    pilot_founder_granted_by,pilot_founder_granted_at,role,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['user_admin','demo_admin_x','refbridge_admin','RefBridge Admin',null,999,now,99,1,1,'system',now,'admin',1,now]);

  db.run(`INSERT OR IGNORE INTO users(id,x_id,x_handle,x_display_name,wallet_address,free_slots,
    free_slots_granted_at,total_free_participations,onboarding_unlocked,pilot_founder_access,role,is_demo,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['user_demo','demo_user_x','alice_demo','Alice (Demo)',null,0,null,4,0,0,'user',1,now]);

  db.run(`INSERT OR IGNORE INTO users(id,x_id,x_handle,x_display_name,wallet_address,free_slots,
    free_slots_granted_at,total_free_participations,onboarding_unlocked,pilot_founder_access,
    pilot_founder_granted_by,pilot_founder_granted_at,role,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['user_founder','demo_founder_x','bob_founder','Bob (Pilot Kurucu)',null,3,now,2,1,1,'user_admin',now,'user',1,now]);

  const projs = [
    ['proj_alpha','user_admin','AlphaProtocol','DeFi lending protokolü — testnet katılım.','alphaprotocol.demo','https://alphaprotocol.demo/join/{code}','Testnet üzerinde en az 1 işlem gerçekleştirmek.','demo',1,1,'approved','user_admin',now,null],
    ['proj_beta','user_admin','BetaChain','Layer-2 köprü altyapısı — erken erişim.','betachain.demo','https://betachain.demo/ref/{code}','Erken erişim formu doldurmak ve cüzdan bağlamak.','demo',1,1,'approved','user_admin',now,null],
    ['proj_gamma','user_founder','GammaDEX','Zincir üstü token takas platformu.','gammadex.demo','https://gammadex.demo/invite/{code}','İlk token takasını gerçekleştirmek.','demo',1,0,'approved','user_admin',now,null],
    ['proj_delta','user_founder','DeltaVault','Getiri optimizasyon kasası.','deltavault.demo','https://deltavault.demo/r/{code}','Kasa ön kaydı.','demo',1,1,'approved','user_admin',now,null],
    ['proj_epsilon','user_admin','EpsilonFi','Getiri çiftçiliği platformu — erken katılım.','epsilonfi.demo','https://epsilonfi.demo/r/{code}','Cüzdan bağlamak ve 1 test işlemi yapmak.','demo',1,1,'approved','user_admin',now,null],
    ['proj_pending','user_founder','ZetaStake','Likit staking protokolü.','zetastake.demo','https://zetastake.demo/join/{code}','Cüzdan bağlamak.','demo',1,1,'pending',null,null,null],
  ];
  for (const p of projs) {
    db.run(`INSERT OR IGNORE INTO projects(id,submitted_by,name,description,official_domain,
      referral_link_pattern,valid_participation_condition,validation_method,
      allows_free_participation,allows_paid_participation,status,approved_by,approved_at,
      rejection_reason,is_demo,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`,
      [...p, now]);
  }

  const bobLinks = [
    ['rl_bob_alpha','user_founder','proj_alpha','BOB-ALPHA-001','https://alphaprotocol.demo/join/BOB-ALPHA-001',0,0,1],
    ['rl_bob_beta','user_founder','proj_beta','BOB-BETA-001','https://betachain.demo/ref/BOB-BETA-001',0,0,1],
    ['rl_bob_gamma','user_founder','proj_gamma','BOB-GAMMA-001','https://gammadex.demo/invite/BOB-GAMMA-001',0,0,1],
    ['rl_bob_delta','user_founder','proj_delta','BOB-DELTA-001','https://deltavault.demo/r/BOB-DELTA-001',0,0,1],
    ['rl_bob_epsilon','user_founder','proj_epsilon','BOB-EPS-001','https://epsilonfi.demo/r/BOB-EPS-001',0,0,1],
  ];
  for (const l of bobLinks) {
    db.run(`INSERT OR IGNORE INTO referral_links(id,user_id,project_id,referral_code,full_link,
      slots_allocated,times_referred,queue_position,queued_at,active) VALUES(?,?,?,?,?,?,?,?,?,1)`,
      [...l, now]);
  }

  // Alice: 4 verified free participations, each on a DIFFERENT project
  const aliceParts = [
    ['part_alice_1','proj_alpha','rl_bob_alpha'],
    ['part_alice_2','proj_beta','rl_bob_beta'],
    ['part_alice_3','proj_gamma','rl_bob_gamma'],
    ['part_alice_4','proj_delta','rl_bob_delta'],
  ];
  for (const [id, projId, rlId] of aliceParts) {
    db.run(`INSERT OR IGNORE INTO participations(id,reservation_id,participant_id,referrer_id,
      project_id,referral_link_id,participation_type,order_id,submitted_proof,status,
      verified_by,verified_at,rejection_reason,disputed_at,dispute_note,is_demo,created_at)
      VALUES(?,?,?,?,?,?,'free',null,null,'verified','demo',?,null,null,null,1,?)`,
      [id, `res_${id}`, 'user_demo', 'user_founder', projId, rlId, now, now]);
  }

  db.run(`INSERT OR IGNORE INTO orders(id,project_id,buyer_id,package_size,price_per_referral,
    platform_fee_bps,total_cost,slots_used,status,tx_hash,onchain_confirmed,is_demo,created_at)
    VALUES('order_demo_1','proj_alpha','user_founder',10,1000000,5000,10000000,1,'active',null,0,1,?)`,
    [now]);

  console.log('[Carpan] Demo data seeded to SQLite');
}
