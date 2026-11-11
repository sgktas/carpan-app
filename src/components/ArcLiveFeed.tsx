import {t,getLocale} from '../i18n/index';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeftRight,Boxes,ExternalLink,Fuel,Gauge,Hash,LoaderCircle,Pause,Play,Radio,Timer,TrendingDown,TrendingUp,Wallet} from 'lucide-react';
import {api} from '../api';
import {displayRaw} from '../arc-wallet';
import {researchUrl,type ExplorerRow,type LiveSnapshot} from '../chain-explorer';
import {useVisiblePolling} from '../hooks/useVisiblePolling';
import {AddressAvatar,TxTypeBadge,transactionType} from './TerminalVisuals';
import './arc-live-feed.css';

const short=(value:string)=>`${value.slice(0,8)}…${value.slice(-4)}`;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const count=(value:unknown)=>{const n=typeof value==='number'?value:typeof value==='string'&&value!==''?Number(value):NaN;return Number.isFinite(n)&&n>=0?n:null;};
function ago(timestamp:string|null,now:number){if(!timestamp)return '—';const s=Math.max(0,Math.floor((now-Date.parse(timestamp))/1000));return s<60?t('{0} sn',[s]):s<3600?t('{0} dk',[Math.floor(s/60)]):t('{0} sa',[Math.floor(s/3600)]);}
/** Compact display only (max 6 fraction digits, truncated, never rounded up); the exact value stays in the title and evidence page. */
function native(raw:unknown,decimals:number){
 if(typeof raw!=='string'||!/^\d+$/.test(raw)||raw.length>100)return null;
 const value=BigInt(raw),keep=Math.min(6,decimals),truncated=value/10n**BigInt(decimals-keep);
 return {exact:displayRaw(raw,decimals),text:value>0n&&truncated===0n?`<${displayRaw('1',keep)}`:displayRaw(truncated.toString(),keep)};
}
type ChartPoint={date:string;value:number};

/** Shared live snapshot of the newest blocks and validated transactions. Rows are provider evidence;
 * nothing here is aggregated into balances or business records. */
export function ArcLiveFeed({chain='5042'}:{chain?:string}){
 const [data,setData]=useState<LiveSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),[now,setNow]=useState(()=>Date.now());
 const seen=useRef<Set<string>>(new Set()),[fresh,setFresh]=useState<Set<string>>(new Set()),busy=useRef(false);
 // While the pointer rests on the transaction list, rows stay still and new arrivals are counted instead.
 const [frozen,setFrozen]=useState<LiveSnapshot|null>(null);
 const [chart,setChart]=useState<ChartPoint[]>([]);
 const load=useCallback(async()=>{
  if(busy.current)return;busy.current=true;
  try{
   const next=await api.liveSnapshot(chain);
   const ids=[...next.blocks,...next.transactions].map(row=>row.id);
   // The first page is the baseline. Arc produces ~2 blocks per second, so a refresh can replace
   // almost every row; highlighting is kept only when it still points at a minority of rows.
   const arrived=seen.current.size?ids.filter(id=>!seen.current.has(id)):[];
   setFresh(arrived.length&&arrived.length<=ids.length/2?new Set(arrived):new Set());
   seen.current=new Set(ids);setData(next);setError('');
  }catch(e){setError(e instanceof Error?e.message:t('Canlı zincir verisi alınamadı.'));}
  finally{busy.current=false;setLoading(false);setNow(Date.now());}
 },[chain]);
 const loadChart=useCallback(()=>{api.explorerData(chain,{kind:'txChart'}).then(result=>{
  setChart(result.items.flatMap(row=>{const d=record(row.data),value=count(d.transactions_count??d.transaction_count??d.value);return typeof d.date==='string'&&value!==null?[{date:d.date,value}]:[];}).sort((a,b)=>a.date.localeCompare(b.date)));
 }).catch(()=>{/* The chart is optional context; the live lists remain usable. */});},[chain]);
 useEffect(()=>{seen.current=new Set();setData(null);setFrozen(null);setLoading(true);void load();loadChart();},[load,loadChart]);
 useVisiblePolling(()=>void load(),data?.liveMs||5000,!paused);
 useVisiblePolling(()=>setNow(Date.now()),1000,!paused);
 useVisiblePolling(loadChart,600000);
 const shown=frozen||data;
 const waiting=useMemo(()=>{if(!frozen||!data)return 0;const old=new Set(frozen.transactions.map(r=>r.id));return data.transactions.filter(r=>!old.has(r.id)).length;},[frozen,data]);
 const stats=record(data?.stats),gas=record(stats.gas_prices),decimals=data?.network.nativeDecimals??18,symbol=data?.network.nativeSymbol||'';
 const blockTime=count(stats.average_block_time),utilization=count(stats.network_utilization_percentage);
 const facts:{icon:typeof Boxes;label:string;value:string}[]=[
  {icon:Boxes,label:t('Son blok'),value:data?.blocks[0]?.block?.toLocaleString(getLocale())||(count(stats.total_blocks)?.toLocaleString(getLocale())??'—')},
  {icon:Timer,label:t('Ort. blok süresi'),value:blockTime===null?'—':t('{0} sn',[(blockTime/1000).toLocaleString(getLocale(),{maximumFractionDigits:2})])},
  {icon:ArrowLeftRight,label:t('Bugünkü işlem'),value:count(stats.transactions_today)?.toLocaleString(getLocale())??'—'},
  {icon:Hash,label:t('Toplam işlem'),value:count(stats.total_transactions)?.toLocaleString(getLocale())??'—'},
  {icon:Wallet,label:t('Toplam adres'),value:count(stats.total_addresses)?.toLocaleString(getLocale())??'—'},
  {icon:Gauge,label:t('Ağ kullanımı'),value:utilization===null?'—':`%${utilization.toLocaleString(getLocale(),{maximumFractionDigits:1})}`},
  {icon:Fuel,label:t('Ort. gas'),value:count(gas.average)===null?'—':`${count(gas.average)!.toLocaleString(getLocale(),{maximumFractionDigits:2})} Gwei`},
 ];
 const state=paused?t('Duraklatıldı'):data?.mode==='cached'?t('Kayıtlı veri'):data?.mode==='saving'?t('Tasarruf modu'):t('Canlı');
 return <section className="at-live" aria-label={t('Canlı Arc ağı')}>
  <div className="at-section-title"><h2><Radio size={16} className={paused?'':'at-live-pulse'}/> {t('Canlı Arc ağı')}</h2>
   <div className="at-feed-pagination"><span className={`at-live-state${paused?' is-paused':''}`}><i/>{state}{data&&!paused?` · ${Math.round(data.liveMs/1000)} sn`:''}</span>
    <button aria-label={paused?t('Canlı akışı sürdür'):t('Canlı akışı duraklat')} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={16}/>:<Pause size={16}/>}</button></div></div>
  <div className="at-live-top">
   <div className="at-live-stats">{facts.map(({icon:Icon,label,value})=><div key={label}><span className="at-live-stat-icon" aria-hidden="true"><Icon size={15}/></span><div><span>{label}</span><strong title={value}>{value}</strong></div></div>)}</div>
   <TransactionChart points={chart}/>
  </div>
  {error&&<div className="at-feed-error" role="alert">{error}{data?t(' Son başarılı görüntü korunuyor.'):''}</div>}
  {data?.failed.length?<div className="at-feed-error" role="status">{data.failed.map(f=>`${f.section}: ${f.error}`).join(' · ')}</div>:null}
  <div className="at-live-grid">
   <div className="at-feed-panel at-live-panel" aria-busy={loading}><div className="at-live-heading"><Boxes size={14}/>{t('Son bloklar')}</div>
    <ul className="at-live-list">{shown?.blocks.map(row=><BlockRow key={row.id} row={row} chain={chain} now={now} fresh={!frozen&&fresh.has(row.id)}/>)}</ul>
    {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('Bloklar yükleniyor…')}</div>}</div>
   <div className="at-feed-panel at-live-panel" aria-busy={loading} onMouseEnter={()=>setFrozen(data)} onMouseLeave={()=>setFrozen(null)}>
    <div className="at-live-heading"><ArrowLeftRight size={14}/>{t('Son işlemler')}{frozen&&<span className="at-live-hold">{t('Liste sabit')}</span>}</div>
    {waiting>0&&<button className="at-live-more" onClick={()=>setFrozen(data)}>{t('{0} yeni işlem geldi · göster',[data&&waiting>=data.transactions.length?`${waiting}+`:waiting])}</button>}
    <ul className="at-live-list">{shown?.transactions.map(row=><TransactionRow key={row.id} row={row} chain={chain} now={now} fresh={!frozen&&fresh.has(row.id)} decimals={decimals} symbol={symbol} explorer={shown.network.explorer}/>)}</ul>
    {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('İşlemler yükleniyor…')}</div>}</div>
  </div>
  <div className="at-feed-footer"><span>{data?.source||t('Blockscout bağlantısı')}</span><span>{data?t('Veri zamanı {0}',[new Date(data.fetchedAt).toLocaleTimeString(getLocale())]):t('Bağlanıyor')}</span></div>
  <p className="at-section-note">{t('Ağdaki en yeni bloklar ve doğrulanmış işlemler. Tüm izleyiciler aynı sunucu görüntüsünü paylaşır; sayfa gizliyken akış durur. İşlem değeri bakiye veya iş kaydı değildir.')}</p>
 </section>;
}

/** Daily transaction counts from the provider's own chart endpoint; no interpolation or projection. */
function TransactionChart({points}:{points:ChartPoint[]}){
 const last=points.at(-1),previous=points.at(-2);
 if(points.length<2||!last)return <div className="at-live-chart is-empty"><span>{t('Günlük işlemler')}</span><strong>—</strong></div>;
 const max=Math.max(...points.map(p=>p.value)),min=Math.min(...points.map(p=>p.value)),span=Math.max(1,max-min);
 const line=points.map((p,i)=>`${(i/(points.length-1)*100).toFixed(2)},${(36-(p.value-min)/span*32).toFixed(2)}`).join(' ');
 const change=previous&&previous.value>0?(last.value-previous.value)/previous.value*100:null,Trend=change!==null&&change<0?TrendingDown:TrendingUp;
 const day=(value:string)=>new Date(`${value}T00:00:00Z`).toLocaleDateString(getLocale(),{day:'numeric',month:'short',timeZone:'UTC'});
 return <div className="at-live-chart">
  <div className="at-live-chart-head"><span>{t('Günlük işlemler · {0} gün',[points.length])}</span>{change!==null&&<b className={change<0?'is-down':'is-up'}><Trend size={12}/>{`${change>0?'+':''}${change.toLocaleString(getLocale(),{maximumFractionDigits:1})}%`}</b>}</div>
  <strong>{last.value.toLocaleString(getLocale())}</strong>
  <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={t('{0} – {1} günlük işlem sayısı',[day(points[0].date),day(last.date)])}>
   <defs><linearGradient id="at-live-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
   <polygon points={`0,40 ${line} 100,40`} fill="url(#at-live-chart-fill)"/>
   <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>
  </svg>
  <div className="at-live-chart-range"><span>{day(points[0].date)}</span><span>{day(last.date)}</span></div>
 </div>;
}

function BlockRow({row,chain,now,fresh}:{row:ExplorerRow;chain:string;now:number;fresh:boolean}){
 const d=record(row.data),txs=count(d.transactions_count??d.transaction_count),hash=typeof d.hash==='string'?d.hash:null,used=count(d.gas_used_percentage);
 const validator=typeof record(d.miner).hash==='string'?String(record(d.miner).hash):null;
 return <li className={fresh?'is-new':''}>
  <Link to={`/arc?view=explorer&chain=${chain}&data=block&block=${row.block??hash??''}`} className="at-live-main at-live-block"><span className="at-live-chip" aria-hidden="true"><Boxes size={14}/></span><span><b>#{row.block?.toLocaleString(getLocale())??'—'}</b><small title={validator||undefined}>{validator?<><AddressAvatar address={validator} size={11}/> {short(validator)}</>:hash?short(hash):''}</small></span></Link>
  <span className="at-live-meta">{txs===null?'—':t('{0} işlem',[txs.toLocaleString(getLocale())])}{used!==null&&<i className="at-live-gas" title={t('Blok doluluğu %{0}',[used.toLocaleString(getLocale(),{maximumFractionDigits:2})])}><i style={{width:`${Math.max(4,Math.min(100,used))}%`}}/></i>}</span>
  <span className="at-live-time">{ago(row.timestamp,now)}</span></li>;
}

function TransactionRow({row,chain,now,fresh,decimals,symbol,explorer}:{row:ExplorerRow;chain:string;now:number;fresh:boolean;decimals:number;symbol:string;explorer:string}){
 const d=record(row.data),method=typeof d.method==='string'&&d.method?d.method:null,type=transactionType(d.transaction_types);
 const failed=d.status==='error'||(typeof d.result==='string'&&d.result!=='success'&&d.result!=='');
 const value=native(d.value,decimals),fee=native(record(d.fee).value,decimals);
 const name=(side:unknown)=>{const v=record(side);return typeof v.name==='string'&&v.name?v.name:null;};
 return <li className={`${fresh?'is-new':''}${failed?' is-failed':''}`}>
  <div className="at-live-main">{row.hash?<Link to={`/arc?view=explorer&chain=${chain}&data=tx&hash=${row.hash}`}><b>{short(row.hash)}</b></Link>:<b>—</b>}<span className="at-live-tags"><TxTypeBadge type={type}/>{method&&<small className="at-live-method" title={method}>{method}</small>}{failed&&<small className="at-live-method">{t('başarısız')}</small>}</span></div>
  <div className="at-live-route">{row.from?<Link to={researchUrl(chain,row.from)} title={row.from}><AddressAvatar address={row.from} size={14}/><span>{name(d.from)||short(row.from)}</span></Link>:<span>—</span>}<span aria-hidden="true">→</span>{row.to?<Link to={researchUrl(chain,row.to)} title={row.to}><AddressAvatar address={row.to} size={14}/><span>{name(d.to)||short(row.to)}</span></Link>:<span>{t('Kontrat oluşturma')}</span>}</div>
  <span className="at-live-meta" title={[value&&value.exact!=='0'?`${value.exact} ${symbol}`:'',fee?t('Ücret {0} {1}',[fee.exact,symbol]):''].filter(Boolean).join(' · ')||undefined}>{value&&value.exact!=='0'?`${value.text} ${symbol}`:fee?t('Ücret {0}',[fee.text]):'—'}</span>
  <span className="at-live-time">{ago(row.timestamp,now)}{row.hash&&<a href={`${explorer}/tx/${row.hash}`} target="_blank" rel="noopener noreferrer" aria-label={t('Explorer’da doğrula')}><ExternalLink size={11}/></a>}</span></li>;
}
