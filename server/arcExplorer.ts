import {explorerRequest,cacheHit} from './explorerBudget';
/** Read-only Arc Explorer (Blockscout) enrichment. All URLs are server-owned. */

import { formatUnits } from 'viem';

const proKey = process.env.BLOCKSCOUT_PRO_API_KEY?.trim() || null;
const EXPLORER_API = (process.env.ARC_EXPLORER_API_URL ||
  (proKey ? 'https://api.blockscout.com/5042/api/v2' : 'https://explorer.arc.io/api/v2')).replace(/\/$/, '');
const cache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();


function cached<T>(key: string, lifetimeMs: number, load: () => Promise<T>): Promise<T> {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) {cacheHit();return current.value as Promise<T>;}
  const value = load().catch(error => { cache.delete(key); throw error; });
  cache.set(key, { expiresAt: Date.now() + Math.min(lifetimeMs,60000), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

export async function explorerGet<T>(path: string): Promise<T> {
 const publicUrl=`https://explorer.arc.io/api/v2${path}`;
 const result=await explorerRequest(`${EXPLORER_API}${path}`,publicUrl,proKey||undefined,60000,false,false,'arc_enrichment');
 return result.payload as T;
}

/** Metadata research may reuse five-minute evidence. Alerts retain their separate
 * sixty-second, fresh-only contract, and live balances still come from Arc RPC. */
export async function explorerResearchGet<T>(path:string,request:typeof explorerRequest=explorerRequest,clock:()=>number=Date.now):Promise<ExplorerHistoryResult<T>>{
 if(!/^\/addresses\/0x[0-9a-f]{40}(?:\/(?:tokens\?type=ERC-20|coin-balance-history|counters))?$/i.test(path))throw new Error('Invalid wallet research resource.');
 const result=await request(`${EXPLORER_API}${path}`,`https://explorer.arc.io/api/v2${path}`,proKey||undefined,300000,false,false,'research');
 const age=clock()-result.fetchedAt;
 if(!Number.isSafeInteger(result.fetchedAt)||result.fetchedAt<0||age<0||age>300000)throw new Error('Wallet research evidence is outside its cache window.');
 return {payload:result.payload as T,source:result.source,fetchedAt:new Date(result.fetchedAt).toISOString(),cached:result.cached,stale:age>60000};
}

/** Background alert pages must be fresh and count against background allowance. */
export async function explorerAlertGet<T>(path:string):Promise<T>{
 const result=await explorerRequest(`${EXPLORER_API}${path}`,`https://explorer.arc.io/api/v2${path}`,proKey||undefined,60000,true,false,'alerts');
 return result.payload as T;
}

export type ExplorerHistoryResult<T>={payload:T;source:string;fetchedAt:string;stale:boolean;cached:boolean};
export class ExplorerHistoryError extends Error{
 constructor(public code:'history_budget_reserved'|'history_unavailable',message:string,public status=503){super(message);this.name='ExplorerHistoryError';}
}
/**
 * Stored wallet pages are useful historical evidence, not a fresh chain scan.
 * Other Explorer callers retain explorerGet's fresh-only contract.
 */
export async function explorerHistoryGet<T>(path:string,request:typeof explorerRequest=explorerRequest,clock:()=>number=Date.now,cacheTtl=60000,purpose:'finance_history'|'research'='finance_history'):Promise<ExplorerHistoryResult<T>>{
 if(!/^\/addresses\/0x[0-9a-f]{40}\/token-transfers(?:\?|$)/i.test(path))throw new ExplorerHistoryError('history_unavailable','Geçerli bir cüzdan geçmişi sorgusu gerekli.');
 try{
  const publicUrl=`https://explorer.arc.io/api/v2${path}`;
  const result=await request(`${EXPLORER_API}${path}`,publicUrl,proKey||undefined,cacheTtl,false,true,purpose);
  const age=clock()-result.fetchedAt;
  if(!Number.isSafeInteger(result.fetchedAt)||result.fetchedAt<0||age<0||age>86400000)throw new ExplorerHistoryError('history_unavailable','Cüzdanın son 24 saate ait kayıtlı geçmişi alınamadı. Daha sonra yeniden dene.');
  return {payload:result.payload as T,source:result.source,fetchedAt:new Date(result.fetchedAt).toISOString(),stale:age>60000,cached:result.cached};
 }catch(error){
  if(error instanceof ExplorerHistoryError)throw error;
  if(error instanceof Error&&error.message.includes('API bütçesi korunuyor'))throw new ExplorerHistoryError('history_budget_reserved','Explorer bütçe rezervi korunuyor; bu cüzdanın güncel kayıtlı geçmişi yok. Daha sonra yeniden dene.');
  throw new ExplorerHistoryError('history_unavailable','Cüzdan hareketleri veri kaynağından alınamadı. Daha sonra yeniden dene.');
 }
}

/** Public transfer discovery shares five-minute provider pages, while original
 * acquisition time and the existing >60-second stale flag remain explicit. */
export function explorerPublicHistoryGet<T>(path:string,request:typeof explorerRequest=explorerRequest,clock:()=>number=Date.now):Promise<ExplorerHistoryResult<T>>{
 return explorerHistoryGet<T>(path,request,clock,300000,'research');
}

type ExplorerAddress = {
  hash: string;
  is_contract: boolean;
  is_verified: boolean;
  name: string | null;
  proxy_type: string | null;
  creator_address_hash: string | null;
  creation_transaction_hash: string | null;
  token: {
    type: string; name: string | null; symbol: string | null;
    decimals: string | null; holders_count: string | null;
  } | null;
};

type ExplorerVerifiedResponse = { items: {
  address: { hash: string; name: string | null; proxy_type: string | null };
  name: string | null;
  verified_at: string;
  language: string | null;
  transactions_count: number | null;
}[] };

type ExplorerPage<T> = { items?: T[] };
type ExplorerAddressCounters = {
  transactions_count?: string | number | null;
  token_transfers_count?: string | number | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function addressHash(value: unknown): string | null {
  const hash = typeof value === 'string' ? value : text(record(value).hash);
  return hash && /^0x[0-9a-f]{40}$/i.test(hash) ? hash.toLowerCase() : null;
}

function safeCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function explorerItems<T>(value: unknown): T[] {
  const items = record(value).items;
  return Array.isArray(items) ? items as T[] : [];
}

function normalizedTransaction(value: unknown) {
  const item = record(value);
  const hash = text(item.hash);
  if (!hash || !/^0x[0-9a-f]{64}$/i.test(hash)) return null;
  const toAddress = addressHash(item.to);
  const transactionTypes = Array.isArray(item.transaction_types) ? item.transaction_types : [];
  const kind = text(transactionTypes[0]) || (item.to === null ? 'contract_creation' :
    text(item.method) ? 'contract_call' : 'transaction');
  const blockNumber = safeCount(item.block_number ?? item.block);
  return {
    transactionHash: hash.toLowerCase(),
    fromAddress: addressHash(item.from),
    toAddress,
    blockNumber,
    timestamp: text(item.timestamp),
    method: text(item.method),
    kind,
  };
}

function normalizedTransfer(value: unknown) {
  const item = record(value);
  const hash = text(item.transaction_hash ?? item.tx_hash);
  if (!hash || !/^0x[0-9a-f]{64}$/i.test(hash)) return null;
  const token = record(item.token);
  const total = record(item.total);
  const decimals = safeCount(total.decimals ?? token.decimals);
  let amount: string | null = null;
  if (typeof total.value === 'string' && /^\d+$/.test(total.value) && decimals !== null && decimals <= 36) {
    try {
      amount = formatUnits(BigInt(total.value), decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    } catch { /* Malformed explorer amounts stay unavailable. */ }
  }
  return {
    transactionHash: hash.toLowerCase(),
    fromAddress: addressHash(item.from),
    toAddress: addressHash(item.to),
    blockNumber: safeCount(item.block_number),
    timestamp: text(item.timestamp),
    tokenAddress: addressHash(token.address_hash),
    tokenName: text(token.name),
    tokenSymbol: text(token.symbol),
    tokenType: text(item.type) || text(token.type),
    amount,
  };
}

/** Address identity, recent activity and token transfers from Arc Explorer's Blockscout API. */
export function getArcAddressIntelligence(address: string) {
  return cached(`address-intelligence:${address.toLowerCase()}`, 20_000, async () => {
    const encoded = encodeURIComponent(address);
    const [addressResult, transactionsResult, transfersResult, countersResult] = await Promise.allSettled([
      getArcExplorerAddress(address),
      explorerGet<ExplorerPage<unknown>>(`/addresses/${encoded}/transactions`),
      explorerGet<ExplorerPage<unknown>>(`/addresses/${encoded}/token-transfers`),
      explorerGet<ExplorerAddressCounters>(`/addresses/${encoded}/counters`),
    ]);
    if (addressResult.status === 'rejected') throw addressResult.reason;

    const explorerAddress = addressResult.value;
    const counters = countersResult.status === 'fulfilled' ? countersResult.value : {};
    const transactions = transactionsResult.status === 'fulfilled'
      ? explorerItems<unknown>(transactionsResult.value).map(normalizedTransaction).filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 25)
      : [];
    const transfers = transfersResult.status === 'fulfilled'
      ? explorerItems<unknown>(transfersResult.value).map(normalizedTransfer).filter((item): item is NonNullable<typeof item> => item !== null).slice(0, 25)
      : [];
    const parsedDecimals = explorerAddress.token?.decimals === null || explorerAddress.token?.decimals === undefined
      ? null : Number(explorerAddress.token.decimals);
    const decimals = parsedDecimals !== null && Number.isInteger(parsedDecimals) && parsedDecimals >= 0 && parsedDecimals <= 36
      ? parsedDecimals : null;

    return {
      address: explorerAddress.hash.toLowerCase(),
      name: explorerAddress.name || explorerAddress.token?.name || null,
      isContract: Boolean(explorerAddress.is_contract),
      sourceVerified: typeof explorerAddress.is_verified === 'boolean' ? explorerAddress.is_verified : null,
      proxyType: explorerAddress.proxy_type,
      token: explorerAddress.token ? {
        name: explorerAddress.token.name,
        symbol: explorerAddress.token.symbol,
        type: explorerAddress.token.type,
        decimals,
        holdersCount: explorerAddress.token.holders_count,
      } : null,
      creatorAddress: addressHash(explorerAddress.creator_address_hash),
      creationTransactionHash: text(explorerAddress.creation_transaction_hash),
      transactionCount: safeCount(counters.transactions_count),
      tokenTransferCount: safeCount(counters.token_transfers_count),
      transactions,
      transfers,
    };
  });
}

export function getArcExplorerAddress(address: string): Promise<ExplorerAddress> {
  address=address.toLowerCase();
  return explorerResearchGet<ExplorerAddress>(`/addresses/${address}`).then(result=>result.payload);
}

export function getArcRecentlyVerified() {
  return cached('recently-verified', 60_000, async () => {
    const response = await explorerGet<ExplorerVerifiedResponse>('/smart-contracts');
    return response.items.slice(0, 30).map(item => ({
      contractAddress: item.address.hash.toLowerCase(),
      name: item.name || item.address.name || null,
      verifiedAt: item.verified_at,
      language: item.language,
      transactionCount: item.transactions_count,
      proxyType: item.address.proxy_type,
    }));
  });
}
