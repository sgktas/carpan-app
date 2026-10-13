import {defineChain, type Hex} from 'viem';
import type {EVMChainDefinition} from '@circle-fin/app-kit';
import registry from './bridge-network-registry.json';

// Reviewed CCTP V2 / native USDC registry from the pinned App Kit 1.15.3.
// Adding wallet counterparties never broadens the Arc research index.
export type BridgeNetworkFact={id:number;chain:string;name:string;testnet:boolean;domain:number;rpcs:string[];explorer:string;symbol:string;decimals:number;usdc:Hex;tokenMessenger:Hex;messageTransmitter:Hex};
export const BRIDGE_NETWORK_FACTS=registry as BridgeNetworkFact[];
/** Some upstream metadata uses non-checksummed mixed case; viem requires normalized addresses. */
export function normalizedBridgeDefinition(c:EVMChainDefinition):EVMChainDefinition{const normalized=JSON.parse(JSON.stringify(c,(_key,value)=>typeof value==='string'&&/^0x[0-9a-f]{40}$/i.test(value)?value.toLowerCase():value));normalized.rpcEndpoints=BRIDGE_NETWORK_FACTS.find(f=>f.id===c.chainId)?.rpcs||normalized.rpcEndpoints;return normalized;}
export const bridgeWalletChains=(testnet:boolean)=>BRIDGE_NETWORK_FACTS.filter(f=>f.testnet===testnet).map(f=>defineChain({id:f.id,name:f.name,nativeCurrency:{name:f.symbol,symbol:f.symbol,decimals:f.decimals},rpcUrls:{default:{http:f.rpcs}},blockExplorers:{default:{name:`${f.name} Explorer`,url:f.explorer}},testnet:f.testnet}));
export function reviewedBridgeDefinition(c:EVMChainDefinition, testnet:boolean){
  const f=BRIDGE_NETWORK_FACTS.find(f=>f.id===c.chainId&&f.testnet===testnet),v2=c.cctp?.contracts.v2;
  return !!f&&c.isTestnet===testnet&&c.chain===f.chain&&c.usdcAddress?.toLowerCase()===f.usdc.toLowerCase()&&c.nativeCurrency.symbol===f.symbol&&c.nativeCurrency.decimals===f.decimals&&c.cctp?.domain===f.domain&&v2?.type==='split'&&v2.tokenMessenger.toLowerCase()===f.tokenMessenger.toLowerCase()&&v2.messageTransmitter.toLowerCase()===f.messageTransmitter.toLowerCase();
}
