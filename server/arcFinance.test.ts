import {describe,it,expect} from 'bun:test';
import {financeRows,financePackage,financeSeries} from '../src/arc-finance';
import {ARC_USDC,type WalletTransfer} from '../src/arc-wallet';
const wallet='0x'+'1'.repeat(40),peer='0x'+'2'.repeat(40);
const row:WalletTransfer={id:'provider-id',hash:'0x'+'a'.repeat(64),logIndex:1,block:10,timestamp:'2026-10-06T12:00:00.000Z',from:peer,to:wallet,token:ARC_USDC,symbol:'USDC',decimals:6,raw:'1',direction:'out'};
describe('Arc accounting boundary',()=>{
  it('aggregates UTC buckets exactly, includes empty days and omits self/undated rows',()=>{
    const points=financeSeries([{...row,direction:'in'},{...row,raw:'999999999999999999',direction:'in'},{...row,direction:'self'},{...row,timestamp:null}], '2026-10-05','2026-10-07');
    expect(points).toHaveLength(3);expect(points[0].incoming).toBe(0n);expect(points[1].incoming).toBe(1000000000000000000n);expect(points[1].outgoing).toBe(0n);
  });
  it('retains long-range totals when grouping the chart',()=>{
    const points=financeSeries([{...row,direction:'in'}],'2026-01-01','2026-12-31');
    expect(points.length).toBeLessThanOrEqual(60);expect(points.reduce((n,p)=>n+p.incoming,0n)).toBe(1n);
  });
  it('retains one micro USDC and recomputes direction, deduplicating overlapping pages',()=>{
    const rows=financeRows([row,row],wallet);expect(rows).toHaveLength(1);expect(rows[0].raw).toBe('1');expect(rows[0].direction).toBe('in');
  });
  it('rejects foreign tokens, wrong precision and unrelated wallets',()=>{
    expect(()=>financeRows([{...row,token:peer}],wallet)).toThrow();
    expect(()=>financeRows([{...row,decimals:18}],wallet)).toThrow();
    expect(()=>financeRows([{...row,to:peer}],wallet)).toThrow();
  });
  it('rejects contradictory duplicates',()=>expect(()=>financeRows([row,{...row,raw:'2'}],wallet)).toThrow());
  it('does not imply income, complete coverage, gas or posting readiness',()=>{
    const pack=financePackage(wallet,{items:[row],nextCursor:'more',skipped:2,scannedPages:1,fetchedAt:'2026-10-06T12:00:00Z'}, {},{from:'',to:''});
    expect(pack.records[0].category).toBe('review');expect(pack.records[0].gasRaw).toBeNull();
    expect(pack.coverage.hasMore).toBe(true);expect(pack.coverage.readyForPosting).toBe(false);expect(pack.coverage.skipped).toBe(2);
  });
});
