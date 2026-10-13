import {describe,expect,it} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createHash} from 'node:crypto';
import express,{Router,type Request,type RequestHandler,type Response as ExpressResponse} from 'express';
import {AccountSessionError,listAccountSessions,revokeAccountSession,revokeOtherAccountSessions} from './accountSessions';
import {createAccountSessionsRoutes} from './accountSessionRoutes';
import {createAuthRequestGuard} from './authRequestGuard';
import type {AccountSessions} from '../src/account-sessions';

const at=new Date('2026-10-09T12:00:00.000Z'),future='2099-10-16T12:00:00.000Z';
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const current=hash('test-cookie-current'),other=hash('test-cookie-other'),foreign=hash('test-cookie-foreign');
function database(){const db=new Database(':memory:');db.run(`CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,auth_method TEXT)`);return db;}
function add(db:Database,token:string,user='a',created='2026-10-01T12:00:00.000Z',expires=future,method:string|null='wallet'){
  db.run('INSERT INTO sessions VALUES(?,?,?,?,?)',[token,user,created,expires,method]);
}
function expectError(action:()=>unknown,status:number){try{action();throw new Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(AccountSessionError);expect((error as AccountSessionError).status).toBe(status);}}

describe('Account session management',()=>{
  it('only returns owned active sessions and nonbearer public IDs, with the current session first',()=>{const db=database();try{
    add(db,current);add(db,other,'a','2026-10-08T12:00:00.000Z');add(db,foreign,'b');
    add(db,hash('expired'),'a',undefined,at.toISOString());add(db,hash('bad-time'),'a',undefined,'invalid');add(db,'old-raw-cookie');
    const result=listAccountSessions(db,'a',current,at);
    expect(result.total).toBe(2);expect(result.sessions.map(s=>s.current)).toEqual([true,false]);
    expect(result.sessions[0].method).toBe('wallet');expect(result.sessions[0].id).toMatch(/^ses_[0-9a-f]{64}$/);
    expect(result.sessions[0].id).not.toContain(current);expect(result.sessions[1].id).not.toContain(other);
    const serialized=JSON.stringify(result);for(const credential of [current,other,foreign,'test-cookie-current','old-raw-cookie'])expect(serialized).not.toContain(credential);
    expect(result.sessions[0]).not.toHaveProperty('token');expect(result.sessions[0]).not.toHaveProperty('user_id');
    expect(hash(result.sessions[0].id)).not.toBe(current);
  }finally{db.close();}});
  it('preserves stable IDs, bounds output to 100, always includes current and reports truncation',()=>{const db=database();try{
    add(db,current);for(let i=0;i<105;i++)add(db,hash('many'+i),'a','2026-10-08T12:00:00.000Z');
    const result=listAccountSessions(db,'a',current,at);
    expect(result.sessions).toHaveLength(100);expect(result.total).toBe(106);expect(result.truncated).toBe(true);expect(result.sessions[0].current).toBe(true);
    expect(listAccountSessions(db,'a',current,at).sessions[0].id).toBe(result.sessions[0].id);
    const revoked=revokeOtherAccountSessions(db,'a',current,at);expect(revoked.revoked).toBe(105);expect(revoked.sessions.total).toBe(1);expect(revoked.sessions.truncated).toBe(false);
  }finally{db.close();}});
  it('normalizes unknown legacy methods without inventing a provider or device',()=>{const db=database();try{
    add(db,current,'a',undefined,future,'secret-provider-token');
    expect(listAccountSessions(db,'a',current,at).sessions[0].method).toBeNull();
  }finally{db.close();}});
  it('rechecks authentication and expiry before reading or revoking, including the exact expiry boundary',()=>{const db=database();try{
    add(db,current,'a',undefined,at.toISOString());add(db,other);
    expectError(()=>listAccountSessions(db,'a',current,at),401);
    expectError(()=>revokeOtherAccountSessions(db,'a',current,at),401);
    expectError(()=>listAccountSessions(db,'a','test-cookie-current',at),401);
    expectError(()=>listAccountSessions(db,'b',other,at),401);
    expect(db.query('SELECT count(*) AS n FROM sessions').get()).toEqual({n:2});
  }finally{db.close();}});
  it('denies current session management revocation and isolates IDs, account selection and stored hashes',()=>{const db=database();try{
    add(db,current);add(db,other);add(db,foreign,'b');
    const mine=listAccountSessions(db,'a',current,at),theirs=listAccountSessions(db,'b',foreign,at);
    expectError(()=>revokeAccountSession(db,'a',current,mine.sessions[0].id,at),409);
    for(const id of [theirs.sessions[0].id,other,'test-cookie-other',null,'ses_'+'0'.repeat(64)])expectError(()=>revokeAccountSession(db,'a',current,id,at),404);
    expect(db.query('SELECT count(*) AS n FROM sessions').get()).toEqual({n:3});
    const result=revokeAccountSession(db,'a',current,mine.sessions[1].id,at);expect(result.revoked).toBe(1);expect(result.sessions.total).toBe(1);
    expect(db.query('SELECT token FROM sessions WHERE token=?').get(other)).toBeNull();expect(db.query('SELECT token FROM sessions WHERE token=?').get(foreign)).not.toBeNull();
    expectError(()=>revokeAccountSession(db,'a',current,mine.sessions[1].id,at),404);
  }finally{db.close();}});
  it('signs out all other active sessions for this account while preserving current and other accounts',()=>{const db=database();try{
    add(db,current);add(db,other);add(db,foreign,'b');add(db,hash('expired'),'a',undefined,'2000-01-01T00:00:00.000Z');
    const result=revokeOtherAccountSessions(db,'a',current,at);expect(result.revoked).toBe(1);expect(result.sessions.sessions).toHaveLength(1);expect(result.sessions.sessions[0].current).toBe(true);
    expect(db.query('SELECT user_id FROM sessions WHERE token=?').get(foreign)).toEqual({user_id:'b'});
    expect(revokeOtherAccountSessions(db,'a',current,at).revoked).toBe(0);
  }finally{db.close();}});
});

/** Isolated authentication adapter; no production DB, cookie or wallet is used by these HTTP tests. */
function readTestCookie(req:Request){return req.get('Cookie')?.match(/(?:^|;\s*)test_session=([^;]+)/)?.[1]||null;}
type RouterRequest=(path:string,init?:{method?:string;headers?:Record<string,string>})=>Promise<Response>;
async function withRoutes(run:(db:Database,request:RouterRequest)=>Promise<void>){
  const db=database();add(db,current);add(db,other);add(db,foreign,'b');
  const auth:RequestHandler=(req,res,next)=>{
    const token=readTestCookie(req),owner=token?db.query('SELECT user_id FROM sessions WHERE token=? AND julianday(expires_at)>julianday(?)').get(hash(token),new Date().toISOString()) as {user_id:string}|null:null;
    if(!owner)return res.status(401).json({error:'Oturum açılmamış'});
    (req as Request&{userId:string}).userId=owner.user_id;next();
  };
  const router=Router();router.use('/account',createAuthRequestGuard('https://carpan.test',()=>{}),createAccountSessionsRoutes(db,auth,req=>{const cookie=readTestCookie(req);return cookie?hash(cookie):null;}));
  // Invoke the actual Express router in memory; no listening socket or network permissions are needed.
  const request:RouterRequest=(path,init={})=>new Promise(resolve=>{
    const inputHeaders=Object.fromEntries(Object.entries(init.headers||{}).map(([key,value])=>[key.toLowerCase(),value]));
    const req=Object.assign(Object.create(express.request),{method:init.method||'GET',url:path,headers:inputHeaders,body:{},socket:{remoteAddress:'127.0.0.1'}}) as Request;
    Object.defineProperty(req,'ip',{value:'127.0.0.1'});
    const outputHeaders:Record<string,string>={};let status=200;
    const res={
      set(key:string|Record<string,string>,value?:string){if(typeof key==='string')outputHeaders[key]=value!;else Object.assign(outputHeaders,key);return this;},
      status(code:number){status=code;return this;},
      json(body:unknown){outputHeaders['Content-Type']='application/json';resolve(new Response(JSON.stringify(body),{status,headers:outputHeaders}));return this;},
    } as unknown as ExpressResponse;
    router(req,res,()=>resolve(new Response('{}',{status:404})));
  });
  try{await run(db,request);}finally{db.close();}
}
const headers={Cookie:'test_session=test-cookie-current',Origin:'https://carpan.test'};
describe('Account session Express routes',()=>{
  it('requires authentication and returns private metadata without credentials or editable account scope',async()=>withRoutes(async(_db,request)=>{
    expect((await request('/account/sessions')).status).toBe(401);
    const response=await request('/account/sessions?userId=b',{headers});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body=await response.json() as AccountSessions;expect(body.total).toBe(2);expect(body.sessions.filter(s=>s.current)).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(current);expect(JSON.stringify(body)).not.toContain(foreign);
    expect((await request('/account/sessions',{headers:{Cookie:'test_session='+body.sessions[0].id}})).status).toBe(401);
  }));
  it('rejects cross-origin and cross-site revocations before any rows change',async()=>withRoutes(async(db,request)=>{
    for(const extra of [{Origin:'https://attacker.test'},{'Sec-Fetch-Site':'cross-site'}]){
      const response=await request('/account/sessions/revoke-others',{method:'POST',headers:{...headers,...extra}});expect(response.status).toBe(403);
    }
    expect(db.query('SELECT count(*) AS n FROM sessions').get()).toEqual({n:3});
  }));
  it('revokes another session, makes its next request unauthenticated and keeps this browser signed in',async()=>withRoutes(async(_db,request)=>{
    const mine=await (await request('/account/sessions',{headers})).json() as AccountSessions;
    const response=await request('/account/sessions/'+mine.sessions[1].id,{method:'DELETE',headers});expect(response.status).toBe(200);
    expect((await request('/account/sessions',{headers:{Cookie:'test_session=test-cookie-other'}})).status).toBe(401);
    expect((await request('/account/sessions',{headers})).status).toBe(200);
    expect((await request('/account/sessions/'+mine.sessions[0].id,{method:'DELETE',headers})).status).toBe(409);
    const theirs=await (await request('/account/sessions',{headers:{Cookie:'test_session=test-cookie-foreign'}})).json() as AccountSessions;
    expect((await request('/account/sessions/'+theirs.sessions[0].id,{method:'DELETE',headers})).status).toBe(404);
  }));
  it('applies a bounded per-account write limit without revoking unselected sessions',async()=>withRoutes(async(db,request)=>{
    for(let i=0;i<20;i++)expect((await request('/account/sessions/unknown',{method:'DELETE',headers})).status).toBe(404);
    const limited=await request('/account/sessions/revoke-others',{method:'POST',headers});expect(limited.status).toBe(429);expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(db.query('SELECT count(*) AS n FROM sessions').get()).toEqual({n:3});
  }));
});
