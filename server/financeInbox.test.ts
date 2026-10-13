import {describe,it,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {encodeAbiParameters,encodeEventTopics,type TransactionReceipt} from 'viem';
import {randomBytes} from 'node:crypto';
import {ARC_SYSTEM_EMITTER,collectionTransferEvent} from './collectionReceipts';
import {INBOX_BLOCK_WINDOW,INBOX_TRANSACTION_LIMIT,initFinanceInbox,readFinanceInbox,refreshFinanceInbox,scanFinanceInbox,inboxSuggestions,inboxProof,type InboxReader} from './financeInbox';
import {initCollections,createCollection,getCollection,attachCollectionProofs,decideCollectionProof,collectionAudit} from './collections';
import type {CollectionProof} from '../src/collections';

const payer='0x'+'2'.repeat(40),zero='0x'+'0'.repeat(40),blockHash='0x'+'e'.repeat(64),usdc='0x3600000000000000000000000000000000000000';
const hash=(i:number)=>'0x'+i.toString(16).padStart(64,'0');
function wallet(){return '0x'+randomBytes(20).toString('hex');}
function log(recipient:string,transactionHash:string,index:number,value:bigint,emitter=ARC_SYSTEM_EMITTER,from=payer){return {address:emitter,transactionHash,logIndex:index,blockNumber:5000n,blockHash,removed:false,args:{from,to:recipient,value},data:encodeAbiParameters([{type:'uint256'}],[value]),topics:encodeEventTopics({abi:[collectionTransferEvent],eventName:'Transfer',args:{from:from as `0x${string}`,to:recipient as `0x${string}`}})};}
function receipt(recipient:string,transactionHash=hash(1),raw=1000000000000000000n,extra:unknown[]=[]):TransactionReceipt{return {status:'success',transactionHash,from:payer,blockNumber:5000n,blockHash,gasUsed:21000n,effectiveGasPrice:20000000000n,logs:[log(recipient,transactionHash,0,raw),...extra]} as unknown as TransactionReceipt;}
function reader(recipient:string):InboxReader{return {chainId:async()=>5042,latest:async()=>({number:5000n,hash:blockHash,timestamp:1780000000n}),logs:async()=>[log(recipient,hash(1),0,1000000000000000000n)],receipt:async h=>receipt(recipient,h),block:async n=>({number:n,hash:blockHash,timestamp:1780000000n})};}
function database(recipient:string){const db=new Database(':memory:');db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT)');db.run('INSERT INTO users VALUES(?,?,?),(?,?,?)',['a',recipient,'2026-01-01','b',wallet(),'2026-01-01']);initCollections(db);initFinanceInbox(db);return db;}
const draft={customer:'Client',invoice:'INV',amount:'1',payer,due:''};
describe('Bounded canonical Arc collection inbox',()=>{
  it('reads native and mirrored ERC20 once with exact precision, retaining gas separately',async()=>{
    const address=wallet(),r=reader(address);let range:bigint[]=[];
    r.logs=async(_wallet,from,to)=>{range=[from,to];return [log(address,hash(1),0,1000000000000000000n),log(address,hash(1),1,1000000n,usdc),log(address,hash(2),0,1n)];};
    r.receipt=async h=>h===hash(1)?receipt(address,h,1000000000000000000n,[log(address,h,1,1000000n,usdc)]):receipt(address,h,1n);
    const data=await scanFinanceInbox(address,r);
    expect(range).toEqual([5000n-BigInt(INBOX_BLOCK_WINDOW-1),5000n]);expect(data.proofs).toHaveLength(2);
    expect(data.proofs.find(p=>p.hash===hash(1))?.interface).toBe('erc20');expect(data.proofs.find(p=>p.hash===hash(2))?.raw18).toBe('1');
    expect(data.proofs.find(p=>p.hash===hash(2))?.interface).toBe('native');expect(data.proofs[0].gasRaw18).toBe('420000000000000');expect(data.proofs[0].decision).toBe('review');
  });
  it('rejects wrong network before reads and excludes mint, self, removed and foreign events',async()=>{
    const address=wallet(),r=reader(address);let queries=0;r.chainId=async()=>5042002;r.logs=async()=>{queries++;return [];};
    expect(scanFinanceInbox(address,r)).rejects.toThrow('Mainnet');expect(queries).toBe(0);
    r.chainId=async()=>5042;r.logs=async()=>[log(address,hash(1),0,1n,ARC_SYSTEM_EMITTER,zero),log(address,hash(2),0,1n,ARC_SYSTEM_EMITTER,address),{...log(address,hash(3),0,1n),removed:true},log(address,hash(4),0,1n,usdc)];
    const data=await scanFinanceInbox(address,r);expect(data.proofs).toHaveLength(0);expect(data.coverage.checkedTransactions).toBe(0);
  });
  it('caps receipt requests, deduplicates transaction candidates and labels truncation',async()=>{
    const address=wallet(),r=reader(address);let receipts=0;r.logs=async()=>Array.from({length:30},(_,i)=>log(address,hash(i+1),i,1n)).concat(log(address,hash(1),35,1n));
    r.receipt=async h=>{receipts++;return receipt(address,h);};const data=await scanFinanceInbox(address,r);
    expect(receipts).toBe(INBOX_TRANSACTION_LIMIT);expect(data.coverage.candidateTransactions).toBe(30);expect(data.coverage.truncated).toBe(true);
  });
  it('does not convert receipt failures into a successful zero or overwrite the last snapshot',async()=>{
    const address=wallet(),db=database(address),r=reader(address),now=Date.now();try{
      const before=await refreshFinanceInbox(db,'a',address,r,now);
      const broken=reader(address);broken.latest=async()=>{throw new Error('RPC down');};
      await expect(refreshFinanceInbox(db,'a',address,broken,now+31000)).rejects.toThrow('RPC down');
      expect(readFinanceInbox(db,'a',address).coverage).toEqual(before.coverage);expect(readFinanceInbox(db,'a',address).items).toHaveLength(1);
      broken.latest=r.latest;broken.receipt=async()=>{throw new Error('No receipt');};await expect(scanFinanceInbox(address,broken)).rejects.toThrow('Mevcut kayıt korunuyor');
    }finally{db.close();}
  });
  it('scopes wallets and evidence to the account, coalesces refreshes and never credits suggestions',async()=>{
    const address=wallet(),db=database(address),r=reader(address),now=Date.now();let queries=0;const logs=r.logs;r.logs=async(...args)=>{queries++;return logs(...args);};try{
      const request=createCollection(db,'a',draft);db.run('UPDATE arc_collection_requests SET created_at=? WHERE id=?',['2026-01-01T00:00:00Z',request.id]);
      const [one,two]=await Promise.all([refreshFinanceInbox(db,'a',address,r,now),refreshFinanceInbox(db,'a',address,r,now)]);
      expect(queries).toBe(1);expect(one.items).toEqual(two.items);expect(one.items[0].suggestions[0].requestId).toBe(request.id);expect(getCollection(db,'a',request.id).receivedRaw18).toBe('0');
      await refreshFinanceInbox(db,'a',address,r,now+1000);expect(queries).toBe(1);
      expect(()=>readFinanceInbox(db,'b',address)).toThrow();expect(readFinanceInbox(db,'b').items).toHaveLength(0);expect(()=>inboxProof(db,'b',address,hash(1),0)).toThrow();
      const proof=inboxProof(db,'a',address,hash(1),0);attachCollectionProofs(db,'a',request.id,[proof]);expect(readFinanceInbox(db,'a',address).items[0].linkedRequestId).toBe(request.id);expect(getCollection(db,'a',request.id).receivedRaw18).toBe('0');
    }finally{db.close();}
  });
  it('suggests only eligible time windows with exact amount or specified payer, excluding closed/foreign requests',()=>{
    const address=wallet(),db=database(address);try{
      const request=createCollection(db,'a',draft),proof={hash:hash(1),logIndex:0,from:payer,to:address,raw18:'1000000000000000000',gasRaw18:'1',gasPayer:payer,block:'5000',timestamp:'2026-10-10T12:00:00.000Z',decision:'review',reason:'Review'} as CollectionProof;
      const valid={...request,createdAt:'2026-10-01T00:00:00Z',due:'2026-10-11'};
      expect(inboxSuggestions(proof,[valid])[0].amountMatches).toBe(true);
      expect(inboxSuggestions(proof,[{...valid,createdAt:'2026-10-11T00:00:00Z'},{...valid,due:'2026-10-09'},{...valid,cancelled:true},{...valid,recipient:wallet()}])).toHaveLength(0);
      expect(inboxSuggestions({...proof,raw18:'1',from:wallet()},[valid])).toHaveLength(0);
    }finally{db.close();}
  });
  it('keeps original snapshots in append-only decisions and fixes duplicate retries at the 100-event cap',()=>{
    const address=wallet(),db=database(address);try{
      const request=createCollection(db,'a',draft),proof={hash:hash(1),logIndex:0,from:payer,to:address,raw18:'1',gasRaw18:'1',gasPayer:payer,block:'5000',timestamp:'2026-10-10T12:00:00.000Z',decision:'review',reason:'Review'} as CollectionProof;
      const hundred=Array.from({length:100},(_,i)=>({...proof,logIndex:i}));attachCollectionProofs(db,'a',request.id,hundred);
      expect(attachCollectionProofs(db,'a',request.id,[proof,proof]).proofs).toHaveLength(100);
      expect(()=>attachCollectionProofs(db,'a',request.id,[proof,{...proof,logIndex:100}])).toThrow('100');
      const accepted=decideCollectionProof(db,'a',request.id,{hash:proof.hash,logIndex:0,decision:'accepted'});expect(accepted.audit?.at(-1)?.previousDecision).toBe('review');
      decideCollectionProof(db,'a',request.id,{hash:proof.hash,logIndex:0,decision:'rejected'});const unlinked=decideCollectionProof(db,'a',request.id,{hash:proof.hash,logIndex:0,decision:'unlink'});
      expect(unlinked.proofs).toHaveLength(99);expect(unlinked.audit?.slice(-3).map(a=>a.action)).toEqual(['accepted','rejected','unlinked']);expect(unlinked.audit?.at(-1)?.proof?.raw18).toBe('1');
      const first=collectionAudit(db,'a',request.id);expect(first.items).toHaveLength(50);expect(first.nextCursor).not.toBeNull();
      const second=collectionAudit(db,'a',request.id,first.nextCursor);expect(second.items).toHaveLength(50);expect(new Set([...first.items,...second.items].map(a=>a.id)).size).toBe(100);
      expect(()=>collectionAudit(db,'b',request.id,first.nextCursor)).toThrow();expect(()=>collectionAudit(db,'a',request.id,'invalid')).toThrow();
      expect(()=>db.run('UPDATE arc_collection_audit SET action=? WHERE user_id=?',['accepted','a'])).toThrow('append-only');
      expect(()=>getCollection(db,'b',request.id)).toThrow();
    }finally{db.close();}
  });
});
