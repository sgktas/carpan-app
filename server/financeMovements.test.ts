import {describe, expect, it} from 'bun:test';
import {encodeAbiParameters, encodeEventTopics, type TransactionReceipt} from 'viem';
import {ARC_USDC} from '../src/arc-wallet';
import {FINANCE_SYSTEM_EMITTER, FINANCE_MOVEMENT_BLOCK_WINDOW, FINANCE_MOVEMENT_TRANSACTION_LIMIT, FINANCE_MOVEMENT_EVENT_LIMIT, FINANCE_MOVEMENT_LOG_LIMIT, FINANCE_MOVEMENT_SCAN_TIMEOUT_MS,
  financeMovementTransferEvent, normalizeFinanceReceipt, scanFinanceMovements, type FinanceMovementLog, type FinanceMovementReader} from './financeMovements';

const wallet = '0x' + '1'.repeat(40), peer = '0x' + '2'.repeat(40), other = '0x' + '3'.repeat(40), zero = '0x' + '0'.repeat(40);
const blockHash = '0x' + 'a'.repeat(64), otherBlockHash = '0x' + 'b'.repeat(64), time = 1791781200n, scale = 1000000000000n;
const hash = (n: number) => '0x' + n.toString(16).padStart(64, '0');
function log(index: number, from = peer, to = wallet, value = 1000000000000000000n, emitter = FINANCE_SYSTEM_EMITTER, tx = hash(1), block = 5000n): FinanceMovementLog {
  return {address: emitter, transactionHash: tx, blockNumber: block, blockHash, logIndex: index, removed: false,
    data: encodeAbiParameters([{type: 'uint256'}], [value]), topics: encodeEventTopics({abi: [financeMovementTransferEvent], eventName: 'Transfer', args: {from: from as `0x${string}`, to: to as `0x${string}`}})};
}
function receipt(logs: FinanceMovementLog[], tx = hash(1), block = 5000n, from = peer): TransactionReceipt {
  return {status: 'success', transactionHash: tx, blockNumber: block, blockHash, from, gasUsed: 21000n, effectiveGasPrice: 20000000000n, logs} as unknown as TransactionReceipt;
}
function reader(events = [log(0)]): FinanceMovementReader {
  return {chainId: async () => 5042, latest: async () => ({number: 5000n, hash: blockHash, timestamp: time}),
    logs: async (_wallet, _from, _to, direction) => events.filter(event => {const sides = event.topics; return sides[direction === 'in' ? 2 : 1]?.endsWith(wallet.slice(2));}),
    receipt: async tx => receipt(events.filter(event => event.transactionHash === tx), tx), block: async number => ({number, hash: blockHash, timestamp: time})};
}

describe('Canonical Arc Finance receipt evidence', () => {
  it('counts native and ERC-20 USDC once, preserving sub-micro-USDC and gas separately', () => {
    const normalized = normalizeFinanceReceipt(receipt([log(0), log(1, peer, wallet, 1000000n, ARC_USDC), log(2, wallet, peer, 1n)]), time, wallet);
    expect(normalized.movements).toHaveLength(2);
    expect(normalized.movements[0]).toMatchObject({id: `5042:${hash(1)}:0`, raw18: '1000000000000000000', direction: 'in', decimals: 18, interface: 'erc20'});
    expect(normalized.movements[0].aliases).toEqual([{id: `5042:${hash(1)}:1:${ARC_USDC}`, hash: hash(1), logIndex: 1, emitter: ARC_USDC, raw6: '1000000', decimals: 6, mappingStatus: 'matched'}]);
    expect(normalized.movements[1]).toMatchObject({raw18: '1', direction: 'out', interface: 'native', aliases: []});
    expect(normalized.fee).toMatchObject({id: `5042:${hash(1)}:gas`, raw18: '420000000000000', gasPayer: peer, decimals: 18});
    expect(normalized.movements.every(movement => !('gasRaw18' in movement))).toBe(true);
  });
  it('retains identical repeated movements and assigns each alias once with explicit ambiguity', () => {
    const events = [log(0), log(1, peer, wallet, 1000000n, ARC_USDC), log(2), log(3, peer, wallet, 1000000n, ARC_USDC)];
    const one = normalizeFinanceReceipt(receipt(events), time, wallet), reversed = normalizeFinanceReceipt(receipt([...events].reverse()), time, wallet);
    expect(one.movements).toEqual(reversed.movements); expect(one.movements).toHaveLength(2);
    expect(one.movements.map(movement => movement.aliases[0].logIndex)).toEqual([1, 3]);
    expect(one.movements.every(movement => movement.interface === 'ambiguous' && movement.aliases[0].mappingStatus === 'ambiguous')).toBe(true);
    expect(new Set(one.movements.flatMap(movement => movement.aliases.map(alias => alias.id))).size).toBe(2);
    expect(one.warnings.join(' ')).toContain('automatic annotation migration is unsafe');
  });
  it('preserves unmatched ERC-20 source evidence without fabricating system movements', () => {
    const data = normalizeFinanceReceipt(receipt([log(0), log(1, peer, wallet, 1000000n, ARC_USDC), log(2, peer, wallet, 1000000n, ARC_USDC), log(3, peer, wallet, 2n, ARC_USDC)]), time, wallet);
    expect(data.movements).toHaveLength(1); expect(data.movements[0].aliases).toHaveLength(1); expect(data.movements[0].interface).toBe('ambiguous');
    expect(data.unmappedAliases.map(alias => alias.logIndex)).toEqual([2, 3]); expect(data.unmappedAliases.every(alias => alias.mappingStatus === 'unmapped')).toBe(true);
    const mirrorFirst = normalizeFinanceReceipt(receipt([log(0, peer, wallet, 1000000n, ARC_USDC), log(1)]), time, wallet);
    expect(mirrorFirst.movements[0].aliases[0].mappingStatus).toBe('ambiguous');
  });
  it('distinguishes in/out/mint/burn, keeps viewing-wallet independent identity and excludes self/zero/foreign/removed logs', () => {
    const events = [log(0), log(1, wallet, peer, 2n), log(2, zero, wallet, 3n), log(3, wallet, zero, 4n), log(4, wallet, wallet, 5n), log(5, peer, wallet, 0n), log(6, peer, wallet, 9n, other), {...log(7), removed: true}, log(8, peer, other, 2n)];
    const data = normalizeFinanceReceipt(receipt(events), time, wallet);
    expect(data.movements.map(movement => movement.direction)).toEqual(['in', 'out', 'mint', 'burn']);
    const otherView = normalizeFinanceReceipt(receipt([log(0)]), time, peer); expect(otherView.movements[0].id).toBe(data.movements[0].id); expect(otherView.movements[0].direction).toBe('out');
  });
  it('validates receipt/log hashes, blocks, indices, quantities, status and conflicting duplicate logs', () => {
    const good = receipt([log(0)]);
    for (const patch of [{transactionHash: 'bad'}, {blockHash: '0x00'}, {blockNumber: -1n}, {from: zero}, {gasUsed: -1n}, {effectiveGasPrice: undefined}, {status: 'pending'}]) {
      expect(() => normalizeFinanceReceipt({...good, ...patch} as TransactionReceipt, time, wallet)).toThrow();
    }
    for (const patch of [{transactionHash: hash(2)}, {blockHash: otherBlockHash}, {blockNumber: 5001n}, {logIndex: -1}, {logIndex: null}, {data: '0x01'}]) {
      expect(() => normalizeFinanceReceipt(receipt([{...log(0), ...patch}] as FinanceMovementLog[]), time, wallet)).toThrow();
    }
    expect(() => normalizeFinanceReceipt(receipt([log(0), log(0, peer, wallet, 2n)]), time, wallet)).toThrow('Conflicting');
    expect(normalizeFinanceReceipt(receipt([log(0), log(0)]), time, wallet).movements).toHaveLength(1);
    expect(() => normalizeFinanceReceipt(good, -1n, wallet)).toThrow(); expect(() => normalizeFinanceReceipt(good, time, zero)).toThrow();
  });
  it('keeps a reverted receipt fee but never accepts transfer evidence from it', () => {
    const data = normalizeFinanceReceipt({...receipt([]), status: 'reverted'}, time, wallet);
    expect(data.movements).toHaveLength(0); expect(data.fee.status).toBe('reverted'); expect(data.fee.raw18).toBe('420000000000000');
    expect(() => normalizeFinanceReceipt({...receipt([log(0)]), status: 'reverted'}, time, wallet)).toThrow('reverted');
  });
  it('rejects oversized receipt evidence before decoding it', () => {
    expect(() => normalizeFinanceReceipt(receipt(Array(FINANCE_MOVEMENT_LOG_LIMIT + 1).fill(log(0))), time, wallet)).toThrow('evidence limit');
  });
});

describe('Bounded manual Finance USDC scan', () => {
  it('reads both directions once, deduplicates receipt reads and preserves canonical movements/fees', async () => {
    const events = [log(0), log(1, wallet, peer, 1n), log(2, zero, wallet, 2n), log(3, wallet, zero, 3n)], provider = reader(events); let calls = 0; const ranges: unknown[] = [];
    const query = provider.logs; provider.logs = async (...args) => {ranges.push(args); return query(...args);}; const get = provider.receipt; provider.receipt = async tx => {calls++; return get(tx);};
    const data = await scanFinanceMovements(wallet, provider, {now: 1791781200000});
    expect(ranges).toEqual([[wallet, 5000n - BigInt(FINANCE_MOVEMENT_BLOCK_WINDOW - 1), 5000n, 'in'], [wallet, 5000n - BigInt(FINANCE_MOVEMENT_BLOCK_WINDOW - 1), 5000n, 'out']]);
    expect(calls).toBe(1); expect(data.movements).toHaveLength(4); expect(data.fees).toHaveLength(1);
    expect(data.coverage).toMatchObject({complete: true, truncated: false, checkedTransactions: 1, candidateTransactions: 1, failedTransactions: 0, includesGas: true, includesGasOnlyTransactions: false, scope: 'bounded_usdc_transfers'});
  });
  it('rejects wrong network and invalid ranges before querying logs; supports explicit bounded history', async () => {
    const provider = reader(); let queries = 0; provider.logs = async () => {queries++; return [];}; provider.chainId = async () => 5042002;
    await expect(scanFinanceMovements(wallet, provider)).rejects.toThrow('Mainnet'); expect(queries).toBe(0);
    provider.chainId = async () => 5042;
    for (const options of [{fromBlock: 0n, toBlock: 5000n}, {fromBlock: 9n, toBlock: 8n}, {toBlock: 5001n}, {fromBlock: -1n}]) await expect(scanFinanceMovements(wallet, provider, options)).rejects.toThrow();
    expect(queries).toBe(0);
    const data = await scanFinanceMovements(wallet, provider, {fromBlock: 4000n, toBlock: 4100n}); expect(data.coverage.fromBlock).toBe('4000'); expect(data.coverage.toBlock).toBe('4100'); expect(data.coverage.complete).toBe(true);
  });
  it('caps transactions/events with incomplete coverage and never collapses repeated transfers', async () => {
    const many = Array.from({length: 30}, (_, i) => log(0, peer, wallet, BigInt(i + 1), FINANCE_SYSTEM_EMITTER, hash(i + 1))), provider = reader(many); let calls = 0;
    const get = provider.receipt; provider.receipt = async tx => {calls++; return get(tx);};
    const data = await scanFinanceMovements(wallet, provider); expect(calls).toBe(FINANCE_MOVEMENT_TRANSACTION_LIMIT); expect(data.coverage.candidateTransactions).toBe(30); expect(data.coverage.truncated).toBe(true); expect(data.coverage.complete).toBe(false);
    const events = Array.from({length: FINANCE_MOVEMENT_EVENT_LIMIT + 1}, (_, i) => log(i));
    const limited = await scanFinanceMovements(wallet, reader(events)); expect(limited.movements).toHaveLength(FINANCE_MOVEMENT_EVENT_LIMIT); expect(limited.fees).toHaveLength(1); expect(limited.coverage.complete).toBe(false); expect(limited.coverage.truncated).toBe(true);
  });
  it('does not report full coverage after a receipt failure and throws when all evidence fails', async () => {
    const events = [log(0), log(1, peer, wallet, 1n, FINANCE_SYSTEM_EMITTER, hash(2))], provider = reader(events), get = provider.receipt;
    provider.receipt = async tx => {if (tx === hash(2)) throw new Error('RPC failed'); return get(tx);};
    const partial = await scanFinanceMovements(wallet, provider); expect(partial.movements).toHaveLength(1); expect(partial.coverage.failedTransactions).toBe(1); expect(partial.coverage.complete).toBe(false);
    provider.receipt = async () => {throw new Error('RPC failed');}; await expect(scanFinanceMovements(wallet, provider)).rejects.toThrow('previous snapshot');
    provider.logs = async () => {throw new Error('log source failed');}; await expect(scanFinanceMovements(wallet, provider)).rejects.toThrow('log source failed');
  });
  it('verifies receipt payload against scanned logs and validates block evidence', async () => {
    for (const patch of [{transactionHash: hash(2)}, {blockNumber: 4999n}, {blockHash: otherBlockHash}, {logs: [log(0, peer, wallet, 2n)]}, {status: 'reverted'}]) {
      const provider = reader(); provider.receipt = async () => ({...receipt([log(0)]), ...patch} as TransactionReceipt);
      await expect(scanFinanceMovements(wallet, provider)).rejects.toThrow('previous snapshot');
    }
    const provider = reader(); provider.latest = async () => ({number: 5000n, hash: otherBlockHash, timestamp: time});
    await expect(scanFinanceMovements(wallet, provider)).rejects.toThrow('previous snapshot');
    const inconsistent = reader(); inconsistent.logs = async () => [log(0), log(0, peer, wallet, 2n)];
    await expect(scanFinanceMovements(wallet, inconsistent)).rejects.toThrow('conflicts');
  });
  it('ignores removed/foreign/system-zero/self logs and fails on out-of-window provider evidence', async () => {
    const provider = reader(); provider.logs = async () => [{...log(0), removed: true}, log(1, peer, wallet, 1n, other), log(2, wallet, wallet, 1n), log(3, peer, wallet, 0n)];
    const data = await scanFinanceMovements(wallet, provider); expect(data.movements).toHaveLength(0); expect(data.coverage.complete).toBe(true);
    provider.logs = async () => [log(0, peer, wallet, 1n, FINANCE_SYSTEM_EMITTER, hash(1), 1n)]; await expect(scanFinanceMovements(wallet, provider)).rejects.toThrow('outside');
  });
  it('stops after consecutive failures and marks the remaining bounded scan incomplete', async () => {
    const events = Array.from({length: 6}, (_, i) => log(0, peer, wallet, BigInt(i + 1) * scale, FINANCE_SYSTEM_EMITTER, hash(i + 1))), provider = reader(events), get = provider.receipt;
    provider.receipt = async tx => {if (tx !== hash(1)) throw new Error('RPC down'); return get(tx);};
    const data = await scanFinanceMovements(wallet, provider); expect(data.coverage.checkedTransactions).toBe(4); expect(data.coverage.failedTransactions).toBe(3); expect(data.coverage.truncated).toBe(true); expect(data.coverage.complete).toBe(false);
  });
  it('caps provider log parsing and explicitly marks incomplete coverage', async () => {
    const provider = reader(); provider.logs = async (_wallet, _from, _to, direction) => direction === 'in' ? Array(FINANCE_MOVEMENT_LOG_LIMIT + 1).fill(log(0)) : [];
    const data = await scanFinanceMovements(wallet, provider);
    expect(data.movements).toHaveLength(1); expect(data.fees).toHaveLength(1);
    expect(data.coverage).toMatchObject({candidateTransactions: 1, checkedTransactions: 1, truncated: true, complete: false});
    expect(data.warnings.join(' ')).toContain('Provider log limit');
  });
  it('retains only verified evidence when the wall-clock budget expires and does no later receipt work', async () => {
    const events = [log(0), log(0, peer, wallet, 2n, FINANCE_SYSTEM_EMITTER, hash(2)), log(0, peer, wallet, 3n, FINANCE_SYSTEM_EMITTER, hash(3))];
    const provider = reader(events), get = provider.receipt; let clock = 0, calls = 0;
    provider.receipt = async tx => {calls++; clock = tx === hash(1) ? FINANCE_MOVEMENT_SCAN_TIMEOUT_MS - 1 : FINANCE_MOVEMENT_SCAN_TIMEOUT_MS; return get(tx);};
    const data = await scanFinanceMovements(wallet, provider, {clock: () => clock});
    expect(calls).toBe(2); expect(data.movements).toHaveLength(1); expect(data.movements[0].hash).toBe(hash(1));
    expect(data.coverage).toMatchObject({checkedTransactions: 2, failedTransactions: 1, candidateTransactions: 3, truncated: true, complete: false});
    expect(data.warnings.join(' ')).toContain('time limit');
  });
  it('throws instead of fabricating an empty scan if the deadline expires before any receipt is verified', async () => {
    const provider = reader(); let clock = 0; provider.receipt = async () => {clock = FINANCE_MOVEMENT_SCAN_TIMEOUT_MS; return receipt([log(0)]);};
    await expect(scanFinanceMovements(wallet, provider, {clock: () => clock})).rejects.toThrow('previous snapshot');
  });
});
