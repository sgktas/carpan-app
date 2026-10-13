import type {Database} from 'bun:sqlite';
import {AppKit} from '@circle-fin/app-kit';
import {decodeRecords,encodeRecords,hasBurn,type BridgeRecord,type BridgeEnvironment} from '../src/arc-bridge';
import {verifiedMainnetDefinitions} from '../src/bridge-mainnet-config';
import {supportedBridgeChains} from '../src/arc-bridge-client';

const kit=new AppKit();
export function initBridgeHistory(db:Database){db.exec(`CREATE TABLE IF NOT EXISTS bridge_history(
 user_id TEXT NOT NULL,environment TEXT NOT NULL,id TEXT NOT NULL,wallet TEXT NOT NULL,snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,environment,id));
 CREATE INDEX IF NOT EXISTS bridge_history_wallet ON bridge_history(user_id,environment,wallet,updated_at);`);}
export function historyEnvironment(value:unknown):BridgeEnvironment{if(value!=='mainnet'&&value!=='testnet')throw new Error('Köprü ortamı geçersiz.');return value;}
function linkedWallet(db:Database,userId:string,wallet:unknown){
 if(typeof wallet!=='string'||!/^0x[0-9a-f]{40}$/i.test(wallet))throw new Error('Geçerli kaynak cüzdanını seç.');
 const user=db.query('SELECT wallet_address,wallet_verified_at FROM users WHERE id=?').get(userId) as {wallet_address:string|null;wallet_verified_at:string|null}|null;
 if(!user?.wallet_verified_at||user.wallet_address?.toLowerCase()!==wallet.toLowerCase())throw new Error('Köprü geçmişi için kaynak cüzdanını Carpan hesabında doğrula.');
 return wallet.toLowerCase();
}
function definitions(environment:BridgeEnvironment){return environment==='mainnet'?verifiedMainnetDefinitions(kit):supportedBridgeChains(kit);}
export function listBridgeHistory(db:Database,userId:string,environment:BridgeEnvironment,wallet:unknown){
 const owner=linkedWallet(db,userId,wallet);
 const rows=db.query('SELECT snapshot FROM bridge_history WHERE user_id=? AND environment=? AND wallet=? ORDER BY updated_at DESC LIMIT 100').all(userId,environment,owner) as {snapshot:string}[];
 return {environment,wallet:owner,snapshots:rows.map(r=>r.snapshot),scope:'account-recovery',verified:false};
}
/** Recovery snapshots are private user records, never financial settlement evidence. */
export function saveBridgeHistory(db:Database,userId:string,environment:BridgeEnvironment,wallet:unknown,snapshot:unknown){
 const owner=linkedWallet(db,userId,wallet);
 if(typeof snapshot!=='string'||snapshot.length>131072)throw new Error('Köprü kaydı çok büyük veya geçersiz.');
 const parsed=decodeRecords(snapshot,definitions(environment),environment);
 if(parsed.length!==1||parsed[0].wallet.toLowerCase()!==owner)throw new Error('Köprü kaydı ortam veya cüzdanla uyuşmuyor.');
 const record=parsed[0],id=record.id;
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Köprü kayıt kimliği geçersiz.');
 const encoded=encodeRecords([record]);
 if(encoded.length>131072)throw new Error('Köprü kaydı çok büyük.');
 return db.transaction(()=>{
  const old=db.query('SELECT snapshot FROM bridge_history WHERE user_id=? AND environment=? AND id=?').get(userId,environment,id) as {snapshot:string}|null;
  if(old){
   const previous=decodeRecords(old.snapshot,definitions(environment),environment)[0];
   if(!previous)throw new Error('Saklanan köprü kaydı okunamadı.');
   for(const field of ['wallet','source','destination','recipient','amount','createdAt'] as const)if(String(previous[field]).toLowerCase()!==String(record[field]).toLowerCase())throw new Error('Mevcut gönderimin rotası veya tutarı değiştirilemez.');
   const burnHash=(r:BridgeRecord)=>r.result.steps.find(s=>s.name==='burn'&&s.txHash)?.txHash?.toLowerCase();
   if(hasBurn(previous.result)&&burnHash(previous)!==burnHash(record))throw new Error('Orijinal kaynak gönderimi değiştirilemez.');
   // Concurrent tabs and late checkpoints must not replace newer recovery data.
   if(Date.parse(record.updatedAt)<Date.parse(previous.updatedAt)||previous.status==='delivered'&&record.status!=='delivered')return {ok:true,id,stored:false};
  }else{
   const count=db.query('SELECT COUNT(*) AS n FROM bridge_history WHERE user_id=?').get(userId) as {n:number};
   if(count.n>=200)throw new Error('Hesap köprü geçmişi sınırına ulaştı; kayıtlarını dışa aktar.');
  }
  db.run(`INSERT INTO bridge_history(user_id,environment,id,wallet,snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(user_id,environment,id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at`,[userId,environment,id,owner,encoded,record.createdAt,record.updatedAt]);
  return {ok:true,id,stored:true};
 })();
}
