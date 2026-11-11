import {test,expect} from 'bun:test';
import {addRecent,loadRecents,saveRecents,loadChain,saveChain,RECENTS_KEY,CHAIN_KEY} from '../src/terminal-recents';

const A='0x'+'ab'.repeat(20),B='0x'+'cd'.repeat(20);
const memory=(initial:Record<string,string>={})=>{const data={...initial};return {data,getItem:(k:string)=>data[k]??null,setItem:(k:string,v:string)=>{data[k]=v;}};};

test('newest first, duplicates collapse, and the list never exceeds eight',()=>{
 let list=addRecent([],{query:A,type:'address'});
 list=addRecent(list,{query:'usdc',type:'text'});
 list=addRecent(list,{query:A.toUpperCase().replace('0X','0x'),type:'address'});
 expect(list.map(r=>r.query)).toEqual([A,'usdc']);
 for(let i=0;i<12;i++)list=addRecent(list,{query:`word${i}`,type:'text'});
 expect(list.length).toBe(8);expect(list[0].query).toBe('word11');
});

test('text duplicates ignore case and surrounding spaces; empty queries are not stored',()=>{
 let list=addRecent([],{query:'USDC',type:'text'});
 list=addRecent(list,{query:'  usdc ',type:'text'});
 expect(list.length).toBe(1);
 expect(addRecent([],{query:'   ',type:'text'})).toEqual([]);
});

test('corrupt, wrong-shaped or hostile storage yields an empty list instead of an error',()=>{
 expect(loadRecents(memory({[RECENTS_KEY]:'{not json'}))).toEqual([]);
 expect(loadRecents(memory({[RECENTS_KEY]:'{"a":1}'}))).toEqual([]);
 expect(loadRecents(memory())).toEqual([]);
 const mixed=JSON.stringify([{query:A,type:'address'},{query:'x',type:'script'},{query:'<b>',type:'address'},{query:5,type:'text'},{query:'ok',type:'text'},null]);
 expect(loadRecents(memory({[RECENTS_KEY]:mixed}))).toEqual([{query:A,type:'address'},{query:'ok',type:'text'}]);
 const tooMany=JSON.stringify(Array.from({length:30},(_,i)=>({query:`w${i}`,type:'text'})));
 expect(loadRecents(memory({[RECENTS_KEY]:tooMany})).length).toBe(8);
});

test('unavailable storage never throws on read or write',()=>{
 const broken={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 expect(loadRecents(broken)).toEqual([]);
 expect(()=>saveRecents(broken,[{query:B,type:'address'}])).not.toThrow();
 expect(loadChain(broken)).toBe('5042');
 expect(()=>saveChain(broken,'8453')).not.toThrow();
});

test('saved recents round-trip',()=>{
 const storage=memory();
 saveRecents(storage,[{query:B,type:'address'},{query:'usdc',type:'text'}]);
 expect(loadRecents(storage)).toEqual([{query:B,type:'address'},{query:'usdc',type:'text'}]);
});

test('selected network is remembered only when it is a supported one; default is Arc',()=>{
 const storage=memory();
 expect(loadChain(storage)).toBe('5042');
 saveChain(storage,'8453');expect(loadChain(storage)).toBe('8453');
 storage.data[CHAIN_KEY]='999';expect(loadChain(storage)).toBe('5042');
});
