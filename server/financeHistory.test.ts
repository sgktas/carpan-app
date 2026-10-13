import {describe, expect, it} from 'bun:test';
import {Database} from 'bun:sqlite';
import {encodeAbiParameters, encodeEventTopics, type TransactionReceipt} from 'viem';
import {ARC_USDC} from '../src/arc-wallet';
import {discardFinanceHistoryCursor, loadFinanceHistory, type FinanceHistoryRequest} from './financeHistory';
import {financeMovementTransferEvent, FINANCE_SYSTEM_EMITTER, type FinanceMovementLog, type FinanceMovementReader} from './financeMovements';
import {explorerHistoryGet} from './arcExplorer';

const wallet = '0x' + '1'.repeat(40), peer = '0x' + '2'.repeat(40), other = '0x' + '3'.repeat(40);
const blockHash = '0x' + 'a'.repeat(64), otherBlockHash = '0x' + 'b'.repeat(64), now = 1791799200000, time = 1791781200n;
const hash = (n: number) => '0x' + n.toString(16).padStart(64, '0');
const request: FinanceHistoryRequest = {scope: 'company-a:business-wallet-a', ownerId: 'user-a', wallet};
function fixtureDb(): Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE arc_address_activity(chain_id INTEGER,address TEXT,block_number INTEGER,tx_hash TEXT,activity_type TEXT,token_address TEXT,from_address TEXT,to_address TEXT);
    CREATE TABLE arc_collection_requests(id TEXT,user_id TEXT,recipient TEXT);
    CREATE TABLE arc_collection_proofs(user_id TEXT,request_id TEXT,hash TEXT,data TEXT);`);
  return db;
}
function indexed(db: Database, n: number, asset = FINANCE_SYSTEM_EMITTER, selected = wallet, type = 'token_transfer'): void {
  db.run('INSERT INTO arc_address_activity VALUES(5042,?,?,?, ?,?,?,?)', [selected, 1000 + n, hash(n), type, asset, peer, selected]);
}
function proof(db: Database, n: number, owner = 'user-a', recipient = wallet): void {
  db.run('INSERT INTO arc_collection_requests VALUES(?,?,?)', [`request-${n}`, owner, recipient]);
  db.run('INSERT INTO arc_collection_proofs VALUES(?,?,?,?)', [owner, `request-${n}`, hash(n), JSON.stringify({hash: hash(n), block: String(1000 + n), to: recipient})]);
}
function event(n: number, index: number, value: bigint, emitter: string, to = wallet): FinanceMovementLog {
  return {address: emitter, transactionHash: hash(n), blockNumber: BigInt(1000 + n), blockHash, logIndex: index,
    data: encodeAbiParameters([{type: 'uint256'}], [value]), topics: encodeEventTopics({abi: [financeMovementTransferEvent], eventName: 'Transfer', args: {from: peer as `0x${string}`, to: to as `0x${string}`}})};
}
function receipt(n: number, to = wallet): TransactionReceipt {
  return {status: 'success', transactionHash: hash(n), blockNumber: BigInt(1000 + n), blockHash, from: peer,
    gasUsed: 21000n, effectiveGasPrice: 20000000000n,
    logs: [event(n, 0, 100000000000000000n, FINANCE_SYSTEM_EMITTER, to), event(n, 1, 100000n, ARC_USDC, to)]} as unknown as TransactionReceipt;
}
function reader(): FinanceMovementReader & {reads: string[]; blockReads: bigint[]} {
  const reads: string[] = [], blockReads: bigint[] = [];
  return {reads, blockReads, chainId: async () => 5042,
    latest: async () => {throw Error('History discovery must not scan block windows.');},
    logs: async () => {throw Error('History discovery must not scan block windows.');},
    receipt: async tx => {reads.push(tx); return receipt(Number(BigInt(tx)));},
    block: async number => {blockReads.push(number); return {number, hash: blockHash, timestamp: time};}};
}
function explorerRow(n: number, asset = ARC_USDC, selected = wallet): unknown {
  return {transaction_hash: hash(n), block_number: 1000 + n, type: 'ERC-20', from: {hash: peer}, to: {hash: selected}, token: {address_hash: asset}, total: {value: '999999999999999999999999', decimals: '6'}};
}
const page = (items: unknown[], next: Record<string, unknown> | null = null, stale = false) => ({payload: {items, next_page_params: next}, source: 'Blockscout PRO', fetchedAt: new Date(now - (stale ? 120000 : 0)).toISOString(), cached: true, stale});

describe('Finance historical receipt discovery', () => {
  it('discovers older indexed/native, collection and cached hashes; checks canonical amounts and gas once', async () => {
    const db = fixtureDb(), rpc = reader(); indexed(db, 1); indexed(db, 1, ARC_USDC); proof(db, 1); proof(db, 2);
    const paths: string[] = [];
    const result = await loadFinanceHistory(db, request, rpc, {now, loadPage: async path => {paths.push(path); return page([explorerRow(1), explorerRow(3)], null, true);}});
    expect(paths).toEqual([`/addresses/${wallet}/token-transfers?type=ERC-20`]);
    expect(rpc.reads).toEqual([hash(3), hash(2), hash(1)]);
    expect(result.scans).toHaveLength(3);
    expect(result.scans.every(scan => scan.movements.length === 1 && scan.movements[0].raw18 === '100000000000000000' && scan.movements[0].aliases.length === 1 && scan.fees.length === 1 && scan.fees[0].raw18 === '420000000000000')).toBe(true);
    expect(result.scans.every(scan => scan.coverage.scope === 'receipt_import' && scan.coverage.complete === false && scan.coverage.fromBlock === scan.coverage.toBlock)).toBe(true);
    expect(result.scans.map(scan => scan.coverage.fetchedAt)).toEqual([0, 1, 2].map(offset => new Date(now + offset).toISOString()));
    expect(result.scans.map(scan => scan.coverage.toBlock)).toEqual(['1001', '1002', '1003']);
    expect(result.history).toMatchObject({candidateTransactions: 3, checkedTransactions: 3, failedTransactions: 0, complete: false, hasMore: false, remainingCandidates: 0});
    expect(result.history.sources).toContain('Local Arc index'); expect(result.history.sources).toContain('Saved collection receipts');
    expect(result.history.warnings.join(' ')).toContain('not complete wallet history');
    expect(result.history.explorer).toMatchObject({available: true, cached: true, stale: true});
    expect(result.nextCursor).toBeNull(); db.close();
  });
  it('excludes another wallet, another owner, foreign tokens, transactions without transfer evidence and already saved hashes', async () => {
    const db = fixtureDb(), rpc = reader();
    indexed(db, 1, FINANCE_SYSTEM_EMITTER, other); indexed(db, 2, other); indexed(db, 3, FINANCE_SYSTEM_EMITTER, wallet, 'transaction');
    indexed(db, 4); indexed(db, 5, ARC_USDC); proof(db, 6, 'user-b'); proof(db, 7, 'user-a', other);
    const result = await loadFinanceHistory(db, {...request, knownHashes: [hash(4)]}, rpc,
      {now, loadPage: async () => page([explorerRow(8, ARC_USDC, other), explorerRow(9, other), {...explorerRow(10) as object, transaction_hash: 'bad'}, explorerRow(5)])});
    expect(rpc.reads).toEqual([hash(5)]); expect(result.scans).toHaveLength(1); db.close();
  });
  it('keeps local discovery usable when the guarded Explorer helper refuses quota spending', async () => {
    const db = fixtureDb(), rpc = reader(); indexed(db, 1);
    let attempted = 0;
    const result = await loadFinanceHistory(db, request, rpc, {now, loadPage: path => explorerHistoryGet(path, async () => {attempted++; throw Error('API bütçesi korunuyor; bu sorgunun kayıtlı verisi yok.');})});
    expect(attempted).toBe(1); expect(rpc.reads).toEqual([hash(1)]); expect(result.scans).toHaveLength(1);
    expect(result.history.explorer?.available).toBe(false); expect(result.history.warnings.join(' ')).toContain('API budget'); db.close();
  });
  it('limits each batch to twenty receipts, preserves the tail, and only loads another provider page after the tail', async () => {
    const db = fixtureDb(), rpc = reader(); let pages = 0;
    const loadPage = async (path: string) => {
      pages++; return path.includes('block_number=1001') ? page([explorerRow(30)]) : page(Array.from({length: 25}, (_, i) => explorerRow(i + 1)), {block_number: 1001, index: 1});
    };
    const first = await loadFinanceHistory(db, request, rpc, {now, loadPage});
    expect(first.scans).toHaveLength(20); expect(first.history).toMatchObject({hasMore: true, remainingCandidates: 5}); expect(pages).toBe(1);
    const second = await loadFinanceHistory(db, {...request, cursor: first.nextCursor!}, rpc, {now: now + 1000, loadPage});
    expect(second.scans).toHaveLength(5); expect(second.history.hasMore).toBe(true); expect(pages).toBe(1);
    const third = await loadFinanceHistory(db, {...request, cursor: second.nextCursor!}, rpc, {now: now + 2000, loadPage});
    expect(third.scans).toHaveLength(1); expect(third.scans[0].movements[0].hash).toBe(hash(30)); expect(pages).toBe(2);
    expect(new Set(rpc.reads).size).toBe(26); expect(third.nextCursor).toBeNull(); db.close();
  });
  it('binds opaque pagination to account, organization and selected wallet and rejects tampering or expiry', async () => {
    const db = fixtureDb(), rpc = reader(); const start = 100000;
    const first = await loadFinanceHistory(db, request, rpc, {now, clock: () => start, loadPage: async () => page(Array.from({length: 21}, (_, i) => explorerRow(i + 1)))});
    for (const patch of [{ownerId: 'user-b'}, {scope: 'company-b:business-wallet-a'}, {wallet: other}, {cursor: first.nextCursor! + 'a'}]) {
      await expect(loadFinanceHistory(db, {...request, cursor: first.nextCursor!, ...patch}, rpc, {now, clock: () => start})).rejects.toThrow('pagination expired');
    }
    await expect(loadFinanceHistory(db, {...request, cursor: first.nextCursor!}, rpc, {now, clock: () => start + 3600001})).rejects.toThrow('pagination expired'); db.close();
  });
  it('keeps failed receipts retryable and never accepts mismatched receipt or canonical block evidence', async () => {
    const db = fixtureDb(), rpc = reader(); indexed(db, 1); indexed(db, 2); indexed(db, 3);
    const original = rpc.receipt; let failed = true;
    rpc.receipt = async tx => {const receipt = await original(tx); return failed && tx === hash(2) ? {...receipt, transactionHash: hash(9)} : receipt;};
    const first = await loadFinanceHistory(db, request, rpc, {now, loadPage: async () => page([])});
    expect(first.scans).toHaveLength(2); expect(first.history).toMatchObject({failedTransactions: 1, hasMore: true, remainingCandidates: 1});
    failed = false;
    const second = await loadFinanceHistory(db, {...request, cursor: first.nextCursor!}, rpc, {now: now + 1000, loadPage: async () => page([])});
    expect(second.scans).toHaveLength(1); expect(second.scans[0].movements[0].hash).toBe(hash(2)); expect(second.history.failedTransactions).toBe(0);
    rpc.block = async number => ({number, hash: otherBlockHash, timestamp: time});
    const wrongBlock = await loadFinanceHistory(db, request, rpc, {now, loadPage: async () => page([])});
    expect(wrongBlock.scans).toHaveLength(0); expect(wrongBlock.history.failedTransactions).toBe(3); expect(wrongBlock.history.hasMore).toBe(true); db.close();
  });
  it('invalidates a discovery session after caller persistence failure and requires binding-matching disposal', async () => {
    const db = fixtureDb(), rpc = reader();
    const result = await loadFinanceHistory(db, request, rpc, {now, loadPage: async () => page(Array.from({length: 21}, (_, i) => explorerRow(i + 1)))});
    expect(discardFinanceHistoryCursor({...request, scope: 'company-b:business-wallet-a'}, result.nextCursor)).toBe(false);
    expect(discardFinanceHistoryCursor({...request, wallet: other}, result.nextCursor)).toBe(false);
    expect(discardFinanceHistoryCursor(request, result.nextCursor + 'a')).toBe(false);
    expect(discardFinanceHistoryCursor(request, result.nextCursor)).toBe(true);
    await expect(loadFinanceHistory(db, {...request, cursor: result.nextCursor!}, rpc, {now})).rejects.toThrow('pagination expired');
    const reloaded = await loadFinanceHistory(db, request, rpc, {now: now + 1000, loadPage: async () => page([explorerRow(1)])});
    expect(reloaded.scans[0].movements[0].hash).toBe(hash(1)); db.close();
  });
  it('excludes foreign or gas-only receipts without inventing movements or repeating them in this pagination session', async () => {
    const db = fixtureDb(), rpc = reader(); indexed(db, 1);
    rpc.receipt = async tx => receipt(Number(BigInt(tx)), other);
    const result = await loadFinanceHistory(db, request, rpc, {now, loadPage: async () => page([])});
    expect(result.scans).toHaveLength(0); expect(result.history).toMatchObject({checkedTransactions: 1, failedTransactions: 0, hasMore: false});
    expect(result.history.warnings.join(' ')).toContain('no qualifying USDC'); db.close();
  });
  it('retains unprocessed receipts when the shared thirty-second deadline expires', async () => {
    const db = fixtureDb(), rpc = reader(); indexed(db, 1); indexed(db, 2);
    let elapsed = 100000; const original = rpc.receipt;
    rpc.receipt = async tx => {const value = await original(tx); elapsed += 30001; return value;};
    const first = await loadFinanceHistory(db, request, rpc, {now, clock: () => elapsed, loadPage: async () => page([])});
    expect(first.scans).toHaveLength(0); expect(rpc.reads).toHaveLength(1); expect(first.history).toMatchObject({failedTransactions: 1, remainingCandidates: 2, hasMore: true}); db.close();
  });
  it('defers permanent failures behind untouched receipts and allows the next source page before a retry-only queue', async () => {
    const db = fixtureDb(), rpc = reader(); let pages = 0;
    const original = rpc.receipt;
    rpc.receipt = async tx => {const result = await original(tx); if ([hash(7), hash(6), hash(5)].includes(tx)) throw Error('Permanent bad receipt'); return result;};
    const loadPage = async (path: string) => {
      pages++;
      return path.includes('block_number=1004') ? page([explorerRow(3)]) : page([explorerRow(7), explorerRow(6), explorerRow(5), explorerRow(4)], {block_number: 1004, index: 1});
    };
    const first = await loadFinanceHistory(db, request, rpc, {now, loadPage});
    expect(first.scans).toHaveLength(0); expect(first.history).toMatchObject({checkedTransactions: 3, failedTransactions: 3, remainingCandidates: 4, hasMore: true});
    const second = await loadFinanceHistory(db, {...request, cursor: first.nextCursor!}, rpc, {now: now + 1000, loadPage});
    expect(second.scans.map(scan => scan.movements[0].hash)).toEqual([hash(4)]);
    expect(second.history).toMatchObject({failedTransactions: 3, remainingCandidates: 3, hasMore: true}); expect(pages).toBe(1);
    const third = await loadFinanceHistory(db, {...request, cursor: second.nextCursor!}, rpc, {now: now + 2000, loadPage});
    expect(third.scans.map(scan => scan.movements[0].hash)).toEqual([hash(3)]);
    expect(third.history).toMatchObject({failedTransactions: 3, remainingCandidates: 3, hasMore: true}); expect(pages).toBe(2);
    expect(rpc.reads.slice(3, 4)).toEqual([hash(4)]); expect(rpc.reads.slice(7, 8)).toEqual([hash(3)]); db.close();
  });
  it('preserves the validated provider position across transient failures and untrusted continuations', async () => {
    const db = fixtureDb(), rpc = reader(); const paths: string[] = []; let pageAttempt = 0;
    const loadPage = async (path: string) => {
      paths.push(path); pageAttempt++;
      if (pageAttempt === 1) return page([explorerRow(2)], {block_number: 1002, index: 1});
      if (pageAttempt === 2) throw Error('Temporary provider outage');
      if (pageAttempt === 3) return page([explorerRow(1)], {url: 'https://untrusted.example/next'});
      return page([explorerRow(1)]);
    };
    const first = await loadFinanceHistory(db, request, rpc, {now, loadPage});
    const outage = await loadFinanceHistory(db, {...request, cursor: first.nextCursor!}, rpc, {now: now + 1000, loadPage});
    expect(outage.scans).toHaveLength(0); expect(outage.history).toMatchObject({hasMore: true, remainingCandidates: 0, explorer: {available: false}});
    const malformed = await loadFinanceHistory(db, {...request, cursor: outage.nextCursor!}, rpc, {now: now + 2000, loadPage});
    expect(malformed.scans).toHaveLength(0); expect(malformed.history.hasMore).toBe(true);
    const recovered = await loadFinanceHistory(db, {...request, cursor: malformed.nextCursor!}, rpc, {now: now + 3000, loadPage});
    expect(recovered.scans.map(scan => scan.movements[0].hash)).toEqual([hash(1)]); expect(recovered.nextCursor).toBeNull();
    expect(paths.slice(1)).toEqual(Array(3).fill(`/addresses/${wallet}/token-transfers?type=ERC-20&block_number=1002&index=1`)); db.close();
  });
  it('rejects malformed input, unsupported provider pagination and wrong networks without trusting hints', async () => {
    const db = fixtureDb(), rpc = reader();
    await expect(loadFinanceHistory(db, {...request, wallet: 'bad'}, rpc)).rejects.toThrow('scope');
    await expect(loadFinanceHistory(db, {...request, knownHashes: ['bad']}, rpc)).rejects.toThrow('evidence list');
    const invalidNext = await loadFinanceHistory(db, request, rpc, {now, loadPage: async () => page([explorerRow(1)], {url: 'https://example.com'})});
    expect(invalidNext.history.explorer?.available).toBe(false);
    expect(invalidNext.scans).toHaveLength(0); expect(invalidNext.history.sources).not.toContain('Explorer history');
    rpc.chainId = async () => 5042002;
    await expect(loadFinanceHistory(db, request, rpc, {now, loadPage: async () => page([explorerRow(1)])})).rejects.toThrow('Arc Mainnet'); db.close();
  });
});
