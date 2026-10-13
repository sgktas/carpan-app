import {createPublicClient,erc20Abi,http,fallback,parseAbi,type Hex} from 'viem';
import type {AppKit,EVMChainDefinition} from '@circle-fin/app-kit';
import {BRIDGE_NETWORK_FACTS,bridgeWalletChains,reviewedBridgeDefinition,normalizedBridgeDefinition} from './bridge-networks';

// Reviewed USDC counterparties. Only selected routes are read; research stays Arc-only.
export const MAINNET_BRIDGE_STORAGE='carpan.arc.bridge.mainnet.v1';
export const MAINNET_BRIDGE_FACTS=BRIDGE_NETWORK_FACTS.filter(f=>!f.testnet);
export const MAINNET_CCTP={tokenMessenger:'0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',messageTransmitter:'0x81D40F21F12A8F0E3252Bccb954D722d4c464B64'} as const;
export const MAINNET_BRIDGE_CHAINS=bridgeWalletChains(false);

export function verifiedMainnetDefinitions(kit:Pick<AppKit,'getSupportedChains'>):EVMChainDefinition[]{
 const all=kit.getSupportedChains('bridge');
 return MAINNET_BRIDGE_FACTS.map(f=>{
  const c=all.find(c=>c.type==='evm'&&c.chainId===f.id) as EVMChainDefinition|undefined;
  if(!c||!reviewedBridgeDefinition(c,false))throw new Error(`${f.name} mainnet SDK metadata does not match the reviewed configuration.`);
  return normalizedBridgeDefinition(c);
 });
}

export type MainnetRpcReader={getChainId:()=>Promise<number>;getBlockNumber:()=>Promise<bigint>;getBytecode:(args:{address:Hex})=>Promise<Hex|undefined>;readContract:(args:{address:Hex;abi:ReturnType<typeof parseAbi>|typeof erc20Abi;functionName:string})=>Promise<unknown>};
const domainAbi=parseAbi(['function localDomain() view returns (uint32)','function localMessageTransmitter() view returns (address)']);
export async function inspectMainnetChain(f:typeof MAINNET_BRIDGE_FACTS[number],reader:MainnetRpcReader){
 // Verify chain ID first: never accept a testnet token at the same Arc predeploy address.
 if(await reader.getChainId()!==f.id)throw new Error(`${f.name}: RPC chain ID mismatch.`);
 const [block,decimals,domain,transmitter,...code]=await Promise.all([
  reader.getBlockNumber(),reader.readContract({address:f.usdc,abi:erc20Abi,functionName:'decimals'}),
  reader.readContract({address:f.messageTransmitter,abi:domainAbi,functionName:'localDomain'}),
  reader.readContract({address:f.tokenMessenger,abi:domainAbi,functionName:'localMessageTransmitter'}),
  ...[f.usdc,f.tokenMessenger,f.messageTransmitter].map(address=>reader.getBytecode({address})),
 ]);
 if(Number(decimals)!==6||Number(domain)!==f.domain||typeof transmitter!=='string'||transmitter.toLowerCase()!==f.messageTransmitter.toLowerCase()||code.some(c=>!c||c==='0x'))throw new Error(`${f.name}: USDC or CCTP onchain configuration mismatch.`);
 return {chainId:f.id,name:f.name,block:block.toString(),usdcDecimals:6,domain:f.domain,contractsPresent:true,checkedAt:new Date().toISOString()};
}
export function mainnetReader(id:number):MainnetRpcReader{
 const chain=MAINNET_BRIDGE_CHAINS.find(c=>c.id===id);if(!chain)throw new Error('Unsupported mainnet bridge chain.');
 const client=createPublicClient({chain,transport:fallback(chain.rpcUrls.default.http.map(url=>http(url,{timeout:12000,retryCount:0})),{retryCount:0})});
 return client as unknown as MainnetRpcReader;
}
