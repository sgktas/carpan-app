import {randomUUID} from 'node:crypto';
import type {Database} from 'bun:sqlite';
import {isAddress} from 'viem';
import {ARC_USDC, decimalRaw} from '../src/arc-wallet';
import type {ArcAlertDashboard, ArcAlertDraft, ArcAlertRule} from '../src/arc-alerts';
import {explorerGet,explorerAlertGet} from './arcExplorer';
import {explorerBudgetStatus} from './explorerBudget';
import {parseArcAsset,USDC_ASSET,type ArcAsset} from '../src/arc-assets';
import {normalizeWalletTransfer} from './arcWallet';

type RuleRow = {id:string;user_id:string;address:string;name:string;kind:string;direction:string;minimum:string;enabled:number;created_at:string;start_at:string;token:string;symbol:string;decimals:number};
type Monitor = {address:string;start_at:string;checkpoint:number;pending_head:number;cursor:string|null;last_checked_at:string|null;error:string|null};
type Page = {items:unknown[];next_page_params:Record<string,unknown>|null};
export function initAlertTables(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS arc_alert_rules(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,address TEXT NOT NULL,
    name TEXT NOT NULL,kind TEXT NOT NULL,direction TEXT NOT NULL,minimum TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,start_at TEXT NOT NULL,deleted_at TEXT)`);
  db.run('CREATE INDEX IF NOT EXISTS idx_alert_owner ON arc_alert_rules(user_id,deleted_at)');
  db.run(`CREATE TABLE IF NOT EXISTS arc_alert_monitors(address TEXT PRIMARY KEY,start_at TEXT NOT NULL,
    checkpoint INTEGER NOT NULL DEFAULT 0,pending_head INTEGER NOT NULL DEFAULT 0,cursor TEXT,last_checked_at TEXT,error TEXT)`);
  const monitorColumns=db.query('PRAGMA table_info(arc_alert_monitors)').all() as {name:string}[];
  if(!monitorColumns.some(column=>column.name==='last_attempt_at')){
    db.run('ALTER TABLE arc_alert_monitors ADD COLUMN last_attempt_at TEXT');
    db.run('UPDATE arc_alert_monitors SET last_attempt_at=last_checked_at');
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_alert_monitor_attempt ON arc_alert_monitors(last_attempt_at,address)');
  db.run('CREATE INDEX IF NOT EXISTS idx_alert_rules_monitor ON arc_alert_rules(address,enabled,deleted_at,kind)');
  db.run(`CREATE TABLE IF NOT EXISTS arc_alert_notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,rule_id TEXT NOT NULL,
    name TEXT NOT NULL,address TEXT NOT NULL,kind TEXT NOT NULL,event_key TEXT NOT NULL,hash TEXT NOT NULL,block INTEGER NOT NULL,
    timestamp TEXT NOT NULL,direction TEXT NOT NULL,raw TEXT,peer TEXT,read_at TEXT,UNIQUE(rule_id,event_key))`);
  for(const table of ['arc_alert_rules','arc_alert_notifications']){
    const columns=db.query(`PRAGMA table_info(${table})`).all() as {name:string}[];
    for(const [column,definition] of [['token',`TEXT NOT NULL DEFAULT '${ARC_USDC}'`],['symbol',"TEXT NOT NULL DEFAULT 'USDC'"],['decimals','INTEGER NOT NULL DEFAULT 6']])
      if(!columns.some(c=>c.name===column))db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.run('CREATE INDEX IF NOT EXISTS idx_alert_notifications_owner ON arc_alert_notifications(user_id,timestamp DESC)');
}
export function validateAlertDraft(value:unknown):ArcAlertDraft{
  const d=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
  if(typeof d.address!=='string'||!isAddress(d.address.trim()))throw new Error('Geçerli bir Arc adresi gir.');
  if(typeof d.name!=='string'||!d.name.trim()||d.name.trim().length>60||/[\x00-\x1f]/.test(d.name))throw new Error('Alarm adı 1–60 karakter olmalı.');
  if(!['usdc_transfer','token_transfer','deployment'].includes(String(d.kind)))throw new Error('Geçerli bir alarm türü seç.');
  if(!['all','in','out'].includes(String(d.direction)))throw new Error('Geçerli bir transfer yönü seç.');
  if(typeof d.minimum!=='string')throw new Error('Geçerli bir minimum tutar gir.');
  const minimum=d.kind==='deployment'?'0':d.minimum.trim();
  const token=d.kind==='deployment'?ARC_USDC:typeof d.token==='string'?d.token.trim().toLowerCase():ARC_USDC;
  if(!isAddress(token)||d.kind==='usdc_transfer'&&token!==ARC_USDC)throw new Error('Geçerli bir token kontratı seç.');
  decimalRaw(minimum,token===ARC_USDC?6:36);
  return {address:d.address.trim().toLowerCase(),name:d.name.trim(),kind:d.kind as ArcAlertDraft['kind'],
    direction:d.direction as ArcAlertDraft['direction'],minimum,token};
}
export function createAlertRule(db:Database,userId:string,value:unknown,now=new Date().toISOString(),verifiedAsset?:ArcAsset){
  const d=validateAlertDraft(value),id=randomUUID();
  const asset=d.kind==='deployment'||d.token===ARC_USDC?USDC_ASSET:verifiedAsset;
  if(!asset||asset.address!==d.token)throw new Error('Token bilgisi sunucuda doğrulanmalı.');
  decimalRaw(d.minimum,asset.decimals);
  db.transaction(()=>{
    const count=db.query('SELECT COUNT(*) AS n FROM arc_alert_rules WHERE user_id=? AND deleted_at IS NULL').get(userId) as {n:number};
    if(count.n>=20)throw new Error('En fazla 20 alarm kaydedilebilir.');
    db.run(`INSERT INTO arc_alert_rules(id,user_id,address,name,kind,direction,minimum,created_at,start_at,token,symbol,decimals) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,userId,d.address,d.name,d.kind,d.direction,d.minimum,now,now,asset.address,asset.symbol,asset.decimals]);
    if(d.kind!=='deployment')db.run('INSERT OR IGNORE INTO arc_alert_monitors(address,start_at) VALUES(?,?)',[d.address,now]);
  })();
  return id;
}
export function setAlertEnabled(db:Database,userId:string,id:string,enabled:boolean,now=new Date().toISOString()){
  return db.run(`UPDATE arc_alert_rules SET enabled=?,start_at=CASE WHEN enabled=0 AND ?=1 THEN ? ELSE start_at END
    WHERE id=? AND user_id=? AND deleted_at IS NULL`,[enabled?1:0,enabled?1:0,now,id,userId]).changes>0;
}
export function deleteAlertRule(db:Database,userId:string,id:string){
  return db.run('UPDATE arc_alert_rules SET enabled=0,deleted_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL',
    [new Date().toISOString(),id,userId]).changes>0;
}
export function alertDashboard(db:Database,userId:string):ArcAlertDashboard{
  const rows=db.query(`SELECT r.*,m.last_checked_at,m.error FROM arc_alert_rules r LEFT JOIN arc_alert_monitors m ON m.address=r.address
    WHERE r.user_id=? AND r.deleted_at IS NULL ORDER BY r.created_at DESC`).all(userId) as (RuleRow&{last_checked_at:string|null;error:string|null})[];
  const rules=rows.map(r=>({id:r.id,address:r.address,name:r.name,kind:r.kind,direction:r.direction,minimum:r.minimum,token:r.token,symbol:r.symbol,decimals:r.decimals,
    enabled:!!r.enabled,createdAt:r.created_at,lastCheckedAt:r.kind==='deployment'?null:r.last_checked_at,
    error:r.kind==='deployment'?null:r.error})) as ArcAlertRule[];
  const notifications=db.query(`SELECT id,rule_id AS ruleId,name,address,kind,hash,block,timestamp,direction,raw,peer,token,symbol,decimals,read_at AS readAt
    FROM arc_alert_notifications WHERE user_id=? ORDER BY timestamp DESC,id DESC LIMIT 100`).all(userId) as ArcAlertDashboard['notifications'];
  const unread=(db.query('SELECT COUNT(*) AS n FROM arc_alert_notifications WHERE user_id=? AND read_at IS NULL').get(userId) as {n:number}).n;
  return {rules,notifications,unread};
}
export function markAlertsRead(db:Database,userId:string){
  db.run('UPDATE arc_alert_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',[new Date().toISOString(),userId]);
}
function insertNotification(db:Database,r:RuleRow,e:{key:string;hash:string;block:number;timestamp:string;direction:string;raw:string|null;peer:string|null}){
  db.run(`INSERT OR IGNORE INTO arc_alert_notifications(id,user_id,rule_id,name,address,kind,event_key,hash,block,timestamp,direction,raw,peer,token,symbol,decimals)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[randomUUID(),r.user_id,r.id,r.name,r.address,r.kind,e.key,e.hash,e.block,e.timestamp,e.direction,e.raw,e.peer,r.token,r.symbol,r.decimals]);
}
const cursorKeys=new Set(['block_number','index','items_count','batch_block_hash','batch_transaction_hash','batch_log_index','index_in_batch']);
function transferPath(address:string,cursor:Record<string,unknown>|null){
  const params=new URLSearchParams({type:'ERC-20'});
  for(const [k,v] of Object.entries(cursor||{})){
    if(k==='type'&&v==='ERC-20')continue;
    if(v===null&&cursorKeys.has(k))continue;
    if(!cursorKeys.has(k)||!['number','string'].includes(typeof v)||String(v).length>100)throw new Error('Unsupported cursor');
    params.set(k,String(v));
  }
  return `/addresses/${address}/token-transfers?${params}`;
}
// Persist each provider page and its continuation together; restarts never lose a scanned page.
export async function scanAlertAddress(db:Database,address:string,loadPage:(path:string)=>Promise<Page>=explorerGet){
  let monitor=db.query('SELECT * FROM arc_alert_monitors WHERE address=?').get(address) as Monitor|null;
  if(!monitor)return;
  const rules=db.query(`SELECT * FROM arc_alert_rules WHERE address=? AND kind IN ('usdc_transfer','token_transfer') AND enabled=1 AND deleted_at IS NULL`)
    .all(address) as RuleRow[];
  if(!rules.length)return;
  for(let pages=0;pages<3;pages++){
    const cursor=monitor.cursor?JSON.parse(monitor.cursor):null;
    const page=await loadPage(transferPath(address,cursor));
    if(!Array.isArray(page.items)||!('next_page_params' in page))throw new Error('Invalid transfer page');
    // Validate before committing any notification or scan progress.
    if(page.next_page_params)transferPath(address,page.next_page_params);
    if(cursor&&page.next_page_params&&JSON.stringify(cursor)===JSON.stringify(page.next_page_params))throw new Error('Pagination did not advance');
    const transfers=page.items.map(v=>normalizeWalletTransfer(v,address)).filter(t=>t!==null);
    if(transfers.length!==page.items.length)throw new Error('Unverifiable transfer page');
    const head=Math.max(monitor.pending_head,...transfers.map(t=>t.block),0);
    const reached=transfers.some(t=>t.block<Math.max(0,monitor!.checkpoint-10)||!!t.timestamp&&t.timestamp<monitor!.start_at);
    const next=reached?null:page.next_page_params;
    const now=new Date().toISOString();
    db.transaction(()=>{
      const currentRules=db.query(`SELECT * FROM arc_alert_rules WHERE address=? AND kind IN ('usdc_transfer','token_transfer') AND enabled=1 AND deleted_at IS NULL`)
        .all(address) as RuleRow[];
      for(const t of transfers){
        if(!t.timestamp||t.direction==='self')continue;
        for(const r of currentRules){
          // Re-read pause/delete state in case it changed while the provider request was in flight.
          const active=db.query('SELECT enabled,deleted_at,start_at FROM arc_alert_rules WHERE id=?').get(r.id) as {enabled:number;deleted_at:string|null;start_at:string};
          if(!active?.enabled||active.deleted_at||t.timestamp<=active.start_at)continue;
          if(t.token===r.token&&t.decimals===r.decimals&&(r.direction==='all'||r.direction===t.direction)&&BigInt(t.raw)>=decimalRaw(r.minimum,r.decimals))
            insertNotification(db,r,{key:t.id,hash:t.hash,block:t.block,timestamp:t.timestamp,direction:t.direction,raw:t.raw,peer:t.direction==='in'?t.from:t.to});
        }
      }
      db.run(`UPDATE arc_alert_monitors SET checkpoint=?,pending_head=?,cursor=?,last_checked_at=?,error=NULL WHERE address=?`,
        [next?monitor!.checkpoint:Math.max(monitor!.checkpoint,head),next?head:0,next?JSON.stringify(next):null,now,address]);
    })();
    monitor=db.query('SELECT * FROM arc_alert_monitors WHERE address=?').get(address) as Monitor;
    if(!next)break;
  }
}
export function scanDeploymentAlerts(db:Database){
  const rules=db.query(`SELECT * FROM arc_alert_rules WHERE kind='deployment' AND enabled=1 AND deleted_at IS NULL`).all() as RuleRow[];
  for(const r of rules){
    const deployments=db.query(`SELECT d.* FROM arc_contract_deployments d WHERE d.chain_id=5042 AND d.deployer_address=? AND d.block_timestamp>?
      AND NOT EXISTS(SELECT 1 FROM arc_alert_notifications n WHERE n.rule_id=? AND n.event_key=d.contract_address)
      ORDER BY d.block_number ASC LIMIT 200`).all(r.address,r.start_at,r.id) as {contract_address:string;tx_hash:string;block_number:number;block_timestamp:string}[];
    db.transaction(()=>{for(const d of deployments)insertNotification(db,r,{key:d.contract_address,hash:d.tx_hash,block:d.block_number,
      timestamp:d.block_timestamp,direction:'deployment',raw:null,peer:d.contract_address});})();
  }
}
type AlertBudgetStatus=Pick<NonNullable<ReturnType<typeof explorerBudgetStatus>>,'mode'|'limit'|'available'|'cost'|'background_credits'>;
type AlertWorkerDependencies={clock?:()=>number;budget?:()=>AlertBudgetStatus|null;loadPage?:(path:string)=>Promise<Page>};
const activeTransferMonitor=`EXISTS(SELECT 1 FROM arc_alert_rules r WHERE r.address=m.address AND r.enabled=1
  AND r.deleted_at IS NULL AND r.kind IN ('usdc_transfer','token_transfer'))`;
/** Spread at most three provider pages per address across a quarter of the daily local allowance. */
export function alertPollingCadence(activeAddresses:number,status:AlertBudgetStatus|null){
  const requestCost=Math.max(30,status?.cost||20);
  if(!status||status.mode==='cached'||status.available<requestCost||status.background_credits+requestCost>status.limit*.75)
    return {enabled:false,intervalMs:600000};
  const fairInterval=Math.ceil(Math.max(1,activeAddresses)*3*requestCost*86400000/Math.max(requestCost,status.limit*.25));
  return {enabled:true,intervalMs:Math.max(status.mode==='saving'?900000:300000,fairInterval)};
}
/** One bounded round; attempts survive restarts, while last_checked_at means an actual successful fresh page. */
export async function runAlertWorkerTick(db:Database,dependencies:AlertWorkerDependencies={}){
  const clock=dependencies.clock||Date.now,budget=dependencies.budget||explorerBudgetStatus;
  const loadPage=dependencies.loadPage||((path:string)=>explorerAlertGet<Page>(path));
  scanDeploymentAlerts(db);
  const count=(db.query(`SELECT COUNT(*) AS n FROM arc_alert_monitors m WHERE ${activeTransferMonitor}`).get() as {n:number}).n;
  const policy=alertPollingCadence(count,budget());if(!count||!policy.enabled)return;
  const now=clock(),dueBefore=new Date(now-policy.intervalMs).toISOString();
  const monitors=db.query(`SELECT m.address FROM arc_alert_monitors m WHERE ${activeTransferMonitor}
    AND (m.last_attempt_at IS NULL OR m.last_attempt_at<=?)
    ORDER BY COALESCE(m.last_attempt_at,''),m.address LIMIT 10`).all(dueBefore) as {address:string}[];
  for(const m of monitors){
    if(!alertPollingCadence(count,budget()).enabled)break;
    // Record the attempt before I/O, so a failed request or service restart cannot create a tight retry loop.
    db.run('UPDATE arc_alert_monitors SET last_attempt_at=? WHERE address=?',[new Date(clock()).toISOString(),m.address]);
    try{await scanAlertAddress(db,m.address,loadPage);}
    catch{db.run('UPDATE arc_alert_monitors SET error=? WHERE address=?',
      ['Kaynak verisi alınamadı; tarama bütçe ve sıraya göre tekrar denenecek.',m.address]);}
  }
}
export function startAlertWorker(db:Database){
  let busy=false;
  const tick=async()=>{if(busy)return;busy=true;try{await runAlertWorkerTick(db);}
    catch{console.error('[arc-alerts] Tarama tamamlanamadı; sonraki döngüde tekrar denenecek.');}finally{busy=false;}};
  void tick();const timer=setInterval(()=>void tick(),30000);timer.unref();return ()=>clearInterval(timer);
}

export async function resolveAlertAsset(value:unknown,load:(path:string)=>Promise<Record<string,unknown>>=explorerGet):Promise<ArcAsset>{
 const draft=validateAlertDraft(value);
 if(draft.kind==='deployment'||draft.token===ARC_USDC)return USDC_ASSET;
 return parseArcAsset(draft.token!,await load(`/tokens/${draft.token}`));
}
