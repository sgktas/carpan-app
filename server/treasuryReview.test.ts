import {describe,test,expect} from 'bun:test';
import {TREASURY_CHAINS,usdcPage,summarizeTreasury,treasuryAmount,providerLabels} from '../src/treasury-review';
import type {ExplorerRow} from '../src/chain-explorer';
const wallet='0x'+'1'.repeat(40),peer='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64);
function row(patch:Partial<ExplorerRow>={}):ExplorerRow{return {id:'8453:transfers:'+hash+':0:',title:'USDC',address:null,from:peer,to:wallet,hash,token:TREASURY_CHAINS[1].token,symbol:'USDC',raw:'100000',decimals:6,nftId:null,block:1,timestamp:null,status:null,data:{},...patch};}
describe('treasury evidence boundaries',()=>{
  test('symbol impersonation, native aliases, wrong precision, failed and unrelated transfers do not count',()=>{
    expect(usdcPage([row(),row({token:'0x'+'9'.repeat(40)}),row({token:null}),row({decimals:18}),row({status:'reverted'}),row({to:peer}),row({raw:'1.1'})],'8453',wallet)).toHaveLength(1);
    expect(usdcPage([row()],'5042',wallet)).toEqual([]);
    expect(usdcPage([row()],'999',wallet)).toEqual([]);
  });
  test('distinct equal-value logs survive; repeated pages are deduplicated',()=>{
    expect(usdcPage([row(),row(),row({id:'different-log'})],'8453',wallet)).toHaveLength(2);
  });
  test('self transfers do not inflate incoming/outgoing and amounts remain exact',()=>{
    const sum=summarizeTreasury([row(),row({from:wallet,to:peer,raw:'1'}),row({from:wallet,to:wallet,raw:'999999'})],wallet);
    expect(sum.incoming).toBe(100000n);expect(sum.outgoing).toBe(1n);expect(sum.self).toBe(999999n);expect(sum.peers[0].count).toBe(2);
    expect(treasuryAmount(100001n)).toBe('0.100001');expect(treasuryAmount(100000000000000000000001n)).toBe('100000000000000000.000001');
  });
  test('labels remain bounded public suggestions',()=>{
    expect(providerLabels({name:' Name ',public_tags:[{display_name:'Name'},{display_name:'Other'},null,'bad']})).toEqual(['Name','Other']);
  });
});
