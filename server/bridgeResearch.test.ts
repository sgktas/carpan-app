import {expect,test} from 'bun:test';
import type {BridgeRecord} from '../src/arc-bridge';
import {arcBridgeResearch,bridgeRecordForTransaction,bridgeRecordsForAddress} from '../src/bridge-research';
const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',burn=`0x${'ab'.repeat(32)}`,mint=`0x${'cd'.repeat(32)}`;
function record(source=5042,destination=42161){return {wallet,recipient,source,destination,status:'delivered',result:{steps:[{name:'burn',state:'success',txHash:burn},{name:'mint',state:'error'},{name:'mint',state:'success',txHash:mint}]}} as BridgeRecord;}
test('Arc research follows the source wallet for outbound and actual recipient for inbound',()=>{
 const out=record(),incoming=record(42161,5042);
 expect(arcBridgeResearch(out)?.address).toBe(wallet);expect(arcBridgeResearch(out)?.hash).toBe(burn);
 expect(arcBridgeResearch(incoming)?.address).toBe(recipient);expect(arcBridgeResearch(incoming)?.hash).toBe(mint);
 expect(bridgeRecordsForAddress([out,incoming],wallet)).toEqual([out]);expect(bridgeRecordsForAddress([out,incoming],recipient.toUpperCase())).toEqual([incoming]);
});
test('testnet, unsupported chains and unrelated transactions cannot supply mainnet evidence',()=>{
 expect(arcBridgeResearch(record(5042002,421614))).toBeNull();expect(arcBridgeResearch(record(5042,9000))).toBeNull();expect(arcBridgeResearch(record(5042,1))?.address).toBe(wallet);
 expect(bridgeRecordForTransaction([record()],'5042002',burn)).toBeUndefined();expect(bridgeRecordForTransaction([record()],'5042',mint)).toBeUndefined();
 expect(bridgeRecordForTransaction([record()],'5042',burn.toUpperCase())).toBeDefined();
});
test('pending inbound has a wallet link but never claims an Arc mint without proof',()=>{
 const pending=record(42161,5042);pending.status='interrupted';pending.result.steps=[{name:'burn',state:'success',txHash:burn}];
 expect(arcBridgeResearch(pending)?.walletUrl).toContain(recipient);expect(arcBridgeResearch(pending)?.transactionUrl).toBeNull();
 const out=record();out.result.steps=[{name:'burn',state:'pending',txHash:'invalid'}];expect(arcBridgeResearch(out)?.transactionUrl).toBeNull();
});
