import {decodeEventLog,erc20Abi,type TransactionReceipt} from 'viem';
import {CARPAN_INVOICE_ABI} from './components/invoices/invoiceAbi';
import {CONTRACT_ADDRESS,USDC_ADDRESS} from './components/invoices/invoiceConfig';
export type PaymentReceiptData={hash:string;reference:string;payer:string;recipient:string;raw6:string;gasRaw18:string;block:string;paidAt?:string;verifiedAt:string};
export function invoicePaymentEvidence(receipt:TransactionReceipt,key:string,invoice:{recipient:string;amount:bigint;status:number}):PaymentReceiptData{
 if(receipt.status!=='success'||receipt.to?.toLowerCase()!==CONTRACT_ADDRESS||invoice.status!==1)throw Error('Payment settlement could not be verified.');
 let matches=0;let total=0n;
 for(const log of receipt.logs){if(log.removed)continue;
  if(log.address.toLowerCase()===CONTRACT_ADDRESS){try{const e=decodeEventLog({abi:CARPAN_INVOICE_ABI,data:log.data,topics:log.topics});if(e.eventName==='InvoicePaid'&&e.args.invoiceKey.toLowerCase()===key.toLowerCase()&&e.args.payer.toLowerCase()===receipt.from.toLowerCase()&&e.args.recipient.toLowerCase()===invoice.recipient.toLowerCase()&&e.args.amount===invoice.amount)matches++;}catch{/* Unrelated event. */}}
  if(log.address.toLowerCase()===USDC_ADDRESS){try{const e=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});if(e.eventName==='Transfer'&&e.args.from.toLowerCase()===receipt.from.toLowerCase()&&e.args.to.toLowerCase()===invoice.recipient.toLowerCase())total+=e.args.value;}catch{/* Unrelated event. */}}
 }
 if(matches!==1||total!==invoice.amount)throw Error('Receipt does not prove this USDC payment.');
 return {hash:receipt.transactionHash,reference:key,payer:receipt.from,recipient:invoice.recipient,raw6:invoice.amount.toString(),gasRaw18:(receipt.gasUsed*receipt.effectiveGasPrice).toString(),block:receipt.blockNumber.toString(),verifiedAt:new Date().toISOString()};
}
export function receiptText(r:PaymentReceiptData,amount:string,gas:string){return ['CARPAN · USDC payment receipt','Status: Confirmed on Arc Mainnet',`Amount: ${amount} USDC`,`From: ${r.payer}`,`To: ${r.recipient}`,`Reference: ${r.reference}`,`Transaction: ${r.hash}`,`Block: ${r.block}`,`Payment time (UTC): ${r.paidAt||'Unavailable'}`,`Verified at: ${r.verifiedAt}`,`Network fee: ${gas} USDC`,'Onchain payment acknowledgement; not a tax invoice or accounting posting.'].join('\n');}
