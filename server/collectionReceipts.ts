import {createPublicClient,http,decodeEventLog,parseAbiItem,type TransactionReceipt} from 'viem';
import type {CollectionProof} from '../src/collections';
import {ARC_USDC} from '../src/arc-wallet';
export const ARC_SYSTEM_EMITTER='0xfffffffffffffffffffffffffffffffffffffffe';
export const collectionTransferEvent=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
export const collectionRpcClient=createPublicClient({transport:http(process.env.ARC_MAINNET_RPC_URL||'https://rpc.mainnet.arc.io',{timeout:12000,retryCount:1})});
const zero='0x'+'0'.repeat(40);
export function collectionReceipt(receipt:TransactionReceipt,timestamp:bigint,recipient:string,payer:string):CollectionProof[]{
  if(receipt.status!=='success')throw new Error('İşlem başarılı değil; tahsilat kaydedilemez.');
  if(receipt.effectiveGasPrice===undefined||receipt.gasUsed===undefined)throw new Error('İşlem ücreti doğrulanamadı.');
  const result:CollectionProof[]=[];
  for(const log of receipt.logs){
    // Arc's system emitter is the single source for both native and ERC-20 transfers.
    // Never add the mirrored 6-decimal ERC-20 event to this ledger.
    if(log.address.toLowerCase()!==ARC_SYSTEM_EMITTER||log.removed)continue;
    let args;try{args=decodeEventLog({abi:[collectionTransferEvent],data:log.data,topics:log.topics,strict:true}).args;}catch{continue;}
    const from=args.from.toLowerCase(),to=args.to.toLowerCase();
    if(to!==recipient.toLowerCase()||from===zero||from===to||args.value<=0n)continue;
    if(!Number.isSafeInteger(log.logIndex)||log.logIndex<0)throw new Error('Olay kimliği okunamadı.');
    const mirrored=receipt.logs.some(candidate=>{if(candidate.address.toLowerCase()!==ARC_USDC||candidate.removed)return false;try{const mirror=decodeEventLog({abi:[collectionTransferEvent],data:candidate.data,topics:candidate.topics,strict:true}).args;return mirror.from.toLowerCase()===from&&mirror.to.toLowerCase()===to&&mirror.value*1000000000000n===args.value;}catch{return false;}});
    result.push({hash:receipt.transactionHash.toLowerCase(),logIndex:log.logIndex,from,to,raw18:args.value.toString(),gasRaw18:(receipt.gasUsed*receipt.effectiveGasPrice).toString(),gasPayer:receipt.from.toLowerCase(),block:receipt.blockNumber.toString(),timestamp:new Date(Number(timestamp)*1000).toISOString(),decision:'review',interface:mirrored?'erc20':'native',reason:payer&&payer.toLowerCase()!==from?'Gönderen, belirtilen müşteri cüzdanından farklı.':'İşlem zincirde doğrulandı; fatura ilişkisini onayla.'});
  }
  if(!result.length)throw new Error('Bu işlemde alıcıya gelen uygun USDC transferi bulunamadı. Mint ve kendi cüzdanına aktarım tahsilat sayılmaz.');
  return result;
}
export async function loadCollectionReceipt(hash:string,recipient:string,payer:string):Promise<CollectionProof[]>{
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error('Geçerli işlem hash’i gir.');
  if(await collectionRpcClient.getChainId()!==5042)throw new Error('RPC Arc Mainnet ağına bağlı değil.');
  const receipt=await collectionRpcClient.getTransactionReceipt({hash:hash as `0x${string}`});
  const block=await collectionRpcClient.getBlock({blockNumber:receipt.blockNumber});
  if(block.hash?.toLowerCase()!==receipt.blockHash.toLowerCase())throw new Error('İşlem blok kanıtı uyuşmuyor.');
  return collectionReceipt(receipt,block.timestamp,recipient,payer);
}
