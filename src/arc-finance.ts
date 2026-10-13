/* carpan-localized */
import { t, localized } from './i18n/index';
import { ARC_USDC, type WalletHistory, type WalletTransfer } from './arc-wallet';

export type FinanceCategory = 'review' | 'collection' | 'payment' | 'internal' | 'refund';
export const FINANCE_CATEGORIES: Record<FinanceCategory, string> = localized({
  review: 'İnceleme bekliyor', collection: 'Tahsilat', payment: 'Ödeme', internal: 'İç transfer', refund: 'İade',
});
export type FinanceDecision = { category: FinanceCategory; reference: string };
const addressPattern = /^0x[0-9a-f]{40}$/i;
const zero = '0x' + '0'.repeat(40);
export function financeRows(items: WalletTransfer[], wallet: string): WalletTransfer[] {
  if (!addressPattern.test(wallet)) throw new Error(t("Geçerli bir Arc adresi gir."));
  const subject = wallet.toLowerCase(), rows = new Map<string, WalletTransfer>();
  for (const item of items) {
    if (item.token.toLowerCase() !== ARC_USDC || item.decimals !== 6) throw new Error(t("Yalnız Arc USDC kayıtları aktarılabilir."));
    if (!/^\d{1,78}$/.test(item.raw) || !/^0x[0-9a-f]{64}$/i.test(item.hash) ||
      !addressPattern.test(item.from) || !addressPattern.test(item.to) ||
      !Number.isSafeInteger(item.logIndex) || item.logIndex < 0 || !Number.isSafeInteger(item.block) || item.block < 0 ||
      (item.timestamp !== null && !Number.isFinite(Date.parse(item.timestamp)))) throw new Error(t("İşlem kaydı geçersiz."));
    const from = item.from.toLowerCase(), to = item.to.toLowerCase();
    if (from !== subject && to !== subject) throw new Error(t("İşlem seçili cüzdana ait değil."));
    const hash = item.hash.toLowerCase(), id = `5042:${hash}:${item.logIndex}:${ARC_USDC}`;
    const row = { ...item, id, hash, from, to, token: ARC_USDC, symbol: 'USDC', raw: BigInt(item.raw).toString(),
      direction: from === subject && to === subject ? 'self' as const : to === subject ? 'in' as const : 'out' as const };
    const previous = rows.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error(t("Aynı işlem için çelişkili kayıt var."));
    rows.set(id, row);
  }
  return [...rows.values()];
}
export function financeHint(row: WalletTransfer) {
  if (row.from === zero || row.to === zero) return t("Mint/burn · köprü veya ihraç olabilir; gelir/gider olarak otomatik işlenmez.");
  if (row.direction === 'self') return t("Aynı adrese aktarım");
  return row.direction === 'in' ? t("Gelen hareket · tahsilat olduğu henüz doğrulanmadı") : t("Giden hareket · gider olduğu henüz doğrulanmadı");
}
export function financePackage(wallet: string, history: WalletHistory, decisions: Record<string, FinanceDecision>, period: {from:string;to:string}) {
  const rows = financeRows(history.items, wallet);
  return {
    schema: 'carpan.finance.v1', chainId: 5042, wallet: wallet.toLowerCase(), token: ARC_USDC,
    asset: 'USDC', decimals: 6, exportedAt: new Date().toISOString(), source: 'Arc Blockscout ERC-20 transfers',
    coverage: { ...period, timezone: 'UTC', fetchedAt: history.fetchedAt, hasMore: !!history.nextCursor, skipped: history.skipped,
      scope: 'loaded_erc20_transfers_only', includesGas: false, includesNativeTransfers: false, readyForPosting: false },
    records: rows.map(row => {
      const decision = decisions[row.id] || {category: 'review', reference: ''};
      if (!(decision.category in FINANCE_CATEGORIES) || decision.reference.length > 120) throw new Error(t("Sınıflandırma geçersiz."));
      return { ...row, category: decision.category, reference: decision.reference.trim(), gasRaw: null,
        evidenceUrl: `https://explorer.arc.io/tx/${row.hash}` };
    }),
  };
}

/** Exact daily aggregation; numbers are used only for drawing coordinates. */
export function financeSeries(rows: WalletTransfer[], from: string, to: string) {
  const dates=rows.flatMap(r=>r.timestamp?[r.timestamp.slice(0,10)]:[]).sort();
  if(!dates.length&&!from&&!to)return [];
  const start=from||dates[0]||to,end=to||dates[dates.length-1]||from;
  if(!start||!end||start>end)return [];
  const span=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1,step=Math.max(1,Math.ceil(span/60));
  const points=Array.from({length:Math.ceil(span/step)},(_,i)=>({date:new Date(Date.parse(start)+i*step*86400000).toISOString().slice(0,10),incoming:0n,outgoing:0n}));
  for(const row of rows){if(!row.timestamp||row.direction==='self')continue;const index=Math.floor((Date.parse(row.timestamp.slice(0,10))-Date.parse(start))/86400000/step);if(!points[index])continue;if(row.direction==='in')points[index].incoming+=BigInt(row.raw);else points[index].outgoing+=BigInt(row.raw);}
  return points;
}
