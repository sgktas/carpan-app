import {t,getLocale} from '../i18n/index';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Boxes,ExternalLink,LoaderCircle,Pause,Play,TrendingDown,TrendingUp,ArrowLeftRight} from 'lucide-react';
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
export type ChartPoint={date:string;value:number};
export type ArcLive={chain:string;data:LiveSnapshot|null;error:string;loading:boolean;paused:boolean;setPaused:(next:boolean|((previous:boolean)=>boolean))=>void;now:number;fresh:Set<string>;chart:ChartPoint[]};

/** One shared live snapshot of the newest blocks, validated transactions and chain stats for a network.
 * Every consumer on the page reads this single source, so the page makes one provider read per refresh.
 * Rows are provider evidence; nothing here is aggregated into balances or business records. */
export function useArcLive(chain='5042'):ArcLive{
 const [data,setData]=useState<LiveSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),[now,setNow]=useState(()=>Date.now());
 const seen=useRef<Set<string>>(new Set()),[fresh,setFresh]=useState<Set<string>>(new Set()),busy=useRef(false);
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
 useEffect(()=>{seen.current=new Set();setData(null);setLoading(true);void load();loadChart();},[load,loadChart]);
 useVisiblePolling(()=>void load(),data?.liveMs||5000,!paused);
 useVisiblePolling(()=>setNow(Date.now()),1000,!paused);
 useVisiblePolling(loadChart,600000);
 return {chain,data,error,loading,paused,setPaused,now,fresh,chart};
}

/** One-row statistics strip: the numbers a terminal keeps in sight, without a card per number. */
export function LiveStatsStrip({live}:{live:ArcLive}){
 const {data,paused,setPaused}=live;
 const stats=record(data?.stats),gas=record(stats.gas_prices);
 const blockTime=count(stats.average_block_time),utilization=count(stats.network_utilization_percentage);
 const facts:[string,string][]=[
  [t('Son blok'),data?.blocks[0]?.block?.toLocaleString(getLocale())||(count(stats.total_blocks)?.toLocaleString(getLocale())??'—')],
  [t('Ort. blok süresi'),blockTime===null?'—':t('{0} sn',[(blockTime/1000).toLocaleString(getLocale(),{maximumFractionDigits:2})])],
  [t('Bugünkü işlem'),count(stats.transactions_today)?.toLocaleString(getLocale())??'—'],
  [t('Toplam işlem'),count(stats.total_transactions)?.toLocaleString(getLocale())??'—'],
  [t('Toplam adres'),count(stats.total_addresses)?.toLocaleString(getLocale())??'—'],
  [t('Ağ kullanımı'),utilization===null?'—':`%${utilization.toLocaleString(getLocale(),{maximumFractionDigits:1})}`],
  [t('Ort. gas'),count(gas.average)===null?'—':`${count(gas.average)!.toLocaleString(getLocale(),{maximumFractionDigits:2})} Gwei`],
 ];
 const state=paused?t('Duraklatıldı'):data?.mode==='cached'?t('Kayıtlı veri'):data?.mode==='saving'?t('Tasarruf modu'):t('Canlı');
 return <div className="th-strip" role="group" aria-label={t('Canlı Arc ağı')}>
  <dl>{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}</dl>
  <div className="th-strip-state">
   <span className={`at-live-state${paused?' is-paused':''}`}><i/>{state}{data&&!paused?` · ${Math.round(data.liveMs/1000)} sn`:''}</span>
   <button type="button" aria-label={paused?t('Canlı akışı sürdür'):t('Canlı akışı duraklat')} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={15}/>:<Pause size={15}/>}</button>
  </div>
 </div>;
}

export function LiveErrors({live}:{live:ArcLive}){
 return <>
  {live.error&&<div className="at-feed-error" role="alert">{live.error}{live.data?t(' Son başarılı görüntü korunuyor.'):''}</div>}
  {live.data?.failed.length?<div className="at-feed-error" role="status">{live.data.failed.map(f=>`${f.section}: ${f.error}`).join(' · ')}</div>:null}
 </>;
}

/** While the pointer rests on the list, rows stay still and new arrivals are counted instead. */
export function LiveTransactionsList({live}:{live:ArcLive}){
 const {data,loading,now,fresh,chain}=live;
 const [frozen,setFrozen]=useState<LiveSnapshot|null>(null);
 const shown=frozen||data;
 const waiting=useMemo(()=>{if(!frozen||!data)return 0;const old=new Set(frozen.transactions.map(r=>r.id));return data.transactions.filter(r=>!old.has(r.id)).length;},[frozen,data]);
 const decimals=data?.network.nativeDecimals??18,symbol=data?.network.nativeSymbol||'';
 return <section className="at-live th-live" aria-label={t('Son işlemler')}>
  <div className="at-feed-panel at-live-panel" aria-busy={loading} onMouseEnter={()=>setFrozen(data)} onMouseLeave={()=>setFrozen(null)}>
   <div className="at-live-heading"><ArrowLeftRight size={14}/>{t('Son işlemler')}{frozen&&<span className="at-live-hold">{t('Liste sabit')}</span>}</div>
   {waiting>0&&<button className="at-live-more" onClick={()=>setFrozen(data)}>{t('{0} yeni işlem geldi · göster',[data&&waiting>=data.transactions.length?`${waiting}+`:waiting])}</button>}
   <ul className="at-live-list at-live-txs">{shown?.transactions.map(row=><TransactionRow key={row.id} row={row} chain={chain} now={now} fresh={!frozen&&fresh.has(row.id)} decimals={decimals} symbol={symbol} explorer={shown.network.explorer}/>)}</ul>
   {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('İşlemler yükleniyor…')}</div>}
  </div>
  <p className="at-section-note">{t('Ağdaki en yeni bloklar ve doğrulanmış işlemler. Tüm izleyiciler aynı sunucu görüntüsünü paylaşır; sayfa gizliyken akış durur. İşlem değeri bakiye veya iş kaydı değildir.')}</p>
 </section>;
}

export function LiveBlocksList({live}:{live:ArcLive}){
 const {data,loading,now,fresh,chain}=live;
 return <section className="at-live th-live" aria-label={t('Son bloklar')}>
  <div className="at-feed-panel at-live-panel" aria-busy={loading}>
   <div className="at-live-heading"><Boxes size={14}/>{t('Son bloklar')}</div>
   <ul className="at-live-list at-live-blocks">{data?.blocks.map(row=><BlockRow key={row.id} row={row} chain={chain} now={now} fresh={fresh.has(row.id)}/>)}</ul>
   {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('Bloklar yükleniyor…')}</div>}
  </div>
 </section>;
}

/** Transactions per block for the newest blocks: a live series straight from the provider's block rows. */
export function BlockActivityCard({live}:{live:ArcLive}){
 const blocks=[...(live.data?.blocks||[])].reverse();
 const counts=blocks.map(row=>count(record(row.data).transactions_count??record(row.data).transaction_count)??0);
 if(counts.length<2)return <div className="th-card"><div className="th-card-head"><span>{t('Blok başına işlem')}</span></div><div className="at-feed-empty"><LoaderCircle size={16} className="at-spinning"/></div></div>;
 const max=Math.max(1,...counts),average=counts.reduce((a,b)=>a+b,0)/counts.length;
 return <div className="th-card">
  <div className="th-card-head"><span>{t('Blok başına işlem · son {0} blok',[counts.length])}</span><b>{t('ort. {0}',[average.toLocaleString(getLocale(),{maximumFractionDigits:1})])}</b></div>
  <div className="th-bars" role="img" aria-label={t('Son {0} bloktaki işlem sayısı',[counts.length])}>
   {counts.map((value,i)=><span key={blocks[i].id} title={`#${blocks[i].block?.toLocaleString(getLocale())??''} · ${t('{0} işlem',[value.toLocaleString(getLocale())])}`} style={{height:`${Math.max(4,value/max*100)}%`}}/>)}
  </div>
  <div className="at-live-chart-range"><span>#{blocks[0].block?.toLocaleString(getLocale())}</span><span>#{blocks[blocks.length-1].block?.toLocaleString(getLocale())}</span></div>
 </div>;
}

/** Daily transaction counts from the provider's own chart endpoint; no interpolation or projection. */
export function DailyTransactionsCard({points}:{points:ChartPoint[]}){
 const last=points.at(-1),previous=points.at(-2);
 if(points.length<2||!last)return <div className="th-card at-live-chart is-empty"><span>{t('Günlük işlemler')}</span><strong>—</strong></div>;
 const max=Math.max(...points.map(p=>p.value)),min=Math.min(...points.map(p=>p.value)),span=Math.max(1,max-min);
 const line=points.map((p,i)=>`${(i/(points.length-1)*100).toFixed(2)},${(36-(p.value-min)/span*32).toFixed(2)}`).join(' ');
 const change=previous&&previous.value>0?(last.value-previous.value)/previous.value*100:null,Trend=change!==null&&change<0?TrendingDown:TrendingUp;
 const day=(value:string)=>new Date(`${value}T00:00:00Z`).toLocaleDateString(getLocale(),{day:'numeric',month:'short',timeZone:'UTC'});
 return <div className="th-card at-live-chart">
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
