import {afterAll, beforeAll, expect, test} from 'bun:test';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Database} from 'bun:sqlite';

const folder=mkdtempSync(join(tmpdir(),'refvox-wallet-api-'));
const file=join(folder,'wallet-test.sqlite');
process.env.REFBRIDGE_DB_PATH=file;
process.env.REFVOX_AUTH_MODE='demo';
process.env.NODE_ENV='test';
const {app}=await import('./index');
const {db}=await import('./sqliteDb');
const {createSession}=await import('./auth');
const address='0x1111111111111111111111111111111111111111';
const alice=`refbridge_session=${createSession('user_demo')}`;
const bob=`refbridge_session=${createSession('user_founder')}`;
const admin=`refbridge_session=${createSession('user_admin')}`;
let server:ReturnType<typeof app.listen>, base:string;
beforeAll(async()=>{
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const info=server.address();if(!info||typeof info==='string')throw new Error('No test port');
  base=`http://127.0.0.1:${info.port}`;
});
afterAll(async()=>{
  if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
  db.close();rmSync(folder,{recursive:true,force:true});
});
function request(path:string,cookie='',method='GET',body?:unknown){
  return fetch(base+path,{method,headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}
test('token alarm API keeps verified metadata and owner access boundaries',async()=>{
 const draft={address,name:'Token journey',kind:'token_transfer',direction:'out',minimum:'0.000001',token:'0x3600000000000000000000000000000000000000',symbol:'FAKE',decimals:18};
 expect((await request('/arc/alerts','','POST',draft)).status).toBe(401);
 expect((await request('/arc/alerts',alice,'POST',{...draft,token:'not-an-address'})).status).toBe(400);
 const response=await request('/arc/alerts',alice,'POST',draft);expect(response.status).toBe(201);const {id}=await response.json();
 const dashboard=await (await request('/arc/alerts',alice)).json();expect(dashboard.rules.find((r:{id:string})=>r.id===id)).toMatchObject({token:draft.token,symbol:'USDC',decimals:6});
 expect((await request(`/arc/alerts/${id}`,bob,'PATCH',{enabled:false})).status).toBe(404);
 expect((await request(`/arc/alerts/${id}`,alice,'DELETE')).status).toBe(200);
});
test('label endpoints require a session and keep user labels private in profiles and follow lists',async()=>{
  const path=`/arc/wallets/${address}/label`;
  expect((await request(path)).status).toBe(401);
  expect((await request(path,'','PUT',{label:'Forbidden'})).status).toBe(401);
  expect((await request(path,alice,'PUT',{label:'Alice treasury'})).status).toBe(200);
  expect((await request(path,bob)).headers.get('cache-control')).toContain('no-store');
  expect(await (await request(path,bob)).json()).toMatchObject({label:''});
  expect(await (await request(path,alice)).json()).toMatchObject({label:'Alice treasury'});
  expect((await request('/arc/following',alice,'POST',{contractAddress:address})).status).toBe(200);
  expect((await request('/arc/following',bob,'POST',{contractAddress:address})).status).toBe(200);
  const a=await (await request('/arc/following',alice)).json();
  const b=await (await request('/arc/following',bob)).json();
  expect(a[0].privateLabel).toBe('Alice treasury');expect(b[0].privateLabel).toBe('');
  expect((await request(path,bob,'PUT',{label:'Bob operations'})).status).toBe(200);
  const reopened=new Database(file,{readonly:true});
  expect(reopened.query('SELECT label FROM arc_wallet_labels WHERE user_id=? AND address=?').get('user_demo',address)).toEqual({label:'Alice treasury'});
  reopened.close();
  expect((await request(path,alice,'PUT',{label:''})).status).toBe(200);
  expect(await (await request(path,bob)).json()).toMatchObject({label:'Bob operations'});
});
test('wallet endpoints reject malformed addresses, cursors, and filters before calling providers',async()=>{
  expect((await request('/arc/wallets/invalid')).status).toBe(400);
  expect((await request(`/arc/wallets/${address}/transfers?cursor=tampered`)).status).toBe(400);
  expect((await request(`/arc/wallets/${address}/transfers?minimum=1&token=all`)).status).toBe(400);
  expect((await request(`/arc/wallets/${address}/transfers?from=2026-02-30`)).status).toBe(400);
  expect((await request(`/arc/wallets/invalid/label`,alice,'PUT',{label:'x'})).status).toBe(400);
  expect((await request(`/arc/wallets/${address}/label`,alice,'PUT',{label:'x'.repeat(61)})).status).toBe(400);
});


test('global transfer endpoint rejects invalid minimum and signed cursor before provider access',async()=>{
  expect((await request('/arc/transfers?minimum=-1')).status).toBe(400);
  expect((await request('/arc/transfers?minimum=0.0000001')).status).toBe(400);
  expect((await request('/arc/transfers?cursor=tampered')).status).toBe(400);
});

test('project addresses require explicit official-source review, admin authorization and matching publication realm',async()=>{
  const path='/projects/proj_alpha/addresses',draft={address,role:'treasury',label:'Hazine',sourceUrl:'https://docs.alphaprotocol.demo/addresses',sourceNote:'Arc Mainnet hazine adresi kaynakta belirtiliyor.',reviewed:true};
  expect((await request(path,'','POST',draft)).status).toBe(401);
  expect((await request(path,alice,'POST',draft)).status).toBe(403);
  expect((await request(path,admin,'POST',{...draft,reviewed:false})).status).toBe(400);
  expect((await request(path,admin,'POST',{...draft,sourceUrl:'https://alphaprotocol.demo.evil.example/proof'})).status).toBe(400);
  expect((await request(path,admin,'POST',{...draft,sourceUrl:'javascript:alert(1)'})).status).toBe(400);
  expect((await request('/projects/proj_pending/addresses',admin,'POST',draft)).status).toBe(404);
  const created=await request(path,admin,'POST',draft);expect(created.status).toBe(200);
  const rows=await created.json();expect(rows[0]).toMatchObject({address,role:'treasury',sourceUrl:draft.sourceUrl});
  expect((await (await request('/discover/projects/proj_alpha/addresses')).json())).toHaveLength(1);
  expect((await (await request(`/arc/addresses/${address}/projects`)).json())[0].id).toBe('proj_alpha');
  db.run("UPDATE projects SET is_demo=0 WHERE id='proj_alpha'");
  expect((await request('/discover/projects/proj_alpha/addresses')).status).toBe(404);
  expect(await (await request(`/arc/addresses/${address}/projects`)).json()).toEqual([]);
  db.run("UPDATE projects SET is_demo=1 WHERE id='proj_alpha'");
  expect((await request(path,admin,'POST',{...draft,label:'Güncel hazine'})).status).toBe(200);
  expect((await (await request('/discover/projects/proj_alpha/addresses')).json())).toHaveLength(1);
  expect((await request(`${path}/${rows[0].id}`,alice,'DELETE')).status).toBe(403);
  expect((await request(`${path}/${rows[0].id}`,admin,'DELETE')).status).toBe(200);
  expect(await (await request(`/arc/addresses/${address}/projects`)).json()).toEqual([]);
});
test('alarm API requires authentication and enforces per-user ownership for every mutation',async()=>{
  expect((await request('/arc/alerts')).status).toBe(401);
  expect((await request('/arc/alerts','','POST',{})).status).toBe(401);
  expect((await request('/arc/alerts',alice,'POST',{address,name:'Hazine alarmı',kind:'usdc_transfer',direction:'out',minimum:'0.0000001'})).status).toBe(400);
  const created=await request('/arc/alerts',alice,'POST',{address,name:'Hazine alarmı',kind:'usdc_transfer',direction:'out',minimum:'10000'});
  expect(created.status).toBe(201);const {id}=await created.json();
  const own=await request('/arc/alerts',alice);expect(own.headers.get('cache-control')).toContain('no-store');
  expect((await own.json()).rules[0]).toMatchObject({id,address,enabled:true});
  expect((await (await request('/arc/alerts',bob)).json()).rules).toEqual([]);
  expect((await request(`/arc/alerts/${id}`,bob,'PATCH',{enabled:false})).status).toBe(404);
  expect((await request(`/arc/alerts/${id}`,bob,'DELETE')).status).toBe(404);
  expect((await request(`/arc/alerts/${id}`,alice,'PATCH',{enabled:'false'})).status).toBe(400);
  expect((await request(`/arc/alerts/${id}`,alice,'PATCH',{enabled:false})).status).toBe(200);
  expect((await (await request('/arc/alerts',alice)).json()).rules[0].enabled).toBe(false);
  expect((await request('/arc/alerts/read',alice,'POST',{})).status).toBe(200);
  expect((await request(`/arc/alerts/${id}`,alice,'DELETE')).status).toBe(200);
  expect((await (await request('/arc/alerts',alice)).json()).rules).toEqual([]);
  expect((await request('/arc/wallets/bad/research')).status).toBe(400);
});


test('finance API requires a session and never exposes another account notes',async()=>{
 const id=`5042:0x${'a'.repeat(64)}:0:0x3600000000000000000000000000000000000000`;
 const path=`/arc/finance/${address}/decisions`,draft={id,category:'collection',reference:'isolated API test',ownerId:'user_demo'};
 expect((await request(path,'','PUT',draft)).status).toBe(401);
 expect((await request(path+'/read','','POST',{ids:[id]})).status).toBe(401);
 expect((await request(path,alice,'PUT',{...draft,ownerId:undefined})).status).toBe(409);
 expect((await request(path,alice,'PUT',{...draft,ownerId:'user_founder'})).status).toBe(409);
 expect((await request(path,bob,'PUT',draft)).status).toBe(409);
 expect((await (await request(path+'/read',bob,'POST',{ids:[id]})).json()).decisions).toEqual({});
 expect((await request(path,alice,'PUT',draft)).status).toBe(200);
 const own=await request(path+'/read',alice,'POST',{ids:[id]});
 expect(own.headers.get('cache-control')).toContain('no-store');
 expect((await own.json()).decisions[id].reference).toBe('isolated API test');
 expect((await (await request(path+'/read',bob,'POST',{ids:[id]})).json()).decisions).toEqual({});
 expect((await request(path,alice,'PUT',{...draft,category:'wrong'})).status).toBe(400);
});


test('collection HTTP endpoints protect account records and expose only shareable payment details',async()=>{
  expect((await request('/finance/requests')).status).toBe(401);
  expect((await request('/finance/requests','','POST',{})).status).toBe(401);
  db.run('UPDATE users SET wallet_address=?,wallet_verified_at=? WHERE id=?',['0x'+'7'.repeat(40),'2026-01-01','user_demo']);
  const created=await request('/finance/requests',alice,'POST',{customer:'PRIVATE CUSTOMER',invoice:'PRIVATE INVOICE',amount:'1.25',payer:'',due:''});
  expect(created.status).toBe(201);const row=await created.json();
  const publicResponse=await request('/finance/pay/'+row.shareToken);expect(publicResponse.status).toBe(200);expect(publicResponse.headers.get('cache-control')).toContain('no-store');
  const shared=await publicResponse.text();expect(shared).not.toContain('PRIVATE');expect(shared).not.toContain('user_demo');
  const other=await (await request('/finance/requests',bob)).json();expect(other.some((r:{id:string})=>r.id===row.id)).toBe(false);
  expect((await request('/finance/requests/'+row.id+'/cancel',bob,'POST')).status).toBe(400);
  expect((await request('/finance/requests/'+row.id+'/proofs',alice,'POST',{hash:'invalid'})).status).toBe(400);
  expect((await request('/finance/requests/'+row.id+'/cancel',alice,'POST')).status).toBe(200);
  expect((await request('/finance/pay/'+row.shareToken)).status).toBe(404);
});
