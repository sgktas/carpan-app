import {decodeEventLog,erc20Abi,formatUnits,isAddress,parseUnits,type Hex,type TransactionReceipt} from 'viem';
import {BRIDGE_NETWORK_FACTS, type BridgeNetworkFact} from './bridge-networks';

export type GatewayEnvironment='testnet'|'mainnet';
export type GatewayAction='deposit'|'spend';
export type GatewayPlan={environment:GatewayEnvironment;action:GatewayAction;wallet:Hex;source:string;destination:string;recipient:Hex;amount:string};
export type GatewayFee={type:string;token:string;amount:string};
export type GatewayRecord={version:1;sdkRevision?:2;plan:GatewayPlan;state:'signing'|'uncertain'|'pending'|'confirmed'|'failed'|'not-submitted';createdAt:number;minBlock:string;hash?:Hex;received?:string;gas?:string;gasSymbol?:string};
const reviewed=['Arc','Base','Arbitrum','Ethereum','Arc_Testnet','Base_Sepolia','Arbitrum_Sepolia','Ethereum_Sepolia'];
export const GATEWAY_MAINNET_WRITES=false; // Enable only after the testnet wallet acceptance run.
export const gatewayNetworks=(environment:GatewayEnvironment)=>BRIDGE_NETWORK_FACTS.filter(f=>f.testnet===(environment==='testnet')&&reviewed.includes(f.chain));
export function gatewayNetwork(chain:string,environment:GatewayEnvironment):BridgeNetworkFact{const n=gatewayNetworks(environment).find(f=>f.chain===chain);if(!n)throw Error('Unsupported Gateway network.');return n;}
export function gatewayAmount(value:string,allowZero=false):bigint{
 if(!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))throw Error('Enter a USDC amount with at most 6 decimal places.');
 const n=parseUnits(value,6);if(n<0n||(!allowZero&&n===0n)||n>=1n<<256n)throw Error('Invalid USDC amount.');return n;
}
export function gatewayPlan(input:GatewayPlan):GatewayPlan{
 if(!['deposit','spend'].includes(input.action)||!isAddress(input.wallet)||!isAddress(input.recipient)||/^0x0{40}$/i.test(input.wallet)||/^0x0{40}$/i.test(input.recipient))throw Error('Invalid wallet or recipient.');
 gatewayNetwork(input.source,input.environment);gatewayNetwork(input.destination,input.environment);
 if(input.action==='deposit'&&(input.recipient.toLowerCase()!==input.wallet.toLowerCase()||input.destination!==input.source))throw Error('Deposits must credit your own balance on the selected network.');
 return {...input,wallet:input.wallet.toLowerCase() as Hex,recipient:input.recipient.toLowerCase() as Hex,amount:formatUnits(gatewayAmount(input.amount),6)};
}
export function gatewayFeeTotals(fees:GatewayFee[]):Record<string,bigint>{
 const totals:Record<string,bigint>={};
 for(const f of fees){if(!/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(f.token)||!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(f.amount))throw Error('Invalid fee estimate.');totals[f.token]=(totals[f.token]||0n)+parseUnits(f.amount,18);}
 return totals;
}
export function gatewayFeesWithin(fees:GatewayFee[],reviewedFees:GatewayFee[]){const next=gatewayFeeTotals(fees),prior=gatewayFeeTotals(reviewedFees);return Object.entries(next).every(([token,raw])=>raw<=(prior[token]??-1n));}
export function gatewayKey(wallet:string,environment:GatewayEnvironment){return `carpan.gateway.v1.${environment}.${wallet.toLowerCase()}`;}
export function restoreGatewayRecord(value:string|null,wallet:string,environment:GatewayEnvironment):GatewayRecord|null{
 if(!value)return null;const r=JSON.parse(value) as GatewayRecord;
 if(r.version!==1||!['signing','uncertain','pending','confirmed','failed','not-submitted'].includes(r.state)||!Number.isSafeInteger(r.createdAt)||r.createdAt<=0||!/^\d{1,30}$/.test(r.minBlock))throw Error('Invalid saved Gateway operation.');
 const plan=gatewayPlan(r.plan);if(plan.wallet!==wallet.toLowerCase()||plan.environment!==environment||r.hash&&!/^0x[0-9a-f]{64}$/i.test(r.hash))throw Error('Gateway operation belongs to another account or environment.');
 if(['confirmed','failed','pending'].includes(r.state)&&!r.hash)throw Error('Saved operation has no transaction evidence.');
 // Local pre-revision-2 builds supplied explicit address fields to user-controlled
 // adapters. App Kit rejects both operations at validation, before provider signing.
 // Never extend this migration to newer checkpoints or any operation with a hash.
 const preflightOnly=r.sdkRevision===undefined&&!r.hash;
 return {version:1,sdkRevision:r.sdkRevision,plan,state:preflightOnly?'not-submitted':r.hash?'pending':'uncertain',createdAt:r.createdAt,minBlock:r.minBlock,hash:r.hash};
}
/** Local success is always backed by a canonical receipt, never by a balance change alone. */
export function gatewayReceipt(record:GatewayRecord,receipt:TransactionReceipt,token:Hex,depositRecipient:Hex):GatewayRecord{
 if(receipt.transactionHash.toLowerCase()!==record.hash?.toLowerCase())throw Error('Receipt hash mismatch.');
 if(receipt.blockNumber<BigInt(record.minBlock))throw Error('This receipt predates the operation.');
 const gas=formatUnits(receipt.gasUsed*receipt.effectiveGasPrice,18),gasSymbol=gatewayNetwork(record.plan.action==='deposit'?record.plan.source:record.plan.destination,record.plan.environment).symbol;
 // A failed destination mint may be resumable; it is not proof that the source spend was cancelled.
 if(receipt.status!=='success')return {...record,state:record.plan.action==='deposit'?'failed':'uncertain',gas,gasSymbol};
 const expectedTo=record.plan.action==='deposit'?depositRecipient:record.plan.recipient;
 const matches=receipt.logs.filter(l=>!l.removed&&l.address.toLowerCase()===token.toLowerCase()).flatMap(l=>{try{const e=decodeEventLog({abi:erc20Abi,eventName:'Transfer',topics:l.topics,data:l.data});return e.args.to.toLowerCase()===expectedTo.toLowerCase()&&(record.plan.action==='spend'||e.args.from.toLowerCase()===record.plan.wallet)?[e.args.value]:[];}catch{return [];}});
 if(matches.length!==1||matches[0]!==gatewayAmount(record.plan.amount))throw Error('The receipt does not prove the requested USDC amount and recipient.');
 return {...record,state:'confirmed',received:formatUnits(matches[0],6),gas,gasSymbol};
}
