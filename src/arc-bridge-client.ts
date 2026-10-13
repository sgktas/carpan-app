import {AppKit,type EVMChainDefinition} from '@circle-fin/app-kit';
import {bridgeWalletChains,reviewedBridgeDefinition,BRIDGE_NETWORK_FACTS,normalizedBridgeDefinition} from './bridge-networks';

// Keep research Arc-only. These networks are wallet bridge counterparties only.
export const BRIDGE_WALLET_CHAINS=bridgeWalletChains(true);
export const createBridgeKit=()=>new AppKit();
export function supportedBridgeChains(kit:AppKit){
 const all=kit.getSupportedChains('bridge');
 return BRIDGE_NETWORK_FACTS.filter(f=>f.testnet).map(f=>{
  const c=all.find(c=>c.type==='evm'&&c.chainId===f.id) as EVMChainDefinition|undefined;
  if(!c||!reviewedBridgeDefinition(c,true))throw new Error(`${f.name}: bridge SDK metadata mismatch.`);
  return normalizedBridgeDefinition(c);
 });
}
