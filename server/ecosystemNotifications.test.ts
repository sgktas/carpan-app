import {afterAll,beforeEach,expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import express from 'express';
import {initEcosystemNotifications,reconcileEcosystemUpdates,setEcosystemSubscription,ecosystemInbox,markEcosystemRead} from './ecosystemNotifications';
import {ecosystemUpdates,researchUpdates,projectInsights,updateFeed} from './ecosystemInsights';
import {curatedEcosystem} from './ecosystemCatalog';
import {createEcosystemUpdateRoutes} from './ecosystemUpdateRoutes';
import {createAuthRequestGuard} from './authRequestGuard';
import {scheduleState} from '../src/ecosystem-updates';
import type {EcosystemUpdate} from '../src/ecosystem';
import type {AuthRequest} from './auth';
const db=new Database(':memory:');
db.run('CREATE TABLE saved_projects(user_id TEXT,project_id TEXT,created_at TEXT,PRIMARY KEY(user_id,project_id))');
initEcosystemNotifications(db);
const initial='2026-10-10T00:00:00.000Z',enabled='2026-10-10T00:01:00.000Z',changed='2026-10-10T00:02:00.000Z';
const event:EcosystemUpdate={...ecosystemUpdates[0],id:'test-deadline',schedule:{start:'2026-10-09T00:00:00Z',end:'2026-10-11T12:00:00Z',precision:'instant',timeZone:'UTC'}};
const save=(user:string)=>db.run('INSERT OR IGNORE INTO saved_projects VALUES(?,?,?)',[user,'eco_arc',initial]);
reconcileEcosystemUpdates(db,[event],initial);
beforeEach(()=>{for(const table of ['ecosystem_notifications','ecosystem_subscriptions','ecosystem_update_versions','saved_projects'])db.run(`DELETE FROM ${table}`);reconcileEcosystemUpdates(db,[event],initial);});
let server:ReturnType<ReturnType<typeof express>['listen']>;
afterAll(async()=>{if(server?.listening)await new Promise<void>(r=>server.close(()=>r()));db.close();});

test('every reviewed profile has bounded funding context and primary development evidence',()=>{
 expect(curatedEcosystem).toHaveLength(14);
 for(const p of curatedEcosystem){const r=projectInsights(p.id)!;expect(r.checkedAt).toBe('2026-10-10');expect(r.milestones.length).toBeGreaterThan(0);expect(r.funding.summary.en).toBeTruthy();expect(r.funding.summary.tr).toBeTruthy();for(const m of r.milestones)expect(new URL(m.source.url).protocol).toBe('https:');}
 expect(projectInsights('eco_alchemy')!.funding.rounds[0]).toMatchObject({amountUsd:250_000_000,announcedAt:'2021-10-28'});
 expect(projectInsights('eco_cctp')!.funding).toMatchObject({status:'parent',parentId:'eco_circle',rounds:[]});
 expect(projectInsights('eco_goldsky')!.funding).toMatchObject({status:'not-confirmed',rounds:[]});
 expect(curatedEcosystem.find(p=>p.id==='eco_extended')).toMatchObject({stage:'announced',addresses:[]});
 expect(updateFeed(true).updates).toEqual([]);
});

test('schedule classification expires exact deadlines and preserves week/day precision',()=>{
 expect(scheduleState(event,Date.parse('2026-10-08'))).toBe('upcoming');
 expect(scheduleState(event,Date.parse(initial))).toBe('active');
 expect(scheduleState(event,Date.parse(event.schedule!.end))).toBe('past');
 const week=ecosystemUpdates.find(u=>u.schedule?.precision==='week')!;
 expect(scheduleState(week,Date.parse('2026-10-25T23:59:59Z'))).toBe('active');expect(scheduleState(week,Date.parse('2026-10-26T00:00:00Z'))).toBe('past');
 expect(scheduleState({...event,schedule:null})).toBe('undated');
});

test('all project research revisions ingest alongside upcoming events without enabling existing saved-project users',()=>{
 save('existing-reader');reconcileEcosystemUpdates(db,undefined,initial);
 expect(researchUpdates).toHaveLength(14);expect(new Set(researchUpdates.map(u=>u.projectId)).size).toBe(14);
 expect((db.query('SELECT count(*) AS n FROM ecosystem_update_versions').get() as {n:number}).n).toBe(18);
 expect(ecosystemInbox(db,'existing-reader')).toMatchObject({subscriptions:[],notifications:[],unread:0});
});

test('explicit opt-in avoids backfill, deduplicates changes and isolates users and read state',()=>{
 save('reader-a');save('reader-b');expect(ecosystemInbox(db,'reader-a')).toMatchObject({subscriptions:[],notifications:[],unread:0});
 expect(()=>setEcosystemSubscription(db,'unsaved','eco_arc',{updates:true,reminders:true},enabled)).toThrow();
 expect(()=>setEcosystemSubscription(db,'reader-a','eco_arc',{updates:'true',reminders:false},enabled)).toThrow();
 setEcosystemSubscription(db,'reader-a','eco_arc',{updates:true,reminders:false},enabled);
 reconcileEcosystemUpdates(db,[event],changed);expect(ecosystemInbox(db,'reader-a').unread).toBe(0);
 const revision={...event,revision:'2',title:{en:'New deadline evidence',tr:'Yeni son tarih kanıtı'}};
 reconcileEcosystemUpdates(db,[revision],changed);reconcileEcosystemUpdates(db,[revision],changed);
 const own=ecosystemInbox(db,'reader-a');expect(own.unread).toBe(1);expect(own.notifications[0].update.title.en).toBe('New deadline evidence');expect(ecosystemInbox(db,'reader-b').notifications).toEqual([]);
 expect(markEcosystemRead(db,'reader-b',own.notifications[0].id,changed)).toBe(false);expect(ecosystemInbox(db,'reader-a').unread).toBe(1);
 expect(markEcosystemRead(db,'reader-a',own.notifications[0].id,changed)).toBe(true);expect(ecosystemInbox(db,'reader-a').unread).toBe(0);
 reconcileEcosystemUpdates(db,[{...revision,source:{...revision.source,checkedAt:'2026-10-11'}}],changed);expect(ecosystemInbox(db,'reader-a').notifications).toHaveLength(1);
 initEcosystemNotifications(db);expect(ecosystemInbox(db,'reader-a').notifications).toHaveLength(1);
});

test('deadline reminders require explicit opt-in, occur once within24h and stop after the deadline or unsave',()=>{
 save('reminder');setEcosystemSubscription(db,'reminder','eco_arc',{updates:false,reminders:true},enabled);
 reconcileEcosystemUpdates(db,[event],initial);expect(ecosystemInbox(db,'reminder').unread).toBe(0);
 reconcileEcosystemUpdates(db,[event],'2026-10-10T13:00:00.000Z');reconcileEcosystemUpdates(db,[event],'2026-10-10T14:00:00.000Z');
 expect(ecosystemInbox(db,'reminder').notifications).toHaveLength(1);expect(ecosystemInbox(db,'reminder').notifications[0].kind).toBe('reminder');
 save('late');setEcosystemSubscription(db,'late','eco_arc',{updates:false,reminders:true},enabled);reconcileEcosystemUpdates(db,[event],'2026-10-11T12:00:00.000Z');expect(ecosystemInbox(db,'late').unread).toBe(0);
 db.run('DELETE FROM saved_projects WHERE user_id=?',['reminder']);reconcileEcosystemUpdates(db,[{...event,revision:'again'}],changed);expect(ecosystemInbox(db,'reminder').notifications).toHaveLength(1);
 save('day');setEcosystemSubscription(db,'day','eco_arc',{updates:false,reminders:true},enabled);reconcileEcosystemUpdates(db,[{...event,id:'day-only',schedule:{start:'2026-10-09',end:'2026-10-11',precision:'day',timeZone:'UTC'}}],'2026-10-10T20:00:00.000Z');expect(ecosystemInbox(db,'day').notifications).toEqual([]);
});

test('malformed reviewed schedules and URLs reject atomically before source or notification writes',()=>{
 const bad=[{...event,source:{...event.source,url:'javascript:alert(1)'}},{...event,schedule:{start:'2026-10-09',end:'2026-02-31',precision:'day',timeZone:'UTC'}},{...event,schedule:{...event.schedule!,timeZone:'Invalid/Zone'}}] as EcosystemUpdate[];
 const before=(db.query('SELECT count(*) AS n FROM ecosystem_update_versions').get() as {n:number}).n;
 for(const u of bad)expect(()=>reconcileEcosystemUpdates(db,[{...event,id:'must-not-write'},u],changed)).toThrow();
 expect(()=>reconcileEcosystemUpdates(db,[event,event],changed)).toThrow();expect((db.query('SELECT count(*) AS n FROM ecosystem_update_versions').get() as {n:number}).n).toBe(before);
});

test('notification HTTP routes enforce authentication, origin, private caching, exact preferences and demo isolation',async()=>{
 save('reader-a');setEcosystemSubscription(db,'reader-a','eco_arc',{updates:true,reminders:false},enabled);reconcileEcosystemUpdates(db,[{...event,revision:'http-2'}],changed);
 const app=express();app.use(express.json());app.use('/ecosystem/notifications',createAuthRequestGuard('https://carpan.app',()=>{}));
 const auth:express.RequestHandler=(req:AuthRequest,res,next)=>{const owner=req.get('x-test-owner');if(!owner)return void res.status(401).json({error:'Unauthenticated'});req.userId=owner;next();};
 app.use('/ecosystem',createEcosystemUpdateRoutes(db,false,auth));app.use('/fixture',createEcosystemUpdateRoutes(db,true,auth));
 server=app.listen(0);await new Promise<void>(r=>server.once('listening',r));const info=server.address();if(!info||typeof info==='string')throw Error('Port missing');const base=`http://127.0.0.1:${info.port}`;
 expect((await fetch(base+'/ecosystem/notifications')).status).toBe(401);
 const headers={'content-type':'application/json','x-test-owner':'reader-a',origin:'https://carpan.app'};
 const read=await fetch(base+'/ecosystem/notifications',{headers});expect(read.headers.get('cache-control')).toBe('private, no-store');expect((await read.json()).notifications).toHaveLength(1);
 expect((await fetch(base+'/ecosystem/notifications/subscriptions/eco_arc',{method:'PUT',headers:{...headers,origin:'https://evil.example'},body:JSON.stringify({updates:true,reminders:true})})).status).toBe(403);
 expect((await fetch(base+'/ecosystem/notifications/subscriptions/eco_arc',{method:'PUT',headers,body:JSON.stringify({updates:false,reminders:false})})).status).toBe(200);
 expect((await fetch(base+'/ecosystem/notifications/subscriptions/eco_unknown',{method:'PUT',headers,body:'{}'})).status).toBe(404);
 expect((await fetch(base+'/fixture/updates')).status).toBe(200);expect((await(await fetch(base+'/fixture/updates')).json()).updates).toEqual([]);
 expect((await(await fetch(base+'/fixture/notifications',{headers})).json()).notifications).toEqual([]);
});
