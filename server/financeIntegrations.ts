import type {Database} from 'bun:sqlite';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {FinanceOrganizationError,requireFinanceOrganizationAccess,getFinanceBusinessWallet} from './financeOrganizations';
import {readFinanceExportBatch} from './financeOperationsStore';

export const FINANCE_API_SCOPES=['movements:read','exports:read','accounting:write'] as const;
export type FinanceApiScope=typeof FINANCE_API_SCOPES[number];
export type FinanceIntegration={id:string;organizationId:string;name:string;createdAt:string;createdBy:string;disabledAt:string|null};
export type FinanceApiKey={id:string;integrationId:string;name:string;prefix:string;scopes:FinanceApiScope[];createdAt:string;expiresAt:string;revokedAt:string|null;lastUsedAt:string|null};
export type FinanceApiPrincipal={keyId:string;integrationId:string;organizationId:string;actorId:string;scopes:FinanceApiScope[]};
export type FinanceAccountingAcknowledgement={id:string;integrationId:string;walletId:string;batchId:string;movementId:string;decisionVersion:number;externalRecordId:string;recordedAt:string;keyId:string};
type IntegrationRow={id:string;organization_id:string;name:string;created_at:string;created_by:string;disabled_at:string|null};
type KeyRow={id:string;integration_id:string;organization_id:string;name:string;prefix:string;secret_hash:string;scopes_json:string;created_at:string;created_by:string;expires_at:string;revoked_at:string|null;last_used_at:string|null};
type AckRow={id:string;integration_id:string;wallet_id:string;batch_id:string;movement_id:string;decision_version:number;external_record_id:string;recorded_at:string;key_id:string};
const fail=(code:FinanceOrganizationError['code'],message:string,status=400):never=>{throw new FinanceOrganizationError(code,message,status);};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const text=(value:unknown,max:number,required=true):string=>{if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||(required&&!value.trim()))return fail('invalid_input','Check the integration name or accounting reference.');return value.trim();};
const draft=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return fail('invalid_input','Integration fields are required.');return value as Record<string,unknown>;};
function integration(row:IntegrationRow):FinanceIntegration{return {id:row.id,organizationId:row.organization_id,name:row.name,createdAt:row.created_at,createdBy:row.created_by,disabledAt:row.disabled_at};}
function keyMetadata(row:KeyRow):FinanceApiKey{return {id:row.id,integrationId:row.integration_id,name:row.name,prefix:row.prefix,scopes:JSON.parse(row.scopes_json),createdAt:row.created_at,expiresAt:row.expires_at,revokedAt:row.revoked_at,lastUsedAt:row.last_used_at};}
function acknowledgement(row:AckRow):FinanceAccountingAcknowledgement{return {id:row.id,integrationId:row.integration_id,walletId:row.wallet_id,batchId:row.batch_id,movementId:row.movement_id,decisionVersion:row.decision_version,externalRecordId:row.external_record_id,recordedAt:row.recorded_at,keyId:row.key_id};}
function audit(db:Database,userId:string,orgId:string,integrationId:string,action:string,details:unknown){db.run('INSERT INTO finance_integration_audit(id,organization_id,integration_id,actor_id,action,details_json,created_at) VALUES(?,?,?,?,?,?,?)',[randomUUID(),orgId,integrationId,userId,action,JSON.stringify(details),new Date().toISOString()]);}

export function initFinanceIntegrations(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS finance_integrations(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,name TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,disabled_at TEXT,FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(created_by) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_api_keys(id TEXT PRIMARY KEY,integration_id TEXT NOT NULL,organization_id TEXT NOT NULL,name TEXT NOT NULL,prefix TEXT NOT NULL,secret_hash TEXT NOT NULL UNIQUE,scopes_json TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,last_used_at TEXT,FOREIGN KEY(integration_id) REFERENCES finance_integrations(id),FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(created_by) REFERENCES users(id))`);
  db.run('CREATE INDEX IF NOT EXISTS finance_api_key_scope ON finance_api_keys(organization_id,integration_id)');
  db.run(`CREATE TABLE IF NOT EXISTS finance_api_usage(key_id TEXT NOT NULL,organization_id TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL CHECK(requests>=0),PRIMARY KEY(key_id,day),FOREIGN KEY(key_id) REFERENCES finance_api_keys(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_accounting_ack_requests(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,integration_id TEXT NOT NULL,wallet_id TEXT NOT NULL,batch_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(integration_id,idempotency_key),FOREIGN KEY(integration_id) REFERENCES finance_integrations(id),FOREIGN KEY(batch_id) REFERENCES finance_export_batches(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_accounting_acknowledgements(id TEXT PRIMARY KEY,request_id TEXT NOT NULL,organization_id TEXT NOT NULL,integration_id TEXT NOT NULL,wallet_id TEXT NOT NULL,batch_id TEXT NOT NULL,content_hash TEXT NOT NULL,movement_id TEXT NOT NULL,decision_version INTEGER NOT NULL CHECK(decision_version>0),external_record_id TEXT NOT NULL,recorded_at TEXT NOT NULL,key_id TEXT NOT NULL,UNIQUE(integration_id,wallet_id,movement_id,decision_version),FOREIGN KEY(request_id) REFERENCES finance_accounting_ack_requests(id),FOREIGN KEY(key_id) REFERENCES finance_api_keys(id),FOREIGN KEY(batch_id) REFERENCES finance_export_batches(id))`);
  db.run('CREATE INDEX IF NOT EXISTS finance_ack_scope ON finance_accounting_acknowledgements(organization_id,integration_id,recorded_at,id)');
  db.run(`CREATE TABLE IF NOT EXISTS finance_integration_audit(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,integration_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(integration_id) REFERENCES finance_integrations(id))`);
  for(const table of ['finance_integration_audit','finance_accounting_ack_requests','finance_accounting_acknowledgements']){
    db.run(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Finance integration evidence is immutable'); END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Finance integration evidence is immutable'); END`);
  }
}
export function getFinanceIntegration(db:Database,userId:string,orgId:string,id:string,manage=false):FinanceIntegration{
  requireFinanceOrganizationAccess(db,userId,orgId,manage?'manage':'read');
  const row=db.query('SELECT * FROM finance_integrations WHERE id=? AND organization_id=?').get(id,orgId) as IntegrationRow|null;
  if(!row)return fail('not_found','Finance integration not found.',404);return integration(row);
}
export function listFinanceIntegrations(db:Database,userId:string,orgId:string){requireFinanceOrganizationAccess(db,userId,orgId);return (db.query('SELECT * FROM finance_integrations WHERE organization_id=? ORDER BY created_at,id LIMIT 100').all(orgId) as IntegrationRow[]).map(integration);}
export function createFinanceIntegration(db:Database,userId:string,orgId:string,body:unknown):FinanceIntegration{
  const org=requireFinanceOrganizationAccess(db,userId,orgId,'manage');
  if(org.kind!=='business')return fail('invalid_input','Create a business workspace before connecting accounting software.');
  const name=text(draft(body).name,100);
  return db.transaction(()=>{
    const count=(db.query('SELECT COUNT(*) AS n FROM finance_integrations WHERE organization_id=?').get(orgId) as {n:number}).n;
    if(count>=20)return fail('limit_reached','This workspace has reached its integration limit.',409);
    const result:FinanceIntegration={id:randomUUID(),organizationId:orgId,name,createdAt:new Date().toISOString(),createdBy:userId,disabledAt:null};
    db.run('INSERT INTO finance_integrations(id,organization_id,name,created_at,created_by) VALUES(?,?,?,?,?)',[result.id,orgId,name,result.createdAt,userId]);audit(db,userId,orgId,result.id,'integration_created',{name});return result;
  })();
}
export function listFinanceApiKeys(db:Database,userId:string,orgId:string,id:string):FinanceApiKey[]{getFinanceIntegration(db,userId,orgId,id);return (db.query('SELECT * FROM finance_api_keys WHERE organization_id=? AND integration_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(orgId,id) as KeyRow[]).map(keyMetadata);}
export function createFinanceApiKey(db:Database,userId:string,orgId:string,id:string,body:unknown,now=Date.now()):{key:FinanceApiKey;secret:string}{
  const target=getFinanceIntegration(db,userId,orgId,id,true),input=draft(body),name=text(input.name,80);
  if(target.disabledAt)return fail('conflict','This integration is disabled.',409);
  if(!Array.isArray(input.scopes)||!input.scopes.length||input.scopes.length>3||input.scopes.some(s=>!FINANCE_API_SCOPES.includes(s as FinanceApiScope))||new Set(input.scopes).size!==input.scopes.length||![30,90,365].includes(input.expiresInDays as number))return fail('invalid_input','Choose valid API scopes and an expiry of 30, 90 or 365 days.');
  const scopes=[...input.scopes].sort() as FinanceApiScope[];
  return db.transaction(()=>{
    const count=(db.query('SELECT COUNT(*) AS n FROM finance_api_keys WHERE organization_id=? AND revoked_at IS NULL AND expires_at>?').get(orgId,new Date(now).toISOString()) as {n:number}).n;
    if(count>=100)return fail('limit_reached','This workspace has reached its active API key limit.',409);
    const historyCount=(db.query('SELECT COUNT(*) AS n FROM finance_api_keys WHERE integration_id=?').get(id) as {n:number}).n;
    if(historyCount>=100)return fail('limit_reached','This integration has reached its API key history limit.',409);
    const keyId=randomBytes(16).toString('hex'),secret=`carpan_live_${keyId}_${randomBytes(32).toString('base64url')}`,prefix=`carpan_live_${keyId.slice(0,8)}`;
    const createdAt=new Date(now).toISOString(),expiresAt=new Date(now+(input.expiresInDays as number)*86400000).toISOString();
    db.run('INSERT INTO finance_api_keys(id,integration_id,organization_id,name,prefix,secret_hash,scopes_json,created_at,created_by,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[keyId,id,orgId,name,prefix,digest(secret),JSON.stringify(scopes),createdAt,userId,expiresAt]);
    audit(db,userId,orgId,id,'api_key_created',{keyId,prefix,scopes,expiresAt});return {key:{id:keyId,integrationId:id,name,prefix,scopes,createdAt,expiresAt,revokedAt:null,lastUsedAt:null},secret};
  })();
}
export function revokeFinanceApiKey(db:Database,userId:string,orgId:string,id:string,keyId:string){getFinanceIntegration(db,userId,orgId,id,true);return db.transaction(()=>{
  const row=db.query('SELECT * FROM finance_api_keys WHERE id=? AND integration_id=? AND organization_id=?').get(keyId,id,orgId) as KeyRow|null;
  if(!row)return fail('not_found','API key not found.',404);
  if(!row.revoked_at){const now=new Date().toISOString();db.run('UPDATE finance_api_keys SET revoked_at=? WHERE id=?',[now,keyId]);audit(db,userId,orgId,id,'api_key_revoked',{keyId});}return {ok:true};
})();}
function livePrincipal(db:Database,keyId:string,scope?:FinanceApiScope,now=Date.now()):FinanceApiPrincipal{
  const row=db.query('SELECT * FROM finance_api_keys WHERE id=?').get(keyId) as KeyRow|null;
  if(!row||row.revoked_at||Date.parse(row.expires_at)<=now)return fail('unauthenticated','A valid Finance API key is required.',401);
  try{const target=getFinanceIntegration(db,row.created_by,row.organization_id,row.integration_id,true);if(target.disabledAt)throw Error('Disabled');}catch{return fail('unauthenticated','A valid Finance API key is required.',401);}
  const scopes=JSON.parse(row.scopes_json) as FinanceApiScope[];
  if(scope&&!scopes.includes(scope))return fail('forbidden','This API key does not grant the required scope.',403);
  return {keyId:row.id,integrationId:row.integration_id,organizationId:row.organization_id,actorId:row.created_by,scopes};
}
export function authenticateFinanceApiKey(db:Database,authorization:unknown,scope?:FinanceApiScope,now=Date.now()):FinanceApiPrincipal{
  if(typeof authorization!=='string'||authorization.length>200)return fail('unauthenticated','A valid Finance API key is required.',401);
  const match=/^Bearer (carpan_live_([a-f0-9]{32})_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if(!match)return fail('unauthenticated','A valid Finance API key is required.',401);
  const row=db.query('SELECT secret_hash FROM finance_api_keys WHERE id=?').get(match[2]) as {secret_hash:string}|null;
  const stored=Buffer.from(row?.secret_hash||'0'.repeat(64),'hex'),given=Buffer.from(digest(match[1]),'hex');
  if(!timingSafeEqual(stored,given)||!row)return fail('unauthenticated','A valid Finance API key is required.',401);
  return livePrincipal(db,match[2],scope,now);
}
export function recordFinanceApiUse(db:Database,principal:FinanceApiPrincipal,now=Date.now()){
  const live=livePrincipal(db,principal.keyId,undefined,now),day=new Date(now).toISOString().slice(0,10);
  return db.transaction(()=>{
    const used=(db.query('SELECT requests FROM finance_api_usage WHERE key_id=? AND day=?').get(live.keyId,day) as {requests:number}|null)?.requests||0;
    const organizationUsed=(db.query('SELECT COALESCE(SUM(requests),0) AS n FROM finance_api_usage WHERE organization_id=? AND day=?').get(live.organizationId,day) as {n:number}).n;
    if(used>=10000||organizationUsed>=50000)return fail('limit_reached','Finance API daily request limit reached.',429);
    db.run('INSERT INTO finance_api_usage(key_id,organization_id,day,requests) VALUES(?,?,?,1) ON CONFLICT(key_id,day) DO UPDATE SET requests=requests+1',[live.keyId,live.organizationId,day]);
    db.run('UPDATE finance_api_keys SET last_used_at=? WHERE id=?',[new Date(now).toISOString(),live.keyId]);
  })();
}
export function listFinanceAcknowledgements(db:Database,userId:string,orgId:string,id:string):FinanceAccountingAcknowledgement[]{getFinanceIntegration(db,userId,orgId,id);return (db.query('SELECT * FROM finance_accounting_acknowledgements WHERE organization_id=? AND integration_id=? ORDER BY recorded_at DESC,id DESC LIMIT 100').all(orgId,id) as AckRow[]).map(acknowledgement);}
/** This is a receiver's explicit assertion, not proof independently obtained from an ERP. */
export function acknowledgeFinanceExport(db:Database,principal:FinanceApiPrincipal,walletId:string,batchId:string,body:unknown):{acknowledgements:FinanceAccountingAcknowledgement[];acknowledgedCount:number;batchMovementCount:number;batchAccountingStatus:'partial'|'acknowledged'}{
  const live=livePrincipal(db,principal.keyId,'accounting:write'),input=draft(body),key=text(input.idempotencyKey,120),contentHash=input.contentHash;
  const wallet=getFinanceBusinessWallet(db,live.actorId,live.organizationId,walletId);
  if(wallet.disabledAt)return fail('conflict','This business wallet is disabled.',409);
  const batch=readFinanceExportBatch(db,live.actorId,live.organizationId,walletId,batchId);
  if(contentHash!==batch.contentHash)return fail('conflict','Export content hash does not match the saved batch.',409);
  if(!Array.isArray(input.records)||!input.records.length||input.records.length>100)return fail('invalid_input','Accounting acknowledgements require 1 to 100 records.');
  const records=input.records.map(value=>{const r=draft(value);return {movementId:text(r.movementId,128),decisionVersion:r.decisionVersion,externalRecordId:text(r.externalRecordId,200)};}).sort((a,b)=>a.movementId.localeCompare(b.movementId));
  if(new Set(records.map(r=>r.movementId)).size!==records.length)return fail('invalid_input','Accounting acknowledgement records must be unique.');
  for(const record of records){const exported=batch.payload.records.find(r=>r.movement.id===record.movementId);if(!exported||exported.decision.status!=='approved'||exported.decision.version!==record.decisionVersion)return fail('conflict','Acknowledgement must match an approved movement version in this export.',409);}
  const requestHash=digest(JSON.stringify({walletId,batchId,contentHash,records}));
  const result=(requestId:string)=>{
    const acknowledgements=(db.query('SELECT * FROM finance_accounting_acknowledgements WHERE request_id=? ORDER BY movement_id').all(requestId) as AckRow[]).map(acknowledgement);
    const acknowledgedCount=(db.query('SELECT COUNT(*) AS n FROM finance_accounting_acknowledgements WHERE integration_id=? AND wallet_id=? AND batch_id=? AND content_hash=?').get(live.integrationId,walletId,batchId,contentHash as string) as {n:number}).n;
    return {acknowledgements,acknowledgedCount,batchMovementCount:batch.movementCount,batchAccountingStatus:acknowledgedCount===batch.movementCount?'acknowledged' as const:'partial' as const};
  };
  return db.transaction(()=>{
    const existing=db.query('SELECT id,request_hash FROM finance_accounting_ack_requests WHERE integration_id=? AND idempotency_key=?').get(live.integrationId,key) as {id:string;request_hash:string}|null;
    if(existing){if(existing.request_hash!==requestHash)return fail('conflict','This acknowledgement key was already used for different records.',409);return result(existing.id);}
    // Same approved version may be sent in multiple exports. It cannot acquire a second posting identity.
    for(const record of records){const previous=db.query('SELECT id FROM finance_accounting_acknowledgements WHERE integration_id=? AND wallet_id=? AND movement_id=? AND decision_version=?').get(live.integrationId,walletId,record.movementId,record.decisionVersion);if(previous)return fail('conflict','This movement version has already been acknowledged. Use the original acknowledgement key.',409);}
    const requestId=randomUUID(),now=new Date().toISOString();
    db.run('INSERT INTO finance_accounting_ack_requests(id,organization_id,integration_id,wallet_id,batch_id,idempotency_key,request_hash,created_at) VALUES(?,?,?,?,?,?,?,?)',[requestId,live.organizationId,live.integrationId,walletId,batchId,key,requestHash,now]);
    for(const record of records)db.run('INSERT INTO finance_accounting_acknowledgements(id,request_id,organization_id,integration_id,wallet_id,batch_id,content_hash,movement_id,decision_version,external_record_id,recorded_at,key_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[randomUUID(),requestId,live.organizationId,live.integrationId,walletId,batchId,contentHash,record.movementId,record.decisionVersion,record.externalRecordId,now,live.keyId]);
    audit(db,live.actorId,live.organizationId,live.integrationId,'accounting_acknowledged',{requestId,batchId,keyId:live.keyId,contentHash,count:records.length});
    return result(requestId);
  })();
}
