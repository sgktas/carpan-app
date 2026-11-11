import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {AppKit} from '@circle-fin/app-kit';
import {Keypair} from '@solana/web3.js';
import {getBase58Decoder} from '@solana/kit';
import {encodeSolanaBridgeRecords,solanaBridgeDefinitions,decodeSolanaBridgeRecords,type SolanaBridgeRecord} from '../src/solana-bridge';
import {initSolanaBridgeHistory,listSolanaBridgeHistory,saveSolanaBridgeHistory} from './solanaBridgeHistory';

const definitions=solanaBridgeDefinitions(new AppKit(),'testnet');
const solana=Keypair.generate().publicKey.toBase58(),evm='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222';
const signature=getBase58Decoder().decode(new Uint8Array(64).fill(2)),arcHash=`0x${'12'.repeat(32)}`;
function record(over:Partial<SolanaBridgeRecord>={},direction:'arc-to-solana'|'solana-to-arc'='arc-to-solana',burn:string=direction==='arc-to-solana'?arcHash:signature):SolanaBridgeRecord{
 const outbound=direction==='arc-to-solana';
 return {version:1,id:'sol-1',environment:'testnet',direction,evmWallet:evm,solanaWallet:solana,recipient:outbound?solana:evm,amount:'0.10',createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z',status:'interrupted',
  result:{token:'USDC',amount:'0.10',state:'error',provider:'CCTPV2BridgingProvider',config:{transferSpeed:'FAST'},source:{address:outbound?evm:solana,chain:outbound?definitions.arc:definitions.solana},destination:{address:outbound?solana:evm,chain:outbound?definitions.solana:definitions.arc,recipientAddress:outbound?solana:evm,useForwarder:false},steps:[{name:'burn',state:'success',txHash:burn,data:{nonce:5n}}]},...over} as SolanaBridgeRecord;
}
const snap=(r:SolanaBridgeRecord)=>encodeSolanaBridgeRecords([r]);
function setup(){const db=new Database(':memory:');db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT)');db.run('INSERT INTO users VALUES(?,?,?)',['alice',evm,'2026-11-01']);db.run('INSERT INTO users VALUES(?,?,?)',['bob',other,'2026-11-01']);db.run('INSERT INTO users VALUES(?,?,?)',['carol',evm,null]);initSolanaBridgeHistory(db);return db;}

test('a verified Arc wallet stores and lists its Solana recovery record; others and other environments cannot see it',()=>{
 const db=setup();
 expect(saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record())).stored).toBe(true);
 const list=listSolanaBridgeHistory(db,'alice','testnet',evm);expect(list.snapshots).toHaveLength(1);
 const restored=decodeSolanaBridgeRecords(list.snapshots[0],definitions,'testnet')[0];
 expect(restored.result.steps[0].txHash).toBe(arcHash);expect(restored.result.steps[0].data?.nonce).toBe(5n);
 expect(listSolanaBridgeHistory(db,'alice','mainnet',evm).snapshots).toHaveLength(0);
 expect(()=>listSolanaBridgeHistory(db,'bob','testnet',evm)).toThrow();
});

test('unverified accounts and records for another Arc wallet are rejected',()=>{
 const db=setup();
 expect(()=>saveSolanaBridgeHistory(db,'carol','testnet',evm,snap(record()))).toThrow('doğrula');
 expect(()=>saveSolanaBridgeHistory(db,'bob','testnet',other,snap(record()))).toThrow();
 expect(()=>saveSolanaBridgeHistory(db,'alice','testnet',evm,'not json')).toThrow();
 expect(()=>saveSolanaBridgeHistory(db,'alice','testnet',evm,snap({...record(),id:'bad id!'}))).toThrow();
});

test('route, amount and source burn are immutable; older or downgraded snapshots are ignored',()=>{
 const db=setup();saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record()));
 expect(()=>saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({amount:'0.20',result:{...record().result,amount:'0.20'}})))).toThrow('değiştirilemez');
 expect(()=>saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({updatedAt:'2026-11-02T00:00:00Z'},'arc-to-solana',`0x${'34'.repeat(32)}`)))).toThrow('Orijinal');
 expect(saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({status:'delivered',updatedAt:'2026-11-03T00:00:00Z'}))).stored).toBe(true);
 expect(saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({status:'interrupted',updatedAt:'2026-11-04T00:00:00Z'}))).stored).toBe(false);
 expect(saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({status:'delivered',updatedAt:'2026-11-02T00:00:00Z'}))).stored).toBe(false);
});

test('Solana → Arc burn signatures are compared exactly (base58 is case-sensitive)',()=>{
 const db=setup();const inbound=record({id:'sol-2'},'solana-to-arc');
 saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(inbound));
 const changed=getBase58Decoder().decode(new Uint8Array(64).fill(3));
 expect(()=>saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({id:'sol-2',updatedAt:'2026-11-05T00:00:00Z'},'solana-to-arc',changed)))).toThrow('Orijinal');
 expect(saveSolanaBridgeHistory(db,'alice','testnet',evm,snap(record({id:'sol-2',updatedAt:'2026-11-05T00:00:00Z',status:'delivered'},'solana-to-arc'))).stored).toBe(true);
});

test('client merge keeps the newest copy and never downgrades a delivered record',async()=>{
 const {mergeSolanaRecords}=await import('../src/hooks/useSolanaBridgeSync');
 const a=record({updatedAt:'2026-11-02T00:00:00Z'}),newer=record({updatedAt:'2026-11-03T00:00:00Z',status:'error'});
 expect(mergeSolanaRecords([a],[newer])[0].status).toBe('error');
 const delivered=record({status:'delivered',updatedAt:'2026-11-02T00:00:00Z'});
 expect(mergeSolanaRecords([delivered],[record({updatedAt:'2026-11-09T00:00:00Z'})])[0].status).toBe('delivered');
 expect(mergeSolanaRecords([],[record({id:'x'}),record({id:'y',updatedAt:'2026-11-05T00:00:00Z'})]).map(r=>r.id)).toEqual(['y','x']);
});
