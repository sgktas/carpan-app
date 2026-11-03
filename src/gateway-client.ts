import {AppKit,type EVMChainDefinition} from '@circle-fin/app-kit';
import {createViemAdapterFromProvider} from '@circle-fin/adapter-viem-v2';
import {createPublicClient,http,fallback,erc20Abi,type EIP1193Provider,type Hex} from 'viem';
import {bridgeWalletChains,reviewedBridgeDefinition,normalizedBridgeDefinition} from './bridge-networks';
import {ensureBridgeWalletNetwork} from './bridge-wallet-network';
import {arcFeeQuote} from './arc-fees';
import {gatewayAmount,gatewayNetworks,gatewayNetwork,gatewayReceipt,type GatewayEnvironment,type GatewayPlan,type GatewayRecord,type GatewayFee} from './gateway';

export const gatewayKit=()=>new AppKit();
export function gatewayDefinition(kit:AppKit,name:string,environment:GatewayEnvironment){
 const fact=gatewayNetwork(name,environment),def=kit.unifiedBalance.getSupportedChains('USDC').find(c=>c.type==='evm'&&c.chainId===fact.id) as EVMChainDefinition|undefined;
 if(!def||!reviewedBridgeDefinition(def,environment==='testnet')||!def.gateway?.contracts.v1?.wallet||!def.gateway?.contracts.v1?.minter)throw Error('Gateway SDK network metadata could not be verified.');
 return normalizedBridgeDefinition(def);
}
const chainFor=(name:string,env:GatewayEnvironment)=>bridgeWalletChains(env==='testnet').find(c=>c.id===gatewayNetwork(name,env).id)!;
function reader(name:string,env:GatewayEnvironment){const chain=chainFor(name,env);return createPublicClient({chain,transport:fallback(chain.rpcUrls.default.http.map(url=>http(url,{timeout:12000,retryCount:0})),{retryCount:0})});}
export async function gatewayStartBlock(plan:GatewayPlan){const name=plan.action==='deposit'?plan.source:plan.destination,rpc=reader(name,plan.environment);if(await rpc.getChainId()!==gatewayNetwork(name,plan.environment).id)throw Error('RPC network mismatch.');return ((await rpc.getBlockNumber())+1n).toString();}
export async function readGatewayBalance(wallet:string,environment:GatewayEnvironment){
 const kit=gatewayKit(),networks=gatewayNetworks(environment);networks.forEach(n=>gatewayDefinition(kit,n.chain,environment));
 const result=await kit.unifiedBalance.getBalances({sources:{address:wallet,chains:networks.map(n=>gatewayDefinition(kit,n.chain,environment))},token:'USDC',networkType:environment,includePending:true});
 if(result.token!=='USDC')throw Error('Unexpected Gateway asset.');
 const rows=result.breakdown.flatMap(a=>{if(a.depositor.toLowerCase()!==wallet.toLowerCase())throw Error('Unexpected Gateway account.');return a.breakdown.map(c=>{gatewayNetwork(c.chain,environment);return {chain:c.chain,confirmed:gatewayAmount(c.confirmedBalance,true),pending:gatewayAmount(c.pendingBalance||'0',true)};});});
 if(new Set(rows.map(c=>c.chain)).size!==rows.length)throw Error('Duplicate Gateway chain balance.');
 const total=gatewayAmount(result.totalConfirmedBalance,true),pending=gatewayAmount(result.totalPendingBalance||'0',true);
 if(rows.reduce((n,r)=>n+r.confirmed,0n)!==total||rows.reduce((n,r)=>n+r.pending,0n)!==pending)throw Error('Gateway balance totals could not be reconciled.');
 return {wallet,environment,rows,total,pending,at:Date.now()};
}
export async function gatewaySession(provider:EIP1193Provider,plan:GatewayPlan,writes=false,onBroadcast?:(hash:Hex,chainId:number)=>void,onSigned?:()=>void){
 const kit=gatewayKit();gatewayDefinition(kit,plan.source,plan.environment);gatewayDefinition(kit,plan.destination,plan.environment);
 const source=chainFor(plan.source,plan.environment);
 await ensureBridgeWalletNetwork(provider,source,plan.environment);
 const guarded={request:async(request:{method:string;params?:unknown})=>{
  const accounts=await provider.request({method:'eth_accounts'});
  if(accounts[0]?.toLowerCase()!==plan.wallet)throw Error('The selected wallet changed. Review again.');
  if(request.method==='wallet_switchEthereumChain'){
   const id=Array.isArray(request.params)?request.params[0]?.chainId:undefined;
   const chain=bridgeWalletChains(plan.environment==='testnet').find(c=>id&&BigInt(c.id)===BigInt(id)&&gatewayNetworks(plan.environment).some(n=>n.id===c.id));
   if(!chain)throw Error('Unsupported Gateway network switch.');await ensureBridgeWalletNetwork(provider,chain,plan.environment);return null;
  }
  const signing=/^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData.*|wallet_sendCalls)$/.test(request.method);
  if(signing&&!writes)throw Error('A fee preview must not request a signature.');
  const active=Number(BigInt(await provider.request({method:'eth_chainId'})));
  if(signing&&!gatewayNetworks(plan.environment).some(n=>n.id===active))throw Error('Wallet is on the wrong network.');
  let params=request.params;
  if(request.method==='eth_sendTransaction'){
   const tx=Array.isArray(params)?params[0]:undefined;
   if(!tx||String(tx.from).toLowerCase()!==plan.wallet||tx.chainId&&Number(BigInt(tx.chainId))!==active)throw Error('Transaction account or network changed.');
   if(active===5042||active===5042002){const fees=arcFeeQuote(await reader(active===5042?'Arc':'Arc_Testnet',plan.environment).estimateFeesPerGas());params=[{...tx,gasPrice:undefined,maxFeePerGas:'0x'+fees.maxFeePerGas.toString(16),maxPriorityFeePerGas:'0x'+fees.maxPriorityFeePerGas.toString(16)}];}
  }
  const result=await (provider.request as (r:{method:string;params?:unknown})=>Promise<unknown>)({method:request.method,params});
  if(signing)onSigned?.();
  if(request.method==='eth_sendTransaction'&&typeof result==='string'&&/^0x[0-9a-f]{64}$/i.test(result))onBroadcast?.(result as Hex,active);
  return result;
 }} as EIP1193Provider;
 const adapter=await createViemAdapterFromProvider({provider:guarded,capabilities:{addressContext:'user-controlled'}});
 const sourceDef=gatewayDefinition(kit,plan.source,plan.environment),destinationDef=gatewayDefinition(kit,plan.destination,plan.environment);
 const deposit={from:{adapter,chain:sourceDef},amount:plan.amount,token:'USDC' as const,allowanceStrategy:'authorize' as const,config:{transferSpeed:'STANDARD' as const}};
 const spend={from:{adapter,allocations:{chain:sourceDef,amount:plan.amount}},to:{adapter,chain:destinationDef,recipientAddress:plan.recipient},amount:plan.amount,token:'USDC' as const};
 return {kit,estimate:async():Promise<GatewayFee[]>=>plan.action==='deposit'?(await kit.unifiedBalance.estimateDeposit(deposit)).fees:(await kit.unifiedBalance.estimateSpend(spend)).fees,
  execute:async()=>plan.action==='deposit'?kit.unifiedBalance.deposit(deposit):kit.unifiedBalance.spend(spend)};
}
export async function checkGatewayRecord(record:GatewayRecord){
 if(!record.hash)throw Error('Enter the transaction hash from your wallet.');
 const name=record.plan.action==='deposit'?record.plan.source:record.plan.destination,network=gatewayNetwork(name,record.plan.environment),rpc=reader(name,record.plan.environment);
 if(await rpc.getChainId()!==network.id)throw Error('RPC network mismatch.');
 const receipt=await rpc.getTransactionReceipt({hash:record.hash}),block=await rpc.getBlock({blockNumber:receipt.blockNumber}),def=gatewayDefinition(gatewayKit(),name,record.plan.environment);
 if(receipt.blockHash!==block.hash)throw Error('Receipt block is no longer canonical.');
 const expectedContract=record.plan.action==='deposit'?def.gateway!.contracts.v1!.wallet:def.gateway!.contracts.v1!.minter;
 if(receipt.to?.toLowerCase()!==expectedContract.toLowerCase()||receipt.from.toLowerCase()!==record.plan.wallet)throw Error('Receipt is not the selected Gateway operation.');
 const decimals=await rpc.readContract({address:network.usdc,abi:erc20Abi,functionName:'decimals'});if(decimals!==6)throw Error('USDC precision mismatch.');
 return gatewayReceipt(record,receipt,network.usdc,def.gateway!.contracts.v1!.wallet.toLowerCase() as Hex);
}
