import {explorerRequest,discoveryPolicy,cacheHit} from './explorerBudget';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import snapshot from './blockscout-networks.json';
import type {Database} from 'bun:sqlite';
import type {ExplorerNetwork,NetworkDirectory,ExplorerKind,ExplorerQuery,ExplorerRow,ExplorerResult,NetworkWatch} from '../src/chain-explorer';
import type {DiscoveryFeed,DiscoveryTransfer} from '../src/discovery-transfers';
import {explorerKinds} from '../src/chain-explorer';
import {TREASURY_CHAINS} from '../src/treasury-review';

const CONFIG='https://raw.githubusercontent.com/blockscout/backend-configs/main/pro-api/prod/chains-config.json';
const META='https://chains.blockscout.com/api/chains';
const key=process.env.BLOCKSCOUT_PRO_API_KEY?.trim();
const secret=randomBytes(32);
export const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const string=(v:unknown):string|null=>typeof v==='string'?v:null;
const address=(v:unknown)=>{const s=string(v)||string(object(v).hash)||string(object(v).address_hash);return s&&/^0x[0-9a-f]{40}$/i.test(s)?s.toLowerCase():null;};
const hash=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v)?v.toLowerCase():null;
const integer=(v:unknown)=>v!=null&&v!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
let directory:NetworkDirectory={...snapshot,stale:true,proConfigured:!!key};
let directoryUntil=0,directoryPromise:Promise<NetworkDirectory>|null=null;
export function normalizeDirectory(config:unknown,metadata:unknown):ExplorerNetwork[]{
 return Object.entries(object(config)).flatMap(([id,base])=>{
  if(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||typeof base!=='string')return [];
  let url:URL;try{url=new URL(base);}catch{return [];}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^\d+(\.\d+){3}$/.test(url.hostname)||url.hostname.includes(':')||/\.(local|internal|localhost)$/.test(url.hostname))return [];
  const m=object(object(metadata)[id]);
  return [{id,name:String(m.name||`Chain ${id}`).slice(0,100),explorer:url.origin+url.pathname.replace(/\/$/,''),isTestnet:typeof m.isTestnet==='boolean'?m.isTestnet:null,nativeSymbol:String(m.native_currency||'').slice(0,24),nativeDecimals:18}];
 }).sort((a,b)=>a.id==='5042'?-1:b.id==='5042'?1:a.name.localeCompare(b.name));
}
export async function networkDirectory():Promise<NetworkDirectory>{
 if(Date.now()<directoryUntil)return directory;
 if(directoryPromise)return directoryPromise;
 directoryPromise=(async()=>{try{
   const [a,b]=await Promise.all([CONFIG,META].map(url=>fetch(url,{signal:AbortSignal.timeout(8000)}).then(r=>{if(!r.ok)throw new Error();return r.json();})));
   const networks=normalizeDirectory(a,b);if(!networks.length)throw new Error();
   directory={networks,asOf:new Date().toISOString(),stale:false,proConfigured:!!key};directoryUntil=Date.now()+3600000;
  }catch{directory={...directory,stale:true};directoryUntil=Date.now()+60000;}
  return directory;
 })().finally(()=>{directoryPromise=null;});return directoryPromise;
}
export class ExplorerError extends Error{constructor(message:string,public status=503){super(message);}}
const kinds=new Set<string>(explorerKinds);
export function parseExplorerQuery(value:Record<string,unknown>):ExplorerQuery{
 const q:ExplorerQuery={kind:String(value.kind||'transfers') as ExplorerKind};
 if(!kinds.has(q.kind))throw new ExplorerError('Desteklenmeyen veri bölümü.',400);
 for(const k of ['address','token'] as const){if(value[k]){const a=address(value[k]);if(!a)throw new ExplorerError('Geçerli bir adres gir.',400);q[k]=a;}}
 if(value.hash){const h=hash(value.hash);if(!h)throw new ExplorerError('Geçerli bir işlem hash’i gir.',400);q.hash=h;}
 if(value.block!==undefined&&value.block!==''){
  const block=typeof value.block==='string'?value.block:typeof value.block==='number'&&Number.isSafeInteger(value.block)?String(value.block):'';
  if(hash(block))q.block=block.toLowerCase();
  else if(/^(0|[1-9]\d{0,15})$/.test(block)&&Number.isSafeInteger(Number(block)))q.block=block;
  else throw new ExplorerError('Geçerli bir blok numarası veya hash’i gir.',400);
 }
 if(value.tokenId!==undefined&&value.tokenId!==''){
  const id=typeof value.tokenId==='string'?value.tokenId:typeof value.tokenId==='number'&&Number.isSafeInteger(value.tokenId)?String(value.tokenId):'';
  if(!/^(0|[1-9]\d{0,77})$/.test(id)||BigInt(id)>2n**256n-1n)throw new ExplorerError('NFT kimliği 0 ile uint256 sınırı arasında olmalı.',400);
  q.tokenId=id;
 }
 if(value.type){if(!['ERC-20','ERC-721','ERC-1155'].includes(String(value.type)))throw new ExplorerError('Geçersiz token türü.',400);q.type=String(value.type);}
 if(value.q){if(typeof value.q!=='string'||value.q.length>100)throw new ExplorerError('Arama çok uzun.',400);q.q=value.q.trim();}
 if(value.cursor){if(typeof value.cursor!=='string'||value.cursor.length>12000)throw new ExplorerError('Geçersiz sayfa.',400);q.cursor=value.cursor;}
 const addressKinds=['address','counters','balances','internals','nfts','logs','balanceHistory','balanceByDay','nftCollections','contract','audits'];
 if(addressKinds.includes(q.kind)&&!q.address)throw new ExplorerError('Bu bölüm için adres gerekli.',400);
 if(['tx','txLogs','txState','txInternals','txTransfers','txTrace'].includes(q.kind)&&!q.hash)throw new ExplorerError('İşlem hash’i gerekli.',400);
 if(['token','holders','tokenCounters','tokenInstances','nft','nftHolders','nftTransfers','nftCounters'].includes(q.kind)&&!q.token)throw new ExplorerError('Token adresi gerekli.',400);
 if(['nft','nftHolders','nftTransfers','nftCounters'].includes(q.kind)&&q.tokenId===undefined)throw new ExplorerError('NFT kimliği gerekli.',400);
 if(['block','blockTransactions','blockInternals'].includes(q.kind)&&q.block===undefined)throw new ExplorerError('Blok numarası veya hash’i gerekli.',400);
 if(q.kind==='search'&&!q.q)throw new ExplorerError('Arama ifadesi gerekli.',400);
 return q;
}
function binding(chain:string,q:ExplorerQuery){const {cursor:_,...rest}=q;return JSON.stringify([chain,rest]);}
const mac=(s:string)=>createHmac('sha256',secret).update(s).digest('base64url');
export function encodeExplorerCursor(chain:string,q:ExplorerQuery,next:unknown){
 const payload=Buffer.from(JSON.stringify({binding:binding(chain,q),next,expires:Date.now()+3600000})).toString('base64url');return payload+'.'+mac(payload);
}
export function decodeExplorerCursor(chain:string,q:ExplorerQuery){
 try{const [payload,sig,...rest]=(q.cursor||'').split('.');if(rest.length)throw new Error();const a=Buffer.from(sig||''),b=Buffer.from(mac(payload));if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error();
 const value=JSON.parse(Buffer.from(payload,'base64url').toString());if(value.binding!==binding(chain,q)||value.expires<Date.now())throw new Error();return object(value.next);
 }catch{throw new ExplorerError('Sayfa bu ağa veya filtreye ait değil; akışı yenile.',400);}
}
export function explorerPath(q:ExplorerQuery,next:Record<string,unknown>={}):string{
 const a=q.address, h=q.hash,t=q.token,b=q.block,n=q.tokenId;
 const paths:Record<ExplorerKind,string>={transfers:a?`/addresses/${a}/token-transfers`:t?`/tokens/${t}/transfers`:'/token-transfers',transactions:a?`/addresses/${a}/transactions`:'/transactions',tokens:'/tokens',blocks:'/blocks',verified:'/smart-contracts',address:`/addresses/${a}`,counters:`/addresses/${a}/counters`,balances:`/addresses/${a}/tokens`,internals:`/addresses/${a}/internal-transactions`,nfts:`/addresses/${a}/nft`,logs:`/addresses/${a}/logs`,balanceHistory:`/addresses/${a}/coin-balance-history`,contract:`/smart-contracts/${a}`,tx:`/transactions/${h}`,txLogs:`/transactions/${h}/logs`,txState:`/transactions/${h}/state-changes`,token:`/tokens/${t}`,holders:`/tokens/${t}/holders`,stats:'/stats',search:'/search',
 block:`/blocks/${b}`,blockTransactions:`/blocks/${b}/transactions`,blockInternals:`/blocks/${b}/internal-transactions`,txInternals:`/transactions/${h}/internal-transactions`,txTransfers:`/transactions/${h}/token-transfers`,txTrace:`/transactions/${h}/raw-trace`,tokenCounters:`/tokens/${t}/counters`,tokenInstances:`/tokens/${t}/instances`,nft:`/tokens/${t}/instances/${n}`,nftHolders:`/tokens/${t}/instances/${n}/holders`,nftTransfers:`/tokens/${t}/instances/${n}/transfers`,nftCounters:`/tokens/${t}/instances/${n}/transfers-count`,nftCollections:`/addresses/${a}/nft/collections`,balanceByDay:`/addresses/${a}/coin-balance-history-by-day`,txStats:'/transactions/stats',globalInternals:'/internal-transactions',txChart:'/stats/charts/transactions',hotContracts:'/stats/hot-smart-contracts',contractCounters:'/smart-contracts/counters',audits:`/smart-contracts/${a}/audit-reports`,indexing:'/main-page/indexing-status'};
 const params=new URLSearchParams();if(q.type&&['transfers','tokens','balances','nfts'].includes(q.kind))params.set('type',q.type);if(q.kind==='transactions'&&!a)params.set('filter','validated');if(q.kind==='search')params.set('q',q.q!);
 // Continuations originate from the provider and are bound to this exact resource.
 for(const [k,v] of Object.entries(next)){if(q.kind==='txTrace'){if(k!=='trace_offset'||integer(v)===null||Number(v)>5000||Number(v)%100!==0)throw new ExplorerError('Geçersiz iz sayfası.',400);continue;}
  if(!/^[a-z_]+$/.test(k)||['apikey','authorization','chain_id','url'].includes(k)||k.length>60)throw new ExplorerError('Kaynak sayfalaması desteklenmiyor.');if(v==null)continue;
  if(!['number','string','boolean'].includes(typeof v)||String(v).length>300)throw new ExplorerError('Kaynak sayfalaması desteklenmiyor.');
  if(params.has(k)&&params.get(k)!==String(v))throw new ExplorerError('Kaynak filtreyi değiştirdi.');params.set(k,String(v));}
 return paths[q.kind]+(params.size?'?'+params:'');
}
async function upstream(network:ExplorerNetwork,path:string,ttl:number,background:boolean){
 const publicUrl=`${network.explorer}/api/v2${path}`;
 try{return await explorerRequest(key?`https://api.blockscout.com/${network.id}/api/v2${path}`:publicUrl,publicUrl,key,ttl,background);}catch(e){throw new ExplorerError(e instanceof Error?e.message:'Veri kaynagi alinamadi.');}
}
export function normalizeExplorerRow(value:unknown,chain:string,kind:ExplorerKind,index:number):ExplorerRow{
 const v=object(value),token=object(v.token),total=object(v.total),action=object(v.action),metadata=object(v.metadata),a=address(v.address)||address(v.address_hash)||address(v.hash);
 const tx=kind==='blocks'?null:hash(v.transaction_hash)||hash(v.hash)||hash(v.tx_hash);const d=integer(total.decimals??token.decimals??v.decimals);const decimals=d!==null&&d<=36?d:null;
 const raw=string(total.value??v.value??action.value);const name=string(v.name)||string(metadata.name)||string(token.name)||string(object(v.address).name);
 const nftId=total.token_id!=null?String(total.token_id):v.token_id!=null?String(v.token_id):['tokenInstances','nfts','nft'].includes(kind)&&v.id!=null?String(v.id):null;
 return {id:`${chain}:${kind}:${tx||a||v.height||index}:${v.log_index??v.index??index}:${nftId||''}`,title:name||string(v.method)||string(v.type)||a||tx||`Blok ${v.height??v.block_number??index}`,address:a,from:address(v.from)||address(v.address)||address(v.owner)||address(action.from),to:address(v.to)||address(action.to),hash:tx||hash(v.transactionHash),token:address(token.address_hash)||address(token.address)|| (['tokens','tokenInstances'].includes(kind)?a:null),symbol:String(token.symbol||v.symbol||''),raw:raw&&/^\d+$/.test(raw)&&raw.length<=100?raw:null,decimals,nftId,block:integer(v.block_number??v.height),timestamp:string(v.timestamp??v.block_timestamp??v.verified_at??v.date),status:string(v.status)||string(v.error),data:v};
}
/** One provider page at a time; raw traces have signed local pages instead of unbounded DOM rows. */
export function normalizeExplorerPayload(result:unknown,chain:string,q:ExplorerQuery,next:Record<string,unknown>={}){
 const v=object(result),chart=['balanceByDay','txChart'].includes(q.kind)&&Array.isArray(v.chart_data)?v.chart_data:null;
 const list=Array.isArray(v.items)?v.items:Array.isArray(result)?result:chart;
 if(JSON.stringify(result).length>2000000)throw new ExplorerError('Kaynak yanıtı güvenli görüntüleme sınırını aştı.');
 if(q.kind==='txTrace'){
  const traces=list||flattenCallTrace(v,q.hash);
  if(!traces)throw new ExplorerError('Kaynak yürütme izi biçimi desteklenmiyor.');
  if(traces.length>5000)throw new ExplorerError('Yürütme izi 5000 çağrı sınırını aştı. Explorer kanıtını aç.');
  const offset=integer(next.trace_offset)||0;if(offset>traces.length&&offset!==0)throw new ExplorerError('İz sayfası artık geçerli değil; yeniden yükle.',400);
  return {items:traces.slice(offset,offset+100).map((row,i)=>normalizeExplorerRow(row,chain,q.kind,offset+i)),detail:null,
   next:offset+100<traces.length?{trace_offset:offset+100}:null,page:{offset,total:traces.length,limit:100}};
 }
 if(list&&list.length>500)throw new ExplorerError('Kaynak sayfası beklenen boyutu aştı.');
 const rows=list?list.map((row,i)=>normalizeExplorerRow(row,chain,q.kind,i)):[];
 return {items:rows,detail:list?null:v,next:v.next_page_params||null};
}
/** Arc returns a Geth callTracer tree; other instances return flat Parity traces. */
export function flattenCallTrace(value:Record<string,unknown>,transactionHash?:string):Record<string,unknown>[]|null{
 if(typeof value.type!=='string'||!address(value.from))return null;
 const traces:Record<string,unknown>[]=[],stack=[{node:value,path:[] as number[]}];
 while(stack.length){const {node,path}=stack.pop()!;
  if(path.length>50||traces.length>=5000)throw new ExplorerError('Yürütme izi görüntüleme sınırını aştı. Explorer kanıtını aç.');
  traces.push({type:String(node.type).toLowerCase(),traceAddress:path,transactionHash,
   action:{from:node.from,to:node.to,gas:node.gas,input:node.input,value:node.value,callType:node.type},
   result:{gasUsed:node.gasUsed,output:node.output},...(node.error?{error:node.error}:{})});
  const calls=Array.isArray(node.calls)?node.calls:[];
  for(let i=calls.length-1;i>=0;i--)stack.push({node:object(calls[i]),path:[...path,i]});
 }
 return traces;
}
const cache=new Map<string,{until:number;value:Promise<ExplorerResult>}>();
const blockReferences=new Map<string,{until:number;value:Promise<string>}>();
export function arcBlockHash(value:unknown,expected:string):string{
 const result=object(object(value).result),reference=hash(result.hash);
 if(!reference||typeof result.number!=='string'||!/^0x[0-9a-f]+$/i.test(result.number)||BigInt(result.number)!==BigInt(expected))throw new ExplorerError('Arc RPC bu blok için doğrulanabilir hash döndürmedi.');
 return reference;
}
async function resolveBlockReference(block:string):Promise<string>{
 if(hash(block))return block;
 const cached=blockReferences.get(block);if(cached&&cached.until>Date.now())return cached.value;
 // Arc PRO currently resolves some block resources reliably by hash rather than height.
 // A single read-only Arc RPC lookup supplies that hash; no extra chain is queried.
 const value=(async()=>{try{const response=await fetch(process.env.ARC_MAINNET_RPC_URL||'https://rpc.mainnet.arc.io',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_getBlockByNumber',params:['0x'+BigInt(block).toString(16),false]}),signal:AbortSignal.timeout(8000),redirect:'error'});if(!response.ok)throw new Error();return arcBlockHash(await response.json(),block);}catch{throw new ExplorerError('Blok numarası Arc RPC üzerinden çözülemedi; blok hash’i ile araştırabilirsin.');}})();
 blockReferences.set(block,{until:Date.now()+60000,value});if(blockReferences.size>200)blockReferences.delete(blockReferences.keys().next().value!);value.catch(()=>blockReferences.delete(block));return value;
}
export function arcResearchQuery(chain:string,q:ExplorerQuery):ExplorerQuery{
 if(!TREASURY_CHAINS.some(network=>network.id===chain))throw new ExplorerError('Unsupported research network. Choose Arc, Base, Arbitrum or Ethereum Mainnet.',400);
 return q;
}
export async function explorerData(chain:string,q:ExplorerQuery,background=false):Promise<ExplorerResult>{
 q=arcResearchQuery(chain,q);
 const network=(await networkDirectory()).networks.find(n=>n.id===chain);if(!network)throw new ExplorerError('Bu ağ güncel PRO destek listesinde yok.',400);
 const next=q.cursor?decodeExplorerCursor(chain,q):{};const id=JSON.stringify([chain,q]);const old=cache.get(id);if(old&&old.until>Date.now()){cacheHit();return old.value;}
 const policy=discoveryPolicy(),ttl=background?(chain==='5042'?policy.arcMs:policy.otherMs):60000;
 const value=(async()=>{const block=chain==='5042'&&['block','blockTransactions','blockInternals'].includes(q.kind)&&q.block?await resolveBlockReference(q.block):null,path=explorerPath(block?{...q,block}:q,next);
  const {payload:result,source,fetchedAt,cached}=await upstream(network,path,ttl,background),normalized=normalizeExplorerPayload(result,chain,q,next);
  return {network,kind:q.kind,items:normalized.items,detail:normalized.detail,...('page' in normalized?{page:normalized.page}:{}),nextCursor:normalized.next?encodeExplorerCursor(chain,q,normalized.next):null,fetchedAt:new Date(fetchedAt).toISOString(),cached,policy:discoveryPolicy(),source:`${source} · ${network.name}`};})();
 cache.set(id,{until:Date.now()+60000,value});if(cache.size>300)cache.delete(cache.keys().next().value!);value.catch(()=>cache.delete(id));return value;
}
// Legacy discovery requests are also restricted to Arc Mainnet; no multichain sweep.
export async function discoveryFeed(_includeTestnets=false,_type='',_scope=''):Promise<DiscoveryFeed>{
 const page=await explorerData('5042',{kind:'transfers',...(_type?{type:_type}:{})},true);
 return {items:page.items.map(r=>({...r,network:page.network,source:page.source,fetchedAt:page.fetchedAt})),fetchedAt:page.fetchedAt,totalNetworks:1,loadedNetworks:1,attemptedNetworks:1,failedNetworks:[],nextCursor:page.nextCursor,source:page.source,cycleComplete:true,policy:discoveryPolicy(),scope:'arc'};
}
export function initNetworkWatch(db:Database){db.exec(`CREATE TABLE IF NOT EXISTS onchain_watchlist(user_id TEXT NOT NULL,chain_id TEXT NOT NULL,address TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(user_id,chain_id,address));`);}
export function networkWatchlist(db:Database,user:string):NetworkWatch[]{return db.query('SELECT chain_id AS chainId,address,label,created_at AS createdAt FROM onchain_watchlist WHERE user_id=? ORDER BY created_at DESC').all(user) as NetworkWatch[];}
export async function saveNetworkWatch(db:Database,user:string,chain:string,value:unknown,remove=false,loadDirectory=networkDirectory){
 const v=object(value),a=address(v.address);if(!a)throw new ExplorerError('Geçerli adres gerekli.',400);if(!(await loadDirectory()).networks.some(n=>n.id===chain))throw new ExplorerError('Desteklenmeyen ağ.',400);
 if(remove)db.query('DELETE FROM onchain_watchlist WHERE user_id=? AND chain_id=? AND address=?').run(user,chain,a);
 else{const label=String(v.label||'').trim();if(label.length>60)throw new ExplorerError('Etiket en fazla 60 karakter olabilir.',400);const rows=networkWatchlist(db,user);if(rows.length>=100&&!rows.some(r=>r.chainId===chain&&r.address===a))throw new ExplorerError('En fazla 100 ağ/adres kaydedebilirsin.',400);
  db.query('INSERT INTO onchain_watchlist(user_id,chain_id,address,label,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,chain_id,address) DO UPDATE SET label=excluded.label').run(user,chain,a,label,new Date().toISOString());}
 return networkWatchlist(db,user);
}
