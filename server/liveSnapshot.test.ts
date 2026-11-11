import {test,expect} from 'bun:test';
import {liveSnapshot,ExplorerError} from './chainExplorer';
import {requestIntervalMs,liveIntervalMs,discoveryPolicy} from './explorerBudget';
import type {ExplorerResult,ExplorerQuery} from '../src/chain-explorer';

const network={id:'5042',name:'Arc Mainnet',explorer:'https://explorer.arc.io',isTestnet:false,nativeSymbol:'USDC',nativeDecimals:18};
const row=(id:string,block:number)=>({id,title:id,address:null,from:null,to:null,hash:null,token:null,symbol:'',raw:null,decimals:null,nftId:null,block,timestamp:null,status:null,data:{}});
function result(kind:ExplorerQuery['kind'],fetchedAt:string,items=[row(`${kind}-1`,10)],detail:Record<string,unknown>|null=null):ExplorerResult{
 return {network,kind,items,detail,nextCursor:null,fetchedAt,source:'Blockscout PRO · Arc Mainnet'};
}

test('request pacing defaults to the free-tier gap and never exceeds the Pro rate limit',()=>{
 expect(requestIntervalMs(undefined)).toBe(400);
 expect(requestIntervalMs('50')).toBe(50);
 expect(requestIntervalMs('1')).toBe(34);
 expect(requestIntervalMs('abc')).toBe(400);
});

test('live freshness is clamped so one snapshot serves every viewer',()=>{
 expect(liveIntervalMs(undefined)).toBe(5000);
 expect(liveIntervalMs('500')).toBe(2000);
 expect(liveIntervalMs('900000')).toBe(60000);
 expect(discoveryPolicy().liveMs).toBeGreaterThanOrEqual(2000);
});

test('live snapshot requests blocks, transactions and stats with the live TTL and reports the oldest data time',async()=>{
 const calls:{kind:string;background:boolean;ttl?:number}[]=[];
 const snapshot=await liveSnapshot('5042',async(_chain,q,background=false,ttl)=>{
  calls.push({kind:q.kind,background,ttl});
  if(q.kind==='stats')return result('stats','2026-11-11T10:00:01Z',[],{transactions_today:'42'});
  return result(q.kind,q.kind==='blocks'?'2026-11-11T10:00:00Z':'2026-11-11T10:00:02Z');
 });
 expect(calls.map(c=>c.kind).sort()).toEqual(['blocks','stats','transactions']);
 expect(calls.every(c=>c.background===false&&c.ttl===snapshot.liveMs)).toBe(true);
 expect(snapshot.blocks).toHaveLength(1);expect(snapshot.transactions).toHaveLength(1);
 expect(snapshot.stats).toEqual({transactions_today:'42'});
 expect(snapshot.fetchedAt).toBe('2026-11-11T10:00:00.000Z');
 expect(snapshot.failed).toEqual([]);
});

test('one failed section is reported without discarding the others',async()=>{
 const snapshot=await liveSnapshot('5042',async(_chain,q)=>{
  if(q.kind==='stats')throw new ExplorerError('Veri kaynağı şu anda yanıt vermiyor (HTTP 503).');
  return result(q.kind,'2026-11-11T10:00:00Z');
 });
 expect(snapshot.stats).toBeNull();
 expect(snapshot.failed).toEqual([{section:'stats',error:'Veri kaynağı şu anda yanıt vermiyor (HTTP 503).'}]);
 expect(snapshot.transactions).toHaveLength(1);
});

test('rows are capped and a complete failure keeps the provider error',async()=>{
 const many=Array.from({length:80},(_,i)=>row(`tx-${i}`,i));
 const capped=await liveSnapshot('5042',async(_chain,q)=>result(q.kind,'2026-11-11T10:00:00Z',many));
 expect(capped.blocks).toHaveLength(20);expect(capped.transactions).toHaveLength(50);
 await expect(liveSnapshot('5042',async()=>{throw new ExplorerError('Desteklenmeyen ağ.',400);})).rejects.toThrow('Desteklenmeyen ağ.');
});
