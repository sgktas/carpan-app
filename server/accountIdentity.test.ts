import {beforeAll,afterAll,test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'carpan-identities-'));
process.env.REFBRIDGE_DB_PATH=join(folder,'test.db');process.env.REFVOX_AUTH_MODE='live';process.env.NODE_ENV='test';
process.env.X_CLIENT_ID='identity-test';process.env.X_CLIENT_SECRET='identity-secret';process.env.X_LOGIN_ENABLED='true';process.env.VITE_APP_URL='http://127.0.0.1:5173';
const {app}=await import('./index');const {db,rowToUser}=await import('./sqliteDb');const {createSession,getSessionDetails}=await import('./auth');
let server:ReturnType<typeof app.listen>,base:string,realFetch:typeof fetch;let providerCalls=0;
let identity={id:'55555555',username:'carpan_app',name:'Carpan'};
beforeAll(async()=>{
  db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,wallet_address,wallet_verified_at,role,is_demo,created_at) VALUES('owner','44444444','refvox','Refvox','0x1111111111111111111111111111111111111111',?,'admin',0,?)",[new Date().toISOString(),new Date().toISOString()]);
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const info=server.address();if(!info||typeof info==='string')throw Error('No test port');base=`http://127.0.0.1:${info.port}`;
  realFetch=globalThis.fetch;globalThis.fetch=(async(input,init)=>{const url=String(input);if(url==='https://api.x.com/2/oauth2/token'){providerCalls++;return Response.json({access_token:'mock-access'});}if(url.startsWith('https://api.x.com/2/users/me'))return Response.json({data:identity});return realFetch(input,init);}) as typeof fetch;
});
afterAll(async()=>{globalThis.fetch=realFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();rmSync(folder,{recursive:true,force:true});});
const cookie=(token:string)=>`refbridge_session=${token}`;
async function start(token:string){const response=await realFetch(base+'/auth/x/link/start?redirect=%2Fdashboard%23account',{method:'POST',headers:{cookie:cookie(token)}});expect(response.status).toBe(200);const {authUrl}=await response.json() as {authUrl:string};return {state:new URL(authUrl).searchParams.get('state')!,stateCookie:response.headers.get('set-cookie')!.split(';',1)[0]};}
async function finish(flow:{state:string;stateCookie:string},token?:string){return realFetch(base+`/auth/x/callback?state=${flow.state}&code=mock`,{redirect:'manual',headers:{cookie:[flow.stateCookie,token?cookie(token):''].filter(Boolean).join('; ')}});}
test('session method records the current login, while historical sessions remain unknown',async()=>{
  const legacy=createSession('owner'),wallet=createSession('owner','wallet');
  expect(getSessionDetails(legacy)?.method).toBeNull();expect(getSessionDetails(wallet)?.method).toBe('wallet');
  const status=await(await realFetch(base+'/auth/status',{headers:{cookie:cookie(wallet)}})).json() as {session:{method:string};user:{authMethod:string;linkedMethods:{method:string}[]}};
  expect(status.session.method).toBe('wallet');expect(status.user.authMethod).toBe('x');expect(status.user.linkedMethods.map(x=>x.method)).toEqual(['x','wallet']);
  db.run("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id='owner'");expect(getSessionDetails(wallet)).toBeNull();
});
test('X linking requires the exact originating authenticated session, before provider calls',async()=>{
  expect((await realFetch(base+'/auth/x/link/start',{method:'POST'})).status).toBe(401);
  const token=createSession('owner','wallet'),before=providerCalls;
  expect((await finish(await start(token))).headers.get('location')).toBe('/?error=invalid_state');
  expect((await finish(await start(token),createSession('owner','wallet'))).headers.get('location')).toBe('/?error=invalid_state');
  expect(providerCalls).toBe(before);
});
test('verified new X replaces the legacy link without a new profile, privilege or wallet change',async()=>{
  const token=createSession('owner','wallet'),flow=await start(token),before=db.query('SELECT COUNT(*) AS n FROM users').get();
  expect((await finish(flow,token)).headers.get('location')).toBe('/dashboard#account');
  const row=db.query('SELECT * FROM users WHERE id=?').get('owner') as Record<string,unknown>;
  expect(row).toMatchObject({id:'owner',role:'admin',x_id:'55555555',x_handle:'carpan_app',wallet_address:'0x1111111111111111111111111111111111111111'});
  expect(rowToUser(row).linkedMethods.map(x=>x.method)).toEqual(['x','wallet']);expect(db.query('SELECT COUNT(*) AS n FROM users').get()).toEqual(before);
  expect(getSessionDetails(token)?.method).toBe('wallet');expect((await finish(flow,token)).headers.get('location')).toBe('/?error=invalid_state');
});
test('linking an X identity owned by another account never merges or transfers it',async()=>{
  db.run("INSERT INTO users(id,x_id,x_handle,x_display_name,is_demo,created_at) VALUES('other','66666666','other','Other',0,?)",[new Date().toISOString()]);identity={id:'66666666',username:'other',name:'Other'};
  const response=await finish(await start(createSession('owner','wallet')),createSession('owner','wallet'));
  expect(response.headers.get('location')).toBe('/?error=invalid_state');
  const token=createSession('owner','wallet');expect((await finish(await start(token),token)).headers.get('location')).toBe('/?error=x_link_conflict');
  expect(db.query('SELECT x_id FROM users WHERE id=?').get('owner')).toEqual({x_id:'55555555'});expect(db.query('SELECT x_id FROM users WHERE id=?').get('other')).toEqual({x_id:'66666666'});
});
