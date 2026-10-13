import {expect,test} from 'bun:test';
import {AppKit} from '@circle-fin/app-kit';
import {BRIDGE_STORAGE,validateBridge,bridgeReadiness,decodeRecords,encodeRecords,canResume,resumeBridge,type BridgeRecord} from '../src/arc-bridge';
import {bridgeSdkProvider} from '../src/bridge-wallet-network';
import type {EIP1193Provider} from 'viem';
import {MAINNET_BRIDGE_CHAINS} from '../src/bridge-mainnet-config';
import {MAINNET_BRIDGE_FACTS,MAINNET_BRIDGE_STORAGE,MAINNET_CCTP,inspectMainnetChain,verifiedMainnetDefinitions,type MainnetRpcReader} from '../src/bridge-mainnet-config';

test('pilot SDK has the reviewed contracts; mainnet storage is separate',()=>{
 expect(verifiedMainnetDefinitions(new AppKit()).map(c=>c.chainId)).toEqual(MAINNET_BRIDGE_FACTS.map(c=>c.id));
 expect(MAINNET_BRIDGE_FACTS).toHaveLength(25);
 expect(MAINNET_BRIDGE_STORAGE).not.toBe(BRIDGE_STORAGE);
 const kit=new AppKit(),all=kit.getSupportedChains('bridge');
 const corrupted=all.map(c=>c.chainId===5042?{...c,isTestnet:true}:c);
 expect(()=>verifiedMainnetDefinitions({getSupportedChains:()=>corrupted} as Pick<AppKit,'getSupportedChains'>)).toThrow('metadata');
});
function reader(overrides:Partial<MainnetRpcReader>={}):MainnetRpcReader{return {getChainId:async()=>5042,getBlockNumber:async()=>42n,getBytecode:async()=> '0x6000',readContract:async a=>a.functionName==='decimals'?6:a.functionName==='localDomain'?26:MAINNET_CCTP.messageTransmitter,...overrides};}
test('a testnet RPC is rejected before contract reads',async()=>{
 let reads=0;await expect(inspectMainnetChain(MAINNET_BRIDGE_FACTS[0],reader({getChainId:async()=>5042002,readContract:async()=>{reads++;return 6;}}))).rejects.toThrow('chain ID');expect(reads).toBe(0);
});
test('wrong token precision, CCTP domain/link or missing code cannot pass readiness',async()=>{
 for(const overrides of [{getBytecode:async()=> '0x' as const},{readContract:async()=>18},{readContract:async a=>a.functionName==='decimals'?6:a.functionName==='localDomain'?3:MAINNET_CCTP.messageTransmitter},{readContract:async a=>a.functionName==='decimals'?6:a.functionName==='localDomain'?26:'0x0000000000000000000000000000000000000000'}] satisfies Partial<MainnetRpcReader>[])await expect(inspectMainnetChain(MAINNET_BRIDGE_FACTS[0],reader(overrides))).rejects.toThrow('configuration mismatch');
 expect((await inspectMainnetChain(MAINNET_BRIDGE_FACTS[0],reader())).block).toBe('42');
});

test('mainnet routes need explicit environment and never decode as testnet history',()=>{
 const [arc,arb]=verifiedMainnetDefinitions(new AppKit()),wallet='0x1111111111111111111111111111111111111111';
 expect(()=>validateBridge(arc,arb,'1',wallet)).toThrow('supported test networks');
 expect(validateBridge(arc,arb,'1',wallet,'mainnet')).toBe(1000000n);
 expect(()=>validateBridge(arc,{...arb,chainId:1},'1',wallet,'mainnet')).toThrow('including Arc');
 const eth=verifiedMainnetDefinitions(new AppKit()).find(c=>c.chainId===1)!;
 expect(validateBridge(arc,eth,'1',wallet,'mainnet')).toBe(1000000n);
 expect(()=>validateBridge(arb,eth,'1',wallet,'mainnet')).toThrow('including Arc');
 const record={id:'pilot',wallet,source:5042,destination:42161,recipient:wallet,amount:'1',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'interrupted',result:{amount:'1.0',token:'USDC',state:'pending',provider:'CCTPV2BridgingProvider',source:{address:wallet,chain:arc},destination:{address:wallet,chain:arb},steps:[]}} as BridgeRecord;
 const encoded=encodeRecords([record]);
 expect(decodeRecords(encoded,[arc,arb])).toHaveLength(0);
 expect(decodeRecords(encoded,[arc,arb],'mainnet')).toHaveLength(1);
 const quote={amount:'1',fees:[],gasFees:[{blockchain:arc.chain,token:'USDC',fees:{fee:'0.02'}},{blockchain:arb.chain,token:'ETH',fees:{fee:'0.0001'}}]} as Parameters<typeof bridgeReadiness>[6];
 const checks=bridgeReadiness(arc,arb,1000000n,1000000n,10n**18n,100000000000000n,quote);
 expect(checks.sourceRequired).toBe(1020000000000000000n);expect(checks.sourceReady).toBe(false);expect(checks.destinationReady).toBe(false);
});
test('mainnet provider only signs in explicitly selected Arc/Arbitrum environment',async()=>{
 let active='0xa4b1',sends=0,gasChain=0;
 const provider={request:async(req:{method:string})=>{if(req.method==='eth_chainId')return active;if(req.method==='eth_sendTransaction'){sends++;return '0xresult';}return null;}} as EIP1193Provider;
 const defaultSdk=bridgeSdkProvider(provider,MAINNET_BRIDGE_CHAINS,async()=>({baseFee:1n,gasPrice:1n}));
 await expect(defaultSdk.request({method:'eth_sendTransaction',params:[{chainId:'0xa4b1'}]})).rejects.toThrow('supported network');expect(sends).toBe(0);
 const sdk=bridgeSdkProvider(provider,MAINNET_BRIDGE_CHAINS,async id=>{gasChain=id;return {baseFee:1n,gasPrice:1n};},'mainnet');
 await expect(sdk.request({method:'eth_sendTransaction',params:[{chainId:'0x13b2'}]})).rejects.toThrow('does not match');expect(sends).toBe(0);
 await sdk.request({method:'eth_sendTransaction',params:[{chainId:'0xa4b1'}]});expect(sends).toBe(1);expect(gasChain).toBe(42161);
 active='0x1';await sdk.request({method:'eth_sendTransaction',params:[{chainId:'0x1'}]});expect(sends).toBe(2);
 active='0x2328';await expect(sdk.request({method:'eth_sendTransaction',params:[{chainId:'0x2328'}]})).rejects.toThrow('supported network');expect(sends).toBe(2);
});

test('both mainnet directions retain interrupted snapshots and resume only the original burn',async()=>{
 const definitions=verifiedMainnetDefinitions(new AppKit()).slice(0,2),wallet='0x1111111111111111111111111111111111111111',burnHash=`0x${'ab'.repeat(32)}`;
 for(const [from,to] of [definitions,[...definitions].reverse()]){
  const record={id:'resume-pilot',wallet,source:from.chainId,destination:to.chainId,recipient:wallet,amount:'0.05',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'running',result:{amount:'0.050000',token:'USDC',state:'pending',provider:'CCTPV2BridgingProvider',source:{address:wallet,chain:from},destination:{address:wallet,chain:to},steps:[{name:'burn',state:'success',txHash:burnHash,data:{checkpoint:50000n}}]}} as BridgeRecord;
  const [restored]=decodeRecords(encodeRecords([record]),definitions,'mainnet');
  expect(restored.status).toBe('interrupted');expect(restored.result.steps[0].txHash).toBe(burnHash);expect(restored.result.steps[0].data).toEqual({checkpoint:50000n});expect(canResume(restored)).toBe(true);
  let retries=0;
  const kit={retryBridge:async(snapshot:typeof record.result)=>{retries++;expect(snapshot).toBe(restored.result);return snapshot;}} as Parameters<typeof resumeBridge>[0];
  await expect(resumeBridge(kit,restored,'0x2222222222222222222222222222222222222222',{})).rejects.toThrow('source wallet');expect(retries).toBe(0);
  await resumeBridge(kit,restored,wallet,{});expect(retries).toBe(1);
  const delivered={...restored,status:'delivered' as const,deliveredAmount:'49999'};
  const [afterReload]=decodeRecords(encodeRecords([delivered]),definitions,'mainnet');expect(afterReload.deliveredAmount).toBe('49999');expect(canResume(afterReload)).toBe(false);
  await expect(resumeBridge(kit,afterReload,wallet,{})).rejects.toThrow('check delivery');expect(retries).toBe(1);
 }
});
