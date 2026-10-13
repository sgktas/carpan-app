import {db} from './sqliteDb';
export class XAccountLinkConflictError extends Error {constructor(){super('X identity already belongs to another account');}}
/** Called only after a session-bound OAuth flow proves the numeric X identity. */
export function linkVerifiedXAccount(userId:string,identity:{id:string;username:string;name?:string}){
  if(!/^\d+$/.test(identity.id)||!/^[A-Za-z0-9_]{1,15}$/.test(identity.username))throw new Error('Invalid verified X identity');
  return db.transaction(()=>{
    const user=db.query('SELECT id,is_demo FROM users WHERE id=?').get(userId) as {id:string;is_demo:number}|null;
    if(!user||user.is_demo)throw new Error('Invalid linking account');
    const owner=db.query('SELECT id FROM users WHERE x_id=?').get(identity.id) as {id:string}|null;
    if(owner&&owner.id!==userId)throw new XAccountLinkConflictError();
    // Preserve the same user ID, roles, public profile, wallet and financial records.
    db.run('UPDATE users SET x_id=?,x_handle=?,x_display_name=? WHERE id=?',
      [identity.id,identity.username,identity.name||identity.username,userId]);
  }).immediate();
}
