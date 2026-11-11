import {AppKit,type EVMChainDefinition} from '@circle-fin/app-kit';
import {createViemAdapterFromProvider} from '@circle-fin/adapter-viem-v2';
import {createPublicClient,http,fallback,erc20Abi,parseAbi,decodeEventLog,formatUnits,type EIP1193Provider,type Hex,type TransactionReceipt} from 'viem';
import {bridgeWalletChains,reviewedBridgeDefinition,normalizedBridgeDefinition} from './bridge-networks';
import {ensureBridgeWalletNetwork} from './bridge-wallet-network';
import {arcFeeQuote} from './arc-fees';
import {gatewayAmount,gatewayNetworks,gatewayNetwork,gatewayReceipt,type GatewayEnvironment,type GatewayPlan,type GatewayRecord,type GatewayFee,type GatewayRetry,type GatewayWithdrawal} from './gateway';

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
/** Wallet provider that enforces account, reviewed networks and the no-signature-in-preview rule. */
export function guardedGatewayProvider(provider:EIP1193Provider,wallet:string,environment:GatewayEnvironment,writes:boolean,onBroadcast?:(hash:Hex,chainId:number)=>void,onSigned?:()=>void):EIP1193Provider{
 return {request:async(request:{method:string;params?:unknown})=>{
  const accounts=await provider.request({method:'eth_accounts'});
  if(accounts[0]?.toLowerCase()!==wallet)throw Error('The selected wallet changed. Review again.');
  if(request.method==='wallet_switchEthereumChain'){
   const id=Array.isArray(request.params)?request.params[0]?.chainId:undefined;
   const chain=bridgeWalletChains(environment==='testnet').find(c=>id&&BigInt(c.id)===BigInt(id)&&gatewayNetworks(environment).some(n=>n.id===c.id));
   if(!chain)throw Error('Unsupported Gateway network switch.');await ensureBridgeWalletNetwork(provider,chain,environment);return null;
  }
  const signing=/^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData.*|wallet_sendCalls)$/.test(request.method);
  if(signing&&!writes)throw Error('A fee preview must not request a signature.');
  const active=Number(BigInt(await provider.request({method:'eth_chainId'})));
  if(signing&&!gatewayNetworks(environment).some(n=>n.id===active))throw Error('Wallet is on the wrong network.');
  let params=request.params;
  if(request.method==='eth_sendTransaction'){
   const tx=Array.isArray(params)?params[0]:undefined;
   if(!tx||String(tx.from).toLowerCase()!==wallet||tx.chainId&&Number(BigInt(tx.chainId))!==active)throw Error('Transaction account or network changed.');
   if(active===5042||active===5042002){const fees=arcFeeQuote(await reader(active===5042?'Arc':'Arc_Testnet',environment).estimateFeesPerGas());params=[{...tx,gasPrice:undefined,maxFeePerGas:'0x'+fees.maxFeePerGas.toString(16),maxPriorityFeePerGas:'0x'+fees.maxPriorityFeePerGas.toString(16)}];}
  }
  const result=await (provider.request as (r:{method:string;params?:unknown})=>Promise<unknown>)({method:request.method,params});
  if(signing)onSigned?.();
  if(request.method==='eth_sendTransaction'&&typeof result==='string'&&/^0x[0-9a-f]{64}$/i.test(result))onBroadcast?.(result as Hex,active);
  return result;
 }} as EIP1193Provider;
}
export async function gatewaySession(provider:EIP1193Provider,plan:GatewayPlan,writes=false,onBroadcast?:(hash:Hex,chainId:number)=>void,onSigned?:()=>void){
 const kit=gatewayKit();gatewayDefinition(kit,plan.source,plan.environment);gatewayDefinition(kit,plan.destination,plan.environment);
 const source=chainFor(plan.source,plan.environment);
 await ensureBridgeWalletNetwork(provider,source,plan.environment);
 const guarded=guardedGatewayProvider(provider,plan.wallet,plan.environment,writes,onBroadcast,onSigned);
 const adapter=await createViemAdapterFromProvider({provider:guarded,capabilities:{addressContext:'user-controlled'}});
 const sourceDef=gatewayDefinition(kit,plan.source,plan.environment),destinationDef=gatewayDefinition(kit,plan.destination,plan.environment);
 const deposit={from:{adapter,chain:sourceDef},amount:plan.amount,token:'USDC' as const,allowanceStrategy:'authorize' as const,config:{transferSpeed:'STANDARD' as const}};
 const spend={from:{adapter,allocations:{chain:sourceDef,amount:plan.amount}},to:{adapter,chain:destinationDef,recipientAddress:plan.recipient},amount:plan.amount,token:'USDC' as const};
 // Mint-only continuation with Circle's already-issued attestation; no new burn intent is signed.
 const continueMint=async(retry:GatewayRetry)=>{if(plan.action!=='spend')throw Error('Only a spend can continue its destination mint.');return kit.unifiedBalance.spend({to:{adapter,chain:destinationDef,recipientAddress:plan.recipient},amount:plan.amount,token:'USDC',config:{retry}});};
 return {kit,continueMint,estimate:async():Promise<GatewayFee[]>=>plan.action==='deposit'?(await kit.unifiedBalance.estimateDeposit(deposit)).fees:(await kit.unifiedBalance.estimateSpend(spend)).fees,
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

const WITHDRAWAL_ABI=parseAbi(['function withdrawingBalance(address token,address depositor) view returns (uint256)','function withdrawalBlock(address token,address depositor) view returns (uint256)','function withdrawalDelay() view returns (uint256)']);
/** Arbitrum's Gateway contract measures its delay in Ethereum L1 blocks (block.number), not L2 blocks. */
async function contractBlock(name:string,env:GatewayEnvironment){
 const rpc=reader(name,env);
 if(name.startsWith('Arbitrum')){const raw=await rpc.request({method:'eth_getBlockByNumber',params:['latest',false]}) as {l1BlockNumber?:string}|null;if(!raw?.l1BlockNumber||!/^0x[0-9a-f]+$/i.test(raw.l1BlockNumber))throw Error('Arbitrum L1 block number unavailable.');return BigInt(raw.l1BlockNumber);}
 return rpc.getBlockNumber();
}
export async function readGatewayWithdrawal(wallet:string,name:string,environment:GatewayEnvironment):Promise<GatewayWithdrawal>{
 const network=gatewayNetwork(name,environment),def=gatewayDefinition(gatewayKit(),name,environment),rpc=reader(name,environment),address=def.gateway!.contracts.v1!.wallet as Hex;
 if(await rpc.getChainId()!==network.id)throw Error('RPC network mismatch.');
 const [withdrawing,withdrawalBlock,delay,current]=await Promise.all([
  rpc.readContract({address,abi:WITHDRAWAL_ABI,functionName:'withdrawingBalance',args:[network.usdc,wallet as Hex]}),
  rpc.readContract({address,abi:WITHDRAWAL_ABI,functionName:'withdrawalBlock',args:[network.usdc,wallet as Hex]}),
  rpc.readContract({address,abi:WITHDRAWAL_ABI,functionName:'withdrawalDelay'}),contractBlock(name,environment)]);
 return {chain:name,withdrawing,withdrawalBlock,current,delay};
}
export async function readGatewayWithdrawals(wallet:string,environment:GatewayEnvironment){return Promise.all(gatewayNetworks(environment).map(n=>readGatewayWithdrawal(wallet,n.chain,environment)));}
/** The completed removal must transfer exactly the pending amount from the Gateway Wallet to the owner. */
export function verifyGatewayRemoval(receipt:Pick<TransactionReceipt,'status'|'logs'|'from'|'to'>,wallet:string,gatewayWallet:string,token:string,expected:bigint){
 if(receipt.status!=='success'||receipt.from.toLowerCase()!==wallet.toLowerCase()||receipt.to?.toLowerCase()!==gatewayWallet.toLowerCase())return false;
 const moved=receipt.logs.filter(l=>l.address.toLowerCase()===token.toLowerCase()).flatMap(l=>{try{const e=decodeEventLog({abi:erc20Abi,eventName:'Transfer',topics:l.topics,data:l.data});return e.args.from.toLowerCase()===gatewayWallet.toLowerCase()&&e.args.to.toLowerCase()===wallet.toLowerCase()?[e.args.value]:[];}catch{return [];}});
 return moved.length===1&&moved[0]===expected;
}
/** Delayed removal from one network's Gateway Wallet. Only callable where writes are open (testnet today). */
export async function gatewayWithdrawalSession(provider:EIP1193Provider,wallet:string,name:string,environment:GatewayEnvironment,writes:boolean){
 if(!writes)throw Error('Gateway withdrawals are closed in this environment.');
 const kit=gatewayKit(),def=gatewayDefinition(kit,name,environment),network=gatewayNetwork(name,environment),gatewayWallet=def.gateway!.contracts.v1!.wallet;
 await ensureBridgeWalletNetwork(provider,chainFor(name,environment),environment);
 const adapter=await createViemAdapterFromProvider({provider:guardedGatewayProvider(provider,wallet.toLowerCase(),environment,true),capabilities:{addressContext:'user-controlled'}});
 const from={adapter,chain:def};
 return {
  initiate:async(amount:string)=>{
   const raw=gatewayAmount(amount),before=await readGatewayWithdrawal(wallet,name,environment);
   const result=await kit.unifiedBalance.initiateRemoveFund({from,amount:formatUnits(raw,6),token:'USDC'});
   const receipt=await reader(name,environment).waitForTransactionReceipt({hash:result.txHash as Hex,timeout:180000});
   const after=await readGatewayWithdrawal(wallet,name,environment);
   // Initiating again adds to the pending amount and restarts the delay; verify the new pending amount onchain.
   if(receipt.status!=='success'||receipt.to?.toLowerCase()!==gatewayWallet.toLowerCase()||after.withdrawing!==before.withdrawing+raw)throw Error('The withdrawal start could not be verified onchain.');
   return {hash:result.txHash as Hex,after};
  },
  complete:async()=>{
   const before=await readGatewayWithdrawal(wallet,name,environment);
   if(before.withdrawing===0n||before.current<before.withdrawalBlock)throw Error('The withdrawal delay has not elapsed.');
   const result=await kit.unifiedBalance.removeFund({from,token:'USDC'});
   const receipt=await reader(name,environment).waitForTransactionReceipt({hash:result.txHash as Hex,timeout:180000});
   if(!verifyGatewayRemoval(receipt,wallet,gatewayWallet,network.usdc,before.withdrawing))throw Error('The completed withdrawal could not be verified onchain.');
   return {hash:result.txHash as Hex,amount:before.withdrawing};
  },
 };
}
