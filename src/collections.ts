import {t as translateText} from './i18n/index';
/* carpan-localized */
import { t, localized } from './i18n/index';
import {formatUnits,parseUnits} from 'viem';
export const COLLECTION_STATES=localized({unpaid:"Ödeme bekliyor",partial:"Kısmi tahsilat",paid:"Eşleşti",overpaid:"Fazla ödeme",review:"İnceleme gerekli",cancelled:"İptal edildi"} as const);
export type CollectionState=keyof typeof COLLECTION_STATES;
export type CollectionProof={hash:string;logIndex:number;from:string;to:string;raw18:string;gasRaw18:string;gasPayer:string;block:string;timestamp:string;decision:'review'|'accepted'|'rejected';reason:string;interface?:'native'|'erc20'};
export type CollectionAudit={id:string;requestId:string;hash:string;logIndex:number;action:'linked'|'accepted'|'rejected'|'review'|'unlinked'|'cancelled';previousDecision:string|null;actorId:string;recordedAt:string;proof:CollectionProof|null};
export type CollectionAuditPage={items:CollectionAudit[];nextCursor:string|null};
export type CollectionRequest={id:string;shareToken:string;reference:string;customer:string;invoice:string;recipient:string;payer:string;expectedRaw6:string;due:string;createdAt:string;cancelled:boolean;proofs:CollectionProof[];receivedRaw18:string;state:CollectionState;audit?:CollectionAudit[];auditCursor?:string|null};
export type CollectionDraft={customer:string;invoice:string;amount:string;payer:string;due:string};
export type PublicCollection={reference:string;recipient:string;expectedRaw6:string;remainingRaw18:string;paymentState:'open'|'review'|'settled';chainId:5042;token:string;decimals:6};
export const collectionMoney=(raw:string,decimals=18)=>formatUnits(BigInt(raw),decimals);
export function collectionAmount(value:unknown):string{
  if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,6})?$/.test(value.trim()))throw new Error(t("Tutarı en fazla 6 ondalıkla gir."));
  const raw=parseUnits(value.trim(),6);if(raw<=0n)throw new Error(t("Tutar sıfırdan büyük olmalı."));return raw.toString();
}
export function collectionState(request:Pick<CollectionRequest,'expectedRaw6'|'cancelled'|'proofs'>):{state:CollectionState;receivedRaw18:string}{
  const received=request.proofs.filter(p=>p.decision==='accepted').reduce((sum,p)=>sum+BigInt(p.raw18),0n),expected=BigInt(request.expectedRaw6)*1000000000000n;
  const state:CollectionState=request.cancelled?'cancelled':request.proofs.some(p=>p.decision==='review')?'review':received>expected?'overpaid':received===expected?'paid':received>0n?'partial':'unpaid';
  return {state,receivedRaw18:received.toString()};
}
// Spreadsheet formulas are never interpreted from customer-provided fields.
const csvCell=(value:string)=>'"'+(/^[\s]*[=+@-]/.test(value)?"'"+value:value).replace(/"/g,'""')+'"';
export function collectionsCsv(requests:CollectionRequest[]):string{
  const rows:string[][]=[[t("Kayıt türü"),t('Talep'),t("Müşteri"),t("Fatura referansı"),t("Durum"),t('Beklenen USDC'),t('Kabul edilen USDC'),t("İşlem"),t('Olay'),t("Gönderen"),t("Alıcı"),t('Hareket USDC'),t("İşlem ücreti USDC"),t("Ücreti ödeyen"),'UTC',t("Kanıt")]];
  const fees=new Map<string,CollectionProof>();
  for(const r of requests){rows.push([t('Talep'),r.reference,r.customer,r.invoice,COLLECTION_STATES[r.state],collectionMoney(r.expectedRaw6,6),collectionMoney(r.receivedRaw18),'','','',r.recipient,'','','',r.createdAt,'']);
    for(const p of r.proofs){rows.push([translateText("Hareket"),r.reference,r.customer,r.invoice,p.decision==='accepted'?t('Kabul'):p.decision==='rejected'?t("Dışlandı"):t("İnceleme"),'','',p.hash,String(p.logIndex),p.from,p.to,collectionMoney(p.raw18),'','',p.timestamp,`https://explorer.arc.io/tx/${p.hash}`]);fees.set(p.hash,p);}}
  // A transaction can fund multiple requests. Export its total fee only once.
  for(const p of fees.values())rows.push([t("İşlem ücreti"),'','','','','','',p.hash,'','','','',collectionMoney(p.gasRaw18),p.gasPayer,p.timestamp,`https://explorer.arc.io/tx/${p.hash}`]);
  return '\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
