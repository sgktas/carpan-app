import type {Database} from 'bun:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {collectionAmount,collectionState,type CollectionProof,type CollectionRequest,type PublicCollection,type CollectionAudit,type CollectionAuditPage} from '../src/collections';
import {ARC_USDC} from '../src/arc-wallet';
export function initCollections(db:Database){
  db.run(`CREATE TABLE IF NOT EXISTS arc_collection_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,share_token TEXT NOT NULL UNIQUE,reference TEXT NOT NULL,customer TEXT NOT NULL,invoice TEXT NOT NULL,recipient TEXT NOT NULL,payer TEXT NOT NULL,expected_raw6 TEXT NOT NULL,due TEXT NOT NULL,created_at TEXT NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0)`);
  db.run('CREATE INDEX IF NOT EXISTS arc_collection_owner ON arc_collection_requests(user_id)');
  db.run(`CREATE TABLE IF NOT EXISTS arc_collection_proofs(user_id TEXT NOT NULL,request_id TEXT NOT NULL,hash TEXT NOT NULL,log_index INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(user_id,hash,log_index))`);
  db.run(`CREATE TABLE IF NOT EXISTS arc_collection_audit(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,request_id TEXT NOT NULL,hash TEXT NOT NULL,log_index INTEGER NOT NULL,action TEXT NOT NULL,previous_decision TEXT,actor_id TEXT NOT NULL,recorded_at TEXT NOT NULL,proof_json TEXT)`);
  db.run('CREATE INDEX IF NOT EXISTS arc_collection_audit_owner ON arc_collection_audit(user_id,request_id,recorded_at)');
  db.run(`CREATE TRIGGER IF NOT EXISTS arc_collection_audit_no_update BEFORE UPDATE ON arc_collection_audit BEGIN SELECT RAISE(ABORT,'Collection decision history is append-only'); END`);
}
function recordAudit(db:Database,userId:string,requestId:string,action:CollectionAudit['action'],proof:CollectionProof|null,previousDecision:string|null){
  db.run('INSERT INTO arc_collection_audit(id,user_id,request_id,hash,log_index,action,previous_decision,actor_id,recorded_at,proof_json) VALUES(?,?,?,?,?,?,?,?,?,?)',[randomUUID(),userId,requestId,proof?.hash||'',proof?.logIndex??-1,action,previousDecision,userId,new Date().toISOString(),proof?JSON.stringify(proof):null]);
}
export function collectionAudit(db:Database,userId:string,id:string,before:unknown=''):CollectionAuditPage{
  own(db,userId,id);
  if(typeof before!=='string'||before&&!/^[1-9][0-9]{0,14}$/.test(before))throw new Error('Karar geçmişi sayfası geçersiz.');
  const rows=db.query('SELECT rowid AS cursor,id,request_id,hash,log_index,action,previous_decision,actor_id,recorded_at,proof_json FROM arc_collection_audit WHERE user_id=? AND request_id=? AND rowid<? ORDER BY rowid DESC LIMIT 51').all(userId,id,before?Number(before):Number.MAX_SAFE_INTEGER) as {cursor:number;id:string;request_id:string;hash:string;log_index:number;action:CollectionAudit['action'];previous_decision:string|null;actor_id:string;recorded_at:string;proof_json:string|null}[];
  const page=rows.slice(0,50);
  return {items:page.reverse().map(row=>({id:row.id,requestId:row.request_id,hash:row.hash,logIndex:row.log_index,action:row.action,previousDecision:row.previous_decision,actorId:row.actor_id,recordedAt:row.recorded_at,proof:row.proof_json?JSON.parse(row.proof_json):null})),nextCursor:rows.length>50?String(rows[49].cursor):null};
}
type Row={id:string;user_id:string;share_token:string;reference:string;customer:string;invoice:string;recipient:string;payer:string;expected_raw6:string;due:string;created_at:string;cancelled:number};
function own(db:Database,userId:string,id:string):Row{const row=db.query('SELECT * FROM arc_collection_requests WHERE user_id=? AND id=?').get(userId,id) as Row|null;if(!row)throw new Error('Tahsilat talebi bulunamadı.');return row;}
function map(db:Database,row:Row,includeAudit=true):CollectionRequest{
  const proofs=(db.query('SELECT data FROM arc_collection_proofs WHERE user_id=? AND request_id=? ORDER BY hash,log_index').all(row.user_id,row.id) as {data:string}[]).map(p=>JSON.parse(p.data) as CollectionProof);
  const request={id:row.id,shareToken:row.share_token,reference:row.reference,customer:row.customer,invoice:row.invoice,recipient:row.recipient,payer:row.payer,expectedRaw6:row.expected_raw6,due:row.due,createdAt:row.created_at,cancelled:!!row.cancelled,proofs};const audit=includeAudit?collectionAudit(db,row.user_id,row.id):null;return {...request,...collectionState(request),...(audit?{audit:audit.items,auditCursor:audit.nextCursor}:{})};
}
export function getCollection(db:Database,userId:string,id:string){return map(db,own(db,userId,id));}
export function listCollections(db:Database,userId:string){return (db.query('SELECT * FROM arc_collection_requests WHERE user_id=? ORDER BY created_at DESC').all(userId) as Row[]).map(row=>map(db,row,false));}
function field(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||/[\x00-\x1f]/.test(value)||(required&&!value.trim()))throw new Error('Müşteri ve referans alanlarını kontrol et.');return value.trim();}
export function createCollection(db:Database,userId:string,body:unknown):CollectionRequest{
  const owner=db.query('SELECT wallet_address,wallet_verified_at FROM users WHERE id=?').get(userId) as {wallet_address:string|null;wallet_verified_at:string|null}|null;
  if(!owner?.wallet_verified_at||!owner.wallet_address||!/^0x[0-9a-f]{40}$/i.test(owner.wallet_address))throw new Error('Önce hesabına doğrulanmış cüzdan bağla.');
  const draft=body as Record<string,unknown>|null;if(!draft)throw new Error('Talep bilgileri gerekli.');
  const customer=field(draft.customer,100,true),invoice=field(draft.invoice,100),payer=field(draft.payer,42).toLowerCase(),due=field(draft.due,10),amount=collectionAmount(draft.amount);
  if(payer&&(!/^0x[0-9a-f]{40}$/.test(payer)||payer==='0x'+'0'.repeat(40)||payer===owner.wallet_address.toLowerCase()))throw new Error('Müşteri cüzdanı geçersiz.');
  if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw new Error('Geçerli bir vade tarihi gir.');
  const count=db.query('SELECT count(*) AS n FROM arc_collection_requests WHERE user_id=?').get(userId) as {n:number};if(count.n>=500)throw new Error('Hesap başına 500 talep sınırına ulaşıldı.');
  const id=randomUUID(),share=randomBytes(24).toString('base64url'),reference='CP-'+randomBytes(6).toString('hex').toUpperCase();
  db.run('INSERT INTO arc_collection_requests(id,user_id,share_token,reference,customer,invoice,recipient,payer,expected_raw6,due,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,userId,share,reference,customer,invoice,owner.wallet_address.toLowerCase(),payer,amount,due,new Date().toISOString()]);return getCollection(db,userId,id);
}
export function publicCollection(db:Database,token:string):PublicCollection|null{
  if(!/^[a-zA-Z0-9_-]{32}$/.test(token))return null;
  const row=db.query('SELECT * FROM arc_collection_requests WHERE share_token=? AND cancelled=0').get(token) as Row|null;
  if(!row)return null;const request=map(db,row,false),remaining=BigInt(request.expectedRaw6)*1000000000000n-BigInt(request.receivedRaw18);
  return {reference:row.reference,recipient:row.recipient,expectedRaw6:row.expected_raw6,remainingRaw18:(remaining>0n?remaining:0n).toString(),paymentState:request.state==='review'?'review':remaining<=0n?'settled':'open',chainId:5042,token:ARC_USDC,decimals:6};
}
export function attachCollectionProofs(db:Database,userId:string,id:string,proofs:CollectionProof[]){
  db.transaction(()=>{const request=own(db,userId,id);if(request.cancelled)throw new Error('İptal edilen talebe kayıt eklenemez.');
    const fresh=new Map<string,CollectionProof>();
    for(const proof of proofs){const existing=db.query('SELECT request_id FROM arc_collection_proofs WHERE user_id=? AND hash=? AND log_index=?').get(userId,proof.hash,proof.logIndex) as {request_id:string}|null;
      if(existing){if(existing.request_id!==id)throw new Error('Bu hareket başka bir taleple ilişkilendirilmiş. Önce oradaki kaydı kaldır.');continue;}
      if(proof.to!==request.recipient)throw new Error('Alıcı uyuşmuyor.');
      fresh.set(`${proof.hash}:${proof.logIndex}`,proof);
    }
    const count=db.query('SELECT count(*) AS n FROM arc_collection_proofs WHERE user_id=? AND request_id=?').get(userId,id) as {n:number};if(count.n+fresh.size>100)throw new Error('Talep başına 100 olay sınırı.');
    for(const proof of fresh.values()){
      const data={...proof,decision:'review',reason:Date.parse(proof.timestamp)<Date.parse(request.created_at)?'Talep tarihinden önceki ödeme; fatura ilişkisini kontrol et.':proof.reason};
      db.run('INSERT INTO arc_collection_proofs(user_id,request_id,hash,log_index,data) VALUES(?,?,?,?,?)',[userId,id,proof.hash,proof.logIndex,JSON.stringify(data)]);
      recordAudit(db,userId,id,'linked',data as CollectionProof,null);
    }
  })();return getCollection(db,userId,id);
}
export function decideCollectionProof(db:Database,userId:string,id:string,body:unknown){
  const request=own(db,userId,id);if(request.cancelled)throw new Error('İptal edilmiş talep.');
  const draft=body as {hash?:unknown;logIndex?:unknown;decision?:unknown}|null;
  if(!draft||typeof draft.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(draft.hash)||!Number.isSafeInteger(draft.logIndex)||!['accepted','rejected','review','unlink'].includes(String(draft.decision)))throw new Error('İnceleme kararı geçersiz.');
  const row=db.query('SELECT data FROM arc_collection_proofs WHERE user_id=? AND request_id=? AND hash=? AND log_index=?').get(userId,id,draft.hash,draft.logIndex as number) as {data:string}|null;if(!row)throw new Error('Kanıt bulunamadı.');
  const previous=JSON.parse(row.data) as CollectionProof;
  if(previous.decision===draft.decision)return getCollection(db,userId,id);
  db.transaction(()=>{
    if(draft.decision==='unlink')db.run('DELETE FROM arc_collection_proofs WHERE user_id=? AND request_id=? AND hash=? AND log_index=?',[userId,id,draft.hash,draft.logIndex as number]);
    else db.run('UPDATE arc_collection_proofs SET data=? WHERE user_id=? AND request_id=? AND hash=? AND log_index=?',[JSON.stringify({...previous,decision:draft.decision}),userId,id,draft.hash,draft.logIndex as number]);
    recordAudit(db,userId,id,draft.decision==='unlink'?'unlinked':draft.decision as CollectionAudit['action'],previous,previous.decision);
  })();
  return getCollection(db,userId,id);
}
export function cancelCollection(db:Database,userId:string,id:string){const request=own(db,userId,id);if(!request.cancelled)db.transaction(()=>{db.run('UPDATE arc_collection_requests SET cancelled=1 WHERE user_id=? AND id=?',[userId,id]);recordAudit(db,userId,id,'cancelled',null,null);})();return getCollection(db,userId,id);}
