import type { Database } from 'bun:sqlite';

const tables = ['auth_nonces', 'wallet_login_challenges', 'email_login_links', 'google_oauth_states', 'x_oauth_states', 'sessions'] as const;

/** Keep unexpired used email links: they still count towards the delivery limit. */
export function cleanupAuthRecords(database: Database, now = new Date().toISOString(), batch = 1000) {
  const removed: Record<string, number> = {};
  const boundedBatch = Math.min(5000, Math.max(1, Math.floor(batch)));
  for (const table of tables) {
    removed[table] = database.run(`DELETE FROM ${table} WHERE rowid IN
      (SELECT rowid FROM ${table} WHERE expires_at<=? LIMIT ?)`, [now, boundedBatch]).changes;
  }
  return removed;
}

export function createAuthMaintenance(database: Database, intervalMs = 300_000) {
  for (const table of tables) database.run(`CREATE INDEX IF NOT EXISTS ${table}_expiry ON ${table}(expires_at)`);
  let lastRun = -Infinity;
  return (now = Date.now()) => {
    if (now - lastRun < intervalMs) return;
    cleanupAuthRecords(database, new Date(now).toISOString());
    lastRun = now;
  };
}
