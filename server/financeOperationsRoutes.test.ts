import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import express,{Router,type Request,type RequestHandler,type Response as ExpressResponse} from 'express';
import {encodeAbiParameters,encodeEventTopics,type TransactionReceipt} from 'viem';
import {ARC_USDC} from '../src/arc-wallet';
import type {FinanceMovementScan} from '../src/finance-movements';
import {createFinanceOperationsRoutes} from './financeOperationsRoutes';
import {initFinanceOrganizations,ensurePersonalFinanceOrganization,registerFinanceBusinessWallet,disableFinanceBusinessWallet} from './financeOrganizations';
import {initFinanceOperationsStore,readFinanceOperationState,saveFinanceOperationScan} from './financeOperationsStore';
import {FINANCE_SYSTEM_EMITTER,financeMovementTransferEvent,scanFinanceMovements,type FinanceMovementLog,type FinanceMovementReader} from './financeMovements';
import {loadFinanceHistory} from './financeHistory';

const alice='0x'+'1'.repeat(40),bob='0x'+'2'.repeat(40),peer='0x'+'3'.repeat(40);
const tx='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),blockNumber=5000n,time=1791792000n;
type Init={method?:string;cookie?:string;body?:unknown};
type RequestRoute=(path:string,init?:Init)=>Promise<Response>;
function event(logIndex:number,emitter=FINANCE_SYSTEM_EMITTER,to=alice):FinanceMovementLog{
  return {address:emitter,transactionHash:tx,blockNumber,blockHash,logIndex,removed:false,
    data:encodeAbiParameters([{type:'uint256'}],[emitter===ARC_USDC?1000000n:1000000000000000000n]),
    topics:encodeEventTopics({abi:[financeMovementTransferEvent],eventName:'Transfer',args:{from:peer as `0x${string}`,to:to as `0x${string}`}})};
}
function receipt(to=alice):TransactionReceipt{
  return {status:'success',transactionHash:tx,blockNumber,blockHash,from:peer,
    gasUsed:21000n,effectiveGasPrice:20000000000n,logs:[event(0,FINANCE_SYSTEM_EMITTER,to),event(1,ARC_USDC,to)]} as unknown as TransactionReceipt;
}
async function withRoutes(run:(value:{db:Database;request:RequestRoute;org:string;wallet:string;path:string;reader:FinanceMovementReader;calls:{count:number};control:{receipt:TransactionReceipt;chainId:number;scanOverride:((wallet:string)=>Promise<FinanceMovementScan>)|null}})=>Promise<void>){
  const db=new Database(':memory:');db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT,merged_into TEXT)');
  db.run('INSERT INTO users VALUES(?,?,?,NULL)',['alice',alice,'2026-10-12T00:00:00.000Z']);
  db.run('INSERT INTO users VALUES(?,?,?,NULL)',['bob',bob,'2026-10-12T00:00:00.000Z']);
  db.run('CREATE TABLE arc_collection_requests(id TEXT PRIMARY KEY,user_id TEXT,recipient TEXT,cancelled INTEGER)');
  initFinanceOrganizations(db);initFinanceOperationsStore(db);
  const organization=ensurePersonalFinanceOrganization(db,'alice');
  const businessWallet=registerFinanceBusinessWallet(db,'alice',organization.id,{chainId:5042,address:alice,label:'Treasury'});
  const calls={count:0},control={receipt:receipt(),chainId:5042,scanOverride:null as ((wallet:string)=>Promise<FinanceMovementScan>)|null};
  const reader:FinanceMovementReader={
    chainId:async()=>{calls.count++;return control.chainId;},
    latest:async()=>{calls.count++;return {number:blockNumber,hash:blockHash,timestamp:time};},
    logs:async(_wallet,from,to,direction)=>{calls.count++;return direction==='in'&&from<=blockNumber&&to>=blockNumber?[event(0)]:[];},
    receipt:async()=>{calls.count++;return control.receipt;},
    block:async number=>{calls.count++;return {number,hash:blockHash,timestamp:time};},
  };
  const scan=(wallet:string)=>control.scanOverride?control.scanOverride(wallet):scanFinanceMovements(wallet,reader,{now:Date.now()-1000});
  // Cookie is the authenticated session fixture. Request ownerId is never authority.
  const auth:RequestHandler=(req,res,next)=>{
    const userId=req.headers.cookie==='session=alice'?'alice':req.headers.cookie==='session=bob'?'bob':null;
    if(!userId)return void res.status(401).json({error:'Unauthorized'});
    (req as Request&{userId:string}).userId=userId;next();
  };
  const router=Router();router.use('/finance/v1',createFinanceOperationsRoutes(db,auth,scan,reader,(database,input,rpc)=>loadFinanceHistory(database,input,rpc,{loadPage:async()=>{throw Error('Test quota reserved');}})));
  // Exercise the real Express route handlers and actual SQLite services without opening a socket.
  const request:RequestRoute=(path,init={})=>new Promise(resolve=>{
    const req=Object.assign(Object.create(express.request),{method:init.method||'GET',url:path,
      headers:{cookie:init.cookie||''},body:init.body,socket:{remoteAddress:'127.0.0.1'}}) as Request;
    const headers:Record<string,string>={};let status=200;
    const res={set(key:string,value:string){headers[key]=value;return this;},status(code:number){status=code;return this;},
      json(body:unknown){resolve(new Response(JSON.stringify(body),{status,headers}));return this;}} as unknown as ExpressResponse;
    router(req,res,()=>resolve(new Response('{}',{status:404})));
  });
  const path=`/finance/v1/organizations/${organization.id}/wallets/${businessWallet.id}`;
  try{await run({db,request,org:organization.id,wallet:businessWallet.id,path,reader,calls,control});}finally{db.close();}
}
const owned=(body:Record<string,unknown>={})=>({cookie:'session=alice',body:{...body,ownerId:'alice'}});

test('finance v1 private reads and mutations use session authority and preserve private cache headers',async()=>withRoutes(async({db,request,org,wallet,path,calls})=>{
  for(const suffix of ['/movements','/refresh','/history','/import','/decisions/bulk','/exports']){
    const mutation=suffix!=='/movements';
    const response=await request(path+suffix,{method:mutation?'POST':'GET',body:{ownerId:'alice'}});
    expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
  expect((await request(path+'/movements',{cookie:'session=bob'})).status).toBe(404);
  expect((await request(path+'/refresh',{method:'POST',cookie:'session=bob',body:{ownerId:'bob'}})).status).toBe(404);
  for(const ownerId of [undefined,null,'bob',{},42]){
    const response=await request(path+'/refresh',{method:'POST',cookie:'session=alice',body:{ownerId}});
    expect(response.status).toBe(409);expect((await response.json() as {code:string}).code).toBe('owner_changed');
  }
  expect(calls.count).toBe(0);expect(readFinanceOperationState(db,'alice',org,wallet).scan).toBeNull();
}));

test('a refresh persists normalized receipt evidence, not fabricated request movements, and limits repeated scans',async()=>withRoutes(async({db,request,org,wallet,path,calls})=>{
  const response=await request(path+'/refresh',{method:'POST',...owned({movements:[{id:'forged',raw18:'999'}]})});
  expect(response.status).toBe(200);
  const state=await response.json() as ReturnType<typeof readFinanceOperationState>;
  expect(state.scan?.movements).toHaveLength(1);expect(state.scan?.movements[0]).toMatchObject({id:`5042:${tx}:0`,raw18:'1000000000000000000',source:'arc_system_events'});
  expect(state.scan?.movements[0].aliases).toHaveLength(1);expect(state.scan?.fees).toHaveLength(1);
  expect(state.scan?.coverage).toMatchObject({fromBlock:'3977',toBlock:'5000',complete:true,includesGasOnlyTransactions:false});
  expect(readFinanceOperationState(db,'alice',org,wallet).scan).toEqual(state.scan);
  const before=calls.count;const limited=await request(path+'/refresh',{method:'POST',...owned()});
  expect(limited.status).toBe(429);expect(calls.count).toBe(before);
}));

test('v1 decisions enforce optimistic versions and exports are idempotent files, not accounting acknowledgements',async()=>withRoutes(async({db,request,org,wallet,path})=>{
  expect((await request(path+'/refresh',{method:'POST',...owned()})).status).toBe(200);
  const id=`5042:${tx}:0`,decisionPath=path+'/movements/'+encodeURIComponent(id);
  const saved=await request(decisionPath,{method:'PUT',...owned({category:'collection',reference:'INV-001',counterpartyId:null,status:'review',expectedVersion:0})});
  expect(saved.status).toBe(200);expect((await saved.json() as {version:number}).version).toBe(1);
  expect((await request(path+'/decisions/bulk',{method:'POST',...owned({items:[{id,expectedVersion:0}],status:'approved'})})).status).toBe(409);
  expect(readFinanceOperationState(db,'alice',org,wallet).decisions[id].status).toBe('review');
  const approved=await request(path+'/decisions/bulk',{method:'POST',...owned({items:[{id,expectedVersion:1}],status:'approved'})});
  expect(approved.status).toBe(200);expect(readFinanceOperationState(db,'alice',org,wallet).decisions[id].version).toBe(2);
  const stale=await request(path+'/exports',{method:'POST',...owned({ids:[id],idempotencyKey:'stale-export-version',expectedVersions:{[id]:1}})});
  expect(stale.status).toBe(409);expect(readFinanceOperationState(db,'alice',org,wallet).exportBatches).toEqual([]);
  const body={ids:[id],idempotencyKey:'route-test-export-01',expectedVersions:{[id]:2}};
  const first=await request(path+'/exports',{method:'POST',...owned(body)}),second=await request(path+'/exports',{method:'POST',...owned(body)});
  expect(first.status).toBe(200);expect(second.status).toBe(200);
  const batch=await first.json() as {id:string;accountingStatus:string;status:string;payload:{records:unknown[];fees:unknown[]}};
  expect(await second.json()).toEqual(batch);expect(batch.status).toBe('generated');expect(batch.accountingStatus).toBe('not_submitted');
  expect(batch.payload.records).toHaveLength(1);expect(batch.payload.fees).toHaveLength(1);
  expect(readFinanceOperationState(db,'alice',org,wallet).decisions[id].status).toBe('approved');
  // The same request key retrieves its original snapshot even after a later valid review.
  expect((await request(decisionPath,{method:'PUT',...owned({category:'collection',reference:'INV-002',counterpartyId:null,status:'approved',expectedVersion:2})})).status).toBe(200);
  expect(readFinanceOperationState(db,'alice',org,wallet).decisions[id].version).toBe(3);
  const original=await request(path+'/exports',{method:'POST',...owned(body)});expect(original.status).toBe(200);expect(await original.json()).toEqual(batch);
  expect((await request(path+'/exports',{method:'POST',...owned({...body,idempotencyKey:'new-key-old-version'})})).status).toBe(409);
  expect(readFinanceOperationState(db,'alice',org,wallet).exportBatches).toHaveLength(1);
  expect((await request(path+'/exports/'+batch.id,{cookie:'session=bob'})).status).toBe(404);
  expect((await request(path+'/exports/'+batch.id)).status).toBe(401);
}));

test('disabled and foreign workspaces reject refresh/import before making any RPC reads',async()=>withRoutes(async({db,request,org,wallet,path,calls})=>{
  disableFinanceBusinessWallet(db,'alice',org,wallet);
  for(const suffix of ['/refresh','/history','/import'])expect((await request(path+suffix,{method:'POST',...owned({hash:tx})})).status).toBe(409);
  expect(calls.count).toBe(0);expect(readFinanceOperationState(db,'alice',org,wallet).scan).toBeNull();
}));

test('membership revoked during a refresh prevents private evidence persistence after IO',async()=>withRoutes(async({db,request,org,wallet,path,control})=>{
  let release!:(scan:FinanceMovementScan)=>void,started!:()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  // A real normalized receipt scan is prepared first, then held at the IO boundary.
  const readyReader:FinanceMovementReader={chainId:async()=>5042,latest:async()=>({number:blockNumber,hash:blockHash,timestamp:time}),
    logs:async(_wallet,_from,_to,direction)=>direction==='in'?[event(0)]:[],receipt:async()=>receipt(),block:async number=>({number,hash:blockHash,timestamp:time})};
  const scan=await scanFinanceMovements(alice,readyReader);
  control.scanOverride=()=>{started();return new Promise<FinanceMovementScan>(resolve=>{release=resolve;});};
  const pending=request(path+'/refresh',{method:'POST',...owned()});await entered;
  db.run("UPDATE finance_organization_members SET disabled_at='2026-10-12T10:00:00Z' WHERE organization_id=? AND user_id='alice'",[org]);
  release(scan);expect((await pending).status).toBe(404);
  expect(db.query('SELECT COUNT(*) AS count FROM finance_operation_snapshots').get()).toEqual({count:0});
}));

test('receipt import verifies real injected chain/receipt/block proof and stores explicit partial coverage',async()=>withRoutes(async({db,request,org,wallet,path,calls})=>{
  const response=await request(path+'/import',{method:'POST',...owned({hash:tx})});expect(response.status).toBe(200);
  const state=await response.json() as ReturnType<typeof readFinanceOperationState>;
  expect(calls.count).toBe(3);expect(state.scan?.movements).toHaveLength(1);expect(state.scan?.movements[0].aliases).toHaveLength(1);
  expect(state.scan?.fees).toHaveLength(1);expect(state.scan?.coverage).toMatchObject({scope:'receipt_import',complete:false,fromBlock:'5000',toBlock:'5000'});
  expect(readFinanceOperationState(db,'alice',org,wallet).loadedRanges).toHaveLength(1);
}));

test('invalid or unrelated transaction imports do not fabricate wallet movements',async()=>withRoutes(async({db,request,org,wallet,path,calls,control})=>{
  expect((await request(path+'/import',{method:'POST',...owned({hash:'not-a-hash'})})).status).toBe(400);expect(calls.count).toBe(0);
  control.receipt=receipt(bob);
  const unrelated=await request(path+'/import',{method:'POST',...owned({hash:tx})});expect(unrelated.status).toBe(400);
  expect((await unrelated.json() as {code:string}).code).toBe('invalid_input');expect(readFinanceOperationState(db,'alice',org,wallet).scan).toBeNull();
}));

test('mismatched receipt block proof fails closed and keeps the previous verified snapshot',async()=>withRoutes(async({db,request,org,wallet,path,control})=>{
  expect((await request(path+'/refresh',{method:'POST',...owned()})).status).toBe(200);
  const previous=readFinanceOperationState(db,'alice',org,wallet);
  control.receipt={...receipt(),blockHash:'0x'+'c'.repeat(64)} as TransactionReceipt;
  expect((await request(path+'/import',{method:'POST',...owned({hash:tx})})).status).toBe(503);
  expect(readFinanceOperationState(db,'alice',org,wallet)).toEqual(previous);
}));

test('older-range refresh scans before the earliest saved range while preserving already verified movements',async()=>withRoutes(async({db,request,org,wallet,path,reader})=>{
  const latest=await scanFinanceMovements(alice,reader,{now:Date.now()-1000});saveFinanceOperationScan(db,'alice',org,wallet,latest);
  const response=await request(path+'/refresh',{method:'POST',...owned({older:true})});expect(response.status).toBe(200);
  const state=await response.json() as ReturnType<typeof readFinanceOperationState>;
  expect(state.scan?.coverage).toMatchObject({fromBlock:'2953',toBlock:'3976',complete:true});
  expect(state.scan?.movements).toEqual(latest.movements);expect(state.scan?.fees).toEqual(latest.fees);
  expect(state.loadedRanges.map(range=>[range.fromBlock,range.toBlock])).toEqual([['3977','5000'],['2953','3976']]);
}));

test('older-range refresh repairs a saved incomplete window before moving further into history',async()=>withRoutes(async({db,request,org,wallet,path,reader,control})=>{
  const verified=await scanFinanceMovements(alice,reader,{now:Date.now()-1000});
  const partial:FinanceMovementScan={...verified,coverage:{...verified.coverage,candidateTransactions:2,truncated:true,complete:false}};
  // Save a verified partial response from the same injected scanner seam without
  // consuming the separate refresh cooldown or changing global clock state.
  control.scanOverride=async()=>partial;
  saveFinanceOperationScan(db,'alice',org,wallet,await control.scanOverride(alice));
  const ranges:{from:bigint;to:bigint;direction:string}[]=[],logs=reader.logs;
  reader.logs=async(wallet,from,to,direction)=>{ranges.push({from,to,direction});return logs(wallet,from,to,direction);};
  const response=await request(path+'/refresh',{method:'POST',...owned({older:true})});expect(response.status).toBe(200);
  const state=await response.json() as ReturnType<typeof readFinanceOperationState>;
  expect(ranges).toEqual([{from:3977n,to:5000n,direction:'in'},{from:3977n,to:5000n,direction:'out'}]);
  expect(state.scan?.coverage).toMatchObject({fromBlock:'3977',toBlock:'5000',complete:true,failedTransactions:0,truncated:false});
  expect(state.scan?.movements).toEqual(verified.movements);expect(state.scan?.fees).toEqual(verified.fees);
  expect(state.loadedRanges).toHaveLength(1);expect(state.loadedRanges[0].complete).toBe(true);
}));

function seedHistory(db:Database){
 db.run('CREATE TABLE arc_address_activity(chain_id INTEGER,address TEXT,tx_hash TEXT,block_number INTEGER,activity_type TEXT,token_address TEXT,from_address TEXT,to_address TEXT)');
 db.run('INSERT INTO arc_address_activity VALUES(5042,?,?,5000,?,?,?,?)',[alice,tx,'token_transfer',FINANCE_SYSTEM_EMITTER,peer,alice]);
}
test('history discovers old local records under reserved Explorer quota and persists only canonical receipts',async()=>withRoutes(async({db,request,org,wallet,path,calls})=>{
 seedHistory(db);
 expect((await request(path+'/history',{method:'POST',cookie:'session=bob',body:{ownerId:'bob'}})).status).toBe(404);expect(calls.count).toBe(0);
 expect((await request(path+'/history',{method:'POST',...owned({cursor:42})})).status).toBe(400);expect(calls.count).toBe(0);
 const response=await request(path+'/history',{method:'POST',...owned({movements:[{raw18:'9999'}]})});expect(response.status).toBe(200);
 const data=await response.json() as {state:ReturnType<typeof readFinanceOperationState>;history:{checkedTransactions:number;importedMovements:number;complete:boolean;explorer:{available:boolean}};nextCursor:string|null};
 expect(data.state.scan?.movements).toHaveLength(1);expect(data.state.scan?.movements[0].raw18).toBe('1000000000000000000');expect(data.state.scan?.fees).toHaveLength(1);expect(data.state.scan?.movements[0].aliases).toHaveLength(1);
 expect(data.history).toMatchObject({checkedTransactions:1,importedMovements:1,complete:false,explorer:{available:false}});expect(data.nextCursor).not.toBeNull();expect(data.state.decisions[`5042:${tx}:0`].status).toBe('new');
 expect(readFinanceOperationState(db,'alice',org,wallet).scan?.coverage.scope).toBe('receipt_import');
 expect((await request(path+'/history',{method:'POST',...owned()})).status).toBe(429);
}));
test('history membership recheck prevents persistence after access is revoked during receipt IO',async()=>withRoutes(async({db,request,org,path,reader})=>{
 seedHistory(db);let release!:(value:TransactionReceipt)=>void,entered!:()=>void;const started=new Promise<void>(r=>entered=r);
 reader.receipt=async()=>{entered();return new Promise<TransactionReceipt>(r=>release=r);};
 const pending=request(path+'/history',{method:'POST',...owned()});await started;
 db.run("UPDATE finance_organization_members SET disabled_at='2026-10-12T10:00:00Z' WHERE organization_id=? AND user_id='alice'",[org]);release(receipt());
 expect((await pending).status).toBe(404);expect(db.query('SELECT COUNT(*) AS n FROM finance_operation_snapshots').get()).toEqual({n:0});
}));