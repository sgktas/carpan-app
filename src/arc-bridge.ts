/* carpan-localized */
import { t, localized } from './i18n/index';
import {decodeEventLog,erc20Abi,isAddress,parseUnits,zeroAddress,type TransactionReceipt} from 'viem';
import type {AppKit,BridgeResult,BridgeStep,EstimateResult,EVMChainDefinition,RetryContext} from '@circle-fin/app-kit';
import {reviewedBridgeDefinition} from './bridge-networks';

export type BridgeRecord={id:string;wallet:string;source:number;destination:number;recipient:string;amount:string;createdAt:string;updatedAt:string;status:'running'|'interrupted'|'error'|'delivered';result:BridgeResult<string>;error?:string;deliveredAmount?:string};
export const BRIDGE_STORAGE='carpan.arc.bridge.testnet.v1';
export const BRIDGE_STEPS=['approve','burn','fetchAttestation','mint'] as const;
export const BRIDGE_LABELS:Record<string,string>=localized({approve:'Harcama izni',burn:'Kaynak ağdan gönderim',fetchAttestation:'Circle tasdiği',mint:'Hedef ağa teslim'});

export type BridgeEnvironment='testnet'|'mainnet';
export function validateBridge(source:EVMChainDefinition,destination:EVMChainDefinition,amount:string,recipient:string,environment:BridgeEnvironment='testnet'){
 const testnet=environment==='testnet',arcId=testnet?5042002:5042;
 const validRoute=reviewedBridgeDefinition(source,testnet)&&reviewedBridgeDefinition(destination,testnet)&&[source.chainId,destination.chainId].includes(arcId);
 if(!validRoute||source.chainId===destination.chainId)throw new Error(environment==='mainnet'?t("Mainnet için Arc içeren farklı iki desteklenen USDC ağı seç."):t("Arc Testnet içeren farklı iki desteklenen test ağı seç."));
 if(!isAddress(recipient)||recipient.toLowerCase()===zeroAddress)throw new Error(t("Geçerli bir alıcı adresi gir."));
 if(!/^\d+(?:\.\d{1,6})?$/.test(amount.trim()))throw new Error(t("USDC miktarını en fazla 6 ondalıkla gir."));
 if(amount.trim().length>85)throw new Error(t("USDC miktarı geçersiz."));
 const raw=parseUnits(amount.trim(),6);if(raw<=0n||raw>=2n**256n)throw new Error(t("Miktar sıfırdan büyük olmalı."));return raw;
}
export function receivedAmount(estimate:EstimateResult<string,string>){
 try{let raw=parseUnits(estimate.amount,6);for(const fee of estimate.fees){if(fee.error||fee.amount===null||fee.token!=='USDC'||!/^\d+(?:\.\d{1,6})?$/.test(fee.amount))return null;raw-=parseUnits(fee.amount,6);}return raw>=0n?raw:null;}catch{return null;}
}
export function completeEstimate(estimate:EstimateResult<string,string>){
 return estimate.gasFees.length>0&&estimate.gasFees.every(f=>!!f.fees&&!f.error&&/^\d+(?:\.\d{1,18})?$/.test(f.fees.fee))&&estimate.fees.every(f=>f.amount!==null&&!f.error)&&receivedAmount(estimate)!==null;
}
export function nativeGasForChain(estimate:EstimateResult<string,string>,chain:EVMChainDefinition){
 const fees=estimate.gasFees.filter(f=>f.blockchain===chain.chain);if(!fees.length)throw new Error(t("Kaynak ağ ücreti hesaplanamadı."));
 return fees.reduce((total,f)=>{if(!f.fees||f.error||f.token!==chain.nativeCurrency.symbol||!new RegExp(`^\\d+(?:\\.\\d{1,${chain.nativeCurrency.decimals}})?$`).test(f.fees.fee))throw new Error(t("Ağ ücreti geçersiz veya bilinmiyor."));return total+parseUnits(f.fees.fee,chain.nativeCurrency.decimals);},0n);
}
export function hasBurn(result:BridgeResult<string>){return result.steps.some(s=>s.name==='burn'&&(!!s.txHash||s.state==='success'));}
export function mintHash(result:BridgeResult<string>){const mint=result.steps.find(s=>s.name==='mint'&&s.state==='success');return mint?.txHash&&/^0x[0-9a-f]{64}$/i.test(mint.txHash)?mint.txHash:null;}
// SDK recovery may append a successful mint after the original failed attempt.
export function displayedBridgeStep(record:BridgeRecord,name:string){
 const confirmed=name==='mint'&&record.status==='delivered'?mintHash(record.result):null;
 return confirmed?record.result.steps.find(s=>s.name===name&&s.state==='success'&&s.txHash===confirmed):[...record.result.steps].reverse().find(s=>s.name===name);
}
/** Arbitrum fee refresh can propose twice the quote's gas price. Reserve it before burn. */
export function bridgeGasBudget(estimate:EstimateResult<string,string>,chain:EVMChainDefinition){return nativeGasForChain(estimate,chain)*([421614,42161].includes(chain.chainId)?2n:1n);}
export function bridgeReadiness(from:EVMChainDefinition,to:EVMChainDefinition,raw:bigint|undefined,usdc:bigint|undefined,sourceNative:bigint|undefined,destinationNative:bigint|undefined,quote?:EstimateResult){
 let sourceGas:bigint|undefined,destinationGas:bigint|undefined;
 if(quote){try{sourceGas=bridgeGasBudget(quote,from);destinationGas=bridgeGasBudget(quote,to);}catch{/* Unknown fees never pass readiness. */}}
 const nativeTransfer=[5042002,5042].includes(from.chainId)&&raw!==undefined?raw*10n**12n:0n;
 const sourceRequired=sourceGas===undefined?undefined:sourceGas+nativeTransfer;
 return {sourceGas,destinationGas,sourceRequired,usdcReady:raw!==undefined&&usdc!==undefined&&usdc>=raw,
  sourceReady:sourceRequired!==undefined&&sourceNative!==undefined&&sourceNative>=sourceRequired,
  destinationReady:destinationGas!==undefined&&destinationNative!==undefined&&destinationNative>=destinationGas};
}
export function bridgeErrorInfo(message:string){
 const m=message.toLowerCase();
 if(/4001|user rejected|user denied|rejected the request/.test(m))return {title:t("Cüzdan onayı iptal edildi"),action:t("Hazır olduğunda tekrar onayla. Tamamlanan aşamalar köprü geçmişinde korunur.")};
 if(/4902|unrecognized chain|switch.*chain|ağ geçişi|ağı cüzdan ağıyla|desteklenen test ağına/.test(m))return {title:t("Cüzdan ağı hazırlanamadı"),action:t("Cüzdandaki hedef test ağı ekleme veya geçiş isteğini tamamla, ardından mevcut kayıttan devam et.")};
 if(/max fee per gas|base fee|fee cap|underpriced/.test(m))return {title:t("Ağ ücreti değişti"),action:t("Ücret yeniden hesaplanacak. Bekleyen kayıttan devam et ve cüzdanındaki yeni gas teklifini incele.")};
 if(/insufficient funds|gas|ağ ücreti.*bakiyesi|ücreti için.*yetersiz|test eth|bakiyen 0/.test(m))return {title:t("Ağ ücreti bakiyesi gerekiyor"),action:t("İşlemi imzalayan cüzdanın ilgili ağdaki gas bakiyesini kontrol et. Arc USDC, başka bir ağdaki ETH ücretini ödemez.")};
 if(/usdc bakiyesi|transfer ve kaynak/.test(m))return {title:'Kaynak bakiye yetersiz',action:t("Gönderilecek USDC ile kaynak ağ ücretini karşılayan bakiye gerekiyor. Arc’ta ikisi de aynı USDC bakiyesinden ödenir.")};
 if(/teklif|ücretleri hesaplayamadı/.test(m))return {title:t("Ücret teklifi yenilenmeli"),action:t("Ücretleri yeniden hesapla. Bilinmeyen ücretler sıfır kabul edilmez.")};
 if(/timeout|timed out|fetch|network|rpc|http/.test(m))return {title:t("Sağlayıcıdan yanıt alınamadı"),action:t("İşlem kanıtlarını kontrol et. Kaynak gönderim varsa yeni transfer yerine köprü geçmişinden devam et.")};
 return {title:t("İşlem tamamlanamadı"),action:message.length<240?message:t("Köprü geçmişindeki tamamlanan aşamaları ve işlem kanıtlarını incele; mevcut gönderimden devam et.")};
}
export function bridgeRecordState(record:BridgeRecord,destinationGas?:bigint){
 if(record.status==='delivered')return {label:'Teslim edildi',tone:'success',description:t("Hedef işlem makbuzu başarılı olarak doğrulandı.")};
 if(mintHash(record.result))return {label:t("Teslim doğrulaması bekleniyor"),tone:'waiting',description:t("Hedef işlem kanıtı mevcut. Yeniden göndermek yerine teslimi doğrula.")};
 if(hasBurn(record.result))return destinationGas===0n?{label:'Gas gerekiyor',tone:'error',description:t("Kaynak gönderim korunuyor. Hedef ağda teslim ücreti için gas bakiyesi ekle.")}:{label:'Teslim bekliyor',tone:'waiting',description:t("Kaynak gönderim mevcut. Circle tasdiği veya hedef tesliminden devam edilecek.")};
 if(record.status==='running')return {label:t("Cüzdan / kaynak işlemi bekleniyor"),tone:'waiting',description:t("Cüzdan isteğini ve kaynak işlem kanıtını takip et.")};
 return {label:t("Kaynak gönderim doğrulanmadı"),tone:'error',description:t("İşlem kanıtı olmadan tekrar gönderme. Varsa kaynak makbuzunu kontrol et.")};
}
export function checkpointStep(result:BridgeResult<string>,step:BridgeStep){
 const previous=displayedBridgeStep({result} as BridgeRecord,step.name);
 if(previous?.state==='success'&&step.state!=='success')return {...result,state:'pending' as const};
 if(step.name==='burn'&&previous?.state==='success'&&previous.txHash&&step.txHash&&previous.txHash!==step.txHash)throw new Error('Confirmed source transaction cannot be replaced.');
 return {...result,state:'pending' as const,steps:[...result.steps.filter(s=>s.name!==step.name),{...previous,...step,txHash:step.txHash||previous?.txHash,data:step.data??previous?.data}]};
}
/** An incomplete SDK response must not erase an observed source transaction. */
export function mergeBridgeCheckpoints(previous:BridgeResult<string>,next:BridgeResult<string>){let merged={...next,steps:previous.steps};for(const step of next.steps)merged=checkpointStep(merged,step);return {...merged,state:next.state};}
export function canResume(record:BridgeRecord){return record.status!=='delivered'&&record.result.steps.some(s=>s.name==='burn'&&!!s.txHash&&['success','pending'].includes(s.state))&&!mintHash(record.result);}
export async function resumeBridge(kit:Pick<AppKit,'retryBridge'>,record:BridgeRecord,wallet:string,context:RetryContext){
 if(record.wallet.toLowerCase()!==wallet.toLowerCase()||!canResume(record))throw new Error(t("Bu transfer için kaynak cüzdanını bağla ve teslimi kontrol et."));
 return kit.retryBridge(record.result,context);
}
export function encodeRecords(records:BridgeRecord[]){return JSON.stringify(records,(_key,value)=>typeof value==='bigint'?{__carpanBigInt:value.toString()}:value);}
/** A successful arbitrary transaction cannot authorize recovery of another burn. */
export function verifyBridgeBurn(record:BridgeRecord,receipt:TransactionReceipt,chains:EVMChainDefinition[],environment:BridgeEnvironment){
 const from=chains.find(c=>c.chainId===record.source),to=chains.find(c=>c.chainId===record.destination),burn=record.result.steps.find(s=>s.name==='burn'&&s.txHash);
 if(!from||!to||receipt.status!=='success'||receipt.from.toLowerCase()!==record.wallet.toLowerCase()||receipt.transactionHash.toLowerCase()!==burn?.txHash?.toLowerCase())throw new Error(t("Kaynak gönderim kanıtı kayıtla uyuşmuyor."));
 let burned=0n;
 for(const log of receipt.logs){if(log.address.toLowerCase()!==from.usdcAddress?.toLowerCase())continue;try{const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});if(event.eventName==='Transfer'&&event.args.from.toLowerCase()===record.wallet.toLowerCase()&&event.args.to.toLowerCase()===zeroAddress)burned+=event.args.value;}catch{/* Unrelated events are not proof. */}}
 if(burned!==validateBridge(from,to,record.amount,record.recipient,environment))throw new Error(t("Kaynak makbuzunda doğru USDC gönderimi doğrulanamadı."));
 return true;
}
export function decodeRecords(value:string|null,chains:EVMChainDefinition[],environment:BridgeEnvironment='testnet'):BridgeRecord[]{
 if(!value||value.length>15000000)return [];try{const rows:unknown=JSON.parse(value,(_k,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.__carpanBigInt==='string'&&/^\d{1,100}$/.test(v.__carpanBigInt)?BigInt(v.__carpanBigInt):v);if(!Array.isArray(rows)||rows.length>500)return [];
 return rows.filter((r):r is BridgeRecord=>{
  if(!r||typeof r.id!=='string'||r.id.length>100||!isAddress(r.wallet)||!isAddress(r.recipient)||!r.result||r.result.provider!=='CCTPV2BridgingProvider'||r.result.token!=='USDC'||!Array.isArray(r.result.steps)||r.result.steps.length>64||!['running','interrupted','error','delivered'].includes(r.status)||typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||typeof r.updatedAt!=='string'||!Number.isFinite(Date.parse(r.updatedAt))||(r.deliveredAmount!==undefined&&(typeof r.deliveredAmount!=='string'||!/^\d{1,78}$/.test(r.deliveredAmount))))return false;
  const from=chains.find(c=>c.chainId===r.source),to=chains.find(c=>c.chainId===r.destination);if(!from||!to)return false;
  try{if(validateBridge(from,to,r.amount,r.recipient,environment)!==validateBridge(from,to,r.result.amount,r.recipient,environment))return false;}catch{return false;}
  return r.result.source?.chain?.chainId===r.source&&r.result.destination?.chain?.chainId===r.destination&&r.result.source?.address?.toLowerCase()===r.wallet.toLowerCase()&&(r.result.destination.recipientAddress||r.result.destination.address)?.toLowerCase()===r.recipient.toLowerCase()&&r.result.steps.every((s:BridgeStep)=>s&&typeof s.name==='string'&&['pending','success','error','noop'].includes(s.state)&&(!s.txHash||/^0x[0-9a-f]{64}$/i.test(s.txHash)));
 }).map(r=>({...r,status:r.status==='running'?'interrupted' as const:r.status,result:{...r.result,config:{transferSpeed:'FAST'},source:{...r.result.source,chain:chains.find(c=>c.chainId===r.source)!},destination:{...r.result.destination,chain:chains.find(c=>c.chainId===r.destination)!}}}));
 }catch{return [];}
}
