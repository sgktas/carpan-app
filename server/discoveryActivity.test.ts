import { test, expect } from 'bun:test';
import { loadedAddressActivity } from '../src/discovery-activity';
import type { DiscoveryTransfer } from '../src/discovery-transfers';

const row = (id: string, overrides: Partial<DiscoveryTransfer> = {}): DiscoveryTransfer => ({
  id, title: 'transfer', address: null, from: 'alice', to: 'bob', hash: null,
  token: 'coin', symbol: 'COIN', raw: '1000000', decimals: 6, nftId: null,
  block: 100, timestamp: '2026-10-08T10:00:00Z', status: null, data: {},
  network: { id: '5042', name: 'Arc Mainnet', explorer: 'https://explorer.arc.io', isTestnet: false, nativeSymbol: 'USDC', nativeDecimals: 18 }, source: 'fixture', ...overrides,
});

test('loaded address facts isolate the network and count self transfers only once', () => {
  const items = [row('sent'), row('received', { from: 'carol', to: 'alice', block: 103 }),
    row('self', { from: 'alice', to: 'alice', block: 102 }), row('unknown-peer', { to: null }),
    row('unrelated', { from: 'carol', to: 'dave' }),
    row('other-network', { network: { ...row('x').network, id: '1' }, block: 999 })];
  const result = loadedAddressActivity(items, '5042', 'alice');
  expect([result.total, result.sent, result.received, result.self, result.counterparties, result.latestBlock]).toEqual([4, 2, 1, 1, 2, 103]);
  expect(result.bins).toEqual([{ received: 1, sent: 2, self: 1, from: Date.parse(items[0].timestamp!), to: Date.parse(items[0].timestamp!) }]);
});

test('real timestamp buckets preserve sparse intervals and all loaded event counts', () => {
  const result = loadedAddressActivity([
    row('start'), row('middle', { from: 'carol', to: 'alice', timestamp: '2026-10-08T10:06:00Z' }),
    row('end', { timestamp: '2026-10-08T10:12:00Z' }),
  ], '5042', 'alice');
  expect(result.timed).toBe(true);
  expect(result.bins.length).toBe(12);
  expect(result.bins.map(bin => bin.sent + bin.received + bin.self)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  expect(result.first).toBe(Date.parse('2026-10-08T10:00:00Z'));
  expect(result.last).toBe(Date.parse('2026-10-08T10:12:00Z'));
});

test('missing or invalid timestamps use explicit per-record sequence without invented dates', () => {
  for (const timestamp of [null, 'not-a-date']) {
    const items = Array.from({ length: 19 }, (_, index) => row(String(index), { timestamp: index === 5 ? timestamp : '2026-10-08T10:00:00Z', from: index % 2 ? 'alice' : 'bob', to: index % 2 ? 'bob' : 'alice' }));
    const result = loadedAddressActivity(items, '5042', 'alice');
    expect(result.timed).toBe(false);
    expect([result.first, result.last, result.total, result.shown]).toEqual([null, null, 19, 16]);
    expect(result.bins.every(bin => bin.from === null && bin.to === null && bin.sent + bin.received + bin.self === 1)).toBe(true);
    expect(result.bins[0].received).toBe(1);
    expect(result.bins[1].sent).toBe(1);
  }
});

test('mixed token amounts and NFTs never become a balance or shared volume', () => {
  const result = loadedAddressActivity([row('erc20'), row('large', { token: 'other', raw: '9999999999999999999999999', decimals: 18 }), row('nft', { token: 'nft', nftId: '77', raw: '1' })], '5042', 'alice');
  expect([result.total, result.sent]).toEqual([3, 3]);
  expect(result).not.toHaveProperty('volume');
  expect(result).not.toHaveProperty('balance');
  const empty = loadedAddressActivity([], '5042', 'alice');
  expect([empty.total, empty.latestBlock, empty.timed, empty.bins.length]).toEqual([0, null, false, 0]);
});
