/* carpan-localized */
import { t } from './i18n/index';
import {toHex,type Chain,type EIP1193Provider} from 'viem';
import type {BridgeEnvironment} from './arc-bridge';
import {BRIDGE_NETWORK_FACTS} from './bridge-networks';

function allowed(chain:Chain,environment:BridgeEnvironment){const testnet=environment==='testnet';return !!chain.testnet===testnet&&BRIDGE_NETWORK_FACTS.some(f=>f.id===chain.id&&f.testnet===testnet&&f.symbol===chain.nativeCurrency.symbol);}

function unknownChain(error:unknown,depth=0):boolean{
 if(depth>6||!error||typeof error!=='object')return false;
 const e=error as {code?:unknown;cause?:unknown;data?:{originalError?:unknown}};
 return e.code===4902||unknownChain(e.cause,depth+1)||unknownChain(e.data?.originalError,depth+1);
}
/** Register only the configured test network, before any source transfer. */
export async function ensureBridgeWalletNetwork(provider:EIP1193Provider,chain:Chain,environment:BridgeEnvironment='testnet'){
 if(!allowed(chain,environment))throw new Error(t("Köprü yalnızca seçilen ortamın yapılandırılmış USDC ağlarında çalışır."));
 const chainId=toHex(chain.id);
 // SDK adapters switch again during retry. Already being on the target network
 // is sufficient; a redundant wallet prompt can fail even after registration.
 const current=await provider.request({method:'eth_chainId'});
 if(BigInt(current)===BigInt(chain.id))return;
 try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}
 catch(error){
  if(!unknownChain(error))throw error;
  await provider.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:chain.name,nativeCurrency:chain.nativeCurrency,rpcUrls:[...chain.rpcUrls.default.http],blockExplorerUrls:chain.blockExplorers?[chain.blockExplorers.default.url]:[]}]});
  await provider.request({method:'wallet_switchEthereumChain',params:[{chainId}]});
 }
 const active=await provider.request({method:'eth_chainId'});
 if(BigInt(active)!==BigInt(chain.id))throw new Error(t("{0} ağ geçişi tamamlanmadı.", [chain.name]));
}

type GasPriceSnapshot={baseFee:bigint;gasPrice:bigint};
/** Give Arbitrum's changing base fee headroom without changing the transfer. */
export function bufferedArbitrumFees(tx:Record<string,unknown>,snapshot:GasPriceSnapshot){
 if(snapshot.baseFee<=0n||snapshot.gasPrice<=0n)throw new Error(t("Güncel Arbitrum ağ ücreti alınamadı."));
 const floor=2n*(snapshot.baseFee>snapshot.gasPrice?snapshot.baseFee:snapshot.gasPrice);
 const quantity=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-f]+$/i.test(value)?BigInt(value):0n;
 if(tx.gasPrice!==undefined){
  if(tx.maxFeePerGas!==undefined||tx.maxPriorityFeePerGas!==undefined)throw new Error(t("Çakışan ağ ücreti alanları."));
  return {...tx,gasPrice:toHex(quantity(tx.gasPrice)>floor?quantity(tx.gasPrice):floor)};
 }
 const tip=quantity(tx.maxPriorityFeePerGas),existing=quantity(tx.maxFeePerGas),minimum=floor+tip;
 return {...tx,maxFeePerGas:toHex(existing>minimum?existing:minimum),maxPriorityFeePerGas:toHex(tip)};
}

/** SDK calls use the same checked network setup as preflight. No automatic send retry. */
export function bridgeSdkProvider(provider:EIP1193Provider,chains:readonly Chain[],loadGas:(chainId:number)=>Promise<GasPriceSnapshot>,environment:BridgeEnvironment='testnet'):EIP1193Provider{
 type RawRequest={method:string;params?:unknown};
 const forward=(request:RawRequest)=>(provider.request as unknown as (request:RawRequest)=>Promise<unknown>)(request);
 return {request:async(request:RawRequest)=>{
  if(request.method==='wallet_switchEthereumChain'){
   const param=Array.isArray(request.params)?request.params[0]:undefined;
   if(!param||typeof param.chainId!=='string')throw new Error(t("Geçersiz ağ geçişi."));
   const chainId=BigInt(param.chainId),chain=chains.find(c=>BigInt(c.id)===chainId);
   if(!chain)throw new Error(t("Desteklenmeyen köprü ağı."));
   await ensureBridgeWalletNetwork(provider,chain,environment);return null;
  }
  if(request.method==='eth_sendTransaction'){
   const active=BigInt(await provider.request({method:'eth_chainId'}));
   if(!chains.some(c=>allowed(c,environment)&&BigInt(c.id)===active))throw new Error(t("İşlem için seçilen ortamın desteklenen ağına geç."));
   const tx=Array.isArray(request.params)?request.params[0] as Record<string,unknown>:undefined;
   if(!tx||typeof tx!=='object')throw new Error(t("Geçersiz işlem isteği."));
   if(tx.chainId!==undefined&&(typeof tx.chainId!=='string'||BigInt(tx.chainId)!==active))throw new Error(t("İşlem ağı cüzdan ağıyla uyuşmuyor."));
   if(active===421614n||active===42161n){
    const updated=bufferedArbitrumFees(tx as Record<string,unknown>,await loadGas(Number(active)));
    // The wallet still presents the refreshed fee to the human for approval.
    return forward({method:'eth_sendTransaction',params:[updated]});
   }
  }
  return forward(request);
 }} as EIP1193Provider;
}
