import {t,getLocale} from '../../i18n/index';
import {useCallback,useMemo,useState,type PointerEvent} from 'react';
import {Link} from 'react-router-dom';
import {FileCode2,ShieldCheck} from 'lucide-react';
import type {ArcDeployment,ArcVerifiedContract} from '../../types';
import {researchUrl} from '../../chain-explorer';
import {discoveryAddresses,type DiscoveryTransfer} from '../../discovery-transfers';
import {loadedAddressActivity} from '../../discovery-activity';
import {ArcBridgeActivity} from '../ArcBridgeActivity';
import {DiscoveryTransfers} from '../DiscoveryTransfers';
import {BlockActivityCard,DailyTransactionsCard,LiveBlocksList,LiveErrors,LiveStatsStrip,LiveTransactionsList,useArcLive} from '../ArcLiveFeed';
import {AddressAvatar,TokenMark} from '../TerminalVisuals';
import {tokenMix} from '../../terminal-command';
import './terminal-home.css';

type TabKey='transfers'|'transactions'|'blocks'|'contracts'|'bridge';
const TABS:{key:TabKey;label:string}[]=[
 {key:'transfers',label:'Transferler'},{key:'transactions',label:'İşlemler'},{key:'blocks',label:'Bloklar'},{key:'contracts',label:'Kontratlar'},{key:'bridge',label:'Köprü'},
];
const TAB_KEY='carpan.terminal.home-tab.v1';
const readTab=():TabKey=>{try{const v=window.localStorage.getItem(TAB_KEY);return TABS.some(x=>x.key===v)?v as TabKey:'transfers';}catch{return 'transfers';}};
const short=(value:string)=>`${value.slice(0,8)}…${value.slice(-4)}`;
function relative(timestamp:string|null){if(!timestamp)return '—';const s=Math.max(0,Math.floor((Date.now()-Date.parse(timestamp))/1000));return s<60?t('Şimdi'):s<3600?t('{0} dk',[Math.floor(s/60)]):s<86400?t('{0} sa',[Math.floor(s/3600)]):new Date(timestamp).toLocaleDateString(getLocale());}

/** Terminal home: one-row stats, a tabbed live table on the left, a chart rail on the right. */
export function TerminalHome({deployments,verified,deploymentLoading,deploymentError,verifiedLoading,verifiedError,lagBlocks}:{deployments:ArcDeployment[];verified:ArcVerifiedContract[];deploymentLoading:boolean;deploymentError:string;verifiedLoading:boolean;verifiedError:string;lagBlocks:number}){
 const live=useArcLive('5042');
 const [tab,setTabState]=useState<TabKey>(readTab),[transfers,setTransfers]=useState<DiscoveryTransfer[]>([]);
 const setTab=useCallback((next:TabKey)=>{setTabState(next);try{window.localStorage.setItem(TAB_KEY,next);}catch{/* Preference only. */}},[]);
 // Pointer-following light on cards, driven by theme tokens in CSS.
 const spotlight=useCallback((event:PointerEvent<HTMLDivElement>)=>{
  const card=(event.target as HTMLElement).closest<HTMLElement>('.th-card');if(!card)return;
  const box=card.getBoundingClientRect();card.style.setProperty('--mx',`${event.clientX-box.left}px`);card.style.setProperty('--my',`${event.clientY-box.top}px`);
 },[]);
 const onKeyDown=(event:React.KeyboardEvent)=>{
  const index=TABS.findIndex(x=>x.key===tab);
  const next=event.key==='ArrowRight'?index+1:event.key==='ArrowLeft'?index-1:event.key==='Home'?0:event.key==='End'?TABS.length-1:null;
  if(next===null)return;
  event.preventDefault();const target=TABS[(next+TABS.length)%TABS.length].key;setTab(target);
  document.getElementById(`th-tab-${target}`)?.focus();
 };
 return <div className="th-home" onPointerMove={spotlight}>
  <LiveStatsStrip live={live}/>
  <LiveErrors live={live}/>
  <div className="th-grid">
   <section className="th-main" aria-label={t('Canlı Arc ağı')}>
    <div className="th-tabs" role="tablist" aria-label={t('Canlı Arc ağı')} onKeyDown={onKeyDown}>
     {TABS.map(item=><button key={item.key} id={`th-tab-${item.key}`} type="button" role="tab" aria-selected={tab===item.key} aria-controls={`th-panel-${item.key}`} tabIndex={tab===item.key?0:-1} onClick={()=>setTab(item.key)}>{t(item.label)}</button>)}
    </div>
    {/* Transfers stay mounted: the chart rail and address list read the loaded page even while another tab is open. */}
    <div id="th-panel-transfers" role="tabpanel" aria-labelledby="th-tab-transfers" hidden={tab!=='transfers'}><DiscoveryTransfers onPage={setTransfers}/></div>
    {tab==='transactions'&&<div id="th-panel-transactions" role="tabpanel" aria-labelledby="th-tab-transactions"><LiveTransactionsList live={live}/></div>}
    {tab==='blocks'&&<div id="th-panel-blocks" role="tabpanel" aria-labelledby="th-tab-blocks"><LiveBlocksList live={live}/></div>}
    {tab==='contracts'&&<div id="th-panel-contracts" role="tabpanel" aria-labelledby="th-tab-contracts"><ContractsPanel deployments={deployments} verified={verified} deploymentLoading={deploymentLoading} deploymentError={deploymentError} verifiedLoading={verifiedLoading} verifiedError={verifiedError} lagBlocks={lagBlocks}/></div>}
    {tab==='bridge'&&<div id="th-panel-bridge" role="tabpanel" aria-labelledby="th-tab-bridge"><ArcBridgeActivity/></div>}
   </section>
   <aside className="th-rail" aria-label={t('Grafikler')}>
    <DailyTransactionsCard points={live.chart}/>
    <BlockActivityCard live={live}/>
    <TokenMixCard transfers={transfers}/>
    <ActiveAddresses transfers={transfers}/>
   </aside>
  </div>
 </div>;
}

/** Which tokens dominate the transfers currently loaded in the table. A sample of the loaded page, not chain-wide volume. */
function TokenMixCard({transfers}:{transfers:DiscoveryTransfer[]}){
 const rows=useMemo(()=>tokenMix(transfers),[transfers]);
 const max=Math.max(1,...rows.map(r=>r.count));
 return <div className="th-card">
  <div className="th-card-head"><span>{t('Token dağılımı')}</span><b>{t('{0} transfer',[transfers.length.toLocaleString(getLocale())])}</b></div>
  {rows.length?<ul className="th-mix">{rows.map(r=><li key={r.symbol} title={t('{0} transfer · %{1}',[r.count,Math.round(r.count/Math.max(1,transfers.filter(x=>x.nftId===null).length)*100)])}><TokenMark symbol={r.symbol} icon={r.icon} size={16}/><span>{r.symbol}</span><i><u style={{width:`${r.count/max*100}%`}}/></i><b>{r.count}</b></li>)}</ul>:<p className="th-empty">{t('Yüklenen transferler burada özetlenir.')}</p>}
  <p className="th-note">{t('Tabloda yüklü sayfanın özeti; ağın toplam hacmi değildir.')}</p>
 </div>;
}

/** The busiest addresses in the loaded transfers, with their received/sent split. */
function ActiveAddresses({transfers}:{transfers:DiscoveryTransfer[]}){
 const rows=useMemo(()=>discoveryAddresses(transfers).entities.slice(0,6).map(entity=>({entity,facts:loadedAddressActivity(transfers,entity.network.id,entity.address)})),[transfers]);
 return <div className="th-card">
  <div className="th-card-head"><span>{t('Aktif adresler')}</span><b>{t('yüklü sayfa')}</b></div>
  {rows.length?<ul className="th-addresses">{rows.map(({entity,facts})=>{
   const total=Math.max(1,facts.received+facts.sent+facts.self);
   return <li key={entity.key}>
    <Link to={researchUrl(entity.network.id,entity.address)} title={entity.address}><AddressAvatar address={entity.address} size={22}/><span><b>{entity.name||short(entity.address)}</b><small>{short(entity.address)}</small></span></Link>
    <span className="th-split" title={`${t('Gelen')} ${facts.received} · ${t('Giden')} ${facts.sent}`}><i style={{flex:facts.received/total}}/><u style={{flex:(facts.sent+facts.self)/total}}/></span>
    <strong>{facts.total.toLocaleString(getLocale())}</strong>
   </li>;})}</ul>:<p className="th-empty">{t('Adres aktivitesi bekleniyor')}</p>}
 </div>;
}

function ContractsPanel({deployments,verified,deploymentLoading,deploymentError,verifiedLoading,verifiedError,lagBlocks}:{deployments:ArcDeployment[];verified:ArcVerifiedContract[];deploymentLoading:boolean;deploymentError:string;verifiedLoading:boolean;verifiedError:string;lagBlocks:number}){
 return <div className="th-contracts">
  <section className="at-feed-panel">
   <div className="at-live-heading"><FileCode2 size={14}/>{t('Yeni dağıtımlar')}<Link className="th-all" to="/arc?view=contracts">{t('Tümü')}</Link></div>
   <ul className="th-rows">{deployments.slice(0,12).map(item=><li key={item.contractAddress}><Link to={`/arc/contracts/${item.contractAddress}`}><AddressAvatar address={item.contractAddress} size={20}/><span><b>{short(item.contractAddress)}</b><small>{t('Dağıtan')} {short(item.deployerAddress)}</small></span><em>#{item.blockNumber.toLocaleString(getLocale())}</em><time>{relative(item.deployedAt)}</time></Link></li>)}</ul>
   {(!deployments.length||deploymentError)&&<p className="th-empty">{deploymentError||(deploymentLoading?t('Kontrat indeksi yükleniyor…'):t('İndekste henüz dağıtım kaydı yok.'))}</p>}
   {lagBlocks>0&&<p className="th-note">{t('Kontrat indeksi geçmişi tamamlıyor ·')} {lagBlocks.toLocaleString(getLocale())} {t('blok geride.')}</p>}
  </section>
  <section className="at-feed-panel">
   <div className="at-live-heading"><ShieldCheck size={14}/>{t('Doğrulanan kodlar')}<Link className="th-all" to="/arc?view=verified">{t('Tümü')}</Link></div>
   <ul className="th-rows">{verified.slice(0,8).map(item=><li key={item.contractAddress}><Link to={`/arc/contracts/${item.contractAddress}`}><AddressAvatar address={item.contractAddress} size={20}/><span><b>{item.name||short(item.contractAddress)}</b><small>{short(item.contractAddress)}</small></span><time>{relative(item.verifiedAt)}</time></Link></li>)}</ul>
   {(!verified.length||verifiedError)&&<p className="th-empty">{verifiedError||(verifiedLoading?t('Doğrulanan kodlar yükleniyor…'):t('Kaynakta doğrulanmış kod kaydı bulunamadı.'))}</p>}
  </section>
 </div>;
}
