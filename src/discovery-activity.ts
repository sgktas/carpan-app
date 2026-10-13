import type { DiscoveryTransfer } from './discovery-transfers';

export type ActivityDirection = 'received' | 'sent' | 'self';
export type ActivityBin = {
  received: number; sent: number; self: number;
  from: number | null; to: number | null;
};

/** Address facts from one loaded, filtered page. No history or ownership inference. */
export function loadedAddressActivity(items: DiscoveryTransfer[], network: string, address: string) {
  const records = items.filter(item => item.network.id === network && (item.from === address || item.to === address));
  const directions = records.map(item => item.from === address && item.to === address
    ? 'self' : item.to === address ? 'received' : 'sent') as ActivityDirection[];
  const counts = { received: 0, sent: 0, self: 0 };
  const counterparties = new Set<string>();
  const sources = new Set<string>();
  let latestBlock: number | null = null;
  for (const [index, item] of records.entries()) {
    counts[directions[index]]++;
    const other = item.from === address ? item.to : item.from;
    if (other && other !== address) counterparties.add(other);
    if (item.source) sources.add(item.source);
    if (item.block !== null && Number.isSafeInteger(item.block) && item.block >= 0) {
      latestBlock = latestBlock === null ? item.block : Math.max(latestBlock, item.block);
    }
  }
  const timestamps = records.map(item => item.timestamp ? Date.parse(item.timestamp) : NaN);
  const timed = records.length > 0 && timestamps.every(Number.isFinite);
  const first = timed ? Math.min(...timestamps) : null;
  const last = timed ? Math.max(...timestamps) : null;
  const makeBin = (from: number | null = null, to: number | null = null): ActivityBin => ({ received: 0, sent: 0, self: 0, from, to });
  let bins: ActivityBin[];
  if (first !== null && last !== null) {
    const size = first === last ? 1 : 12;
    const span = last - first;
    bins = Array.from({ length: size }, (_, index) => makeBin(first + span * index / size, first + span * (index + 1) / size));
    timestamps.forEach((time, index) => {
      const bucket = span ? Math.min(size - 1, Math.floor((time - first) / span * size)) : 0;
      bins[bucket][directions[index]]++;
    });
  } else {
    // An unavailable/invalid timestamp must never be replaced by an invented date.
    // Each visible column is exactly one record, in its existing loaded-page order.
    bins = directions.slice(0, 16).map(direction => { const bin = makeBin(); bin[direction] = 1; return bin; });
  }
  return { total: records.length, ...counts, counterparties: counterparties.size, latestBlock,
    sources: [...sources], timed, first, last, bins, shown: timed ? records.length : bins.length };
}
