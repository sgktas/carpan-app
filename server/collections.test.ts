import {describe,it,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {encodeAbiParameters,encodeEventTopics,parseAbiItem,type TransactionReceipt} from 'viem';
import {ARC_SYSTEM_EMITTER,collectionReceipt} from './collectionReceipts';
import {initCollections,createCollection,listCollections,publicCollection,attachCollectionProofs,decideCollectionProof,getCollection,cancelCollection} from './collections';
import {collectionAmount,collectionsCsv,collectionState,type CollectionProof} from '../src/collections';
const wallet='0x'+'1'.repeat(40),payer='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),zero='0x'+'0'.repeat(40);
const event=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
function log(address:string,index:number,value:bigint,from=payer,to=wallet){return {address,logIndex:index,data:encodeAbiParameters([{type:'uint256'}],[value]),topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from:from as `0x${string}`,to:to as `0x${string}`}}),removed:false};}
function receipt(logs:unknown[]):TransactionReceipt{return {status:'success',transactionHash:hash,from:payer,blockNumber:10n,gasUsed:21000n,effectiveGasPrice:20000000000n,logs} as unknown as TransactionReceipt;}
const proof:CollectionProof={hash,logIndex:0,from:payer,to:wallet,raw18:'500000000000000000',gasRaw18:'420000000000000',gasPayer:payer,block:'10',timestamp:'2026-10-07T00:00:00Z',decision:'review',reason:'Kontrol et'};
const draft={customer:'Customer',invoice:'INV-1',payer,amount:'1',due:''};
function database(){const db=new Database(':memory:');db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT)');db.run('INSERT INTO users VALUES(?,?,?),(?,?,?),(?,?,?)',['a',wallet,'2026-01-01','b',payer,'2026-01-01','guest',wallet,null]);initCollections(db);return db;}
describe('Arc collection evidence',()=>{
  it('counts mirrored ERC20/system events once and preserves native precision and transaction gas',()=>{
    const decoded=collectionReceipt(receipt([log(ARC_SYSTEM_EMITTER,0,1000000000000000001n),log('0x3600000000000000000000000000000000000000',1,1000000n)]),1780000000n,wallet,payer);
    expect(decoded).toHaveLength(1);expect(decoded[0].raw18).toBe('1000000000000000001');expect(decoded[0].gasRaw18).toBe('420000000000000');expect(decoded[0].decision).toBe('review');
  });
  it('does not accept mint, self-transfer, foreign emitter, recipient mismatch or failed receipt',()=>{
    for(const logs of [[log(ARC_SYSTEM_EMITTER,0,1n,zero)],[log(ARC_SYSTEM_EMITTER,0,1n,wallet)],[log(payer,0,1n)],[log(ARC_SYSTEM_EMITTER,0,1n,payer,zero)]])expect(()=>collectionReceipt(receipt(logs),1780000000n,wallet,payer)).toThrow();
    expect(()=>collectionReceipt({...receipt([log(ARC_SYSTEM_EMITTER,0,1n)]),status:'reverted'},1780000000n,wallet,payer)).toThrow();
  });
  it('keeps unrecognized sender in review and ignores removed events',()=>{
    expect(collectionReceipt(receipt([log(ARC_SYSTEM_EMITTER,0,1n)]),1780000000n,wallet,'0x'+'3'.repeat(40))[0].reason).toContain('farklı');
    expect(()=>collectionReceipt(receipt([{...log(ARC_SYSTEM_EMITTER,0,1n),removed:true}]),1780000000n,wallet,payer)).toThrow();
  });
});
describe('Private collection workspace',()=>{
  it('requires a verified wallet, enforces input precision and isolates private/public data',()=>{const db=database();try{
    expect(()=>createCollection(db,'guest',draft)).toThrow();expect(()=>createCollection(db,'a',{...draft,amount:'1.0000001'})).toThrow();expect(()=>createCollection(db,'a',{...draft,due:'2026-02-31'})).toThrow();
    const r=createCollection(db,'a',draft);expect(listCollections(db,'b')).toHaveLength(0);expect(()=>getCollection(db,'b',r.id)).toThrow();
    const pub=publicCollection(db,r.shareToken)!;expect(pub.recipient).toBe(wallet);expect(pub.paymentState).toBe('open');expect(pub).not.toHaveProperty('customer');expect(pub).not.toHaveProperty('invoice');expect(pub).not.toHaveProperty('payer');expect(pub).not.toHaveProperty('userId');expect(publicCollection(db,r.id)).toBeNull();
  }finally{db.close();}});
  it('is idempotent, prevents proof reuse across requests and requires a decision before crediting',()=>{const db=database();try{
    const a=createCollection(db,'a',draft),b=createCollection(db,'a',draft);
    attachCollectionProofs(db,'a',a.id,[proof]);const again=attachCollectionProofs(db,'a',a.id,[proof]);expect(again.proofs).toHaveLength(1);expect(again.receivedRaw18).toBe('0');expect(again.state).toBe('review');expect(publicCollection(db,a.shareToken)?.paymentState).toBe('review');
    expect(()=>attachCollectionProofs(db,'a',b.id,[proof])).toThrow();expect(()=>decideCollectionProof(db,'b',a.id,{hash,logIndex:0,decision:'accepted'})).toThrow();
    const accepted=decideCollectionProof(db,'a',a.id,{hash,logIndex:0,decision:'accepted'});expect(accepted.state).toBe('partial');expect(publicCollection(db,a.shareToken)?.remainingRaw18).toBe('500000000000000000');
    attachCollectionProofs(db,'a',a.id,[{...proof,logIndex:2}]);expect(decideCollectionProof(db,'a',a.id,{hash,logIndex:2,decision:'accepted'}).state).toBe('paid');expect(publicCollection(db,a.shareToken)?.paymentState).toBe('settled');
    decideCollectionProof(db,'a',a.id,{hash,logIndex:2,decision:'unlink'});expect(attachCollectionProofs(db,'a',b.id,[{...proof,logIndex:2}]).proofs).toHaveLength(1);
    cancelCollection(db,'a',a.id);expect(publicCollection(db,a.shareToken)).toBeNull();expect(()=>attachCollectionProofs(db,'a',a.id,[proof])).toThrow();
  }finally{db.close();}});
  it('rolls back all inserts if a later event already belongs to a different request',()=>{const db=database();try{const a=createCollection(db,'a',draft),b=createCollection(db,'a',draft);attachCollectionProofs(db,'a',a.id,[proof]);expect(()=>attachCollectionProofs(db,'a',b.id,[{...proof,logIndex:2},proof])).toThrow();expect(getCollection(db,'a',b.id).proofs).toHaveLength(0);}finally{db.close();}});
  it('distinguishes one wei excess and prevents formula execution while exporting each transaction fee once',()=>{const db=database();try{
    expect(collectionAmount('0.000001')).toBe('1');expect(()=>collectionAmount('1e3')).toThrow();
    expect(collectionState({expectedRaw6:'1000000',cancelled:false,proofs:[{...proof,raw18:'1000000000000000001',decision:'accepted'}]}).state).toBe('overpaid');
    const a=createCollection(db,'a',{...draft,customer:'=SUM(1,2)'});attachCollectionProofs(db,'a',a.id,[proof,{...proof,logIndex:3}]);const csv=collectionsCsv([getCollection(db,'a',a.id)]);expect(csv).toContain("'=SUM(1,2)");
    // Fee amounts and provenance must survive language changes. This fixture
    // contains no semicolons in fields, so column splitting is sufficient.
    const rows=csv.split('\r\n').slice(1).map(row=>row.split(';'));
    const fees=rows.filter(row=>row[12]==='"0.00042"');expect(fees).toHaveLength(1);
    expect(fees[0][7]).toBe(`"${hash}"`);expect(fees[0][13]).toBe(`"${payer}"`);
    expect(rows.filter(row=>row[11]==='"0.5"')).toHaveLength(2);
  }finally{db.close();}});
  it('survives a database reopen without replacing account data',()=>{const folder=mkdtempSync(join(tmpdir(),'carpan-collections-')),file=join(folder,'test.db');let db=new Database(file);try{db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT)');db.run('INSERT INTO users VALUES(?,?,?)',['a',wallet,'2026-01-01']);initCollections(db);const r=createCollection(db,'a',draft);attachCollectionProofs(db,'a',r.id,[proof]);db.close();db=new Database(file);initCollections(db);expect(getCollection(db,'a',r.id).proofs).toHaveLength(1);expect(db.query('SELECT count(*) AS n FROM users').get()).toEqual({n:1});}finally{db.close();rmSync(folder,{recursive:true,force:true});}});
});
