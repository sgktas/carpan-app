/** A provider can emit an empty newHeads payload while reconnecting. */
export function streamBlockNumber(block: unknown): bigint | null {
  if (!block || typeof block !== 'object') return null;
  const number = (block as {number?: unknown}).number;
  return typeof number === 'bigint' && number >= 0n ? number : null;
}
