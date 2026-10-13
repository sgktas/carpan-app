import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import {Link} from 'react-router-dom';
import {useBalance} from 'wagmi';
import {formatUnits,parseUnits,type Hex} from 'viem';
import {ExternalLink} from 'lucide-react';
import type {EVMChainDefinition} from '@circle-fin/app-kit';
import {BRIDGE_STEPS,BRIDGE_LABELS,bridgeRecordState,canResume,displayedBridgeStep,hasBurn,mintHash,type BridgeRecord} from '../arc-bridge';
import {MAINNET_BRIDGE_CHAINS} from '../bridge-mainnet-config';
import {BRIDGE_WALLET_CHAINS} from '../arc-bridge-client';
import {BridgeError} from './BridgePanels';
import {arcBridgeResearch} from '../bridge-research';

export function BridgeHistoryRecord({record:r,chains,busy,onResume,onCheck,onCheckSource}:{record:BridgeRecord;chains:EVMChainDefinition[];busy:boolean;onResume:(r:BridgeRecord)=>void;onCheck:(r:BridgeRecord)=>void;onCheckSource:(r:BridgeRecord)=>void}){
 const from=chains.find(c=>c.chainId===r.source)!,to=chains.find(c=>c.chainId===r.destination)!;
 const targetChain=[...BRIDGE_WALLET_CHAINS,...MAINNET_BRIDGE_CHAINS].find(c=>c.id===r.destination)!;
 const gas=useBalance({address:r.wallet as Hex,chainId:r.destination,query:{enabled:r.status!=='delivered',refetchInterval:r.status!=='delivered'?30000:false}});
 const state=bridgeRecordState(r,gas.data?.value),confirmed=r.deliveredAmount!==undefined?BigInt(r.deliveredAmount):null;
 const arcAddress=[5042002,5042].includes(r.destination)?r.recipient:r.wallet;
 const research=arcBridgeResearch(r);
 const addressExplorer=to.explorerUrl.replace('/tx/{hash}',`/address/${r.recipient}`);
 return <article aria-label={`${r.amount} USDC · ${from.name} → ${to.name}`}>
  <div className="ab-record-heading"><strong>{r.amount} USDC · {from.name} → {to.name}</strong><span className="ab-state" data-tone={state.tone}>{state.label}</span></div>
  <p className="aw-note">{state.description}</p><p className="aw-note">{new Date(r.createdAt).toLocaleString(getLocale())} {t("· Alıcı")}<code>{r.recipient}</code></p>
  {confirmed!==null&&<p className="ab-delivery-amount">{translateText("Teslim edilen")}<strong>{formatUnits(confirmed,6)} USDC</strong> {translateText("· USDC kesintisi")}<strong>{formatUnits(parseUnits(r.amount,6)-confirmed,6)} USDC</strong><small>{t("Gas ayrıca ödendi.")}</small></p>}
  {r.status!=='delivered'&&<div className="ab-recovery-gas"><p>{targetChain.name} {t("· Teslim gas’ını ödeyen cüzdan")}<code>{r.wallet}</code></p><p><strong>{gas.data?`${formatUnits(gas.data.value,gas.data.decimals)} ${gas.data.symbol}`:gas.isError?t("Bakiye alınamadı"):t('Bakiye kontrol ediliyor…')}</strong><button className="aw-text" disabled={gas.isFetching||busy} onClick={()=>void gas.refetch()}>{translateText("Bakiyeyi kontrol et")}</button></p>{gas.data?.value===0n&&<p>{t("Bu ağa")}{to.isTestnet?'test':t("gerçek")} {targetChain.nativeCurrency.symbol} {t("ekle. Başka ağdaki bakiye bu teslim ücretini karşılamaz.")}</p>}</div>}
  <ol className="ab-steps">{BRIDGE_STEPS.map(name=>{const step=displayedBridgeStep(r,name),chain=name==='mint'?to:from;return <li key={name} data-state={step?.state||'waiting'}><strong>{BRIDGE_LABELS[name]}</strong><span>{step?.state==='success'||step?.state==='noop'?t("Tamamlandı"):step?.state==='error'?t('Onay / kontrol gerekiyor'):step?.state==='pending'?t("İşleniyor"):t("Bekliyor")}</span>{step?.txHash&&<a href={chain.explorerUrl.replace('{hash}',step.txHash)} target="_blank" rel="noopener noreferrer">{t("İşlem kanıtı")}<ExternalLink size={12}/></a>}</li>;})}</ol>
  {r.error&&r.status!=='delivered'&&<BridgeError message={r.error}/>}
  {hasBurn(r.result)&&r.status!=='delivered'&&<p className="aw-note">{t("Kaynak gönderim korunuyor. Devam düğmesi mevcut gönderimin tasdik / teslim aşamasını sürdürür.")}</p>}
  <div className="ab-actions">
   {!canResume(r)&&!mintHash(r.result)&&r.result.steps.some(s=>s.name==='burn'&&!!s.txHash)&&<button className="aw-button" disabled={busy} onClick={()=>onCheckSource(r)}>{t("Kaynak gönderimi doğrula")}</button>}
   {canResume(r)&&<button className="aw-button ab-primary" disabled={busy||gas.isFetching||gas.data?.value===0n||gas.isError} onClick={()=>onResume(r)}>{t("Kaldığı yerden devam et")}</button>}
   {mintHash(r.result)&&(r.status!=='delivered'||r.deliveredAmount===undefined)&&<button className="aw-button" disabled={busy} onClick={()=>onCheck(r)}>{r.status==='delivered'?t("Teslim tutarını doğrula"):t("Hedef teslimi doğrula")}</button>}
   <a href={addressExplorer} target="_blank" rel="noopener noreferrer">{t('Hedef {0} cüzdanı ↗',[to.isTestnet?'testnet':'mainnet'])}</a>
   <Link to={research?.walletUrl||`/arc/addresses/${arcAddress}`}>{research?t("Arc cüzdan profilini aç ↗"):t("Aynı adresi Arc Mainnet’te araştır ↗")}</Link>
   {research?.transactionUrl&&<Link to={research.transactionUrl}>{t("Arc işlem detayını aç ↗")}</Link>}
  </div><p className="aw-note">{to.isTestnet?t("Mainnet cüzdan analizi ayrı ağ verisidir; bu testnet transferini içermez."):t("Arc cüzdan analizi Arc tarafını gösterir; karşı ağın işlem kanıtı kendi explorer bağlantısındadır.")}</p>
 </article>;
}
