import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {AppKit} from '@circle-fin/app-kit';
import {encodeEventTopics,encodeAbiParameters,erc20Abi,type TransactionReceipt} from 'viem';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {decodeRecords,encodeRecords,verifyBridgeBurn,type BridgeRecord} from '../src/arc-bridge';
import {verifiedMainnetDefinitions} from '../src/bridge-mainnet-config';
import {initBridgeHistory,listBridgeHistory,saveBridgeHistory} from './bridgeHistory';
const chains=verifiedMainnetDefinitions(new AppKit()),arc=chains[0],arb=chains[1];
const wallet='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222',hash=`0x${'ab'.repeat(32)}` as const;
function record():BridgeRecord{return {id:'recovery-1',wallet,recipient:wallet,source:5042,destination:42161,amount:'0.05',status:'interrupted',createdAt:'2026-10-05T12:00:00Z',updatedAt:'2026-10-05T12:00:00Z',result:{amount:'0.050000',token:'USDC',state:'pending',provider:'CCTPV2BridgingProvider',source:{address:wallet,chain:arc},destination:{address:wallet,chain:arb},steps:[{name:'burn',state:'success',txHash:hash,data:{raw:50000n}}]}};}
function setup(db:Database){db.run('CREATE TABLE users(id TEXT PRIMARY KEY,wallet_address TEXT,wallet_verified_at TEXT);');db.run('INSERT INTO users VALUES(?,?,?)',['alice',wallet,'2026-10-05']);db.run('INSERT INTO users VALUES(?,?,?)',['bob',other,'2026-10-05']);initBridgeHistory(db);}
test('private account recovery survives database reopen without leaking another wallet or environment',()=>{
 const folder=mkdtempSync(join(tmpdir(),'carpan-bridge-')),file=join(folder,'test.db');let db=new Database(file);
 try{setup(db);saveBridgeHistory(db,'alice','mainnet',wallet,encodeRecords([record()]));db.close();db=new Database(file);const rows=listBridgeHistory(db,'alice','mainnet',wallet);expect(rows.snapshots).toHaveLength(1);expect(rows.verified).toBe(false);expect(decodeRecords(rows.snapshots[0],chains,'mainnet')[0].result.steps[0].data).toEqual({raw:50000n});expect(listBridgeHistory(db,'alice','testnet',wallet).snapshots).toEqual([]);expect(()=>listBridgeHistory(db,'bob','mainnet',wallet)).toThrow('doğrula');expect(()=>saveBridgeHistory(db,'bob','mainnet',other,encodeRecords([record()]))).toThrow('uyuşmuyor');}finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('an existing burn, route, recipient and amount cannot be replaced; older tabs cannot regress checkpoints',()=>{
 const db=new Database(':memory:');try{setup(db);const r=record();saveBridgeHistory(db,'alice','mainnet',wallet,encodeRecords([r]));for(const changed of [{...r,recipient:other,result:{...r.result,destination:{...r.result.destination,recipientAddress:other}}},{...r,amount:'1',result:{...r.result,amount:'1'}},{...r,result:{...r.result,steps:[{name:'burn',state:'success',txHash:`0x${'cd'.repeat(32)}`}]}}] as BridgeRecord[])expect(()=>saveBridgeHistory(db,'alice','mainnet',wallet,encodeRecords([changed]))).toThrow();const older={...r,updatedAt:'2026-10-05T11:00:00Z'};expect(saveBridgeHistory(db,'alice','mainnet',wallet,encodeRecords([older])).stored).toBe(false);expect(()=>saveBridgeHistory(db,'alice','testnet',wallet,encodeRecords([r]))).toThrow('uyuşmuyor');}finally{db.close();}
});
test('imported snapshots always use reviewed chain metadata and cannot inject RPCs or a provider',()=>{
 const r=record();r.result.source.chain={...arc,rpcEndpoints:['https://attacker.invalid'],usdcAddress:other};const [restored]=decodeRecords(encodeRecords([r]),chains,'mainnet');expect(restored.result.source.chain).toEqual(arc);expect(decodeRecords(encodeRecords([{...r,result:{...r.result,provider:'attacker'}}]),chains,'mainnet')).toEqual([]);
});
test('recovery needs the original successful canonical USDC burn from the recorded wallet',()=>{
 const r=record(),log={address:arc.usdcAddress,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:wallet,to:'0x0000000000000000000000000000000000000000'}}),data:encodeAbiParameters([{type:'uint256'}],[50000n])};
 const receipt={status:'success',from:wallet,transactionHash:hash,logs:[log]} as unknown as TransactionReceipt;
 expect(verifyBridgeBurn(r,receipt,chains,'mainnet')).toBe(true);
 for(const changed of [{...receipt,from:other},{...receipt,status:'reverted'},{...receipt,logs:[]},{...receipt,logs:[{...log,address:other}]}] as TransactionReceipt[])expect(()=>verifyBridgeBurn(r,changed,chains,'mainnet')).toThrow();
});
