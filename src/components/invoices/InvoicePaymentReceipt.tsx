import {useEffect,useState} from 'react';
import {createPublicClient,http,type Hex} from 'viem';
import {MAINNET_BRIDGE_CHAINS} from '../../bridge-mainnet-config';
import {invoicePaymentEvidence,type PaymentReceiptData} from '../../payment-receipt';
import {CARPAN_INVOICE_ABI} from './invoiceAbi';
import {CONTRACT_ADDRESS} from './invoiceConfig';
import {PaymentReceipt} from '../PaymentReceipt';
import {useI18n} from '../../i18n';
const client=createPublicClient({chain:MAINNET_BRIDGE_CHAINS.find(c=>c.id===5042)!,transport:http(undefined,{timeout:12000,retryCount:1})});
export function InvoicePaymentReceipt({hash,invoiceKey}:{hash:string;invoiceKey:string}){
 const {language}=useI18n(),tr=language==='tr';const [result,setResult]=useState<{identity:string;receipt?:PaymentReceiptData;error?:string}|null>(null),[retry,setRetry]=useState(0);const identity=hash+':'+invoiceKey;
 useEffect(()=>{let active=true;setResult(null);void(async()=>{try{
  if(!/^0x[0-9a-f]{64}$/i.test(hash)||!/^0x[0-9a-f]{64}$/i.test(invoiceKey))throw Error('Invalid receipt link.');
  if(await client.getChainId()!==5042)throw Error('Unexpected network.');
  const [receipt,invoice]=await Promise.all([client.getTransactionReceipt({hash:hash as Hex}),client.readContract({address:CONTRACT_ADDRESS,abi:CARPAN_INVOICE_ABI,functionName:'getInvoice',args:[invoiceKey as Hex]})]);
  if(receipt.transactionHash.toLowerCase()!==hash.toLowerCase())throw Error('Transaction identity mismatch.');
  const verified=invoicePaymentEvidence(receipt,invoiceKey,invoice),block=await client.getBlock({blockNumber:receipt.blockNumber});
  if(block.hash!==receipt.blockHash)throw Error('Payment block could not be verified.');
  if(active)setResult({identity,receipt:{...verified,paidAt:new Date(Number(block.timestamp)*1000).toISOString()}});
 }catch{if(active)setResult({identity,error:tr?'Makbuz şu an doğrulanamadı. Bu, ödemenin başarısız olduğu anlamına gelmez. Tekrar ödeme yapma.':'Receipt verification is unavailable. This does not mean payment failed. Do not pay again.'});}})();return()=>{active=false;};},[hash,invoiceKey,identity,retry,tr]);
 if(result?.identity!==identity||!result)return <p role="status">{tr?'Ödeme makbuzu zincirden kontrol ediliyor…':'Checking your payment receipt onchain…'}</p>;
 if(!result.receipt)return <div role="alert"><p>{result.error}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>{tr?'Makbuzu yeniden kontrol et':'Check receipt again'}</button></div>;
 return <PaymentReceipt receipt={result.receipt} sharePath={'/finance/invoices?invoice='+invoiceKey+'&receipt='+hash}/>;
}
