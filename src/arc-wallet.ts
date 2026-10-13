/* carpan-localized */
import { t, getLocale } from './i18n/index';
export const ARC_USDC = '0x3600000000000000000000000000000000000000';
export type WalletTransfer = {
  id: string; hash: string; logIndex: number; block: number; timestamp: string | null;
  from: string; to: string; token: string; symbol: string; decimals: number; raw: string;
  direction: 'in' | 'out' | 'self';
};
export type WalletFilters = { direction: 'all' | 'in' | 'out' | 'self'; token: string; minimum: string; peer: string; from: string; to: string };
export const DEFAULT_WALLET_FILTERS: WalletFilters = { direction: 'all', token: ARC_USDC, minimum: '', peer: '', from: '', to: '' };
export type WalletHistory = { items: WalletTransfer[]; nextCursor: string | null; scannedPages: number; skipped: number; fetchedAt: string;source?:string;sources?:string[];stale?:boolean };
export type ArcFeedTransfer = Omit<WalletTransfer, 'direction'> & { fromName: string | null; toName: string | null };
export type ArcTransferFeed = { items: ArcFeedTransfer[]; nextCursor: string | null; fetchedAt: string; skipped: number; scannedPages: number };
export type WalletOverview = {
  address: string; chainId: number; name: string | null; isContract: boolean | null;
  accountType?: 'wallet' | 'delegated_wallet' | 'contract' | null;
  delegationAddress?: string | null;
  balance: { raw: string; formatted: string; block: number; timestamp: string } | null;
  snapshots: { raw: string; block: number; timestamp: string }[]; warnings: string[];
};
export type WalletResearch = {
  tokens:{address:string;name:string;symbol:string;raw:string;decimals:number}[];
  balanceHistory:{raw:string;block:number;timestamp:string}[];
  tokensHasMore:boolean;historyHasMore:boolean;transactions:number|null;tokenTransfers:number|null;warnings:string[];fetchedAt:string;
};
/** Decimal amounts are compared as integers, never floating point. */
export function decimalRaw(input: string, decimals: number): bigint {
  if (!/^\d+(\.\d{1,36})?$/.test(input) || input.length > 90) throw new Error(t("Geçerli bir tutar gir."));
  const [whole, fraction = ''] = input.split('.');
  if (fraction.slice(decimals).replace(/0/g, '')) throw new Error(t("Tutarın ondalık basamağı varlık için fazla."));
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, '0') || '0');
}
export function displayRaw(raw: string, decimals = 6): string {
  const value = BigInt(raw); const negative = value < 0n; const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, '') : '';
  return (negative ? '−' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, getLocale()==='en-US' ? ',' : '.') + (fraction ? (getLocale()==='en-US' ? '.' : ',') + fraction : '');
}
export function summarizeTransfers(items: WalletTransfer[]) {
  let incoming = 0n, outgoing = 0n;
  const peers = new Map<string, { address: string; count: number; incoming: bigint; outgoing: bigint }>();
  for (const t of items) {
    if (t.direction === 'self') continue;
    const address = t.direction === 'in' ? t.from : t.to;
    const p = peers.get(address) || { address, count: 0, incoming: 0n, outgoing: 0n };
    p.count++;
    if (t.token === ARC_USDC && t.decimals === 6) {
      if (t.direction === 'in') { incoming += BigInt(t.raw); p.incoming += BigInt(t.raw); }
      else { outgoing += BigInt(t.raw); p.outgoing += BigInt(t.raw); }
    }
    peers.set(address, p);
  }
  return { incoming, outgoing, peers: [...peers.values()].sort((a,b) => b.count-a.count || a.address.localeCompare(b.address)) };
}
