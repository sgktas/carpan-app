import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t as translateUi, getLocale } from '../i18n/index';
import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {isAddress} from 'viem';
import {ArrowUpRight,Expand,GitBranch,LoaderCircle,Minus,Plus,RefreshCw,Search,Target} from 'lucide-react';
import {api} from '../api';
import {buildFlow,type FlowEdge} from '../arc-flow';
import {DEFAULT_WALLET_FILTERS,displayRaw,decimalRaw,type WalletHistory} from '../arc-wallet';
import './arc-flow.css';
import {ArcAssetPicker,useArcAsset} from './ArcAssetPicker';
import {ARC_USDC} from '../arc-wallet';

const short=(a:string)=>`${a.slice(0,8)}…${a.slice(-4)}`;
const example='0x8366a39cc670b4001a1121b8f6a443a643e40951';
type Source={address:string;name:string|null;history:WalletHistory};
function historyProvenance(previous:WalletHistory|null|undefined,next:WalletHistory){
  const sources=[...new Set([...(previous?.sources||(previous?.source?[previous.source]:[])),...(next.sources||(next.source?[next.source]:[]))])];
  const dates=[previous?.fetchedAt,next.fetchedAt].filter((value):value is string=>!!value).map(value=>Date.parse(value)).filter(Number.isFinite);
  return {fetchedAt:dates.length?new Date(Math.min(...dates)).toISOString():next.fetchedAt,stale:!!previous?.stale||!!next.stale,source:sources.join(' / '),sources};
}
export function ArcFlowMap(){
 const [params]=useSearchParams();return <ArcAssetFlow key={(params.get('token')||ARC_USDC).toLowerCase()}/>;
}
function ArcAssetFlow(){
  const [params,setParams]=useSearchParams();const root=(params.get('address')||'').toLowerCase();const token=(params.get('token')||ARC_USDC).toLowerCase();const {asset,error:assetError}=useArcAsset(token);const decimals=asset?.decimals??6,symbol=asset?.symbol||'Token';
  const [query,setQuery]=useState(root),[sources,setSources]=useState<Source[]>([]),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [selected,setSelected]=useState(root),[edgeId,setEdgeId]=useState(''),[direction,setDirection]=useState<'all'|'in'|'out'>('all');
  const [minimum,setMinimum]=useState('0'),[draftMinimum,setDraftMinimum]=useState('0'),[refresh,setRefresh]=useState(0);
  const [zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[showAll,setShowAll]=useState(false);
  const generation=useRef(0),lock=useRef(false),drag=useRef<{x:number;y:number}|null>(null);
  const canvasScroll=useRef<HTMLDivElement>(null);
  const valid=isAddress(root);
  async function fetchAddress(address:string,more=false){
    if(lock.current)return;lock.current=true;const version=generation.current;setBusy(address);setError('');
    const old=sources.find(s=>s.address===address);
    try{
      const history=await api.arcWalletHistory(address,{...DEFAULT_WALLET_FILTERS,token},more?old?.history.nextCursor||'':'');
      const identity=more?null:await api.arcWalletOverview(address).catch(()=>null);
      if(version!==generation.current)return;
      setSources(current=>{const previous=current.find(s=>s.address===address);const items=new Map((more?previous?.history.items||[]:[]).map(t=>[t.id,t]));history.items.forEach(t=>items.set(t.id,t));
        const source={address,name:identity?.name||previous?.name||null,history:{...history,...historyProvenance(more?previous?.history:null,history),items:[...items.values()],scannedPages:history.scannedPages+(more?previous?.history.scannedPages||0:0),skipped:history.skipped+(more?previous?.history.skipped||0:0)}};
        return [...current.filter(s=>s.address!==address),source];});
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:translateUi("Transfer bağlantıları alınamadı."));}
    finally{if(version===generation.current){setBusy('');lock.current=false;}}
  }
  useEffect(()=>{generation.current++;lock.current=false;setSources([]);setSelected(root);setEdgeId('');setError('');setBusy('');setQuery(root);setDirection('all');setMinimum('0');setDraftMinimum('0');setZoom(1);setOffset({x:0,y:0});
    if(valid&&asset)void fetchAddress(root);return()=>{generation.current++;lock.current=false;};
    // A new root starts a separate, bounded research session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[root,refresh,token,asset]);
  const flow=useMemo(()=>buildFlow(sources.flatMap(s=>s.history.items),root,direction,minimum,asset||undefined),[sources,root,direction,minimum,asset]);
  const visible=useMemo(()=>[...new Set([root,...sources.map(s=>s.address),...flow.nodes])].filter(Boolean).slice(0,19),[root,sources,flow]);
  const visibleSet=new Set(visible),edges=flow.edges.filter(e=>visibleSet.has(e.from)&&visibleSet.has(e.to));
  const positions=new Map<string,{x:number;y:number}>();positions.set(root,{x:600,y:400});
  visible.filter(a=>a!==root).forEach((a,i)=>positions.set(a,{x:i%2?1050:150,y:68+Math.floor(i/2)*82}));
  useEffect(()=>{const area=canvasScroll.current;if(!area)return;const center=()=>{area.scrollLeft=(area.scrollWidth-area.clientWidth)/2;};center();const observer=new ResizeObserver(center);observer.observe(area);return()=>observer.disconnect();},[root,edges.length]);
  const names=new Map(sources.map(s=>[s.address,s.name]));
  const staleSources=sources.filter(source=>source.history.stale);
  const oldestAcquisition=sources.map(source=>Date.parse(source.history.fetchedAt)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
  const historySources=[...new Set(sources.flatMap(source=>source.history.sources||(source.history.source?[source.history.source]:[])))].join(' / ');
  const selectedEdge=flow.edges.find(e=>e.id===edgeId),selectedSource=sources.find(s=>s.address===selected);
  const details=selectedEdge?selectedEdge.transfers:flow.transfers.filter(t=>t.from===selected||t.to===selected);
  const incoming=details.filter(t=>t.to===selected).reduce((n,t)=>n+BigInt(t.raw),0n),outgoing=details.filter(t=>t.from===selected).reduce((n,t)=>n+BigInt(t.raw),0n);
  function open(address:string){setParams({view:'flow',address,token});}
  function search(e:FormEvent){e.preventDefault();if(!isAddress(query.trim())){setError(translateUi("0x ile başlayan geçerli bir Arc adresi gir."));return;}open(query.trim().toLowerCase());}
  function filter(e:FormEvent){e.preventDefault();try{decimalRaw(draftMinimum,decimals);setMinimum(draftMinimum);setEdgeId('');setError('');}catch{setError(translateUi("Minimum {0} tutarını en fazla {1} ondalık basamakla gir.", [symbol, decimals]));}}
  function selectNode(a:string){setSelected(a);setEdgeId('');setShowAll(false);}
  function selectEdge(e:FlowEdge){setSelected(e.from);setEdgeId(e.id);setShowAll(false);}
  return <section className="af-module">
    <div className="af-heading"><div><h1><GitBranch size={22}/>{translateUi("Akış haritası")}</h1><p>{translateUi("Seçilen tokenın adresler arasındaki hareketlerini incele.")}</p></div><span className="aw-chip">{translateText("ARC MAINNET · SALT OKUNUR")}</span></div>
    <ArcAssetPicker token={token} asset={asset} error={assetError} onChange={value=>setParams({view:'flow',...(root?{address:root}:{}),token:value})}/><form className="af-search" onSubmit={search}><Search size={18}/><input aria-label="Harita adresi" placeholder={translateUi("Cüzdan veya kontrat adresi · 0x…")} value={query} onChange={e=>setQuery(e.target.value)}/><button className="aw-button primary" type="submit">{translateUi("Haritayı aç")}<ArrowUpRight size={15}/></button></form>
    {!root?<div className="af-start aw-panel"><GitBranch size={40}/><h2>{translateUi("Bir adresle araştırmaya başla.")}</h2><p>{translateUi("Giriş ve çıkışları gör, bir bağlantıyı seç ve işlem kanıtını aç. Bağlantılı adresleri genişleterek araştırmayı sürdür.")}</p><button className="aw-button" onClick={()=>open(example)}>{translateText("PoolManager adresini incele ↗")}</button><small>{translateUi("Örnek adres gerçek Arc verisini kullanır.")}</small></div>:!valid?<p className="aw-error" role="alert">{translateUi("Geçerli bir Arc adresi gerekli.")}</p>:<>
      <div className="af-toolbar"><form onSubmit={filter}><label>{translateUi("Yön")}<select aria-label={translateUi("Akış yönü")} value={direction} onChange={e=>{setDirection(e.target.value as typeof direction);setEdgeId('');}}><option value="all">{translateUi("Tüm bağlantılar")}</option><option value="in">{translateUi("Merkeze giriş")}</option><option value="out">{translateUi("Merkezden çıkış")}</option></select></label><label>{translateText("Minimum transfer ·")}{symbol}<input aria-label={translateUi("Harita minimum token tutarı")} inputMode="decimal" value={draftMinimum} onChange={e=>setDraftMinimum(e.target.value.replace(',','.'))}/></label><button className="aw-button">{translateUi("Uygula")}</button></form><button className="aw-button" disabled={!!busy} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/>{translateUi("Yenile")}</button></div>
      {error&&<p className="aw-error" role="alert">{error}</p>}
      {!!staleSources.length&&<p className="aw-warning" role="status">{translateUi("Kayıtlı geçmiş gösteriliyor; güncel veri olmayabilir.")} {translateUi("Kaynak: {0} · En eski veri alınma zamanı: {1}",[historySources||'Arc Explorer',Number.isFinite(oldestAcquisition)?new Date(oldestAcquisition).toLocaleString(getLocale()):'—'])}</p>}
      <div className="af-stats"><span><strong>{flow.nodes.length}</strong>{translateUi("bağlantılı adres")}</span><span><strong>{flow.edges.length}</strong>{translateUi("yönlü bağlantı")}</span><span><strong>{flow.transfers.length}</strong>{translateUi("eşleşen transfer")}</span><span><strong>{sources.length} / 6</strong>{translateText("incelenen adres")}</span></div>
      <div className="af-layout"><div className="af-canvas aw-panel">
        <div className="af-canvas-top"><span><i/> {busy?translateUi("Zincir verisi yükleniyor…"):translateUi("Yüklenen transferlerden oluşturuldu")}</span><div><button aria-label={translateUi("Haritayı uzaklaştır")} onClick={()=>setZoom(z=>Math.max(.55,z-.15))}><Minus size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label={translateUi("Haritayı yakınlaştır")} onClick={()=>setZoom(z=>Math.min(2.5,z+.15))}><Plus size={16}/></button><button aria-label={translateUi("Haritayı ortala")} onClick={()=>{setZoom(1);setOffset({x:0,y:0});const area=canvasScroll.current;if(area)area.scrollLeft=(area.scrollWidth-area.clientWidth)/2;}}><Target size={16}/></button></div></div>
        {!!busy&&!sources.length?<div className="af-loading"><LoaderCircle className="aw-spin" size={25}/>{translateUi("Transfer bağlantıları alınıyor…")}</div>:!flow.edges.length?<div className="af-loading"><GitBranch size={30}/>{sources.length?translateUi("Yüklenen kayıtlarda bu filtreye uyan bağlantı yok."):translateUi("Harita için transfer verisi bekleniyor.")}{error&&<button className="aw-button" onClick={()=>void fetchAddress(root)}>{translateUi("Tekrar dene")}</button>}</div>:<div className="af-graph-scroll" ref={canvasScroll}><svg className="af-graph" viewBox="0 0 1200 800" aria-label={translateUi("{0} transfer bağlantıları", [symbol])} onPointerDown={e=>{if((e.target as Element).closest('[data-node],[data-edge]'))return;drag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(!drag.current)return;const scale=1200/e.currentTarget.getBoundingClientRect().width;const dx=(e.clientX-drag.current.x)*scale,dy=(e.clientY-drag.current.y)*scale;setOffset(o=>({x:o.x+dx,y:o.y+dy}));drag.current={x:e.clientX,y:e.clientY};}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
          <defs><pattern id="af-grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#332b40"/></pattern><marker id="af-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ac98ef"/></marker></defs><rect width="1200" height="800" fill="url(#af-grid)"/>
          <g transform={`translate(${600+offset.x} ${400+offset.y}) scale(${zoom}) translate(-600 -400)`}>
            {edges.map(e=>{const a=positions.get(e.from)!,b=positions.get(e.to)!;const forward=a.x<b.x,x1=a.x+(forward?90:-90),x2=b.x+(forward?-90:90),bend=e.from<e.to?-16:16;const path=`M${x1},${a.y} C${(x1+x2)/2},${a.y+bend} ${(x1+x2)/2},${b.y+bend} ${x2},${b.y}`;const active=edgeId===e.id||!edgeId&&(e.from===selected||e.to===selected);return <g key={e.id} data-edge="true" role="button" tabIndex={0} aria-label={`${short(e.from)} → ${short(e.to)}: ${displayRaw(e.raw,decimals)} ${symbol}, ${e.transfers.length} transfer`} onClick={()=>selectEdge(e)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEdge(e);}}} className={active?'af-edge active':'af-edge'}><title>{displayRaw(e.raw,decimals)} {symbol} · {e.transfers.length} transfer</title><path className="af-edge-hit" d={path}/><path d={path} strokeWidth={edgeId===e.id?3:1.5} markerEnd="url(#af-arrow)"/></g>;})}
            {visible.map(a=>{const p=positions.get(a)!;return <g data-node="true" key={a} transform={`translate(${p.x-90} ${p.y-29})`} tabIndex={0} role="button" aria-label={translateUi("{0} adresini seç", [names.get(a)||short(a)])} onClick={()=>selectNode(a)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(a);}}} className={`af-node ${a===root?'root':''} ${a===selected?'selected':''}`}><title>{a}</title><rect width="180" height="58" rx="7"/><circle cx="17" cy="18" r="4"/><text x="29" y="22">{(names.get(a)||short(a)).slice(0,22)}</text><text className="af-node-sub" x="14" y="43">{a===root?translateUi('MERKEZ'):sources.some(s=>s.address===a)?translateUi("GENİŞLETİLDİ"):short(a)}</text></g>;})}
          </g>
        </svg></div>}
        <div className="af-legend"><span>{translateUi("→ Gönderenden alıcıya")}</span><span>{translateUi("Bir çizgi aynı yöndeki transferleri birleştirir")}</span><span>{translateUi("Boş alanı sürükleyerek taşı")}</span></div>
        {flow.nodes.length>visible.length&&<p className="aw-note">{translateUi("Okunabilirlik için")}{visible.length} {translateUi("adres gösteriliyor;")}{flow.nodes.length-visible.length} {translateUi("adres çizimde gizli. Yeni filtreyle daraltabilir veya işlem listesinden adresi merkez yapabilirsin.")}</p>}
      </div><aside className="af-detail aw-panel"><h2>{selectedEdge?translateUi("Bağlantı ayrıntısı"):translateUi("Seçili adres")}</h2><strong>{names.get(selected)||short(selected)}</strong><code>{selected}</code><div className="af-detail-links"><Link to={`/arc/addresses/${selected}?token=${token}`}>{translateUi("Cüzdan profili ↗")}</Link><a href={`https://explorer.arc.io/address/${selected}`} target="_blank" rel="noopener noreferrer">Explorer ↗</a></div>
        {selectedEdge?<div className="af-edge-summary"><span>{translateUi("GÖNDEREN → ALICI")}</span><button onClick={()=>selectNode(selectedEdge.from)}>{short(selectedEdge.from)}</button><span>↓</span><button onClick={()=>selectNode(selectedEdge.to)}>{short(selectedEdge.to)}</button><strong>{displayRaw(selectedEdge.raw,decimals)} {symbol}</strong><small>{selectedEdge.transfers.length} {translateUi("yüklenmiş transfer toplamı")}</small></div>:<div className="af-detail-totals"><span>{translateUi("Giriş")}<strong>{displayRaw(incoming.toString(),decimals)} {symbol}</strong></span><span>{translateUi("Çıkış")}<strong>{displayRaw(outgoing.toString(),decimals)} {symbol}</strong></span></div>}
        <button className="aw-button primary" disabled={!!busy||!!selectedSource||sources.length>=6} onClick={()=>void fetchAddress(selected)}><Expand size={14}/>{selectedSource?translateUi("Adres genişletildi"):translateUi("Bağlantıları genişlet")}</button>
        {sources.length>=6&&<small>{translateUi("Bu araştırmada en fazla 6 adres genişletilir. Yeni merkezle devam edebilirsin.")}</small>}
        <button className="aw-button" onClick={()=>open(selected)}>{translateText("Bu adresi merkez yap")}</button>
        <Link className="aw-button" to={`/arc?view=alerts&address=${selected}&token=${token}`}>{translateUi("Bu adres için alarm oluştur")}</Link>
        <h3>{translateUi("Yüklenen kaynaklar")}</h3><div className="af-sources">{sources.map(s=><div key={s.address}><button onClick={()=>selectNode(s.address)}>{s.name||short(s.address)}</button><small>{s.history.items.length} {translateUi("kayıt ·")}{s.history.scannedPages} {translateUi("kaynak sayfası")}{ s.history.skipped?translateUi(" · {0} doğrulanamayan satır atlandı", [s.history.skipped]):''}</small>{s.history.nextCursor?<button className="aw-text" disabled={!!busy} onClick={()=>void fetchAddress(s.address,true)}>{busy===s.address?translateUi("Yükleniyor…"):translateUi('Daha eski transferleri getir')}</button>:<small>{translateUi("Kaynak devam sayfası yok.")}</small>}</div>)}</div>
      </aside></div>
      <section className="aw-panel af-ledger"><h2><span>{selectedEdge?translateUi("Bu bağlantının işlemleri"):translateUi("Seçili adresin işlemleri")}</span><small>{details.length} {translateUi("yüklenmiş transfer")}</small></h2><div className="aw-table-scroll"><table className="aw-table"><thead><tr><th>{translateUi("ZAMAN / BLOK")}</th><th>{translateUi("GÖNDEREN → ALICI")}</th><th>{symbol}</th><th>{translateUi("KANIT")}</th></tr></thead><tbody>{details.slice(0,showAll?undefined:20).map(t=><tr key={t.id}><td>{t.timestamp?new Date(t.timestamp).toLocaleString(getLocale()):translateUi('Zaman yok')}<small>#{t.block.toLocaleString(getLocale())}</small></td><td><button onClick={()=>selectNode(t.from)}>{short(t.from)}</button> → <button onClick={()=>selectNode(t.to)}>{short(t.to)}</button></td><td className="aw-number">{displayRaw(t.raw,decimals)}</td><td><a href={`https://explorer.arc.io/tx/${t.hash}`} target="_blank" rel="noopener noreferrer">{translateUi("İşlemi aç ↗")}</a></td></tr>)}</tbody></table></div>{!details.length&&<p className="aw-empty">{translateUi("Seçili adres için eşleşen kayıt yok.")}</p>}{details.length>20&&<button className="aw-text af-show-all" onClick={()=>setShowAll(v=>!v)}>{showAll?translateUi("Daha az göster"):translateUi("{0} kaydın tamamını göster", [details.length])}</button>}</section>
      <p className="af-coverage">{translateUi("Kaynak: Arc Explorer · Yalnızca yüklenen, doğrulanabilir")}{symbol} {translateUi("transferleri. Minimum filtre her transfer için uygulanır. Harita tüm zincir geçmişini kapsamaz; bağlantılar ortak sahiplik veya kurum aidiyeti göstermez. Güncellemek için Yenile’yi kullan.")}</p>
    </>}
  </section>;
}
