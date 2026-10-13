import {expect,test} from 'bun:test';
import {FinanceSaveQueue} from '../src/finance-save-queue';
test('slower earlier saves cannot overwrite the newest reference',async()=>{
  let release!:()=>void;const first=new Promise<void>(r=>{release=r;});const written:string[]=[];
  const queue=new FinanceSaveQueue(async(_w,_id,decision)=>{if(decision.reference==='old')await first;written.push(decision.reference);},()=>{});
  const key=queue.set('wallet','row',{category:'review',reference:'old'}),task=queue.flush(key);
  queue.set('wallet','row',{category:'collection',reference:'new'});release();await task;
  expect(written).toEqual(['old','new']);expect(queue.pending.size).toBe(0);
});
test('failed writes retain edits over server reads and retry the original latest draft',async()=>{
  let fail=true;const saved:string[]=[];
  const queue=new FinanceSaveQueue(async(_w,_id,d)=>{if(fail)throw new Error('offline');saved.push(d.reference);},()=>{});
  const key=queue.set('wallet','row',{category:'payment',reference:'keep me'});await queue.flush(key);
  expect(queue.errors.get(key)).toBe('offline');expect(queue.pending.size).toBe(1);
  expect(queue.overlay('wallet',{row:{category:'review',reference:'server'}}).row.reference).toBe('keep me');
  expect(queue.overlay('other',{})).toEqual({});fail=false;await queue.flush(key);
  expect(saved).toEqual(['keep me']);expect(queue.pending.size).toBe(0);expect(queue.errors.size).toBe(0);
});
