import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {encodeAbiParameters,encodeEventTopics,type TransactionReceipt} from 'viem';
import {initFinanceOrganizations,createFinanceOrganization,ensurePersonalFinanceOrganization,registerFinanceBusinessWallet,FinanceOrganizationError} from './financeOrganizations';
import {initFinanceOperationsStore,saveFinanceOperationScan,updateFinanceMovementDecision,createFinanceExportBatch,readFinanceExportBatch} from './financeOperationsStore';
import {scanFinanceMovements,financeMovementTransferEvent,FINANCE_SYSTEM_EMITTER,type FinanceMovementLog,type FinanceMovementReader} from './financeMovements';
import {initFinanceIntegrations,createFinanceIntegration,listFinanceIntegrations,createFinanceApiKey,listFinanceApiKeys,revokeFinanceApiKey,authenticateFinanceApiKey,recordFinanceApiUse,acknowledgeFinanceExport,listFinanceAcknowledgements} from './financeIntegrations';

const address='0x'+'1'.repeat(40),peer='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
async function fixture(){
  const db=new Database(':memory:');db.run('PRAGMA foreign_keys=ON');db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT,merged_into TEXT)');
  db.run('INSERT INTO users VALUES(?,?,?,NULL),(?,?,?,NULL)',['alice',address,'2026-10-12T00:00:00Z','bob',peer,'2026-10-12T00:00:00Z']);
  initFinanceOrganizations(db);initFinanceOperationsStore(db);initFinanceIntegrations(db);
  const org=createFinanceOrganization(db,'alice',{name:'Company'}),wallet=registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address,label:'Treasury'});
  const logs:FinanceMovementLog[]=[0,1].map(logIndex=>({address:FINANCE_SYSTEM_EMITTER,transactionHash:hash,blockNumber:5000n,blockHash,logIndex,removed:false,data:encodeAbiParameters([{type:'uint256'}],[100000000000000001n]),topics:encodeEventTopics({abi:[financeMovementTransferEvent],eventName:'Transfer',args:{from:peer as `0x${string}`,to:address as `0x${string}`}})}));
  const reader:FinanceMovementReader={chainId:async()=>5042,latest:async()=>({number:5000n,hash:blockHash,timestamp:1791792000n}),logs:async(_w,_f,_t,d)=>d==='in'?logs:[],receipt:async()=>({status:'success',transactionHash:hash,blockNumber:5000n,blockHash,from:peer,gasUsed:21000n,effectiveGasPrice:20000000000n,logs} as unknown as TransactionReceipt),block:async number=>({number,hash:blockHash,timestamp:1791792000n})};
  const scan=await scanFinanceMovements(address,reader);saveFinanceOperationScan(db,'alice',org.id,wallet.id,scan);
  for(const m of scan.movements)updateFinanceMovementDecision(db,'alice',org.id,wallet.id,m.id,{category:'collection',reference:'INV-001',status:'approved',expectedVersion:0});
  const ids=scan.movements.map(m=>m.id),batch=createFinanceExportBatch(db,'alice',org.id,wallet.id,{ids,idempotencyKey:'batch-001',expectedVersions:Object.fromEntries(ids.map(id=>[id,1]))});
  const integration=createFinanceIntegration(db,'alice',org.id,{name:'Accounting target'});
  const issued=createFinanceApiKey(db,'alice',org.id,integration.id,{name:'Server',scopes:['movements:read','exports:read','accounting:write'],expiresInDays:90});
  const principal=authenticateFinanceApiKey(db,'Bearer '+issued.secret);
  const ack=(records=ids.map(movementId=>({movementId,decisionVersion:1,externalRecordId:'ERP-JOURNAL-001'})),idempotencyKey='ack-001')=>({contentHash:batch.contentHash,idempotencyKey,records});
  return {db,org,wallet,scan,ids,batch,integration,issued,principal,ack};
}
function failure(fn:()=>unknown,status:number){try{fn();throw Error('Expected failure');}catch(e){expect(e).toBeInstanceOf(FinanceOrganizationError);expect((e as FinanceOrganizationError).status).toBe(status);}}

test('company integration creation and key management require an active manager and business workspace',async()=>{
  const f=await fixture();try{
    failure(()=>listFinanceIntegrations(f.db,'bob',f.org.id),404);
    failure(()=>createFinanceApiKey(f.db,'bob',f.org.id,f.integration.id,{name:'bad',scopes:['movements:read'],expiresInDays:30}),404);
    const personal=ensurePersonalFinanceOrganization(f.db,'bob');failure(()=>createFinanceIntegration(f.db,'bob',personal.id,{name:'Personal'}),400);
    f.db.run("INSERT INTO finance_organization_members VALUES(?,?,'reviewer',?,NULL)",[f.org.id,'bob','2026-10-12']);
    expect(listFinanceIntegrations(f.db,'bob',f.org.id)).toHaveLength(1);
    failure(()=>createFinanceIntegration(f.db,'bob',f.org.id,{name:'Denied'}),403);
    failure(()=>revokeFinanceApiKey(f.db,'bob',f.org.id,f.integration.id,f.issued.key.id),403);
  }finally{f.db.close();}
});
test('high entropy credentials are returned once and neither metadata nor database evidence contains their plaintext',async()=>{
  const f=await fixture();try{
    expect(f.issued.secret).toMatch(/^carpan_live_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/);
    const second=createFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,{name:'Reader',scopes:['movements:read'],expiresInDays:30});expect(second.secret).not.toBe(f.issued.secret);
    expect(JSON.stringify(listFinanceApiKeys(f.db,'alice',f.org.id,f.integration.id))).not.toContain(f.issued.secret);
    for(const table of ['finance_api_keys','finance_integration_audit'])expect(JSON.stringify(f.db.query('SELECT * FROM '+table).all())).not.toContain(f.issued.secret);
    for(const scopes of [[],['*'],['accounting:write','accounting:write'],['movements:read',{}]])failure(()=>createFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,{name:'Invalid',scopes,expiresInDays:90}),400);
    for(const expiresInDays of [0,'90',10000])failure(()=>createFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,{name:'Invalid',scopes:['exports:read'],expiresInDays}),400);
  }finally{f.db.close();}
});
test('Bearer authentication rejects tampering, missing scopes, expiry and explicit revocation',async()=>{
  const f=await fixture();try{
    for(const value of [undefined,'',f.issued.secret,'Bearer '+f.issued.secret+'x','Basic '+f.issued.secret,'Bearer '+f.issued.secret.slice(0,-1)+'!'])failure(()=>authenticateFinanceApiKey(f.db,value),401);
    const reader=createFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,{name:'Reader',scopes:['movements:read'],expiresInDays:30});
    failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+reader.secret,'accounting:write'),403);
    failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+reader.secret,undefined,Date.parse(reader.key.expiresAt)),401);
    expect(authenticateFinanceApiKey(f.db,'Bearer '+reader.secret,'movements:read').organizationId).toBe(f.org.id);
    revokeFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,reader.key.id);revokeFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,reader.key.id);
    failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+reader.secret),401);
  }finally{f.db.close();}
});
test('credentials stop working when issuer membership, account or integration ceases to be active',async()=>{
  const f=await fixture();try{
    f.db.run("UPDATE finance_organization_members SET role='viewer' WHERE organization_id=? AND user_id='alice'",[f.org.id]);failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+f.issued.secret),401);
    f.db.run("UPDATE finance_organization_members SET role='owner',disabled_at='2026-10-12' WHERE organization_id=? AND user_id='alice'",[f.org.id]);failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+f.issued.secret),401);
    f.db.run("UPDATE finance_organization_members SET disabled_at=NULL WHERE organization_id=? AND user_id='alice'",[f.org.id]);
    f.db.run("UPDATE users SET merged_into='bob' WHERE id='alice'");failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+f.issued.secret),401);
    f.db.run("UPDATE users SET merged_into=NULL WHERE id='alice'");f.db.run('UPDATE finance_integrations SET disabled_at=? WHERE id=?',['2026-10-12',f.integration.id]);failure(()=>authenticateFinanceApiKey(f.db,'Bearer '+f.issued.secret),401);
  }finally{f.db.close();}
});
test('usage limits are persistent and atomic; exceeded requests do not alter counters',async()=>{
  const f=await fixture();try{
    recordFinanceApiUse(f.db,f.principal);expect((f.db.query('SELECT requests FROM finance_api_usage').get() as {requests:number}).requests).toBe(1);
    f.db.run('UPDATE finance_api_usage SET requests=10000');failure(()=>recordFinanceApiUse(f.db,f.principal),429);
    expect((f.db.query('SELECT requests FROM finance_api_usage').get() as {requests:number}).requests).toBe(10000);
    expect(listFinanceApiKeys(f.db,'alice',f.org.id,f.integration.id)[0].lastUsedAt).not.toBeNull();
  }finally{f.db.close();}
});
test('accounting acknowledgement records exact immutable exported versions and remains separate from file generation',async()=>{
  const f=await fixture();try{
    const before=readFinanceExportBatch(f.db,'alice',f.org.id,f.wallet.id,f.batch.id);
    const result=acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack());
    expect(result).toMatchObject({acknowledgedCount:2,batchMovementCount:2,batchAccountingStatus:'acknowledged'});
    expect(result.acknowledgements).toHaveLength(2);expect(result.acknowledgements[0]).toMatchObject({decisionVersion:1,externalRecordId:'ERP-JOURNAL-001',integrationId:f.integration.id});
    expect(acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack())).toEqual(result);
    expect(readFinanceExportBatch(f.db,'alice',f.org.id,f.wallet.id,f.batch.id)).toEqual(before);
    expect(before.payload.readyForPosting).toBe(false);expect(before.accountingStatus).toBe('not_submitted');expect(before.payload.records[0].movement.raw18).toBe('100000000000000001');expect(before.payload.fees).toHaveLength(1);
    expect(()=>f.db.run("UPDATE finance_accounting_acknowledgements SET external_record_id='changed'")).toThrow('immutable');
  }finally{f.db.close();}
});
test('partial acknowledgement is explicit; invalid or conflicting records roll back the entire request',async()=>{
  const f=await fixture();try{
    const partial=acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack([{movementId:f.ids[0],decisionVersion:1,externalRecordId:'ONE'}]));expect(partial).toMatchObject({acknowledgedCount:1,batchMovementCount:2,batchAccountingStatus:'partial'});
    failure(()=>acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,{...f.ack(),contentHash:'f'.repeat(64)}),409);
    failure(()=>acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack([{movementId:f.ids[1],decisionVersion:2,externalRecordId:'TWO'}],'bad-version')),409);
    failure(()=>acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack([{movementId:f.ids[0],decisionVersion:1,externalRecordId:'OTHER'}])),409);
    failure(()=>acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack([{movementId:f.ids[0],decisionVersion:1,externalRecordId:'ONE'},{movementId:f.ids[1],decisionVersion:1,externalRecordId:'TWO'}],'overlap')),409);
    expect(listFinanceAcknowledgements(f.db,'alice',f.org.id,f.integration.id)).toHaveLength(1);
    const done=acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack([{movementId:f.ids[1],decisionVersion:1,externalRecordId:'TWO'}],'ack-two'));expect(done.batchAccountingStatus).toBe('acknowledged');
    expect(()=>f.db.run('DELETE FROM finance_accounting_acknowledgements')).toThrow('immutable');
    expect(()=>f.db.run('UPDATE finance_accounting_ack_requests SET request_hash=?',['x'])).toThrow('immutable');
  }finally{f.db.close();}
});
test('historical acknowledgement survives a decision change while original version and tenant identity are retained',async()=>{
  const f=await fixture();try{
    updateFinanceMovementDecision(f.db,'alice',f.org.id,f.wallet.id,f.ids[0],{category:'collection',reference:'INV-NEW',status:'review',expectedVersion:1});
    const result=acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack());expect(result.acknowledgements.find(a=>a.movementId===f.ids[0])?.decisionVersion).toBe(1);
    const other=createFinanceOrganization(f.db,'bob',{name:'Other'}),otherIntegration=createFinanceIntegration(f.db,'bob',other.id,{name:'Other ERP'}),otherKey=createFinanceApiKey(f.db,'bob',other.id,otherIntegration.id,{name:'Other',scopes:['accounting:write'],expiresInDays:30});
    failure(()=>acknowledgeFinanceExport(f.db,authenticateFinanceApiKey(f.db,'Bearer '+otherKey.secret),f.wallet.id,f.batch.id,f.ack()),404);
    failure(()=>listFinanceAcknowledgements(f.db,'bob',f.org.id,f.integration.id),404);
    revokeFinanceApiKey(f.db,'alice',f.org.id,f.integration.id,f.issued.key.id);failure(()=>acknowledgeFinanceExport(f.db,f.principal,f.wallet.id,f.batch.id,f.ack()),401);
  }finally{f.db.close();}
});
