import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import express,{Router,type Request,type RequestHandler,type Response as ExpressResponse} from 'express';
import {encodeAbiParameters,encodeEventTopics,type TransactionReceipt} from 'viem';
import type {FinanceMovementScan} from '../src/finance-movements';
import {createAuthRequestGuard} from './authRequestGuard';
import {initFinanceOrganizations,createFinanceOrganization,registerFinanceBusinessWallet} from './financeOrganizations';
import {initFinanceOperationsStore,saveFinanceOperationScan,updateFinanceMovementDecision,createFinanceExportBatch,readFinanceOperationState,type FinanceExportBatch} from './financeOperationsStore';
import {FINANCE_SYSTEM_EMITTER,financeMovementTransferEvent,normalizeFinanceReceipt} from './financeMovements';
import {initFinanceIntegrations,createFinanceIntegration,createFinanceApiKey,revokeFinanceApiKey,type FinanceApiScope} from './financeIntegrations';
import {initFinanceWebhooks} from './financeWebhooks';
import {createFinanceIntegrationsRoutes,createFinanceExternalApiRoutes} from './financeIntegrationsRoutes';

const addressA='0x'+'1'.repeat(40),addressB='0x'+'2'.repeat(40),peer='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
type Init={method?:string;cookie?:string;body?:unknown;headers?:Record<string,string>;ip?:string};
type RouteRequest=(path:string,init?:Init)=>Promise<Response>;
type Fixture={db:Database;request:RouteRequest;org:string;otherOrg:string;wallet:string;otherWallet:string;integration:string;internal:string;external:string;ids:string[];batch:FinanceExportBatch;issue:(scopes:FinanceApiScope[],now?:number)=>ReturnType<typeof createFinanceApiKey>};

function scan(wallet:string,count:number):FinanceMovementScan{
  const logs=Array.from({length:count},(_,logIndex)=>({address:FINANCE_SYSTEM_EMITTER,transactionHash:hash,blockNumber:5000n,blockHash,logIndex,removed:false,
    data:encodeAbiParameters([{type:'uint256'}],[1000000000000000000n+BigInt(logIndex)]),
    topics:encodeEventTopics({abi:[financeMovementTransferEvent],eventName:'Transfer',args:{from:peer as `0x${string}`,to:wallet as `0x${string}`}})}));
  const receipt={transactionHash:hash,blockNumber:5000n,blockHash,status:'success',from:peer,gasUsed:21000n,effectiveGasPrice:20000000000n,logs} as unknown as TransactionReceipt;
  const normalized=normalizeFinanceReceipt(receipt,1791792000n,wallet);
  return {wallet,movements:normalized.movements,fees:[normalized.fee],unmappedAliases:normalized.unmappedAliases,warnings:normalized.warnings,
    coverage:{wallet,fromBlock:'3977',toBlock:'5000',toBlockHash:blockHash,fetchedAt:new Date().toISOString(),checkedTransactions:1,candidateTransactions:1,failedTransactions:0,truncated:false,blockWindow:1024,transactionLimit:20,eventLimit:100,complete:true,scope:'bounded_usdc_transfers',includesGas:true,includesGasOnlyTransactions:false}};
}
async function withRoutes(run:(fixture:Fixture)=>Promise<void>,movementCount=2){
  const db=new Database(':memory:');db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT,merged_into TEXT)');
  db.run('INSERT INTO users VALUES(?,?,?,NULL)',['alice',addressA,'2026-10-12T00:00:00.000Z']);
  db.run('INSERT INTO users VALUES(?,?,?,NULL)',['bob',addressB,'2026-10-12T00:00:00.000Z']);
  db.run('CREATE TABLE arc_collection_requests(id TEXT PRIMARY KEY,user_id TEXT,recipient TEXT,cancelled INTEGER)');
  initFinanceOrganizations(db);initFinanceOperationsStore(db);initFinanceIntegrations(db);initFinanceWebhooks(db);
  const org=createFinanceOrganization(db,'alice',{name:'Alice Trading'}).id,otherOrg=createFinanceOrganization(db,'bob',{name:'Bob Trading'}).id;
  const wallet=registerFinanceBusinessWallet(db,'alice',org,{chainId:5042,address:addressA,label:'Treasury'}).id;
  const otherWallet=registerFinanceBusinessWallet(db,'bob',otherOrg,{chainId:5042,address:addressB,label:'Treasury'}).id;
  saveFinanceOperationScan(db,'alice',org,wallet,scan(addressA,movementCount));
  saveFinanceOperationScan(db,'bob',otherOrg,otherWallet,scan(addressB,1));
  const ids=readFinanceOperationState(db,'alice',org,wallet).scan!.movements.map(m=>m.id);
  for(const id of ids)updateFinanceMovementDecision(db,'alice',org,wallet,id,{category:'collection',reference:'INV-'+id.slice(-2),counterpartyId:null,status:'approved',expectedVersion:0});
  const batch=createFinanceExportBatch(db,'alice',org,wallet,{ids,idempotencyKey:'route-fixture-batch',expectedVersions:Object.fromEntries(ids.map(id=>[id,1]))});
  const integration=createFinanceIntegration(db,'alice',org,{name:'Accounting software'}).id;
  const auth:RequestHandler=(req,res,next)=>{
    const userId=req.headers.cookie==='session=alice'?'alice':req.headers.cookie==='session=bob'?'bob':null;
    if(!userId)return void res.status(401).json({error:'Unauthorized'});
    (req as Request&{userId:string}).userId=userId;next();
  };
  const router=Router(),app=express();
  router.use('/finance/integrations',createAuthRequestGuard('https://carpan.app',()=>{}),createFinanceIntegrationsRoutes(db,auth));
  router.use('/v1/finance',createFinanceExternalApiRoutes(db));
  // Actual Express handlers and SQLite, with response capture instead of a socket.
  const request:RouteRequest=(path,init={})=>new Promise(resolve=>{
    const query=app.get('query parser fn')(new URL(path,'https://carpan.app').search.slice(1));
    const req=Object.assign(Object.create(express.request),{app,query,method:init.method||'GET',url:path,headers:{cookie:init.cookie||'',...init.headers},body:init.body,socket:{remoteAddress:init.ip||'127.0.0.1'}}) as Request;
    Object.defineProperty(req,'ip',{value:init.ip||'127.0.0.1'});
    const headers:Record<string,string>={};let status=200;
    const res={set(key:string,value:string){headers[key]=value;return this;},status(code:number){status=code;return this;},
      json(body:unknown){resolve(new Response(JSON.stringify(body),{status,headers}));return this;}} as unknown as ExpressResponse;
    router(req,res,(error?:unknown)=>resolve(new Response(JSON.stringify({error:error instanceof Error?error.message:'Not found'}),{status:error?500:404})));
  });
  try{await run({db,request,org,otherOrg,wallet,otherWallet,integration,ids,batch,internal:`/finance/integrations/organizations/${org}/${integration}`,external:`/v1/finance/wallets/${wallet}`,issue:(scopes,now)=>createFinanceApiKey(db,'alice',org,integration,{name:'ERP service',scopes,expiresInDays:30},now)});}finally{db.close();}
}
const owned=(body:Record<string,unknown>={})=>({cookie:'session=alice',body:{...body,ownerId:'alice'}});
const bearer=(secret:string)=>({headers:{authorization:'Bearer '+secret}});

test('integration management remains session-private, origin-guarded and owned by the current account',async()=>withRoutes(async({db,request,internal,integration})=>{
  expect((await request(internal)).status).toBe(401);
  const unauthorized=await request(internal,{cookie:'session=bob'});expect(unauthorized.status).toBe(404);expect(unauthorized.headers.get('cache-control')).toBe('private, no-store');
  const key={name:'ERP',scopes:['movements:read'],expiresInDays:30};
  for(const ownerId of [undefined,null,'bob',{},42]){
    const response=await request(internal+'/keys',{method:'POST',cookie:'session=alice',body:{...key,ownerId}});expect(response.status).toBe(409);
  }
  for(const headers of [{origin:'https://attacker.invalid'},{'sec-fetch-site':'cross-site'}]){
    const response=await request(internal+'/keys',{method:'POST',...owned(key),headers});expect(response.status).toBe(403);
  }
  expect(db.query('SELECT COUNT(*) AS n FROM finance_api_keys WHERE integration_id=?').get(integration)).toEqual({n:0});
  const issued=await request(internal+'/keys',{method:'POST',...owned(key),headers:{origin:'https://carpan.app'}});expect(issued.status).toBe(200);
  expect(issued.headers.get('cache-control')).toBe('private, no-store');
  const json=await issued.json() as {key:{id:string;prefix:string};secret:string};expect(json.secret).toMatch(/^carpan_live_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/);
  const details=await request(internal,{cookie:'session=alice'});expect(details.status).toBe(200);
  const serialized=JSON.stringify(await details.json());expect(serialized).not.toContain(json.secret);expect(serialized).not.toContain('secret_hash');expect(serialized).not.toContain('secretHash');
  const audit=JSON.stringify(db.query('SELECT details_json FROM finance_integration_audit').all());expect(audit).not.toContain(json.secret);
  const stored=db.query('SELECT secret_hash FROM finance_api_keys WHERE id=?').get(json.key.id) as {secret_hash:string};expect(stored.secret_hash).toMatch(/^[a-f0-9]{64}$/);expect(stored.secret_hash).not.toBe(json.secret);
}));

test('external Finance routes accept only a valid scoped Bearer credential and bind its company',async()=>withRoutes(async({db,request,org,otherOrg,wallet,otherWallet,external,issue})=>{
  const onlyCookie=await request('/v1/finance/wallets',{cookie:'session=alice'});expect(onlyCookie.status).toBe(401);expect(onlyCookie.headers.get('www-authenticate')).toBe('Bearer realm="Carpan Finance"');
  for(const authorization of ['','Basic fake','Bearer invalid','Bearer carpan_live_'+ 'a'.repeat(32)+'_'+'b'.repeat(43)])expect((await request('/v1/finance/wallets',{headers:{authorization}})).status).toBe(401);
  const movementKey=issue(['movements:read']),exportKey=issue(['exports:read']);
  const list=await request('/v1/finance/wallets',{...bearer(movementKey.secret),cookie:'session=bob',body:{organizationId:otherOrg,ownerId:'bob'}});expect(list.status).toBe(200);
  expect((await list.json() as {items:{id:string;organizationId:string}[]}).items.map(item=>[item.id,item.organizationId])).toEqual([[wallet,org]]);
  expect((await request('/v1/finance/wallets/'+otherWallet+'/movements',bearer(movementKey.secret))).status).toBe(404);
  expect((await request(external+'/exports',bearer(movementKey.secret))).status).toBe(403);
  expect((await request(external+'/movements',bearer(exportKey.secret))).status).toBe(403);
  expect((await request(external+'/refresh',{method:'POST',...bearer(movementKey.secret),body:{ownerId:'alice'}})).status).toBe(404);
  const page=await request(external+'/movements',bearer(movementKey.secret));expect(page.status).toBe(200);expect(page.headers.get('cache-control')).toBe('private, no-store');
  const payload=await page.json() as {records:{movement:{raw18:string;decimals:number}}[];fees:{raw18:string}[]};expect(payload.records).toHaveLength(2);expect(payload.records[0].movement.decimals).toBe(18);expect(payload.records[0].movement.raw18).toBe('1000000000000000001');expect(payload.fees).toHaveLength(1);
  expect((db.query('SELECT SUM(requests) AS n FROM finance_api_usage WHERE organization_id=?').get(org) as {n:number}).n).toBeGreaterThanOrEqual(2);
}));

test('movement cursor keeps pages bounded and rejects changed snapshots and cross-wallet replay',async()=>withRoutes(async({db,request,org,wallet,external,ids,issue})=>{
  const key=issue(['movements:read']),first=await request(external+'/movements',bearer(key.secret));expect(first.status).toBe(200);
  const page=await first.json() as {records:{movement:{id:string}}[];nextCursor:string};expect(page.records).toHaveLength(50);expect(page.nextCursor).toBeTruthy();
  const next=await request(external+'/movements?cursor='+page.nextCursor,bearer(key.secret));expect(next.status).toBe(200);
  const rest=await next.json() as {records:{movement:{id:string}}[];nextCursor:null};expect(rest.records).toHaveLength(1);expect(rest.nextCursor).toBeNull();
  expect(new Set([...page.records,...rest.records].map(item=>item.movement.id)).size).toBe(51);
  const tampered=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(page.nextCursor,'base64url').toString()),walletId:'foreign-wallet'})).toString('base64url');
  expect((await request(external+'/movements?cursor='+tampered,bearer(key.secret))).status).toBe(409);
  for(const cursor of ['%%%','a'.repeat(513),Buffer.from('[]').toString('base64url')])expect((await request(external+'/movements?cursor='+encodeURIComponent(cursor),bearer(key.secret))).status).toBe(400);
  updateFinanceMovementDecision(db,'alice',org,wallet,ids[0],{category:'collection',reference:'Changed by reviewer',counterpartyId:null,status:'review',expectedVersion:1});
  expect((await request(external+'/movements?cursor='+page.nextCursor,bearer(key.secret))).status).toBe(409);
},51));

test('external acknowledgements preserve immutable historical evidence and never mark a revised movement acknowledged',async()=>withRoutes(async({db,request,org,wallet,integration,external,ids,batch,issue})=>{
  const readKey=issue(['movements:read','exports:read']),writeKey=issue(['accounting:write']);
  const body={idempotencyKey:'erp-posting-001',contentHash:batch.contentHash,records:[{movementId:ids[0],decisionVersion:1,externalRecordId:'ERP-JOURNAL-001'}]};
  const path=external+'/exports/'+batch.id+'/acknowledgements';
  expect((await request(path,{method:'POST',...bearer(readKey.secret),body})).status).toBe(403);
  expect((await request(path,{method:'POST',...bearer(writeKey.secret),body:{...body,contentHash:'0'.repeat(64)}})).status).toBe(409);
  expect((await request(path,{method:'POST',...bearer(writeKey.secret),body:{...body,records:[{...body.records[0],decisionVersion:2}]}})).status).toBe(409);
  expect((await request(path,{method:'POST',...bearer(writeKey.secret),body:{...body,records:[body.records[0],body.records[0]]}})).status).toBe(400);
  expect(db.query('SELECT COUNT(*) AS n FROM finance_accounting_acknowledgements').get()).toEqual({n:0});
  const accepted=await request(path,{method:'POST',...bearer(writeKey.secret),body});expect(accepted.status).toBe(200);
  const acknowledgement=await accepted.json() as {acknowledgements:unknown[];acknowledgedCount:number;batchMovementCount:number;batchAccountingStatus:string};
  expect(acknowledgement.acknowledgements).toHaveLength(1);expect(acknowledgement.acknowledgedCount).toBe(1);expect(acknowledgement.batchMovementCount).toBe(2);expect(acknowledgement.batchAccountingStatus).toBe('partial');
  const replay=await request(path,{method:'POST',...bearer(writeKey.secret),body});expect(replay.status).toBe(200);expect(await replay.json()).toEqual(acknowledgement);
  expect((await request(path,{method:'POST',...bearer(writeKey.secret),body:{...body,records:[{...body.records[0],externalRecordId:'Changed'}]}})).status).toBe(409);
  expect((await request(path,{method:'POST',...bearer(writeKey.secret),body:{...body,idempotencyKey:'erp-another-key'}})).status).toBe(409);
  const page=await (await request(external+'/movements',bearer(readKey.secret))).json() as {records:{movement:{id:string};accountingAcknowledgement:unknown}[]};
  expect(page.records.find(row=>row.movement.id===ids[0])?.accountingAcknowledgement).toMatchObject({externalRecordId:'ERP-JOURNAL-001',decisionVersion:1});expect(page.records.find(row=>row.movement.id===ids[1])?.accountingAcknowledgement).toBeNull();
  updateFinanceMovementDecision(db,'alice',org,wallet,ids[0],{category:'collection',reference:'Revised local review',counterpartyId:null,status:'review',expectedVersion:1});
  const changed=await (await request(external+'/movements',bearer(readKey.secret))).json() as {records:{movement:{id:string};decision:{version:number};accountingAcknowledgement:unknown}[]};
  expect(changed.records.find(row=>row.movement.id===ids[0])).toMatchObject({decision:{version:2},accountingAcknowledgement:null});
  const exported=await (await request(external+'/exports/'+batch.id,bearer(readKey.secret))).json();expect(exported).toEqual(batch);
  expect(db.query('SELECT COUNT(*) AS n FROM finance_accounting_acknowledgements WHERE organization_id=? AND integration_id=?').get(org,integration)).toEqual({n:1});
  expect(()=>db.run('UPDATE finance_accounting_acknowledgements SET external_record_id=?',['tamper'])).toThrow();
}));

test('each Bearer request rejects expired, revoked, demoted, removed and merged issuers without cookie fallback',async()=>withRoutes(async({db,request,org,integration,issue})=>{
  const expired=issue(['movements:read'],Date.now()-31*86400000);expect((await request('/v1/finance/wallets',bearer(expired.secret))).status).toBe(401);
  const revoked=issue(['movements:read']);revokeFinanceApiKey(db,'alice',org,integration,revoked.key.id);expect((await request('/v1/finance/wallets',{...bearer(revoked.secret),cookie:'session=alice'})).status).toBe(401);
  const active=issue(['movements:read']);expect((await request('/v1/finance/wallets',bearer(active.secret))).status).toBe(200);
  db.run("UPDATE finance_organization_members SET role='reviewer' WHERE organization_id=? AND user_id='alice'",[org]);expect((await request('/v1/finance/wallets',bearer(active.secret))).status).toBe(401);
  db.run("UPDATE finance_organization_members SET role='owner',disabled_at='2026-10-12' WHERE organization_id=? AND user_id='alice'",[org]);expect((await request('/v1/finance/wallets',bearer(active.secret))).status).toBe(401);
  db.run("UPDATE finance_organization_members SET disabled_at=NULL WHERE organization_id=? AND user_id='alice'",[org]);db.run("UPDATE users SET merged_into='bob' WHERE id='alice'");
  const response=await request('/v1/finance/wallets',{...bearer(active.secret),cookie:'session=bob'});expect(response.status).toBe(401);expect((await response.json() as {code:string}).code).toBe('unauthenticated');
}));

test('export pagination uses stable scoped cursors and refuses foreign batch lookup',async()=>withRoutes(async({db,request,org,wallet,otherWallet,external,ids,issue})=>{
  for(let i=0;i<51;i++)createFinanceExportBatch(db,'alice',org,wallet,{ids,idempotencyKey:'additional-export-'+i,expectedVersions:Object.fromEntries(ids.map(id=>[id,1]))});
  const key=issue(['exports:read']),first=await request(external+'/exports',bearer(key.secret));expect(first.status).toBe(200);
  const page=await first.json() as {items:{id:string}[];nextCursor:string};expect(page.items).toHaveLength(50);expect(page.nextCursor).toBeTruthy();
  const second=await request(external+'/exports?cursor='+page.nextCursor,bearer(key.secret));expect(second.status).toBe(200);
  const rest=await second.json() as {items:{id:string}[];nextCursor:null};expect(rest.items).toHaveLength(2);expect(rest.nextCursor).toBeNull();expect(new Set([...page.items,...rest.items].map(item=>item.id)).size).toBe(52);
  const wrongWallet=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(page.nextCursor,'base64url').toString()),walletId:otherWallet})).toString('base64url');expect((await request(external+'/exports?cursor='+wrongWallet,bearer(key.secret))).status).toBe(400);
  expect((await request('/v1/finance/wallets/'+otherWallet+'/exports/'+page.items[0].id,bearer(key.secret))).status).toBe(404);
  for(const cursor of ['%%%',Buffer.from(JSON.stringify({walletId:wallet,createdAt:'invalid',id:'x'})).toString('base64url')])expect((await request(external+'/exports?cursor='+encodeURIComponent(cursor),bearer(key.secret))).status).toBe(400);
}));
