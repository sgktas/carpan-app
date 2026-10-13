import {expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initFinanceWorkspace,readFinanceDecisions,saveFinanceDecision} from './financeWorkspace';
const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const id=`5042:0x${'a'.repeat(64)}:1:0x3600000000000000000000000000000000000000`;
test('notes survive a database reopen, isolated by account and research wallet',()=>{
  const folder=mkdtempSync(join(tmpdir(),'carpan-finance-'));
  let db=new Database(join(folder,'notes.db'));
  try{
    initFinanceWorkspace(db);saveFinanceDecision(db,'alice',wallet,{id,category:'collection',reference:'Invoice 12'});
    db.close();db=new Database(join(folder,'notes.db'));initFinanceWorkspace(db);
    expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions[id]).toEqual({category:'collection',reference:'Invoice 12'});
    expect(readFinanceDecisions(db,'bob',wallet,[id]).decisions).toEqual({});
    expect(readFinanceDecisions(db,'alice',other,[id]).decisions).toEqual({});
    saveFinanceDecision(db,'alice',wallet,{id,category:'refund',reference:''});
    expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions[id]).toEqual({category:'refund',reference:''});
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
});
test('rejects foreign chains/tokens, invalid categories, oversized notes and batches',()=>{
  const db=new Database(':memory:');initFinanceWorkspace(db);
  try{
    for(const draft of [{id:id.replace('5042:','1:'),category:'review',reference:''},{id:id.replace('0x3600','0x4600'),category:'review',reference:''},{id,category:'__proto__',reference:''},{id,category:'review',reference:'a'.repeat(121)}])expect(()=>saveFinanceDecision(db,'alice',wallet,draft)).toThrow();
    expect(()=>readFinanceDecisions(db,'alice',wallet,Array(201).fill(id))).toThrow();
    expect(()=>readFinanceDecisions(db,'alice','invalid',[id])).toThrow();
    expect(readFinanceDecisions(db,'alice',wallet,[id]).decisions).toEqual({});
  }finally{db.close();}
});
