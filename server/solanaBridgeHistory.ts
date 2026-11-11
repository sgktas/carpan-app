import type {Database} from 'bun:sqlite';
import {AppKit} from '@circle-fin/app-kit';
import {decodeSolanaBridgeRecords,encodeSolanaBridgeRecords,solanaBridgeDefinitions,solanaBridgeHasBurn,type SolanaBridgeEnvironment,type SolanaBridgeRecord} from '../src/solana-bridge';

/**
 * Account copy of Solana ↔ Arc recovery records. Same discipline as EVM history: the record's
 * Arc wallet must be the account's verified wallet, route/amount/source burn are immutable,
 * and an older or downgraded snapshot never replaces a newer one. These are private recovery
 * notes, never settlement evidence.
 */
const kit=new AppKit();
const definitions=(environment:SolanaBridgeEnvironment)=>solanaBridgeDefinitions(kit,environment);
export function initSolanaBridgeHistory(db:Database){db.exec(`CREATE TABLE IF NOT EXISTS solana_bridge_history(
 user_id TEXT NOT NULL,environment TEXT NOT NULL,id TEXT NOT NULL,evm_wallet TEXT NOT NULL,snapshot TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,environment,id));
 CREATE INDEX IF NOT EXISTS solana_bridge_history_wallet ON solana_bridge_history(user_id,environment,evm_wallet,updated_at);`);}
export function solanaHistoryEnvironment(value:unknown):SolanaBridgeEnvironment{if(value!=='mainnet'&&value!=='testnet')throw new Error('Köprü ortamı geçersiz.');return value;}
function verifiedWallet(db:Database,userId:string,wallet:unknown){
 if(typeof wallet!=='string'||!/^0x[0-9a-f]{40}$/i.test(wallet))throw new Error('Geçerli Arc cüzdanını seç.');
 const user=db.query('SELECT wallet_address,wallet_verified_at FROM users WHERE id=?').get(userId) as {wallet_address:string|null;wallet_verified_at:string|null}|null;
 if(!user?.wallet_verified_at||user.wallet_address?.toLowerCase()!==wallet.toLowerCase())throw new Error('Solana köprü geçmişi için Arc cüzdanını Carpan hesabında doğrula.');
 return wallet.toLowerCase();
}
export function listSolanaBridgeHistory(db:Database,userId:string,environment:SolanaBridgeEnvironment,wallet:unknown,load=definitions){
 const owner=verifiedWallet(db,userId,wallet);
 const rows=db.query('SELECT snapshot FROM solana_bridge_history WHERE user_id=? AND environment=? AND evm_wallet=? ORDER BY updated_at DESC LIMIT 100').all(userId,environment,owner) as {snapshot:string}[];
 // Re-validate on read: a stored row that no longer passes current checks is not returned.
 const snapshots=rows.map(r=>r.snapshot).filter(s=>{try{return decodeSolanaBridgeRecords(s,load(environment),environment).length===1;}catch{return false;}});
 return {environment,wallet:owner,snapshots,scope:'account-recovery',verified:false as const};
}
const burnHash=(r:SolanaBridgeRecord)=>r.result.steps.find(s=>s.name==='burn'&&s.txHash)?.txHash;
export function saveSolanaBridgeHistory(db:Database,userId:string,environment:SolanaBridgeEnvironment,wallet:unknown,snapshot:unknown,load=definitions){
 const owner=verifiedWallet(db,userId,wallet);
 if(typeof snapshot!=='string'||snapshot.length>131072)throw new Error('Köprü kaydı çok büyük veya geçersiz.');
 let parsed:SolanaBridgeRecord[];try{parsed=decodeSolanaBridgeRecords(snapshot,load(environment),environment);}catch{throw new Error('Solana köprü kaydı doğrulanamadı.');}
 if(parsed.length!==1||parsed[0].evmWallet.toLowerCase()!==owner)throw new Error('Köprü kaydı ortam veya cüzdanla uyuşmuyor.');
 const record=parsed[0],id=record.id;
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Köprü kayıt kimliği geçersiz.');
 const encoded=encodeSolanaBridgeRecords([record]);
 if(encoded.length>131072)throw new Error('Köprü kaydı çok büyük.');
 return db.transaction(()=>{
  const old=db.query('SELECT snapshot FROM solana_bridge_history WHERE user_id=? AND environment=? AND id=?').get(userId,environment,id) as {snapshot:string}|null;
  if(old){
   const previous=decodeSolanaBridgeRecords(old.snapshot,load(environment),environment)[0];
   if(!previous)throw new Error('Saklanan köprü kaydı okunamadı.');
   for(const field of ['direction','evmWallet','solanaWallet','recipient','amount','createdAt'] as const)if(String(previous[field]).toLowerCase()!==String(record[field]).toLowerCase())throw new Error('Mevcut gönderimin rotası veya tutarı değiştirilemez.');
   // Solana signatures are case-sensitive base58; EVM hashes compare case-insensitively.
   const same=(a?:string,b?:string)=>record.direction==='solana-to-arc'?a===b:a?.toLowerCase()===b?.toLowerCase();
   if(solanaBridgeHasBurn(previous.result)&&!same(burnHash(previous),burnHash(record)))throw new Error('Orijinal kaynak gönderimi değiştirilemez.');
   if(Date.parse(record.updatedAt)<Date.parse(previous.updatedAt)||previous.status==='delivered'&&record.status!=='delivered')return {ok:true as const,id,stored:false};
  }else{
   const count=db.query('SELECT COUNT(*) AS n FROM solana_bridge_history WHERE user_id=?').get(userId) as {n:number};
   if(count.n>=200)throw new Error('Hesap köprü geçmişi sınırına ulaştı; kayıtlarını dışa aktar.');
  }
  db.run(`INSERT INTO solana_bridge_history(user_id,environment,id,evm_wallet,snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(user_id,environment,id) DO UPDATE SET snapshot=excluded.snapshot,updated_at=excluded.updated_at`,[userId,environment,id,owner,encoded,record.createdAt,record.updatedAt]);
  return {ok:true as const,id,stored:true};
 })();
}
