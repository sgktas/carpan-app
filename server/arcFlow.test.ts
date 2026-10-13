import {describe,test,expect} from 'bun:test';
import {buildFlow} from '../src/arc-flow';
import {ARC_USDC,type WalletTransfer} from '../src/arc-wallet';
const a='0x'+'a'.repeat(40),b='0x'+'b'.repeat(40),c='0x'+'c'.repeat(40);
function transfer(id:string,from:string,to:string,raw:string,token=ARC_USDC):WalletTransfer{return {id,hash:'0x'+'1'.repeat(64),logIndex:Number(id)||0,block:1,timestamp:null,from,to,raw,token,decimals:6,symbol:'USDC',direction:'out'};}
describe('flow evidence aggregation',()=>{
  test('selected 18-decimal token stays separate from USDC and mismatched precision',()=>{
    const asset={address:c,symbol:'OTHER',decimals:18};
    const t={...transfer('1',a,b,'1234567890123456789',c),decimals:18};
    const flow=buildFlow([t,t,transfer('2',a,b,'9999999'),{...t,id:'3',decimals:6}],a,'all','1.234567890123456789',asset);
    expect(flow.transfers).toHaveLength(1);expect(flow.edges[0].raw).toBe('1234567890123456789');
    expect(buildFlow([t],a,'all','1.234567890123456790',asset).edges).toHaveLength(0);
  });
  test('deduplicates expanded address overlap, preserves opposite directions and exact quantities',()=>{
    const first=transfer('1',a,b,'9007199254740993123456');
    const flow=buildFlow([first,first,transfer('2',a,b,'1'),transfer('3',b,a,'2'),transfer('4',b,c,'3')],a);
    expect(flow.edges).toHaveLength(3);expect(flow.transfers).toHaveLength(4);
    expect(flow.edges.find(e=>e.from===a&&e.to===b)?.raw).toBe('9007199254740993123457');
    expect(flow.edges.find(e=>e.from===b&&e.to===a)?.raw).toBe('2');
    expect(flow.nodes).toContain(c);
  });
  test('matches canonical USDC only, excludes self transfers and filters each transfer before aggregation',()=>{
    const flow=buildFlow([transfer('1',a,b,'999999'),transfer('2',a,b,'999999'),transfer('3',a,b,'1000000'),
      transfer('4',a,a,'2000000'),transfer('5',a,b,'2000000',c),{...transfer('6',a,b,'2000000'),decimals:18}],a,'all','1');
    expect(flow.transfers.map(t=>t.id)).toEqual(['3']);expect(flow.edges[0].raw).toBe('1000000');
  });
  test('direction refers to root even after expansion and rejects invalid precision',()=>{
    const rows=[transfer('1',a,b,'1'),transfer('2',b,a,'2'),transfer('3',b,c,'3')];
    expect(buildFlow(rows,a,'in').transfers.map(t=>t.id)).toEqual(['2']);
    expect(buildFlow(rows,a,'out').transfers.map(t=>t.id)).toEqual(['1']);
    expect(()=>buildFlow(rows,a,'all','0.0000001')).toThrow();
  });
});
