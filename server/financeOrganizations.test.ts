import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initFinanceWorkspace,readFinanceDecisions,saveFinanceDecision} from './financeWorkspace';
import {createFinanceCounterparty,createFinanceOrganization,disableFinanceBusinessWallet,disableFinanceCounterparty,ensurePersonalFinanceOrganization,FinanceOrganizationError,getFinanceBusinessWallet,getFinanceCounterparty,getFinanceOrganization,initFinanceOrganizations,listFinanceBusinessWallets,listFinanceCounterparties,listFinanceOrganizationMembers,listFinanceOrganizations,readFinanceOrganizationAudit,registerFinanceBusinessWallet,requireFinanceOrganizationAccess,updateFinanceCounterparty,type FinanceOrganizationRole} from './financeOrganizations';

const aliceWallet='0x'+'1'.repeat(40),bobWallet='0x'+'2'.repeat(40),historicalWallet='0x'+'3'.repeat(40),customerWallet='0x'+'4'.repeat(40);
function fixture(path=':memory:'){
  const db=new Database(path,{create:true});db.run('PRAGMA foreign_keys=ON');
  db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT,merged_into TEXT)');
  db.run('INSERT INTO users VALUES(?,?,?,NULL)',['alice',aliceWallet,'2026-10-12T00:00:00.000Z']);
  db.run('INSERT INTO users VALUES(?,?,?,NULL)',['bob',bobWallet,'2026-10-12T00:00:00.000Z']);
  db.run("INSERT INTO users VALUES('guest',NULL,NULL,NULL)");
  db.run("INSERT INTO users VALUES('old',NULL,NULL,'alice')");
  db.run('CREATE TABLE arc_collection_requests(id TEXT PRIMARY KEY,user_id TEXT,recipient TEXT,cancelled INTEGER)');
  db.run('INSERT INTO arc_collection_requests VALUES(?,?,?,0)',['collection-1','alice',historicalWallet]);
  initFinanceOrganizations(db);return db;
}
function member(db:Database,orgId:string,userId:string,role:FinanceOrganizationRole){db.run('INSERT INTO finance_organization_members(organization_id,user_id,role,created_at) VALUES(?,?,?,?)',[orgId,userId,role,'2026-10-12T00:00:00.000Z']);}
function failure(call:()=>unknown,code:FinanceOrganizationError['code'],status:number){
  let thrown:unknown;try{call();}catch(error){thrown=error;}
  expect(thrown).toBeInstanceOf(FinanceOrganizationError);expect((thrown as FinanceOrganizationError).code).toBe(code);expect((thrown as FinanceOrganizationError).status).toBe(status);
}
function customer(name='Customer 1',code='C-001',selected=customerWallet){return {name,code,kind:'customer' as const,addresses:[{chainId:5042,address:selected.toUpperCase().replace('0X','0x'),label:'Payments'}]};}

test('personal workspace is lazy/idempotent, companies are separate and survive a database reopen',()=>{
  const folder=mkdtempSync(join(tmpdir(),'carpan-finance-organizations-')),path=join(folder,'operations.db');let db=fixture(path);
  try{
    expect(listFinanceOrganizations(db,'alice')).toEqual([]);
    const personal=ensurePersonalFinanceOrganization(db,'alice'),company=createFinanceOrganization(db,'alice',{name:'Acme Treasury'});
    expect(personal.kind).toBe('personal');expect(company.kind).toBe('business');expect(personal.role).toBe('owner');expect(company.id).not.toBe(personal.id);
    expect(ensurePersonalFinanceOrganization(db,'alice')).toEqual(personal);expect(listFinanceOrganizations(db,'bob')).toEqual([]);
    db.close();db=new Database(path);initFinanceOrganizations(db);
    expect(ensurePersonalFinanceOrganization(db,'alice')).toEqual(personal);expect(getFinanceOrganization(db,'alice',company.id).name).toBe('Acme Treasury');
    expect(listFinanceOrganizationMembers(db,'alice',company.id)).toEqual([{userId:'alice',role:'owner',createdAt:company.createdAt}]);
    expect(readFinanceOrganizationAudit(db,'alice',personal.id).items.map(event=>event.action)).toEqual(['workspace_created']);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});

test('every read and write is private to a current account and workspace membership',()=>{
  const db=fixture();try{
    const org=ensurePersonalFinanceOrganization(db,'alice'),wallet=registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Treasury'}),party=createFinanceCounterparty(db,'alice',org.id,customer());
    for(const call of [()=>getFinanceOrganization(db,'bob',org.id),()=>listFinanceOrganizationMembers(db,'bob',org.id),()=>listFinanceBusinessWallets(db,'bob',org.id),()=>getFinanceBusinessWallet(db,'bob',org.id,wallet.id),()=>listFinanceCounterparties(db,'bob',org.id),()=>getFinanceCounterparty(db,'bob',org.id,party.id),()=>readFinanceOrganizationAudit(db,'bob',org.id),()=>registerFinanceBusinessWallet(db,'bob',org.id,{chainId:5042,address:bobWallet,label:'B'}),()=>disableFinanceBusinessWallet(db,'bob',org.id,wallet.id),()=>createFinanceCounterparty(db,'bob',org.id,customer()),()=>updateFinanceCounterparty(db,'bob',org.id,party.id,{name:'Hijack'}),()=>disableFinanceCounterparty(db,'bob',org.id,party.id)])failure(call,'not_found',404);
    for(const account of ['missing','old'])for(const call of [()=>ensurePersonalFinanceOrganization(db,account),()=>listFinanceOrganizations(db,account),()=>createFinanceOrganization(db,account,{name:'Blocked'}),()=>getFinanceOrganization(db,account,org.id)])failure(call,'unauthenticated',401);
    const other=ensurePersonalFinanceOrganization(db,'bob');failure(()=>getFinanceCounterparty(db,'alice',org.id,other.id),'not_found',404);
    expect(getFinanceCounterparty(db,'alice',org.id,party.id).name).toBe('Customer 1');
  }finally{db.close();}
});

test('viewer cannot mutate; reviewer can manage counterparties; admin can register only their eligible wallets',()=>{
  const db=fixture();try{
    const org=createFinanceOrganization(db,'alice',{name:'Team'});member(db,org.id,'bob','viewer');
    expect(requireFinanceOrganizationAccess(db,'bob',org.id).role).toBe('viewer');expect(listFinanceCounterparties(db,'bob',org.id)).toEqual([]);
    failure(()=>createFinanceCounterparty(db,'bob',org.id,customer()),'forbidden',403);
    db.run("UPDATE finance_organization_members SET role='reviewer' WHERE organization_id=? AND user_id='bob'",[org.id]);
    const party=createFinanceCounterparty(db,'bob',org.id,customer());expect(party.organizationId).toBe(org.id);
    failure(()=>registerFinanceBusinessWallet(db,'bob',org.id,{chainId:5042,address:bobWallet,label:'Treasury'}),'forbidden',403);
    db.run("UPDATE finance_organization_members SET role='admin' WHERE organization_id=? AND user_id='bob'",[org.id]);
    expect(registerFinanceBusinessWallet(db,'bob',org.id,{chainId:5042,address:bobWallet,label:'Treasury'}).registrationSource).toBe('verified_wallet');
    failure(()=>registerFinanceBusinessWallet(db,'bob',org.id,{chainId:5042,address:aliceWallet,label:'Alice'}),'wallet_unverified',403);
    db.run("UPDATE finance_organization_members SET disabled_at='2026-10-12' WHERE organization_id=? AND user_id='bob'",[org.id]);
    failure(()=>getFinanceOrganization(db,'bob',org.id),'not_found',404);
  }finally{db.close();}
});

test('business wallet requires verified signature record or own active recipient, never browser/public address inference',()=>{
  const db=fixture();try{
    const org=ensurePersonalFinanceOrganization(db,'alice');
    const wallet=registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Treasury',userId:'bob'});
    expect(wallet.registeredBy).toBe('alice');expect(wallet.registrationSource).toBe('verified_wallet');expect(wallet.address).toBe(aliceWallet);
    expect(registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Treasury'}).id).toBe(wallet.id);
    expect(registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:historicalWallet,label:'Collections'}).registrationSource).toBe('collection_recipient');
    failure(()=>registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:customerWallet,label:'Public'}),'wallet_unverified',403);
    db.run("UPDATE users SET wallet_verified_at=NULL WHERE id='alice'");failure(()=>registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Unverified'}),'wallet_unverified',403);
    db.run('UPDATE arc_collection_requests SET cancelled=1');failure(()=>registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:historicalWallet,label:'Cancelled'}),'wallet_unverified',403);
    const guest=ensurePersonalFinanceOrganization(db,'guest');failure(()=>registerFinanceBusinessWallet(db,'guest',guest.id,{chainId:5042,address:aliceWallet,label:'Not mine'}),'wallet_unverified',403);
    expect(listFinanceBusinessWallets(db,'alice',org.id)).toHaveLength(2);
  }finally{db.close();}
});

test('counterparty mappings are canonical, workspace-private, unique and update atomically',()=>{
  const db=fixture();try{
    const first=ensurePersonalFinanceOrganization(db,'alice'),second=createFinanceOrganization(db,'alice',{name:'Second company'});
    const party=createFinanceCounterparty(db,'alice',first.id,customer()),independent=createFinanceCounterparty(db,'alice',second.id,customer());
    expect(party.addresses[0].address).toBe(customerWallet);expect(independent.addresses).toEqual(party.addresses);
    failure(()=>createFinanceCounterparty(db,'alice',first.id,customer('Duplicate code','c-001',bobWallet)),'conflict',409);
    failure(()=>createFinanceCounterparty(db,'alice',first.id,customer('Duplicate address','C-002')),'conflict',409);
    const another=createFinanceCounterparty(db,'alice',first.id,customer('Other','C-003',bobWallet));
    failure(()=>updateFinanceCounterparty(db,'alice',first.id,party.id,{name:'Changed',addresses:another.addresses}),'conflict',409);
    expect(getFinanceCounterparty(db,'alice',first.id,party.id)).toEqual(party);
    const updated=updateFinanceCounterparty(db,'alice',first.id,party.id,{name:'Renamed'});expect(updated.name).toBe('Renamed');expect(updated.code).toBe(party.code);expect(updated.addresses).toEqual(party.addresses);
    failure(()=>getFinanceCounterparty(db,'alice',second.id,party.id),'not_found',404);
  }finally{db.close();}
});

test('soft disabling retains records, frees active matching maps, and audit snapshots cannot be changed or deleted',()=>{
  const db=fixture();try{
    const org=ensurePersonalFinanceOrganization(db,'alice'),wallet=registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Treasury'}),party=createFinanceCounterparty(db,'alice',org.id,customer());
    expect(disableFinanceBusinessWallet(db,'alice',org.id,wallet.id).disabledAt).not.toBeNull();expect(listFinanceBusinessWallets(db,'alice',org.id)).toHaveLength(0);expect(listFinanceBusinessWallets(db,'alice',org.id,true)).toHaveLength(1);
    const disabled=disableFinanceCounterparty(db,'alice',org.id,party.id);expect(disabled.disabledAt).not.toBeNull();expect(disabled.addresses).toEqual(party.addresses);expect(listFinanceCounterparties(db,'alice',org.id)).toHaveLength(0);
    expect(listFinanceCounterparties(db,'alice',org.id,true)).toHaveLength(1);failure(()=>updateFinanceCounterparty(db,'alice',org.id,party.id,{name:'Reedit'}),'conflict',409);
    expect(createFinanceCounterparty(db,'alice',org.id,customer()).id).not.toBe(party.id);
    const before=readFinanceOrganizationAudit(db,'alice',org.id).items;
    expect(before.find(event=>event.action==='counterparty_disabled')?.before).toEqual(party);
    expect(disableFinanceCounterparty(db,'alice',org.id,party.id)).toEqual(disabled);expect(readFinanceOrganizationAudit(db,'alice',org.id).items).toEqual(before);
    expect(()=>db.run("UPDATE finance_organization_audit SET action='tampered' WHERE organization_id=?",[org.id])).toThrow('append-only');
    expect(()=>db.run('DELETE FROM finance_organization_audit WHERE organization_id=?',[org.id])).toThrow('append-only');
    expect(registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Restored'}).id).toBe(wallet.id);
  }finally{db.close();}
});

test('rejects invalid chains, zero addresses, duplicates, control characters and excessive fields',()=>{
  const db=fixture();try{
    const org=ensurePersonalFinanceOrganization(db,'alice');
    for(const body of [{chainId:1,address:aliceWallet,label:'A'},{chainId:5042002,address:aliceWallet,label:'A'},{chainId:'5042',address:aliceWallet,label:'A'},{chainId:5042,address:'0x'+'0'.repeat(40),label:'A'},{chainId:5042,address:aliceWallet,label:'a'.repeat(101)},{chainId:5042,address:aliceWallet,label:'A\nB'}])failure(()=>registerFinanceBusinessWallet(db,'alice',org.id,body),'invalid_input',400);
    for(const body of [{...customer(),kind:'bank'},{...customer(),name:' '},{...customer(),addresses:Array(21).fill(customer().addresses[0])},{...customer(),addresses:[customer().addresses[0],customer().addresses[0]]},{...customer(),addresses:[{chainId:1,address:customerWallet}]},{...customer(),code:'A\u0000B'}])failure(()=>createFinanceCounterparty(db,'alice',org.id,body),'invalid_input',400);
    failure(()=>createFinanceOrganization(db,'alice',{name:'\t'}),'invalid_input',400);failure(()=>readFinanceOrganizationAudit(db,'alice',org.id,'-1'),'invalid_input',400);
    expect(listFinanceBusinessWallets(db,'alice',org.id)).toEqual([]);expect(listFinanceCounterparties(db,'alice',org.id)).toEqual([]);
    for(let i=0;i<10;i++)createFinanceOrganization(db,'alice',{name:`Company ${i}`});failure(()=>createFinanceOrganization(db,'alice',{name:'Company 11'}),'limit_reached',409);
  }finally{db.close();}
});

test('additive initialization and operations leave users, collections and personal annotations unchanged',()=>{
  const db=fixture();try{
    initFinanceWorkspace(db);const transferId=`5042:0x${'a'.repeat(64)}:1:0x3600000000000000000000000000000000000000`;
    saveFinanceDecision(db,'alice',aliceWallet,{id:transferId,category:'collection',reference:'Old invoice'});
    const users=JSON.stringify(db.query('SELECT * FROM users ORDER BY id').all()),collections=JSON.stringify(db.query('SELECT * FROM arc_collection_requests').all());
    initFinanceOrganizations(db);const org=ensurePersonalFinanceOrganization(db,'alice');registerFinanceBusinessWallet(db,'alice',org.id,{chainId:5042,address:aliceWallet,label:'Treasury'});createFinanceCounterparty(db,'alice',org.id,customer());
    expect(JSON.stringify(db.query('SELECT * FROM users ORDER BY id').all())).toBe(users);expect(JSON.stringify(db.query('SELECT * FROM arc_collection_requests').all())).toBe(collections);
    expect(readFinanceDecisions(db,'alice',aliceWallet,[transferId]).decisions[transferId]).toEqual({category:'collection',reference:'Old invoice'});
    expect((db.query('PRAGMA foreign_key_check').all())).toEqual([]);
  }finally{db.close();}
});
