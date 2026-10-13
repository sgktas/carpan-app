import { decodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem';

export type ChainReceipt = {
  status: string;
  to: string | null;
  from: string;
  blockNumber: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
};

const CHAIN_ID = 5042002;
const paymentTopic = keccak256(toHex('PaymentReleased(bytes32,bytes32,address,uint256,uint256)')).toLowerCase();
const refundTopic = keccak256(toHex('BudgetRefunded(bytes32,uint256,address)')).toLowerCase();
const oracleSelector = keccak256(toHex('oracle()')).slice(0, 10);

export function bytes32Id(id: string): string { return keccak256(toHex(id)).toLowerCase(); }

function indexedAddress(topic: string | undefined): string {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) throw new Error('Invalid indexed address');
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function successfulReceipt(receipt: ChainReceipt, escrow: string): void {
  if (receipt.status !== '0x1' || receipt.to?.toLowerCase() !== escrow.toLowerCase()) {
    throw new Error('Transaction did not succeed at the configured escrow');
  }
  if (!/^0x[0-9a-fA-F]+$/.test(receipt.blockNumber) || Number.parseInt(receipt.blockNumber, 16) <= 0) {
    throw new Error('Missing confirmed block');
  }
}

export function verifyReleaseReceipt(receipt: ChainReceipt, expected: {
  escrow: string; orderId: string; participationId: string; participant: string;
  participantShare: bigint; platformShare: bigint;
}): void {
  successfulReceipt(receipt, expected.escrow);
  const log = (receipt.logs || []).find(l => l.address?.toLowerCase() === expected.escrow.toLowerCase()
    && l.topics?.[0]?.toLowerCase() === paymentTopic
    && l.topics?.[1]?.toLowerCase() === bytes32Id(expected.orderId)
    && l.topics?.[2]?.toLowerCase() === bytes32Id(expected.participationId));
  if (!log || indexedAddress(log.topics[3]) !== expected.participant.toLowerCase()) {
    throw new Error('PaymentReleased event does not match this participant');
  }
  const [participantShare, platformShare] = decodeAbiParameters(
    parseAbiParameters('uint256 participantShare, uint256 platformShare'), log.data as `0x${string}`,
  );
  if (participantShare !== expected.participantShare || platformShare !== expected.platformShare) {
    throw new Error('PaymentReleased amounts differ from this order');
  }
}

export function verifyRefundReceipt(receipt: ChainReceipt, expected: {
  escrow: string; orderId: string; owner: string; amount: bigint;
}): void {
  successfulReceipt(receipt, expected.escrow);
  const log = (receipt.logs || []).find(l => l.address?.toLowerCase() === expected.escrow.toLowerCase()
    && l.topics?.[0]?.toLowerCase() === refundTopic
    && l.topics?.[1]?.toLowerCase() === bytes32Id(expected.orderId));
  if (!log || indexedAddress(log.topics[2]) !== expected.owner.toLowerCase()) {
    throw new Error('BudgetRefunded event does not match this order');
  }
  const [refunded] = decodeAbiParameters(parseAbiParameters('uint256 amount'), log.data as `0x${string}`);
  if (refunded !== expected.amount) throw new Error('BudgetRefunded amount differs from the request');
}

function rpcUrl(): string {
  const proxyChains = (process.env.RPC_PROXY_CHAINS || '').split(',').map(s => s.trim());
  if (process.env.RPC_PROXY_BASE_URL && process.env.RPC_PROXY_TOKEN && proxyChains.includes('Arc_Testnet')) {
    return `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${encodeURIComponent(process.env.RPC_PROXY_TOKEN)}`;
  }
  return process.env.VITE_ARC_RPC || '';
}

export async function arcRpc<T>(method: string, params: unknown[]): Promise<T> {
  const url = rpcUrl();
  if (!url) throw new Error('Arc Testnet RPC is not configured');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`Arc RPC returned HTTP ${response.status}`);
  const data = await response.json() as { result?: T; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message || 'Arc RPC error');
  if (data.result === undefined) throw new Error('Arc RPC returned no result');
  return data.result;
}

export async function assertArcTestnet(): Promise<void> {
  const chainId = await arcRpc<string>('eth_chainId', []);
  if (Number.parseInt(chainId, 16) !== CHAIN_ID) throw new Error('RPC is not Arc Testnet');
}

export async function escrowOracle(escrow: string): Promise<string> {
  await assertArcTestnet();
  const result = await arcRpc<string>('eth_call', [{ to: escrow, data: oracleSelector }, 'latest']);
  if (!/^0x[0-9a-fA-F]{64}$/.test(result)) throw new Error('Escrow oracle() returned invalid data');
  return indexedAddress(result);
}
