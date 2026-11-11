import {t,getLocale} from '../i18n/index';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Boxes,ExternalLink,LoaderCircle,Pause,Play,Radio} from 'lucide-react';
import {api} from '../api';
import {displayRaw} from '../arc-wallet';
import {researchUrl,type ExplorerRow,type LiveSnapshot} from '../chain-explorer';
import {useVisiblePolling} from '../hooks/useVisiblePolling';
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

/** Shared live snapshot of the newest blocks and validated transactions. Rows are provider evidence;
 * nothing here is aggregated into balances or business records. */
export function ArcLiveFeed({chain='5042'}:{chain?:string}){
 const [data,setData]=useState<LiveSnapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[paused,setPaused]=useState(false),[now,setNow]=useState(()=>Date.now());
 const seen=useRef<Set<string>>(new Set()),[fresh,setFresh]=useState<Set<string>>(new Set()),busy=useRef(false);
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
 useEffect(()=>{seen.current=new Set();setData(null);setLoading(true);void load();},[load]);
 useVisiblePolling(()=>void load(),data?.liveMs||5000,!paused);
 useVisiblePolling(()=>setNow(Date.now()),1000,!paused);
 const stats=record(data?.stats),gas=record(stats.gas_prices),decimals=data?.network.nativeDecimals??18,symbol=data?.network.nativeSymbol||'';
 const blockTime=count(stats.average_block_time),utilization=count(stats.network_utilization_percentage);
 const facts:[string,string][]=[
  [t('Son blok'),data?.blocks[0]?.block?.toLocaleString(getLocale())||(count(stats.total_blocks)?.toLocaleString(getLocale())??'—')],
  [t('Ort. blok süresi'),blockTime===null?'—':t('{0} sn',[(blockTime/1000).toLocaleString(getLocale(),{maximumFractionDigits:2})])],
  [t('Bugünkü işlem'),count(stats.transactions_today)?.toLocaleString(getLocale())??'—'],
  [t('Toplam işlem'),count(stats.total_transactions)?.toLocaleString(getLocale())??'—'],
  [t('Toplam adres'),count(stats.total_addresses)?.toLocaleString(getLocale())??'—'],
  [t('Ağ kullanımı'),utilization===null?'—':`%${utilization.toLocaleString(getLocale(),{maximumFractionDigits:1})}`],
  [t('Ort. gas'),count(gas.average)===null?'—':`${count(gas.average)!.toLocaleString(getLocale(),{maximumFractionDigits:4})} Gwei`],
 ];
 const state=paused?t('Duraklatıldı'):data?.mode==='cached'?t('Kayıtlı veri'):data?.mode==='saving'?t('Tasarruf modu'):t('Canlı');
 return <section className="at-live" aria-label={t('Canlı Arc ağı')}>
  <div className="at-section-title"><h2><Radio size={16} className={paused?'':'at-live-pulse'}/> {t('Canlı Arc ağı')}</h2>
   <div className="at-feed-pagination"><span className={`at-live-state${paused?' is-paused':''}`}><i/>{state}{data&&!paused?` · ${Math.round(data.liveMs/1000)} sn`:''}</span>
    <button aria-label={paused?t('Canlı akışı sürdür'):t('Canlı akışı duraklat')} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={16}/>:<Pause size={16}/>}</button></div></div>
  <div className="at-live-stats">{facts.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
  {error&&<div className="at-feed-error" role="alert">{error}{data?t(' Son başarılı görüntü korunuyor.'):''}</div>}
  {data?.failed.length?<div className="at-feed-error" role="status">{data.failed.map(f=>`${f.section}: ${f.error}`).join(' · ')}</div>:null}
  <div className="at-live-grid">
   <div className="at-feed-panel at-live-panel" aria-busy={loading}><div className="at-live-heading"><Boxes size={14}/>{t('Son bloklar')}</div>
    <ul className="at-live-list">{data?.blocks.map(row=><BlockRow key={row.id} row={row} chain={chain} now={now} fresh={fresh.has(row.id)}/>)}</ul>
    {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('Bloklar yükleniyor…')}</div>}</div>
   <div className="at-feed-panel at-live-panel" aria-busy={loading}><div className="at-live-heading"><Radio size={14}/>{t('Son işlemler')}</div>
    <ul className="at-live-list">{data?.transactions.map(row=><TransactionRow key={row.id} row={row} chain={chain} now={now} fresh={fresh.has(row.id)} decimals={decimals} symbol={symbol} explorer={data.network.explorer}/>)}</ul>
    {!data&&loading&&<div className="at-feed-empty"><LoaderCircle size={18} className="at-spinning"/> {t('İşlemler yükleniyor…')}</div>}</div>
  </div>
  <div className="at-feed-footer"><span>{data?.source||t('Blockscout bağlantısı')}</span><span>{data?t('Veri zamanı {0}',[new Date(data.fetchedAt).toLocaleTimeString(getLocale())]):t('Bağlanıyor')}</span></div>
  <p className="at-section-note">{t('Ağdaki en yeni bloklar ve doğrulanmış işlemler. Tüm izleyiciler aynı sunucu görüntüsünü paylaşır; sayfa gizliyken akış durur. İşlem değeri bakiye veya iş kaydı değildir.')}</p>
 </section>;
}

function BlockRow({row,chain,now,fresh}:{row:ExplorerRow;chain:string;now:number;fresh:boolean}){
 const d=record(row.data),txs=count(d.transactions_count??d.transaction_count),hash=typeof d.hash==='string'?d.hash:null;
 return <li className={fresh?'is-new':''}><Link to={`/arc?view=explorer&chain=${chain}&data=block&block=${row.block??hash??''}`} className="at-live-main"><b>#{row.block?.toLocaleString(getLocale())??'—'}</b><small>{hash?short(hash):''}</small></Link>
  <span className="at-live-meta">{txs===null?'—':t('{0} işlem',[txs.toLocaleString(getLocale())])}</span><span className="at-live-time">{ago(row.timestamp,now)}</span></li>;
}

function TransactionRow({row,chain,now,fresh,decimals,symbol,explorer}:{row:ExplorerRow;chain:string;now:number;fresh:boolean;decimals:number;symbol:string;explorer:string}){
 const d=record(row.data),method=typeof d.method==='string'&&d.method?d.method:Array.isArray(d.transaction_types)&&d.transaction_types.length?String(d.transaction_types[0]):t('İşlem');
 const failed=d.status==='error'||(typeof d.result==='string'&&d.result!=='success'&&d.result!=='');
 const value=native(d.value,decimals),fee=native(record(d.fee).value,decimals);
 return <li className={`${fresh?'is-new':''}${failed?' is-failed':''}`}>
  <div className="at-live-main">{row.hash?<Link to={`/arc?view=explorer&chain=${chain}&data=tx&hash=${row.hash}`}><b>{short(row.hash)}</b></Link>:<b>—</b>}<small className="at-live-method" title={method}>{method}{failed?` · ${t('başarısız')}`:''}</small></div>
  <div className="at-live-route">{row.from?<Link to={researchUrl(chain,row.from)}>{short(row.from)}</Link>:<span>—</span>}<span aria-hidden="true">→</span>{row.to?<Link to={researchUrl(chain,row.to)}>{short(row.to)}</Link>:<span>{t('Kontrat oluşturma')}</span>}</div>
  <span className="at-live-meta" title={[value&&value.exact!=='0'?`${value.exact} ${symbol}`:'',fee?t('Ücret {0} {1}',[fee.exact,symbol]):''].filter(Boolean).join(' · ')||undefined}>{value&&value.exact!=='0'?`${value.text} ${symbol}`:fee?t('Ücret {0}',[fee.text]):'—'}</span>
  <span className="at-live-time">{ago(row.timestamp,now)}{row.hash&&<a href={`${explorer}/tx/${row.hash}`} target="_blank" rel="noopener noreferrer" aria-label={t('Explorer’da doğrula')}><ExternalLink size={11}/></a>}</span></li>;
}
