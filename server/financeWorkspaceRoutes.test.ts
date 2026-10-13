import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import express,{Router,type Request,type RequestHandler,type Response as ExpressResponse} from 'express';
import {initFinanceWorkspace,readFinanceDecisions} from './financeWorkspace';
import {createFinanceWorkspaceRoutes,FINANCE_OWNER_CHANGED} from './financeWorkspaceRoutes';
import {FinanceSaveQueue} from '../src/finance-save-queue';

const wallet='0x'+'1'.repeat(40);
const id=`5042:0x${'a'.repeat(64)}:1:0x3600000000000000000000000000000000000000`;
const draft={id,category:'collection',reference:'Alice private reference',ownerId:'alice'};
type RequestInit={method?:string;cookie?:string;body?:unknown};
type RouterRequest=(path:string,init?:RequestInit)=>Promise<Response>;

async function withRoutes(run:(db:Database,request:RouterRequest)=>Promise<void>){
  const db=new Database(':memory:');initFinanceWorkspace(db);
  // The fixture cookie selects the authenticated session. Payload ownerId must
  // never become authorization or select a different account.
  const auth:RequestHandler=(req,res,next)=>{
    const owner=req.headers.cookie==='session=alice'?'alice':req.headers.cookie==='session=bob'?'bob':null;
    if(!owner)return void res.status(401).json({error:'Unauthorized'});
    (req as Request&{userId:string}).userId=owner;next();
  };
  const router=Router();router.use('/arc/finance',createFinanceWorkspaceRoutes(db,auth));
  // Exercise the actual Express router without a listening socket.
  const request:RouterRequest=(path,init={})=>new Promise(resolve=>{
    const req=Object.assign(Object.create(express.request),{method:init.method||'PUT',url:path,
      headers:{cookie:init.cookie||''},body:init.body,socket:{remoteAddress:'127.0.0.1'}}) as Request;
    const headers:Record<string,string>={};let status=200;
    const res={
      set(key:string,value:string){headers[key]=value;return this;},
      status(code:number){status=code;return this;},
      json(body:unknown){resolve(new Response(JSON.stringify(body),{status,headers}));return this;},
    } as unknown as ExpressResponse;
    router(req,res,()=>resolve(new Response('{}',{status:404})));
  });
  try{await run(db,request);}finally{db.close();}
}
const path=`/arc/finance/${wallet}/decisions`;

test('finance writes require the current cookie owner and reject omitted, foreign or forged owner scope',async()=>withRoutes(async(db,request)=>{
  expect((await request(path,{body:draft})).status).toBe(401);
  for(const ownerId of [undefined,null,'bob',{},42]){
    const response=await request(path,{cookie:'session=alice',body:{...draft,ownerId}});
    expect(response.status).toBe(409);expect(await response.json()).toEqual({error:FINANCE_OWNER_CHANGED});
  }
  expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions).toEqual({});
  expect(readFinanceDecisions(db,'bob',wallet,[id]).decisions).toEqual({});
  const saved=await request(path,{cookie:'session=alice',body:draft});
  expect(saved.status).toBe(200);expect(saved.headers.get('cache-control')).toBe('private, no-store');
  expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions[id]?.reference).toBe(draft.reference);
  expect((await request(path+'/read',{method:'POST',cookie:'session=bob',body:{ids:[id],ownerId:'alice'}})).status).toBe(200);
  expect(await (await request(path+'/read',{method:'POST',cookie:'session=bob',body:{ids:[id]}})).json()).toEqual({decisions:{}});
}));

for(const mode of ['delayed timer','unmount cleanup'] as const){
  test(`an old owner's ${mode} cannot copy its note into a replacement cookie account`,async()=>withRoutes(async(db,request)=>{
    let cookie='session=alice';
    const originalOwner='alice';
    const queue=new FinanceSaveQueue(async(w,row,decision)=>{
      const response=await request(`/arc/finance/${w}/decisions`,{cookie,body:{id:row,...decision,ownerId:originalOwner}});
      if(!response.ok)throw Error((await response.json() as {error:string}).error);
    },()=>{});
    const key=queue.set(wallet,id,{category:'collection',reference:draft.reference});
    cookie='session=bob';
    if(mode==='delayed timer')await new Promise<void>(resolve=>setTimeout(()=>{void queue.flush(key).then(resolve);},550));
    else await queue.flush(key);
    expect(queue.errors.get(key)).toBe(FINANCE_OWNER_CHANGED);
    expect(queue.pending.size).toBe(1);
    expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions).toEqual({});
    expect(readFinanceDecisions(db,'bob',wallet,[id]).decisions).toEqual({});
    // A later retry on the original session saves to the original owner only.
    cookie='session=alice';await queue.flush(key);
    expect(queue.pending.size).toBe(0);
    expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions[id]?.reference).toBe(draft.reference);
    expect(readFinanceDecisions(db,'bob',wallet,[id]).decisions).toEqual({});
  }));
}
