import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initAlertTables,createAlertRule,alertDashboard,scanAlertAddress,setAlertEnabled,deleteAlertRule,markAlertsRead,scanDeploymentAlerts,resolveAlertAsset,alertPollingCadence,runAlertWorkerTick} from './arcAlerts';
import {normalizeWalletResearch} from './arcWallet';
import {ARC_USDC} from '../src/arc-wallet';
const address='0x1111111111111111111111111111111111111111',peer='0x2222222222222222222222222222222222222222';
const start='2026-10-01T10:00:00.000Z',later='2026-10-01T10:01:00.000Z';
const draft={address,name:'Hazine',kind:'usdc_transfer',direction:'out',minimum:'10000'};
function transfer(n:number,raw='10000000000',from=address,to=peer,timestamp=later,token=ARC_USDC){return {
  transaction_hash:'0x'+n.toString(16).padStart(64,'0'),log_index:n,block_number:n,timestamp,from:{hash:from},to:{hash:to},
  token:{address_hash:token,decimals:'6',symbol:'USDC'},total:{value:raw,decimals:'6'}};}
function database(){const db=new Database(':memory:');initAlertTables(db);return db;}
test('custom token alerts verify metadata and match exact token/precision, preserving notification identity',async()=>{
 const db=database(),asset={address:peer,symbol:'TEST',decimals:18};
 const rule={...draft,kind:'token_transfer',token:peer,minimum:'1.000000000000000001'};
 expect(()=>createAlertRule(db,'a',rule,start)).toThrow('doğrulanmalı');
 const verified=await resolveAlertAsset(rule,async path=>{expect(path).toBe(`/tokens/${peer}`);return {address_hash:peer,type:'ERC-20',decimals:'18',symbol:'TEST'};});
 createAlertRule(db,'a',rule,start,verified);
 const t=transfer(200,'1000000000000000001',address,peer,later,peer);t.token.decimals='18';t.token.symbol='TEST';t.total.decimals='18';
 await scanAlertAddress(db,address,async()=>({items:[t,transfer(201,'1000000000000000001'),{...t,log_index:202,total:{...t.total,value:'1000000000000000000'}}],next_page_params:null}));
 const dashboard=alertDashboard(db,'a');expect(dashboard.notifications).toHaveLength(1);expect(dashboard.notifications[0]).toMatchObject({token:peer,symbol:'TEST',decimals:18,raw:'1000000000000000001'});expect(dashboard.rules[0].token).toBe(peer);
 await expect(resolveAlertAsset(rule,async()=>({address_hash:address,type:'ERC-20',decimals:'18'}))).rejects.toThrow();
 await expect(resolveAlertAsset(rule,async()=>({address_hash:peer,type:'ERC-721',decimals:'0'}))).rejects.toThrow();
 await expect(resolveAlertAsset(rule,async()=>({address_hash:peer,type:'ERC-20',decimals:null}))).rejects.toThrow();
 expect(()=>createAlertRule(db,'a',{...rule,minimum:'0.0000000000000000001'},start,asset)).toThrow();db.close();
});
test('additive migration preserves legacy USDC rules and notifications across repeated initialization',()=>{
 const db=new Database(':memory:');
 db.run('CREATE TABLE arc_alert_rules(id TEXT PRIMARY KEY,user_id TEXT,address TEXT,name TEXT,kind TEXT,direction TEXT,minimum TEXT,enabled INTEGER,created_at TEXT,start_at TEXT,deleted_at TEXT)');
 db.run('CREATE TABLE arc_alert_notifications(id TEXT PRIMARY KEY,user_id TEXT,rule_id TEXT,name TEXT,address TEXT,kind TEXT,event_key TEXT,hash TEXT,block INTEGER,timestamp TEXT,direction TEXT,raw TEXT,peer TEXT,read_at TEXT,UNIQUE(rule_id,event_key))');
 db.run("INSERT INTO arc_alert_rules VALUES('old','alice',?,'old','usdc_transfer','all','1',1,?,?,NULL)",[address,start,start]);
 db.run("INSERT INTO arc_alert_notifications VALUES('n','alice','old','old',?,'usdc_transfer','event','hash',1,?,'in','1000000',?,NULL)",[address,later,peer]);
 initAlertTables(db);initAlertTables(db);const d=alertDashboard(db,'alice');expect(d.rules).toHaveLength(1);expect(d.notifications).toHaveLength(1);expect(d.rules[0]).toMatchObject({token:ARC_USDC,symbol:'USDC',decimals:6});expect(d.notifications[0].raw).toBe('1000000');db.close();
});
test('alarm rules compare exact USDC integers, direction and activation time; repeated scans are idempotent',async()=>{
  const db=database();createAlertRule(db,'alice',draft,start);
  const items=[transfer(20),transfer(21,'9999999999'),transfer(22,'10000000000',peer,address),transfer(23,'10000000000',address,address),
    transfer(24,'10000000000',address,peer,start),transfer(25,'10000000000',address,peer,later,peer)];
  await scanAlertAddress(db,address,async()=>({items,next_page_params:null}));
  await scanAlertAddress(db,address,async()=>({items,next_page_params:null}));
  const data=alertDashboard(db,'alice');expect(data.unread).toBe(1);expect(data.notifications[0].block).toBe(20);
  expect(alertDashboard(db,'bob').notifications).toEqual([]);markAlertsRead(db,'bob');expect(alertDashboard(db,'alice').unread).toBe(1);
  markAlertsRead(db,'alice');expect(alertDashboard(db,'alice').unread).toBe(0);db.close();
});
test('rules are account scoped; pause/resume ignores movements while paused and preserves prior notifications',async()=>{
  const db=database(),id=createAlertRule(db,'alice',draft,start);
  expect(setAlertEnabled(db,'bob',id,false)).toBe(false);expect(deleteAlertRule(db,'bob',id)).toBe(false);
  setAlertEnabled(db,'alice',id,false);await scanAlertAddress(db,address,async()=>({items:[transfer(30)],next_page_params:null}));
  expect(alertDashboard(db,'alice').unread).toBe(0);
  setAlertEnabled(db,'alice',id,true,'2026-10-01T10:02:00.000Z');
  await scanAlertAddress(db,address,async()=>({items:[transfer(31,'10000000000',address,peer,'2026-10-01T10:03:00Z'),transfer(30)],next_page_params:null}));
  expect(alertDashboard(db,'alice').unread).toBe(1);deleteAlertRule(db,'alice',id);
  expect(alertDashboard(db,'alice').rules).toEqual([]);expect(alertDashboard(db,'alice').notifications).toHaveLength(1);db.close();
});
test('durable provider continuation resumes after reopening the database; failed pages do not advance state',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'carpan-alerts-')),path=join(folder,'test.sqlite');let db=new Database(path);
  try{initAlertTables(db);createAlertRule(db,'alice',{...draft,minimum:'0'},start);
    let page=0;await scanAlertAddress(db,address,async()=>{page++;return {items:[transfer(100-page)],next_page_params:{block_number:100-page,index:page}};});
    expect(alertDashboard(db,'alice').notifications).toHaveLength(3);db.close();db=new Database(path);initAlertTables(db);
    const state=db.query('SELECT cursor FROM arc_alert_monitors').get() as {cursor:string};
    await expect(scanAlertAddress(db,address,async()=>{throw new Error('Offline');})).rejects.toThrow('Offline');
    expect(db.query('SELECT cursor FROM arc_alert_monitors').get()).toEqual(state);
    await scanAlertAddress(db,address,async p=>{expect(p).toContain('index=3');return {items:[transfer(96)],next_page_params:null};});
    expect(alertDashboard(db,'alice').notifications).toHaveLength(4);expect(db.query('SELECT cursor FROM arc_alert_monitors').get()).toEqual({cursor:null});
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('invalid rules, foreign continuation and malformed transfers cannot generate alerts or advance checkpoints',async()=>{
  const db=database();expect(()=>createAlertRule(db,'a',{...draft,minimum:'0.0000001'})).toThrow();
  expect(()=>createAlertRule(db,'a',{...draft,address:'bad'})).toThrow();createAlertRule(db,'a',draft,start);
  await expect(scanAlertAddress(db,address,async()=>({items:[transfer(40)],next_page_params:{url:'https://evil.test'}}))).rejects.toThrow();
  await expect(scanAlertAddress(db,address,async()=>({items:[{bad:true}],next_page_params:null}))).rejects.toThrow();
  expect(alertDashboard(db,'a').notifications).toEqual([]);expect(db.query('SELECT checkpoint FROM arc_alert_monitors').get()).toEqual({checkpoint:0});db.close();
});
test('deployment notifications use proven direct deployments and do not repeat or backfill older records',()=>{
  const db=database();db.run('CREATE TABLE arc_contract_deployments(chain_id INTEGER,contract_address TEXT,deployer_address TEXT,tx_hash TEXT,block_number INTEGER,block_timestamp TEXT)');
  createAlertRule(db,'a',{...draft,kind:'deployment'},start);
  db.run('INSERT INTO arc_contract_deployments VALUES(5042,?,?,?,?,?)',[peer,address,'0x'+'a'.repeat(64),50,later]);
  db.run('INSERT INTO arc_contract_deployments VALUES(5042,?,?,?,?,?)',['0x'+'3'.repeat(40),address,'0x'+'b'.repeat(64),49,start]);
  scanDeploymentAlerts(db);scanDeploymentAlerts(db);expect(alertDashboard(db,'a').notifications).toHaveLength(1);db.close();
});
test('portfolio does not double count native USDC; native history converts 18 to 6 decimals and rejects bad values',()=>{
  const data=normalizeWalletResearch([{token:{address_hash:ARC_USDC,decimals:'6',type:'ERC-20'},value:'1000000'},
    {token:{address_hash:peer,decimals:'18',type:'ERC-20',symbol:'TEST'},value:'1234567890123456789'},
    {token:{address_hash:address,decimals:null,type:'ERC-20'},value:'5'}],
    {items:[{value:'1000000123456789000',block_number:5,block_timestamp:later},{value:'bad',block_number:6,block_timestamp:later}],next_page_params:{}},
    {transactions_count:'0',token_transfers_count:'42'});
  expect(data.tokens).toHaveLength(1);expect(data.balanceHistory[0].raw).toBe('1000000');expect(data.transactions).toBe(0);expect(data.tokenTransfers).toBe(42);expect(data.historyHasMore).toBe(true);
});

const normalBudget={mode:'normal',limit:80000,available:80000,cost:20,background_credits:0};
function workerDatabase(){const db=database();db.run('CREATE TABLE arc_contract_deployments(chain_id INTEGER,contract_address TEXT,deployer_address TEXT,tx_hash TEXT,block_number INTEGER,block_timestamp TEXT)');return db;}

test('alert cadence reserves capacity for interactive research and scales fairly with active addresses',()=>{
  expect(alertPollingCadence(1,normalBudget)).toEqual({enabled:true,intervalMs:388800});
  expect(alertPollingCadence(1,{...normalBudget,mode:'saving',available:10000}).intervalMs).toBe(900000);
  expect(alertPollingCadence(10,normalBudget).intervalMs).toBe(3888000);
  for(const status of [null,{...normalBudget,mode:'cached'},{...normalBudget,available:29},{...normalBudget,background_credits:60000}])
    expect(alertPollingCadence(1,status).enabled).toBe(false);
});

test('transfer worker pauses at the protected reserve without advancing timestamps or pagination; deployment alerts remain independent',async()=>{
  const db=workerDatabase();createAlertRule(db,'alice',draft,start);createAlertRule(db,'alice',{...draft,kind:'deployment'},start);
  db.run('INSERT INTO arc_contract_deployments VALUES(5042,?,?,?,?,?)',[peer,address,'0x'+'c'.repeat(64),60,later]);
  let reads=0;await runAlertWorkerTick(db,{budget:()=>({...normalBudget,mode:'cached',available:0}),loadPage:async()=>{reads++;return {items:[transfer(200)],next_page_params:null};}});
  expect(reads).toBe(0);expect(db.query('SELECT checkpoint,cursor,last_attempt_at,last_checked_at FROM arc_alert_monitors').get()).toEqual({checkpoint:0,cursor:null,last_attempt_at:null,last_checked_at:null});
  expect(alertDashboard(db,'alice').notifications).toHaveLength(1);expect(alertDashboard(db,'alice').notifications[0].kind).toBe('deployment');db.close();
});

test('failed alarm reads persist retry timing without claiming fresh successful checks or losing the continuation',async()=>{
  const db=workerDatabase();createAlertRule(db,'alice',draft,start);
  const checked='2026-10-12T00:00:00.000Z',cursor=JSON.stringify({block_number:250,index:2});
  db.run('UPDATE arc_alert_monitors SET checkpoint=200,cursor=?,last_checked_at=?',[cursor,checked]);
  let now=Date.parse('2026-10-12T12:00:00.000Z'),reads=0;
  const dependencies={clock:()=>now,budget:()=>normalBudget,loadPage:async()=>{reads++;throw new Error('Source unavailable');}};
  await runAlertWorkerTick(db,dependencies);await runAlertWorkerTick(db,dependencies);
  expect(reads).toBe(1);expect(db.query('SELECT checkpoint,cursor,last_checked_at,last_attempt_at FROM arc_alert_monitors').get()).toEqual({checkpoint:200,cursor,last_checked_at:checked,last_attempt_at:new Date(now).toISOString()});
  initAlertTables(db);await runAlertWorkerTick(db,dependencies);expect(reads).toBe(1);
  now+=388799;await runAlertWorkerTick(db,dependencies);expect(reads).toBe(1);
  now++;await runAlertWorkerTick(db,dependencies);expect(reads).toBe(2);expect(alertDashboard(db,'alice').notifications).toHaveLength(0);db.close();
});

test('bounded worker rounds visit every due address before repeating one and ignore paused rules',async()=>{
  const db=workerDatabase(),now=Date.parse('2026-10-12T12:00:00.000Z');
  for(let i=1;i<=31;i++){
    const a='0x'+i.toString(16).padStart(40,'0');const id=createAlertRule(db,'owner'+i,{...draft,address:a},start);
    if(i===31)setAlertEnabled(db,'owner'+i,id,false);
  }
  const visited:string[]=[];const dependencies={clock:()=>now,budget:()=>normalBudget,loadPage:async(path:string)=>{visited.push(path.split('/')[2]);return {items:[],next_page_params:null};}};
  await runAlertWorkerTick(db,dependencies);expect(visited).toHaveLength(10);
  await runAlertWorkerTick(db,dependencies);expect(visited).toHaveLength(20);
  await runAlertWorkerTick(db,dependencies);expect(visited).toHaveLength(30);expect(new Set(visited).size).toBe(30);
  await runAlertWorkerTick(db,dependencies);expect(visited).toHaveLength(30);
  const count=(db.query('SELECT COUNT(*) AS n FROM arc_alert_monitors WHERE last_attempt_at IS NOT NULL').get() as {n:number}).n;
  expect(count).toBe(30);db.close();
});

test('legacy monitor migration preserves successful-check timing as the initial attempt and is idempotent',()=>{
  const db=new Database(':memory:');db.run('CREATE TABLE arc_alert_monitors(address TEXT PRIMARY KEY,start_at TEXT NOT NULL,checkpoint INTEGER NOT NULL DEFAULT 0,pending_head INTEGER NOT NULL DEFAULT 0,cursor TEXT,last_checked_at TEXT,error TEXT)');
  db.run('INSERT INTO arc_alert_monitors(address,start_at,last_checked_at) VALUES(?,?,?)',[address,start,later]);
  initAlertTables(db);expect(db.query('SELECT last_attempt_at,last_checked_at FROM arc_alert_monitors').get()).toEqual({last_attempt_at:later,last_checked_at:later});
  db.run('UPDATE arc_alert_monitors SET last_attempt_at=?',['2026-10-12T00:00:00.000Z']);initAlertTables(db);
  expect(db.query('SELECT last_attempt_at FROM arc_alert_monitors').get()).toEqual({last_attempt_at:'2026-10-12T00:00:00.000Z'});db.close();
});
