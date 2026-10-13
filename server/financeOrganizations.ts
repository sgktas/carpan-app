import type {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';

/** Private Finance workspace records; no wallet signature, transfer or chain scan. */
export type FinanceOrganizationRole='owner'|'admin'|'reviewer'|'viewer';
export type FinanceOrganizationPermission='read'|'write'|'manage';
export type FinanceOrganization={id:string;name:string;kind:'personal'|'business';ownerId:string;role:FinanceOrganizationRole;createdAt:string};
export type FinanceOrganizationMember={userId:string;role:FinanceOrganizationRole;createdAt:string};
export type FinanceBusinessWallet={id:string;organizationId:string;chainId:5042;address:string;label:string;registrationSource:'verified_wallet'|'collection_recipient';registeredBy:string;createdAt:string;updatedAt:string;disabledAt:string|null};
export type FinanceCounterpartyAddress={chainId:5042;address:string;label:string};
export type FinanceCounterparty={id:string;organizationId:string;name:string;code:string;kind:'customer'|'supplier'|'other';addresses:FinanceCounterpartyAddress[];createdAt:string;updatedAt:string;disabledAt:string|null};
export type FinanceOrganizationAudit={id:string;organizationId:string;actorId:string;action:string;targetType:'organization'|'wallet'|'counterparty';targetId:string;before:unknown;after:unknown;createdAt:string};

export class FinanceOrganizationError extends Error {
  constructor(public code:'invalid_input'|'unauthenticated'|'not_found'|'forbidden'|'conflict'|'wallet_unverified'|'limit_reached',message:string,public status:number){super(message);this.name='FinanceOrganizationError';}
}
const failure=(code:FinanceOrganizationError['code'],message:string,status=400):never=>{throw new FinanceOrganizationError(code,message,status);};
const timestamp=()=>new Date().toISOString();
const hasControl=(value:string)=>Array.from(value).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127);

export function initFinanceOrganizations(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS finance_organizations(
    id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('personal','business')),created_at TEXT NOT NULL,disabled_at TEXT,
    FOREIGN KEY(owner_id) REFERENCES users(id))`);
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS finance_personal_organization ON finance_organizations(owner_id) WHERE kind='personal'");
  db.run(`CREATE TABLE IF NOT EXISTS finance_organization_members(
    organization_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','admin','reviewer','viewer')),
    created_at TEXT NOT NULL,disabled_at TEXT,PRIMARY KEY(organization_id,user_id),
    FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(user_id) REFERENCES users(id))`);
  db.run('CREATE INDEX IF NOT EXISTS finance_organization_member_user ON finance_organization_members(user_id,disabled_at)');
  db.run(`CREATE TABLE IF NOT EXISTS finance_business_wallets(
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,chain_id INTEGER NOT NULL CHECK(chain_id=5042),address TEXT NOT NULL,
    label TEXT NOT NULL,registration_source TEXT NOT NULL CHECK(registration_source IN ('verified_wallet','collection_recipient')),
    registered_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,disabled_at TEXT,
    UNIQUE(organization_id,chain_id,address),FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(registered_by) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_counterparties(
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,name TEXT NOT NULL,code TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('customer','supplier','other')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,disabled_at TEXT,
    FOREIGN KEY(organization_id) REFERENCES finance_organizations(id))`);
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS finance_counterparty_code ON finance_counterparties(organization_id,lower(code)) WHERE disabled_at IS NULL AND code<>''");
  db.run(`CREATE TABLE IF NOT EXISTS finance_counterparty_addresses(
    organization_id TEXT NOT NULL,counterparty_id TEXT NOT NULL,chain_id INTEGER NOT NULL CHECK(chain_id=5042),address TEXT NOT NULL,
    label TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),PRIMARY KEY(counterparty_id,chain_id,address),
    FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(counterparty_id) REFERENCES finance_counterparties(id))`);
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS finance_counterparty_address_unique ON finance_counterparty_addresses(organization_id,chain_id,address) WHERE active=1');
  db.run(`CREATE TABLE IF NOT EXISTS finance_organization_audit(
    id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('organization','wallet','counterparty')),target_id TEXT NOT NULL,
    before_json TEXT,after_json TEXT,created_at TEXT NOT NULL,FOREIGN KEY(organization_id) REFERENCES finance_organizations(id))`);
  db.run('CREATE INDEX IF NOT EXISTS finance_organization_audit_scope ON finance_organization_audit(organization_id,created_at)');
  db.run("CREATE TRIGGER IF NOT EXISTS finance_organization_audit_no_update BEFORE UPDATE ON finance_organization_audit BEGIN SELECT RAISE(ABORT,'Finance history is append-only'); END");
  db.run("CREATE TRIGGER IF NOT EXISTS finance_organization_audit_no_delete BEFORE DELETE ON finance_organization_audit BEGIN SELECT RAISE(ABORT,'Finance history is append-only'); END");
}

function identifier(value:unknown):string{
  if(typeof value!=='string'||!value.trim()||value.length>128||hasControl(value))return failure('invalid_input','Invalid Finance identifier.');
  return value;
}
function currentUser(db:Database,userId:string){
  identifier(userId);
  const user=db.query('SELECT id,merged_into FROM users WHERE id=?').get(userId) as {id:string;merged_into:string|null}|null;
  if(!user||user.merged_into)return failure('unauthenticated','A current Carpan account is required.',401);
  return user;
}
function text(value:unknown,max:number,required=false):string{
  if(typeof value!=='string'||value.length>max||hasControl(value)||(required&&!value.trim()))return failure('invalid_input','Check the Finance name, label or reference.');
  return value.trim();
}
function address(value:unknown):string{
  if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value)||/^0x0{40}$/i.test(value))return failure('invalid_input','A valid Arc address is required.');
  return value.toLowerCase();
}
function chain(value:unknown):5042{if(value!==5042)return failure('invalid_input','This Finance workspace currently supports Arc Mainnet only.');return 5042;}
function draft(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return failure('invalid_input','Finance record fields are required.');return value as Record<string,unknown>;}
function audit(db:Database,userId:string,organizationId:string,action:string,targetType:FinanceOrganizationAudit['targetType'],targetId:string,before:unknown,after:unknown){
  db.run('INSERT INTO finance_organization_audit(id,organization_id,actor_id,action,target_type,target_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    [randomUUID(),organizationId,userId,action,targetType,targetId,before===null?null:JSON.stringify(before),after===null?null:JSON.stringify(after),timestamp()]);
}
type OrganizationRow={id:string;name:string;kind:FinanceOrganization['kind'];owner_id:string;created_at:string;role:FinanceOrganizationRole};
function organization(row:OrganizationRow):FinanceOrganization{return {id:row.id,name:row.name,kind:row.kind,ownerId:row.owner_id,role:row.role,createdAt:row.created_at};}

/** userId must come from the authenticated session, never the request body. */
export function requireFinanceOrganizationAccess(db:Database,userId:string,organizationId:string,permission:FinanceOrganizationPermission='read'):FinanceOrganization{
  currentUser(db,userId);identifier(organizationId);
  if(!['read','write','manage'].includes(permission))return failure('invalid_input','Invalid Finance access requirement.');
  const row=db.query(`SELECT o.*,m.role FROM finance_organizations o JOIN finance_organization_members m ON m.organization_id=o.id
    WHERE o.id=? AND m.user_id=? AND o.disabled_at IS NULL AND m.disabled_at IS NULL`).get(organizationId,userId) as OrganizationRow|null;
  // Same response for missing and foreign organizations: do not reveal existence.
  if(!row)return failure('not_found','Finance workspace not found.',404);
  const allowed=permission==='read'||permission==='write'&&['owner','admin','reviewer'].includes(row.role)||permission==='manage'&&['owner','admin'].includes(row.role);
  if(!allowed)return failure('forbidden','Your workspace role cannot perform this action.',403);
  return organization(row);
}
export function ensurePersonalFinanceOrganization(db:Database,userId:string):FinanceOrganization{
  currentUser(db,userId);
  return db.transaction(()=>{
    const existing=db.query("SELECT id FROM finance_organizations WHERE owner_id=? AND kind='personal'").get(userId) as {id:string}|null;
    if(existing)return requireFinanceOrganizationAccess(db,userId,existing.id);
    const id=randomUUID(),now=timestamp();
    db.run("INSERT INTO finance_organizations(id,owner_id,name,kind,created_at) VALUES(?,?,?,'personal',?)",[id,userId,'My Finance workspace',now]);
    db.run("INSERT INTO finance_organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'owner',?)",[id,userId,now]);
    const created=requireFinanceOrganizationAccess(db,userId,id);
    audit(db,userId,id,'workspace_created','organization',id,null,created);return created;
  })();
}
export function createFinanceOrganization(db:Database,userId:string,body:unknown):FinanceOrganization{
  currentUser(db,userId);const input=draft(body),name=text(input.name,120,true);
  return db.transaction(()=>{
    const count=db.query("SELECT count(*) AS n FROM finance_organizations WHERE owner_id=? AND kind='business' AND disabled_at IS NULL").get(userId) as {n:number};
    if(count.n>=10)return failure('limit_reached','Account business workspace limit reached.',409);
    const id=randomUUID(),now=timestamp();
    db.run("INSERT INTO finance_organizations(id,owner_id,name,kind,created_at) VALUES(?,?,?,'business',?)",[id,userId,name,now]);
    db.run("INSERT INTO finance_organization_members(organization_id,user_id,role,created_at) VALUES(?,?,'owner',?)",[id,userId,now]);
    const created=requireFinanceOrganizationAccess(db,userId,id);audit(db,userId,id,'workspace_created','organization',id,null,created);return created;
  })();
}
export function getFinanceOrganization(db:Database,userId:string,organizationId:string){return requireFinanceOrganizationAccess(db,userId,organizationId);}
export function listFinanceOrganizations(db:Database,userId:string):FinanceOrganization[]{
  currentUser(db,userId);
  return (db.query(`SELECT o.*,m.role FROM finance_organizations o JOIN finance_organization_members m ON m.organization_id=o.id
    WHERE m.user_id=? AND o.disabled_at IS NULL AND m.disabled_at IS NULL ORDER BY o.created_at,o.id`).all(userId) as OrganizationRow[]).map(organization);
}
export function listFinanceOrganizationMembers(db:Database,userId:string,organizationId:string):FinanceOrganizationMember[]{
  requireFinanceOrganizationAccess(db,userId,organizationId);
  return (db.query(`SELECT m.user_id,m.role,m.created_at FROM finance_organization_members m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=? AND m.disabled_at IS NULL AND u.merged_into IS NULL ORDER BY m.created_at,m.user_id`).all(organizationId) as {user_id:string;role:FinanceOrganizationRole;created_at:string}[])
    .map(row=>({userId:row.user_id,role:row.role,createdAt:row.created_at}));
}

type WalletRow={id:string;organization_id:string;chain_id:5042;address:string;label:string;registration_source:FinanceBusinessWallet['registrationSource'];registered_by:string;created_at:string;updated_at:string;disabled_at:string|null};
function businessWallet(row:WalletRow):FinanceBusinessWallet{return {id:row.id,organizationId:row.organization_id,chainId:row.chain_id,address:row.address,label:row.label,registrationSource:row.registration_source,registeredBy:row.registered_by,createdAt:row.created_at,updatedAt:row.updated_at,disabledAt:row.disabled_at};}
function walletRow(db:Database,organizationId:string,walletId:string):WalletRow{
  identifier(walletId);
  const row=db.query('SELECT * FROM finance_business_wallets WHERE organization_id=? AND id=?').get(organizationId,walletId) as WalletRow|null;
  if(!row)return failure('not_found','Business wallet not found.',404);return row;
}
export function getFinanceBusinessWallet(db:Database,userId:string,organizationId:string,walletId:string):FinanceBusinessWallet{
  requireFinanceOrganizationAccess(db,userId,organizationId);return businessWallet(walletRow(db,organizationId,walletId));
}
export function listFinanceBusinessWallets(db:Database,userId:string,organizationId:string,includeDisabled=false):FinanceBusinessWallet[]{
  requireFinanceOrganizationAccess(db,userId,organizationId);
  if(typeof includeDisabled!=='boolean')return failure('invalid_input','Invalid wallet filter.');
  return (db.query('SELECT * FROM finance_business_wallets WHERE organization_id=? AND (?=1 OR disabled_at IS NULL) ORDER BY created_at,id').all(organizationId,includeDisabled?1:0) as WalletRow[]).map(businessWallet);
}
function registrationSource(db:Database,userId:string,selected:string):FinanceBusinessWallet['registrationSource']{
  const user=db.query('SELECT wallet_address,wallet_verified_at FROM users WHERE id=?').get(userId) as {wallet_address:string|null;wallet_verified_at:string|null}|null;
  if(user?.wallet_verified_at&&user.wallet_address?.toLowerCase()===selected)return 'verified_wallet';
  const available=!!db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='arc_collection_requests'").get();
  if(available&&db.query('SELECT id FROM arc_collection_requests WHERE user_id=? AND lower(recipient)=? AND cancelled=0 LIMIT 1').get(userId,selected))return 'collection_recipient';
  return failure('wallet_unverified','Use your verified account wallet or an active collection recipient belonging to this account.',403);
}
export function registerFinanceBusinessWallet(db:Database,userId:string,organizationId:string,body:unknown):FinanceBusinessWallet{
  requireFinanceOrganizationAccess(db,userId,organizationId,'manage');
  const input=draft(body),chainId=chain(input.chainId),selected=address(input.address),label=text(input.label,100,true);
  return db.transaction(()=>{
    const source=registrationSource(db,userId,selected),now=timestamp();
    const previous=db.query('SELECT * FROM finance_business_wallets WHERE organization_id=? AND chain_id=? AND address=?').get(organizationId,chainId,selected) as WalletRow|null;
    if(previous&&!previous.disabled_at&&previous.label===label)return businessWallet(previous);
    if(!previous){const count=db.query('SELECT count(*) AS n FROM finance_business_wallets WHERE organization_id=? AND disabled_at IS NULL').get(organizationId) as {n:number};if(count.n>=25)return failure('limit_reached','Workspace wallet limit reached.',409);}
    else if(previous.disabled_at){const count=db.query('SELECT count(*) AS n FROM finance_business_wallets WHERE organization_id=? AND disabled_at IS NULL').get(organizationId) as {n:number};if(count.n>=25)return failure('limit_reached','Workspace wallet limit reached.',409);}
    const id=previous?.id||randomUUID();
    if(previous)db.run('UPDATE finance_business_wallets SET label=?,registration_source=?,registered_by=?,updated_at=?,disabled_at=NULL WHERE organization_id=? AND id=?',[label,source,userId,now,organizationId,id]);
    else db.run('INSERT INTO finance_business_wallets(id,organization_id,chain_id,address,label,registration_source,registered_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,organizationId,chainId,selected,label,source,userId,now,now]);
    const result=businessWallet(walletRow(db,organizationId,id));
    audit(db,userId,organizationId,previous?.disabled_at?'wallet_reenabled':previous?'wallet_updated':'wallet_registered','wallet',id,previous?businessWallet(previous):null,result);return result;
  })();
}
export function disableFinanceBusinessWallet(db:Database,userId:string,organizationId:string,walletId:string):FinanceBusinessWallet{
  requireFinanceOrganizationAccess(db,userId,organizationId,'manage');
  return db.transaction(()=>{const previous=businessWallet(walletRow(db,organizationId,walletId));if(previous.disabledAt)return previous;
    const now=timestamp();db.run('UPDATE finance_business_wallets SET disabled_at=?,updated_at=? WHERE organization_id=? AND id=?',[now,now,organizationId,walletId]);
    const result=businessWallet(walletRow(db,organizationId,walletId));audit(db,userId,organizationId,'wallet_disabled','wallet',walletId,previous,result);return result;
  })();
}

type CounterpartyRow={id:string;organization_id:string;name:string;code:string;kind:FinanceCounterparty['kind'];created_at:string;updated_at:string;disabled_at:string|null};
function counterpartyRow(db:Database,organizationId:string,id:string):CounterpartyRow{
  identifier(id);const row=db.query('SELECT * FROM finance_counterparties WHERE organization_id=? AND id=?').get(organizationId,id) as CounterpartyRow|null;
  if(!row)return failure('not_found','Counterparty not found.',404);return row;
}
function counterparty(db:Database,row:CounterpartyRow):FinanceCounterparty{
  const addresses=(db.query('SELECT chain_id,address,label FROM finance_counterparty_addresses WHERE organization_id=? AND counterparty_id=? ORDER BY chain_id,address').all(row.organization_id,row.id) as {chain_id:5042;address:string;label:string}[]).map(item=>({chainId:item.chain_id,address:item.address,label:item.label}));
  return {id:row.id,organizationId:row.organization_id,name:row.name,code:row.code,kind:row.kind,addresses,createdAt:row.created_at,updatedAt:row.updated_at,disabledAt:row.disabled_at};
}
export function getFinanceCounterparty(db:Database,userId:string,organizationId:string,id:string):FinanceCounterparty{
  requireFinanceOrganizationAccess(db,userId,organizationId);return counterparty(db,counterpartyRow(db,organizationId,id));
}
export function listFinanceCounterparties(db:Database,userId:string,organizationId:string,includeDisabled=false):FinanceCounterparty[]{
  requireFinanceOrganizationAccess(db,userId,organizationId);
  if(typeof includeDisabled!=='boolean')return failure('invalid_input','Invalid counterparty filter.');
  return (db.query('SELECT * FROM finance_counterparties WHERE organization_id=? AND (?=1 OR disabled_at IS NULL) ORDER BY lower(name),id').all(organizationId,includeDisabled?1:0) as CounterpartyRow[]).map(row=>counterparty(db,row));
}
function counterpartyInput(body:unknown){
  const input=draft(body),name=text(input.name,120,true),code=text(input.code??'',80),kind=input.kind??'other';
  if(typeof kind!=='string'||!['customer','supplier','other'].includes(kind))return failure('invalid_input','Invalid counterparty kind.');
  if(!Array.isArray(input.addresses)||input.addresses.length>20)return failure('invalid_input','A counterparty supports up to 20 Arc addresses.');
  const addresses=input.addresses.map(item=>{const record=draft(item);return {chainId:chain(record.chainId),address:address(record.address),label:text(record.label??'',80)};});
  if(new Set(addresses.map(item=>`${item.chainId}:${item.address}`)).size!==addresses.length)return failure('invalid_input','Duplicate counterparty address.');
  return {name,code,kind:kind as FinanceCounterparty['kind'],addresses};
}
function checkCounterpartyConflicts(db:Database,organizationId:string,id:string,code:string,addresses:FinanceCounterpartyAddress[]){
  if(code&&db.query('SELECT id FROM finance_counterparties WHERE organization_id=? AND lower(code)=lower(?) AND disabled_at IS NULL AND id<>?').get(organizationId,code,id))return failure('conflict','That counterparty code is already used in this workspace.',409);
  for(const selected of addresses)if(db.query('SELECT counterparty_id FROM finance_counterparty_addresses WHERE organization_id=? AND chain_id=? AND address=? AND active=1 AND counterparty_id<>?').get(organizationId,selected.chainId,selected.address,id))return failure('conflict','An address is already linked to another counterparty in this workspace.',409);
}
function saveCounterpartyAddresses(db:Database,organizationId:string,id:string,addresses:FinanceCounterpartyAddress[]){
  db.run('DELETE FROM finance_counterparty_addresses WHERE organization_id=? AND counterparty_id=?',[organizationId,id]);
  for(const selected of addresses)db.run('INSERT INTO finance_counterparty_addresses(organization_id,counterparty_id,chain_id,address,label) VALUES(?,?,?,?,?)',[organizationId,id,selected.chainId,selected.address,selected.label]);
}
export function createFinanceCounterparty(db:Database,userId:string,organizationId:string,body:unknown):FinanceCounterparty{
  requireFinanceOrganizationAccess(db,userId,organizationId,'write');const input=counterpartyInput(body);
  return db.transaction(()=>{const count=db.query('SELECT count(*) AS n FROM finance_counterparties WHERE organization_id=? AND disabled_at IS NULL').get(organizationId) as {n:number};
    if(count.n>=500)return failure('limit_reached','Workspace counterparty limit reached.',409);
    const id=randomUUID(),now=timestamp();checkCounterpartyConflicts(db,organizationId,id,input.code,input.addresses);
    db.run('INSERT INTO finance_counterparties(id,organization_id,name,code,kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',[id,organizationId,input.name,input.code,input.kind,now,now]);
    saveCounterpartyAddresses(db,organizationId,id,input.addresses);
    const result=counterparty(db,counterpartyRow(db,organizationId,id));audit(db,userId,organizationId,'counterparty_created','counterparty',id,null,result);return result;
  })();
}
/** Partial record update; missing fields preserve existing private mappings. */
export function updateFinanceCounterparty(db:Database,userId:string,organizationId:string,id:string,body:unknown):FinanceCounterparty{
  requireFinanceOrganizationAccess(db,userId,organizationId,'write');const changes=draft(body);
  return db.transaction(()=>{const previous=counterparty(db,counterpartyRow(db,organizationId,id));
    if(previous.disabledAt)return failure('conflict','A disabled counterparty cannot be edited.',409);
    const input=counterpartyInput({...previous,...changes});
    checkCounterpartyConflicts(db,organizationId,id,input.code,input.addresses);
    const now=timestamp();db.run('UPDATE finance_counterparties SET name=?,code=?,kind=?,updated_at=? WHERE organization_id=? AND id=?',[input.name,input.code,input.kind,now,organizationId,id]);
    saveCounterpartyAddresses(db,organizationId,id,input.addresses);const result=counterparty(db,counterpartyRow(db,organizationId,id));
    audit(db,userId,organizationId,'counterparty_updated','counterparty',id,previous,result);return result;
  })();
}
export function disableFinanceCounterparty(db:Database,userId:string,organizationId:string,id:string):FinanceCounterparty{
  requireFinanceOrganizationAccess(db,userId,organizationId,'write');
  return db.transaction(()=>{const previous=counterparty(db,counterpartyRow(db,organizationId,id));if(previous.disabledAt)return previous;
    const now=timestamp();db.run('UPDATE finance_counterparties SET disabled_at=?,updated_at=? WHERE organization_id=? AND id=?',[now,now,organizationId,id]);
    db.run('UPDATE finance_counterparty_addresses SET active=0 WHERE organization_id=? AND counterparty_id=?',[organizationId,id]);
    const result=counterparty(db,counterpartyRow(db,organizationId,id));audit(db,userId,organizationId,'counterparty_disabled','counterparty',id,previous,result);return result;
  })();
}
export function readFinanceOrganizationAudit(db:Database,userId:string,organizationId:string,before:unknown=''):{items:FinanceOrganizationAudit[];nextCursor:string|null}{
  requireFinanceOrganizationAccess(db,userId,organizationId);
  if(typeof before!=='string'||before&&!/^[1-9][0-9]{0,14}$/.test(before))return failure('invalid_input','Invalid Finance history cursor.');
  type AuditRow={cursor:number;id:string;organization_id:string;actor_id:string;action:string;target_type:FinanceOrganizationAudit['targetType'];target_id:string;before_json:string|null;after_json:string|null;created_at:string};
  const rows=db.query('SELECT rowid AS cursor,* FROM finance_organization_audit WHERE organization_id=? AND rowid<? ORDER BY rowid DESC LIMIT 51').all(organizationId,before?Number(before):Number.MAX_SAFE_INTEGER) as AuditRow[];
  return {items:rows.slice(0,50).map(row=>({id:row.id,organizationId:row.organization_id,actorId:row.actor_id,action:row.action,targetType:row.target_type,targetId:row.target_id,before:row.before_json?JSON.parse(row.before_json):null,after:row.after_json?JSON.parse(row.after_json):null,createdAt:row.created_at})),nextCursor:rows.length>50?String(rows[49].cursor):null};
}
