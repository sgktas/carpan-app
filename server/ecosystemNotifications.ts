import {randomUUID,createHash} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import type {EcosystemUpdate,EcosystemNotificationInbox,EcosystemSubscription} from '../src/ecosystem';
import {ecosystemUpdates,researchUpdates} from './ecosystemInsights';

export function initEcosystemNotifications(db:Database){
 db.run(`CREATE TABLE IF NOT EXISTS ecosystem_update_versions(update_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,version TEXT NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL)`);
 db.run(`CREATE TABLE IF NOT EXISTS ecosystem_subscriptions(user_id TEXT NOT NULL,project_id TEXT NOT NULL,updates INTEGER NOT NULL DEFAULT 0,reminders INTEGER NOT NULL DEFAULT 0,enabled_at TEXT NOT NULL,PRIMARY KEY(user_id,project_id))`);
 db.run(`CREATE TABLE IF NOT EXISTS ecosystem_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,project_id TEXT NOT NULL,update_id TEXT NOT NULL,kind TEXT NOT NULL,event_key TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,UNIQUE(user_id,event_key))`);
 db.run('CREATE INDEX IF NOT EXISTS idx_ecosystem_notification_owner ON ecosystem_notifications(user_id,created_at DESC)');
 db.run('CREATE INDEX IF NOT EXISTS idx_ecosystem_subscription_project ON ecosystem_subscriptions(project_id,updates,reminders)');
}
function validateUpdate(u:EcosystemUpdate){
 if(!/^[-a-z0-9]{1,90}$/.test(u.id)||!/^eco_[a-z0-9]+$/.test(u.projectId)||!u.revision)throw Error('Invalid reviewed update identity.');
 const link=new URL(u.source.url);if(link.protocol!=='https:'||link.username||link.password)throw Error('Invalid reviewed source URL.');
 if(!u.title.en||!u.title.tr||!u.summary.en||!u.summary.tr||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(u.source.checkedAt))throw Error('Incomplete reviewed update.');
 if(u.schedule){const {start,end,precision,timeZone}=u.schedule;const a=Date.parse(start),b=Date.parse(end);if(!Number.isFinite(a)||!Number.isFinite(b)||a>b||!['instant','day','week'].includes(precision))throw Error('Invalid reviewed schedule.');new Intl.DateTimeFormat('en',{timeZone});if(precision==='instant'&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(end)))throw Error('Exact schedule requires UTC instants.');if(precision!=='instant'&&[start,end].some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d).toISOString().slice(0,10)!==d))throw Error('Invalid reviewed calendar day.');}
}
const versionOf=(u:EcosystemUpdate)=>createHash('sha256').update(JSON.stringify({...u,source:{title:u.source.title,url:u.source.url}})).digest('hex');
function notify(db:Database,userId:string,u:EcosystemUpdate,kind:'update'|'reminder',key:string,now:string){
 db.run(`INSERT OR IGNORE INTO ecosystem_notifications(id,user_id,project_id,update_id,kind,event_key,payload,created_at) VALUES(?,?,?,?,?,?,?,?)`,[randomUUID(),userId,u.projectId,u.id,kind,key,JSON.stringify(u),now]);
}
/** Only editor-reviewed source records are ingested. No unreviewed RSS or project claims. */
export function reconcileEcosystemUpdates(db:Database,updates=[...ecosystemUpdates,...researchUpdates],now=new Date().toISOString()){
 for(const u of updates)validateUpdate(u);
 if(new Set(updates.map(u=>u.id)).size!==updates.length)throw Error('Duplicate reviewed update.');
 return db.transaction(()=>{
  for(const u of updates){
   const version=versionOf(u),old=db.query('SELECT version FROM ecosystem_update_versions WHERE update_id=?').get(u.id) as {version:string}|null;
   if(old?.version!==version){
    const subscribers=db.query(`SELECT s.user_id FROM ecosystem_subscriptions s JOIN saved_projects p ON p.user_id=s.user_id AND p.project_id=s.project_id WHERE s.project_id=? AND s.updates=1 AND s.enabled_at<=?`).all(u.projectId,now) as {user_id:string}[];
    for(const sub of subscribers)notify(db,sub.user_id,u,'update',`${u.id}:${version}`,now);
    db.run(`INSERT INTO ecosystem_update_versions(update_id,project_id,version,payload,observed_at) VALUES(?,?,?,?,?) ON CONFLICT(update_id) DO UPDATE SET project_id=excluded.project_id,version=excluded.version,payload=excluded.payload,observed_at=excluded.observed_at`,[u.id,u.projectId,version,JSON.stringify(u),now]);
   }
   // Only exact source deadlines receive24hour reminders. Week/day windows have no invented hours.
   if(u.schedule?.precision==='instant'){
    const end=Date.parse(u.schedule.end),time=Date.parse(now);
    if(end>time&&end-time<=86_400_000){
     const subscribers=db.query(`SELECT s.user_id FROM ecosystem_subscriptions s JOIN saved_projects p ON p.user_id=s.user_id AND p.project_id=s.project_id WHERE s.project_id=? AND s.reminders=1 AND s.enabled_at<=?`).all(u.projectId,now) as {user_id:string}[];
     for(const sub of subscribers)notify(db,sub.user_id,u,'reminder',`${u.id}:deadline:${u.schedule.end}`,now);
    }
   }
  }
 })();
}
export function setEcosystemSubscription(db:Database,userId:string,projectId:string,value:unknown,now=new Date().toISOString()):EcosystemSubscription{
 const d=value as {updates?:unknown;reminders?:unknown}|null;
 if(!d||typeof d.updates!=='boolean'||typeof d.reminders!=='boolean')throw Error('Choose update and reminder preferences.');
 return db.transaction(()=>{
  if(!db.query('SELECT 1 FROM saved_projects WHERE user_id=? AND project_id=?').get(userId,projectId))throw Error('Save this project before enabling notifications.');
  // Each opt-in starts now. Existing source history is not replayed as new activity.
  db.run(`INSERT INTO ecosystem_subscriptions(user_id,project_id,updates,reminders,enabled_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET updates=excluded.updates,reminders=excluded.reminders,enabled_at=excluded.enabled_at`,[userId,projectId,d.updates?1:0,d.reminders?1:0,now]);
  return {projectId,updates:d.updates,reminders:d.reminders,enabledAt:now};
 })();
}
export function ecosystemInbox(db:Database,userId:string):EcosystemNotificationInbox{
 const subscriptions=(db.query(`SELECT s.project_id AS projectId,s.updates,s.reminders,s.enabled_at AS enabledAt FROM ecosystem_subscriptions s JOIN saved_projects p ON p.user_id=s.user_id AND p.project_id=s.project_id WHERE s.user_id=?`).all(userId) as {projectId:string;updates:number;reminders:number;enabledAt:string}[]).map(s=>({...s,updates:!!s.updates,reminders:!!s.reminders}));
 const rows=db.query(`SELECT id,project_id AS projectId,kind,payload,created_at AS createdAt,read_at AS readAt FROM ecosystem_notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 100`).all(userId) as {id:string;projectId:string;kind:'update'|'reminder';payload:string;createdAt:string;readAt:string|null}[];
 const notifications=rows.map(({payload,...n})=>({...n,update:JSON.parse(payload) as EcosystemUpdate}));
 const unread=(db.query('SELECT COUNT(*) AS n FROM ecosystem_notifications WHERE user_id=? AND read_at IS NULL').get(userId) as {n:number}).n;
 return {subscriptions,notifications,unread};
}
export function markEcosystemRead(db:Database,userId:string,id:string,now=new Date().toISOString()){
 return db.run('UPDATE ecosystem_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',[now,id,userId]).changes>0;
}
export function startEcosystemUpdateWorker(db:Database){
 reconcileEcosystemUpdates(db);
 const timer=setInterval(()=>{try{reconcileEcosystemUpdates(db);}catch{console.error('[Ecosystem] Reviewed update reconciliation failed.');}},60_000);timer.unref();return()=>clearInterval(timer);
}
