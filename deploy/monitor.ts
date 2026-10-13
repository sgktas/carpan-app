import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, renameSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listBackups, productionPaths } from './backup-tools';

export type MonitorFacts = { apiHealthy: boolean; head: number | null; processed: number | null;
  observedAt: string | null; backupAt: number | null; restoreAt: number | null; diskFreeRatio: number };
export function assessOperations(facts: MonitorFacts, now = Date.now()) {
  const issues: string[] = [];
  if (!facts.apiHealthy) issues.push('api_unhealthy');
  const validIndex = Number.isSafeInteger(facts.head) && Number.isSafeInteger(facts.processed) && (facts.head ?? -1) >= 0 && (facts.processed ?? -1) >= 0;
  if (!validIndex) issues.push('index_unavailable');
  else if (Math.max(0, facts.head! - facts.processed!) > 1000) issues.push('index_lag');
  const observed = facts.observedAt ? Date.parse(facts.observedAt) : NaN;
  if (!Number.isFinite(observed) || now - observed > 300_000 || observed > now + 60_000) issues.push('index_head_stale');
  if (facts.backupAt === null || now - facts.backupAt > 30 * 3_600_000 || facts.backupAt > now + 60_000) issues.push('backup_stale');
  if (facts.restoreAt === null || now - facts.restoreAt > 72 * 3_600_000 || facts.restoreAt > now + 60_000) issues.push('restore_check_stale');
  if (!Number.isFinite(facts.diskFreeRatio) || facts.diskFreeRatio < 0.15) issues.push('disk_space_low');
  return { ok: issues.length === 0, issues, lag: validIndex ? Math.max(0, facts.head! - facts.processed!) : null };
}

/** Publish a fresh failure even when a source cannot be read; never serialize its exception. */
export function createOperationsReport(readFacts: () => MonitorFacts, now = Date.now()) {
  let assessment: ReturnType<typeof assessOperations>;
  try { assessment = assessOperations(readFacts(), now); }
  catch { assessment = { ok: false, issues: ['monitor_read_failed'], lag: null }; }
  return { checkedAt: new Date(now).toISOString(), ...assessment, offsiteBackup: 'not_configured' };
}

export function publishOperationsStatus(root: string, report: ReturnType<typeof createOperationsReport>) {
  const marker = join(root, 'operations-status.json');
  writeFileSync(marker + '.tmp', JSON.stringify(report), { mode: 0o600 });
  renameSync(marker + '.tmp', marker);
}

if (import.meta.main) {
  const now = Date.now();
  let apiHealthy = false;
  try {
    const response = await fetch(`http://127.0.0.1:${Number(process.env.PORT || 4301)}/health`, { signal: AbortSignal.timeout(5000) });
    const body = await response.json() as { ok?: boolean; demoMode?: boolean };
    apiHealthy = response.ok && body.ok === true && body.demoMode === false;
  } catch { /* Refused or timed-out API is reported below. */ }
  const report = createOperationsReport(() => {
    const paths = productionPaths();
    const database = new Database(paths.database, { readonly: true });
    let state: { last_observed_head: number | null; last_processed_block: number; head_observed_at: string | null } | null;
    try { state = database.query('SELECT last_observed_head,last_processed_block,head_observed_at FROM arc_indexer_state WHERE chain_id=5042').get() as typeof state; }
    finally { database.close(); }
    const latest = existsSync(paths.backups) ? listBackups(paths.backups)[0] : undefined;
    let restoreAt: number | null = null;
    try {
      const marker = JSON.parse(readFileSync(join(paths.root, 'restore-check.json'), 'utf8'));
      if (marker.ok === true && typeof marker.checkedAt === 'string' && Number.isFinite(Date.parse(marker.checkedAt))) restoreAt = Date.parse(marker.checkedAt);
    } catch { /* Missing/invalid marker is reported as stale. */ }
    const disk = statfsSync(paths.root);
    return { apiHealthy, head: state?.last_observed_head ?? null, processed: state?.last_processed_block ?? null,
      observedAt: state?.head_observed_at ?? null, backupAt: latest?.time ?? null, restoreAt,
      diskFreeRatio: disk.blocks > 0 ? disk.bavail / disk.blocks : NaN };
  }, now);
  publishOperationsStatus('/opt/carpan/shared', report);
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}
