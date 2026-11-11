import {t,getLocale} from '../i18n/index';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowDownLeft,ArrowUpRight,ExternalLink,LoaderCircle,Pause,Play} from 'lucide-react';
import {api} from '../api';
import {ARC_BRIDGES,ARC_BRIDGE_SOURCE} from '../arc-bridges';
import {displayRaw} from '../arc-wallet';
import {researchUrl} from '../chain-explorer';
import type {BridgeFlowRow,BridgeFlowSnapshot} from '../bridge-flow';
import {useVisiblePolling} from '../hooks/useVisiblePolling';
import './arc-bridge-flow.css';

const short=(a:string)=>`${a.slice(0,7)}…${a.slice(-4)}`;
function ago(timestamp:string|null,now:number){if(!timestamp)return '—';const s=Math.max(0,Math.floor((now-Date.parse(timestamp))/1000));return s<60?t('{0} sn',[s]):s<3600?t('{0} dk',[Math.floor(s/60)]):s<86400?t('{0} sa',[Math.floor(s/3600)]):new Date(timestamp).toLocaleDateString(getLocale());}
/** Whole USDC with up to two decimals for scanning; the exact amount stays in the title. */
function usdc(raw:string){const value=BigInt(raw),cents=value/10_000n;return displayRaw(cents.toString(),2);}

/** Live, decoded Arc CCTP flows. Outbound means a burn on Arc, not a confirmed delivery elsewhere. */
export function ArcBridgeActivity(){
 const [data,setData]=useState<BridgeFlowSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),[now,setNow]=useState(()=>Date.now());
 const [filter,setFilter]=useState<'all'|'in'|'out'>('all');
 const busy=useRef(false);
 const load=useCallback(async()=>{if(busy.current)return;busy.current=true;try{setData(await api.bridgeFlow());setError('');}catch(e){setError(e instanceof Error?e.message:t('Köprü akışı alınamadı.'));}finally{busy.current=false;setLoading(false);setNow(Date.now());}},[]);
 useEffect(()=>{void load();},[load]);
 useVisiblePolling(()=>void load(),data?.liveMs||5000,!paused);
 useVisiblePolling(()=>setNow(Date.now()),1000,!paused);
 const rows=(data?.rows||[]).filter(r=>filter==='all'||r.direction===filter);
 const max=Math.max(1,...(data?.totals||[]).map(x=>Number(BigInt(x.inRaw)+BigInt(x.outRaw))));
 return <section className="at-contract-discovery at-bridge-flow" aria-label={t('Canlı Arc köprü akışı')}>
  <div className="at-section-title"><h2>{t('Arc · Canlı köprü akışı')}</h2>
   <div className="at-feed-pagination"><span className={`at-live-state${paused?' is-paused':''}`}><i/>{paused?t('Duraklatıldı'):data?.mode==='cached'?t('Kayıtlı veri'):t('Canlı')}</span>
    <button aria-label={paused?t('Canlı akışı sürdür'):t('Canlı akışı duraklat')} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={15}/>:<Pause size={15}/>}</button>
    <Link className="at-context-link" to="/arc?view=bridge&environment=mainnet">{t('USDC köprüle ↗')}</Link></div></div>
  {!!data?.totals.length&&<div className="abf-totals" aria-label={t('Ağlara göre yüklenen akış')}>{data.totals.slice(0,6).map(x=>{const inValue=Number(BigInt(x.inRaw)),outValue=Number(BigInt(x.outRaw));return <div key={String(x.domain)} className="abf-total">
   <div className="abf-total-head"><strong>{x.network||t('Bilinmeyen kaynak')}</strong><small>{x.inCount+x.outCount}</small></div>
   <div className="abf-bar" aria-hidden="true"><i className="in" style={{width:`${inValue/max*100}%`}}/><i className="out" style={{width:`${outValue/max*100}%`}}/></div>
   <div className="abf-total-values"><span className="in" title={`${displayRaw(x.inRaw,6)} USDC`}><ArrowDownLeft size={11}/>{usdc(x.inRaw)}</span><span className="out" title={`${displayRaw(x.outRaw,6)} USDC`}><ArrowUpRight size={11}/>{usdc(x.outRaw)}</span></div>
  </div>;})}</div>}
  <div className="at-feed-panel" aria-busy={loading}>
   <div className="at-feed-tools at-discovery-filters"><div className="abf-filter" role="group" aria-label={t('Yön')}>{(['all','in','out'] as const).map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='all'?t('Tümü'):f==='in'?t('Arc’a giriş'):t('Arc’tan çıkış')}</button>)}</div>
    <Link className="at-context-link" to={`/arc?view=explorer&chain=5042&data=logs&address=${ARC_BRIDGES[0].address}`}>{t('Kontratı araştır ↗')}</Link></div>
   {error&&<p role="alert" className="at-feed-error">{error}{data?t(' Son başarılı görüntü korunuyor.'):''}</p>}
   {data?.failed.length?<p role="status" className="at-feed-error">{t('Kaynak ağ eşlemesi geçici olarak alınamadı; gelen transferlerin kaynağı “bilinmiyor” görünür.')}</p>:null}
   <ul className="abf-list">{rows.map(row=><FlowRow key={row.id} row={row} now={now}/>)}</ul>
   {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('Köprü akışı yükleniyor…')}</div>}
   {data&&!rows.length&&<div className="at-feed-empty">{t('Yüklenen sayfada bu yönde köprü hareketi yok.')}</div>}
   <div className="at-feed-footer"><span>{data?t('{0} hareket · {1}',[data.rows.length,data.source]):'Blockscout'}</span><span>{data?new Date(data.fetchedAt).toLocaleTimeString(getLocale()):t('Bağlanıyor')}</span></div>
  </div>
  <p className="at-section-note">{t('Arc CCTP TokenMessenger olayları çözümlenir; gelen transferin kaynak ağı aynı işlemdeki MessageReceived kaydından okunur. Çıkış, Arc’ta yakımın görüldüğünü gösterir; hedefte teslim kanıtı değildir. Toplamlar yalnızca yüklenen sayfaya aittir.')} <a href={ARC_BRIDGE_SOURCE} target="_blank" rel="noopener noreferrer">{t('Kontrat kaynağı ↗')}</a></p>
 </section>;
}

function FlowRow({row,now}:{row:BridgeFlowRow;now:number}){
 const inbound=row.direction==='in',party=inbound?row.recipient:row.sender,counterparty=inbound?row.sender:row.recipient;
 return <li data-direction={row.direction}>
  <span className="abf-dir" aria-label={inbound?t('Arc’a giriş'):t('Arc’tan çıkış')}>{inbound?<ArrowDownLeft size={15}/>:<ArrowUpRight size={15}/>}</span>
  <div className="abf-main"><b>{inbound?t('{0} → Arc',[row.network||t('Bilinmeyen kaynak')]):t('Arc → {0}',[row.network||t('Alan {0}',[row.domain??'—'])])}</b>
   <small>{party?<Link to={researchUrl('5042',party)}>{short(party)}</Link>:'—'}{counterparty&&!inbound&&/^0x[0-9a-f]{40}$/.test(counterparty)?<> → <span title={counterparty}>{short(counterparty)}</span></>:null}</small></div>
  <span className="abf-amount" title={`${displayRaw(row.amount,6)} USDC${row.fee&&row.fee!=='0'?` · ${t('Ücret {0} USDC',[displayRaw(row.fee,6)])}`:''}`}>{usdc(row.amount)} <small>USDC</small></span>
  <span className="abf-time">{ago(row.timestamp,now)}<Link to={`/arc?view=explorer&chain=5042&data=txLogs&hash=${row.hash}`} aria-label={t('İşlem kanıtı')}><ExternalLink size={11}/></Link></span>
 </li>;
}
