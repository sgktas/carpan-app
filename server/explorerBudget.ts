import type {Database} from 'bun:sqlite';

type Usage={day:string;pro_calls:number;credits:number;public_calls:number;cache_hits:number;errors:number;remaining:number|null;background_credits:number};
export type ExplorerPurpose='research'|'discovery'|'alerts'|'finance_history'|'arc_enrichment';
type Breakdown={purpose:ExplorerPurpose;endpoint:string;pro_calls:number;estimated_credits:number;cache_hits:number;errors:number};
/** Only endpoint classes are recorded: no wallet, query, credential or user identity. */
export function explorerEndpoint(primary:string){const url=new URL(primary);return url.pathname.replace(/^\/\d+\/api\/v2\/?/,'').replace(/^\/api\/v2\/?/,'').split('/').filter(Boolean).map(part=>/^0x[0-9a-f]+$/i.test(part)||/^\d+$/.test(part)?':id':part).join('/').slice(0,120);}
// Blockscout developer portal's API call costs, checked 2026-10-12.
export function explorerRequestCost(primary:string,standard=20){
 const endpoint=explorerEndpoint(primary),costs:Record<string,number>={
  'addresses/:id/coin-balance-history':50,'addresses/:id/internal-transactions':40,'addresses/:id/logs':30,'addresses/:id/token-transfers':30,
  'advanced-filters':50,'search/quick':25,'smart-contracts/verification/config':40,'tokens':30,'tokens/:id/transfers':30,
  'transactions/:id/internal-transactions':40,'transactions/:id/logs':30,'transactions/:id/raw-trace':50,'transactions/:id/state-changes':30,'transactions/:id/summary':50,'transactions/:id/token-transfers':30,
 };
 return Math.max(standard,costs[endpoint]||20);
}
export class ExplorerBudget{
 constructor(private db:Database,readonly limit=80000,readonly reserve=20000,readonly cost=20,private clock=()=>Date.now()){
  db.exec(`CREATE TABLE IF NOT EXISTS explorer_api_usage(day TEXT PRIMARY KEY,pro_calls INTEGER NOT NULL DEFAULT 0,credits INTEGER NOT NULL DEFAULT 0,public_calls INTEGER NOT NULL DEFAULT 0,cache_hits INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,remaining INTEGER,background_credits INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS explorer_response_cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL,source TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS explorer_budget_meta(name TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS explorer_plan_restrictions(chain TEXT PRIMARY KEY,error TEXT NOT NULL,checked_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS explorer_usage_breakdown(day TEXT NOT NULL,purpose TEXT NOT NULL,endpoint TEXT NOT NULL,pro_calls INTEGER NOT NULL DEFAULT 0,estimated_credits INTEGER NOT NULL DEFAULT 0,cache_hits INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,purpose,endpoint));`);
  db.query("INSERT OR IGNORE INTO explorer_budget_meta(name,value) VALUES('attribution_since',?)").run(new Date(this.clock()).toISOString());
  // Version 1 inferred zero credits from every HTTP 402, including paid-chain restrictions.
  if(!db.query("SELECT value FROM explorer_budget_meta WHERE name='402-fix'").get())db.transaction(()=>{
   db.exec('UPDATE explorer_api_usage SET remaining=NULL WHERE remaining=0');
   db.exec("INSERT INTO explorer_budget_meta VALUES('402-fix','applied')");
  })();
 }
 private day(){return new Date(this.clock()).toISOString().slice(0,10);}
 status(){this.db.query('INSERT OR IGNORE INTO explorer_api_usage(day) VALUES(?)').run(this.day());const u=this.db.query('SELECT * FROM explorer_api_usage WHERE day=?').get(this.day()) as Usage;
  const available=Math.max(0,Math.min(this.limit-u.credits,u.remaining===null?this.limit: u.remaining-this.reserve));
  const breakdown=this.db.query('SELECT purpose,endpoint,pro_calls,estimated_credits,cache_hits,errors FROM explorer_usage_breakdown WHERE day=? ORDER BY estimated_credits DESC,purpose,endpoint').all(u.day) as Breakdown[];
  const trackingSince=(this.db.query("SELECT value FROM explorer_budget_meta WHERE name='attribution_since'").get() as {value:string}).value;
  return {...u,limit:this.limit,reserve:this.reserve,cost:this.cost,available,mode:available<this.cost?'cached':available<this.limit*.25?'saving':'normal',resetAt:new Date(Date.parse(this.day())+86400000).toISOString(),accountRemainingObserved:u.remaining!==null,breakdown,trackingSince,unattributedProCalls:Math.max(0,u.pro_calls-breakdown.reduce((sum,r)=>sum+r.pro_calls,0)),providerResetAt:null};
 }
 private detail(purpose:ExplorerPurpose,endpoint:string,field:'pro_calls'|'cache_hits'|'errors',credits=0){this.db.query(`INSERT INTO explorer_usage_breakdown(day,purpose,endpoint,${field},estimated_credits) VALUES(?,?,?,?,?) ON CONFLICT(day,purpose,endpoint) DO UPDATE SET ${field}=${field}+1,estimated_credits=estimated_credits+excluded.estimated_credits`).run(this.day(),purpose,endpoint,1,credits);}
 take(background=false,cost=this.cost,purpose?:ExplorerPurpose,endpoint='unknown'){return this.db.transaction(()=>{const s=this.status();if(!Number.isSafeInteger(cost)||cost<=0||s.available<cost||(background&&s.background_credits+cost>this.limit*.75))return false;
  this.db.query('UPDATE explorer_api_usage SET pro_calls=pro_calls+1,credits=credits+?,background_credits=background_credits+?,remaining=CASE WHEN remaining IS NULL THEN NULL ELSE MAX(0,remaining-?) END WHERE day=?').run(cost,background?cost:0,cost,s.day);if(purpose)this.detail(purpose,endpoint,'pro_calls',cost);return true;
 })();}
 observe(response:Response,purpose?:ExplorerPurpose,endpoint='unknown'){const raw=response.headers.get('x-credits-remaining'),n=raw!==null&&/^\d+$/.test(raw)?Number(raw):null;const remaining=n;
  if(remaining!==null&&Number.isSafeInteger(remaining)){this.status();this.db.query('UPDATE explorer_api_usage SET remaining=CASE WHEN remaining IS NULL THEN ? ELSE MIN(remaining,?) END WHERE day=?').run(remaining,remaining,this.day());}
  if(!response.ok)this.bump('errors',purpose,endpoint);
 }
 exhausted(){this.status();this.db.query('UPDATE explorer_api_usage SET remaining=0 WHERE day=?').run(this.day());}
 restrict(chain:string,error:string){this.db.query('INSERT INTO explorer_plan_restrictions VALUES(?,?,?) ON CONFLICT(chain) DO UPDATE SET error=excluded.error,checked_at=excluded.checked_at').run(chain,error.slice(0,500),this.clock());}
 restriction(chain:string){return (this.db.query('SELECT error FROM explorer_plan_restrictions WHERE chain=? AND checked_at>?').get(chain,this.clock()-3600000) as {error:string}|null)?.error||null;}
 bump(field:'public_calls'|'cache_hits'|'errors',purpose?:ExplorerPurpose,endpoint='unknown'){this.status();this.db.query(`UPDATE explorer_api_usage SET ${field}=${field}+1 WHERE day=?`).run(this.day());if(purpose&&field!=='public_calls')this.detail(purpose,endpoint,field);}
 read(key:string,maxAge:number,purpose?:ExplorerPurpose,endpoint='unknown'){const row=this.db.query('SELECT * FROM explorer_response_cache WHERE cache_key=?').get(key) as {payload:string;fetched_at:number;source:string}|null;if(!row||this.clock()-row.fetched_at>maxAge)return null;try{this.bump('cache_hits',purpose,endpoint);return {payload:JSON.parse(row.payload),fetchedAt:row.fetched_at,source:row.source};}catch{return null;}}
 write(key:string,payload:unknown,source:string){const value=JSON.stringify(payload);if(value.length>2000000)return;this.db.query('INSERT INTO explorer_response_cache VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,source=excluded.source').run(key,value,this.clock(),source);this.db.query('DELETE FROM explorer_response_cache WHERE fetched_at<?').run(this.clock()-86400000);this.db.exec('DELETE FROM explorer_response_cache WHERE cache_key IN (SELECT cache_key FROM explorer_response_cache ORDER BY fetched_at DESC LIMIT -1 OFFSET 1000)');}
}
let budget:ExplorerBudget|null=null;
const positive=(s:string|undefined,fallback:number)=>s&&/^\d+$/.test(s)&&Number.isSafeInteger(Number(s))&&Number(s)>0?Number(s):fallback;
export function initExplorerBudget(db:Database){budget=new ExplorerBudget(db,positive(process.env.BLOCKSCOUT_DAILY_CREDIT_BUDGET,80000),positive(process.env.BLOCKSCOUT_CREDIT_RESERVE,20000),positive(process.env.BLOCKSCOUT_ESTIMATED_REQUEST_CREDITS,20));return budget;}
export function explorerBudgetStatus(){return budget?.status()||null;}
export function discoveryPolicy(){const s=budget?.status();const mode=s?.mode||'cached';return {mode,arcMs:mode==='normal'?60000:mode==='saving'?180000:600000,otherMs:mode==='normal'?300000:mode==='saving'?900000:1800000,pollMs:mode==='normal'?60000:mode==='saving'?180000:600000};}
export function cacheHit(){budget?.bump('cache_hits');}
let queue=Promise.resolve(),lastStart=0,cooldown=0;
async function pace(){let release!:()=>void;const old=queue;queue=new Promise<void>(r=>release=r);await old;const wait=Math.max(0,lastStart+400-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));lastStart=Date.now();release();}
const headers={Accept:'application/json','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; tr-TR) PowerShell/7.6.5'};
async function performRequest(primary:string,publicUrl:string,key:string|undefined,ttl=60000,background=false,allowStale=true,purpose:ExplorerPurpose=background?'discovery':'research'){
 const endpoint=explorerEndpoint(primary),cost=explorerRequestCost(primary,budget?.cost||20);
 const saved=budget?.read(publicUrl,ttl,purpose,endpoint);if(saved)return {...saved,cached:true};
 const stale=()=>{const old=allowStale?budget?.read(publicUrl,86400000,purpose,endpoint):null;if(old)return {...old,source:`${old.source} · kayıtlı veri`,cached:true};throw new Error('API bütçesi korunuyor; bu sorgunun kayıtlı verisi yok. Daha sonra yeniden dene.');};
 await pace();
 const isPro=new URL(primary).origin==='https://api.blockscout.com';
 const chain=new URL(primary).pathname.split('/')[1];
 const restricted=isPro?budget?.restriction(chain):null;
 if(restricted)throw new Error(restricted);
 const usePro=isPro&&!!key&&Date.now()>cooldown&&!!budget?.take(background,cost,purpose,endpoint);
 // Exhausted budgets serve stored results. Public fallback is only for a failed authorized request.
 if(isPro&&!usePro)return stale();
 const call=async(url:string,pro:boolean)=>{if(!pro)budget?.bump('public_calls');let response:Response;try{response=await fetch(url,{headers:{...headers,...(pro?{Authorization:`Bearer ${key}`}:{})},signal:AbortSignal.timeout(12000),redirect:'error'});}catch(e){budget?.bump('errors',purpose,endpoint);throw e;}if(pro)budget?.observe(response,purpose,endpoint);else if(!response.ok)budget?.bump('errors',purpose,endpoint);return response;};
 let response:Response;let source=usePro?'Blockscout PRO':'Blockscout Explorer';
 try{response=await call(isPro?(usePro?primary:publicUrl):primary,usePro);}catch(e){if(!usePro)throw e;await pace();response=await call(publicUrl,false);source='Blockscout Explorer · PRO kaynağı alınamadı';}
 if(usePro&&response.status===402){
  let message='';try{const body=await response.clone().json();message=String(body.error||body.message||'');}catch{}
  if(/featured chain|requires.*plans?|plan.*required/i.test(message)){
   const reason=`Bu ağ mevcut Blockscout planında kullanılamıyor: ${message}`;budget?.restrict(chain,reason);throw new Error(reason);
  }
  if(/^(out of credits|credits exhausted|insufficient credits|not enough credits)[.!]?$/i.test(message)){budget?.exhausted();return stale();}
  // An unclassified 402 is not evidence of an empty account, and is not bypassed.
  throw new Error(`Blockscout erişim kısıtı (HTTP 402): ${message||'Nedeni belirtilmedi'}`);
 }
 if(usePro&&(response.status===429||response.status>=500)){if(response.status===429)cooldown=Date.now()+60000;await pace();response=await call(publicUrl,false);source='Blockscout Explorer · PRO kaynağı alınamadı';}
 if(!response.ok){const old=allowStale?budget?.read(publicUrl,86400000,purpose,endpoint):null;if(old)return {...old,source:`${old.source} · kayıtlı veri (kaynak hatası)`,cached:true};throw new Error(`Veri kaynağı şu anda yanıt vermiyor (HTTP ${response.status}).`);}
 const payload=await response.json(),fetchedAt=Date.now();budget?.write(publicUrl,payload,source);return {payload,source,fetchedAt,cached:false};
}

const pending=new Map<string,Promise<Awaited<ReturnType<typeof performRequest>>>>();
export function explorerRequest(primary:string,publicUrl:string,key:string|undefined,ttl=60000,background=false,allowStale=true,purpose:ExplorerPurpose=background?'discovery':'research'){
 const id=JSON.stringify([publicUrl,ttl,background,allowStale]);const old=pending.get(id);if(old){budget?.bump('cache_hits',purpose,explorerEndpoint(primary));return old;}
 const value=performRequest(primary,publicUrl,key,ttl,background,allowStale,purpose).finally(()=>pending.delete(id));pending.set(id,value);return value;
}
