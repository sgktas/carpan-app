/** Discovery is a hint, kept separately from canonical receipt evidence. */
export type FinanceDiscoverySource = 'blockscout_pro' | 'blockscout_public' | 'explorer_unknown' | 'local_index' | 'collection_receipt' | 'arc_rpc';
export type FinanceMovementDiscovery = {
  source: FinanceDiscoverySource;
  endpoint: 'address_token_transfers' | 'local_transfer_index' | 'saved_collection_receipt' | 'transfer_logs' | 'transaction_receipt';
  /** Original provider acquisition time for cached pages; lookup time for local hints. */
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
};
const endpoints: Record<FinanceDiscoverySource, FinanceMovementDiscovery['endpoint'][]> = {
  blockscout_pro: ['address_token_transfers'], blockscout_public: ['address_token_transfers'], explorer_unknown: ['address_token_transfers'],
  local_index: ['local_transfer_index'], collection_receipt: ['saved_collection_receipt'], arc_rpc: ['transfer_logs', 'transaction_receipt'],
};
export function validFinanceDiscovery(value: unknown): value is FinanceMovementDiscovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as FinanceMovementDiscovery;
  return Object.prototype.hasOwnProperty.call(endpoints, row.source) && endpoints[row.source].includes(row.endpoint)
    && typeof row.fetchedAt === 'string' && row.fetchedAt.length <= 32 && Number.isFinite(Date.parse(row.fetchedAt))
    && typeof row.cached === 'boolean' && typeof row.stale === 'boolean'
    && (!(row.source === 'arc_rpc' || row.source === 'local_index' || row.source === 'collection_receipt') || !row.cached && !row.stale);
}
/** Preserve first acquisition per provider/resource; refreshing a receipt must not erase discovery. */
export function mergeFinanceDiscovery(prior: FinanceMovementDiscovery[] = [], incoming: FinanceMovementDiscovery[] = []): FinanceMovementDiscovery[] {
  const rows = new Map<string, FinanceMovementDiscovery>();
  for (const row of [...prior, ...incoming]) {
    const key = `${row.source}:${row.endpoint}`;
    if (!rows.has(key)) rows.set(key, row);
  }
  return [...rows.values()];
}
export function financeExplorerSource(source: string): FinanceDiscoverySource {
  if (/^Blockscout PRO(?:$| · )/.test(source)) return 'blockscout_pro';
  if (/^Blockscout Explorer(?:$| · )/.test(source)) return 'blockscout_public';
  return 'explorer_unknown';
}
