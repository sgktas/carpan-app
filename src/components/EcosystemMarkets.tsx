import {usePageLoading} from '../hooks/usePageLoading';
import {useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {Activity, ArrowDownUp, ArrowUpRight, ChevronLeft, ExternalLink, Layers3, RefreshCw, Search, ShieldCheck, TrendingUp} from 'lucide-react';
import {api} from '../api';
import {useI18n} from '../i18n';
import type {EcosystemAsset} from '../ecosystem';
import type {ArcMarketPool, MarketRange, MarketSnapshot, MarketToken} from '../markets';
import {MarketPriceChart} from './MarketPriceChart';
import './ecosystem-markets.css';

function useSnapshot<T>(key:string, loader:()=>Promise<MarketSnapshot<T>>, enabled=true){
  const [state,setState]=useState<{key:string;value:MarketSnapshot<T>|null;error:string}>({key,value:null,error:''});
  const [retry,setRetry]=useState(0);
  usePageLoading(enabled&&(state.key!==key||!state.value)&&!(state.key===key&&state.error));
  useEffect(()=>{
    let active=true,busy=false;
    setState(previous=>({key,value:previous.key===key?previous.value:null,error:''}));
    const read=async()=>{
      if(busy||!enabled)return;
      busy=true;
      try{const value=await loader();if(active)setState({key,value,error:''});}
      catch(e){if(active)setState(previous=>({key,value:previous.key===key&&previous.value?{...previous.value,status:'stale',reason:'connection_unavailable'}:null,error:e instanceof Error?e.message:'Unavailable'}));}
      finally{busy=false;}
    };
    void read();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void read();},60000);
    const visible=()=>{if(document.visibilityState==='visible')void read();};
    document.addEventListener('visibilitychange',visible);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[key,retry,enabled]);
  return {value:state.key===key?state.value:null,error:state.key===key?state.error:'',refresh:()=>setRetry(n=>n+1)};
}

function dollars(value:number|null,language:string,compact=false){
  if(value===null)return '—';
  if(value>0&&value<1e-10)return '< $0.0000000001';
  const scale=compact&&value>=1e9?1e9:compact&&value>=1e6?1e6:compact&&value>=1e3?1e3:1;
  const suffix=scale===1e9?'B':scale===1e6?'M':scale===1e3?'K':'';
  return new Intl.NumberFormat(language==='en'?'en-US':'tr-TR',{style:'currency',currency:'USD',minimumFractionDigits:compact?0:value>=1?2:0,maximumFractionDigits:compact?2:value>=100?2:value>=1?4:value>=.01?6:10}).format(value/scale)+suffix;
}

function Change({value,language}:{value:number|null;language:string}){
  if(value===null)return <span className="em-no-value">—</span>;
  return <span className={`em-change ${value>=0?'em-positive':'em-negative'}`}>{value>0?'+':''}{value.toLocaleString(language==='en'?'en-US':'tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})}%</span>;
}

function TokenBadge({symbol}:{symbol:string}){
  return <span className={`em-token-badge em-token-${symbol.toLowerCase().replace(/[^a-z0-9]/g,'')}`} aria-hidden="true">{symbol==='USDC'?'$':symbol==='EURC'?'€':symbol.slice(0,3)}</span>;
}

function SnapshotSource({value,compact=false}:{value:MarketSnapshot<unknown>|null;compact?:boolean}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  return <div className={`em-source${compact?' em-source-compact':''}`}>
    <a href="https://www.geckoterminal.com" target="_blank" rel="noopener noreferrer"><img src="/images/geckoterminal.svg" alt="" width={17} height={17}/>{compact?'GeckoTerminal':s('On-chain data provided by GeckoTerminal','Zincir verisi kaynağı: GeckoTerminal')}<ExternalLink size={12}/></a>
    <span className={`em-status ${value?.status||'loading'}`}>{!value?s('Loading','Yükleniyor'):value.status==='fresh'?s('Latest snapshot','Son veri'):value.status==='stale'?s('Stale snapshot','Eski veri'):s('Source unavailable','Kaynak kullanılamıyor')}</span>
    {value?.retrievedAt&&<time dateTime={value.retrievedAt}>{s('Retrieved','Alındı')} {new Date(value.retrievedAt).toLocaleString(language==='en'?'en-GB':'tr-TR')}</time>}
  </div>;
}

function PoolStats({pool}:{pool:ArcMarketPool}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  const metrics=[
    {label:s('Pool liquidity','Havuz likiditesi'),value:dollars(pool.liquidityUsd,language,true),icon:Layers3},
    {label:s('Pool volume · 24h','Havuz hacmi · 24s'),value:dollars(pool.volume24hUsd,language,true),icon:ArrowDownUp},
    {label:s('Pool transactions · 24h','Havuz işlemleri · 24s'),value:pool.transactions24h===null?'—':pool.transactions24h.toLocaleString(language==='en'?'en-US':'tr-TR'),icon:Activity},
  ];
  return <div className="em-stats">{metrics.map(({label,value,icon:Icon})=><div key={label}><span><Icon size={14}/>{label}</span><strong>{value}</strong></div>)}</div>;
}

function PoolChart({pool,range,side,onRange,onSide,compact=false}:{
  pool:ArcMarketPool;range:MarketRange;side:'base'|'quote';onRange:(range:MarketRange)=>void;onSide:(address:string)=>void;compact?:boolean;
}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  const state=useSnapshot(`chart:${pool.id}:${range}:${side}`,()=>api.marketChart(pool.id,range,side));
  return <section className={`em-chart-panel${compact?' em-chart-preview':''}`} aria-label={s('Pool price chart','Havuz fiyat grafiği')}>
    <div className="em-chart-toolbar">
      <div className="em-chart-pair"><span className="em-chart-label">{s('PRICE / USD','FİYAT / USD')}</span><div className="em-token-side">{([pool.base,pool.quote] as MarketToken[]).map((item,index)=><button type="button" key={`${item.address}:${index}`} aria-pressed={side===(index===0?'base':'quote')} onClick={()=>onSide(item.address)}>{item.symbol}</button>)}</div></div>
      <div className="em-chart-timeframe"><span>{range==='24h'?s('15m candles','15dk mumlar'):s('1h candles','1 saatlik mumlar')}</span><div className="em-ranges">{(['24h','7d'] as MarketRange[]).map(value=><button type="button" key={value} aria-pressed={range===value} onClick={()=>onRange(value)}>{value==='7d'?s('7D','7G'):s('24H','24S')}</button>)}</div><button type="button" className="em-refresh" onClick={state.refresh} aria-label={s('Refresh chart','Grafiği yenile')}><RefreshCw size={14}/></button></div>
    </div>
    {state.value?.status==='stale'&&<p className="em-stale" role="status">{s('Chart shows the last successful source snapshot.','Grafik son başarılı kaynak verisini gösteriyor.')}</p>}
    {state.value?.status==='unavailable'?<div className="em-chart-empty"><Activity size={28}/><strong>{s('Chart source unavailable','Grafik kaynağı kullanılamıyor')}</strong><span>{s('Retry to load actual trades.','Gerçek işlemleri yüklemek için yeniden dene.')}</span><button className="em-button" onClick={state.refresh}>{s('Retry chart','Grafiği yeniden dene')}</button></div>:
      state.value?<MarketPriceChart key={`${pool.id}:${side}:${range}`} candles={state.value.data} range={range} symbol={(side==='base'?pool.base:pool.quote).symbol}/>:
      state.error?<div className="em-chart-empty" role="alert"><Activity size={28}/><strong>{s('Chart could not load','Grafik yüklenemedi')}</strong><button className="em-button" onClick={state.refresh}>{s('Retry chart','Grafiği yeniden dene')}</button></div>:
      <div className="em-chart-loading" role="status"><span/><span/><span/><span/><span/><p>{s('Loading source candles…','Kaynak mumlar yükleniyor…')}</p></div>}
    <SnapshotSource value={state.value} compact/>
    {state.error&&state.value?.status==='stale'&&<button type="button" className="em-button" onClick={state.refresh}>{s('Retry chart','Grafiği yeniden dene')}</button>}
  </section>;
}

function PoolEvidence({pool,snapshot}:{pool:ArcMarketPool;snapshot:MarketSnapshot<unknown>|null}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  return <aside className="em-evidence">
    <div className="em-panel-title"><ShieldCheck size={17}/><h3>{s('Pool evidence','Havuz kanıtı')}</h3></div>
    <dl className="em-facts"><div><dt>{s('Network','Ağ')}</dt><dd>Arc Mainnet <span>5042</span></dd></div><div><dt>DEX</dt><dd>{pool.dex}</dd></div>{pool.createdAt&&<div><dt>{s('Pool created','Havuz oluşturuldu')}</dt><dd>{new Date(pool.createdAt).toLocaleDateString(language==='en'?'en-GB':'tr-TR')}</dd></div>}</dl>
    <div className="em-proof-block"><span>{pool.kind==='contract'?s('Pool contract','Havuz kontratı'):s('Pool identifier','Havuz kimliği')}</span><code>{pool.id}</code>{pool.kind==='contract'?<Link to={`/arc/contracts/${pool.id}`}>{s('Inspect in Terminal','Terminal’de incele')}<ArrowUpRight size={13}/></Link>:<p className="em-note">{s('This is a pool identifier, not an EVM contract address.','Bu bir havuz kimliğidir; EVM kontrat adresi değildir.')}</p>}</div>
    {[pool.base,pool.quote].map((item,index)=><div className="em-token-proof" key={`${item.address}:${index}`}><div><TokenBadge symbol={item.symbol}/><strong>{item.symbol}</strong><span>{index===0?s('Base','Baz'):s('Quote','Karşılık')}</span></div>{item.native&&<small>{s('Native USDC · canonical ERC-20 address','Yerel USDC · kanonik ERC-20 adresi')}</small>}<code>{item.address}</code><Link to={`/arc/contracts/${item.address}`}>{s('Inspect token','Tokenı incele')}<ArrowUpRight size={13}/></Link></div>)}
    <a className="em-provider-link" href={pool.sourceUrl} target="_blank" rel="noopener noreferrer">{s('Open source pool page','Kaynak havuz sayfasını aç')}<ExternalLink size={14}/></a>
    <SnapshotSource value={snapshot} compact/>
    <p className="em-note">{s('Metrics describe this pool. A provider listing is not a reviewed project or security assessment.','Veriler bu havuzu tanımlar. Sağlayıcı kaydı, incelenmiş proje veya güvenlik değerlendirmesi değildir.')}</p>
  </aside>;
}

function PoolDetail({id,token,range}:{id:string;token:string;range:MarketRange}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  const [params,setParams]=useSearchParams();
  const poolState=useSnapshot(`pool:${id}`,()=>api.marketPool(id));
  const pool=poolState.value?.data[0];
  const side=pool&&token.toLowerCase()===pool.quote.address?'quote':'base';
  const update=(changes:Record<string,string>)=>setParams({...Object.fromEntries(params),...changes,view:'tokens'});
  if(!poolState.value&&!poolState.error)return <section className="em-market-workspace"><div className="em-chart-empty" role="status">{s('Loading pool research…','Havuz araştırması yükleniyor…')}</div></section>;
  if(!pool)return <section className="em-market-workspace em-unavailable"><h2>{s('Pool data unavailable','Havuz verisi kullanılamıyor')}</h2><p className="em-note">{s('This source did not return an Arc pool.','Bu kaynak Arc havuzu döndürmedi.')}</p><button className="em-button" onClick={poolState.refresh}>{s('Retry','Yeniden dene')}</button><Link className="em-back" to="/ecosystem?view=tokens">{s('Back to markets','Piyasalara dön')}</Link></section>;
  const selected=side==='quote'?pool.quote:pool.base,price=side==='quote'?pool.quotePriceUsd:pool.basePriceUsd;
  return <div className="em-market-workspace em-pool-detail">
    <Link className="em-back" to="/ecosystem?view=tokens"><ChevronLeft size={14}/>{s('All markets','Tüm piyasalar')}</Link>
    <header className="em-detail-header"><div className="em-pair-identity"><div className="em-pair-badges"><TokenBadge symbol={pool.base.symbol}/><TokenBadge symbol={pool.quote.symbol}/></div><div><span className="em-chart-label">ARC MAINNET / {pool.dex}</span><h2>{pool.name}</h2><p>{s('Selected asset','Seçilen varlık')} · {selected.symbol} / USD</p></div></div><div className="em-head-price"><span>{selected.symbol} / USD</span><strong>{dollars(price,language)}</strong>{side==='base'&&<div><Change value={pool.change24h} language={language}/><small>{s('24h','24s')}</small></div>}</div></header>
    {poolState.value?.status==='stale'&&<p className="em-stale" role="status">{s('Pool metrics are from the last successful source snapshot.','Havuz verileri son başarılı kaynak verisinden alınmıştır.')}</p>}
    <PoolStats pool={pool}/>
    <div className="em-detail-grid"><PoolChart pool={pool} range={range} side={side} onRange={value=>update({range:value})} onSide={address=>update({token:address})}/><PoolEvidence pool={pool} snapshot={poolState.value}/></div>
  </div>;
}

type PoolSort='liquidity'|'volume'|'activity'|'newest';

export function EcosystemMarkets({assets}:{assets:EcosystemAsset[]}){
  const {language}=useI18n(),s=(en:string,tr:string)=>language==='en'?en:tr;
  const [params,setParams]=useSearchParams();
  const mode=params.get('markets')==='new'?'new':params.get('markets')==='pools'?'pools':'assets';
  const token=params.get('token')||'',pool=params.get('pool')||'',range=params.get('range')==='7d'?'7d':'24h';
  const state=useSnapshot(`list:${mode}:${token}`,()=>api.marketPools(mode==='new'?'new':'top',token&&!pool?token:undefined),!pool);
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<PoolSort>('liquidity');
  const [previewChoice,setPreviewChoice]=useState<{pool:string;token:string}|null>(null);
  const [previewRange,setPreviewRange]=useState<MarketRange>('24h');
  const pools=state.value?.data||[];
  const choose=(next:string)=>{setQuery('');setParams({view:'tokens',...(next==='assets'?{}:{markets:next})});};
  const detail=(p:ArcMarketPool,address=p.base.address,selectedRange:MarketRange='24h')=>`/ecosystem?${new URLSearchParams({view:'tokens',pool:p.id,token:address,range:selectedRange})}`;
  const selectPool=(address:string)=>pools.filter(p=>p.base.address===address.toLowerCase()||p.quote.address===address.toLowerCase()).sort((a,b)=>(b.liquidityUsd??-1)-(a.liquidityUsd??-1))[0];
  const matches=(value:string)=>value.toLowerCase().includes(query.toLowerCase().trim());
  const visibleAssets=assets.filter(a=>(!token||a.address.toLowerCase()===token.toLowerCase())&&matches(`${a.symbol} ${a.name} ${a.address}`));
  const shown=pools.filter(p=>matches(`${p.name} ${p.dex} ${p.id} ${p.base.address} ${p.quote.address}`)).sort((a,b)=>{
    if(sort==='newest')return (b.createdAt?new Date(b.createdAt).getTime():-1)-(a.createdAt?new Date(a.createdAt).getTime():-1);
    const property=sort==='volume'?'volume24hUsd':sort==='activity'?'transactions24h':'liquidityUsd';
    return (b[property]??-1)-(a[property]??-1);
  });
  const pricedAssets=assets.filter(a=>{const p=selectPool(a.address);return p&&(p.base.address===a.address.toLowerCase()?p.basePriceUsd:p.quotePriceUsd)!==null;});
  const defaultAsset=(token?assets.find(a=>a.address.toLowerCase()===token.toLowerCase()):undefined)||pricedAssets.find(a=>!['USDC','EURC','USYC'].includes(a.symbol))||pricedAssets[0];
  const fallbackPool=defaultAsset?selectPool(defaultAsset.address):shown[0];
  const previewPool=pools.find(p=>p.id===previewChoice?.pool)||fallbackPool;
  const previewAddress=previewChoice&&previewPool?.id===previewChoice.pool?previewChoice.token:defaultAsset&&previewPool===fallbackPool?defaultAsset.address.toLowerCase():previewPool?.base.address;
  const previewSide=previewPool&&previewAddress===previewPool.quote.address?'quote':'base';
  const previewToken=previewPool&&(previewSide==='base'?previewPool.base:previewPool.quote);
  const previewPrice=previewPool&&(previewSide==='base'?previewPool.basePriceUsd:previewPool.quotePriceUsd);
  const hasValues=state.value&&state.value.status!=='unavailable';
  if(pool)return <PoolDetail id={pool} token={token} range={range}/>;

  return <section className="em-market-workspace em-market-panel">
    <div className="em-market-heading"><div><h2>{s('Tokens & Markets','Tokenlar ve piyasalar')}</h2><p>{s('Explore documented assets, inspect liquidity and read actual pool trades.','Kaynaklı varlıkları keşfet, likiditeyi incele ve gerçek havuz işlemlerini araştır.')}</p></div><button type="button" className="em-refresh" onClick={state.refresh} aria-label={s('Refresh markets','Piyasaları yenile')}><RefreshCw size={16}/></button></div>
    <div className="em-navigation">{[['assets',s('Documented assets','Kaynaklı varlıklar')],['pools',s('Arc pools','Arc havuzları')],['new',s('New pools','Yeni havuzlar')]].map(([key,title])=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>choose(key)}>{key==='new'?<TrendingUp size={15}/>:key==='pools'?<Layers3 size={15}/>:<ShieldCheck size={15}/>} {title}<span>{key==='assets'?assets.length:key===mode&&hasValues?pools.length:'Arc'}</span></button>)}</div>
    <SnapshotSource value={state.value}/>
    {state.value?.status==='stale'&&<p className="em-stale" role="status">{s('The provider could not refresh. Last successful values are shown with their retrieval time.','Sağlayıcı güncellenemedi. Son başarılı veriler, alınma zamanıyla gösteriliyor.')}</p>}
    {state.error&&!state.value&&<p className="eco-error" role="alert">{state.error}</p>}
    {!state.value&&!state.error?<div className="em-chart-empty" role="status">{s('Loading Arc markets…','Arc piyasaları yükleniyor…')}</div>:
      !hasValues?<div className="em-chart-empty"><Activity size={28}/><strong>{s('Market source unavailable','Piyasa kaynağı kullanılamıyor')}</strong><span>{s('No substitute prices are shown. Retry shortly.','Yerine tahmini fiyat gösterilmez. Kısa süre sonra yeniden dene.')}</span><button className="em-button" onClick={state.refresh}>{s('Retry','Yeniden dene')}</button></div>:
      <>
        {mode==='assets'&&<div className="em-asset-cards">{assets.filter(a=>!token||a.address.toLowerCase()===token.toLowerCase()).map(a=>{const p=selectPool(a.address),base=p?.base.address===a.address.toLowerCase(),selected=previewToken?.address===a.address.toLowerCase();return <button type="button" className={`em-asset-card${selected?' is-selected':''}`} key={a.address} disabled={!p} aria-pressed={selected} onClick={()=>{if(p)setPreviewChoice({pool:p.id,token:a.address.toLowerCase()});}}><div><TokenBadge symbol={a.symbol}/><span><strong>{a.symbol}</strong><small>{a.name}</small></span>{p&&<ArrowUpRight size={14}/>}</div><strong className="em-asset-price">{dollars(p?(base?p.basePriceUsd:p.quotePriceUsd):null,language)}</strong><footer>{p&&base?<><Change value={p.change24h} language={language}/><span>{s('24h · pool','24s · havuz')}</span></>:<span>{p?s('Quote asset · pool price','Karşılık varlığı · havuz fiyatı'):s('No indexed price','İndekslenmiş fiyat yok')}</span>}</footer></button>;})}</div>}
        {previewPool&&previewToken&&<div className="em-market-feature"><div className="em-feature-heading"><div className="em-feature-identity"><TokenBadge symbol={previewToken.symbol}/><div><span className="em-chart-label">{s('POOL PRICE EXPLORER','HAVUZ FİYAT ARAŞTIRMASI')}</span><h3>{previewToken.symbol} <span>/ USD</span></h3><p>{previewPool.name} <span>·</span> {previewPool.dex}</p></div></div><div className="em-feature-price"><strong>{dollars(previewPrice??null,language)}</strong>{previewSide==='base'&&<Change value={previewPool.change24h} language={language}/>}<Link to={detail(previewPool,previewToken.address,previewRange)}>{s('Open pool research','Havuz araştırmasını aç')}<ArrowUpRight size={14}/></Link></div></div><div className="em-feature-grid"><PoolChart pool={previewPool} range={previewRange} side={previewSide} onRange={setPreviewRange} onSide={address=>setPreviewChoice({pool:previewPool.id,token:address})} compact/><aside className="em-feature-aside"><span className="em-chart-label">{s('SELECTED POOL','SEÇİLİ HAVUZ')}</span><PoolStats pool={previewPool}/><p className="em-note">{s('Pool-specific metrics. Prices are not token-wide aggregates.','Bu havuza ait veriler. Fiyatlar tüm token piyasasının toplamı değildir.')}</p><Link className="em-button" to={detail(previewPool,previewToken.address,previewRange)}>{s('Contracts & sources','Kontratlar ve kaynaklar')}<ArrowUpRight size={14}/></Link></aside></div></div>}
        <section className="em-directory-surface"><div className="em-directory-toolbar"><div><h3>{mode==='assets'?s('Asset directory','Varlık dizini'):mode==='new'?s('Recently indexed pools','Yeni indekslenmiş havuzlar'):s('Arc pool directory','Arc havuz dizini')}</h3><span>{mode==='assets'?`${visibleAssets.length} ${s('documented assets','kaynaklı varlık')}`:`${shown.length} ${s('pools in source snapshot','kaynak verisindeki havuz')}`}</span></div><div className="em-directory-controls"><label className="em-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={mode==='assets'?s('Search assets','Varlık ara'):s('Search pool, DEX or address','Havuz, DEX veya adres ara')} aria-label={s('Search markets','Piyasa ara')}/></label>{mode!=='assets'&&<label className="em-sort"><ArrowDownUp size={14}/><select value={sort} onChange={e=>setSort(e.target.value as PoolSort)} aria-label={s('Sort pools','Havuzları sırala')}><option value="liquidity">{s('Liquidity','Likidite')}</option><option value="volume">{s('24h volume','24s hacim')}</option><option value="activity">{s('24h transactions','24s işlemler')}</option><option value="newest">{s('Newest','En yeni')}</option></select></label>}</div></div>
        {mode==='assets'?<><div className="em-table-scroll"><table className="em-market-table"><thead><tr><th>{s('Asset','Varlık')}</th><th>{s('Pool price','Havuz fiyatı')}</th><th>{s('24h · base','24s · baz')}</th><th>{s('Pool volume · 24h','Havuz hacmi · 24s')}</th><th>{s('Pool liquidity','Havuz likiditesi')}</th><th>{s('Research','Araştırma')}</th></tr></thead><tbody>{visibleAssets.map(a=>{const p=selectPool(a.address),base=p?.base.address===a.address.toLowerCase();return <tr key={a.address} className={previewToken?.address===a.address.toLowerCase()?'is-selected':''}><td><div className="em-table-identity"><TokenBadge symbol={a.symbol}/><span><strong>{a.symbol}</strong><small>{a.name}</small></span></div></td><td className="em-price">{dollars(p?(base?p.basePriceUsd:p.quotePriceUsd):null,language)}{p&&<small>{p.name} · {p.dex}</small>}</td><td><Change value={p&&base?p.change24h:null} language={language}/></td><td>{dollars(p?.volume24hUsd??null,language,true)}</td><td>{dollars(p?.liquidityUsd??null,language,true)}</td><td><div className="em-table-actions">{p?<Link to={detail(p,a.address.toLowerCase())}>{s('Chart','Grafik')}<ArrowUpRight size={13}/></Link>:<Link to={`/ecosystem?view=tokens&token=${a.address}`}>{s('Find pools','Havuz ara')}<Search size={13}/></Link>}<Link to={`/arc/contracts/${a.address}`}>Terminal<ArrowUpRight size={13}/></Link></div>{!p&&<small>{s('No matching pool in this snapshot','Bu veride eşleşen havuz yok')}</small>}</td></tr>;})}</tbody></table></div>{!visibleAssets.length&&<div className="em-chart-empty em-compact-empty">{s('No assets match your search.','Aramanızla eşleşen varlık yok.')}</div>}{token&&<Link className="em-back" to="/ecosystem?view=tokens">{s('All documented assets','Tüm kaynaklı varlıklar')}</Link>}<p className="em-note">{s('Asset price comes from the matching pool with the highest reported liquidity in this snapshot. Volume and liquidity refer to that pool.','Varlık fiyatı, bu veride eşleşen havuzlar arasında en yüksek bildirilen likiditeye sahip havuzdan alınır. Hacim ve likidite bu havuza aittir.')}</p></>:
          <><div className="em-table-scroll"><table className="em-market-table"><thead><tr><th>{s('Pool / DEX','Havuz / DEX')}</th><th>{s('Base price','Baz fiyatı')}</th><th>{s('24h · base','24s · baz')}</th><th>{s('Pool volume · 24h','Havuz hacmi · 24s')}</th><th>{s('Liquidity','Likidite')}</th><th>{s('Research','Araştırma')}</th></tr></thead><tbody>{shown.map(p=><tr key={p.id} className={previewPool?.id===p.id?'is-selected':''}><td><div className="em-table-identity"><TokenBadge symbol={p.base.symbol}/><span><button type="button" className="em-pool-select" onClick={()=>setPreviewChoice({pool:p.id,token:p.base.address})}>{p.name}</button><small>{p.dex}{mode==='new'&&p.createdAt?` · ${new Date(p.createdAt).toLocaleDateString(language==='en'?'en-GB':'tr-TR')}`:''}</small></span></div></td><td className="em-price">{dollars(p.basePriceUsd,language)}</td><td><Change value={p.change24h} language={language}/></td><td>{dollars(p.volume24hUsd,language,true)}</td><td>{dollars(p.liquidityUsd,language,true)}</td><td><Link className="em-research-link" to={detail(p)}>{s('Pool & chart','Havuz ve grafik')}<ArrowUpRight size={13}/></Link></td></tr>)}</tbody></table></div>{!shown.length&&<div className="em-chart-empty em-compact-empty">{s('No matching pools returned.','Eşleşen havuz dönmedi.')}</div>}<p className="em-note">{mode==='new'?s('Recent provider-indexed pools, not an upcoming project or token-launch calendar.','Sağlayıcının yeni indekslediği havuzlar; yaklaşan proje veya token lansmanı takvimi değildir.'):s('First page returned by the source. This snapshot does not cover the entire Arc market.','Kaynağın döndürdüğü ilk sayfa. Bu veri tüm Arc piyasasını kapsamaz.')}</p></>}
        </section>
      </>}
    <p className="em-note em-boundary">{s('Native and ERC-20 USDC are one asset. Missing fields stay unavailable; indexed tokens do not automatically become reviewed Ecosystem projects.','Yerel ve ERC-20 USDC tek varlıktır. Eksik alanlar kullanılamıyor olarak kalır; indekslenmiş tokenlar otomatik olarak incelenmiş Ekosistem projesi olmaz.')}</p>
  </section>;
}
