import {expect,test,spyOn} from 'bun:test';
import express,{Router,type Request,type Response as ExpressResponse} from 'express';
import {createArcWalletReadGuard} from './arcWalletRateLimit';
import {AuthRequestLimiter} from './authRequestGuard';
import {decodeWalletCursor,encodeWalletCursor,getWalletResearch,parseWalletFilters} from './arcWallet';
import {explorerResearchGet,explorerPublicHistoryGet} from './arcExplorer';
import type {explorerRequest} from './explorerBudget';

const address='0x'+'d'.repeat(40),filters=parseWalletFilters({}),browser='Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36';
function fixture(limit=2,maxKeys=4096){
 let now=10000,reads=0;const limiter=new AuthRequestLimiter(maxKeys),app=express();app.set('trust proxy',1);
 const router=Router();router.use(createArcWalletReadGuard({limiter,limit,clock:()=>now}));
 router.get('/arc/wallets/:address/:kind?',(req,res)=>{reads++;const cursor=new URL(req.url,'https://fixture.invalid').searchParams.get('cursor');
   res.json({reads,...cursor?{next:decodeWalletCursor(cursor,req.params.address.toLowerCase(),filters)}:{}});});
 router.get('/arc/wallets/:address/label',(_req,res)=>res.json({label:'private-fixture'}));
 router.get('/',(_req,res)=>res.json({public:true}));
 const request=(path:string,agent=browser,ip='203.0.113.10',extraHeaders:Record<string,string>={})=>new Promise<Response>(resolve=>{
  const req=Object.assign(Object.create(express.request),{method:'GET',url:path,app,headers:{'user-agent':agent,'x-forwarded-for':ip,...extraHeaders},socket:{remoteAddress:'127.0.0.1'}}) as Request;
  const headers:Record<string,string>={};let status=200;
  const res={set(k:string,v:string){headers[k]=v;return this;},status(value:number){status=value;return this;},json(value:unknown){resolve(new Response(JSON.stringify(value),{status,headers}));return this;}} as unknown as ExpressResponse;
  router(req,res,()=>resolve(new Response('{}',{status:404})));
 });
 return {request,limiter,reads:()=>reads,advance:(ms:number)=>now+=ms};
}

test('known distributed crawlers are rejected before any paid or RPC reader while the public website remains accessible',async()=>{
 const f=fixture();
 for(const [index,agent] of ['AhrefsBot/7.0','GPTBot/1.2','Googlebot/2.1','bingbot/2.0','ClaudeBot/1.0','CCBot/2.0','Bytespider','SemrushBot'].entries()){
  const response=await f.request(`/arc/wallets/${address}/research`,agent,`203.0.113.${index+1}`);
  expect(response.status).toBe(403);expect((await response.json()).code).toBe('crawler_not_supported');expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
 }
 expect((await f.request(`/arc/wallets/%30x${address.slice(2)}/research`,'AhrefsBot/7.0')).status).toBe(403);
 expect(f.reads()).toBe(0);expect(f.limiter.size).toBe(0);expect((await f.request('/','AhrefsBot/7.0')).status).toBe(200);
 expect((await f.request(`/arc/wallets/${address}/research`)).status).toBe(200);expect(f.reads()).toBe(1);
});

test('shared per-IP limits prevent extra provider reads, give Retry-After and recover after the window',async()=>{
 const f=fixture();expect((await f.request(`/arc/wallets/${address}`)).status).toBe(200);
 expect((await f.request(`/arc/wallets/${address}/research`)).status).toBe(200);
 const blocked=await f.request(`/arc/wallets/${address}/transfers`);expect(blocked.status).toBe(429);expect(blocked.headers.get('retry-after')).toBe('60');expect(f.reads()).toBe(2);
 expect((await f.request(`/arc/wallets/${address}/research`,browser,'203.0.113.11')).status).toBe(200);
 f.advance(60000);expect((await f.request(`/arc/wallets/${address}/research`)).status).toBe(200);expect(f.reads()).toBe(4);
});

test('signed pagination stays available within quota and spoofed forwarding chains cannot evade the actual proxy-normalized IP',async()=>{
 const f=fixture(),cursor=encodeWalletCursor(address,filters,{block_number:42,index:3});
 const path=`/arc/wallets/${address}/transfers?cursor=${encodeURIComponent(cursor)}`;
 const first=await f.request(path);expect(first.status).toBe(200);expect((await first.json()).next).toEqual({block_number:42,index:3});
 expect((await f.request(path,browser,'198.51.100.1, 203.0.113.10')).status).toBe(200);
 expect((await f.request(path,browser,'198.51.100.2, 203.0.113.10')).status).toBe(429);expect(f.reads()).toBe(2);
});

test('limiter key exhaustion rejects new IPs rather than clearing existing protections',async()=>{
 const f=fixture(2,1);expect((await f.request(`/arc/wallets/${address}/research`)).status).toBe(200);
 expect((await f.request(`/arc/wallets/${address}/research`,browser,'203.0.113.11')).status).toBe(429);expect(f.reads()).toBe(1);expect(f.limiter.size).toBe(1);
});

test('five-minute research evidence preserves original acquisition time and never accepts stale fallback',async()=>{
 const now=Date.now(),resource=`/addresses/${address}/coin-balance-history`;
 const read:typeof explorerRequest=async(_primary,_public,_key,ttl,_background,allowStale,purpose)=>{
  expect(ttl).toBe(300000);expect(allowStale).toBe(false);expect(purpose).toBe('research');return {payload:{items:[]},source:'Blockscout PRO',fetchedAt:now-120000,cached:true};
 };
 const result=await explorerResearchGet(resource,read,()=>now);expect(result.fetchedAt).toBe(new Date(now-120000).toISOString());expect(result.cached).toBe(true);expect(result.stale).toBe(true);
 const expired:typeof explorerRequest=async()=>({payload:{},source:'Blockscout PRO',fetchedAt:now-300001,cached:true});
 await expect(explorerResearchGet(resource,expired,()=>now)).rejects.toThrow('cache window');
 await expect(explorerResearchGet('/tokens/other',read,()=>now)).rejects.toThrow('resource');
});

test('wallet research coalesces case variants, reuses metadata for five minutes and keeps the oldest provider acquisition',async()=>{
 let reads=0;const first=Date.now()-120000,selected='0x'+'c'.repeat(40);
 const load:typeof explorerResearchGet=async<T,>(path:string)=>{reads++;return {payload:{items:[]} as T,source:'Blockscout PRO',fetchedAt:new Date(first+(path.endsWith('counters')?10000:0)).toISOString(),cached:true,stale:true};};
 const [a,b]=await Promise.all([getWalletResearch(selected,load),getWalletResearch('0x'+selected.slice(2).toUpperCase(),load)]);
 expect(reads).toBe(3);expect(a.fetchedAt).toBe(new Date(first).toISOString());expect(b.fetchedAt).toBe(a.fetchedAt);
 const again=await getWalletResearch(selected,load);expect(reads).toBe(3);expect(again.fetchedAt).toBe(a.fetchedAt);
});

test('memory reuse does not extend a provider response beyond its original five-minute lifetime',async()=>{
 let now=Date.now(),reads=0,old=true;const selected='0x'+'b'.repeat(40),date=spyOn(Date,'now').mockImplementation(()=>now);
 const load:typeof explorerResearchGet=async<T,>()=>{reads++;return {payload:{items:[]} as T,source:'Blockscout PRO',fetchedAt:new Date(now-(old?290000:0)).toISOString(),cached:old,stale:old};};
 try{
  const first=await getWalletResearch(selected,load);expect(reads).toBe(3);
  now+=9000;expect((await getWalletResearch(selected,load)).fetchedAt).toBe(first.fetchedAt);expect(reads).toBe(3);
  now+=2000;old=false;const renewed=await getWalletResearch(selected,load);expect(reads).toBe(6);expect(renewed.fetchedAt).toBe(new Date(now).toISOString());
 }finally{date.mockRestore();}
});

test('public transfer reuse keeps old acquisition and stale disclosure while business history retains its separate freshness contract',async()=>{
 const now=Date.now(),path=`/addresses/${address}/token-transfers?type=ERC-20`;
 const read:typeof explorerRequest=async(_primary,_public,_key,ttl,_background,allowStale,purpose)=>{
  expect(ttl).toBe(300000);expect(allowStale).toBe(true);expect(purpose).toBe('research');return {payload:{items:[],next_page_params:null},source:'Blockscout PRO',fetchedAt:now-240000,cached:true};
 };
 const result=await explorerPublicHistoryGet(path,read,()=>now);expect(result.fetchedAt).toBe(new Date(now-240000).toISOString());expect(result.stale).toBe(true);expect(result.cached).toBe(true);
});
