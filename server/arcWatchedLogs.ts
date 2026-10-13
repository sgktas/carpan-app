import {parseAbiItem,type Address,type PublicClient} from 'viem';
const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
/** Viem getLogs accepts event/args, not raw topics. Never issue an unfiltered scan. */
export async function watchedTransferLogs(client:Pick<PublicClient,'getLogs'>,block:bigint,addresses:Address[],toBlock=block){
 const groups:Address[][]=[];
 for(let i=0;i<addresses.length;i+=50)groups.push(addresses.slice(i,i+50));
 const logs:Awaited<ReturnType<PublicClient['getLogs']>>=[];
 // Serialize heavy log reads; bounded block ranges amortize their RPC cost.
 for(const group of groups){
  logs.push(...await client.getLogs({event:transfer,args:{from:group},fromBlock:block,toBlock,strict:true}));
  logs.push(...await client.getLogs({event:transfer,args:{to:group},fromBlock:block,toBlock,strict:true}));
 }
 return logs;
}
