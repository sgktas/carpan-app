import type {Database} from 'bun:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {FINANCE_CATEGORIES, type FinanceCategory} from '../src/arc-finance';
import {ARC_USDC} from '../src/arc-wallet';
import type {FinanceMovement, FinanceMovementScan, FinanceMovementCoverage} from '../src/finance-movements';
import {mergeFinanceDiscovery, validFinanceDiscovery, type FinanceMovementDiscovery} from '../src/finance-discovery';
import {FINANCE_SYSTEM_EMITTER, FINANCE_MOVEMENT_BLOCK_WINDOW, FINANCE_MOVEMENT_EVENT_LIMIT, FINANCE_MOVEMENT_TRANSACTION_LIMIT} from './financeMovements';
import {FinanceOrganizationError, getFinanceBusinessWallet, getFinanceCounterparty, requireFinanceOrganizationAccess} from './financeOrganizations';

export type FinanceMovementDecision = {
  movementId: string; category: FinanceCategory | 'other'; reference: string; counterpartyId: string | null;
  status: 'new' | 'review' | 'approved'; version: number; updatedAt: string | null; updatedBy: string | null;
};
export type FinanceOperationAudit = {id: string; organizationId: string; walletId: string; movementId: string; actorId: string; action: 'decision_changed' | 'export_generated'; before: unknown; after: unknown; recordedAt: string};
export type FinanceExportPayload = {
  schema: 'carpan.finance.operations.v1'; organizationId: string; walletId: string; wallet: string; chainId: 5042; asset: 'USDC'; decimals: 18;
  generatedAt: string; readyForPosting: false; accountingStatus: 'not_submitted'; coverage: FinanceMovementScan['coverage']; loadedRanges: FinanceMovementCoverage[];
  records: {movement: FinanceMovement; decision: FinanceMovementDecision; counterparty: ReturnType<typeof getFinanceCounterparty> | null}[];
  fees: FinanceMovementScan['fees'];
};
export type FinanceExportBatchMetadata = {
  id: string; organizationId: string; walletId: string; wallet: string; createdAt: string; createdBy: string;
  idempotencyKey: string; contentHash: string; status: 'generated'; accountingStatus: 'not_submitted'; movementCount: number;
};
export type FinanceExportBatch = FinanceExportBatchMetadata & {payload: FinanceExportPayload};
export type FinanceOperationState = {scan: FinanceMovementScan | null; loadedRanges: FinanceMovementCoverage[]; decisions: Record<string, FinanceMovementDecision>; exportBatches: FinanceExportBatchMetadata[]};
type DecisionRow = {movement_id: string; category: FinanceMovementDecision['category']; reference: string; counterparty_id: string | null; status: FinanceMovementDecision['status']; version: number; updated_at: string; updated_by: string; evidence_hash: string};
type BatchRow = {id: string; organization_id: string; wallet_id: string; wallet: string; created_at: string; created_by: string; idempotency_key: string; content_hash: string; movement_count: number; request_json: string; payload_json: string};
const fail = (code: FinanceOrganizationError['code'], message: string, status = 400): never => {throw new FinanceOrganizationError(code, message, status);};
const hashPattern = /^0x[0-9a-f]{64}$/, addressPattern = /^0x[0-9a-f]{40}$/, rawPattern = /^(0|[1-9][0-9]{0,77})$/, zero = '0x' + '0'.repeat(40), maxUint256 = (1n << 256n) - 1n;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const proofDigest = (movement: FinanceMovement) => digest({chainId: movement.chainId, hash: movement.hash, logIndex: movement.logIndex, block: movement.block, blockHash: movement.blockHash, timestamp: movement.timestamp, from: movement.from, to: movement.to, raw18: movement.raw18});

export function initFinanceOperationsStore(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS finance_operation_snapshots(
    organization_id TEXT NOT NULL,wallet_id TEXT NOT NULL,scan_json TEXT NOT NULL,loaded_ranges_json TEXT NOT NULL DEFAULT '[]',last_input_hash TEXT NOT NULL DEFAULT '',fetched_at TEXT NOT NULL,to_block TEXT NOT NULL,
    PRIMARY KEY(organization_id,wallet_id),FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(wallet_id) REFERENCES finance_business_wallets(id))`);
  if (!(db.query('PRAGMA table_info(finance_operation_snapshots)').all() as {name: string}[]).some(column => column.name === 'loaded_ranges_json')) db.run("ALTER TABLE finance_operation_snapshots ADD COLUMN loaded_ranges_json TEXT NOT NULL DEFAULT '[]'");
  if (!(db.query('PRAGMA table_info(finance_operation_snapshots)').all() as {name: string}[]).some(column => column.name === 'last_input_hash')) db.run("ALTER TABLE finance_operation_snapshots ADD COLUMN last_input_hash TEXT NOT NULL DEFAULT ''");
  db.run(`CREATE TABLE IF NOT EXISTS finance_operation_decisions(
    organization_id TEXT NOT NULL,wallet_id TEXT NOT NULL,movement_id TEXT NOT NULL,category TEXT NOT NULL,reference TEXT NOT NULL,counterparty_id TEXT,
    status TEXT NOT NULL CHECK(status IN ('new','review','approved')),version INTEGER NOT NULL CHECK(version>0),updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,evidence_hash TEXT NOT NULL,
    PRIMARY KEY(organization_id,wallet_id,movement_id),FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(wallet_id) REFERENCES finance_business_wallets(id),FOREIGN KEY(counterparty_id) REFERENCES finance_counterparties(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_operation_audit(
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,wallet_id TEXT NOT NULL,movement_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,
    before_json TEXT,after_json TEXT,recorded_at TEXT NOT NULL,FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(wallet_id) REFERENCES finance_business_wallets(id))`);
  db.run('CREATE INDEX IF NOT EXISTS finance_operation_audit_scope ON finance_operation_audit(organization_id,wallet_id,movement_id,recorded_at)');
  db.run(`CREATE TABLE IF NOT EXISTS finance_export_batches(
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,wallet_id TEXT NOT NULL,wallet TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_json TEXT NOT NULL,payload_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,movement_count INTEGER NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,
    UNIQUE(organization_id,wallet_id,idempotency_key),FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(wallet_id) REFERENCES finance_business_wallets(id))`);
  for (const table of ['finance_operation_audit', 'finance_export_batches']) {
    db.run(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Finance evidence history is immutable'); END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Finance evidence history is immutable'); END`);
  }
}
function scope(db: Database, userId: string, organizationId: string, walletId: string, write = false) {
  requireFinanceOrganizationAccess(db, userId, organizationId, write ? 'write' : 'read');
  const wallet = getFinanceBusinessWallet(db, userId, organizationId, walletId);
  if (write && wallet.disabledAt) return fail('conflict', 'This business wallet is disabled.', 409);
  return wallet;
}
function finiteTime(value: unknown): value is string {return typeof value === 'string' && value.length <= 32 && Number.isFinite(Date.parse(value));}
function exactRaw(value: unknown, positive = false): value is string {return typeof value === 'string' && rawPattern.test(value) && BigInt(value) <= maxUint256 && (!positive || BigInt(value) > 0n);}
function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;}
function readScan(db: Database, organizationId: string, walletId: string): FinanceMovementScan | null {
  const row = db.query('SELECT scan_json FROM finance_operation_snapshots WHERE organization_id=? AND wallet_id=?').get(organizationId, walletId) as {scan_json: string} | null;
  return row ? JSON.parse(row.scan_json) as FinanceMovementScan : null;
}
function readRanges(db: Database, organizationId: string, walletId: string): FinanceMovementCoverage[] {
  const row = db.query('SELECT loaded_ranges_json FROM finance_operation_snapshots WHERE organization_id=? AND wallet_id=?').get(organizationId, walletId) as {loaded_ranges_json: string} | null;
  return row ? JSON.parse(row.loaded_ranges_json) as FinanceMovementCoverage[] : [];
}
function decision(row: DecisionRow | null, movementId: string): FinanceMovementDecision {
  return row ? {movementId: row.movement_id, category: row.category, reference: row.reference, counterpartyId: row.counterparty_id, status: row.status, version: row.version, updatedAt: row.updated_at, updatedBy: row.updated_by}
    : {movementId, category: 'review', reference: '', counterpartyId: null, status: 'new', version: 0, updatedAt: null, updatedBy: null};
}
function decisionRow(db: Database, organizationId: string, walletId: string, id: string): DecisionRow | null {
  return db.query('SELECT * FROM finance_operation_decisions WHERE organization_id=? AND wallet_id=? AND movement_id=?').get(organizationId, walletId, id) as DecisionRow | null;
}
function batchMetadata(row: BatchRow): FinanceExportBatchMetadata {return {id: row.id, organizationId: row.organization_id, walletId: row.wallet_id, wallet: row.wallet, createdAt: row.created_at, createdBy: row.created_by, idempotencyKey: row.idempotency_key, contentHash: row.content_hash, status: 'generated', accountingStatus: 'not_submitted', movementCount: row.movement_count};}
function audit(db: Database, userId: string, organizationId: string, walletId: string, movementId: string, action: FinanceOperationAudit['action'], before: unknown, after: unknown) {
  db.run('INSERT INTO finance_operation_audit(id,organization_id,wallet_id,movement_id,actor_id,action,before_json,after_json,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [randomUUID(), organizationId, walletId, movementId, userId, action, before === null ? null : JSON.stringify(before), JSON.stringify(after), new Date().toISOString()]);
}
function validateScan(scan: FinanceMovementScan, wallet: string): void {
  if (Array.isArray(scan?.movements)) for (const movement of scan.movements) {
    if (!movement) continue;
    if (movement.discovery !== undefined && (!Array.isArray(movement.discovery) || movement.discovery.length > 8 || movement.discovery.some(row => !validFinanceDiscovery(row)))) return fail('invalid_input', 'Invalid Finance discovery provenance.');
    if (movement.verifiedAt !== undefined && !finiteTime(movement.verifiedAt)) return fail('invalid_input', 'Invalid Finance verification time.');
  }
  if (!scan || scan.wallet !== wallet || !Array.isArray(scan.movements) || scan.movements.length > FINANCE_MOVEMENT_EVENT_LIMIT || !Array.isArray(scan.fees) || scan.fees.length > FINANCE_MOVEMENT_TRANSACTION_LIMIT || !Array.isArray(scan.unmappedAliases) || scan.unmappedAliases.length > 5000 || !Array.isArray(scan.warnings) || scan.warnings.some(warning => typeof warning !== 'string' || warning.length > 500)) return fail('invalid_input', 'Invalid canonical Finance scan.');
  const c = scan.coverage;
  if (!c || c.wallet !== wallet || !exactRaw(c.fromBlock) || !exactRaw(c.toBlock) || BigInt(c.fromBlock) > BigInt(c.toBlock) || BigInt(c.toBlock) - BigInt(c.fromBlock) >= BigInt(FINANCE_MOVEMENT_BLOCK_WINDOW) || !hashPattern.test(c.toBlockHash) || !finiteTime(c.fetchedAt)
    || !integer(c.checkedTransactions, FINANCE_MOVEMENT_TRANSACTION_LIMIT) || !integer(c.candidateTransactions) || !integer(c.failedTransactions, c.checkedTransactions) || c.checkedTransactions > c.candidateTransactions || (c.candidateTransactions > 0 && c.checkedTransactions === c.failedTransactions) || scan.fees.length !== c.checkedTransactions - c.failedTransactions || typeof c.truncated !== 'boolean' || typeof c.complete !== 'boolean'
    || !['bounded_usdc_transfers', 'receipt_import'].includes(c.scope) || (c.scope === 'bounded_usdc_transfers' && c.complete !== (!c.truncated && c.failedTransactions === 0 && c.checkedTransactions === c.candidateTransactions))
    || (c.scope === 'receipt_import' && (c.complete !== false || c.fromBlock !== c.toBlock || c.checkedTransactions !== 1 || c.candidateTransactions !== 1 || c.failedTransactions !== 0 || c.truncated !== false || scan.fees.length !== 1))
    || c.blockWindow !== FINANCE_MOVEMENT_BLOCK_WINDOW || c.transactionLimit !== FINANCE_MOVEMENT_TRANSACTION_LIMIT || c.eventLimit !== FINANCE_MOVEMENT_EVENT_LIMIT || c.includesGas !== true || c.includesGasOnlyTransactions !== false) return fail('invalid_input', 'Invalid Finance scan coverage.');
  const ids = new Set<string>(), fees = new Map<string, FinanceMovementScan['fees'][number]>();
  for (const fee of scan.fees) {
    if (!fee || !hashPattern.test(fee.hash) || fee.id !== `5042:${fee.hash}:gas` || fee.chainId !== 5042 || fee.asset !== 'USDC' || fee.decimals !== 18 || fee.source !== 'receipt' || !['success', 'reverted'].includes(fee.status) || !addressPattern.test(fee.gasPayer) || fee.gasPayer === zero || !exactRaw(fee.block) || BigInt(fee.block) < BigInt(c.fromBlock) || BigInt(fee.block) > BigInt(c.toBlock) || !hashPattern.test(fee.blockHash) || !finiteTime(fee.timestamp) || !exactRaw(fee.gasUsed) || !exactRaw(fee.effectiveGasPrice) || !exactRaw(fee.raw18) || BigInt(fee.raw18) !== BigInt(fee.gasUsed) * BigInt(fee.effectiveGasPrice) || fees.has(fee.hash)) return fail('invalid_input', 'Invalid Finance transaction fee.');
    fees.set(fee.hash, fee);
  }
  const aliases = new Set<string>();
  for (const movement of scan.movements) {
    const fee = fees.get(movement?.hash);
    if (!movement || movement.chainId !== 5042 || movement.wallet !== wallet || !hashPattern.test(movement.hash) || !integer(movement.logIndex) || movement.id !== `5042:${movement.hash}:${movement.logIndex}` || ids.has(movement.id) || movement.token !== ARC_USDC || movement.asset !== 'USDC' || movement.decimals !== 18 || movement.emitter !== FINANCE_SYSTEM_EMITTER || movement.source !== 'arc_system_events' || !exactRaw(movement.raw18, true) || !addressPattern.test(movement.from) || !addressPattern.test(movement.to) || movement.from === movement.to || (movement.from !== wallet && movement.to !== wallet) || movement.direction !== (movement.from === zero ? 'mint' : movement.to === zero ? 'burn' : movement.to === wallet ? 'in' : 'out') || !['native', 'erc20', 'ambiguous'].includes(movement.interface) || !Array.isArray(movement.aliases) || movement.aliases.length > 100 || !fee || fee.status !== 'success' || movement.block !== fee.block || movement.blockHash !== fee.blockHash || movement.timestamp !== fee.timestamp) return fail('invalid_input', 'Invalid canonical Finance movement.');
    ids.add(movement.id);
    for (const alias of movement.aliases) {
      if (!alias || alias.hash !== movement.hash || !integer(alias.logIndex) || alias.id !== `5042:${alias.hash}:${alias.logIndex}:${ARC_USDC}` || alias.emitter !== ARC_USDC || alias.decimals !== 6 || !exactRaw(alias.raw6, true) || BigInt(alias.raw6) * 1000000000000n !== BigInt(movement.raw18) || !['matched', 'ambiguous'].includes(alias.mappingStatus) || aliases.has(alias.id)) return fail('invalid_input', 'Invalid or repeated Finance source alias.');
      aliases.add(alias.id);
    }
  }
  for (const alias of scan.unmappedAliases) {
    if (!alias || !hashPattern.test(alias.hash) || !integer(alias.logIndex) || alias.id !== `5042:${alias.hash}:${alias.logIndex}:${ARC_USDC}` || alias.emitter !== ARC_USDC || alias.decimals !== 6 || !exactRaw(alias.raw6, true) || alias.mappingStatus !== 'unmapped' || aliases.has(alias.id) || !fees.has(alias.hash)) return fail('invalid_input', 'Invalid unmapped Finance source alias.');
    aliases.add(alias.id);
  }
}

export function readFinanceOperationState(db: Database, userId: string, organizationId: string, walletId: string): FinanceOperationState {
  scope(db, userId, organizationId, walletId);
  const scan = readScan(db, organizationId, walletId), decisions: Record<string, FinanceMovementDecision> = {};
  for (const movement of scan?.movements || []) decisions[movement.id] = decision(decisionRow(db, organizationId, walletId, movement.id), movement.id);
  const rows = db.query('SELECT * FROM finance_export_batches WHERE organization_id=? AND wallet_id=? ORDER BY created_at DESC,id DESC LIMIT 50').all(organizationId, walletId) as BatchRow[];
  return {scan, loadedRanges: readRanges(db, organizationId, walletId), decisions, exportBatches: rows.map(batchMetadata)};
}

/** Receives evidence from the server's canonical scanner, never a public request body. */
export function saveFinanceOperationScan(db: Database, userId: string, organizationId: string, walletId: string, scan: FinanceMovementScan): FinanceOperationState {
  const wallet = scope(db, userId, organizationId, walletId, true); validateScan(scan, wallet.address);
  return db.transaction(() => {
    const previous = readScan(db, organizationId, walletId);
    const last = db.query('SELECT last_input_hash FROM finance_operation_snapshots WHERE organization_id=? AND wallet_id=?').get(organizationId, walletId) as {last_input_hash: string} | null;
    if (last?.last_input_hash === digest(scan)) return readFinanceOperationState(db, userId, organizationId, walletId);
    if (previous) {
      if (JSON.stringify(previous) === JSON.stringify(scan)) return readFinanceOperationState(db, userId, organizationId, walletId);
      if (Date.parse(scan.coverage.fetchedAt) <= Date.parse(previous.coverage.fetchedAt)) return fail('conflict', 'A newer Finance scan is already stored. Refresh this workspace.', 409);
    }
    const prior = new Map((previous?.movements || []).map(movement => [movement.id, movement]));
    for (const movement of scan.movements) {
      const before = prior.get(movement.id), saved = decisionRow(db, organizationId, walletId, movement.id);
      if ((before && proofDigest(before) !== proofDigest(movement)) || (saved && saved.evidence_hash !== proofDigest(movement))) return fail('conflict', 'Canonical movement evidence changed. Review the chain source before replacing the snapshot.', 409);
    }
    const movements = new Map((previous?.movements || []).map(movement => [movement.id, movement]));
    for (const movement of scan.movements) {
      const before = movements.get(movement.id);
      const discovery: FinanceMovementDiscovery[] = movement.discovery?.length ? movement.discovery : [{source: 'arc_rpc', endpoint: scan.coverage.scope === 'receipt_import' ? 'transaction_receipt' : 'transfer_logs', fetchedAt: scan.coverage.fetchedAt, cached: false, stale: false}];
      movements.set(movement.id, {...movement, discovery: mergeFinanceDiscovery(before?.discovery, discovery), verifiedAt: scan.coverage.fetchedAt});
    }
    const fees = new Map((previous?.fees || []).map(fee => [fee.hash, fee]));
    for (const fee of scan.fees) {const priorFee = fees.get(fee.hash); if (priorFee && digest(priorFee) !== digest(fee)) return fail('conflict', 'Canonical receipt fee evidence changed.', 409); fees.set(fee.hash, fee);}
    const aliases = new Map((previous?.unmappedAliases || []).map(alias => [alias.id, alias]));
    for (const alias of scan.unmappedAliases) aliases.set(alias.id, alias);
    for (const movement of movements.values()) for (const alias of movement.aliases) aliases.delete(alias.id);
    const ranges = readRanges(db, organizationId, walletId), rangeKey = (coverage: FinanceMovementCoverage) => `${coverage.scope}:${coverage.fromBlock}:${coverage.toBlock}:${coverage.toBlockHash}`;
    const existingRange = ranges.findIndex(coverage => rangeKey(coverage) === rangeKey(scan.coverage));
    if (existingRange < 0) ranges.push(scan.coverage); else ranges[existingRange] = scan.coverage;
    if (movements.size > 5000 || fees.size > 5000 || aliases.size > 5000 || ranges.length > 1000) return fail('limit_reached', 'Finance evidence storage limit reached. Existing records were retained; contact support before importing more history.', 409);
    const merged: FinanceMovementScan = {...scan, movements: [...movements.values()].sort((a, b) => BigInt(a.block) > BigInt(b.block) ? -1 : BigInt(a.block) < BigInt(b.block) ? 1 : b.logIndex - a.logIndex || a.hash.localeCompare(b.hash)), fees: [...fees.values()], unmappedAliases: [...aliases.values()], warnings: [...new Set([...(previous?.warnings || []), ...scan.warnings])]};
    db.run('INSERT INTO finance_operation_snapshots(organization_id,wallet_id,scan_json,loaded_ranges_json,last_input_hash,fetched_at,to_block) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,wallet_id) DO UPDATE SET scan_json=excluded.scan_json,loaded_ranges_json=excluded.loaded_ranges_json,last_input_hash=excluded.last_input_hash,fetched_at=excluded.fetched_at,to_block=excluded.to_block', [organizationId, walletId, JSON.stringify(merged), JSON.stringify(ranges), digest(scan), scan.coverage.fetchedAt, scan.coverage.toBlock]);
    return readFinanceOperationState(db, userId, organizationId, walletId);
  })();
}
function movementFromSnapshot(db: Database, organizationId: string, walletId: string, id: unknown): FinanceMovement {
  if (typeof id !== 'string' || !/^5042:0x[0-9a-f]{64}:(0|[1-9][0-9]{0,15})$/.test(id)) return fail('invalid_input', 'Invalid canonical Finance movement identity.');
  const movement = readScan(db, organizationId, walletId)?.movements.find(candidate => candidate.id === id);
  if (!movement) return fail('not_found', 'Movement not found in this workspace snapshot.', 404);
  return movement;
}
function updateDecision(db: Database, userId: string, organizationId: string, walletId: string, movementId: string, body: unknown): FinanceMovementDecision {
  const movement = movementFromSnapshot(db, organizationId, walletId, movementId), previousRow = decisionRow(db, organizationId, walletId, movementId), previous = decision(previousRow, movementId);
  const input = body as {category?: unknown; reference?: unknown; counterpartyId?: unknown; status?: unknown; expectedVersion?: unknown} | null;
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.category !== 'string' || (!Object.hasOwn(FINANCE_CATEGORIES, input.category) && input.category !== 'other') || typeof input.reference !== 'string' || input.reference.length > 120 || /[\x00-\x1f\x7f]/.test(input.reference) || typeof input.status !== 'string' || !['new', 'review', 'approved'].includes(input.status) || !integer(input.expectedVersion)) return fail('invalid_input', 'Invalid Finance movement decision.');
  if (input.expectedVersion !== previous.version) return fail('conflict', 'This movement was changed by another request. Reload before saving.', 409);
  const counterpartyId = input.counterpartyId === undefined ? previous.counterpartyId : input.counterpartyId === null || input.counterpartyId === '' ? null : input.counterpartyId;
  if (counterpartyId !== null && typeof counterpartyId !== 'string') return fail('invalid_input', 'Invalid Finance counterparty.');
  const counterparty = counterpartyId ? getFinanceCounterparty(db, userId, organizationId, counterpartyId) : null;
  if (counterparty?.disabledAt) return fail('conflict', 'This counterparty is disabled.', 409);
  const category = input.category as FinanceMovementDecision['category'], reference = input.reference.trim(), status = input.status as FinanceMovementDecision['status'];
  if (status === 'approved' && (category === 'review' || (!counterparty && !reference))) return fail('invalid_input', 'Choose an operation type and a counterparty or reference before approval.');
  if (status === 'approved' && ['mint', 'burn'].includes(movement.direction) && category !== 'internal') return fail('invalid_input', 'Mint/burn evidence can only be approved as an internal movement after review.');
  if (previousRow && previousRow.evidence_hash !== proofDigest(movement)) return fail('conflict', 'Stored movement evidence changed. Refresh before review.', 409);
  if (previous.category === category && previous.reference === reference && previous.counterpartyId === counterpartyId && previous.status === status) return previous;
  const next: FinanceMovementDecision = {movementId, category, reference, counterpartyId, status, version: previous.version + 1, updatedAt: new Date().toISOString(), updatedBy: userId};
  db.run('INSERT INTO finance_operation_decisions(organization_id,wallet_id,movement_id,category,reference,counterparty_id,status,version,updated_at,updated_by,evidence_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,wallet_id,movement_id) DO UPDATE SET category=excluded.category,reference=excluded.reference,counterparty_id=excluded.counterparty_id,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by,evidence_hash=excluded.evidence_hash', [organizationId, walletId, movementId, category, reference, counterpartyId, status, next.version, next.updatedAt!, userId, proofDigest(movement)]);
  audit(db, userId, organizationId, walletId, movementId, 'decision_changed', previous, next); return next;
}
export function updateFinanceMovementDecision(db: Database, userId: string, organizationId: string, walletId: string, movementId: string, body: unknown): FinanceMovementDecision {
  scope(db, userId, organizationId, walletId, true);
  return db.transaction(() => updateDecision(db, userId, organizationId, walletId, movementId, body))();
}
export function bulkFinanceMovementDecisions(db: Database, userId: string, organizationId: string, walletId: string, body: unknown): FinanceMovementDecision[] {
  scope(db, userId, organizationId, walletId, true);
  const input = body as {items?: unknown; status?: unknown} | null;
  if (!input || !Array.isArray(input.items) || !input.items.length || input.items.length > 100 || typeof input.status !== 'string' || !['approved', 'review'].includes(input.status)) return fail('invalid_input', 'Invalid bulk Finance decision.');
  const items = input.items as {id?: unknown; expectedVersion?: unknown}[];
  if (new Set(items.map(item => item?.id)).size !== items.length) return fail('invalid_input', 'Repeated Finance movement in bulk request.');
  return db.transaction(() => items.map(item => {
    const movement = movementFromSnapshot(db, organizationId, walletId, item?.id), previous = decision(decisionRow(db, organizationId, walletId, movement.id), movement.id);
    return updateDecision(db, userId, organizationId, walletId, movement.id, {...previous, status: input.status, expectedVersion: item.expectedVersion});
  }))();
}
export function readFinanceMovementAudit(db: Database, userId: string, organizationId: string, walletId: string, movementId: string, before: unknown = ''): {items: FinanceOperationAudit[]; nextCursor: string | null} {
  scope(db, userId, organizationId, walletId); movementFromSnapshot(db, organizationId, walletId, movementId);
  if (typeof before !== 'string' || before && !/^[1-9][0-9]{0,14}$/.test(before)) return fail('invalid_input', 'Invalid Finance decision history cursor.');
  type Row = {cursor: number; id: string; organization_id: string; wallet_id: string; movement_id: string; actor_id: string; action: FinanceOperationAudit['action']; before_json: string | null; after_json: string; recorded_at: string};
  const rows = db.query('SELECT rowid AS cursor,* FROM finance_operation_audit WHERE organization_id=? AND wallet_id=? AND movement_id=? AND rowid<? ORDER BY rowid DESC LIMIT 51').all(organizationId, walletId, movementId, before ? Number(before) : Number.MAX_SAFE_INTEGER) as Row[];
  return {items: rows.slice(0, 50).map(row => ({id: row.id, organizationId: row.organization_id, walletId: row.wallet_id, movementId: row.movement_id, actorId: row.actor_id, action: row.action, before: row.before_json ? JSON.parse(row.before_json) : null, after: JSON.parse(row.after_json), recordedAt: row.recorded_at})), nextCursor: rows.length > 50 ? String(rows[49].cursor) : null};
}
export function readFinanceExportBatch(db: Database, userId: string, organizationId: string, walletId: string, batchId: string): FinanceExportBatch {
  scope(db, userId, organizationId, walletId);
  const row = db.query('SELECT * FROM finance_export_batches WHERE organization_id=? AND wallet_id=? AND id=?').get(organizationId, walletId, batchId) as BatchRow | null;
  if (!row) return fail('not_found', 'Finance export batch not found.', 404);
  return {...batchMetadata(row), payload: JSON.parse(row.payload_json) as FinanceExportPayload};
}
export function createFinanceExportBatch(db: Database, userId: string, organizationId: string, walletId: string, body: unknown): FinanceExportBatch {
  const wallet = scope(db, userId, organizationId, walletId, true), input = body as {ids?: unknown; idempotencyKey?: unknown; expectedVersions?: unknown} | null;
  if (!input || !Array.isArray(input.ids) || !input.ids.length || input.ids.length > 100 || input.ids.some(id => typeof id !== 'string') || new Set(input.ids).size !== input.ids.length || typeof input.idempotencyKey !== 'string' || !/^[a-zA-Z0-9._:-]{8,128}$/.test(input.idempotencyKey)) return fail('invalid_input', 'Choose approved Finance movements and a valid export request key.');
  const ids = (input.ids as string[]).slice().sort(), request = JSON.stringify(ids), key = input.idempotencyKey;
  return db.transaction(() => {
    const existing = db.query('SELECT * FROM finance_export_batches WHERE organization_id=? AND wallet_id=? AND idempotency_key=?').get(organizationId, walletId, key) as BatchRow | null;
    if (existing) {if (existing.request_json !== request) return fail('conflict', 'This export request key was already used for different movements.', 409); return {...batchMetadata(existing), payload: JSON.parse(existing.payload_json) as FinanceExportPayload};}
    // Existing request replay returns its immutable original evidence even if current
    // decisions changed later. Reviewed-version guards apply to a new batch only.
    const versions = input.expectedVersions as Record<string, unknown> | undefined;
    if (versions !== undefined && (!versions || typeof versions !== 'object' || Array.isArray(versions) || Object.keys(versions).length !== ids.length || Object.keys(versions).some(id => !ids.includes(id)) || ids.some(id => !Object.hasOwn(versions, id) || !integer(versions[id])))) return fail('invalid_input', 'Reviewed versions must cover exactly the selected Finance movements.');
    const scan = readScan(db, organizationId, walletId); if (!scan) return fail('not_found', 'Scan this business wallet before creating an export.', 404);
    const records = ids.map(id => {
      const movement = movementFromSnapshot(db, organizationId, walletId, id), saved = decisionRow(db, organizationId, walletId, id), chosen = decision(saved, id);
      if (versions !== undefined && chosen.version !== versions[id]) return fail('conflict', 'A selected movement changed. Reload before exporting.', 409);
      if (chosen.status !== 'approved' || !saved || saved.evidence_hash !== proofDigest(movement)) return fail('conflict', 'Only approved current movement versions can be exported.', 409);
      const counterparty = chosen.counterpartyId ? getFinanceCounterparty(db, userId, organizationId, chosen.counterpartyId) : null;
      if (counterparty?.disabledAt) return fail('conflict', 'An approved movement uses a disabled counterparty. Review it before export.', 409);
      return {movement, decision: chosen, counterparty};
    });
    const createdAt = new Date().toISOString(), hashes = new Set(records.map(record => record.movement.hash));
    const payload: FinanceExportPayload = {schema: 'carpan.finance.operations.v1', organizationId, walletId, wallet: wallet.address, chainId: 5042, asset: 'USDC', decimals: 18, generatedAt: createdAt, readyForPosting: false, accountingStatus: 'not_submitted', coverage: scan.coverage, loadedRanges: readRanges(db, organizationId, walletId), records, fees: scan.fees.filter(fee => hashes.has(fee.hash))};
    const id = randomUUID(), contentHash = digest(payload);
    db.run('INSERT INTO finance_export_batches(id,organization_id,wallet_id,wallet,idempotency_key,request_json,payload_json,content_hash,movement_count,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [id, organizationId, walletId, wallet.address, key, request, JSON.stringify(payload), contentHash, records.length, createdAt, userId]);
    for (const record of records) audit(db, userId, organizationId, walletId, record.movement.id, 'export_generated', null, {batchId: id, version: record.decision.version, contentHash, accountingStatus: 'not_submitted'});
    return readFinanceExportBatch(db, userId, organizationId, walletId, id);
  })();
}
