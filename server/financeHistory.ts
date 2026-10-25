import type {Database} from 'bun:sqlite';
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {ARC_USDC} from '../src/arc-wallet';
import type {FinanceMovementScan} from '../src/finance-movements';
import {financeExplorerSource, mergeFinanceDiscovery, type FinanceMovementDiscovery} from '../src/finance-discovery';
import {explorerHistoryGet, type ExplorerHistoryResult} from './arcExplorer';
import {FinanceOrganizationError} from './financeOrganizations';
import {FINANCE_SYSTEM_EMITTER, FINANCE_MOVEMENT_BLOCK_WINDOW, FINANCE_MOVEMENT_EVENT_LIMIT, FINANCE_MOVEMENT_TRANSACTION_LIMIT,
  FINANCE_MOVEMENT_SCAN_TIMEOUT_MS, financeMovementRpcReader, normalizeFinanceReceipt, type FinanceMovementReader} from './financeMovements';

/** Discovery indexes are hints only. Every imported amount, alias and fee comes
 * from an independently checked Arc receipt and its canonical block. */
type Candidate = {hash: string; block: string; source: string; discovery: FinanceMovementDiscovery[]; deferred?: true};
type ExplorerPage = {items: unknown[]; next_page_params: Record<string, unknown> | null};
export type FinanceHistoryRequest = {
  /** Trusted organization + business-wallet identity supplied by the route. */
  scope: string; ownerId: string; wallet: string; knownHashes?: string[]; cursor?: string;
};
export type FinanceHistoryMetadata = {
  sources: string[]; candidateTransactions: number; checkedTransactions: number; failedTransactions: number;
  remainingCandidates: number; hasMore: boolean; complete: false; scope: 'discovered_receipts'; fetchedAt: string;
  warnings: string[]; explorer: {available: boolean; cached: boolean; stale: boolean; fetchedAt: string | null; source?: FinanceMovementDiscovery['source']} | null;
};
export type FinanceHistoryResult = {scans: FinanceMovementScan[]; history: FinanceHistoryMetadata; nextCursor: string | null};
export type FinanceHistoryOptions = {
  loadPage?: (path: string) => Promise<ExplorerHistoryResult<ExplorerPage>>;
  /** Test clocks are not accepted from an HTTP body. */
  clock?: () => number; now?: number;
};
type HistorySession = {
  scope: string; ownerId: string; wallet: string; expires: number; queue: Candidate[]; known: Set<string>;
  nextPage: Record<string, unknown> | null; localMore: boolean; sources: Set<string>;
  explorer: FinanceHistoryMetadata['explorer'];
};
const sessions = new Map<string, HistorySession>(), cursorKey = randomBytes(32);
const SESSION_TTL = 3600000, SESSION_LIMIT = 64, SOURCE_LIMIT = 100, KNOWN_LIMIT = 7000;
const hashPattern = /^0x[0-9a-f]{64}$/i, addressPattern = /^0x[0-9a-f]{40}$/i;
const cursorFields = new Set(['block_number', 'index', 'items_count', 'batch_block_hash', 'batch_transaction_hash', 'batch_log_index', 'index_in_batch']);
const INCOMPLETE = 'Discovered receipts are verified individually; this is not complete wallet history.';
const fail = (message: string): never => {throw new FinanceOrganizationError('invalid_input', message, 400);};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
function blockString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && /^\d{1,30}$/.test(value) ? BigInt(value).toString() : null;
}
function addressHash(value: unknown): string | null {
  const raw = typeof value === 'string' ? value : record(value).hash;
  return typeof raw === 'string' && addressPattern.test(raw) ? raw.toLowerCase() : null;
}
function knownHashes(values: unknown): Set<string> {
  if (values === undefined) return new Set();
  if (!Array.isArray(values) || values.length > 5000 || values.some(value => typeof value !== 'string' || !hashPattern.test(value))) return fail('Invalid Finance history evidence list.');
  return new Set(values.map(value => value.toLowerCase()));
}
function validateRequest(request: FinanceHistoryRequest): void {
  if (!request || typeof request.scope !== 'string' || !request.scope || request.scope.length > 256 || /[\x00-\x1f\x7f]/.test(request.scope)
    || typeof request.ownerId !== 'string' || !request.ownerId || request.ownerId.length > 128
    || typeof request.wallet !== 'string' || !addressPattern.test(request.wallet) || /^0x0{40}$/i.test(request.wallet)) return fail('Invalid Finance history scope.');
}
function signature(id: string, session: Pick<HistorySession, 'scope' | 'ownerId' | 'wallet'>): string {
  return createHmac('sha256', cursorKey).update(JSON.stringify(['finance-history-v1', id, session.scope, session.ownerId, session.wallet])).digest('base64url');
}
function sessionFor(request: FinanceHistoryRequest, now: number): {id: string; session: HistorySession} {
  for (const [id, saved] of sessions) if (saved.expires < now) sessions.delete(id);
  const wallet = request.wallet.toLowerCase(), known = knownHashes(request.knownHashes);
  if (request.cursor) {
    if (typeof request.cursor !== 'string' || request.cursor.length > 128 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(request.cursor)) return fail('Finance history pagination expired. Load history again.');
    const [id, mac] = request.cursor.split('.'), session = sessions.get(id);
    const expected = Buffer.from(signature(id, {...request, wallet})), actual = Buffer.from(mac);
    if (!session || session.expires < now || expected.length !== actual.length || !timingSafeEqual(expected, actual)
      || session.scope !== request.scope || session.ownerId !== request.ownerId || session.wallet !== wallet) return fail('Finance history pagination expired. Load history again.');
    for (const value of known) session.known.add(value);
    session.queue = session.queue.filter(candidate => !session.known.has(candidate.hash));
    return {id, session};
  }
  while (sessions.size >= SESSION_LIMIT) sessions.delete(sessions.keys().next().value!);
  const id = randomBytes(18).toString('base64url'), session: HistorySession = {
    scope: request.scope, ownerId: request.ownerId, wallet, known, expires: now + SESSION_TTL,
    queue: [], nextPage: {}, localMore: true, sources: new Set(), explorer: null,
  };
  sessions.set(id, session); return {id, session};
}
/** A caller whose private transaction failed must invalidate the discovery
 * session: its checked hashes are not evidence of successful persistence. */
export function discardFinanceHistoryCursor(request: FinanceHistoryRequest, cursor: string | null | undefined): boolean {
  if (!cursor || typeof cursor !== 'string' || cursor.length > 128 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor)
    || !request || typeof request.wallet !== 'string' || !addressPattern.test(request.wallet)) return false;
  const [id, mac] = cursor.split('.'), session = sessions.get(id);
  if (!session || session.scope !== request.scope || session.ownerId !== request.ownerId || session.wallet !== request.wallet.toLowerCase()) return false;
  const expected = Buffer.from(signature(id, session)), actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return sessions.delete(id);
}
function hasTable(db: Database, name: string): boolean {return !!db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);}
function localCandidates(db: Database, session: HistorySession, fetchedAt: string): {items: Candidate[]; more: boolean} {
  // Pending/deferred receipts already have their own place in this session.
  // Excluding them here also lets discovery pass a permanently bad local prefix.
  const items: Candidate[] = [], known = JSON.stringify([...new Set([...session.known, ...session.queue.map(candidate => candidate.hash)])]); let more = false;
  if (hasTable(db, 'arc_address_activity')) {
    const rows = db.query(`SELECT tx_hash, MAX(block_number) AS block_number FROM arc_address_activity
      WHERE chain_id=5042 AND address=? AND activity_type='token_transfer' AND token_address IN (?,?)
      AND (from_address=? OR to_address=?) AND from_address<>to_address
      AND tx_hash NOT IN (SELECT value FROM json_each(?)) GROUP BY tx_hash ORDER BY block_number DESC,tx_hash LIMIT ?`)
      .all(session.wallet, FINANCE_SYSTEM_EMITTER, ARC_USDC, session.wallet, session.wallet, known, SOURCE_LIMIT + 1) as {tx_hash: string; block_number: number}[];
    more ||= rows.length > SOURCE_LIMIT;
    for (const row of rows.slice(0, SOURCE_LIMIT)) {
      const block = blockString(row.block_number);
      if (hashPattern.test(row.tx_hash) && block !== null) items.push({hash: row.tx_hash.toLowerCase(), block, source: 'Local Arc index', discovery: [{source: 'local_index', endpoint: 'local_transfer_index', fetchedAt, cached: false, stale: false}]});
    }
  }
  if (hasTable(db, 'arc_collection_proofs') && hasTable(db, 'arc_collection_requests')) {
    const rows = db.query(`SELECT p.hash,p.data FROM arc_collection_proofs p JOIN arc_collection_requests r ON r.id=p.request_id AND r.user_id=p.user_id
      WHERE p.user_id=? AND lower(r.recipient)=? AND p.hash NOT IN (SELECT value FROM json_each(?)) ORDER BY p.rowid DESC LIMIT ?`)
      .all(session.ownerId, session.wallet, known, SOURCE_LIMIT + 1) as {hash: string; data: string}[];
    more ||= rows.length > SOURCE_LIMIT;
    for (const row of rows.slice(0, SOURCE_LIMIT)) {
      if (!hashPattern.test(row.hash) || row.data.length > 100000) continue;
      try {
        const proof = record(JSON.parse(row.data)), block = blockString(proof.block);
        if (block !== null && addressHash(proof.to) === session.wallet && proof.hash === row.hash) items.push({hash: row.hash.toLowerCase(), block, source: 'Saved collection receipts', discovery: [{source: 'collection_receipt', endpoint: 'saved_collection_receipt', fetchedAt, cached: false, stale: false}]});
      } catch { /* A malformed private hint never becomes financial evidence. */ }
    }
  }
  return {items, more};
}
function pagePath(wallet: string, next: Record<string, unknown>): string {
  const params = new URLSearchParams({type: 'ERC-20'});
  for (const [key, value] of Object.entries(next)) {
    if (key === 'type' && value === 'ERC-20') continue;
    if (value === null && cursorFields.has(key)) continue;
    if (!cursorFields.has(key) || !['string', 'number'].includes(typeof value) || String(value).length > 100
      || typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Unsupported history pagination.');
    params.set(key, String(value));
  }
  return `/addresses/${wallet}/token-transfers?${params}`;
}
function explorerCandidates(page: ExplorerPage, wallet: string, discovery: FinanceMovementDiscovery): Candidate[] {
  if (!page || !Array.isArray(page.items) || page.items.length > 200 || (page.next_page_params !== null && (!page.next_page_params || typeof page.next_page_params !== 'object' || Array.isArray(page.next_page_params)))) throw new Error('Invalid history page.');
  const candidates: Candidate[] = [];
  for (const value of page.items) {
    const item = record(value), token = record(item.token), hash = item.transaction_hash ?? item.tx_hash, block = blockString(item.block_number);
    const from = addressHash(item.from), to = addressHash(item.to);
    if (typeof hash !== 'string' || !hashPattern.test(hash) || block === null || from === to || (from !== wallet && to !== wallet)
      || addressHash(token.address_hash) !== ARC_USDC
      // Blockscout uses `type` for the event kind in current responses, while
      // token_type/token.type carry the asset standard. Older pages used ERC-20.
      || !['token_transfer', 'ERC-20', undefined, null].includes(item.type as string | undefined | null)
      || !['ERC-20', undefined, null].includes(item.token_type as string | undefined | null)
      || !['ERC-20', undefined, null].includes(token.type as string | undefined | null)) continue;
    candidates.push({hash: hash.toLowerCase(), block, source: 'Explorer history', discovery: [discovery]});
  }
  return candidates;
}
function enqueue(session: HistorySession, candidates: Candidate[]): void {
  const queued = new Map(session.queue.map(candidate => [candidate.hash, candidate]));
  for (const candidate of candidates) {
    session.sources.add(candidate.source);
    if (!session.known.has(candidate.hash)) {
      const prior = queued.get(candidate.hash);
      queued.set(candidate.hash, prior ? {...prior, discovery: mergeFinanceDiscovery(prior.discovery, candidate.discovery)} : candidate);
    }
  }
  session.queue = [...queued.values()].sort((a, b) => a.deferred !== b.deferred ? a.deferred ? 1 : -1
    : BigInt(a.block) > BigInt(b.block) ? -1 : BigInt(a.block) < BigInt(b.block) ? 1 : a.hash.localeCompare(b.hash));
}

/** The caller checks write membership and wallet eligibility before invoking this
 * read-only adapter, and rechecks them before persisting its individual scans.
 * At most one guarded Explorer page and twenty canonical receipts are read per
 * request. Quota reservation is respected; missing Explorer pages do not suppress
 * usable local hints. No scan of every historical block is performed. */
export async function loadFinanceHistory(db: Database, request: FinanceHistoryRequest,
  reader: FinanceMovementReader = financeMovementRpcReader, options: FinanceHistoryOptions = {}): Promise<FinanceHistoryResult> {
  validateRequest(request);
  const clock = options.clock || Date.now, started = clock(), now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) return fail('Invalid Finance history time.');
  const {id, session} = sessionFor(request, started), deadline = started + FINANCE_MOVEMENT_SCAN_TIMEOUT_MS;
  const warnings = new Set<string>([INCOMPLETE]), scans: FinanceMovementScan[] = [];
  const bounded = async <T,>(read: () => Promise<T>): Promise<T> => {
    const remaining = deadline - clock(); if (remaining <= 0) throw new Error('Finance history time limit reached.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([read(), new Promise<T>((_resolve, reject) => {timer = setTimeout(() => reject(new Error('Finance history time limit reached.')), remaining);})]);
      if (clock() >= deadline) throw new Error('Finance history time limit reached.'); return result;
    } finally {if (timer) clearTimeout(timer);}
  };
  // Three failures bound a single RPC batch, but must not starve unattempted
  // receipts or the next Explorer page. Retry-only queues permit one source page
  // before retrying; new candidates are placed ahead of deferred failures.
  if (!session.queue.some(candidate => !candidate.deferred)) {
    const local = localCandidates(db, session, new Date(now).toISOString()); session.localMore = local.more; enqueue(session, local.items);
    if (session.nextPage !== null) {
      try {
        const path = pagePath(session.wallet, session.nextPage), loaded = await bounded(() => (options.loadPage || explorerHistoryGet<ExplorerPage>)(path));
        const fetchedAt = Date.parse(loaded.fetchedAt), age = (options.now ?? Date.now()) - fetchedAt;
        if (!Number.isFinite(fetchedAt) || age < 0 || age > 86400000 || typeof loaded.source !== 'string' || typeof loaded.cached !== 'boolean' || typeof loaded.stale !== 'boolean') throw new Error('Invalid history provenance.');
        const discovery: FinanceMovementDiscovery = {source: financeExplorerSource(loaded.source), endpoint: 'address_token_transfers', fetchedAt: new Date(fetchedAt).toISOString(), cached: loaded.cached, stale: loaded.stale};
        const candidates = explorerCandidates(loaded.payload, session.wallet, discovery);
        const next = loaded.payload.next_page_params;
        if (next !== null) {pagePath(session.wallet, next); if (JSON.stringify(next) === JSON.stringify(session.nextPage)) throw new Error('History pagination did not advance.');}
        enqueue(session, candidates);
        session.nextPage = next;
        session.explorer = {available: true, cached: loaded.cached, stale: loaded.stale, fetchedAt: discovery.fetchedAt, source: discovery.source};
        if (loaded.stale) warnings.add('Explorer discovery used a cached page; imported receipts were rechecked on Arc.');
      } catch {
        // Keep the last validated request position. A reserved budget, temporary
        // provider failure or malformed next page is not evidence of exhaustion.
        session.explorer = {available: false, cached: false, stale: false, fetchedAt: null};
        warnings.add('Explorer history is unavailable or reserved by the API budget; local receipt discovery remains available.');
      }
    }
  }
  const candidateTransactions = session.queue.length;
  let checkedTransactions = 0, failedTransactions = 0, consecutiveFailures = 0;
  if (session.queue.length && await bounded(() => reader.chainId()) !== 5042) throw new Error('RPC is not connected to Arc Mainnet.');
  const blocks = new Map<string, Awaited<ReturnType<FinanceMovementReader['block']>>>(), retry: Candidate[] = [];
  while (session.queue.length && checkedTransactions < FINANCE_MOVEMENT_TRANSACTION_LIMIT) {
    if (clock() >= deadline) {warnings.add('History verification time limit reached; continue loading to retry the remaining receipts.'); break;}
    const candidate = session.queue.shift()!; checkedTransactions++;
    try {
      const receipt = await bounded(() => reader.receipt(candidate.hash));
      if (receipt.transactionHash.toLowerCase() !== candidate.hash || typeof receipt.blockNumber !== 'bigint' || receipt.blockNumber < 0n) throw new Error('Receipt identity mismatch.');
      let block = blocks.get(receipt.blockNumber.toString());
      if (!block) {block = await bounded(() => reader.block(receipt.blockNumber)); blocks.set(receipt.blockNumber.toString(), block);}
      if (block.number !== receipt.blockNumber || block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error('Receipt block mismatch.');
      const result = normalizeFinanceReceipt(receipt, block.timestamp, session.wallet);
      if (result.movements.length > FINANCE_MOVEMENT_EVENT_LIMIT || result.unmappedAliases.length > 100 || result.movements.some(movement => movement.aliases.length > 100)) throw new Error('Receipt movement limit reached.');
      if (result.movements.length) {
        const fetchedAt = new Date(now + scans.length).toISOString();
        scans.push({wallet: session.wallet, movements: result.movements.map(movement => ({...movement, discovery: candidate.discovery})), fees: [result.fee], unmappedAliases: result.unmappedAliases,
          warnings: [...new Set([...result.warnings, INCOMPLETE])], coverage: {
            wallet: session.wallet, fromBlock: receipt.blockNumber.toString(), toBlock: receipt.blockNumber.toString(), toBlockHash: receipt.blockHash.toLowerCase(), fetchedAt,
            checkedTransactions: 1, candidateTransactions: 1, failedTransactions: 0, truncated: false,
            blockWindow: FINANCE_MOVEMENT_BLOCK_WINDOW, transactionLimit: FINANCE_MOVEMENT_TRANSACTION_LIMIT, eventLimit: FINANCE_MOVEMENT_EVENT_LIMIT,
            complete: false, scope: 'receipt_import', includesGas: true, includesGasOnlyTransactions: false,
          }});
      } else warnings.add('A discovered receipt had no qualifying USDC movements and was excluded.');
      session.known.add(candidate.hash); consecutiveFailures = 0;
    } catch {
      failedTransactions++; retry.push({...candidate, deferred: true});
      if (++consecutiveFailures >= 3 || clock() >= deadline) break;
    }
  }
  session.queue = [...session.queue, ...retry];
  scans.sort((a, b) => BigInt(a.coverage.toBlock) < BigInt(b.coverage.toBlock) ? -1 : BigInt(a.coverage.toBlock) > BigInt(b.coverage.toBlock) ? 1 : a.fees[0].hash.localeCompare(b.fees[0].hash));
  scans.forEach((scan, index) => {scan.coverage.fetchedAt = new Date(now + index).toISOString();});
  if (failedTransactions) warnings.add('Some discovered receipts could not be verified; saved records are preserved and failed receipts can be retried.');
  const capacityReached = session.known.size >= KNOWN_LIMIT;
  if (capacityReached) warnings.add('History session limit reached; start another load from the saved records.');
  const hasMore = !capacityReached && (session.queue.length > 0 || session.nextPage !== null || session.localMore);
  const nextCursor = hasMore ? `${id}.${signature(id, session)}` : null;
  if (!hasMore) sessions.delete(id);
  return {scans, nextCursor, history: {
    sources: [...session.sources], candidateTransactions, checkedTransactions, failedTransactions, remainingCandidates: session.queue.length,
    hasMore, complete: false, scope: 'discovered_receipts', fetchedAt: new Date(now + scans.length).toISOString(),
    warnings: [...warnings], explorer: session.explorer,
  }};
}
