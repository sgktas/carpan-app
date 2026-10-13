/* carpan-localized */
import { t } from '../i18n/index';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {formatUnits} from 'viem';
import {BRIDGE_LABELS,BRIDGE_STEPS,displayedBridgeStep,type BridgeRecord} from '../arc-bridge';
import {arcBridgeResearch,bridgeRecordForTransaction,bridgeRecordsForAddress} from '../bridge-research';
import {MAINNET_BRIDGE_FACTS,MAINNET_BRIDGE_STORAGE} from '../bridge-mainnet-config';
import './bridge-research.css';

function useResearchRecords(){
 const [records,setRecords]=useState<BridgeRecord[]>([]);
 useEffect(()=>{let alive=true;const load=()=>{try{if(!localStorage.getItem(MAINNET_BRIDGE_STORAGE)){if(alive)setRecords([]);return;}}catch{if(alive)setRecords([]);return;}void import('../bridge-research-client').then(m=>m.loadResearchBridgeRecords()).then(rows=>{if(alive)setRecords(rows);}).catch(()=>{if(alive)setRecords([]);});};load();window.addEventListener('storage',load);return()=>{alive=false;window.removeEventListener('storage',load);};},[]);
 return records;
}
export function WalletBridgeResearch({address}:{address:string}){
 const records=bridgeRecordsForAddress(useResearchRecords(),address);if(!records.length)return null;
 return <section className="aw-panel br-research" aria-label={t("Cüzdanın köprü kayıtları")}><h2>{t("Köprü hareketlerim")}<small>{t("Bu tarayıcı · Mainnet")}</small></h2><p className="aw-muted">{t("Carpan köprüsünde saklanan kayıtlar. Cüzdanın tüm köprü geçmişi değildir.")}</p><div className="br-records">{records.map(r=>{const arc=arcBridgeResearch(r)!;return <article key={r.id}><strong>{arc.direction} · {r.amount} USDC</strong><span>{r.result.source.chain.name} → {r.result.destination.chain.name}</span><span>{r.status==='delivered'?'Teslim edildi':t("Teslim henüz doğrulanmadı")}</span>{arc.transactionUrl?<Link to={arc.transactionUrl}>{t("Arc işlem detayını aç ↗")}</Link>:<Link to="/arc?view=bridge&environment=mainnet">{t("Köprü kaydını aç ↗")}</Link>}</article>;})}</div></section>;
}
export function BridgeTransactionResearch({chain,hash}:{chain:string;hash:string}){
 const record=bridgeRecordForTransaction(useResearchRecords(),chain,hash);if(!record)return null;
 return <section className="br-research" aria-label={t("İşlemin köprü yolculuğu")}><h3>{t("USDC köprü yolculuğu")}</h3><p>{record.result.source.chain.name} → {record.result.destination.chain.name} {t("· Gönderilen")}{record.amount} USDC{record.status==='delivered'&&record.deliveredAmount!==undefined?` · Teslim edilen ${formatUnits(BigInt(record.deliveredAmount),6)} USDC`:''}</p><p className="aw-muted">{t("Bu tarayıcıdaki CCTP kaydıyla eşleşti. Aşamalar SDK kaydından gelir; zincir işlemleri aşağıdaki kanıt bağlantılarından incelenebilir.")}</p><ol className="br-journey">{BRIDGE_STEPS.filter(n=>n!=='approve').map(name=>{const step=displayedBridgeStep(record,name),network=MAINNET_BRIDGE_FACTS.find(f=>f.id===(name==='mint'?record.destination:record.source))!;const evidence=step?.txHash&&/^0x[0-9a-f]{64}$/i.test(step.txHash)?`${network.explorer}/tx/${step.txHash}`:null;return <li key={name}><strong>{BRIDGE_LABELS[name]}</strong><span>{name==='fetchAttestation'?'Circle':network.name}</span><span>{step?.state==='success'||step?.state==='noop'?t("Tamamlandı"):step?.state==='error'?'Onay / kontrol gerekiyor':t("Bekliyor")}</span>{evidence&&<a href={evidence} target="_blank" rel="noopener noreferrer">{t("Zincir kanıtı ↗")}</a>}</li>;})}</ol><Link to="/arc?view=bridge&environment=mainnet">{t("Köprü geçmişine dön ↗")}</Link></section>;
}
