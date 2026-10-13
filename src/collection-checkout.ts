import {decodeEventLog,erc20Abi,isAddress,zeroAddress,type Hex,type TransactionReceipt} from 'viem';
import type {PublicCollection} from './collections';
export const CHECKOUT_CHAIN=5042, CHECKOUT_USDC='0x3600000000000000000000000000000000000000' as const;
export type CheckoutPlan={reference:string;recipient:Hex;raw6:bigint;rounded:boolean;fingerprint:string};
export type CheckoutRecord={version:1;reference:string;recipient:Hex;wallet:Hex;raw6:string;status:'signing'|'pending'|'confirmed'|'failed'|'uncertain';hash?:Hex;createdAt:string;gasRaw18?:string};
export function checkoutPlan(data:PublicCollection):CheckoutPlan{
 if(data.chainId!==CHECKOUT_CHAIN||data.token.toLowerCase()!==CHECKOUT_USDC||data.decimals!==6||!isAddress(data.recipient)||data.recipient.toLowerCase()===zeroAddress||data.paymentState!=='open')throw Error('Payment request is not open on Arc Mainnet USDC.');
 if(!/^\d{1,36}$/.test(data.remainingRaw18)||!/^\d{1,18}$/.test(data.expectedRaw6))throw Error('Invalid payment amount.');
 const raw18=BigInt(data.remainingRaw18),raw6=(raw18+10n**12n-1n)/10n**12n;
 if(raw6<=0n||raw6>BigInt(data.expectedRaw6))throw Error('Invalid outstanding payment amount.');
 return {reference:data.reference,recipient:data.recipient as Hex,raw6,rounded:raw18%10n**12n!==0n,fingerprint:JSON.stringify([data.reference,data.recipient.toLowerCase(),data.expectedRaw6,data.remainingRaw18,data.paymentState])};
}
export function checkoutBudget(raw6:bigint,erc20Balance:bigint,nativeBalance:bigint,gas:bigint,maxFee:bigint){
 if(raw6<=0n||gas<=0n||maxFee<=0n)throw Error('A valid amount and network fee are required.');
 const gasLimit=(gas*120n+99n)/100n,gasReserve=gasLimit*maxFee;
 // Arc native and ERC-20 USDC represent the same balance. Never add them.
 return {gasLimit,gasReserve,ready:erc20Balance>=raw6&&nativeBalance>=raw6*10n**12n+gasReserve};
}
export function decodeCheckoutRecord(raw:string|null,data:PublicCollection):CheckoutRecord|null{
 if(!raw)return null;if(raw.length>4000)throw Error('Invalid saved payment record.');
 const r=JSON.parse(raw) as CheckoutRecord;
 if(r.version!==1||r.reference!==data.reference||r.recipient.toLowerCase()!==data.recipient.toLowerCase()||!isAddress(r.wallet)||r.wallet.toLowerCase()===zeroAddress||!/^\d{1,18}$/.test(r.raw6)||BigInt(r.raw6)<=0n||BigInt(r.raw6)>BigInt(data.expectedRaw6)||!['signing','pending','confirmed','failed','uncertain'].includes(r.status)||!Number.isFinite(Date.parse(r.createdAt))||r.hash&&!/^0x[0-9a-f]{64}$/i.test(r.hash)||r.gasRaw18!==undefined&&!/^\d{1,36}$/.test(r.gasRaw18))throw Error('Saved payment does not match this request.');
 if(['pending','confirmed','failed'].includes(r.status)&&!r.hash)throw Error('Saved payment is missing its transaction hash.');
 return {...r,status:r.status==='signing'?'uncertain':r.status==='confirmed'||r.status==='failed'?'pending':r.status};
}
export function verifyCheckoutReceipt(record:CheckoutRecord,receipt:TransactionReceipt){
 if(!record.hash||receipt.transactionHash.toLowerCase()!==record.hash.toLowerCase()||receipt.from.toLowerCase()!==record.wallet.toLowerCase()||receipt.to?.toLowerCase()!==CHECKOUT_USDC)throw Error('Transaction does not match the recorded payment.');
 if(receipt.status!=='success')return {status:'failed' as const,gasRaw18:(receipt.gasUsed*receipt.effectiveGasPrice).toString()};
 let total=0n;
 for(const log of receipt.logs){if(log.address.toLowerCase()!==CHECKOUT_USDC||log.removed)continue;try{const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});if(event.eventName==='Transfer'&&event.args.from.toLowerCase()===record.wallet.toLowerCase()&&event.args.to.toLowerCase()===record.recipient.toLowerCase())total+=event.args.value;}catch{/* Native mirror and unrelated events are not additional payments. */}}
 if(total!==BigInt(record.raw6))throw Error('The receipt does not prove the expected USDC recipient and amount.');
 return {status:'confirmed' as const,gasRaw18:(receipt.gasUsed*receipt.effectiveGasPrice).toString()};
}
export function walletRejected(error:unknown):boolean{let current=error as {code?:number;cause?:unknown};for(let i=0;i<6&&current;i++,current=current.cause as typeof current){if(current.code===4001)return true;}return false;}
