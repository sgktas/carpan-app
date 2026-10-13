import type {FinanceMovementDiscovery} from './finance-discovery';
/** Canonical Arc Mainnet USDC evidence. Native/system quantities retain all 18 decimals. */
export type FinanceMovementDirection = 'in' | 'out' | 'mint' | 'burn';

/** A preserved ERC-20 source identity, including the old Finance annotation key. */
export type FinanceMovementAlias = {
  id: string;
  hash: string;
  logIndex: number;
  emitter: string;
  raw6: string;
  decimals: 6;
  mappingStatus: 'matched' | 'ambiguous' | 'unmapped';
};

export type FinanceMovement = {
  /** chainId:transactionHash:systemLogIndex; independent of a viewer's wallet. */
  id: string;
  chainId: 5042;
  wallet: string;
  hash: string;
  logIndex: number;
  block: string;
  blockHash: string;
  timestamp: string;
  from: string;
  to: string;
  asset: 'USDC';
  token: string;
  raw18: string;
  decimals: 18;
  direction: FinanceMovementDirection;
  emitter: string;
  source: 'arc_system_events';
  interface: 'native' | 'erc20' | 'ambiguous';
  /** Ambiguous aliases are retained for inspection, never automatic annotation migration. */
  aliases: FinanceMovementAlias[];
  /** Optional for legacy snapshots. Never inferred from another movement or a current cache read. */
  discovery?: FinanceMovementDiscovery[];
  verifiedAt?: string;
};

/** A receipt's total transaction fee is stored once, separately from its movements. */
export type FinanceTransactionFee = {
  id: string;
  chainId: 5042;
  hash: string;
  block: string;
  blockHash: string;
  timestamp: string;
  gasPayer: string;
  gasUsed: string;
  effectiveGasPrice: string;
  raw18: string;
  decimals: 18;
  asset: 'USDC';
  status: 'success' | 'reverted';
  source: 'receipt';
};

export type FinanceMovementCoverage = {
  wallet: string;
  fromBlock: string;
  toBlock: string;
  toBlockHash: string;
  fetchedAt: string;
  checkedTransactions: number;
  candidateTransactions: number;
  failedTransactions: number;
  truncated: boolean;
  blockWindow: number;
  transactionLimit: number;
  eventLimit: number;
  /** Complete only within this explicitly bounded transfer-log window. Never full-history coverage. */
  complete: boolean;
  scope: 'bounded_usdc_transfers' | 'receipt_import';
  includesGas: true;
  /** Fee-only/failed calls and block rewards are outside a Transfer-log scan. */
  includesGasOnlyTransactions: false;
};

export type FinanceMovementScan = {
  wallet: string;
  movements: FinanceMovement[];
  fees: FinanceTransactionFee[];
  unmappedAliases: FinanceMovementAlias[];
  warnings: string[];
  coverage: FinanceMovementCoverage;
};
