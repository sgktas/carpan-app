import {USDC_ASSET,type ArcAsset} from './arc-assets';
import {decimalRaw,type WalletTransfer} from './arc-wallet';

export type FlowEdge={id:string;from:string;to:string;raw:string;transfers:WalletTransfer[]};
export function buildFlow(items:WalletTransfer[],root:string,direction:'all'|'in'|'out'='all',minimum='0',asset:ArcAsset=USDC_ASSET){
  const threshold=decimalRaw(minimum||'0',asset.decimals),seen=new Set<string>(),edges=new Map<string,FlowEdge>();
  for(const t of items){
    if(seen.has(t.id)||t.token!==asset.address||t.decimals!==asset.decimals||t.from===t.to||BigInt(t.raw)<threshold)continue;
    seen.add(t.id);
    if(direction==='in'&&t.to!==root||direction==='out'&&t.from!==root)continue;
    const id=t.from+':'+t.to,edge=edges.get(id)||{id,from:t.from,to:t.to,raw:'0',transfers:[]};
    edge.raw=(BigInt(edge.raw)+BigInt(t.raw)).toString();edge.transfers.push(t);edges.set(id,edge);
  }
  const result=[...edges.values()].sort((a,b)=>BigInt(a.raw)>BigInt(b.raw)?-1:BigInt(a.raw)<BigInt(b.raw)?1:a.id.localeCompare(b.id));
  const volumes=new Map<string,bigint>();
  for(const e of result)for(const a of [e.from,e.to])volumes.set(a,(volumes.get(a)||0n)+BigInt(e.raw));
  const nodes=[...volumes.keys()].sort((a,b)=>volumes.get(a)!>volumes.get(b)!?-1:volumes.get(a)!<volumes.get(b)!?1:a.localeCompare(b));
  return {edges:result,nodes,transfers:result.flatMap(e=>e.transfers),volumes};
}
