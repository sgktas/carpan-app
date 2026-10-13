import { db, grantInitialFreeSlots, initializeReferralBatches, newId } from './sqliteDb.js';

export const REFERRAL_BATCH_SIZE = 5;
let initialized = false;

// Called after demo seed as well as during account creation. It only creates
// missing initial records; prior users, ledger rows and orders remain intact.
export function ensureReferralProgram(): void {
  if (initialized) return;
  // Demo accounts follow the same first-card rule while staying isolated.
  db.transaction(() => {
    const demoUsers = db.query('SELECT id FROM users WHERE is_demo=1').all() as { id: string }[];
    for (const user of demoUsers) grantInitialFreeSlots(user.id);
  }).immediate();
  initializeReferralBatches();
  initialized = true;
}

export function reconcileExistingContributions(): void {
  db.transaction(() => {
    const users = db.query('SELECT id,is_demo FROM users').all() as { id: string; is_demo: number }[];
    for (const user of users) grantEarnedBatches(user.id, !!user.is_demo);
  }).immediate();
}

export function contributionCount(userId: string, isDemo: boolean): number {
  const row = db.query(`SELECT COUNT(DISTINCT project_id) AS n FROM participations
    WHERE participant_id=? AND participation_type='free' AND status='verified' AND is_demo=?`)
    .get(userId, isDemo ? 1 : 0) as { n: number };
  return row.n;
}

export function grantEarnedBatches(userId: string, isDemo: boolean): void {
  const complete = contributionCount(userId, isDemo);
  const existing = db.query(`SELECT COUNT(*) AS n FROM referral_batches
    WHERE user_id=? AND source='contribution'`).get(userId) as { n: number };
  const now = new Date().toISOString();
  for (let cycle = existing.n + 1; cycle <= Math.floor(complete / REFERRAL_BATCH_SIZE); cycle++) {
    const id = newId('batch');
    const result = db.run(`INSERT OR IGNORE INTO referral_batches(id,user_id,project_id,source,
      source_reference,total_slots,remaining_slots,created_at,assigned_at)
      VALUES(?,?,NULL,'contribution',?,?,?, ?,NULL)`,
      [id, userId, `cycle-${cycle}`, REFERRAL_BATCH_SIZE, REFERRAL_BATCH_SIZE, now]);
    if (!result.changes) continue;
    db.run('UPDATE users SET free_slots=free_slots+? WHERE id=?', [REFERRAL_BATCH_SIZE, userId]);
    db.run(`INSERT INTO free_slots_ledger(id,user_id,delta,reason,reference_id,granted_by,created_at)
      VALUES(?,?,?,?,?,?,?)`,
      [newId('fsl'), userId, REFERRAL_BATCH_SIZE, 'contribution_batch', id, 'system', now]);
  }
}

export function availableForProject(userId: string, projectId: string): number {
  const batches = db.query(`SELECT COALESCE(SUM(remaining_slots),0) AS n FROM referral_batches
    WHERE user_id=? AND project_id=?`).get(userId, projectId) as { n: number };
  if (!batches.n) return 0;
  const reservations = db.query(`SELECT COUNT(*) AS n FROM reservations
    WHERE referrer_id=? AND project_id=? AND participation_type='free'
      AND status='active' AND expires_at>?`).get(userId, projectId, new Date().toISOString()) as { n: number };
  const pending = db.query(`SELECT COUNT(*) AS n FROM participations
    WHERE referrer_id=? AND project_id=? AND participation_type='free'
      AND status IN ('pending_verification','disputed')`).get(userId, projectId) as { n: number };
  return Math.max(0, batches.n - reservations.n - pending.n);
}

export function assignNextBatch(userId: string, projectId: string): boolean {
  const batch = db.query(`SELECT id FROM referral_batches
    WHERE user_id=? AND project_id IS NULL AND remaining_slots>0
    ORDER BY created_at,id LIMIT 1`).get(userId) as { id: string } | null;
  if (!batch) return false;
  db.run(`UPDATE referral_batches SET project_id=?,assigned_at=?
    WHERE id=? AND user_id=? AND project_id IS NULL`,
    [projectId, new Date().toISOString(), batch.id, userId]);
  return true;
}

export function referralStatus(userId: string, isDemo: boolean) {
  const slots = db.query(`SELECT COALESCE(SUM(remaining_slots),0) AS remaining,
    COALESCE(SUM(CASE WHEN project_id IS NULL THEN remaining_slots ELSE 0 END),0) AS unassigned
    FROM referral_batches WHERE user_id=?`).get(userId) as { remaining: number; unassigned: number };
  const complete = contributionCount(userId, isDemo);
  const earned = db.query(`SELECT COUNT(*) AS n FROM referral_batches WHERE user_id=? AND source='contribution'`)
    .get(userId) as { n: number };
  const projects = db.query(`SELECT DISTINCT project_id FROM referral_batches
    WHERE user_id=? AND project_id IS NOT NULL AND remaining_slots>0`)
    .all(userId) as { project_id: string }[];
  const available = slots.unassigned + projects.reduce((sum, project) =>
    sum + availableForProject(userId, project.project_id), 0);
  return {
    remainingSlots: slots.remaining,
    availableSlots: available,
    pendingSlots: slots.remaining - available,
    unassignedSlots: slots.unassigned,
    contributionCount: complete,
    progress: Math.min(REFERRAL_BATCH_SIZE, Math.max(0, complete - earned.n * REFERRAL_BATCH_SIZE)),
    required: REFERRAL_BATCH_SIZE,
    earnedBatches: earned.n,
  };
}

function seasonStart(period: 'week' | 'month' | 'all'): string | null {
  if (period === 'all') return null;
  // Turkey uses UTC+3 year-round. The displayed season boundaries are Istanbul time.
  const local = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const start = period === 'month'
    ? Date.UTC(year, month, 1, -3)
    : Date.UTC(year, month, day - ((local.getUTCDay() + 6) % 7), -3);
  return new Date(start).toISOString();
}

export function leaderboard(period: 'week' | 'month' | 'all', isDemo: boolean) {
  const from = seasonStart(period);
  const rows = db.query(`SELECT u.id, u.public_handle, u.public_name,
      COUNT(DISTINCT p.project_id) AS score
    FROM participations p JOIN users u ON u.id=p.participant_id
    WHERE p.participation_type='free' AND p.status='verified'
      AND p.is_demo=? AND u.is_demo=? AND (? IS NULL OR p.verified_at>=?)
    GROUP BY u.id ORDER BY score DESC, MIN(p.verified_at) ASC LIMIT 50`)
    .all(isDemo ? 1 : 0, isDemo ? 1 : 0, from, from) as
      { id: string; public_handle: string | null; public_name: string | null; score: number }[];
  return rows.map((row, index) => ({
    rank: index + 1,
    handle: row.public_handle || `uye_${row.id.slice(-8)}`,
    name: row.public_name || 'Carpan üyesi',
    score: row.score,
  }));
}
