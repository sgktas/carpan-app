import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {privateKeyToAccount} from 'viem/accounts';
const folder=mkdtempSync(join(tmpdir(),'carpan-google-wallet-link-'));
process.env.REFBRIDGE_DB_PATH=join(folder,'test.db');process.env.REFVOX_AUTH_MODE='live';process.env.NODE_ENV='test';process.env.X_CLIENT_ID='';process.env.X_CLIENT_SECRET='';process.env.GOOGLE_CLIENT_ID='';process.env.GOOGLE_CLIENT_SECRET='';process.env.VITE_APP_URL='http://127.0.0.1:5173';
const {app}=await import('./index'),{db,grantInitialFreeSlots}=await import('./sqliteDb'),{createSession,getSessionUserId}=await import('./auth');
const owner=privateKeyToAccount(`0x${'33'.repeat(32)}`);
let server:ReturnType<typeof app.listen>,base:string;
beforeAll(async()=>{
 const now=new Date().toISOString();
 db.run("INSERT INTO users(id,x_id,google_id,email,x_handle,x_display_name,auth_method,role,is_demo,created_at) VALUES('google','google:route-sub','route-sub','route@example.test','route','Route','google','user',0,?)",[now]);grantInitialFreeSlots('google');
 db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,wallet_address,wallet_verified_at,auth_method,role,is_demo,created_at) VALUES('wallet','123','owner','Owner',?,?,'x','admin',0,?)",[owner.address.toLowerCase(),now,now]);
 server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const info=server.address();if(!info||typeof info==='string')throw Error('No test port');base=`http://127.0.0.1:${info.port}`;
});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();rmSync(folder,{recursive:true,force:true});});
const headers=(token?:string,origin=process.env.VITE_APP_URL!)=>({'Content-Type':'application/json',Origin:origin,...(token?{Cookie:`refbridge_session=${token}`}:{})});
test('link routes enforce session/CSRF and issue a canonical session; wallet login returns the same account',async()=>{
 const token=createSession('google','google'),otherSession=createSession('google','google');
 const request=(path:string,body:unknown,session=token,origin=process.env.VITE_APP_URL!)=>fetch(base+path,{method:'POST',headers:headers(session,origin),body:JSON.stringify(body)});
 expect((await fetch(base+'/wallet/google-link/preview',{method:'POST',headers:headers(),body:JSON.stringify({address:owner.address})})).status).toBe(401);
 expect((await request('/wallet/google-link/preview',{address:owner.address},token,'https://evil.example')).status).toBe(403);
 const response=await request('/wallet/google-link/preview',{address:owner.address});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 // The preview is observed by usage measurement; telemetry is not a business
 // resource and must not invalidate the subsequent dual-proof account link.
 expect((db.query("SELECT count(*) AS n FROM product_usage_accounts WHERE user_id='google'").get() as {n:number}).n).toBeGreaterThan(0);
 const preview=await response.json() as {nonce:string;message:string};const signature=await owner.signMessage({message:preview.message});
 expect((await request('/wallet/google-link/complete',{nonce:preview.nonce,signature},token,'https://evil.example')).status).toBe(403);
 expect((await request('/wallet/google-link/complete',{nonce:preview.nonce,signature},otherSession)).status).toBe(400);
 const linked=await request('/wallet/google-link/complete',{nonce:preview.nonce,signature,userId:'attacker',targetId:'attacker'});expect(linked.status).toBe(200);
 const result=await linked.json() as {user:{id:string;role:string;linkedMethods:{method:string}[]}};expect(result.user.id).toBe('wallet');expect(result.user.role).toBe('admin');expect(result.user.linkedMethods.map(m=>m.method)).toEqual(['x','wallet','google']);
 expect(getSessionUserId(token)).toBeNull();expect(getSessionUserId(otherSession)).toBeNull();
 expect(linked.headers.get('set-cookie')).toContain('HttpOnly');expect(linked.headers.get('set-cookie')).toContain('SameSite=Lax');
 const cookie=linked.headers.get('set-cookie')!.split(';',1)[0];
 const status=await(await fetch(base+'/auth/status',{headers:{Cookie:cookie}})).json() as {session:{method:string};user:{id:string}};expect(status.session.method).toBe('google');expect(status.user.id).toBe('wallet');
 const challenge=await(await request('/auth/wallet/challenge',{address:owner.address})).json() as {nonce:string;message:string};
 const walletResponse=await request('/auth/wallet/complete',{address:owner.address,nonce:challenge.nonce,message:challenge.message,signature:await owner.signMessage({message:challenge.message})});expect(walletResponse.status).toBe(200);expect((await walletResponse.json() as {user:{id:string}}).user.id).toBe('wallet');
 // Even accidental server-issued sessions for a retired source are unusable.
 expect(getSessionUserId(createSession('google','google'))).toBeNull();
 const unlink=(origin=process.env.VITE_APP_URL!)=>fetch(base+'/account/x/disconnect',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({userId:'other'})});
 expect((await unlink('https://evil.example')).status).toBe(403);
 expect((await fetch(base+'/account/x/disconnect',{method:'POST',headers:headers(),body:'{}'})).status).toBe(401);
 expect((await unlink()).status).toBe(200);
 const cleaned=await(await fetch(base+'/auth/status',{headers:{Cookie:cookie}})).json() as {user:{id:string;role:string;xId:string|null;linkedMethods:{method:string}[]}};
 expect(cleaned.user.id).toBe('wallet');expect(cleaned.user.role).toBe('admin');expect(cleaned.user.xId).toBeNull();expect(cleaned.user.linkedMethods.map(m=>m.method)).toEqual(['wallet','google']);
});
