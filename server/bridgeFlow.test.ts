import {test,expect} from 'bun:test';
import {encodeAbiParameters,encodeEventTopics,type Hex} from 'viem';
import {BRIDGE_ABI,ARC_BRIDGES} from '../src/arc-bridges';
import {CCTP_ABI,addressBytes32} from '../src/bridge-recovery';
import {decodeBridgeFlow,bridgeFlowTotals,domainName} from '../src/bridge-flow';
import {liveBridgeFlow} from './bridgeFlow';
import {ExplorerError} from './chainExplorer';
import type {ExplorerRow,ExplorerResult} from '../src/chain-explorer';

const USDC='0x3600000000000000000000000000000000000000',user='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const tx=(n:number)=>('0x'+n.toString(16).padStart(64,'0'));
function row(address:string,topics:Hex[],data:Hex,hash:string,block:number):ExplorerRow{return {id:`${hash}:${block}`,title:'log',address,from:null,to:null,hash,token:null,symbol:'',raw:null,decimals:null,nftId:null,block,timestamp:null,status:null,data:{topics,data}};}
const burn=(hash:string,block:number,amount:bigint,domain:number,token=USDC,emitter:string=ARC_BRIDGES[0].address)=>row(emitter,encodeEventTopics({abi:BRIDGE_ABI,eventName:'DepositForBurn',args:{burnToken:token as Hex,depositor:user,minFinalityThreshold:1000}}) as Hex[],
 encodeAbiParameters([{type:'uint256'},{type:'bytes32'},{type:'uint32'},{type:'bytes32'},{type:'bytes32'},{type:'uint256'},{type:'bytes'}],[amount,addressBytes32(other),domain,addressBytes32(other),('0x'+'0'.repeat(64)) as Hex,0n,'0x']),hash,block);
const mint=(hash:string,block:number,amount:bigint,fee=0n)=>row(ARC_BRIDGES[0].address,encodeEventTopics({abi:BRIDGE_ABI,eventName:'MintAndWithdraw',args:{mintRecipient:other,mintToken:USDC}}) as Hex[],encodeAbiParameters([{type:'uint256'},{type:'uint256'}],[amount,fee]),hash,block);
const received=(hash:string,block:number,sourceDomain:number)=>row(ARC_BRIDGES[1].address,encodeEventTopics({abi:CCTP_ABI,eventName:'MessageReceived',args:{caller:user,nonce:tx(99) as Hex,finalityThresholdExecuted:2000}}) as Hex[],
 encodeAbiParameters([{type:'uint32'},{type:'bytes32'},{type:'bytes'}],[sourceDomain,addressBytes32(other),'0x']),hash,block);

test('domains map to reviewed mainnet networks, Solana by name, unknown stays null',()=>{
 expect(domainName(3)).toBe('Arbitrum');expect(domainName(5)).toBe('Solana');expect(domainName(9999)).toBeNull();expect(domainName(null)).toBeNull();
});

test('burns become outbound rows; mints take their source domain from MessageReceived in the same transaction',()=>{
 const rows=decodeBridgeFlow([burn(tx(1),10,5_000_000n,3),mint(tx(2),12,2_000_000n,100n)],[received(tx(2),12,6)]);
 expect(rows.map(r=>r.direction)).toEqual(['in','out']);
 const [inbound,outbound]=rows;
 expect(inbound.domain).toBe(6);expect(inbound.network).toBe('Base');expect(inbound.amount).toBe('2000000');expect(inbound.fee).toBe('100');expect(inbound.recipient).toBe(other);
 expect(outbound.network).toBe('Arbitrum');expect(outbound.sender).toBe(user);expect(outbound.recipient).toBe(other);
});

test('foreign emitters, non-USDC tokens and unmatched mints are not guessed',()=>{
 const rows=decodeBridgeFlow([burn(tx(1),10,1n,3,'0x3333333333333333333333333333333333333333'),burn(tx(2),11,1n,3,USDC,'0x9999999999999999999999999999999999999999'),mint(tx(3),12,7n)],[]);
 expect(rows).toHaveLength(1);expect(rows[0].direction).toBe('in');expect(rows[0].domain).toBeNull();expect(rows[0].network).toBeNull();
});

test('totals are per counterparty and exact',()=>{
 const rows=decodeBridgeFlow([burn(tx(1),10,5n,3),burn(tx(2),11,7n,3),mint(tx(3),12,4n)],[received(tx(3),12,3)]);
 expect(bridgeFlowTotals(rows)).toEqual([{domain:3,network:'Arbitrum',inCount:1,outCount:2,inRaw:'4',outRaw:'12'}]);
});

const result=(items:ExplorerRow[]):ExplorerResult=>({network:{id:'5042',name:'Arc Mainnet',explorer:'https://explorer.arc.io',isTestnet:false,nativeSymbol:'USDC',nativeDecimals:18},kind:'logs',items,detail:null,nextCursor:null,fetchedAt:'2026-11-11T10:00:00Z',source:'Blockscout PRO · Arc Mainnet'});
test('live snapshot reads both contracts with the live TTL; a transmitter failure keeps outbound rows',async()=>{
 const calls:{address?:string;ttl?:number}[]=[];
 const snapshot=await liveBridgeFlow(async(_c,q,_b,ttl)=>{calls.push({address:q.address,ttl});if(q.address===ARC_BRIDGES[1].address)throw new ExplorerError('HTTP 503');return result([burn(tx(1),10,5n,3)]);});
 expect(calls.map(c=>c.address).sort()).toEqual([ARC_BRIDGES[0].address,ARC_BRIDGES[1].address].sort());
 expect(calls.every(c=>c.ttl===snapshot.liveMs)).toBe(true);
 expect(snapshot.rows).toHaveLength(1);expect(snapshot.failed[0].section).toBe('transmitter');
 await expect(liveBridgeFlow(async()=>{throw new ExplorerError('down');})).rejects.toThrow('down');
});
