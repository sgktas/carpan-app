import {test,expect} from 'bun:test';
import {encodeEventTopics,encodeAbiParameters,erc20Abi,type TransactionReceipt} from 'viem';
import {invoicePaymentEvidence,receiptText} from '../src/payment-receipt';
import {CARPAN_INVOICE_ABI} from '../src/components/invoices/invoiceAbi';
import {CONTRACT_ADDRESS,USDC_ADDRESS} from '../src/components/invoices/invoiceConfig';
const payer=('0x'+'11'.repeat(20)) as `0x${string}`,recipient=('0x'+'22'.repeat(20)) as `0x${string}`,key=('0x'+'aa'.repeat(32)) as `0x${string}`,hash=('0x'+'bb'.repeat(32)) as `0x${string}`;
const invoice={recipient,amount:100000n,status:1};
function receipt():TransactionReceipt{return {status:'success',transactionHash:hash,from:payer,to:CONTRACT_ADDRESS,blockNumber:12n,gasUsed:89330n,effectiveGasPrice:21500000000n,logs:[
 {address:CONTRACT_ADDRESS,topics:encodeEventTopics({abi:CARPAN_INVOICE_ABI,eventName:'InvoicePaid',args:{invoiceKey:key,payer,recipient}}),data:encodeAbiParameters([{type:'uint256'}],[100000n])},
 {address:USDC_ADDRESS,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:payer,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[100000n])},
 ]} as unknown as TransactionReceipt;}
test('simple receipt requires both matching invoice settlement and exact USDC transfer; gas remains separate',()=>{
 const result=invoicePaymentEvidence(receipt(),key,invoice);expect(result).toMatchObject({raw6:'100000',gasRaw18:'1920595000000000',payer,recipient,block:'12',hash});
 const text=receiptText(result,'0.1','0.001920595');expect(text).toContain('Amount: 0.1 USDC');expect(text).toContain('Network fee: 0.001920595 USDC');expect(text).toContain('not a tax invoice');expect(text).toContain('Payment time (UTC): Unavailable');
});
test('revert, approval-only receipt, wrong invoice, receiver, amount or contract never produce a successful receipt',()=>{
 for(const bad of [{...receipt(),status:'reverted'},{...receipt(),to:recipient},{...receipt(),logs:[]},{...receipt(),logs:receipt().logs.slice(1)},{...receipt(),logs:receipt().logs.slice(0,1)}])expect(()=>invoicePaymentEvidence(bad as TransactionReceipt,key,invoice)).toThrow();
 for(const bad of [{...invoice,status:0},{...invoice,amount:100001n},{...invoice,recipient:payer}])expect(()=>invoicePaymentEvidence(receipt(),key,bad)).toThrow();
 expect(()=>invoicePaymentEvidence(receipt(),'0x'+'cc'.repeat(32),invoice)).toThrow();
 const duplicate=receipt();duplicate.logs.push(duplicate.logs[0]);expect(()=>invoicePaymentEvidence(duplicate,key,invoice)).toThrow();
 const removed=receipt();removed.logs[0]={...removed.logs[0],removed:true};expect(()=>invoicePaymentEvidence(removed,key,invoice)).toThrow();
});
