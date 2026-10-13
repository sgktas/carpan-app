import type {Database} from 'bun:sqlite';
import type {ArcMarketPool,MarketCandle,MarketRange,MarketSnapshot,MarketToken} from '../src/markets';
import {ARC_USDC} from '../src/arc-wallet';

const origin='https://api.geckoterminal.com/api/v2';
const addressPattern=/^0x[0-9a-f]{40}$/i;
export const validPoolId=(value:string)=>/^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value);
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const label=(v:unknown,fallback:string,max=80)=>typeof v==='string'&&v.trim()?v.replace(/[\x00-\x1f]/g,'').slice(0,max):fallback;
function numeric(v:unknown,negative=false){if(v===null||v===undefined||v===''||typeof v==='string'&&!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v))return null;if(typeof v!=='string'&&typeof v!=='number')return null;const n=Number(v);return Number.isFinite(n)&&(negative||n>=0)?n:null;}
function tokenId(v:unknown){if(typeof v!=='string'||!v.startsWith('arc_'))return null;const address=v.slice(4).toLowerCase();return addressPattern.test(address)?address:null;}
function token(value:unknown,includes:Map<string,Record<string,unknown>>,fallback:string):MarketToken|null{
 const id=record(record(value).data).id,address=tokenId(id);if(!address)return null;
 const native=address==='0x'+'0'.repeat(40);const metadata=includes.get(String(id))||{};
 return {address:native?ARC_USDC.toLowerCase():address,native,symbol:native?'USDC':label(metadata.symbol,fallback,24),name:native?'USD Coin':label(metadata.name,fallback)};
}
export function normalizePools(payload:unknown):ArcMarketPool[]{
 const body=record(payload),included=Array.isArray(body.included)?body.included:[];
 if(!Array.isArray(body.data)&&typeof record(body.data).id!=='string')throw new Error('invalid_response');
 const metadata=new Map(included.map(item=>{const row=record(item);return [String(row.id),record(row.attributes)] as const;}));
 const items=Array.isArray(body.data)?body.data:[body.data];const unique=new Map<string,ArcMarketPool>();
 for(const value of items){const row=record(value),a=record(row.attributes),r=record(row.relationships);
  if(typeof row.id!=='string'||!row.id.startsWith('arc_'))continue;
  const id=row.id.slice(4).toLowerCase();if(!validPoolId(id)||typeof a.address!=='string'||a.address.toLowerCase()!==id)continue;
  const name=label(a.name,'Arc pool'),parts=name.split(' / ');const base=token(r.base_token,metadata,parts[0]),quote=token(r.quote_token,metadata,(parts[1]||'Token').split(' ')[0]);
  if(!base||!quote||base.address===quote.address)continue;
  const dexId=record(record(r.dex).data).id;const dex=typeof dexId==='string'?label(metadata.get(dexId)?.name,dexId):'Unknown DEX';
  const counts=record(record(a.transactions).h24),buys=numeric(counts.buys),sells=numeric(counts.sells);
  const created=typeof a.pool_created_at==='string'&&Number.isFinite(Date.parse(a.pool_created_at))?new Date(a.pool_created_at).toISOString():null;
  unique.set(id,{id,kind:id.length===42?'contract':'pool-id',name,dex,base,quote,basePriceUsd:numeric(a.base_token_price_usd),quotePriceUsd:numeric(a.quote_token_price_usd),change24h:numeric(record(a.price_change_percentage).h24,true),volume24hUsd:numeric(record(a.volume_usd).h24),liquidityUsd:numeric(a.reserve_in_usd),transactions24h:buys!==null&&sells!==null&&Number.isSafeInteger(buys+sells)?buys+sells:null,createdAt:created,sourceUrl:`https://www.geckoterminal.com/arc/pools/${id}`});
 }
 if(items.length&&!unique.size)throw new Error('invalid_response');
 return [...unique.values()].slice(0,100);
}
export function normalizeCandles(payload:unknown,now=Date.now()):MarketCandle[]{
 const list=record(record(record(payload).data).attributes).ohlcv_list;if(!Array.isArray(list))throw new Error('invalid_response');
 const result=new Map<number,MarketCandle>();
 for(const item of list){if(!Array.isArray(item)||item.length<6)continue;const values=item.slice(0,6).map(x=>numeric(x));if(values.some(x=>x===null))continue;
  const [time,open,high,low,close,volume]=values as number[];
  if(!Number.isSafeInteger(time)||time<1577836800||time*1000>now+60000||low>high||open<low||open>high||close<low||close>high)continue;
  result.set(time,{time,open,high,low,close,volume});
 }
 return [...result.values()].sort((a,b)=>a.time-b.time).slice(-200);
}

export function initMarketCache(db:Database){db.run('CREATE TABLE IF NOT EXISTS ecosystem_market_cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,retrieved_at INTEGER NOT NULL)');}
type Options={fetcher?:typeof fetch;now?:()=>number;interval?:number};
export function createMarketService(db:Database,options:Options={}){
 initMarketCache(db);const fetcher=options.fetcher||fetch,now=options.now||Date.now;
 const flights=new Map<string,Promise<MarketSnapshot<unknown>>>(),failed=new Map<string,{until:number;reason:string}>();
 const starts:number[]=[];const interval=options.interval??60000;
 function unavailable<T>(data:T,reason:string):MarketSnapshot<T>{return {data,status:'unavailable',retrievedAt:null,reason,source:'GeckoTerminal',chainId:5042};}
 async function cached<T>(key:string,path:string,ttl:number,empty:T,parse:(value:unknown)=>T):Promise<MarketSnapshot<T>>{
  const stamp=now();const row=db.query('SELECT payload,retrieved_at AS at FROM ecosystem_market_cache WHERE key=?').get(key) as {payload:string;at:number}|null;
  let known:T|null=null;try{if(row&&stamp-row.at<900000)known=JSON.parse(row.payload) as T;}catch{db.run('DELETE FROM ecosystem_market_cache WHERE key=?',[key]);}
  const wrap=(data:T,status:'fresh'|'stale',at:number,reason:string|null=null):MarketSnapshot<T>=>({data,status,retrievedAt:new Date(at).toISOString(),reason,source:'GeckoTerminal',chainId:5042});
  if(row&&known!==null&&stamp-row.at<ttl)return wrap(known,'fresh',row.at);
  const pending=flights.get(key);if(pending)return pending as Promise<MarketSnapshot<T>>;
  const failure=failed.get(key);if(failure&&failure.until>stamp)return row&&known!==null?wrap(known,'stale',row.at,failure.reason):unavailable(empty,failure.reason);
  while(starts.length&&stamp-starts[0]>=interval)starts.shift();
  if(starts.length>=8)return row&&known!==null?wrap(known,'stale',row.at,'rate_limit'):unavailable(empty,'rate_limit');
  starts.push(stamp);
  const promise=(async()=>{
   try{
    const response=await fetcher(origin+path,{headers:{Accept:'application/json;version=20230203'},signal:AbortSignal.timeout(8000),redirect:'error'});
    if(response.status===429)throw new Error('rate_limit');
    if(response.status===404){const result=empty;db.run('INSERT OR REPLACE INTO ecosystem_market_cache VALUES(?,?,?)',[key,JSON.stringify(result),now()]);return wrap(result,'fresh',now());}
    if(!response.ok)throw new Error('provider_unavailable');
    if(Number(response.headers.get('content-length'))>3000000)throw new Error('invalid_response');
    const body=await response.text();if(body.length>3000000)throw new Error('invalid_response');
    const parsed=parse(JSON.parse(body)),at=now();
    db.run('INSERT OR REPLACE INTO ecosystem_market_cache VALUES(?,?,?)',[key,JSON.stringify(parsed),at]);
    db.run('DELETE FROM ecosystem_market_cache WHERE retrieved_at<?',[at-900000]);
    failed.delete(key);return wrap(parsed,'fresh',at);
   }catch(error){const reason=error instanceof Error&&['rate_limit','invalid_response'].includes(error.message)?error.message:'provider_unavailable';failed.set(key,{until:now()+60000,reason});if(failed.size>300)failed.delete(failed.keys().next().value!);return row&&known!==null?wrap(known,'stale',row.at,reason):unavailable(empty,reason);}
  })();
  flights.set(key,promise as Promise<MarketSnapshot<unknown>>);try{return await promise;}finally{flights.delete(key);}
 }
 return {
  pools:async(view:'top'|'new'='top')=>cached(`pools:${view}`,`/networks/arc/${view==='new'?'new_pools':'pools'}?include=base_token,quote_token,dex`,60000,[] as ArcMarketPool[],normalizePools),
  tokenPools:async(address:string)=>{if(!addressPattern.test(address)||/^0x0{40}$/i.test(address))throw new Error('invalid_token');return cached(`token:${address.toLowerCase()}`,`/networks/arc/tokens/${address.toLowerCase()}/pools?include=base_token,quote_token,dex`,120000,[] as ArcMarketPool[],v=>normalizePools(v).filter(p=>p.base.address===address.toLowerCase()||p.quote.address===address.toLowerCase()));},
  pool:async(id:string)=>{if(!validPoolId(id))throw new Error('invalid_pool');return cached(`pool:${id.toLowerCase()}`,`/networks/arc/pools/${id.toLowerCase()}?include=base_token,quote_token,dex`,60000,[] as ArcMarketPool[],v=>normalizePools(v).filter(p=>p.id===id.toLowerCase()));},
  candles:async(id:string,range:MarketRange='24h',side:'base'|'quote'='base')=>{if(!validPoolId(id)||!['24h','7d'].includes(range)||!['base','quote'].includes(side))throw new Error('invalid_chart');return cached(`chart:${id.toLowerCase()}:${range}:${side}`,`/networks/arc/pools/${id.toLowerCase()}/ohlcv/${range==='24h'?'minute':'hour'}?aggregate=${range==='24h'?15:1}&limit=${range==='24h'?96:168}&currency=usd&token=${side}&include_empty_intervals=false`,300000,[] as MarketCandle[],v=>normalizeCandles(v,now()).filter(c=>c.time*1000>=now()-(range==='24h'?86400000:604800000)));},
  unavailable,
 };
}
