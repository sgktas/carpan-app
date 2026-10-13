import {describe,expect,it} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createHmac} from 'node:crypto';
import {encodeAbiParameters,encodeEventTopics,type TransactionReceipt} from 'viem';
import {ensurePersonalFinanceOrganization,initFinanceOrganizations,registerFinanceBusinessWallet,FinanceOrganizationError} from './financeOrganizations';
import {initFinanceOperationsStore,saveFinanceOperationScan,updateFinanceMovementDecision,createFinanceExportBatch,readFinanceExportBatch} from './financeOperationsStore';
import {FINANCE_SYSTEM_EMITTER,financeMovementTransferEvent,scanFinanceMovements,type FinanceMovementReader,type FinanceMovementLog} from './financeMovements';
import {initFinanceWebhooks,configureFinanceWebhook,getFinanceWebhookEndpoint,listFinanceWebhookDeliveries,getFinanceWebhookDelivery,queueFinanceWebhook,retryFinanceWebhook,runFinanceWebhookWorker,isPublicFinanceWebhookAddress,type FinanceWebhookOptions,type FinanceWebhookTransportInput} from './financeWebhooks';

const wallet='0x'+'1'.repeat(40),peer='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),base=Date.parse('2026-10-12T12:00:00.000Z'),key='3'.repeat(64);
const options:FinanceWebhookOptions={encryptionKey:key,resolve:async()=>[{address:'8.8.8.8',family:4}],now:()=>base};
async function fixture(){
  const db=new Database(':memory:');db.run('PRAGMA foreign_keys=ON');db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT,merged_into TEXT)');db.run('INSERT INTO users VALUES(?,?,?,NULL),(?,?,?,NULL)',['alice',wallet,'2026-10-12','bob',peer,'2026-10-12']);initFinanceOrganizations(db);initFinanceOperationsStore(db);
  const orgId=ensurePersonalFinanceOrganization(db,'alice').id,walletId=registerFinanceBusinessWallet(db,'alice',orgId,{chainId:5042,address:wallet,label:'Treasury'}).id;
  db.run('CREATE TABLE finance_integrations(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,disabled_at TEXT,FOREIGN KEY(organization_id) REFERENCES finance_organizations(id))');db.run('INSERT INTO finance_integrations VALUES(?,?,?,?,?,NULL)',['erp',orgId,'Accounting program',new Date(base).toISOString(),'alice']);initFinanceWebhooks(db);
  const event:FinanceMovementLog={address:FINANCE_SYSTEM_EMITTER,transactionHash:hash,blockNumber:5000n,blockHash,logIndex:0,removed:false,data:encodeAbiParameters([{type:'uint256'}],[100000000000000001n]),topics:encodeEventTopics({abi:[financeMovementTransferEvent],eventName:'Transfer',args:{from:peer as `0x${string}`,to:wallet as `0x${string}`}})};
  const reader:FinanceMovementReader={chainId:async()=>5042,latest:async()=>({number:5000n,hash:blockHash,timestamp:1791806400n}),logs:async(_w,_f,_t,direction)=>direction==='in'?[event]:[],receipt:async()=>({status:'success',transactionHash:hash,blockNumber:5000n,blockHash,from:peer,gasUsed:21000n,effectiveGasPrice:20000000000n,logs:[event]} as unknown as TransactionReceipt),block:async(number)=>({number,hash:blockHash,timestamp:1791806400n})};
  const scan=await scanFinanceMovements(wallet,reader,{now:base}),movementId=scan.movements[0].id;saveFinanceOperationScan(db,'alice',orgId,walletId,scan);updateFinanceMovementDecision(db,'alice',orgId,walletId,movementId,{category:'collection',reference:'INV-001',counterpartyId:null,status:'approved',expectedVersion:0});
  const batch=createFinanceExportBatch(db,'alice',orgId,walletId,{ids:[movementId],expectedVersions:{[movementId]:1},idempotencyKey:'fixture-export-001'});
  return {db,orgId,walletId,batchId:batch.id,batch};
}
function failure(call:()=>unknown,status:number){try{call();throw new Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(FinanceOrganizationError);expect((error as FinanceOrganizationError).status).toBe(status);}}
async function asyncFailure(call:()=>Promise<unknown>,status:number){try{await call();throw new Error('Expected failure');}catch(error){expect(error).toBeInstanceOf(FinanceOrganizationError);expect((error as FinanceOrganizationError).status).toBe(status);}}
async function setup(f:Awaited<ReturnType<typeof fixture>>,extra:FinanceWebhookOptions={}){return configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url:'https://payments.company.com/carpan',enabled:true},{...options,...extra});}
function queued(f:Awaited<ReturnType<typeof fixture>>,extra:FinanceWebhookOptions={}){return queueFinanceWebhook(f.db,'alice',f.orgId,'erp',f.walletId,f.batchId,{...options,...extra});}

describe('Finance webhook destination and signing policy',()=>{
  it('rejects private, reserved, mapped, transitional and documentation addresses with conservative global IPv6 support',()=>{
    const blocked=['0.0.0.0','10.1.2.3','127.0.0.1','100.64.0.1','100.127.255.255','169.254.169.254','172.16.0.1','172.31.255.254','192.168.0.1','192.0.0.9','192.0.2.1','192.88.99.1','198.18.0.1','198.19.255.1','198.51.100.1','203.0.113.1','224.0.0.1','240.1.1.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:7f00:1','64:ff9b::7f00:1','64:ff9b:1::7f00:1','100::1','2001::1','2001:2::1','2001:10::1','2001:20::1','2001:db8::1','2002:7f00:1::1','3fff::1','fc00::1','fe80::1','ff02::1','2606:4700::1%eth0','not-an-ip'];
    for(const address of blocked)expect(isPublicFinanceWebhookAddress(address)).toBe(false);
    for(const address of ['8.8.8.8','1.1.1.1','172.32.0.1','100.128.0.1','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888','2a03:2880:f003:c07:face:b00c::2'])expect(isPublicFinanceWebhookAddress(address)).toBe(true);
  });
  it('validates normalized URL literals, TLS, ports, credentials and metadata without any network',async()=>{
    const f=await fixture();try{
      for(const url of ['http://payments.company.com/a','https://alice:password@payments.company.com/a','https://@payments.company.com/a','https://payments.company.com/a?token=private','https://payments.company.com/a?','https://payments.company.com/a#section','https://payments.company.com/a#','https://payments.company.com:8443/a','https://localhost/a','https://app.internal/a','https://payments.company.com./a','https://127.0.0.1/a','https://2130706433/a','https://0x7f000001/a','https://[::ffff:7f00:1]/a','https://[2001:db8::1]/a'])await asyncFailure(()=>configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url,enabled:true},options),400);
      expect(getFinanceWebhookEndpoint(f.db,'alice',f.orgId,'erp')).toBeNull();
      await asyncFailure(()=>setup(f,{resolve:async()=>[{address:'8.8.8.8',family:4},{address:'10.1.2.3',family:4}]}),400);
      await asyncFailure(()=>setup(f,{resolve:async()=>{throw new Error('secret internal host credentials');}}),400);
      await asyncFailure(()=>setup(f,{resolve:async()=>[{address:'8.8.8.8',family:6}]}),400);
    }finally{f.db.close();}
  });
  it('requires encryption, exposes signing secret only on creation/rotation and stores authenticated ciphertext',async()=>{
    const f=await fixture();try{
      await asyncFailure(()=>setup(f,{encryptionKey:''}),503);expect(getFinanceWebhookEndpoint(f.db,'alice',f.orgId,'erp')).toBeNull();
      const first=await setup(f);expect(first.signingSecret).toMatch(/^whsec_[a-zA-Z0-9_-]{43}$/);expect(first.endpoint.version).toBe(1);
      const row=f.db.query('SELECT * FROM finance_webhook_endpoints').get() as Record<string,unknown>;expect(JSON.stringify(row)).not.toContain(first.signingSecret!);expect(JSON.stringify(getFinanceWebhookEndpoint(f.db,'alice',f.orgId,'erp'))).not.toContain(first.signingSecret!);
      expect((await setup(f)).signingSecret).toBeUndefined();expect((await setup(f)).endpoint.version).toBe(1);
      const rotated=await configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url:first.endpoint.url,enabled:true,rotateSecret:true},options);expect(rotated.endpoint.version).toBe(2);expect(rotated.signingSecret).not.toBe(first.signingSecret);
      await asyncFailure(()=>setup(f,{encryptionKey:'4'.repeat(64)}),503);failure(()=>queued(f,{encryptionKey:'4'.repeat(64)}),503);
      f.db.run("UPDATE finance_webhook_endpoints SET secret_ciphertext='{}'");failure(()=>queued(f),503);
    }finally{f.db.close();}
  });
  it('enforces current organization management and same-company identifiers before DNS or data access',async()=>{
    const f=await fixture();try{
      let called=0;const resolve:FinanceWebhookOptions['resolve']=async()=>{called++;return [{address:'8.8.8.8',family:4}];};
      await asyncFailure(()=>configureFinanceWebhook(f.db,'bob',f.orgId,'erp',{url:'https://payments.company.com/a',enabled:true},{...options,resolve}),404);expect(called).toBe(0);
      f.db.run("INSERT INTO finance_organization_members VALUES(?,?,'viewer',?,NULL)",[f.orgId,'bob','2026-10-12']);await asyncFailure(()=>configureFinanceWebhook(f.db,'bob',f.orgId,'erp',{url:'https://payments.company.com/a',enabled:true},{...options,resolve}),403);expect(called).toBe(0);
      await setup(f);expect(getFinanceWebhookEndpoint(f.db,'bob',f.orgId,'erp')?.url).toContain('company.com');failure(()=>queueFinanceWebhook(f.db,'bob',f.orgId,'erp',f.walletId,f.batchId,options),403);
      failure(()=>queueFinanceWebhook(f.db,'alice',f.orgId,'missing',f.walletId,f.batchId,options),404);failure(()=>queueFinanceWebhook(f.db,'alice',f.orgId,'erp',f.walletId,'missing-batch',options),404);
    }finally{f.db.close();}
  });
});

describe('Finance immutable outbox and retry worker',()=>{
  it('queues a stable immutable event once and signs exact bytes; 2xx never means accounting posting',async()=>{
    const f=await fixture();try{
      const config=await setup(f),first=queued(f);expect(queued(f)).toEqual(first);let request:FinanceWebhookTransportInput|undefined;
      const summary=await runFinanceWebhookWorker(f.db,{...options,transport:async input=>{request=input;return {status:202,responseBytes:2};}});expect(summary).toEqual({claimed:1,delivered:1,retried:0,failed:0,cancelled:0});
      const value=request!;expect(value.address).toEqual({address:'8.8.8.8',family:4});expect(value.timeoutMs).toBe(10000);expect(value.responseLimit).toBe(4096);
      const event=JSON.parse(value.body);expect(event.id).toBe(first.eventId);expect(event.schema).toBe('carpan.finance.webhook.v1');expect(event.batch).toEqual(f.batch);expect(event.batch.payload.records[0].movement.raw18).toBe('100000000000000001');expect(event.batch.payload.fees).toHaveLength(1);
      expect(value.headers['Carpan-Event-Id']).toBe(event.id);expect(value.headers['Carpan-Signature']).toBe('v1='+createHmac('sha256',config.signingSecret!).update(`${value.headers['Carpan-Timestamp']}.${value.body}`).digest('hex'));
      const saved=getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',first.id);expect(saved.status).toBe('delivered');expect(saved.attemptHistory).toHaveLength(1);expect(saved.lastHttpStatus).toBe(202);expect(readFinanceExportBatch(f.db,'alice',f.orgId,f.walletId,f.batchId).accountingStatus).toBe('not_submitted');expect(event.batch.payload.readyForPosting).toBe(false);
      expect(()=>f.db.run("UPDATE finance_webhook_deliveries SET payload_json='{}' WHERE id=?",[first.id])).toThrow();expect(()=>f.db.run('DELETE FROM finance_webhook_attempts')).toThrow();expect(()=>f.db.run("UPDATE finance_webhook_audit SET action='changed'")).toThrow();expect(retryFinanceWebhook(f.db,'alice',f.orgId,'erp',first.id,options).status).toBe('delivered');
    }finally{f.db.close();}
  });
  it('retains exact event/body across retries with fresh timestamps and exponential backoff',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f),inputs:FinanceWebhookTransportInput[]=[];let clock=base;
      const worker={...options,now:()=>clock,transport:async(input:FinanceWebhookTransportInput)=>{inputs.push(input);return {status:inputs.length===1?503:200};}};
      expect((await runFinanceWebhookWorker(f.db,worker)).retried).toBe(1);expect(getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id).nextAttemptAt).toBe(new Date(base+30000).toISOString());
      expect((await runFinanceWebhookWorker(f.db,worker)).claimed).toBe(0);clock+=30000;expect((await runFinanceWebhookWorker(f.db,worker)).delivered).toBe(1);
      expect(inputs[1].body).toBe(inputs[0].body);expect(inputs[1].headers['Carpan-Event-Id']).toBe(inputs[0].headers['Carpan-Event-Id']);expect(inputs[1].headers['Carpan-Timestamp']).not.toBe(inputs[0].headers['Carpan-Timestamp']);expect(inputs[1].headers['Carpan-Signature']).not.toBe(inputs[0].headers['Carpan-Signature']);
      const saved=getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id);expect(saved.attempts).toBe(2);expect(saved.attemptHistory.map(attempt=>attempt.status)).toEqual(['delivered','retry']);
    }finally{f.db.close();}
  });
  it('stops automatic retries after eight attempts and permits bounded explicit retry without erasing history',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f);let clock=base;const worker={...options,now:()=>clock,transport:async()=>{throw new Error('private secret response and password');}};
      for(let i=1;i<=8;i++){const summary=await runFinanceWebhookWorker(f.db,worker);expect(summary.claimed).toBe(1);const value=getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id);expect(value.attempts).toBe(i);expect(value.lastError).toBe('network_error');if(i<8){expect(value.status).toBe('pending');clock=Date.parse(value.nextAttemptAt!);}else{expect(value.status).toBe('failed');expect(value.nextAttemptAt).toBeNull();}}
      expect((await runFinanceWebhookWorker(f.db,worker)).claimed).toBe(0);const retried=retryFinanceWebhook(f.db,'alice',f.orgId,'erp',item.id,{...options,now:()=>clock});expect(retried.status).toBe('pending');expect(retried.attempts).toBe(8);expect(retried.manualRetries).toBe(1);
      expect((await runFinanceWebhookWorker(f.db,{...worker,transport:async()=>({status:200})})).delivered).toBe(1);expect(getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id).attemptHistory).toHaveLength(9);
    }finally{f.db.close();}
  });
  it('never follows redirects and bounds response size with sanitized failure details',async()=>{
    for(const response of [{status:302,responseBytes:0},{status:200,responseBytes:4097}]){
      const f=await fixture();try{await setup(f);const item=queued(f);let calls=0;const summary=await runFinanceWebhookWorker(f.db,{...options,transport:async()=>{calls++;return response;}});expect(summary.retried).toBe(1);expect(calls).toBe(1);const saved=getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id);expect(saved.lastError).toBe(response.status===302?'redirect_rejected':'response_limit');expect(saved.deliveredAt).toBeNull();}finally{f.db.close();}
    }
  });
  it('resolves and verifies DNS on every attempt, rejecting private or mixed answers before transport',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f);let calls=0;const summary=await runFinanceWebhookWorker(f.db,{...options,resolve:async()=>[{address:'1.1.1.1',family:4},{address:'169.254.169.254',family:4}],transport:async()=>{calls++;return {status:200};}});expect(calls).toBe(0);expect(summary.failed).toBe(1);expect(getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id).lastError).toBe('destination_rejected');
    }finally{f.db.close();}
  });
  it('cancels pending and in-flight events when endpoint version changes and requires explicit requeue',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f);let release!:()=>void,started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;});
      const run=runFinanceWebhookWorker(f.db,{...options,transport:async()=>{started();await blocked;return {status:200};}});await entered;
      const changed=await configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url:'https://payments.company.com/new',enabled:true},options);expect(changed.endpoint.version).toBe(2);expect(changed.signingSecret).toBeUndefined();release();await run;
      const saved=getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id);expect(saved.status).toBe('cancelled');expect(saved.deliveredAt).toBeNull();failure(()=>retryFinanceWebhook(f.db,'alice',f.orgId,'erp',item.id,options),409);
      const next=queued(f);expect(next.id).not.toBe(item.id);expect(next.endpointVersion).toBe(2);expect(listFinanceWebhookDeliveries(f.db,'alice',f.orgId,'erp').items).toHaveLength(2);
    }finally{f.db.close();}
  });
  it('rechecks manager, integration and wallet authority after DNS await',async()=>{
    for(const change of ['member','integration','wallet']){
      const f=await fixture();try{
        await setup(f);const item=queued(f);let calls=0;const summary=await runFinanceWebhookWorker(f.db,{...options,resolve:async()=>{if(change==='member')f.db.run("UPDATE finance_organization_members SET role='viewer' WHERE user_id='alice'");if(change==='integration')f.db.run("UPDATE finance_integrations SET disabled_at='2026-10-12' WHERE id='erp'");if(change==='wallet')f.db.run("UPDATE finance_business_wallets SET disabled_at='2026-10-12' WHERE id=?",[f.walletId]);return [{address:'8.8.8.8',family:4}];},transport:async()=>{calls++;return {status:200};}});expect(calls).toBe(0);expect(summary.cancelled).toBe(1);expect(f.db.query('SELECT status,last_error FROM finance_webhook_deliveries WHERE id=?').get(item.id)).toEqual({status:'cancelled',last_error:'scope_disabled'});
      }finally{f.db.close();}
    }
  });
  it('uses exclusive leases across overlapping workers and recovers interrupted attempts without changing event identity',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f);let started!:()=>void,release!:()=>void,calls=0;const entered=new Promise<void>(resolve=>{started=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;});
      const first=runFinanceWebhookWorker(f.db,{...options,transport:async()=>{calls++;started();await blocked;return {status:200};}});await entered;expect((await runFinanceWebhookWorker(f.db,{...options,transport:async()=>{calls++;return {status:200};}})).claimed).toBe(0);expect(calls).toBe(1);release();await first;
      await configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url:'https://payments.company.com/recovery',enabled:true},options);const recovery=queued(f);
      f.db.run("UPDATE finance_webhook_deliveries SET status='delivering',attempts=1,cycle_attempts=1,lease_token='dead-worker',lease_expires_at=? WHERE id=?",[new Date(base+30000).toISOString(),recovery.id]);let eventId='';
      const result=await runFinanceWebhookWorker(f.db,{...options,now:()=>base+31000,transport:async input=>{eventId=input.headers['Carpan-Event-Id'];return {status:200};}});expect(result.delivered).toBe(1);expect(eventId).toBe(recovery.eventId);const saved=getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',recovery.id);expect(saved.attempts).toBe(2);expect(saved.attemptHistory[1].error).toBe('lease_expired');expect(item.eventId).not.toBe(eventId);
    }finally{f.db.close();}
  });
  it('does not send when signing is unavailable and expires old pending deliveries without contacting a target',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f);let calls=0;const transport:FinanceWebhookOptions['transport']=async()=>{calls++;return {status:200};};
      expect((await runFinanceWebhookWorker(f.db,{...options,encryptionKey:'',transport})).skippedReason).toBe('signing_not_configured');expect(getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp',item.id).attempts).toBe(0);
      expect((await runFinanceWebhookWorker(f.db,{...options,now:()=>base+86400000,transport})).failed).toBe(1);expect(calls).toBe(0);failure(()=>retryFinanceWebhook(f.db,'alice',f.orgId,'erp',item.id,{...options,now:()=>base+86400000}),409);
    }finally{f.db.close();}
  });
  it('rejects oversized immutable exports as a whole and respects queue and worker limits',async()=>{
    const f=await fixture();try{
      await setup(f);const oversized={...f.batch.payload,large:'x'.repeat(512*1024)};f.db.run('INSERT INTO finance_export_batches SELECT ?,organization_id,wallet_id,wallet,?,request_json,?,content_hash,movement_count,created_at,created_by FROM finance_export_batches WHERE id=?',['oversized-batch','oversized-batch-key',JSON.stringify(oversized),f.batchId]);
      failure(()=>queueFinanceWebhook(f.db,'alice',f.orgId,'erp',f.walletId,'oversized-batch',options),409);expect(listFinanceWebhookDeliveries(f.db,'alice',f.orgId,'erp').items).toHaveLength(0);
      const item=queued(f);const seed=f.db.transaction(()=>{for(let i=2;i<=1001;i++)f.db.run("INSERT INTO finance_webhook_deliveries(id,event_id,organization_id,integration_id,endpoint_id,endpoint_version,wallet_id,batch_id,payload_json,status,next_attempt_at,created_at,created_by) SELECT ?,?,organization_id,integration_id,endpoint_id,?,wallet_id,batch_id,payload_json,'pending',next_attempt_at,created_at,created_by FROM finance_webhook_deliveries WHERE id=?",['queued-'+i,'event-'+i,i,item.id]);});seed();
      f.db.run('INSERT INTO finance_export_batches SELECT ?,organization_id,wallet_id,wallet,?,request_json,payload_json,content_hash,movement_count,created_at,created_by FROM finance_export_batches WHERE id=?',['second-batch','second-batch-key',f.batchId]);failure(()=>queueFinanceWebhook(f.db,'alice',f.orgId,'erp',f.walletId,'second-batch',options),409);
      await configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url:'https://payments.company.com/next',enabled:true},options); // old queues cancelled by version change
      expect(listFinanceWebhookDeliveries(f.db,'alice',f.orgId,'erp').nextCursor).not.toBeNull();expect(queued(f).endpointVersion).toBe(2);
      await asyncFailure(()=>runFinanceWebhookWorker(f.db,{...options,batchSize:21}),400);await asyncFailure(()=>runFinanceWebhookWorker(f.db,{...options,concurrency:5}),400);
    }finally{f.db.close();}
  });
  it('keeps delivery history scoped, disabled endpoints inactive and explicit retries bounded',async()=>{
    const f=await fixture();try{
      await setup(f);const item=queued(f);failure(()=>listFinanceWebhookDeliveries(f.db,'bob',f.orgId,'erp'),404);failure(()=>getFinanceWebhookDelivery(f.db,'bob',f.orgId,'erp',item.id),404);failure(()=>getFinanceWebhookDelivery(f.db,'alice',f.orgId,'erp','unknown-delivery'),404);failure(()=>listFinanceWebhookDeliveries(f.db,'alice',f.orgId,'erp','bad-cursor'),400);
      for(let i=0;i<3;i++){f.db.run("UPDATE finance_webhook_deliveries SET status='failed',cycle_attempts=8,next_attempt_at=NULL WHERE id=?",[item.id]);expect(retryFinanceWebhook(f.db,'alice',f.orgId,'erp',item.id,options).manualRetries).toBe(i+1);}
      f.db.run("UPDATE finance_webhook_deliveries SET status='failed',cycle_attempts=8,next_attempt_at=NULL WHERE id=?",[item.id]);failure(()=>retryFinanceWebhook(f.db,'alice',f.orgId,'erp',item.id,options),409);
      await configureFinanceWebhook(f.db,'alice',f.orgId,'erp',{url:'https://payments.company.com/carpan',enabled:false},options);expect(getFinanceWebhookEndpoint(f.db,'alice',f.orgId,'erp')?.enabled).toBe(false);failure(()=>queued(f),409);let calls=0;expect((await runFinanceWebhookWorker(f.db,{...options,transport:async()=>{calls++;return {status:200};}})).claimed).toBe(0);expect(calls).toBe(0);
    }finally{f.db.close();}
  });
});
