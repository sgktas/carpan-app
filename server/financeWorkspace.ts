import type {Database} from 'bun:sqlite';
import {FINANCE_CATEGORIES,type FinanceDecision} from '../src/arc-finance';
const walletPattern=/^0x[0-9a-f]{40}$/;
const idPattern=/^5042:0x[0-9a-f]{64}:(0|[1-9][0-9]{0,9}):0x3600000000000000000000000000000000000000$/;
export function initFinanceWorkspace(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS arc_finance_decisions (
    user_id TEXT NOT NULL, chain_id INTEGER NOT NULL CHECK(chain_id=5042),
    wallet TEXT NOT NULL, transfer_id TEXT NOT NULL, category TEXT NOT NULL,
    reference TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id,chain_id,wallet,transfer_id))`);
}
function wallet(value:string){const address=value.toLowerCase();if(!walletPattern.test(address))throw new Error('Geçerli bir Arc adresi gir.');return address;}
function transferId(value:unknown){if(typeof value!=='string'||!idPattern.test(value))throw new Error('Arc USDC işlem kimliği geçersiz.');return value;}
export function readFinanceDecisions(db:Database,userId:string,address:string,ids:unknown){
  const selected=wallet(address);
  if(!Array.isArray(ids)||ids.length>200)throw new Error('En fazla 200 işlem okunabilir.');
  const unique=[...new Set(ids.map(transferId))];
  const decisions:Record<string,FinanceDecision>={};
  const query=db.query('SELECT category,reference FROM arc_finance_decisions WHERE user_id=? AND chain_id=5042 AND wallet=? AND transfer_id=?');
  for(const id of unique){const row=query.get(userId,selected,id) as FinanceDecision|null;if(row)decisions[id]=row;}
  return {decisions};
}
export function saveFinanceDecision(db:Database,userId:string,address:string,body:unknown){
  const selected=wallet(address);
  const draft=body as {id?:unknown;category?:unknown;reference?:unknown}|null;
  const id=transferId(draft?.id);
  if(typeof draft?.category!=='string'||!Object.hasOwn(FINANCE_CATEGORIES,draft.category)||typeof draft.reference!=='string'||draft.reference.length>120)throw new Error('Kategori veya referans geçersiz.');
  // User annotations on a public research address are not ownership/payment proof.
  const decision={category:draft.category as FinanceDecision['category'],reference:draft.reference};
  db.query(`INSERT INTO arc_finance_decisions(user_id,chain_id,wallet,transfer_id,category,reference,updated_at)
    VALUES(?,5042,?,?,?,?,?) ON CONFLICT(user_id,chain_id,wallet,transfer_id)
    DO UPDATE SET category=excluded.category,reference=excluded.reference,updated_at=excluded.updated_at`)
    .run(userId,selected,id,decision.category,decision.reference,new Date().toISOString());
  return {id,...decision};
}
