import type {ExplorerRow} from './chain-explorer';

// Circle's native USDC contracts. Symbol/name alone never identifies USDC.
// https://developers.circle.com/stablecoins/usdc-contract-addresses (2026-10-24)
export const TREASURY_CHAINS = [
  {id:'5042', name:'Arc', token:'0x3600000000000000000000000000000000000000'},
  {id:'8453', name:'Base', token:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'},
  {id:'42161', name:'Arbitrum', token:'0xaf88d065e77c8cc2239327c5edb3a432268e5831'},
  {id:'1', name:'Ethereum', token:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
] as const;
export const validTreasuryAddress=(value:string)=>/^0x[0-9a-f]{40}$/i.test(value)&&!/^0x0{40}$/i.test(value);
export const TREASURY_PILOT={chain:'5042',wallet:'0xfcdfe331d8a712ab450fb539ed2cc27297ccf281',hash:'0x19b5ea4afda6463038218af88010dfe6903e1c21fd72c64ae0b25839a2cce964'} as const;
export function usdcPage(rows:ExplorerRow[], chain:string, wallet:string):ExplorerRow[]{
  const token=TREASURY_CHAINS.find(c=>c.id===chain)?.token;
  if(!token||!validTreasuryAddress(wallet))return [];
  const seen=new Set<string>();
  return rows.filter(row=>{
    if(row.token?.toLowerCase()!==token||row.decimals!==6||!row.raw||!/^\d{1,100}$/.test(row.raw)||!row.hash||!/^0x[0-9a-f]{64}$/i.test(row.hash)
      ||!row.from||!row.to||!/^0x[0-9a-f]{40}$/i.test(row.from)||!/^0x[0-9a-f]{40}$/i.test(row.to)
      ||![row.from.toLowerCase(),row.to.toLowerCase()].includes(wallet.toLowerCase())||['error','failed','reverted'].includes(row.status?.toLowerCase()||''))return false;
    // The normalized row ID includes chain, tx and log index. Equal amounts in
    // different logs are distinct payments; native aliases are excluded above.
    if(seen.has(row.id))return false;seen.add(row.id);return true;
  });
}
export function summarizeTreasury(rows:ExplorerRow[],wallet:string){
  const address=wallet.toLowerCase(),peers=new Map<string,{address:string;incoming:bigint;outgoing:bigint;count:number}>();
  let incoming=0n,outgoing=0n,self=0n;
  for(const row of rows){
    if(!row.from||!row.to||!row.raw||!/^\d+$/.test(row.raw))continue;
    const from=row.from.toLowerCase(),to=row.to.toLowerCase(),amount=BigInt(row.raw);
    if(from===address&&to===address){self+=amount;continue;}
    if(from!==address&&to!==address)continue;
    const peer=from===address?to:from,entry=peers.get(peer)||{address:peer,incoming:0n,outgoing:0n,count:0};
    if(to===address){incoming+=amount;entry.incoming+=amount;}else{outgoing+=amount;entry.outgoing+=amount;}
    entry.count++;peers.set(peer,entry);
  }
  return {incoming,outgoing,self,peers:[...peers.values()].sort((a,b)=>b.count-a.count||a.address.localeCompare(b.address))};
}
export function treasuryAmount(value:bigint|string){
  const raw=String(value);if(!/^\d+$/.test(raw))return '—';
  const padded=raw.padStart(7,'0');return `${padded.slice(0,-6)}.${padded.slice(-6).replace(/0+$/,'').padEnd(2,'0')}`;
}
export function providerLabels(value:Record<string,unknown>|null):string[]{
  if(!value)return [];
  const tags=Array.isArray(value.public_tags)?value.public_tags:[];
  return [...new Set([value.name,...tags.map(v=>v&&typeof v==='object'?(v as Record<string,unknown>).display_name:null)]
    .filter((v):v is string=>typeof v==='string'&&!!v.trim()).map(v=>v.trim().slice(0,120)))].slice(0,5);
}
