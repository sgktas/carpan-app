import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { checkBackupRestore, createConsistentBackup, listBackups, pruneBackups } from '../deploy/backup-tools';
import { assessOperations, createOperationsReport, publishOperationsStatus, type MonitorFacts } from '../deploy/monitor';

function isolated(action: (folder: string) => void) {
  const folder = mkdtempSync(join(tmpdir(), 'carpan-operations-'));
  const target = resolve(folder); if (!target.startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe test cleanup');
  try { action(folder); } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

test('operation assessment detects API, index lag/staleness, missing backups and low disk independently', () => {
  const now = Date.parse('2026-10-09T00:00:00.000Z');
  const facts: MonitorFacts = { apiHealthy: true, head: 20_000, processed: 19_999,
    observedAt: new Date(now - 1000).toISOString(), backupAt: now - 3_600_000, restoreAt: now - 3_600_000, diskFreeRatio: 0.3 };
  expect(assessOperations(facts, now)).toEqual({ ok: true, issues: [], lag: 1 });
  expect(assessOperations({ ...facts, apiHealthy: false }, now).issues).toEqual(['api_unhealthy']);
  expect(assessOperations({ ...facts, processed: 18_000 }, now).issues).toEqual(['index_lag']);
  expect(assessOperations({ ...facts, observedAt: new Date(now - 301_000).toISOString() }, now).issues).toEqual(['index_head_stale']);
  expect(assessOperations({ ...facts, backupAt: null, restoreAt: null, diskFreeRatio: 0.1 }, now).issues).toEqual(['backup_stale', 'restore_check_stale', 'disk_space_low']);
  expect(assessOperations({ ...facts, head: null, processed: null }, now).issues).toContain('index_unavailable');
});

for (const failure of ['database-open', 'database-query', 'disk-read'] as const) {
  test(`monitor replaces old healthy status after ${failure} failure without exposing exception details`, () => isolated(folder => {
    const now = Date.parse('2026-10-11T12:00:00.000Z');
    const facts: MonitorFacts = { apiHealthy: true, head: 20_000, processed: 20_000,
      observedAt: new Date(now).toISOString(), backupAt: now, restoreAt: now, diskFreeRatio: 0.3 };
    publishOperationsStatus(folder, createOperationsReport(() => facts, now - 60_000));
    expect(JSON.parse(readFileSync(join(folder, 'operations-status.json'), 'utf8')).ok).toBe(true);
    const privatePath = join(folder, 'private-provider-details');
    const failed = createOperationsReport(() => {
      if (failure === 'database-open') new Database(join(privatePath, 'missing.sqlite'), { readonly: true });
      else if (failure === 'database-query') {
        const database = new Database(':memory:');
        try { database.query(`SELECT * FROM private_provider_details`).get(); }
        finally { database.close(); }
      } else statfsSync(privatePath);
      return facts;
    }, now);
    publishOperationsStatus(folder, failed);
    const contents = readFileSync(join(folder, 'operations-status.json'), 'utf8');
    expect(JSON.parse(contents)).toEqual({ checkedAt: new Date(now).toISOString(), ok: false,
      issues: ['monitor_read_failed'], lag: null, offsiteBackup: 'not_configured' });
    expect(contents).not.toContain(folder);
    expect(contents).not.toContain('private-provider-details');
    expect(contents).not.toContain('private_provider_details');
    expect(existsSync(join(folder, 'operations-status.json.tmp'))).toBe(false);
  }));
}

test('snapshot restores with schema/write proof while preserving the original database and backup', () => isolated(folder => {
  const source = join(folder, 'live-fixture.sqlite'), database = new Database(source);
  database.exec('PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT); CREATE TABLE sessions(token TEXT); CREATE TABLE arc_indexer_state(chain_id INTEGER);');
  database.run('INSERT INTO users VALUES(?)', ['fixture']);
  const backup = createConsistentBackup(source, join(folder, 'backups'), new Date('2026-10-09T00:00:00.000Z'));
  const original = readFileSync(backup);
  expect(checkBackupRestore(backup, folder).ok).toBe(true);
  expect(readFileSync(backup)).toEqual(original);
  expect(database.query('SELECT id FROM users').all()).toEqual([{ id: 'fixture' }]);
  expect(database.query("SELECT name FROM sqlite_master WHERE name='__carpan_restore_probe'").get()).toBeNull();
  expect(readdirSync(folder).some(name => name.startsWith('.restore-check-'))).toBe(false);
  database.close();
}));

test('retention deletes only older named snapshots and always keeps seven plus unrelated files', () => isolated(folder => {
  for (let day = 1; day <= 9; day++) writeFileSync(join(folder, `refbridge-2026-01-${String(day).padStart(2, '0')}T00-00-00-000Z.db`), 'fixture');
  const unrelated = join(folder, 'refbridge.db'); writeFileSync(unrelated, 'live fixture');
  const removed = pruneBackups(folder, 30, 7, Date.parse('2026-10-09T00:00:00.000Z'));
  expect(removed).toHaveLength(2); expect(listBackups(folder)).toHaveLength(7);
  expect(existsSync(unrelated)).toBe(true); expect(readFileSync(unrelated, 'utf8')).toBe('live fixture');
  expect(() => pruneBackups(folder, 0)).toThrow();
}));

test('corrupt backup cannot publish a successful restore check and scratch is removed', () => isolated(folder => {
  const corrupt = join(folder, 'refbridge-2026-10-09T00-00-00-000Z.db'); writeFileSync(corrupt, 'not a database');
  expect(() => checkBackupRestore(corrupt, folder)).toThrow();
  expect(readdirSync(folder).some(name => name.startsWith('.restore-check-'))).toBe(false);
  expect(readFileSync(corrupt, 'utf8')).toBe('not a database');
}));
