import type {Database} from 'bun:sqlite';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {isAddress,verifyMessage} from 'viem';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const FRESH_MS=15*60_000, CHALLENGE_MS=5*60_000;
type Owner={id:string;google_id:string|null;email:string|null;wallet_address:string|null;wallet_verified_at:string|null;is_demo:number;role:string;auth_method:string;x_id:string;merged_into:string|null};
export class AccountLinkError extends Error{constructor(message:string,readonly status=409){super(message);}}
export function initGoogleWalletLink(db:Database){
 if(!(db.query('PRAGMA table_info(users)').all() as {name:string}[]).some(c=>c.name==='merged_into'))db.run('ALTER TABLE users ADD COLUMN merged_into TEXT');
 db.exec(`CREATE TABLE IF NOT EXISTS google_wallet_link_challenges(
 nonce_hash TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,session_hash TEXT NOT NULL,
 address TEXT NOT NULL,fingerprint TEXT NOT NULL,message TEXT NOT NULL,expires_at TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS google_wallet_link_expiry ON google_wallet_link_challenges(expires_at);
 CREATE TABLE IF NOT EXISTS account_identity_link_audit(
 id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,method TEXT NOT NULL,address TEXT NOT NULL,created_at TEXT NOT NULL);`);
}
function freshGoogleSession(db:Database,userId:string,sessionHash:string,now:number){
 const s=db.query('SELECT auth_method,created_at,expires_at FROM sessions WHERE user_id=? AND token=?').get(userId,sessionHash) as {auth_method:string;created_at:string;expires_at:string}|null;
 const created=Date.parse(s?.created_at||''),expires=Date.parse(s?.expires_at||'');
 if(!/^[0-9a-f]{64}$/.test(sessionHash)||!s||s.auth_method!=='google'||!Number.isFinite(created)||created>now||now-created>=FRESH_MS||!Number.isFinite(expires)||expires<=now)
  throw new AccountLinkError('Sign in with Google again before linking accounts.',401);
}
/** Only an unused Google-only profile may retire. Business data is never moved or deleted. */
function unusedSource(db:Database,source:Owner){
 if(source.is_demo||source.role!=='user'||source.merged_into||source.wallet_address||!source.google_id||!source.email||source.auth_method!=='google'||source.x_id!==`google:${source.google_id}`)
  throw new AccountLinkError('This account cannot be linked automatically. Contact Carpan support.');
 const tables=db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[];
 // Usage observations never own business records and must not prevent a fresh
 // Google account from linking to its verified wallet account.
 const ignored=new Set(['users','sessions','auth_nonces','google_wallet_link_challenges','account_identity_link_audit','product_usage_accounts']);
 const ownership=new Set(['user_id','owner_id','participant_id','referrer_id','buyer_id','creator_id','founder_id','submitted_by','approved_by','admin_id']);
 for(const {name} of tables){
  if(ignored.has(name)||!/^\w+$/.test(name))continue;
  if(name==='free_slots_ledger'){
   if(db.query("SELECT 1 FROM free_slots_ledger WHERE user_id=? AND (reason<>'initial_free_grant' OR delta<>5) LIMIT 1").get(source.id))throw new AccountLinkError('This Google profile has activity. Automatic linking is unavailable.');
   continue;
  }
  if(name==='referral_batches'){
   if(db.query("SELECT 1 FROM referral_batches WHERE user_id=? AND (source<>'initial' OR project_id IS NOT NULL OR total_slots<>5 OR remaining_slots<>5) LIMIT 1").get(source.id))throw new AccountLinkError('This Google profile has activity. Automatic linking is unavailable.');
   continue;
  }
  const columns=(db.query(`PRAGMA table_info("${name}")`).all() as {name:string}[]).filter(c=>ownership.has(c.name));
  if(columns.length&&db.query(`SELECT 1 FROM "${name}" WHERE ${columns.map(c=>`"${c.name}"=?`).join(' OR ')} LIMIT 1`).get(...columns.map(()=>source.id)))
   throw new AccountLinkError('This Google profile has activity. Automatic linking is unavailable.');
 }
}
function context(db:Database,sourceId:string,sessionHash:string,address:string,now:number){
 freshGoogleSession(db,sourceId,sessionHash,now);
 const source=db.query('SELECT * FROM users WHERE id=?').get(sourceId) as Owner|null;
 if(!source)throw new AccountLinkError('Account not found.',401);
 unusedSource(db,source);
 const targets=db.query('SELECT * FROM users WHERE lower(wallet_address)=?').all(address) as Owner[];
 const target=targets[0];
 if(targets.length!==1||target.id===sourceId||target.is_demo||target.merged_into||!target.wallet_verified_at)
  throw new AccountLinkError('An existing verified wallet account is required.');
 if(target.google_id||target.email&&target.email.toLowerCase()!==source.email!.toLowerCase())throw new AccountLinkError('The wallet account already has another sign-in identity. Contact Carpan support.');
 const fingerprint=hash(JSON.stringify([source.id,source.google_id,source.email,target.id,target.wallet_address,target.wallet_verified_at,target.role,target.google_id,target.email]));
 return {source,target,fingerprint};
}
export function prepareGoogleWalletLink(db:Database,userId:string,sessionHash:string,addressValue:unknown,origin:string,now=Date.now()){
 if(typeof addressValue!=='string'||!isAddress(addressValue))throw new AccountLinkError('A valid wallet address is required.',400);
 const address=addressValue.toLowerCase(),url=new URL(origin);
 if(url.origin!==origin||!['http:','https:'].includes(url.protocol))throw new AccountLinkError('Account linking is not configured.',503);
 return db.transaction(()=>{
  const {source,target,fingerprint}=context(db,userId,sessionHash,address,now);
  db.run('DELETE FROM google_wallet_link_challenges WHERE rowid IN (SELECT rowid FROM google_wallet_link_challenges WHERE expires_at<=? LIMIT 1000)',[new Date(now).toISOString()]);
  db.run('UPDATE google_wallet_link_challenges SET used=1 WHERE source_id=? AND used=0',[userId]);
  const nonce=randomBytes(32).toString('base64url'),expiresAt=new Date(now+CHALLENGE_MS).toISOString();
  const message=`Carpan: link Google to my existing wallet account\n\nSite: ${origin}\nGoogle email: ${source.email}\nWallet: ${address}\nExisting account: ${target.id}\nExisting permissions: ${target.role}\n\nI authorize this Google sign-in to access my existing wallet account. Its records and permissions remain unchanged. My unused separate Google profile will be retired; its sessions will end. No funds move and no additional referral credits are granted.\n\nIssued: ${new Date(now).toISOString()}\nExpires: ${expiresAt}\nOne-use code: ${nonce}`;
  db.run('INSERT INTO google_wallet_link_challenges(nonce_hash,source_id,target_id,session_hash,address,fingerprint,message,expires_at) VALUES(?,?,?,?,?,?,?,?)',[hash(nonce),userId,target.id,sessionHash,address,fingerprint,message,expiresAt]);
  return {nonce,message,expiresAt,address,email:source.email!};
 }).immediate();
}
export async function completeGoogleWalletLink(db:Database,userId:string,sessionHash:string,input:{nonce?:unknown;signature?:unknown},createSession:(id:string)=>string,now=Date.now()){
 if(typeof input.nonce!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(input.nonce)||typeof input.signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(input.signature))throw new AccountLinkError('Invalid account-link signature.',400);
 const nonceHash=hash(input.nonce);
 const pending=db.query('SELECT * FROM google_wallet_link_challenges WHERE nonce_hash=? AND source_id=? AND session_hash=?').get(nonceHash,userId,sessionHash) as {target_id:string;address:string;fingerprint:string;message:string;expires_at:string;used:number}|null;
 if(!pending||pending.used||Date.parse(pending.expires_at)<=now)throw new AccountLinkError('Account-link request expired or was already used.',400);
 context(db,userId,sessionHash,pending.address,now);
 if(!await verifyMessage({address:pending.address as `0x${string}`,message:pending.message,signature:input.signature as `0x${string}`}).catch(()=>false))throw new AccountLinkError('Invalid account-link signature.',400);
 return db.transaction(()=>{
  const at=Date.now(),{source,target,fingerprint}=context(db,userId,sessionHash,pending.address,at);
  if(target.id!==pending.target_id||fingerprint!==pending.fingerprint)throw new AccountLinkError('Account details changed. Review the link again.');
  if(db.run('UPDATE google_wallet_link_challenges SET used=1 WHERE nonce_hash=? AND source_id=? AND session_hash=? AND used=0 AND expires_at>?',[nonceHash,userId,sessionHash,new Date(at).toISOString()]).changes!==1)throw new AccountLinkError('Account-link request expired or was already used.',400);
  // Keep the source row and its unused grants as history; revoke its sign-in identities.
  db.run('UPDATE users SET google_id=NULL,email=NULL,merged_into=? WHERE id=?',[target.id,source.id]);
  db.run('UPDATE users SET google_id=?,email=? WHERE id=?',[source.google_id,source.email,target.id]);
  db.run('DELETE FROM sessions WHERE user_id=?',[source.id]);
  db.run('INSERT INTO account_identity_link_audit(id,source_id,target_id,method,address,created_at) VALUES(?,?,?,?,?,?)',[randomUUID(),source.id,target.id,'google',pending.address,new Date(at).toISOString()]);
  return {userId:target.id,sessionToken:createSession(target.id)};
 }).immediate();
}
