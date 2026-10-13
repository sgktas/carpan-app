import type {Database} from 'bun:sqlite';
import {randomUUID} from 'node:crypto';
export class XDisconnectError extends Error{constructor(message:string,readonly status=409){super(message);}}
export function initXDisconnect(db:Database){db.exec(`CREATE TABLE IF NOT EXISTS account_identity_disconnect_audit(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL,method TEXT NOT NULL,created_at TEXT NOT NULL);`);}
/** A fresh alternative sign-in must already prove access before X is removed. */
export function disconnectXAccount(db:Database,userId:string,sessionHash:string,now=Date.now()){
 return db.transaction(()=>{
  const session=db.query('SELECT auth_method,created_at,expires_at FROM sessions WHERE user_id=? AND token=?').get(userId,sessionHash) as {auth_method:string;created_at:string;expires_at:string}|null;
  const created=Date.parse(session?.created_at||''),expires=Date.parse(session?.expires_at||'');
  if(!/^[0-9a-f]{64}$/.test(sessionHash)||!session||!Number.isFinite(created)||created>now||now-created>=15*60_000||!Number.isFinite(expires)||expires<=now||!['google','wallet','email'].includes(session.auth_method))
   throw new XDisconnectError('X bağlantısını kaldırmadan önce Google, e-posta veya cüzdanla yeniden giriş yap.',401);
  const user=db.query('SELECT * FROM users WHERE id=?').get(userId) as {x_id:string;google_id:string|null;email:string|null;wallet_address:string|null;wallet_verified_at:string|null;auth_method:string;is_demo:number;merged_into:string|null}|null;
  if(!user||user.is_demo||user.merged_into)throw new XDisconnectError('Hesap bağlantısı değiştirilemedi.',401);
  const alternative=session.auth_method==='google'?!!user.google_id:session.auth_method==='wallet'?!!user.wallet_address&&!!user.wallet_verified_at:!!user.email&&user.auth_method==='email';
  if(!alternative)throw new XDisconnectError('Önce başka bir giriş yöntemini bu hesapta doğrula.');
  if(!/^\d+$/.test(user.x_id))return {disconnected:false};
  const primary=user.auth_method==='x'?(user.google_id?'google':user.wallet_verified_at&&user.wallet_address?'wallet':'email'):user.auth_method;
  db.run('UPDATE users SET x_id=?,x_handle=?,x_display_name=?,auth_method=? WHERE id=?',[`unlinked:${userId}`,'','',primary,userId]);
  db.run("DELETE FROM sessions WHERE user_id=? AND (auth_method='x' OR auth_method IS NULL)",[userId]);
  // An already-started X link cannot silently reattach the removed identity.
  db.run('DELETE FROM x_oauth_states WHERE link_user_id=?',[userId]);
  db.run('INSERT INTO account_identity_disconnect_audit(id,user_id,method,created_at) VALUES(?,?,?,?)',[randomUUID(),userId,'x',new Date(now).toISOString()]);
  return {disconnected:true};
 }).immediate();
}
