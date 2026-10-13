import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {explorerHistoryGet,ExplorerHistoryError} from './arcExplorer';
import {ExplorerBudget,type explorerRequest} from './explorerBudget';
import {parseWalletFilters,scanWalletHistory} from './arcWallet';
import {ARC_USDC} from '../src/arc-wallet';

const subject='0x'+'1'.repeat(40),peer='0x'+'2'.repeat(40),path=`/addresses/${subject}/token-transfers?type=ERC-20`;
const transfer=(index:number)=>({transaction_hash:'0x'+'a'.repeat(64),log_index:index,block_number:100-index,timestamp:'2026-10-12T00:00:00Z',from:{hash:peer},to:{hash:subject},token:{address_hash:ARC_USDC,decimals:'6',symbol:'USDC'},total:{value:'1000000',decimals:'6'}});
type HistoryRequester=typeof explorerRequest;
const response=(fetchedAt:number,cached=true):HistoryRequester=>async()=>({payload:{items:[transfer(1)],next_page_params:null},source:'Blockscout PRO',fetchedAt,cached});

test('history keeps the stored acquisition time and distinguishes fresh cache from stale evidence',async()=>{
  const now=Date.now(),fresh=await explorerHistoryGet(path,response(now-59000),()=>now),stale=await explorerHistoryGet(path,response(now-61000),()=>now);
  expect(fresh.fetchedAt).toBe(new Date(now-59000).toISOString());expect(fresh.stale).toBe(false);expect(fresh.cached).toBe(true);
  expect(stale.fetchedAt).toBe(new Date(now-61000).toISOString());expect(stale.stale).toBe(true);expect(stale.source).toBe('Blockscout PRO');
  let allowed=false;
  await explorerHistoryGet(path,async(_primary,_public,_key,ttl,background,allowStale)=>{expect(ttl).toBe(60000);expect(background).toBe(false);allowed=allowStale===true;return {payload:{},source:'Blockscout Explorer',fetchedAt:now,cached:false};},()=>now);
  expect(allowed).toBe(true);
});

test('history rejects evidence older than a day, future timestamps and non-history routes',async()=>{
  const now=Date.now();expect((await explorerHistoryGet(path,response(now-86400000),()=>now)).stale).toBe(true);
  for(const fetchedAt of [now-86400001,now+1,NaN])await expect(explorerHistoryGet(path,response(fetchedAt),()=>now)).rejects.toBeInstanceOf(ExplorerHistoryError);
  await expect(explorerHistoryGet(`/addresses/${subject}/counters`,response(now),()=>now)).rejects.toBeInstanceOf(ExplorerHistoryError);
});

test('reserve-limited history uses saved evidence without consuming credits or making a public request',async()=>{
  const db=new Database(':memory:');let now=Date.now();const budget=new ExplorerBudget(db,80000,20000,20,()=>now);
  try{
    budget.write(path,{items:[transfer(1)],next_page_params:null},'Blockscout PRO');now+=61000;
    budget.observe(new Response('{}',{headers:{'x-credits-remaining':'19980'}}));expect(budget.status().available).toBe(0);
    const requester:HistoryRequester=async(_primary,_public,_key,ttl,_background,allowStale)=>{
      expect(budget.read(path,ttl)).toBeNull();expect(allowStale).toBe(true);expect(budget.take()).toBe(false);
      const saved=budget.read(path,86400000)!;return {...saved,cached:true};
    };
    const result=await explorerHistoryGet(path,requester,()=>now);expect(result.stale).toBe(true);expect((result.payload as {items:unknown[]}).items).toHaveLength(1);
    expect(budget.status().credits).toBe(0);expect(budget.status().pro_calls).toBe(0);expect(budget.status().public_calls).toBe(0);expect(budget.status().remaining).toBe(19980);expect(budget.reserve).toBe(20000);
  }finally{db.close();}
});

test('history source failures give sanitized reserve and provider errors, never empty records',async()=>{
  const reserved:HistoryRequester=async()=>{throw new Error('API bütçesi korunuyor; bu sorgunun kayıtlı verisi yok.');};
  let error:unknown;try{await explorerHistoryGet(path,reserved);}catch(failure){error=failure;}
  expect(error).toBeInstanceOf(ExplorerHistoryError);expect((error as ExplorerHistoryError).code).toBe('history_budget_reserved');expect((error as ExplorerHistoryError).status).toBe(503);
  const failed:HistoryRequester=async()=>{throw new Error('upstream https://provider.invalid?api_key=test-secret-value');};
  try{await explorerHistoryGet(path,failed);}catch(failure){error=failure;}
  expect((error as ExplorerHistoryError).code).toBe('history_unavailable');expect((error as Error).message).not.toContain('test-secret-value');expect((error as Error).message).not.toContain('provider.invalid');
});

test('mixed history pages report their oldest acquisition, any stale page and distinct sources without duplicate transfers',async()=>{
  const now=Date.now(),old=new Date(now-120000).toISOString(),fresh=new Date(now-1000).toISOString();let calls=0;
  const result=await scanWalletHistory(subject,parseWalletFilters({}),{},async()=>{
    calls++;return {payload:{items:[transfer(1),transfer(calls+1)],next_page_params:calls===1?{block_number:80,index:2}:null},source:calls===1?'Blockscout PRO':'Blockscout Explorer',fetchedAt:calls===1?old:fresh,stale:calls===1,cached:true};
  });
  expect(result.fetchedAt).toBe(old);expect(result.stale).toBe(true);expect(result.sources).toEqual(['Blockscout PRO','Blockscout Explorer']);expect(result.items.map(item=>item.logIndex)).toEqual([1,2,3]);expect(result.scannedPages).toBe(2);expect(result.nextCursor).toBeNull();
  const fixture=await scanWalletHistory(subject,parseWalletFilters({}),{},async()=>({items:[transfer(1)],next_page_params:null}));expect(fixture.items).toHaveLength(1);expect(fixture.stale).toBeUndefined();expect(Number.isFinite(Date.parse(fixture.fetchedAt))).toBe(true);
});
