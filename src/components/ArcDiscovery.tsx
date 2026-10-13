import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {Activity,ArrowUpRight,ChevronLeft,ChevronRight,ExternalLink,FileCode2,ShieldCheck,Zap} from 'lucide-react';
import {ArcBridgeActivity} from './ArcBridgeActivity';
import {DiscoveryTransfers} from './DiscoveryTransfers';
import {discoveryAddresses,type DiscoveryTransfer} from '../discovery-transfers';
import {researchUrl} from '../chain-explorer';
import {ARC_USDC,displayRaw} from '../arc-wallet';
import type {ArcDeployment,ArcVerifiedContract} from '../types';
import {loadedAddressActivity} from '../discovery-activity';

const short=(a:string)=>`${a.slice(0,8)}…${a.slice(-4)}`;
const explorer='https://explorer.arc.io';
function relative(timestamp:string|null){if(!timestamp)return '—';const seconds=Math.max(0,Math.floor((Date.now()-Date.parse(timestamp))/1000));return seconds<60?t("Şimdi"):seconds<3600?t("{0} dk", [Math.floor(seconds/60)]):seconds<86400?t("{0} sa", [Math.floor(seconds/3600)]):new Date(timestamp).toLocaleDateString(getLocale());}


export function ArcDiscovery({deployments,verified,deploymentLoading,deploymentError,verifiedLoading,verifiedError,lagBlocks}:{deployments:ArcDeployment[];verified:ArcVerifiedContract[];deploymentLoading:boolean;deploymentError:string;verifiedLoading:boolean;verifiedError:string;lagBlocks:number}){
  const [transfers,setTransfers]=useState<DiscoveryTransfer[]>([]),[offset,setOffset]=useState(0),[contractOffset,setContractOffset]=useState(0);
  const [ranking,setRanking]=useState<'activity'|'volume'>('activity');
  const {entities,singleAsset}=useMemo(()=>discoveryAddresses(transfers),[transfers]);
  const ranked=useMemo(()=>ranking==='activity'||!singleAsset?entities:[...entities].sort((a,b)=>a.volume===b.volume?a.address.localeCompare(b.address):a.volume>b.volume?-1:1),[entities,ranking]);
  const visible=ranked.slice(Math.min(offset,Math.max(0,ranked.length-2)),Math.min(offset,Math.max(0,ranked.length-2))+2);
  const activity=useMemo(()=>new Map(visible.map(entity=>[entity.key,loadedAddressActivity(transfers,entity.network.id,entity.address)])),[transfers,visible]);
  return <>
    <div className="at-discovery-grid"><div className="at-discovery-left">
      <section><div className="at-section-title"><h2>{t("Akıştaki adresler")}</h2><div className="at-discovery-actions"><div className="at-ranking" role="group" aria-label={t("Adres sıralaması")}><button aria-label={t("En hareketli")} title={t("Aktiviteye göre sırala")} aria-pressed={ranking==='activity'} onClick={()=>{setRanking('activity');setOffset(0);}}><Activity size={14}/></button><button aria-label={t("En yüksek hacim")} disabled={!singleAsset} title={t("Hacme göre sırala")} aria-pressed={ranking==='volume'} onClick={()=>{setRanking('volume');setOffset(0);}}><Zap size={14}/></button></div><button aria-label={t("Önceki adresler")} disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-2))}><ChevronLeft size={20}/></button><button aria-label={t("Sonraki adresler")} disabled={offset+2>=entities.length} onClick={()=>setOffset(n=>n+2)}><ChevronRight size={20}/></button></div></div>
        <div className="at-entity-grid">{visible.length?visible.map(entity=>{
          const facts=activity.get(entity.key)!;
          return <Link key={entity.key} className="at-entity-card at-address-dossier" to={researchUrl(entity.network.id,entity.address)}>
            <div className="at-dossier-identity"><span className="at-address-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M20 3 35 11.5v17L20 37 5 28.5v-17L20 3Z"/><path d="m5 11.5 15 8.5 15-8.5M20 20v17M12.5 7.2 27.5 16v17M12.5 15.8v17"/></svg><b>{entity.address.slice(2,4).toUpperCase()}</b></span><div className="at-entity-copy"><h3><span className="at-entity-name" title={entity.name||entity.address}>{entity.name||short(entity.address)}</span><ArrowUpRight size={16}/></h3>
              {entity.name&&<span className="at-dossier-address">{short(entity.address)}</span>}
              <span className="at-source-tag" title={facts.sources.join(' · ')}>{entity.network.name}<span> / </span>{t("Yüklenen sayfa")}</span>
            </div></div>
            <div className="at-dossier-total"><strong>{facts.total.toLocaleString(getLocale())}</strong><span>{t("TRANSFER")}<small>{t("Bu sayfadaki aktivite")}</small></span></div>
            <div className="at-dossier-directions">
              <span className="received"><i/>{t("Gelen")}<b>{facts.received}</b></span>
              <span className="sent"><i/>{t("Giden")}<b>{facts.sent}</b></span>
              {facts.self>0&&<span className="self"><i/>{t("Kendi adresine")}<b>{facts.self}</b></span>}
            </div>
            <LoadedActivityChart activity={facts}/>
            <div className="at-entity-bottom at-dossier-facts">
              <div><span>{t("KARŞI ADRES")}</span><strong>{facts.counterparties.toLocaleString(getLocale())}</strong></div>
              <div><span>{translateText("SON BLOK")}</span><strong>{facts.latestBlock===null?'—':facts.latestBlock.toLocaleString(getLocale())}</strong></div>
            </div>
            {singleAsset&&<div className="at-dossier-volume"><span>{t("Transfer hacmi")}</span><strong title={`${displayRaw(entity.volume.toString(),entity.decimals)} ${entity.symbol}`}>{displayRaw(entity.volume.toString(),entity.decimals)} <small>{entity.symbol}</small></strong></div>}
          </Link>;
        }):[0,1].map(i=><div className="at-entity-card at-address-dossier at-card-loading" key={i}><Activity size={22}/><strong>{t("Adres aktivitesi bekleniyor")}</strong><span>{t("Transfer kaydı yüklendiğinde bu sayfanın adresleri burada görünür.")}</span></div>)}</div>
        <p className="at-section-note">{transfers.length} {t("yüklenmiş Arc transfer kaydı içindeki adresler · transfer hacmi bakiye değildir.")}</p>
      </section>
      <section className="at-contract-discovery"><div className="at-section-title"><h2>{translateText("Arc · Yeni kontratlar")}</h2><div><Link className="at-context-link" to="/arc?view=contracts">{t("Tümü")}<ArrowUpRight size={15}/></Link><button aria-label={t("Önceki kontratlar")} disabled={contractOffset===0} onClick={()=>setContractOffset(n=>Math.max(0,n-2))}><ChevronLeft size={20}/></button><button aria-label={t("Sonraki kontratlar")} disabled={contractOffset+2>=deployments.length} onClick={()=>setContractOffset(n=>n+2)}><ChevronRight size={20}/></button></div></div><div className="at-entity-grid">{deployments.slice(contractOffset,contractOffset+2).map(item=><Link className="at-contract-card" key={item.contractAddress} to={`/arc/contracts/${item.contractAddress}`}><div className="at-contract-heading"><span className="at-contract-symbol"><FileCode2 size={20}/></span><span className="at-source-tag">{t("DOĞRUDAN DAĞITIM")}</span><ArrowUpRight size={15}/></div><h3>{short(item.contractAddress)}</h3><span className="at-contract-time">{relative(item.deployedAt)}</span><div className="at-contract-bottom"><span>{t("DAĞITAN")}<b>{short(item.deployerAddress)}</b></span><span>{t("BLOK")}<b>{item.blockNumber.toLocaleString(getLocale())}</b></span></div></Link>)}</div>{(!deployments.length||deploymentError)&&<p className="at-section-note">{deploymentError|| (deploymentLoading?t("Kontrat indeksi yükleniyor…"):t("İndekste henüz dağıtım kaydı yok."))}</p>}{lagBlocks>0&&<p className="at-section-note">{t("Kontrat indeksi geçmişi tamamlıyor ·")}{lagBlocks.toLocaleString(getLocale())} {translateText("blok geride.")}</p>}</section>
      <section className="at-verified-discovery"><div className="at-section-title"><h2>{t("Arc · Doğrulanan kodlar")}</h2><Link to="/arc?view=verified">{t("Tümü")}<ArrowUpRight size={15}/></Link></div>{verified.slice(0,4).map(item=><Link className="at-verified-row" key={item.contractAddress} to={`/arc/contracts/${item.contractAddress}`}><ShieldCheck size={18}/><span>{item.name||short(item.contractAddress)}<small>{short(item.contractAddress)}</small></span><span>{relative(item.verifiedAt)}</span><ArrowUpRight size={14}/></Link>)}{(!verified.length||verifiedError)&&<p className="at-section-note">{verifiedError||(verifiedLoading?t("Doğrulanan kodlar yükleniyor…"):t("Kaynakta doğrulanmış kod kaydı bulunamadı."))}</p>}</section>
    </div><div className="at-discovery-stream"><DiscoveryTransfers onPage={setTransfers}/><ArcBridgeActivity/></div></div>
  </>;
}

function LoadedActivityChart({activity}:{activity:ReturnType<typeof loadedAddressActivity>}){
  const highest=Math.max(1,...activity.bins.map(bin=>bin.received+bin.sent+bin.self));
  const clock=(value:number)=>new Intl.DateTimeFormat(getLocale(),{hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(value);
  const fullTime=(value:number)=>new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeStyle:'short'}).format(value);
  return <div className={`at-dossier-chart${activity.timed?'':' is-sequence'}`}>
    <div className="at-dossier-chart-heading"><span>{activity.timed?t("Zamana göre hareketler"):t("Yüklenen kayıt sırası")}</span><small>{activity.timed?t("Transfer sayısı"):t("{0} kayıt gösteriliyor",[activity.shown])}</small></div>
    <div className="at-dossier-bars" role="img" aria-label={activity.timed?t("Yüklenen transferlerin gerçek zaman aralığı: {0} – {1}",[fullTime(activity.first!),fullTime(activity.last!)]):t("Her sütun yüklenen sayfadaki bir transfer kaydıdır.")}>
      {activity.bins.map((bin,index)=>{
        const count=bin.received+bin.sent+bin.self;
        const title=`${activity.timed?`${fullTime(bin.from!)} – ${fullTime(bin.to!)}`:t("Kayıt {0}",[index+1])} · ${t("Gelen")} ${bin.received} · ${t("Giden")} ${bin.sent}${bin.self?` · ${t("Kendi adresine")} ${bin.self}`:''}`;
        return <div className="at-dossier-bar-slot" key={index} title={title} aria-hidden="true"><span className="at-dossier-bar" style={{height:`${count/highest*100}%`}}>{bin.received>0&&<i className="received" style={{flex:bin.received}}/>}{bin.sent>0&&<i className="sent" style={{flex:bin.sent}}/>}{bin.self>0&&<i className="self" style={{flex:bin.self}}/>}</span></div>;
      })}
    </div>
    <div className="at-dossier-chart-range">{activity.timed?<><span title={fullTime(activity.first!)}>{clock(activity.first!)}</span><span title={fullTime(activity.last!)}>{clock(activity.last!)}</span></>:<span>{t("Her sütun bir transfer · zaman verisi eksik")}</span>}</div>
  </div>;
}

export function ArcTokenModule(){return <section className="at-token-module"><div className="at-token-heading"><span className="at-large-usdc">$</span><div><span>{t("ARC MAINNET · TOKEN PROFİLİ")}</span><h1>USDC <small>USD Coin</small></h1></div></div><div className="at-token-details"><div><span>{t("KONTRAT")}</span><code>{ARC_USDC}</code></div><div><span>{translateText("ONDALIK")}</span><strong>6</strong></div><div><span>{t("AĞ")}</span><strong>Arc Mainnet</strong></div></div><p>{t("Arc üzerindeki USDC bakiye ve transferlerini araştır.")}</p><Link to="/arc">{t("Transfer akışını aç")}<ArrowUpRight size={16}/></Link><a href={`${explorer}/token/${ARC_USDC}`} target="_blank" rel="noopener noreferrer">{t("Tokenı Explorer’da incele")}<ExternalLink size={15}/></a></section>;}


