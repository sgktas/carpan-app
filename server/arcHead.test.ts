import {expect,test} from 'bun:test';
import {streamBlockNumber} from './arcHead';
test('empty or malformed reconnect messages never produce a head or throw',()=>{
  for(const block of [undefined,null,{}, {number:null},{number:undefined},{number:'0x10'},{number:16},{number:-1n}]) expect(streamBlockNumber(block)).toBeNull();
});
test('a valid head after an empty reconnect message is accepted without inventing a checkpoint',()=>{
  const scheduled:bigint[]=[];
  for(const block of [undefined,{number:24687359n},null,{number:24687360n}]){
    const number=streamBlockNumber(block);if(number!==null)scheduled.push(number);
  }
  expect(scheduled).toEqual([24687359n,24687360n]);
});
