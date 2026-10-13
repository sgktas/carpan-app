import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import type { Database } from 'bun:sqlite';
import { explorerGet, explorerHistoryGet, explorerPublicHistoryGet, explorerResearchGet, getArcExplorerAddress,type ExplorerHistoryResult } from './arcExplorer.js';
import { ARC_USDC, decimalRaw, type WalletTransfer, type WalletFilters, type WalletOverview, type WalletHistory, type ArcTransferFeed } from '../src/arc-wallet.js';

export function initWalletTables(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS arc_wallet_labels (user_id TEXT NOT NULL, chain_id INTEGER NOT NULL,
    address TEXT NOT NULL, label TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id,chain_id,address))`);
  db.run(`CREATE TABLE IF NOT EXISTS arc_wallet_snapshots (chain_id INTEGER NOT NULL, address TEXT NOT NULL,
    bucket INTEGER NOT NULL, block INTEGER NOT NULL, timestamp TEXT NOT NULL, raw TEXT NOT NULL,
    PRIMARY KEY(chain_id,address,bucket))`);
}
export function walletLabel(db: Database, userId: string, address: string) {
  return (db.query('SELECT label FROM arc_wallet_labels WHERE user_id=? AND chain_id=5042 AND address=?')
    .get(userId,address.toLowerCase()) as {label: string} | null)?.label || '';
}
export function saveWalletLabel(db: Database, userId: string, address: string, value: unknown) {
  if (typeof value !== 'string' || value.trim().length > 60 || /[\x00-\x1f]/.test(value)) throw new Error('Etiket en fazla 60 karakter olmalı.');
  const label = value.trim(); address = address.toLowerCase();
  if (!label) db.run('DELETE FROM arc_wallet_labels WHERE user_id=? AND chain_id=5042 AND address=?',[userId,address]);
  else {
    const count = db.query('SELECT COUNT(*) AS n FROM arc_wallet_labels WHERE user_id=?').get(userId) as {n:number};
    if (count.n >= 500 && !walletLabel(db,userId,address)) throw new Error('En fazla 500 özel etiket kaydedilebilir.');
    db.run(`INSERT INTO arc_wallet_labels(user_id,chain_id,address,label,updated_at) VALUES(?,5042,?,?,?)
      ON CONFLICT(user_id,chain_id,address) DO UPDATE SET label=excluded.label,updated_at=excluded.updated_at`,
    [userId,address,label,new Date().toISOString()]);
  }
  return label;
}
const client = createPublicClient({transport:http(process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io',{timeout:10000,retryCount:1})});
const balanceAbi = [{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}]}] as const;
const overviewCache = new Map<string,{until:number,promise:Promise<WalletOverview>}>();
export function classifyWalletCode(code: unknown): Pick<WalletOverview, 'accountType' | 'delegationAddress'> {
  if (code === '0x') return { accountType: 'wallet', delegationAddress: null };
  if (typeof code !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(code)) return { accountType: null, delegationAddress: null };
  // EIP-7702 EOAs contain exactly 0xef0100 followed by the 20-byte delegate.
  if (/^0xef0100[0-9a-f]{40}$/i.test(code) && !/^0xef01000{40}$/i.test(code)) {
    return { accountType: 'delegated_wallet', delegationAddress: `0x${code.slice(8).toLowerCase()}` };
  }
  return { accountType: 'contract', delegationAddress: null };
}
export function getWalletOverview(db: Database, address: string): Promise<WalletOverview> {
  address=address.toLowerCase();
  const cache = overviewCache.get(address); if(cache && cache.until>Date.now()) return cache.promise;
  const promise = (async()=>{
    const arcNetwork = client.getChainId().then(id => { if (id !== 5042) throw new Error('Wrong network'); });
    const [identity,balance,code] = await Promise.allSettled([
      getArcExplorerAddress(address),
      (async()=>{
        await arcNetwork;
        const block = await client.getBlock();
        const raw = await client.readContract({address:ARC_USDC,abi:balanceAbi,functionName:'balanceOf',args:[address as Address],blockNumber:block.number});
        const timestamp = new Date(Number(block.timestamp)*1000).toISOString();
        db.run(`INSERT INTO arc_wallet_snapshots(chain_id,address,bucket,block,timestamp,raw) VALUES(5042,?,?,?,?,?)
          ON CONFLICT(chain_id,address,bucket) DO UPDATE SET block=excluded.block,timestamp=excluded.timestamp,raw=excluded.raw
          WHERE excluded.block>arc_wallet_snapshots.block`,[address,Math.floor(Number(block.timestamp)/3600),Number(block.number),timestamp,raw.toString()]);
        db.run('DELETE FROM arc_wallet_snapshots WHERE chain_id=5042 AND address=? AND bucket<?',[address,Math.floor(Date.now()/3600000)-24*90]);
        return {raw:raw.toString(),formatted:formatUnits(raw,6),block:Number(block.number),timestamp};
      })(),
      arcNetwork.then(() => client.getCode({address: address as Address})),
    ]);
    const classification = code.status === 'fulfilled' ? classifyWalletCode(code.value ?? '0x') : { accountType: null, delegationAddress: null };
    const isContract = classification.accountType ? classification.accountType === 'contract' : identity.status === 'fulfilled' ? identity.value.is_contract : null;
    return {address,chainId:5042,name:identity.status==='fulfilled'?identity.value.name:null,
      isContract,...classification,
      balance:balance.status==='fulfilled'?balance.value:null,
      snapshots:db.query('SELECT raw,block,timestamp FROM (SELECT raw,block,timestamp FROM arc_wallet_snapshots WHERE chain_id=5042 AND address=? ORDER BY block DESC LIMIT 120) ORDER BY block').all(address) as WalletOverview['snapshots'],
      warnings:[...(identity.status==='rejected'?['Adres kimliği Explorer’dan alınamadı.']:[]),...(balance.status==='rejected'?['USDC bakiyesi şu anda doğrulanamıyor. Yenilemeyi dene.']:[]),...(code.status==='rejected'?['Adres kodu RPC üzerinden doğrulanamadı; adres türü Explorer bilgisini kullanıyor.']:[])]};
  })();
  overviewCache.set(address,{until:Date.now()+20000,promise});
  if(overviewCache.size>200)overviewCache.delete(overviewCache.keys().next().value!);
  promise.catch(()=>overviewCache.delete(address));return promise;
}

const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{};
const addr=(v:unknown)=>{const a=typeof v==='string'?v:obj(v).hash;return typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)?a.toLowerCase():null;};
export function normalizeWalletResearch(tokens:unknown,history:unknown,counters:unknown):import('../src/arc-wallet').WalletResearch{
  const tokenPage=obj(tokens),entries=Array.isArray(tokens)?tokens:Array.isArray(tokenPage.items)?tokenPage.items:[];
  const balances=entries.flatMap(entry=>{const r=obj(entry),t=obj(r.token),address=addr(t.address_hash),decimals=Number(t.decimals);
    if(!address||address===ARC_USDC||t.type!=='ERC-20'||t.decimals==null||!Number.isInteger(decimals)||decimals<0||decimals>36||
      typeof r.value!=='string'||!/^\d+$/.test(r.value)||r.value.length>100||BigInt(r.value)===0n)return [];
    return [{address,name:String(t.name||'İsimsiz token').slice(0,100),symbol:String(t.symbol||'ERC-20').slice(0,24),raw:r.value,decimals}];});
  const h=obj(history),samples=Array.isArray(h.items)?h.items:[];
  const balanceHistory=samples.flatMap(entry=>{const r=obj(entry),block=Number(r.block_number);
    if(typeof r.value!=='string'||!/^\d+$/.test(r.value)||r.value.length>100||r.block_number==null||!Number.isSafeInteger(block)||block<0||
      typeof r.block_timestamp!=='string'||!Number.isFinite(Date.parse(r.block_timestamp)))return [];
    // Arc native balance is the same USDC pool at 18 decimals; display its 6-decimal view once.
    return [{raw:(BigInt(r.value)/1000000000000n).toString(),block,timestamp:new Date(r.block_timestamp).toISOString()}];}).sort((a,b)=>a.block-b.block);
  const count=(v:unknown)=>{const n=Number(v);return v!=null&&v!==''&&Number.isSafeInteger(n)&&n>=0?n:null;};
  return {tokens:balances,balanceHistory,tokensHasMore:!!tokenPage.next_page_params,historyHasMore:!!h.next_page_params,transactions:count(obj(counters).transactions_count),
    tokenTransfers:count(obj(counters).token_transfers_count),warnings:[],fetchedAt:new Date().toISOString()};
}
type WalletResearchResult=import('../src/arc-wallet').WalletResearch&{sources:string[];cached:boolean;stale:boolean;cacheWindowMs:number};
const researchCache=new Map<string,{until:number;promise:Promise<WalletResearchResult>}>();
export function getWalletResearch(address:string,load:typeof explorerResearchGet=explorerResearchGet){
  address=address.toLowerCase();
  const cached=researchCache.get(address);if(cached&&cached.until>Date.now())return cached.promise.then(result=>({...result,cached:true,stale:result.stale||Date.now()-Date.parse(result.fetchedAt)>60000}));
  const promise=(async()=>{
    const results=await Promise.allSettled(['tokens?type=ERC-20','coin-balance-history','counters'].map(path=>load(`/addresses/${address}/${path}`)));
    const data=normalizeWalletResearch(...results.map(r=>r.status==='fulfilled'?r.value.payload:null) as [unknown,unknown,unknown]);
    const successful=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
    if(successful.length)data.fetchedAt=new Date(Math.min(...successful.map(result=>Date.parse(result.fetchedAt)))).toISOString();
    const warnings=['Token bakiyeleri şu anda alınamadı.','Explorer bakiye geçmişi şu anda alınamadı.','Adres işlem sayaçları şu anda alınamadı.'];
    data.warnings=results.flatMap((r,i)=>r.status==='rejected'?[warnings[i]]:[]);
    return {...data,sources:[...new Set(successful.map(result=>result.source))],cached:successful.some(result=>result.cached),stale:successful.some(result=>result.stale),cacheWindowMs:300000};
  })();
  researchCache.set(address,{until:Date.now()+300000,promise});if(researchCache.size>200)researchCache.delete(researchCache.keys().next().value!);
  void promise.then(result=>{const entry=researchCache.get(address);if(entry?.promise===promise)entry.until=Math.min(entry.until,result.sources.length?Date.parse(result.fetchedAt)+300000:Date.now()+60000);}).catch(()=>{});
  promise.catch(()=>researchCache.delete(address));return promise;
}
export function normalizeWalletTransfer(value: unknown, subject: string): WalletTransfer | null {
  const v=obj(value), token=obj(v.token), total=obj(v.total);
  const hash=v.transaction_hash, from=addr(v.from), to=addr(v.to), tokenAddress=addr(token.address_hash);
  const log=Number(v.log_index), block=Number(v.block_number), decimals=Number(total.decimals??token.decimals);
  if(typeof hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(hash)||!from||!to||!tokenAddress||
    v.log_index==null||v.block_number==null||!Number.isSafeInteger(log)||log<0||!Number.isSafeInteger(block)||block<0||
    (total.decimals==null&&token.decimals==null)||!Number.isInteger(decimals)||decimals<0||decimals>36||
    typeof total.value!=='string'||!/^\d+$/.test(total.value)||total.value.length>100||
    (from!==subject&&to!==subject))return null;
  // Do not accept a lookalike symbol as native USDC, or incompatible precision.
  if(tokenAddress===ARC_USDC&&decimals!==6)return null;
  return {id:`${hash.toLowerCase()}:${log}:${tokenAddress}`,hash:hash.toLowerCase(),logIndex:log,block,
    timestamp:typeof v.timestamp==='string'&&Number.isFinite(Date.parse(v.timestamp))?new Date(v.timestamp).toISOString():null,
    from,to,token:tokenAddress,symbol:tokenAddress===ARC_USDC?'USDC':String(token.symbol||'ERC-20').slice(0,24),
    decimals,raw:total.value,direction:from===subject&&to===subject?'self':to===subject?'in':'out'};
}
export function parseWalletFilters(query: Record<string,unknown>): WalletFilters {
  const string=(key:string)=>typeof query[key]==='string'?String(query[key]).trim():'';
  const direction=string('direction')||'all', token=string('token').toLowerCase()||ARC_USDC, peer=string('peer').toLowerCase();
  const minimum=string('minimum'),from=string('from'),to=string('to');
  if(!['all','in','out','self'].includes(direction)|| (token!=='all'&&!addr(token))||(peer&&!addr(peer)))throw new Error('Geçerli bir adres veya filtre seç.');
  if(minimum){decimalRaw(minimum,6);if(token!==ARC_USDC)throw new Error('Tutar filtresi için USDC seç.');}
  for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new Error('Geçerli bir tarih seç.');
  if(from&&to&&from>to)throw new Error('Başlangıç tarihi bitişten sonra olamaz.');
  return {direction:direction as WalletFilters['direction'],token,minimum,peer,from,to};
}
export function matchesWalletTransfer(t:WalletTransfer,f:WalletFilters){
  return (f.direction==='all'||t.direction===f.direction)&&(f.token==='all'||t.token===f.token)&&
    (!f.minimum||BigInt(t.raw)>=decimalRaw(f.minimum,t.decimals))&&(!f.peer||t.from===f.peer||t.to===f.peer)&&
    (!f.from||!!t.timestamp&&t.timestamp.slice(0,10)>=f.from)&&(!f.to||!!t.timestamp&&t.timestamp.slice(0,10)<=f.to);
}
// Signed cursors bind provider pagination to the address and filters. No arbitrary URLs/keys.
const cursorKey=randomBytes(32);
function sign(data:string){return createHmac('sha256',cursorKey).update(data).digest('base64url');}
export function encodeWalletCursor(address:string,filters:WalletFilters,next:Record<string,unknown>){
  const data=Buffer.from(JSON.stringify({address,filters,next,expires:Date.now()+3600000})).toString('base64url');return data+'.'+sign(data);
}
export function decodeWalletCursor(cursor:string,address:string,filters:WalletFilters):Record<string,unknown>{
  try{if(cursor.length>6000||cursor.split('.').length!==2)throw new Error();const [data,mac]=cursor.split('.');const expected=Buffer.from(sign(data)),given=Buffer.from(mac||'');
    if(expected.length!==given.length||!timingSafeEqual(expected,given))throw new Error();const p=JSON.parse(Buffer.from(data,'base64url').toString());
    if(p.address!==address||JSON.stringify(p.filters)!==JSON.stringify(filters)||p.expires<Date.now())throw new Error();return p.next;
  }catch{throw new Error('Geçmiş sayfasının süresi doldu. Filtreleri yeniden uygula.');}
}
const cursorFields=new Set(['block_number','index','items_count','batch_block_hash','batch_transaction_hash','batch_log_index','index_in_batch']);
type ExplorerTransferPage = {items:unknown[];next_page_params:Record<string,unknown>|null};
export async function scanWalletHistory(address:string,filters:WalletFilters,next:Record<string,unknown>|null,
  loadPage:(path:string)=>Promise<ExplorerTransferPage|ExplorerHistoryResult<ExplorerTransferPage>> = explorerHistoryGet):Promise<WalletHistory> {
    const items:WalletTransfer[]=[];const ids=new Set<string>();let scannedPages=0,skipped=0;
    const sources=new Set<string>();let fetchedAt=Infinity,stale=false,hasProvenance=false;
    // Keep every matching row from each provider page; never discard a tail at a UI limit.
    do{
      const params=new URLSearchParams({type:'ERC-20'});
      // Arc Explorer rejects token-filtered address queries on some active contracts.
      // Fetch ERC-20 pages and apply the signed token filter locally instead.
      if(filters.direction==='in')params.set('filter','to');if(filters.direction==='out')params.set('filter','from');
      for(const [k,v] of Object.entries(next||{})){
        // Blockscout repeats the selected token/type/direction in its continuation.
        // Accept an exact repeat, never let pagination change the research filters.
        if(k==='token'&&filters.token!=='all'&&v===filters.token)continue;
        if(['type','filter'].includes(k)&&params.get(k)===String(v))continue;
        if(v===null&&cursorFields.has(k))continue;
        if(!cursorFields.has(k)|| !['string','number'].includes(typeof v)||String(v).length>100)throw new Error('Explorer sayfalama biçimi desteklenmiyor.');params.set(k,String(v));
      }
      const loaded=await loadPage(`/addresses/${address}/token-transfers?${params}`);
      const enriched='payload' in loaded;
      const page=enriched?loaded.payload:loaded;
      if(enriched){
        const recorded=Date.parse(loaded.fetchedAt);
        if(!Number.isFinite(recorded)||recorded>Date.now()||typeof loaded.stale!=='boolean'||typeof loaded.source!=='string'||!loaded.source)throw new Error('Explorer geçmişinin kaynak bilgisi geçersiz.');
        fetchedAt=Math.min(fetchedAt,recorded);stale ||= loaded.stale;sources.add(loaded.source);hasProvenance=true;
      }else fetchedAt=Math.min(fetchedAt,Date.now());
      if(!Array.isArray(page.items)||!('next_page_params' in page))throw new Error('Explorer geçerli geçmiş verisi döndürmedi.');
      scannedPages++;
      for(const row of page.items){const t=normalizeWalletTransfer(row,address);if(!t){skipped++;continue;}if(!ids.has(t.id)&&matchesWalletTransfer(t,filters)){ids.add(t.id);items.push(t);}}
      const previous=JSON.stringify(next);next=page.next_page_params;
      if(next&&JSON.stringify(next)===previous)throw new Error('Explorer sayfalama ilerlemiyor.');
      // Sparse filters continue server-side, and return continuation even for empty results.
    }while(next&&scannedPages<3&&items.length<25);
    return {items,nextCursor:next?encodeWalletCursor(address,filters,next):null,scannedPages,skipped,fetchedAt:new Date(fetchedAt).toISOString(),...(hasProvenance?{source:[...sources].join(' / '),sources:[...sources],stale}:{})};
}
const historyCache=new Map<string,{until:number,promise:Promise<WalletHistory>}>();
export async function getWalletHistory(address:string,filters:WalletFilters,cursor=''):Promise<WalletHistory> {
  address=address.toLowerCase();
  const next=cursor?decodeWalletCursor(cursor,address,filters):{};
  const key=JSON.stringify([address,filters,cursor]);const cached=historyCache.get(key);
  if(cached&&cached.until>Date.now())return cached.promise.then(result=>({...result,...typeof result.stale==='boolean'?{stale:result.stale||Date.now()-Date.parse(result.fetchedAt)>60000}:{}}));
  const promise=scanWalletHistory(address,filters,next,explorerPublicHistoryGet);
  historyCache.set(key,{until:Date.now()+15000,promise});if(historyCache.size>200)historyCache.delete(historyCache.keys().next().value!);
  try{return await promise;}catch(e){historyCache.delete(key);throw e;}
}

// Public token-wide feed; labels are Explorer contract names, never private user tags.
export async function scanArcTransferFeed(minimum:string, next:Record<string,unknown>|null,
  loadPage:(path:string)=>Promise<ExplorerTransferPage> = explorerGet):Promise<ArcTransferFeed> {
  const filters=parseWalletFilters({minimum}),threshold=decimalRaw(minimum||'0',6);
  const items:ArcTransferFeed['items']=[],ids=new Set<string>();let skipped=0,scannedPages=0;
  do {
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(next||{})) {
      if(value===null&&cursorFields.has(key))continue;
      if(!cursorFields.has(key)||!['string','number'].includes(typeof value)||String(value).length>100)
        throw new Error('Explorer sayfalama biçimi desteklenmiyor.');
      params.set(key,String(value));
    }
    const page=await loadPage(`/tokens/${ARC_USDC}/transfers${params.size?'?'+params:''}`);
    if(!Array.isArray(page.items)||!('next_page_params' in page))throw new Error('Geçerli transfer verisi alınamadı.');
    scannedPages++;
    for(const value of page.items) {
      const v=obj(value),subject=addr(v.from);
      const transfer=subject?normalizeWalletTransfer(value,subject):null;
      if(!transfer||transfer.token!==ARC_USDC){skipped++;continue;}
      if(ids.has(transfer.id)||BigInt(transfer.raw)<threshold)continue;
      ids.add(transfer.id);
      const publicName=(side:unknown)=>typeof obj(side).name==='string'?String(obj(side).name).slice(0,80):null;
      const {direction:_,...record}=transfer;
      items.push({...record,fromName:publicName(v.from),toName:publicName(v.to)});
    }
    const previous=JSON.stringify(next);next=page.next_page_params;
    if(next&&JSON.stringify(next)===previous)throw new Error('Explorer sayfalama ilerlemiyor.');
  }while(next&&scannedPages<3&&items.length<25);
  return {items,nextCursor:next?encodeWalletCursor('arc-usdc-feed',filters,next):null,
    fetchedAt:new Date().toISOString(),skipped,scannedPages};
}
const feedCache=new Map<string,{until:number,promise:Promise<ArcTransferFeed>}>();
export function getArcTransferFeed(minimum='1',cursor=''):Promise<ArcTransferFeed> {
  const filters=parseWalletFilters({minimum}),next=cursor?decodeWalletCursor(cursor,'arc-usdc-feed',filters):{};
  const key=JSON.stringify([minimum,cursor]),cached=feedCache.get(key);
  if(cached&&cached.until>Date.now())return cached.promise;
  const promise=scanArcTransferFeed(minimum,next);
  feedCache.set(key,{until:Date.now()+15000,promise});
  if(feedCache.size>100)feedCache.delete(feedCache.keys().next().value!);
  promise.catch(()=>feedCache.delete(key));return promise;
}
