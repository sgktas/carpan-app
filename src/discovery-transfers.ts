export const PRIORITY_NETWORK_IDS=['5042','8453','1','42161','10'];
import type {ExplorerNetwork,ExplorerRow} from './chain-explorer';
export type DiscoveryTransfer=ExplorerRow&{network:ExplorerNetwork;source:string;fetchedAt?:string};
export type DiscoveryFeed={items:DiscoveryTransfer[];fetchedAt:string;totalNetworks:number;loadedNetworks:number;attemptedNetworks:number;failedNetworks:{id:string;name:string;error:string}[];nextCursor:string|null;source:string;cycleComplete:boolean;scope?:string;policy?:{mode:string;arcMs:number;otherMs:number;pollMs:number}};
export function discoveryAddresses(items:DiscoveryTransfer[]){
 const signatures=new Set(items.map(t=>`${t.network.id}:${t.token}:${t.decimals}`));
 const singleAsset=items.length>0&&signatures.size===1&&items.every(t=>t.raw!==null&&t.decimals!==null&&!t.nftId);
 const map=new Map<string,{key:string;address:string;network:ExplorerNetwork;name:string|null;count:number;volume:bigint;block:number;symbol:string;decimals:number}>();
 for(const t of items)for(const a of new Set([t.from,t.to].filter((s):s is string=>!!s))){
  const side=t.from===a?t.data.from:t.data.to;
  const name=side&&typeof side==='object'&&typeof (side as {name?:unknown}).name==='string'?String((side as {name:string}).name):null;
  const key=`${t.network.id}:${a}`,p=map.get(key)||{key,address:a,network:t.network,name,count:0,volume:0n,block:0,symbol:t.symbol,decimals:t.decimals||0};
  p.count++;if(singleAsset&&t.raw)p.volume+=BigInt(t.raw);p.block=Math.max(p.block,t.block||0);if(name)p.name=name;map.set(key,p);
 }
 return {singleAsset,entities:[...map.values()].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key))};
}
