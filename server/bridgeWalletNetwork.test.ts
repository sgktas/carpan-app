import {describe,expect,test} from 'bun:test';
import {arbitrumSepolia,mainnet} from 'viem/chains';
import type {EIP1193Provider} from 'viem';
import {bridgeSdkProvider,bufferedArbitrumFees,ensureBridgeWalletNetwork} from '../src/bridge-wallet-network';
describe('bridge wallet network preflight',()=>{
 test('unknown destination is added with configured metadata before retrying switch',async()=>{
  const calls:{method:string;params?:unknown}[]=[];let switches=0;
  const provider={request:async(req:{method:string;params?:unknown})=>{calls.push(req);if(req.method==='wallet_switchEthereumChain'&&switches++===0)throw {code:4902};return req.method==='eth_chainId'?(switches>=2?'0x66eee':'0x1'):null;}} as EIP1193Provider;
  await ensureBridgeWalletNetwork(provider,arbitrumSepolia);
  expect(calls.map(c=>c.method)).toEqual(['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain','eth_chainId']);
  expect(calls[2].params).toEqual([{chainId:'0x66eee',chainName:arbitrumSepolia.name,nativeCurrency:arbitrumSepolia.nativeCurrency,rpcUrls:[...arbitrumSepolia.rpcUrls.default.http],blockExplorerUrls:[arbitrumSepolia.blockExplorers.default.url]}]);
 });
 test('user refusal aborts without adding or sending transactions',async()=>{const calls:string[]=[];const provider={request:async(req:{method:string})=>{calls.push(req.method);if(req.method==='eth_chainId')return '0x1';throw {code:4001};}} as EIP1193Provider;await expect(ensureBridgeWalletNetwork(provider,arbitrumSepolia)).rejects.toEqual({code:4001});expect(calls).toEqual(['eth_chainId','wallet_switchEthereumChain']);});
 test('wrapped unknown-chain error is supported; false switch and mainnet are rejected',async()=>{
  let count=0;const provider={request:async(req:{method:string})=>{if(req.method==='wallet_switchEthereumChain'&&count++===0)throw {cause:{data:{originalError:{code:4902}}}};return req.method==='eth_chainId'?'0x1':null;}} as EIP1193Provider;
  await expect(ensureBridgeWalletNetwork(provider,arbitrumSepolia)).rejects.toThrow('did not complete');await expect(ensureBridgeWalletNetwork(provider,mainnet)).rejects.toThrow('USDC networks');
 });
 test('SDK repeated switch skips the wallet prompt when target is already active',async()=>{
  const calls:string[]=[];const provider={request:async(req:{method:string})=>{calls.push(req.method);if(req.method==='eth_chainId')return '0x66eee';throw new Error('must not prompt');}} as EIP1193Provider;
  const sdk=bridgeSdkProvider(provider,[arbitrumSepolia],async()=>({baseFee:1n,gasPrice:1n}));
  await sdk.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x66eee'}]});expect(calls).toEqual(['eth_chainId']);
 });
 test('Arbitrum fees cover observed base-fee rise and preserve transaction identity',()=>{
  const tx={from:'0xsender',to:'0xcontract',data:'0xabcd',value:'0x0',nonce:'0x2',gas:'0x186a0',maxFeePerGas:'0x39baf80'};
  const next=bufferedArbitrumFees(tx,{baseFee:61414000n,gasPrice:60870000n});
  expect(BigInt(next.maxFeePerGas)).toBe(122828000n);expect(next.maxPriorityFeePerGas).toBe('0x0');
  for(const field of ['from','to','data','value','nonce','gas'])expect(next[field]).toBe(tx[field as keyof typeof tx]);
  expect(tx.maxFeePerGas).toBe('0x39baf80');
  expect(bufferedArbitrumFees({gasPrice:'0x1'},{baseFee:100n,gasPrice:110n}).gasPrice).toBe('0xdc');
  expect(()=>bufferedArbitrumFees({}, {baseFee:0n,gasPrice:1n})).toThrow('Could not retrieve');
 });
 test('fee refresh rejection never resubmits; wrong chain never sends',async()=>{
  let sends=0;const provider={request:async(req:{method:string})=>{if(req.method==='eth_chainId')return '0x66eee';if(req.method==='eth_sendTransaction'){sends++;throw {code:4001};}return null;}} as EIP1193Provider;
  const sdk=bridgeSdkProvider(provider,[arbitrumSepolia],async()=>({baseFee:100n,gasPrice:110n}));
  await expect(sdk.request({method:'eth_sendTransaction',params:[{from:'0xsender',to:'0xcontract',chainId:'0x1'}]})).rejects.toThrow('does not match');expect(sends).toBe(0);
  await expect(sdk.request({method:'eth_sendTransaction',params:[{from:'0xsender',to:'0xcontract'}]})).rejects.toEqual({code:4001});expect(sends).toBe(1);
 });
});
