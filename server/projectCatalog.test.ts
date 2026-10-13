import {afterAll,beforeAll,expect,test} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseProjectSubmission} from './projectSubmission';
import {ecosystemCatalog,curatedRelatedProjects} from './ecosystemCatalog';
import type {EcosystemCatalog} from '../src/ecosystem';

const folder=mkdtempSync(join(tmpdir(),'carpan-project-catalog-'));
process.env.REFBRIDGE_DB_PATH=join(folder,'catalog.db');
process.env.REFVOX_AUTH_MODE='live';process.env.NODE_ENV='test';
process.env.X_CLIENT_ID='';process.env.X_CLIENT_SECRET='';
const {app}=await import('./index');const {db}=await import('./sqliteDb');const {createSession}=await import('./auth');
let server:ReturnType<typeof app.listen>,base:string,owner:string,reader:string;
const basic={name:'Arc builder',description:'A useful Arc tool',officialDomain:'builder.example'};
const referral={...basic,referralLinkPattern:'https://builder.example/ref/{code}',validParticipationCondition:'Finish the real project task',participantBenefit:'Early access'};
beforeAll(async()=>{
  for(const id of ['owner','reader'])db.run("INSERT INTO users(id,x_id,auth_method,x_handle,x_display_name,is_demo,created_at) VALUES(?,?,'wallet',?,?,0,?)",[id,`catalog-${id}`,id,id,new Date().toISOString()]);
  owner=createSession('owner','wallet');reader=createSession('reader','wallet');
  server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));
  const info=server.address();if(!info||typeof info==='string')throw Error('No test port');base=`http://127.0.0.1:${info.port}`;
});
afterAll(async()=>{if(server?.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();rmSync(folder,{recursive:true,force:true});});
const headers=(session=owner)=>({'content-type':'application/json',cookie:`refbridge_session=${session}`});

test('ecosystem sources distinguish documented contracts from participation and isolate the real realm',async()=>{
  const response=await fetch(base+'/ecosystem');expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  const catalog=await response.json() as {projects:{id:string;stage:string;addresses:{address:string}[];sources:{url:string}[]}[];assets:{symbol:string}[]};
  const aave=catalog.projects.find(p=>p.id==='eco_aave');expect(aave).toMatchObject({stage:'participant',addresses:[]});
  expect(catalog.projects.find(p=>p.id==='eco_cctp')).toMatchObject({stage:'mainnet'});
  expect(catalog.assets.some(a=>a.symbol==='AAVE')).toBe(false);
  expect(catalog.projects.find(p=>p.id==='eco_goldsky')?.sources[0].url).toBe('https://docs.arc.io/arc/tools/data-indexers');
  expect(ecosystemCatalog(db,[],true)).toMatchObject({projects:[],assets:[]});
  expect(db.query("SELECT COUNT(*) AS n FROM projects WHERE id LIKE 'eco_%'").get()).toEqual({n:0});
});

test('research metadata keeps logos local and source links public without implying deployed markets',async()=>{
  const catalog=await(await fetch(base+'/ecosystem')).json() as EcosystemCatalog;
  for(const entry of catalog.projects.filter(p=>p.curated)){
    expect(entry.logo?.src).toMatch(/^\/images\/ecosystem\/[a-z0-9]+\.(png|svg)$/);
    expect(new URL(entry.logo!.sourceUrl).protocol).toBe('https:');
    expect(entry.profile?.overview.en).toBeTruthy();expect(entry.profile?.overview.tr).toBeTruthy();
    for(const resource of entry.profile!.resources)expect(new URL(resource.url).protocol).toBe('https:');
    for(const action of entry.profile!.actions)expect(action.to).toMatch(/^\/(finance|arc)(\?|$)/);
  }
  expect(catalog.projects.find(p=>p.id==='eco_cctp')?.profile?.actions[0].to).toBe('/arc?view=bridge&environment=mainnet');
  expect(catalog.projects.find(p=>p.id==='eco_aave')?.addresses).toEqual([]);
  expect(catalog.assets.map(a=>a.symbol)).not.toContain('AAVE');
});

test('curated project watchlists persist privately and cannot grant a referral programme',async()=>{
  const route=base+'/saved-projects/eco_cctp';
  expect((await fetch(base+'/saved-projects')).status).toBe(401);
  expect((await fetch(route,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(401);
  for(let i=0;i<2;i++)expect((await fetch(route,{method:'POST',headers:headers(),body:'{}'})).status).toBe(200);
  const read=async(session:string)=>fetch(base+'/saved-projects',{headers:headers(session)});
  const own=await read(owner);expect(own.headers.get('cache-control')).toBe('private, no-store');
  expect(await own.json()).toEqual([expect.objectContaining({id:'eco_cctp',allowsFreeParticipation:false,approvedBy:null})]);
  expect(await(await read(reader)).json()).toEqual([]);
  expect(db.query("SELECT COUNT(*) AS n FROM saved_projects WHERE user_id='owner' AND project_id='eco_cctp'").get()).toEqual({n:1});
  expect((await fetch(base+'/saved-projects/eco_unknown',{method:'POST',headers:headers(),body:'{}'})).status).toBe(404);
  expect((await fetch(base+'/referral-links',{method:'POST',headers:headers(),body:JSON.stringify({projectId:'eco_cctp',referralCode:'NOTREAL'})})).status).toBe(404);
  expect((await fetch(route,{method:'DELETE',headers:headers(reader)})).status).toBe(200);
  expect((await(await read(owner)).json() as unknown[]).length).toBe(1);
  expect((await fetch(route,{method:'DELETE',headers:headers()})).status).toBe(200);
  expect(await(await read(owner)).json()).toEqual([]);
});

test('Terminal returns a sourced ecosystem link only for a known Arc address',async()=>{
  const address='0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d';
  expect(curatedRelatedProjects(address.toLowerCase())).toEqual([expect.objectContaining({id:'eco_cctp',label:'TokenMessengerV2'})]);
  const response=await fetch(base+`/arc/addresses/${address}/projects`);expect(response.status).toBe(200);
  expect(await response.json()).toEqual([expect.objectContaining({id:'eco_cctp',sourceUrl:'https://docs.arc.io/arc/references/contract-addresses'})]);
  expect(curatedRelatedProjects('0x1111111111111111111111111111111111111111')).toEqual([]);
  expect((await fetch(base+'/arc/addresses/not-an-address/projects')).status).toBe(400);
});

test('catalogue-only submissions need no referral programme and ignore retired draft fields',()=>{
  expect(parseProjectSubmission({...basic,allowsFreeParticipation:false,referralLinkPattern:'invalid stale draft',participantBenefit:7})).toMatchObject({
    allowsFreeParticipation:false,referralLinkPattern:'https://builder.example',validParticipationCondition:'',participantBenefit:'',referralMode:'url',arcContractAddress:null,
  });
  expect(()=>parseProjectSubmission({...basic,allowsFreeParticipation:'false'})).toThrow();
  expect(()=>parseProjectSubmission({...basic,allowsFreeParticipation:false,officialDomain:'https://builder.example'})).toThrow();
  expect(()=>parseProjectSubmission({...basic,allowsFreeParticipation:false,arcContractAddress:'invalid'})).toThrow();
});
test('old clients retain required referral fields and HTTPS/domain/code rules',()=>{
  expect(parseProjectSubmission(referral).allowsFreeParticipation).toBe(true);
  expect(()=>parseProjectSubmission(basic)).toThrow();
  for(const changed of [
    {participantBenefit:''},{validParticipationCondition:''},{referralLinkPattern:'https://builder.example/path'},
    {referralLinkPattern:'https://elsewhere.example/{code}'},{referralLinkPattern:'http://builder.example/{code}'},
    {referralLinkPattern:'https://owner:secret@builder.example/{code}'},
    {referralMode:'code',referralLinkPattern:'https://builder.example/{code}'},
  ])expect(()=>parseProjectSubmission({...referral,...changed})).toThrow();
  expect(parseProjectSubmission({...referral,referralMode:'code',referralLinkPattern:'https://builder.example/join'}).referralMode).toBe('code');
});
test('new catalogue records remain pending and cannot issue referral links or reservations',async()=>{
  expect((await fetch(base+'/projects/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...basic,allowsFreeParticipation:false})})).status).toBe(401);
  const response=await fetch(base+'/projects/submit',{method:'POST',headers:headers(),body:JSON.stringify({...basic,allowsFreeParticipation:false})});
  expect(response.status).toBe(200);const project=await response.json() as {id:string;status:string;allowsFreeParticipation:boolean};
  expect(project).toMatchObject({status:'pending',allowsFreeParticipation:false});
  expect(await(await fetch(base+'/discover/projects')).json()).toEqual([]);
  db.run("UPDATE projects SET status='approved' WHERE id=?",[project.id]);
  expect((await fetch(base+'/referral-links',{method:'POST',headers:headers(),body:JSON.stringify({projectId:project.id,referralCode:'OWNER001'})})).status).toBe(400);
  expect((await fetch(base+'/participations/reserve',{method:'POST',headers:headers(reader),body:JSON.stringify({projectId:project.id,participationType:'free'})})).status).toBe(400);
  expect(db.query('SELECT COUNT(*) AS n FROM referral_links WHERE project_id=?').get(project.id)).toEqual({n:0});
  expect(db.query('SELECT COUNT(*) AS n FROM reservations WHERE project_id=?').get(project.id)).toEqual({n:0});
});
test('saved catalogue projects are persistent, private, idempotent, and require approval',async()=>{
  const submit=await fetch(base+'/projects/submit',{method:'POST',headers:headers(),body:JSON.stringify({...basic,name:'Saved project',allowsFreeParticipation:false})});
  const {id}=await submit.json() as {id:string};
  const save=()=>fetch(base+`/saved-projects/${id}`,{method:'POST',headers:headers(),body:'{}'});
  expect((await save()).status).toBe(404);db.run("UPDATE projects SET status='approved' WHERE id=?",[id]);
  expect((await save()).status).toBe(200);expect((await save()).status).toBe(200);
  const read=async(session:string)=>(await(await fetch(base+'/saved-projects',{headers:headers(session)})).json()) as {id:string}[];
  expect((await read(owner)).map(p=>p.id)).toEqual([id]);expect(await read(reader)).toEqual([]);
  expect(db.query('SELECT COUNT(*) AS n FROM saved_projects WHERE user_id=? AND project_id=?').get('owner',id)).toEqual({n:1});
  expect((await fetch(base+`/saved-projects/${id}`,{method:'DELETE',headers:headers(reader)})).status).toBe(200);
  expect((await read(owner)).map(p=>p.id)).toEqual([id]);
  expect((await fetch(base+`/saved-projects/${id}`,{method:'DELETE',headers:headers()})).status).toBe(200);expect(await read(owner)).toEqual([]);
});

test('submission goes through the admin approval API before discovery and private saving',async()=>{
  db.run("INSERT INTO users(id,x_id,auth_method,x_handle,x_display_name,role,is_demo,created_at) VALUES('catalog-admin','catalog:admin','wallet','admin','Admin','admin',0,?)",[new Date().toISOString()]);
  const admin=createSession('catalog-admin','wallet');
  const submitted=await fetch(base+'/projects/submit',{method:'POST',headers:headers(),
    body:JSON.stringify({...basic,name:'Reviewed catalogue entry',allowsFreeParticipation:false})});
  expect(submitted.status).toBe(200);
  const {id}=await submitted.json() as {id:string};
  const discover=async()=>(await(await fetch(base+'/discover/projects')).json()) as {id:string}[];
  expect((await discover()).some(project=>project.id===id)).toBe(false);
  const approve=(session:string)=>fetch(base+`/projects/${id}/approve`,{method:'POST',headers:headers(session),body:'{}'});
  expect((await approve(owner)).status).toBe(403);
  expect((await approve(reader)).status).toBe(403);
  expect(db.query('SELECT status,approved_by FROM projects WHERE id=?').get(id)).toEqual({status:'pending',approved_by:null});
  const approved=await approve(admin);expect(approved.status).toBe(200);
  expect(await approved.json()).toMatchObject({id,status:'approved',allowsFreeParticipation:false});
  expect((await discover()).some(project=>project.id===id)).toBe(true);
  expect(db.query("SELECT admin_id,action FROM admin_logs WHERE target_id=? AND action='approve_project'").all(id))
    .toEqual([{admin_id:'catalog-admin',action:'approve_project'}]);
  expect((await fetch(base+`/saved-projects/${id}`,{method:'POST',headers:headers(reader),body:'{}'})).status).toBe(200);
  const readSaved=async(session:string)=>(await(await fetch(base+'/saved-projects',{headers:headers(session)})).json()) as {id:string}[];
  expect((await readSaved(reader)).map(project=>project.id)).toEqual([id]);
  expect(await readSaved(owner)).toEqual([]);
  expect((await fetch(base+`/saved-projects/${id}`,{method:'DELETE',headers:headers(reader)})).status).toBe(200);
  expect(await readSaved(reader)).toEqual([]);
});
