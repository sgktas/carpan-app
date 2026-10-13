import type {Database} from 'bun:sqlite';
import {createHash} from 'node:crypto';
import type {AccountSessions,AccountSessionRevocation,ManagedAccountSession} from '../src/account-sessions';

const MAX_VISIBLE_SESSIONS=100;
const HASH=/^[0-9a-f]{64}$/;
const PUBLIC_ID=/^ses_[0-9a-f]{64}$/;
type SessionRow={token:string;auth_method:string|null;created_at:string;expires_at:string};
const methods=new Set(['wallet','email','google','x','demo']);

export class AccountSessionError extends Error{
  constructor(message:string,readonly status:401|404|409){super(message);}
}

/** Domain separation and account binding keep the management ID unrelated to a bearer cookie. */
function sessionId(userId:string,storedTokenHash:string){
  return 'ses_'+createHash('sha256').update(`carpan.session.management.v1\0${userId}\0${storedTokenHash}`).digest('hex');
}
function currentRow(db:Database,userId:string,currentHash:string,now:string){
  if(!HASH.test(currentHash))throw new AccountSessionError('Oturum süresi dolmuş',401);
  const row=db.query(`SELECT token,auth_method,created_at,expires_at FROM sessions
    WHERE user_id=? AND token=? AND julianday(expires_at)>julianday(?) AND julianday(created_at) IS NOT NULL`).get(userId,currentHash,now) as SessionRow|null;
  if(!row)throw new AccountSessionError('Oturum süresi dolmuş',401);
  return row;
}
function publicRow(userId:string,row:SessionRow,currentHash:string):ManagedAccountSession{
  return {id:sessionId(userId,row.token),method:methods.has(row.auth_method||'')?row.auth_method as ManagedAccountSession['method']:null,
    createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),current:row.token===currentHash};
}
function activeRows(db:Database,userId:string,now:string,currentHash:string){
  return db.query(`SELECT token,auth_method,created_at,expires_at FROM sessions WHERE user_id=?
    AND length(token)=64 AND token NOT GLOB '*[^0-9a-f]*' AND julianday(expires_at)>julianday(?)
    AND julianday(created_at) IS NOT NULL ORDER BY (token=?) DESC,created_at DESC,token LIMIT ?`).all(userId,now,currentHash,MAX_VISIBLE_SESSIONS) as SessionRow[];
}

/** The caller passes a server-side hash of the authenticated HttpOnly cookie, never a body ID. */
export function listAccountSessions(db:Database,userId:string,currentHash:string,at=new Date()):AccountSessions{
  const now=at.toISOString();
  currentRow(db,userId,currentHash,now);
  const rows=db.query(`SELECT token,auth_method,created_at,expires_at FROM sessions WHERE user_id=?
    AND length(token)=64 AND token NOT GLOB '*[^0-9a-f]*' AND julianday(expires_at)>julianday(?)
    AND julianday(created_at) IS NOT NULL ORDER BY (token=?) DESC,created_at DESC,token LIMIT ?`).all(userId,now,currentHash,MAX_VISIBLE_SESSIONS) as SessionRow[];
  const count=db.query(`SELECT COUNT(*) AS total FROM sessions WHERE user_id=?
    AND length(token)=64 AND token NOT GLOB '*[^0-9a-f]*' AND julianday(expires_at)>julianday(?)
    AND julianday(created_at) IS NOT NULL`).get(userId,now) as {total:number};
  return {sessions:rows.map(row=>publicRow(userId,row,currentHash)),total:count.total,limit:100,truncated:count.total>MAX_VISIBLE_SESSIONS};
}

export function revokeAccountSession(db:Database,userId:string,currentHash:string,id:unknown,at=new Date()):AccountSessionRevocation{
  return db.transaction(()=>{
    const now=at.toISOString();currentRow(db,userId,currentHash,now);
    if(typeof id!=='string'||!PUBLIC_ID.test(id))throw new AccountSessionError('Oturum bulunamadı.',404);
    // The candidate set is always this account; another user's ID reveals nothing.
    const row=activeRows(db,userId,now,currentHash).find(candidate=>sessionId(userId,candidate.token)===id);
    if(!row)throw new AccountSessionError('Oturum bulunamadı.',404);
    if(row.token===currentHash)throw new AccountSessionError('Bu oturumdan çıkmak için Çıkış yap düğmesini kullan.',409);
    db.run('DELETE FROM sessions WHERE user_id=? AND token=?',[userId,row.token]);
    return {revoked:1,sessions:listAccountSessions(db,userId,currentHash,at)};
  }).immediate();
}

export function revokeOtherAccountSessions(db:Database,userId:string,currentHash:string,at=new Date()):AccountSessionRevocation{
  return db.transaction(()=>{
    const now=at.toISOString();currentRow(db,userId,currentHash,now);
    const result=db.run(`DELETE FROM sessions WHERE user_id=? AND token<>?
      AND julianday(expires_at)>julianday(?)`,[userId,currentHash,now]);
    return {revoked:result.changes,sessions:listAccountSessions(db,userId,currentHash,at)};
  }).immediate();
}
