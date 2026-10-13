import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createMarketService,normalizePools,normalizeCandles} from './marketData';
import {createMarketRoutes} from './marketRoutes';
import express from 'express';
import {ARC_USDC} from '../src/arc-wallet';
const base='0x'+'1'.repeat(40),quote=ARC_USDC.toLowerCase(),pool='0x'+'2'.repeat(40),poolId='0x'+'3'.repeat(64);
const fixture=(id=pool,baseId=base,quoteId=quote)=>({data:[{id:`arc_${id}`,attributes:{address:id,name:'TEST / USDC',base_token_price_usd:'2.1',quote_token_price_usd:'0.9998',price_change_percentage:{h24:'-2.5'},volume_usd:{h24:'0'},reserve_in_usd:null,transactions:{h24:{buys:2,sells:3}}},relationships:{base_token:{data:{id:`arc_${baseId}`}},quote_token:{data:{id:`arc_${quoteId}`}},dex:{data:{id:'dex'}}}}],included:[{id:`arc_${baseId}`,attributes:{name:'Test token',symbol:'TEST'}},{id:`arc_${quoteId}`,attributes:{name:'USD Coin',symbol:'USDC'}}]});

test('market normalization binds chain, tokens and pool kind, preserves missing/zero metrics and native USDC identity',()=>{
 const [value]=normalizePools(fixture());expect(value).toMatchObject({id:pool,kind:'contract',basePriceUsd:2.1,quotePriceUsd:.9998,change24h:-2.5,volume24hUsd:0,liquidityUsd:null,transactions24h:5});
 expect(normalizePools(fixture(poolId))[0].kind).toBe('pool-id');
 const native=normalizePools(fixture(pool,base,'0x'+'0'.repeat(40)))[0];expect(native.quote).toMatchObject({address:quote,native:true,symbol:'USDC'});
 expect(()=>normalizePools(fixture(pool,quote,'0x'+'0'.repeat(40)))).toThrow('invalid_response');
 const foreign=fixture();foreign.data[0].id=`eth_${pool}`;expect(()=>normalizePools(foreign)).toThrow('invalid_response');
 expect(()=>normalizePools({errors:[{detail:'No API result'}]})).toThrow('invalid_response');
 const hostile=fixture();hostile.data[0].attributes.address='https://attacker.example';expect(()=>normalizePools(hostile)).toThrow('invalid_response');
 const malformed=fixture();malformed.data[0].attributes.base_token_price_usd='Infinity';expect(normalizePools(malformed)[0].basePriceUsd).toBeNull();
});

test('OHLCV normalizes source candles only, orders and deduplicates timestamps, excludes future and invalid ranges',()=>{
 const time=1791561600,now=(time+3600)*1000;
 const data={data:{attributes:{ohlcv_list:[[time+900,2,3,1,2.5,10],[time,1,2,.5,1.8,0],[time,1,2,.5,1.9,1],[time+1800,9,3,1,2,1],[time+7200,1,2,.5,1,3]]}}};
 const values=normalizeCandles(data,now);expect(values).toHaveLength(2);expect(values.map(c=>c.time)).toEqual([time,time+900]);expect(values[0].close).toBe(1.9);expect(values[0].volume).toBe(1);
 expect(()=>normalizeCandles({data:{attributes:{}}},now)).toThrow('invalid_response');
});

test('cache coalesces requests, survives service restart, retains dated stale values and stops retry bursts',async()=>{
 const db=new Database(':memory:');let now=1000000,calls=0,fail=false;
 const fetcher=(async()=>{calls++;await Promise.resolve();return fail?new Response('bad',{status:429}):Response.json(fixture());}) as typeof fetch;
 const service=createMarketService(db,{fetcher,now:()=>now});
 const results=await Promise.all([service.pools(),service.pools(),service.pools()]);expect(calls).toBe(1);expect(results.every(r=>r.status==='fresh')).toBe(true);
 const restarted=createMarketService(db,{fetcher,now:()=>now});await restarted.pools();expect(calls).toBe(1);
 now+=61000;fail=true;const stale=await service.pools();expect(stale.status).toBe('stale');expect(stale.retrievedAt).toBe(results[0].retrievedAt);expect(stale.data[0].basePriceUsd).toBe(2.1);await service.pools();expect(calls).toBe(2);
 now+=901000;const missing=await service.pools();expect(missing.status).toBe('unavailable');expect(missing.data).toEqual([]);expect(missing.retrievedAt).toBeNull();db.close();
});

test('global request cap bounds distinct pool keys; malformed input never reaches a provider',async()=>{
 const db=new Database(':memory:');let calls=0;const service=createMarketService(db,{fetcher:(async()=>{calls++;return Response.json({data:[]});}) as typeof fetch,now:()=>100000});
 for(let i=0;i<9;i++)await service.tokenPools('0x'+i.toString(16).padStart(40,'1'));
 expect(calls).toBe(8);const capped=await service.pool(pool);expect(capped).toMatchObject({status:'unavailable',reason:'rate_limit'});expect(calls).toBe(8);
 await expect(service.tokenPools('0x'+'0'.repeat(40))).rejects.toThrow('invalid_token');await expect(service.pool('https://bad.example')).rejects.toThrow('invalid_pool');expect(calls).toBe(8);db.close();
});

test('token filtering is exact and does not mistake another chain/token for the requested asset',async()=>{
 const db=new Database(':memory:');const service=createMarketService(db,{fetcher:(async()=>Response.json(fixture())) as typeof fetch});
 expect((await service.tokenPools(base)).data).toHaveLength(1);expect((await service.tokenPools('0x'+'9'.repeat(40))).data).toEqual([]);db.close();
});

test('market HTTP routes validate queries and keep fixtures isolated from real provider calls',async()=>{
 const db=new Database(':memory:'),app=express();app.use('/markets',createMarketRoutes(db,true));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const info=server.address();if(!info||typeof info==='string')throw Error('No port');const url=`http://127.0.0.1:${info.port}/markets`;
 try{
  const response=await fetch(url);expect(response.headers.get('cache-control')).toBe('public, max-age=30');expect(await response.json()).toMatchObject({status:'unavailable',reason:'fixture_realm',data:[]});
  for(const path of ['?view=unknown','?token=bad',`?token=0x${'0'.repeat(40)}`,'/pools/invalid',`/pools/${pool}/chart?side=bad`,`/pools/${pool}/chart?range=1y`])expect((await fetch(url+path)).status).toBe(400);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
