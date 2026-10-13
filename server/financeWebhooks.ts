import type {Database} from 'bun:sqlite';
import {createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request} from 'node:https';
import {FinanceOrganizationError, getFinanceBusinessWallet, requireFinanceOrganizationAccess} from './financeOrganizations';
import {readFinanceExportBatch, type FinanceExportBatch} from './financeOperationsStore';

export type FinanceWebhookEndpoint = {id:string; organizationId:string; integrationId:string; url:string; enabled:boolean; version:number; signingSecretAvailable:boolean; createdAt:string; updatedAt:string};
export type FinanceWebhookDelivery = {id:string; eventId:string; organizationId:string; integrationId:string; endpointId:string; endpointVersion:number; walletId:string; batchId:string; status:'pending'|'delivering'|'delivered'|'failed'|'cancelled'; attempts:number; manualRetries:number; nextAttemptAt:string|null; deliveredAt:string|null; createdAt:string; lastHttpStatus:number|null; lastError:string|null};
export type FinanceWebhookAttempt = {id:string; deliveryId:string; attempt:number; status:'delivered'|'retry'|'failed'|'cancelled'; httpStatus:number|null; error:string|null; startedAt:string; finishedAt:string};
export type FinanceWebhookEvent = {schema:'carpan.finance.webhook.v1'; id:string; type:'finance.export.generated'; createdAt:string; organizationId:string; integrationId:string; batch:FinanceExportBatch};
export type FinanceWebhookAddress = {address:string; family:4|6};
export type FinanceWebhookTransportInput = {url:URL; address:FinanceWebhookAddress; body:string; headers:Record<string,string>; timeoutMs:number; responseLimit:number};
export type FinanceWebhookTransportResult = {status:number; responseBytes?:number};
export type FinanceWebhookOptions = {encryptionKey?:string; resolve?:(hostname:string)=>Promise<FinanceWebhookAddress[]>; transport?:(input:FinanceWebhookTransportInput)=>Promise<FinanceWebhookTransportResult>; now?:()=>number; batchSize?:number; concurrency?:number};
type EndpointRow={id:string;organization_id:string;integration_id:string;url:string;enabled:number;version:number;secret_ciphertext:string;key_id:string;created_at:string;updated_at:string};
type DeliveryRow={id:string;event_id:string;organization_id:string;integration_id:string;endpoint_id:string;endpoint_version:number;wallet_id:string;batch_id:string;payload_json:string;status:FinanceWebhookDelivery['status'];attempts:number;cycle_attempts:number;manual_retries:number;next_attempt_at:string|null;lease_token:string|null;lease_expires_at:string|null;delivered_at:string|null;created_at:string;created_by:string;last_http_status:number|null;last_error:string|null};
const fail=(code:FinanceOrganizationError['code'],message:string,status=400):never=>{throw new FinanceOrganizationError(code,message,status);};
const at=(now:number)=>new Date(now).toISOString();
const keyId=(key:Buffer)=>createHash('sha256').update(key).digest('hex').slice(0,16);
const identifier=(value:unknown)=>{if(typeof value!=='string'||!value||value.length>128||/[\x00-\x1f\x7f]/.test(value))return fail('invalid_input','Invalid Finance integration identifier.');return value;};
const keyUnavailable=()=>fail('conflict','Finance webhook signing is not configured on this server.',503);
function encryptionKey(options:FinanceWebhookOptions={}):Buffer|null{
  let raw=options.encryptionKey??process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY;
  if(options.encryptionKey===undefined&&raw?.trim()==='')raw=undefined;
  if(raw===undefined&&process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE){try{raw=readFileSync(process.env.FINANCE_WEBHOOK_ENCRYPTION_KEY_FILE,'utf8').trim();}catch{return null;}}
  return typeof raw==='string'&&/^[0-9a-f]{64}$/i.test(raw)?Buffer.from(raw,'hex'):null;
}
export function webhookConfigurationAvailable(){return encryptionKey()!==null;}
function encrypt(secret:string,key:Buffer,endpoint:Pick<EndpointRow,'id'|'organization_id'>):string{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(`${endpoint.organization_id}:${endpoint.id}`));
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:ciphertext.toString('hex')});
}
function decrypt(endpoint:EndpointRow,key:Buffer):string{
  if(endpoint.key_id!==keyId(key))return keyUnavailable();
  try{
    const box=JSON.parse(endpoint.secret_ciphertext) as {v:number;iv:string;tag:string;data:string};
    if(box.v!==1||!/^([0-9a-f]{2}){12}$/.test(box.iv)||!/^([0-9a-f]{2}){16}$/.test(box.tag)||!/^([0-9a-f]{2}){40,100}$/.test(box.data))return keyUnavailable();
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(box.iv,'hex'));decipher.setAAD(Buffer.from(`${endpoint.organization_id}:${endpoint.id}`));decipher.setAuthTag(Buffer.from(box.tag,'hex'));
    const secret=Buffer.concat([decipher.update(Buffer.from(box.data,'hex')),decipher.final()]).toString('utf8');
    if(!/^whsec_[a-zA-Z0-9_-]{43}$/.test(secret))return keyUnavailable();return secret;
  }catch{return keyUnavailable();}
}
export function initFinanceWebhooks(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS finance_webhook_endpoints(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,integration_id TEXT NOT NULL UNIQUE,url TEXT NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),version INTEGER NOT NULL CHECK(version>0),secret_ciphertext TEXT NOT NULL,key_id TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(integration_id) REFERENCES finance_integrations(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_webhook_deliveries(id TEXT PRIMARY KEY,event_id TEXT NOT NULL UNIQUE,organization_id TEXT NOT NULL,integration_id TEXT NOT NULL,endpoint_id TEXT NOT NULL,endpoint_version INTEGER NOT NULL,wallet_id TEXT NOT NULL,batch_id TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('pending','delivering','delivered','failed','cancelled')),attempts INTEGER NOT NULL DEFAULT 0,cycle_attempts INTEGER NOT NULL DEFAULT 0,manual_retries INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT,lease_token TEXT,lease_expires_at TEXT,delivered_at TEXT,created_at TEXT NOT NULL,created_by TEXT NOT NULL,last_http_status INTEGER,last_error TEXT,UNIQUE(endpoint_id,endpoint_version,batch_id),FOREIGN KEY(organization_id) REFERENCES finance_organizations(id),FOREIGN KEY(integration_id) REFERENCES finance_integrations(id),FOREIGN KEY(endpoint_id) REFERENCES finance_webhook_endpoints(id),FOREIGN KEY(wallet_id) REFERENCES finance_business_wallets(id),FOREIGN KEY(batch_id) REFERENCES finance_export_batches(id))`);
  db.run('CREATE INDEX IF NOT EXISTS finance_webhook_ready ON finance_webhook_deliveries(status,next_attempt_at)');
  db.run('CREATE INDEX IF NOT EXISTS finance_webhook_history ON finance_webhook_deliveries(organization_id,integration_id,created_at)');
  db.run(`CREATE TABLE IF NOT EXISTS finance_webhook_attempts(id TEXT PRIMARY KEY,delivery_id TEXT NOT NULL,attempt INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN('delivered','retry','failed','cancelled')),http_status INTEGER,error TEXT,started_at TEXT NOT NULL,finished_at TEXT NOT NULL,UNIQUE(delivery_id,attempt),FOREIGN KEY(delivery_id) REFERENCES finance_webhook_deliveries(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS finance_webhook_audit(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,integration_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT NOT NULL,recorded_at TEXT NOT NULL,FOREIGN KEY(organization_id) REFERENCES finance_organizations(id))`);
  db.run("CREATE TRIGGER IF NOT EXISTS finance_webhook_payload_immutable BEFORE UPDATE OF event_id,organization_id,integration_id,endpoint_id,endpoint_version,wallet_id,batch_id,payload_json,created_at,created_by ON finance_webhook_deliveries BEGIN SELECT RAISE(ABORT,'Finance webhook evidence is immutable'); END");
  db.run("CREATE TRIGGER IF NOT EXISTS finance_webhook_delivery_no_delete BEFORE DELETE ON finance_webhook_deliveries BEGIN SELECT RAISE(ABORT,'Finance webhook history is append-only'); END");
  for(const table of ['finance_webhook_attempts','finance_webhook_audit'])for(const op of ['UPDATE','DELETE'])db.run(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Finance webhook history is append-only'); END`);
}
function integration(db:Database,userId:string,orgId:string,integrationId:string,manage=false){
  requireFinanceOrganizationAccess(db,userId,orgId,manage?'manage':'read');identifier(integrationId);
  const row=db.query('SELECT id,disabled_at FROM finance_integrations WHERE organization_id=? AND id=?').get(orgId,integrationId) as {id:string;disabled_at:string|null}|null;
  if(!row)return fail('not_found','Finance integration not found.',404);return row;
}
function endpointRow(db:Database,orgId:string,integrationId:string){return db.query('SELECT * FROM finance_webhook_endpoints WHERE organization_id=? AND integration_id=?').get(orgId,integrationId) as EndpointRow|null;}
function endpoint(row:EndpointRow):FinanceWebhookEndpoint{return {id:row.id,organizationId:row.organization_id,integrationId:row.integration_id,url:row.url,enabled:!!row.enabled,version:row.version,signingSecretAvailable:!!row.secret_ciphertext,createdAt:row.created_at,updatedAt:row.updated_at};}
function delivery(row:DeliveryRow):FinanceWebhookDelivery{return {id:row.id,eventId:row.event_id,organizationId:row.organization_id,integrationId:row.integration_id,endpointId:row.endpoint_id,endpointVersion:row.endpoint_version,walletId:row.wallet_id,batchId:row.batch_id,status:row.status,attempts:row.attempts,manualRetries:row.manual_retries,nextAttemptAt:row.next_attempt_at,deliveredAt:row.delivered_at,createdAt:row.created_at,lastHttpStatus:row.last_http_status,lastError:row.last_error};}
function recordAudit(db:Database,userId:string,orgId:string,integrationId:string,action:string,id:string,now:number){db.run('INSERT INTO finance_webhook_audit VALUES(?,?,?,?,?,?,?)',[randomUUID(),orgId,integrationId,userId,action,id,at(now)]);}
export function getFinanceWebhookEndpoint(db:Database,userId:string,orgId:string,integrationId:string):FinanceWebhookEndpoint|null{integration(db,userId,orgId,integrationId);const row=endpointRow(db,orgId,integrationId);return row?endpoint(row):null;}
export function listFinanceWebhookEndpoints(db:Database,userId:string,orgId:string):FinanceWebhookEndpoint[]{requireFinanceOrganizationAccess(db,userId,orgId);return (db.query('SELECT * FROM finance_webhook_endpoints WHERE organization_id=? ORDER BY created_at,id').all(orgId) as EndpointRow[]).map(endpoint);}

function parseUrl(input:unknown):URL{
  if(typeof input!=='string'||input.length>2048||/[\x00-\x20\x7f\\?#]/.test(input)||/^https:\/\/[^/]*@/i.test(input))return fail('invalid_input','Use a public HTTPS webhook URL without credentials, query or fragment.');
  let url:URL;try{url=new URL(input);}catch{return fail('invalid_input','Use a public HTTPS webhook URL without credentials, query or fragment.');}
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.port&&url.port!=='443'||!hostname||hostname.endsWith('.')||(!isIP(hostname)&&(!hostname.includes('.')||/\.(localhost|local|internal|lan|home|invalid|test|example)$/i.test(hostname))))return fail('invalid_input','Use a public HTTPS webhook URL without credentials, query or fragment.');
  return url;
}
/** Conservative public-address allowlist: mapped/tunnel/documentation ranges are never targets. */
export function isPublicFinanceWebhookAddress(address:string):boolean{
  if(isIP(address)===4){
    const octets=address.split('.').map(Number),[a,b,c]=octets;
    return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===192&&b===0&&c===0||a===192&&b===0&&c===2||a===192&&b===88&&c===99||a===198&&(b===18||b===19)||a===198&&b===51&&c===100||a===203&&b===0&&c===113);
  }
  if(isIP(address)!==6||address.includes('.')||address.includes('%'))return false;
  const parts=address.toLowerCase().split('::');if(parts.length>2)return false;
  const left=parts[0]?parts[0].split(':'):[],right=parts.length===2&&parts[1]?parts[1].split(':'):[];
  const words=parts.length===1?left:[...left,...Array(8-left.length-right.length).fill('0'),...right];if(words.length!==8)return false;
  const first=parseInt(words[0],16),second=parseInt(words[1],16);
  return first>=0x2000&&first<=0x3fff&&first!==0x2002&&!(first===0x2001&&(second<=0x1ff||second===0xdb8))&&!(first===0x3fff&&second<0x1000);
}
async function bounded<T>(operation:Promise<T>,ms:number):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]);}finally{if(timer)clearTimeout(timer);}}
async function resolvePublic(url:URL,options:FinanceWebhookOptions):Promise<FinanceWebhookAddress[]>{
  const hostname=url.hostname.replace(/^\[|\]$/g,''),literal=isIP(hostname);
  let addresses:FinanceWebhookAddress[];
  try{addresses=literal?[{address:hostname,family:literal as 4|6}]:await bounded((options.resolve??(async host=>(await lookup(host,{all:true,verbatim:true})).map(item=>({address:item.address,family:item.family as 4|6}))))(hostname),5000);}catch{return fail('invalid_input','The webhook hostname could not be resolved safely.');}
  if(!Array.isArray(addresses)||!addresses.length||addresses.length>16||addresses.some(item=>!item||isIP(item.address)!==item.family||!isPublicFinanceWebhookAddress(item.address)))return fail('invalid_input','Webhook destinations must resolve only to public addresses.');
  return addresses;
}
export async function configureFinanceWebhook(db:Database,userId:string,orgId:string,integrationId:string,body:unknown,options:FinanceWebhookOptions={}):Promise<{endpoint:FinanceWebhookEndpoint;signingSecret?:string}>{
  const current=integration(db,userId,orgId,integrationId,true);if(current.disabled_at)return fail('conflict','This Finance integration is disabled.',409);
  const input=body as {url?:unknown;enabled?:unknown;rotateSecret?:unknown}|null;
  if(!input||typeof input.enabled!=='boolean'||input.rotateSecret!==undefined&&typeof input.rotateSecret!=='boolean')return fail('invalid_input','Check the webhook URL and enabled setting.');
  const url=parseUrl(input.url),key=encryptionKey(options);if(!key)return keyUnavailable();
  await resolvePublic(url,options);
  return db.transaction(()=>{
    const current=integration(db,userId,orgId,integrationId,true);if(current.disabled_at)return fail('conflict','This Finance integration is disabled.',409);
    const before=endpointRow(db,orgId,integrationId),now=(options.now??Date.now)();
    if(before&&before.url===url.href&&!!before.enabled===input.enabled&&!input.rotateSecret){decrypt(before,key);return {endpoint:endpoint(before)};}
    const id=before?.id??randomUUID(),version=(before?.version??0)+1,secret=!before||input.rotateSecret?'whsec_'+randomBytes(32).toString('base64url'):decrypt(before,key),encrypted=encrypt(secret,key,{id,organization_id:orgId});
    if(!before){const count=db.query('SELECT count(*) AS n FROM finance_webhook_endpoints WHERE organization_id=?').get(orgId) as {n:number};if(count.n>=20)return fail('limit_reached','Finance webhook endpoint limit reached.',409);}
    db.run('INSERT INTO finance_webhook_endpoints(id,organization_id,integration_id,url,enabled,version,secret_ciphertext,key_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(integration_id) DO UPDATE SET url=excluded.url,enabled=excluded.enabled,version=excluded.version,secret_ciphertext=excluded.secret_ciphertext,key_id=excluded.key_id,updated_at=excluded.updated_at',[id,orgId,integrationId,url.href,input.enabled?1:0,version,encrypted,keyId(key),before?.created_at??at(now),at(now)]);
    db.run("UPDATE finance_webhook_deliveries SET status='cancelled',next_attempt_at=NULL,lease_token=NULL,lease_expires_at=NULL,last_error='endpoint_changed' WHERE endpoint_id=? AND status IN('pending','delivering','failed')",[id]);
    recordAudit(db,userId,orgId,integrationId,input.rotateSecret?'webhook_secret_rotated':'webhook_configured',id,now);
    const saved=endpointRow(db,orgId,integrationId)!;return {endpoint:endpoint(saved),...(!before||input.rotateSecret?{signingSecret:secret}:{})};
  })();
}
export function listFinanceWebhookDeliveries(db:Database,userId:string,orgId:string,integrationId:string,before:unknown=''):{items:FinanceWebhookDelivery[];nextCursor:string|null}{
  integration(db,userId,orgId,integrationId);
  if(typeof before!=='string'||before&&!/^[1-9][0-9]{0,14}$/.test(before))return fail('invalid_input','Invalid Finance webhook history cursor.');
  const rows=db.query('SELECT rowid AS cursor,* FROM finance_webhook_deliveries WHERE organization_id=? AND integration_id=? AND rowid<? ORDER BY rowid DESC LIMIT 51').all(orgId,integrationId,before?Number(before):Number.MAX_SAFE_INTEGER) as (DeliveryRow&{cursor:number})[];
  return {items:rows.slice(0,50).map(delivery),nextCursor:rows.length>50?String(rows[49].cursor):null};
}
export function getFinanceWebhookDelivery(db:Database,userId:string,orgId:string,integrationId:string,deliveryId:string):FinanceWebhookDelivery&{attemptHistory:FinanceWebhookAttempt[]}{
  integration(db,userId,orgId,integrationId);identifier(deliveryId);
  const row=db.query('SELECT * FROM finance_webhook_deliveries WHERE organization_id=? AND integration_id=? AND id=?').get(orgId,integrationId,deliveryId) as DeliveryRow|null;if(!row)return fail('not_found','Finance webhook delivery not found.',404);
  type AttemptRow={id:string;delivery_id:string;attempt:number;status:FinanceWebhookAttempt['status'];http_status:number|null;error:string|null;started_at:string;finished_at:string};
  const attempts=db.query('SELECT * FROM finance_webhook_attempts WHERE delivery_id=? ORDER BY attempt DESC LIMIT 32').all(deliveryId) as AttemptRow[];
  return {...delivery(row),attemptHistory:attempts.map(item=>({id:item.id,deliveryId:item.delivery_id,attempt:item.attempt,status:item.status,httpStatus:item.http_status,error:item.error,startedAt:item.started_at,finishedAt:item.finished_at}))};
}
export function queueFinanceWebhook(db:Database,userId:string,orgId:string,integrationId:string,walletId:string,batchId:string,options:FinanceWebhookOptions={}):FinanceWebhookDelivery{
  const current=integration(db,userId,orgId,integrationId,true),wallet=getFinanceBusinessWallet(db,userId,orgId,walletId);
  if(current.disabled_at||wallet.disabledAt)return fail('conflict','This Finance integration or wallet is disabled.',409);
  const batch=readFinanceExportBatch(db,userId,orgId,walletId,identifier(batchId)),key=encryptionKey(options);if(!key)return keyUnavailable();
  return db.transaction(()=>{
    const target=endpointRow(db,orgId,integrationId);if(!target||!target.enabled)return fail('conflict','Configure and enable a Finance webhook before queuing a delivery.',409);decrypt(target,key);
    const prior=db.query('SELECT * FROM finance_webhook_deliveries WHERE endpoint_id=? AND endpoint_version=? AND batch_id=?').get(target.id,target.version,batchId) as DeliveryRow|null;if(prior)return delivery(prior);
    const count=db.query("SELECT count(*) AS n FROM finance_webhook_deliveries WHERE organization_id=? AND status IN('pending','delivering')").get(orgId) as {n:number};if(count.n>=1000)return fail('limit_reached','Finance webhook queue limit reached.',409);
    const id=randomUUID(),eventId=randomUUID(),now=(options.now??Date.now)(),event:FinanceWebhookEvent={schema:'carpan.finance.webhook.v1',id:eventId,type:'finance.export.generated',createdAt:at(now),organizationId:orgId,integrationId,batch};
    const payload=JSON.stringify(event);if(Buffer.byteLength(payload)>512*1024)return fail('limit_reached','This Finance webhook payload is too large.',409);
    db.run("INSERT INTO finance_webhook_deliveries(id,event_id,organization_id,integration_id,endpoint_id,endpoint_version,wallet_id,batch_id,payload_json,status,next_attempt_at,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?,?)",[id,eventId,orgId,integrationId,target.id,target.version,walletId,batchId,payload,at(now),at(now),userId]);
    recordAudit(db,userId,orgId,integrationId,'webhook_queued',id,now);return delivery(db.query('SELECT * FROM finance_webhook_deliveries WHERE id=?').get(id) as DeliveryRow);
  })();
}
export function retryFinanceWebhook(db:Database,userId:string,orgId:string,integrationId:string,deliveryId:string,options:FinanceWebhookOptions={}):FinanceWebhookDelivery{
  const current=integration(db,userId,orgId,integrationId,true);if(current.disabled_at)return fail('conflict','This Finance integration is disabled.',409);
  const key=encryptionKey(options);if(!key)return keyUnavailable();identifier(deliveryId);
  return db.transaction(()=>{
    const row=db.query('SELECT * FROM finance_webhook_deliveries WHERE organization_id=? AND integration_id=? AND id=?').get(orgId,integrationId,deliveryId) as DeliveryRow|null;if(!row)return fail('not_found','Finance webhook delivery not found.',404);
    const target=endpointRow(db,orgId,integrationId),now=(options.now??Date.now)();
    if(!target?.enabled||target.version!==row.endpoint_version||row.status==='cancelled')return fail('conflict','This webhook endpoint changed. Queue the export again explicitly.',409);decrypt(target,key);
    const wallet=getFinanceBusinessWallet(db,userId,orgId,row.wallet_id);if(wallet.disabledAt)return fail('conflict','This Finance integration or wallet is disabled.',409);
    if(row.status==='delivered')return delivery(row);
    if(row.status!=='failed')return fail('conflict','Only failed webhook deliveries can be retried manually.',409);
    if(row.manual_retries>=3||now-Date.parse(row.created_at)>=86400000)return fail('limit_reached','Finance webhook retry limit reached.',409);
    const pending=db.query("SELECT count(*) AS n FROM finance_webhook_deliveries WHERE organization_id=? AND status IN('pending','delivering')").get(orgId) as {n:number};if(pending.n>=1000)return fail('limit_reached','Finance webhook queue limit reached.',409);
    db.run("UPDATE finance_webhook_deliveries SET status='pending',cycle_attempts=0,manual_retries=manual_retries+1,next_attempt_at=?,lease_token=NULL,lease_expires_at=NULL,last_error=NULL WHERE id=?",[at(now),row.id]);recordAudit(db,userId,orgId,integrationId,'webhook_retry_requested',row.id,now);
    return delivery(db.query('SELECT * FROM finance_webhook_deliveries WHERE id=?').get(row.id) as DeliveryRow);
  })();
}

export async function financeWebhookHttpsTransport(input:FinanceWebhookTransportInput):Promise<FinanceWebhookTransportResult>{
  // The transport receives a previously verified address. DNS is never looked up again by HTTPS.
  parseUrl(input.url.href);if(isIP(input.address.address)!==input.address.family||!isPublicFinanceWebhookAddress(input.address.address))return fail('invalid_input','Webhook destinations must resolve only to public addresses.');
  return new Promise((resolve,reject)=>{
    let finished=false,total=0;const complete=(error:Error|null,status?:number)=>{if(finished)return;finished=true;clearTimeout(timer);if(error)reject(error);else resolve({status:status!,responseBytes:total});};
    const req=request({protocol:'https:',hostname:input.url.hostname.replace(/^\[|\]$/g,''),family:input.address.family,autoSelectFamily:false,port:443,path:input.url.pathname,method:'POST',headers:input.headers,agent:false,rejectUnauthorized:true,lookup:(_hostname,_opts,callback)=>callback(null,input.address.address,input.address.family)},res=>{
      res.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>input.responseLimit){complete(new Error('response_limit'));res.destroy();req.destroy();}});
      res.on('end',()=>complete(null,res.statusCode??0));res.on('error',()=>complete(new Error('network_error')));
    });
    const timer=setTimeout(()=>{complete(new Error('timeout'));req.destroy();},input.timeoutMs);
    req.on('error',()=>complete(new Error('network_error')));req.end(input.body);
  });
}
function allowedToSend(db:Database,row:DeliveryRow,target:EndpointRow|null):boolean{
  if(!target?.enabled||target.version!==row.endpoint_version)return false;
  const current=db.query(`SELECT i.disabled_at AS integration_disabled,o.disabled_at AS org_disabled,w.disabled_at AS wallet_disabled,m.role,m.disabled_at AS member_disabled,u.merged_into FROM finance_integrations i JOIN finance_organizations o ON o.id=i.organization_id JOIN finance_business_wallets w ON w.organization_id=o.id AND w.id=? JOIN finance_organization_members m ON m.organization_id=o.id AND m.user_id=? JOIN users u ON u.id=m.user_id WHERE i.id=? AND i.organization_id=?`).get(row.wallet_id,row.created_by,row.integration_id,row.organization_id) as {integration_disabled:string|null;org_disabled:string|null;wallet_disabled:string|null;role:string;member_disabled:string|null;merged_into:string|null}|null;
  return !!current&&!current.integration_disabled&&!current.org_disabled&&!current.wallet_disabled&&!current.member_disabled&&!current.merged_into&&['owner','admin'].includes(current.role);
}
function appendAttempt(db:Database,row:DeliveryRow,status:FinanceWebhookAttempt['status'],http:number|null,error:string|null,finished:number,started:string){db.run('INSERT OR IGNORE INTO finance_webhook_attempts VALUES(?,?,?,?,?,?,?,?)',[randomUUID(),row.id,row.attempts,status,http,error,started,at(finished)]);}
function reclaim(db:Database,now:number){
  const expired=db.query("SELECT * FROM finance_webhook_deliveries WHERE status='delivering' AND lease_expires_at<=? LIMIT 100").all(at(now)) as DeliveryRow[];
  for(const row of expired){const terminal=row.cycle_attempts>=8||now-Date.parse(row.created_at)>=86400000;appendAttempt(db,row,terminal?'failed':'retry',null,'lease_expired',now,row.lease_expires_at?at(Date.parse(row.lease_expires_at)-30000):at(now));db.run('UPDATE finance_webhook_deliveries SET status=?,next_attempt_at=?,lease_token=NULL,lease_expires_at=NULL,last_error=? WHERE id=? AND status=\'delivering\' AND lease_token=?',[terminal?'failed':'pending',terminal?null:at(now),'lease_expired',row.id,row.lease_token]);}
}
function claim(db:Database,now:number):DeliveryRow|null{return db.transaction(()=>{
  reclaim(db,now);
  const row=db.query("SELECT * FROM finance_webhook_deliveries WHERE status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at,created_at,id LIMIT 1").get(at(now)) as DeliveryRow|null;if(!row)return null;
  const token=randomUUID();db.run("UPDATE finance_webhook_deliveries SET status='delivering',attempts=attempts+1,cycle_attempts=cycle_attempts+1,lease_token=?,lease_expires_at=? WHERE id=? AND status='pending'",[token,at(now+30000),row.id]);return db.query('SELECT * FROM finance_webhook_deliveries WHERE id=?').get(row.id) as DeliveryRow;
})();}
export async function runFinanceWebhookWorker(db:Database,options:FinanceWebhookOptions={}):Promise<{claimed:number;delivered:number;retried:number;failed:number;cancelled:number;skippedReason?:string}>{
  const result={claimed:0,delivered:0,retried:0,failed:0,cancelled:0},key=encryptionKey(options);if(!key)return {...result,skippedReason:'signing_not_configured'};
  const size=options.batchSize??10,concurrency=options.concurrency??2;if(!Number.isInteger(size)||size<1||size>20||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)return fail('invalid_input','Invalid Finance webhook worker limits.');
  const now=options.now??Date.now;
  async function send(row:DeliveryRow){
    const started=at(now());let http:number|null=null,error:string|null=null,cancelled=false;
    try{
      const target=endpointRow(db,row.organization_id,row.integration_id);if(!allowedToSend(db,row,target)){cancelled=true;throw new Error('scope_disabled');}
      if(now()-Date.parse(row.created_at)>=86400000)throw new Error('delivery_expired');
      const secret=decrypt(target!,key),url=parseUrl(target!.url),addresses=await resolvePublic(url,options),latest=db.query('SELECT * FROM finance_webhook_deliveries WHERE id=?').get(row.id) as DeliveryRow;
      if(latest.status!=='delivering'||latest.lease_token!==row.lease_token||!allowedToSend(db,row,endpointRow(db,row.organization_id,row.integration_id))){cancelled=true;throw new Error('scope_disabled');}
      const timestamp=String(Math.floor(now()/1000)),signature=createHmac('sha256',secret).update(`${timestamp}.${row.payload_json}`).digest('hex');
      const response=await bounded((options.transport??financeWebhookHttpsTransport)({url,address:addresses[0],body:row.payload_json,headers:{'Content-Type':'application/json','Content-Length':String(Buffer.byteLength(row.payload_json)),'Carpan-Event-Id':row.event_id,'Carpan-Timestamp':timestamp,'Carpan-Signature':`v1=${signature}`,'User-Agent':'Carpan-Finance-Webhooks/1.0'},timeoutMs:10000,responseLimit:4096}),10500);
      if(!Number.isInteger(response.status)||response.status<100||response.status>599||(response.responseBytes??0)>4096)throw new Error('response_limit');
      http=response.status;if(http>=300&&http<400)throw new Error('redirect_rejected');if(http<200||http>=300)throw new Error('http_error');
    }catch(caught){
      const message=caught instanceof Error?caught.message:'';error=['timeout','response_limit','redirect_rejected','http_error','scope_disabled','delivery_expired'].includes(message)?message:caught instanceof FinanceOrganizationError?caught.status===503?'signing_unavailable':'destination_rejected':'network_error';
    }
    db.transaction(()=>{
      const latest=db.query('SELECT * FROM finance_webhook_deliveries WHERE id=?').get(row.id) as DeliveryRow|null;if(!latest||latest.status!=='delivering'||latest.lease_token!==row.lease_token)return;
      if(!allowedToSend(db,row,endpointRow(db,row.organization_id,row.integration_id))){cancelled=true;error='scope_disabled';}
      const finished=now(),terminal=row.cycle_attempts>=8||finished-Date.parse(row.created_at)>=86400000||error==='delivery_expired'||error==='destination_rejected'||error==='signing_unavailable';
      const status=cancelled?'cancelled':!error?'delivered':terminal?'failed':'pending',next=status==='pending'?at(finished+Math.min(3600000,30000*2**(row.cycle_attempts-1))):null;
      db.run('UPDATE finance_webhook_deliveries SET status=?,next_attempt_at=?,lease_token=NULL,lease_expires_at=NULL,delivered_at=?,last_http_status=?,last_error=? WHERE id=? AND lease_token=?',[status,next,status==='delivered'?at(finished):null,http,error,row.id,row.lease_token]);
      appendAttempt(db,row,status==='pending'?'retry':status,http,error,finished,started);
      if(status==='pending')result.retried++;else result[status]++;
    })();
  }
  await Promise.all(Array.from({length:concurrency},async()=>{while(result.claimed<size){const row=claim(db,now());if(!row)return;result.claimed++;await send(row);}}));return result;
}
