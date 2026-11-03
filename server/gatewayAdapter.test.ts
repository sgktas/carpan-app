import {test,expect} from 'bun:test';
import {AppKit} from '@circle-fin/app-kit';
import {createViemAdapterFromProvider} from '@circle-fin/adapter-viem-v2';
import type {EIP1193Provider} from 'viem';
const wallet='0x1111111111111111111111111111111111111111';

test('legacy explicit-address browser-wallet parameters fail SDK validation before any signature or submission',async()=>{
 let signed=0;
 const provider={request:async({method}:{method:string})=>{
  if(method==='eth_accounts'||method==='eth_requestAccounts')return [wallet];
  if(method==='eth_chainId')return '0x4cef52';
  if(/sign|send/i.test(method))signed++;
  throw Error('No external wallet request is allowed in this test: '+method);
 }} as EIP1193Provider;
 const adapter=await createViemAdapterFromProvider({provider,capabilities:{addressContext:'user-controlled'}}),kit=new AppKit();
 expect(adapter.capabilities.addressContext).toBe('user-controlled');
 await expect(kit.unifiedBalance.deposit({from:{adapter,address:wallet,chain:'Arc_Testnet'},amount:'0.1',token:'USDC'} as never)).rejects.toThrow('Address should not be provided');
 await expect(kit.unifiedBalance.spend({from:{adapter,address:wallet,allocations:{chain:'Arc_Testnet',amount:'0.1'}},to:{adapter,address:wallet,chain:'Arc_Testnet',recipientAddress:wallet},amount:'0.1',token:'USDC'} as never)).rejects.toThrow('Address should not be provided');
 expect(signed).toBe(0);
});
