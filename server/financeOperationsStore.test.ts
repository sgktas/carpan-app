import {describe, expect, it} from 'bun:test';
import {Database} from 'bun:sqlite';
import {encodeAbiParameters, encodeEventTopics, type TransactionReceipt} from 'viem';
import {initFinanceOrganizations, ensurePersonalFinanceOrganization, registerFinanceBusinessWallet, createFinanceCounterparty, disableFinanceBusinessWallet, disableFinanceCounterparty, FinanceOrganizationError} from './financeOrganizations';
import {FINANCE_SYSTEM_EMITTER, financeMovementTransferEvent, scanFinanceMovements, type FinanceMovementLog, type FinanceMovementReader} from './financeMovements';
import {initFinanceOperationsStore, saveFinanceOperationScan, readFinanceOperationState, updateFinanceMovementDecision, bulkFinanceMovementDecisions, readFinanceMovementAudit, createFinanceExportBatch, readFinanceExportBatch} from './financeOperationsStore';
import type {FinanceMovementScan} from '../src/finance-movements';

const wallet = '0x' + '1'.repeat(40), peer = '0x' + '2'.repeat(40), zero = '0x' + '0'.repeat(40), blockHash = '0x' + 'a'.repeat(64), seconds = 1791781200n;
const hash = (n = 1) => '0x' + n.toString(16).padStart(64, '0');
function log(index: number, raw = 1n, tx = hash(), from = peer, to = wallet, block = 5000n): FinanceMovementLog {
  return {address: FINANCE_SYSTEM_EMITTER, transactionHash: tx, blockNumber: block, blockHash, logIndex: index, removed: false, data: encodeAbiParameters([{type: 'uint256'}], [raw]), topics: encodeEventTopics({abi: [financeMovementTransferEvent], eventName: 'Transfer', args: {from: from as `0x${string}`, to: to as `0x${string}`}})};
}
async function scan(events = [log(0), log(1, 1000000000000000001n)], now = 1791781200000, end = 5000n): Promise<FinanceMovementScan> {
  const provider: FinanceMovementReader = {chainId: async () => 5042, latest: async () => ({number: end, hash: blockHash, timestamp: seconds}),
    logs: async (_wallet, _from, _to, direction) => events.filter(event => event.topics[direction === 'in' ? 2 : 1]?.endsWith(wallet.slice(2))),
    receipt: async tx => ({status: 'success', transactionHash: tx, blockNumber: events.find(event => event.transactionHash === tx)?.blockNumber || end, blockHash, from: peer, gasUsed: 21000n, effectiveGasPrice: 20000000000n, logs: events.filter(event => event.transactionHash === tx)} as unknown as TransactionReceipt),
    block: async number => ({number, hash: blockHash, timestamp: seconds})};
  return scanFinanceMovements(wallet, provider, {now});
}
function fixture() {
  const db = new Database(':memory:'); db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT,merged_into TEXT)');
  db.run('INSERT INTO users VALUES(?,?,?,NULL),(?,?,?,NULL)', ['alice', wallet, '2026-10-12T00:00:00Z', 'bob', peer, '2026-10-12T00:00:00Z']);
  initFinanceOrganizations(db); initFinanceOperationsStore(db);
  const org = ensurePersonalFinanceOrganization(db, 'alice'), businessWallet = registerFinanceBusinessWallet(db, 'alice', org.id, {chainId: 5042, address: wallet, label: 'Treasury'});
  return {db, orgId: org.id, walletId: businessWallet.id};
}
const changed = (version = 0) => ({category: 'collection', reference: 'INV-001', counterpartyId: null, status: 'review', expectedVersion: version});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function conflict(call: () => unknown, status = 409) {try {call(); throw new Error('Expected scoped failure');} catch (error) {expect(error).toBeInstanceOf(FinanceOrganizationError); expect((error as FinanceOrganizationError).status).toBe(status);}}

describe('Private Finance operation evidence and decisions', () => {
  it('preserves first discovery on RPC refresh without invalidating approval or changing immutable exports', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(), id = data.movements[0].id;
      const discovery = {source: 'blockscout_pro' as const, endpoint: 'address_token_transfers' as const, fetchedAt: '2026-10-12T08:00:00.000Z', cached: true, stale: true};
      data.movements[0].discovery = [discovery];
      const initial = saveFinanceOperationScan(db, 'alice', orgId, walletId, data);
      expect(initial.scan?.movements.find(row => row.id === id)?.discovery).toEqual([discovery]);
      const approved = updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), status: 'approved'});
      const batch = createFinanceExportBatch(db, 'alice', orgId, walletId, {ids: [id], expectedVersions: {[id]: approved.version}, idempotencyKey: 'discovery-export'});
      const refreshed = await scan(undefined, 1791781201000);
      const state = saveFinanceOperationScan(db, 'alice', orgId, walletId, refreshed), row = state.scan?.movements.find(row => row.id === id);
      expect(row?.discovery?.map(value => value.source)).toEqual(['blockscout_pro', 'arc_rpc']);
      expect(row?.discovery?.[0]).toEqual(discovery);
      expect(row?.verifiedAt).toBe(refreshed.coverage.fetchedAt);
      expect(state.decisions[id]).toEqual(approved);
      expect(readFinanceExportBatch(db, 'alice', orgId, walletId, batch.id)).toEqual(batch);
      expect(batch.payload.records[0].movement.discovery).toEqual([discovery]);
      expect(batch.payload.readyForPosting).toBe(false);
    } finally {db.close();}
  });
  it('rejects invalid discovery metadata without persisting a financial snapshot', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan();
      data.movements[0].discovery = [{source: 'arc_rpc', endpoint: 'address_token_transfers', fetchedAt: '2026-10-12T08:00:00Z', cached: true, stale: true}];
      conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, data), 400);
      expect(readFinanceOperationState(db, 'alice', orgId, walletId).scan).toBeNull();
    } finally {db.close();}
  });
  it('persists canonical evidence, default decisions, merges older windows and retains prior decisions', async () => {
    const {db, orgId, walletId} = fixture(); try {
      expect(readFinanceOperationState(db, 'alice', orgId, walletId)).toEqual({scan: null, loadedRanges: [], decisions: {}, exportBatches: []});
      const first = await scan(), state = saveFinanceOperationScan(db, 'alice', orgId, walletId, first), id = first.movements[0].id;
      expect(state.decisions[id]).toMatchObject({status: 'new', category: 'review', version: 0});
      const saved = updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, changed()); expect(saved.version).toBe(1);
      const older = await scan([log(0, 2n, hash(2), peer, wallet, 3000n)], 1791781201000, 3000n);
      const merged = saveFinanceOperationScan(db, 'alice', orgId, walletId, older); expect(merged.scan?.movements).toHaveLength(3); expect(merged.scan?.fees).toHaveLength(2); expect(merged.loadedRanges).toHaveLength(2);
      expect(merged.decisions[id]).toEqual(saved); expect(merged.scan?.coverage.toBlock).toBe('3000');
      const empty = await scan([], 1791781202000, 5001n); const after = saveFinanceOperationScan(db, 'alice', orgId, walletId, empty);
      expect(after.scan?.movements).toHaveLength(3); expect(after.decisions[id]).toEqual(saved); expect(after.loadedRanges).toHaveLength(3);
    } finally {db.close();}
  });
  it('rejects stale/out-of-order snapshots and conflicting canonical evidence without changing prior state', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const original = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, original); const before = readFinanceOperationState(db, 'alice', orgId, walletId);
      conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, {...clone(original), coverage: {...original.coverage, fetchedAt: '2026-10-01T00:00:00Z'}}));
      const revised = await scan([log(0, 3n)], 1791781201000); conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, revised));
      expect(readFinanceOperationState(db, 'alice', orgId, walletId)).toEqual(before);
    } finally {db.close();}
  });
  it('accepts exact scan retries after cumulative sorting and supports the new other category', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(), first = saveFinanceOperationScan(db, 'alice', orgId, walletId, data);
      expect(first.scan?.movements.map(row => row.logIndex)).not.toEqual(data.movements.map(row => row.logIndex));
      const id = data.movements[0].id, approved = updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), category: 'other', status: 'approved'});
      expect(approved).toMatchObject({category: 'other', status: 'approved', version: 1});
      expect(saveFinanceOperationScan(db, 'alice', orgId, walletId, data)).toEqual(readFinanceOperationState(db, 'alice', orgId, walletId));
      const older = await scan([log(0, 2n, hash(2), peer, wallet, 3000n)], 1791781201000, 3000n);
      const merged = saveFinanceOperationScan(db, 'alice', orgId, walletId, older);
      expect(saveFinanceOperationScan(db, 'alice', orgId, walletId, older)).toEqual(merged);
      expect(merged.decisions[id]).toEqual(approved);
    } finally {db.close();}
  });
  it('accepts explicitly incomplete receipt imports without claiming a fully scanned range', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan([log(0)]); data.coverage = {...data.coverage, fromBlock: '5000', toBlock: '5000', scope: 'receipt_import', complete: false};
      const state = saveFinanceOperationScan(db, 'alice', orgId, walletId, data); expect(state.loadedRanges[0]).toMatchObject({scope: 'receipt_import', complete: false});
      const wrong = clone(data); wrong.coverage.complete = true; conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, wrong), 400);
    } finally {db.close();}
  });
  it('rejects spoofed wallet, canonical identities, amounts, fee duplicates and incorrect coverage', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const good = await scan();
      const variants = [() => ({...clone(good), wallet: peer}), () => {const bad = clone(good); bad.movements[0].id = `5042:${hash(99)}:0`; return bad;}, () => {const bad = clone(good); bad.movements[0].raw18 = '-1'; return bad;}, () => {const bad = clone(good); bad.fees.push(bad.fees[0]); return bad;}, () => {const bad = clone(good); bad.coverage.failedTransactions = 1; return bad;}];
      for (const make of variants) conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, make()), 400);
      expect(readFinanceOperationState(db, 'alice', orgId, walletId).scan).toBeNull();
    } finally {db.close();}
  });
  it('rejects entirely failed or internally inconsistent scan sources and keeps the previous evidence', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const good = await scan(), previous = saveFinanceOperationScan(db, 'alice', orgId, walletId, good);
      const failed = {...clone(good), movements: [], fees: [], coverage: {...good.coverage, fetchedAt: '2026-10-12T22:00:00Z', failedTransactions: 1, complete: false}};
      conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, failed), 400);
      const inconsistent = {...clone(good), fees: [], coverage: {...good.coverage, fetchedAt: '2026-10-12T22:00:00Z'}};
      conflict(() => saveFinanceOperationScan(db, 'alice', orgId, walletId, inconsistent), 400);
      expect(readFinanceOperationState(db, 'alice', orgId, walletId)).toEqual(previous);
    } finally {db.close();}
  });
  it('scopes evidence, decisions, counterparties, audit and exports to organizations with viewer write denial', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, data); const id = data.movements[0].id;
      for (const call of [() => readFinanceOperationState(db, 'bob', orgId, walletId), () => saveFinanceOperationScan(db, 'bob', orgId, walletId, data), () => updateFinanceMovementDecision(db, 'bob', orgId, walletId, id, changed()), () => readFinanceMovementAudit(db, 'bob', orgId, walletId, id), () => createFinanceExportBatch(db, 'bob', orgId, walletId, {ids: [id], idempotencyKey: 'foreign-key'})]) conflict(call, 404);
      const otherOrg = ensurePersonalFinanceOrganization(db, 'bob'), party = createFinanceCounterparty(db, 'bob', otherOrg.id, {name: 'Foreign', addresses: []});
      conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), counterpartyId: party.id}), 404);
      db.run("INSERT INTO finance_organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'viewer',?)", [orgId, 'bob', '2026-10-12']);
      expect(readFinanceOperationState(db, 'bob', orgId, walletId).scan?.movements).toHaveLength(2);
      conflict(() => updateFinanceMovementDecision(db, 'bob', orgId, walletId, id, changed()), 403);
      disableFinanceBusinessWallet(db, 'alice', orgId, walletId); expect(readFinanceOperationState(db, 'alice', orgId, walletId).scan).not.toBeNull(); conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, changed()));
    } finally {db.close();}
  });
  it('allows scoped historical export reads but denies viewer and disabled-wallet export creation', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, data); const id = data.movements[0].id;
      updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), status: 'approved'});
      const batch = createFinanceExportBatch(db, 'alice', orgId, walletId, {ids: [id], expectedVersions: {[id]: 1}, idempotencyKey: 'historical-export'});
      db.run("INSERT INTO finance_organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'viewer',?)", [orgId, 'bob', '2026-10-12']);
      expect(readFinanceExportBatch(db, 'bob', orgId, walletId, batch.id)).toEqual(batch);
      conflict(() => createFinanceExportBatch(db, 'bob', orgId, walletId, {ids: [id], idempotencyKey: 'viewer-export'}), 403);
      disableFinanceBusinessWallet(db, 'alice', orgId, walletId);
      expect(readFinanceExportBatch(db, 'alice', orgId, walletId, batch.id)).toEqual(batch);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids: [id], idempotencyKey: 'disabled-export'}));
      expect(readFinanceOperationState(db, 'alice', orgId, walletId).exportBatches).toHaveLength(1);
    } finally {db.close();}
  });
  it('uses exact versions, requires approval context and records append-only decision transitions', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, data); const id = data.movements[0].id;
      conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), category: 'review', status: 'approved'}), 400);
      conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), reference: '', status: 'approved'}), 400);
      const one = updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, changed()); expect(one.version).toBe(1);
      conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, changed()));
      const two = updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(1), status: 'approved'}); expect(two.version).toBe(2);
      const audit = readFinanceMovementAudit(db, 'alice', orgId, walletId, id); expect(audit.items).toHaveLength(2); expect(audit.items[0].before).toMatchObject({version: 1, status: 'review'}); expect(audit.items[0].after).toMatchObject({version: 2, status: 'approved'});
      expect(() => db.run("UPDATE finance_operation_audit SET action='export_generated' WHERE organization_id=?", [orgId])).toThrow('immutable'); expect(() => db.run('DELETE FROM finance_operation_audit WHERE organization_id=?', [orgId])).toThrow('immutable');
    } finally {db.close();}
  });
  it('rejects coercible non-string statuses before binding SQL or changing decisions', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(), previous = saveFinanceOperationScan(db, 'alice', orgId, walletId, data), id = data.movements[0].id;
      conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), status: ['approved']}), 400);
      conflict(() => bulkFinanceMovementDecisions(db, 'alice', orgId, walletId, {status: ['review'], items: [{id, expectedVersion: 0}]}), 400);
      expect(readFinanceOperationState(db, 'alice', orgId, walletId)).toEqual(previous);
    } finally {db.close();}
  });
  it('allows a private counterparty instead of a reference and restricts mint/burn approval to internal', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan([log(0), log(1, 1n, hash(), zero), log(2, 2n, hash(), wallet, zero)]); saveFinanceOperationScan(db, 'alice', orgId, walletId, data);
      const party = createFinanceCounterparty(db, 'alice', orgId, {name: 'Customer', code: 'C-001', kind: 'customer', addresses: [{chainId: 5042, address: peer, label: 'Paying wallet'}]});
      expect(updateFinanceMovementDecision(db, 'alice', orgId, walletId, data.movements[0].id, {...changed(), reference: '', counterpartyId: party.id, status: 'approved'}).status).toBe('approved');
      for (const movement of data.movements.slice(1)) {conflict(() => updateFinanceMovementDecision(db, 'alice', orgId, walletId, movement.id, {...changed(), status: 'approved'}), 400); expect(updateFinanceMovementDecision(db, 'alice', orgId, walletId, movement.id, {...changed(), category: 'internal', status: 'approved'}).status).toBe('approved');}
      disableFinanceCounterparty(db, 'alice', orgId, party.id); conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids: [data.movements[0].id], idempotencyKey: 'disabled-party'}));
    } finally {db.close();}
  });
  it('rolls back the whole bulk request if one expected version or approval is invalid', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, data);
      for (const movement of data.movements) updateFinanceMovementDecision(db, 'alice', orgId, walletId, movement.id, changed());
      const before = readFinanceOperationState(db, 'alice', orgId, walletId);
      conflict(() => bulkFinanceMovementDecisions(db, 'alice', orgId, walletId, {status: 'approved', items: [{id: data.movements[0].id, expectedVersion: 1}, {id: data.movements[1].id, expectedVersion: 0}]}));
      expect(readFinanceOperationState(db, 'alice', orgId, walletId)).toEqual(before);
      const updated = bulkFinanceMovementDecisions(db, 'alice', orgId, walletId, {status: 'approved', items: data.movements.map(movement => ({id: movement.id, expectedVersion: 1}))}); expect(updated.every(item => item.status === 'approved' && item.version === 2)).toBe(true);
    } finally {db.close();}
  });
  it('exports approved exact versions with one receipt fee, immutable payload and stable idempotent retries', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, data); const ids = data.movements.map(movement => movement.id);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, idempotencyKey: 'approved-export'}));
      for (const id of ids) updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), status: 'approved'});
      const batch = createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, idempotencyKey: 'approved-export'});
      expect(batch.payload.schema).toBe('carpan.finance.operations.v1'); expect(batch.payload.readyForPosting).toBe(false); expect(batch.accountingStatus).toBe('not_submitted'); expect(batch.status).toBe('generated'); expect(batch.payload.records.map(record => record.movement.raw18).sort()).toEqual(['1', '1000000000000000001']); expect(batch.payload.fees).toHaveLength(1); expect(batch.payload.loadedRanges).toHaveLength(1);
      expect(createFinanceExportBatch(db, 'alice', orgId, walletId, {ids: [...ids].reverse(), idempotencyKey: 'approved-export'})).toEqual(batch);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids: [ids[0]], idempotencyKey: 'approved-export'}));
      updateFinanceMovementDecision(db, 'alice', orgId, walletId, ids[0], {...changed(1), reference: 'REVISION', status: 'review'});
      expect(readFinanceExportBatch(db, 'alice', orgId, walletId, batch.id)).toEqual(batch); expect(createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, idempotencyKey: 'approved-export'})).toEqual(batch);
      expect(readFinanceOperationState(db, 'alice', orgId, walletId).decisions[ids[0]].status).toBe('review'); expect(readFinanceOperationState(db, 'alice', orgId, walletId).exportBatches[0].id).toBe(batch.id);
      expect(() => db.run("UPDATE finance_export_batches SET content_hash='changed' WHERE id=?", [batch.id])).toThrow('immutable'); expect(() => db.run('DELETE FROM finance_export_batches WHERE id=?', [batch.id])).toThrow('immutable');
      conflict(() => readFinanceExportBatch(db, 'bob', orgId, walletId, batch.id), 404);
    } finally {db.close();}
  });
  it('guards reviewed versions for new exports and replays a known immutable batch after later changes', async () => {
    const {db, orgId, walletId} = fixture(); try {
      const data = await scan(); saveFinanceOperationScan(db, 'alice', orgId, walletId, data); const ids = data.movements.map(movement => movement.id);
      for (const id of ids) updateFinanceMovementDecision(db, 'alice', orgId, walletId, id, {...changed(), status: 'approved'});
      const expectedVersions = Object.fromEntries(ids.map(id => [id, 1]));
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, expectedVersions: {}, idempotencyKey: 'missing-versions'}), 400);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, expectedVersions: {...expectedVersions, foreign: 1}, idempotencyKey: 'extra-versions'}), 400);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, expectedVersions: {...expectedVersions, [ids[0]]: '1'}, idempotencyKey: 'string-versions'}), 400);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {ids, expectedVersions: {...expectedVersions, [ids[0]]: 0}, idempotencyKey: 'stale-versions'}));
      expect(readFinanceOperationState(db, 'alice', orgId, walletId).exportBatches).toHaveLength(0);
      const request = {ids, expectedVersions, idempotencyKey: 'reviewed-versions'}, batch = createFinanceExportBatch(db, 'alice', orgId, walletId, request);
      updateFinanceMovementDecision(db, 'alice', orgId, walletId, ids[0], {...changed(1), reference: 'Changed after export', status: 'review'});
      expect(createFinanceExportBatch(db, 'alice', orgId, walletId, request)).toEqual(batch);
      conflict(() => createFinanceExportBatch(db, 'alice', orgId, walletId, {...request, idempotencyKey: 'new-stale-export'}));
      expect(readFinanceOperationState(db, 'alice', orgId, walletId).exportBatches).toHaveLength(1);
    } finally {db.close();}
  });
});
