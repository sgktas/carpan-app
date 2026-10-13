import {expect,test} from 'bun:test';
import {createPublicClient,custom,padHex,type Address} from 'viem';
import {watchedTransferLogs} from './arcWatchedLogs';
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
test('actual viem transport keeps Transfer signature and both followed-address filters in outgoing RPC',async()=>{
 const calls:{method:string;params:unknown[]}[]=[],addresses=['0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222'] as Address[];
 const client=createPublicClient({transport:custom({request:async(args)=>{calls.push(args as typeof calls[number]);return [];}})});
 expect(await watchedTransferLogs(client,101n,addresses)).toEqual([]);
 const encoded=addresses.map(address=>padHex(address,{size:32}));expect(JSON.parse(JSON.stringify(calls))).toEqual([
  {method:'eth_getLogs',params:[{topics:[topic,encoded,null],fromBlock:'0x65',toBlock:'0x65'}]},
  {method:'eth_getLogs',params:[{topics:[topic,null,encoded],fromBlock:'0x65',toBlock:'0x65'}]},
 ]);
});
test('empty watches never query all-chain logs; topic OR groups stay bounded at 50 addresses',async()=>{
 const calls:unknown[]=[],client=createPublicClient({transport:custom({request:async(args)=>{calls.push(args);return [];}})});
 await watchedTransferLogs(client,1n,[]);expect(calls).toHaveLength(0);
 const addresses=Array.from({length:51},(_,i)=>`0x${(i+1).toString(16).padStart(40,'0')}` as Address);
 await watchedTransferLogs(client,1n,addresses);expect(calls).toHaveLength(4);
 for(const query of calls as {params:{topics:unknown[]}[]}[]){expect(query.params[0].topics[0]).toBe(topic);const group=query.params[0].topics.find(Array.isArray) as unknown[];expect(group.length).toBeLessThanOrEqual(50);expect(group.length).toBeGreaterThan(0);}
});
