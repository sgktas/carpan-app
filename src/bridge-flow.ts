import {decodeEventLog,type Hex} from 'viem';
import {BRIDGE_ABI,ARC_BRIDGES} from './arc-bridges';
import {CCTP_ABI,bytes32Address,factForDomain} from './bridge-recovery';
import type {ExplorerRow} from './chain-explorer';

/** Decoded Arc CCTP movement. Outbound = burn seen on Arc (not proof of delivery); inbound = mint on Arc. */
export type BridgeFlowRow={id:string;hash:string;block:number|null;timestamp:string|null;direction:'in'|'out';domain:number|null;network:string|null;amount:string;fee:string|null;sender:string|null;recipient:string|null};
export type BridgeFlowTotal={domain:number|null;network:string|null;inCount:number;outCount:number;inRaw:string;outRaw:string};
export type BridgeFlowSnapshot={rows:BridgeFlowRow[];totals:BridgeFlowTotal[];fetchedAt:string;source:string;liveMs:number;mode:string;failed:{section:string;error:string}[]};

const TOKEN_MESSENGER=ARC_BRIDGES[0].address,MESSAGE_TRANSMITTER=ARC_BRIDGES[1].address,ARC_USDC='0x3600000000000000000000000000000000000000';
const NON_EVM:Record<number,string>={5:'Solana'};
export function domainName(domain:number|null){if(domain===null)return null;return factForDomain('mainnet',domain)?.name||NON_EVM[domain]||null;}
function topicsOf(row:ExplorerRow){const topics=row.data.topics;return Array.isArray(topics)?topics.filter((t):t is Hex=>typeof t==='string'&&/^0x[0-9a-f]{64}$/i.test(t)):[];}
function decode(row:ExplorerRow,abi:typeof BRIDGE_ABI|typeof CCTP_ABI){
 const topics=topicsOf(row);if(!topics.length||typeof row.data.data!=='string')return null;
 try{return decodeEventLog({abi,data:row.data.data as Hex,topics:topics as [Hex,...Hex[]],strict:true});}catch{return null;}
}
const txOf=(row:ExplorerRow)=>row.hash||(typeof row.data.transaction_hash==='string'?row.data.transaction_hash.toLowerCase():null);

/**
 * Joins TokenMessenger burns/mints with MessageTransmitter MessageReceived logs from the same
 * transaction to learn an inbound transfer's source domain. Only the reviewed Arc emitters and
 * the canonical USDC token are counted; anything else is dropped rather than guessed.
 */
export function decodeBridgeFlow(messengerLogs:ExplorerRow[],transmitterLogs:ExplorerRow[]):BridgeFlowRow[]{
 const sourceByTx=new Map<string,number>();
 for(const row of transmitterLogs){
  if(row.address?.toLowerCase()!==MESSAGE_TRANSMITTER)continue;
  const event=decode(row,CCTP_ABI),tx=txOf(row);
  if(event?.eventName==='MessageReceived'&&tx)sourceByTx.set(tx,Number((event.args as {sourceDomain:number}).sourceDomain));
 }
 const rows:BridgeFlowRow[]=[];
 for(const row of messengerLogs){
  if(row.address?.toLowerCase()!==TOKEN_MESSENGER)continue;
  const event=decode(row,BRIDGE_ABI),tx=txOf(row);if(!event||!tx)continue;
  const base={id:row.id,hash:tx,block:row.block,timestamp:row.timestamp};
  if(event.eventName==='DepositForBurn'){
   const a=event.args;if(a.burnToken.toLowerCase()!==ARC_USDC)continue;
   rows.push({...base,direction:'out',domain:a.destinationDomain,network:domainName(a.destinationDomain),amount:a.amount.toString(),fee:null,sender:a.depositor.toLowerCase(),recipient:bytes32Address(a.mintRecipient)||a.mintRecipient});
  }else if(event.eventName==='MintAndWithdraw'){
   const a=event.args;if(a.mintToken.toLowerCase()!==ARC_USDC)continue;
   const domain=sourceByTx.get(tx)??null;
   rows.push({...base,direction:'in',domain,network:domainName(domain),amount:a.amount.toString(),fee:a.feeCollected.toString(),sender:null,recipient:a.mintRecipient.toLowerCase()});
  }
 }
 return rows.sort((a,b)=>(b.block??0)-(a.block??0));
}

/** Per-counterparty totals of the loaded rows only; never a chain-wide figure. */
export function bridgeFlowTotals(rows:BridgeFlowRow[]):BridgeFlowTotal[]{
 const map=new Map<string,{domain:number|null;network:string|null;inCount:number;outCount:number;inRaw:bigint;outRaw:bigint}>();
 for(const row of rows){
  const key=String(row.domain);const t=map.get(key)||{domain:row.domain,network:row.network,inCount:0,outCount:0,inRaw:0n,outRaw:0n};
  if(row.direction==='in'){t.inCount++;t.inRaw+=BigInt(row.amount);}else{t.outCount++;t.outRaw+=BigInt(row.amount);}
  map.set(key,t);
 }
 return [...map.values()].sort((a,b)=>{const x=a.inRaw+a.outRaw,y=b.inRaw+b.outRaw;return x===y?0:x>y?-1:1;}).map(t=>({...t,inRaw:t.inRaw.toString(),outRaw:t.outRaw.toString()}));
}
