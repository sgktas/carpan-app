import type {Database} from 'bun:sqlite';
import type {TransactionReceipt} from 'viem';
import type {CollectionProof,CollectionRequest} from '../src/collections';
import type {FinanceInbox,FinanceInboxCoverage,FinanceInboxSuggestion} from '../src/finance-inbox';
import {ARC_SYSTEM_EMITTER,collectionReceipt,collectionRpcClient,collectionTransferEvent} from './collectionReceipts';
import {listCollections} from './collections';

export const INBOX_BLOCK_WINDOW=1024,INBOX_TRANSACTION_LIMIT=20,INBOX_EVENT_LIMIT=100,INBOX_REFRESH_MS=30000;
type InboxLog={address:string;transactionHash:string|null;blockNumber:bigint|null;logIndex:number|null;removed?:boolean;args?:{from?:string;to?:string;value?:bigint}};
type InboxBlock={number:bigint;hash:string|null;timestamp:bigint};
export type InboxReader={chainId:()=>Promise<number>;latest:()=>Promise<InboxBlock>;logs:(wallet:string,from:bigint,to:bigint)=>Promise<InboxLog[]>;receipt:(hash:string)=>Promise<TransactionReceipt>;block:(number:bigint)=>Promise<InboxBlock>};
export const inboxRpcReader:InboxReader={
  chainId:()=>collectionRpcClient.getChainId(),
  latest:async()=>{const b=await collectionRpcClient.getBlock();return {number:b.number,hash:b.hash,timestamp:b.timestamp};},
  logs:(wallet,fromBlock,toBlock)=>collectionRpcClient.getLogs({address:ARC_SYSTEM_EMITTER,event:collectionTransferEvent,args:{to:wallet as `0x${string}`},fromBlock,toBlock,strict:true}),
  receipt:hash=>collectionRpcClient.getTransactionReceipt({hash:hash as `0x${string}`}),
  block:async number=>{const b=await collectionRpcClient.getBlock({blockNumber:number});return {number:b.number,hash:b.hash,timestamp:b.timestamp};},
};
export function initFinanceInbox(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS arc_finance_inbox(user_id TEXT NOT NULL,wallet TEXT NOT NULL,data TEXT NOT NULL,refreshed_at TEXT NOT NULL,PRIMARY KEY(user_id,wallet))`);
}
export function inboxWallets(db:Database,userId:string):string[]{
  const owner=db.query('SELECT wallet_address,wallet_verified_at FROM users WHERE id=?').get(userId) as {wallet_address:string|null;wallet_verified_at:string|null}|null;
  const requests=db.query('SELECT DISTINCT recipient FROM arc_collection_requests WHERE user_id=? AND cancelled=0 ORDER BY created_at DESC').all(userId) as {recipient:string}[];
  return [...new Set([...(owner?.wallet_verified_at&&owner.wallet_address?[owner.wallet_address.toLowerCase()]:[]),...requests.map(r=>r.recipient.toLowerCase())])].filter(a=>/^0x[0-9a-f]{40}$/.test(a));
}
function selectWallet(db:Database,userId:string,value:unknown){
  const wallets=inboxWallets(db,userId),selected=typeof value==='string'?value.toLowerCase():wallets[0]||null;
  if(selected&&!wallets.includes(selected))throw new Error('Bu cüzdan hesabının tahsilat taleplerine bağlı değil.');
  return {wallets,selected};
}
export function inboxSuggestions(proof:CollectionProof,requests:CollectionRequest[]):FinanceInboxSuggestion[]{
  const matches=requests.filter(r=>!r.cancelled&&r.recipient===proof.to&&BigInt(r.expectedRaw6)*1000000000000n>BigInt(r.receivedRaw18)).map(r=>{
    const remaining=BigInt(r.expectedRaw6)*1000000000000n-BigInt(r.receivedRaw18),afterRequest=Date.parse(proof.timestamp)>=Date.parse(r.createdAt),beforeDue=!r.due||Date.parse(proof.timestamp)<=Date.parse(`${r.due}T23:59:59.999Z`);
    return {requestId:r.id,reference:r.reference,customer:r.customer,invoice:r.invoice,remainingRaw18:remaining.toString(),amountMatches:BigInt(proof.raw18)===remaining,payerMatches:!!r.payer&&r.payer===proof.from,afterRequest,beforeDue};
  });
  // Evidence suggests a request; it never confirms the invoice or changes its received amount.
  return matches.filter(m=>m.afterRequest&&m.beforeDue&&(m.amountMatches||m.payerMatches)).sort((a,b)=>Number(b.amountMatches)*4+Number(b.payerMatches)*2-Number(a.amountMatches)*4-Number(a.payerMatches)*2||a.reference.localeCompare(b.reference)).slice(0,3);
}
type Snapshot={proofs:CollectionProof[];coverage:FinanceInboxCoverage};
export function readFinanceInbox(db:Database,userId:string,wallet?:unknown):FinanceInbox{
  const {wallets,selected}=selectWallet(db,userId,wallet);
  const row=selected?db.query('SELECT data,refreshed_at FROM arc_finance_inbox WHERE user_id=? AND wallet=?').get(userId,selected) as {data:string;refreshed_at:string}|null:null;
  const snapshot=row?JSON.parse(row.data) as Snapshot:null,requests=listCollections(db,userId);
  const linked=new Map((db.query('SELECT hash,log_index,request_id FROM arc_collection_proofs WHERE user_id=?').all(userId) as {hash:string;log_index:number;request_id:string}[]).map(r=>[`${r.hash}:${r.log_index}`,r.request_id]));
  return {wallets,selectedWallet:selected,items:(snapshot?.proofs||[]).map(proof=>{const linkedRequestId=linked.get(`${proof.hash}:${proof.logIndex}`)||null;return {proof,observedAt:snapshot!.coverage.fetchedAt,linkedRequestId,suggestions:linkedRequestId?[]:inboxSuggestions(proof,requests)};}),coverage:snapshot?.coverage||null,refreshAfter:row?new Date(Date.parse(row.refreshed_at)+INBOX_REFRESH_MS).toISOString():null,source:'arc_system_events',scope:'bounded_incoming_usdc',includesGas:true};
}
export async function scanFinanceInbox(wallet:string,reader:InboxReader,now=Date.now()):Promise<Snapshot>{
  if(await reader.chainId()!==5042)throw new Error('RPC Arc Mainnet ağına bağlı değil.');
  const latest=await reader.latest(),from=latest.number>=BigInt(INBOX_BLOCK_WINDOW-1)?latest.number-BigInt(INBOX_BLOCK_WINDOW-1):0n;
  const logs=await reader.logs(wallet,from,latest.number);
  const relevant=logs.filter(l=>l.address.toLowerCase()===ARC_SYSTEM_EMITTER&&!l.removed&&l.transactionHash&&/^0x[0-9a-f]{64}$/i.test(l.transactionHash)&&l.blockNumber!==null&&l.blockNumber>=from&&l.blockNumber<=latest.number&&Number.isSafeInteger(l.logIndex)&&l.logIndex!>=0&&l.args?.to?.toLowerCase()===wallet&&l.args.from&&/^0x[0-9a-f]{40}$/i.test(l.args.from)&&l.args.from.toLowerCase()!=='0x'+'0'.repeat(40)&&l.args.from.toLowerCase()!==wallet&&typeof l.args.value==='bigint'&&l.args.value>0n).sort((a,b)=>a.blockNumber!>b.blockNumber!?-1:a.blockNumber!<b.blockNumber!?1:b.logIndex!-a.logIndex!);
  const hashes=[...new Set(relevant.map(l=>l.transactionHash!.toLowerCase()))],selected=hashes.slice(0,INBOX_TRANSACTION_LIMIT),proofs=new Map<string,CollectionProof>();
  let failed=0,checked=0,consecutiveFailures=0,truncated=hashes.length>selected.length;
  // Sequential receipt reads cap provider pressure; no polling, chain-wide scan or Blockscout credits.
  const blocks=new Map<string,InboxBlock>();
  for(const hash of selected){checked++;try{
    const receipt=await reader.receipt(hash);
    if(receipt.transactionHash.toLowerCase()!==hash||receipt.blockNumber<from||receipt.blockNumber>latest.number)throw new Error('Receipt scope mismatch');
    let block=blocks.get(receipt.blockNumber.toString());if(!block){block=await reader.block(receipt.blockNumber);blocks.set(receipt.blockNumber.toString(),block);}
    if(block.number!==receipt.blockNumber||block.hash?.toLowerCase()!==receipt.blockHash.toLowerCase())throw new Error('Receipt block mismatch');
    for(const proof of collectionReceipt(receipt,block.timestamp,wallet,'')){const key=`${proof.hash}:${proof.logIndex}`;if(proofs.size>=INBOX_EVENT_LIMIT&&!proofs.has(key)){truncated=true;continue;}proofs.set(key,proof);}
    consecutiveFailures=0;
  }catch{failed++;if(++consecutiveFailures>=3){truncated=true;break;}}}
  if(selected.length&&failed===checked)throw new Error('Gelen hareketlerin zincir kanıtı alınamadı. Mevcut kayıt korunuyor; yeniden dene.');
  return {proofs:[...proofs.values()],coverage:{wallet,fromBlock:from.toString(),toBlock:latest.number.toString(),fetchedAt:new Date(now).toISOString(),checkedTransactions:checked,candidateTransactions:hashes.length,failedTransactions:failed,truncated,blockWindow:INBOX_BLOCK_WINDOW,transactionLimit:INBOX_TRANSACTION_LIMIT}};
}
const scans=new Map<string,{until:number;promise:Promise<Snapshot>}>();
const active=new Map<string,Promise<FinanceInbox>>();
export async function refreshFinanceInbox(db:Database,userId:string,wallet?:unknown,reader:InboxReader=inboxRpcReader,now=Date.now()):Promise<FinanceInbox>{
  const {selected}=selectWallet(db,userId,wallet);if(!selected)return readFinanceInbox(db,userId);
  const key=`${userId}/${selected}`,ongoing=active.get(key);if(ongoing)return ongoing;
  const existing=db.query('SELECT refreshed_at FROM arc_finance_inbox WHERE user_id=? ORDER BY refreshed_at DESC LIMIT 1').get(userId) as {refreshed_at:string}|null;
  if(existing&&now-Date.parse(existing.refreshed_at)<INBOX_REFRESH_MS)return readFinanceInbox(db,userId,selected);
  const job=(async()=>{
    let cached=scans.get(selected);
    if(!cached||cached.until<=now){const promise=scanFinanceInbox(selected,reader,now);cached={until:now+INBOX_REFRESH_MS,promise};scans.set(selected,cached);promise.catch(()=>scans.delete(selected));if(scans.size>200)scans.delete(scans.keys().next().value!);}
    const snapshot=await cached.promise;
    // Store only fresh verified events. A failed top-level read never replaces a usable snapshot.
    db.run('INSERT INTO arc_finance_inbox(user_id,wallet,data,refreshed_at) VALUES(?,?,?,?) ON CONFLICT(user_id,wallet) DO UPDATE SET data=excluded.data,refreshed_at=excluded.refreshed_at',[userId,selected,JSON.stringify(snapshot),snapshot.coverage.fetchedAt]);
    return readFinanceInbox(db,userId,selected);
  })();active.set(key,job);try{return await job;}finally{active.delete(key);}
}
export function inboxProof(db:Database,userId:string,wallet:string,hash:string,logIndex:number):CollectionProof{
  const item=readFinanceInbox(db,userId,wallet).items.find(i=>i.proof.hash===hash&&i.proof.logIndex===logIndex);
  if(!item)throw new Error('Gelen kutusunda doğrulanmış hareket bulunamadı. Yenile veya işlem hash’ini kullan.');
  return item.proof;
}
