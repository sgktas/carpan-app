import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {ExplorerBudget,initExplorerBudget,explorerRequest,explorerRequestCost,explorerEndpoint} from './explorerBudget';

test('endpoint attribution excludes addresses and query secrets; expensive endpoints reserve enough credits',()=>{
 const hash='0x'+'a'.repeat(64),url=`https://api.blockscout.com/5042/api/v2/transactions/${hash}/raw-trace?apikey=never-store-me`;
 expect(explorerEndpoint(url)).toBe('transactions/:id/raw-trace');expect(explorerRequestCost(url)).toBe(50);
 expect(explorerRequestCost(`https://api.blockscout.com/5042/api/v2/addresses/0x${'a'.repeat(40)}/token-transfers`)).toBe(30);
 expect(explorerRequestCost(`https://api.blockscout.com/5042/api/v2/addresses/0x${'a'.repeat(40)}/coin-balance-history`)).toBe(50);
 expect(explorerRequestCost(`https://api.blockscout.com/5042/api/v2/transactions/${hash}/internal-transactions`)).toBe(40);
 expect(explorerRequestCost('https://api.blockscout.com/5042/api/v2/tokens')).toBe(30);
 const db=new Database(':memory:'),budget=new ExplorerBudget(db,80,10,20);
 expect(budget.take(false,50,'research',explorerEndpoint(url))).toBe(true);
 expect(budget.take(true,50,'alerts','addresses/:id/token-transfers')).toBe(false);
 expect(budget.take(true,20,'alerts','addresses/:id/token-transfers')).toBe(true);
 const s=budget.status();expect(s.credits).toBe(70);expect(s.background_credits).toBe(20);expect(s.unattributedProCalls).toBe(0);
 expect(s.breakdown.map(row=>row.estimated_credits)).toEqual([50,20]);expect(JSON.stringify(s.breakdown)).not.toContain('never-store-me');expect(JSON.stringify(s.breakdown)).not.toContain(hash);db.close();
});
test('new attribution never invents a breakdown for past calls and reports only the local reset',()=>{
 const db=new Database(':memory:'),budget=new ExplorerBudget(db);budget.take();budget.take(false,20,'finance_history','addresses/:id/token-transfers');
 expect(budget.status().unattributedProCalls).toBe(1);expect(budget.status().providerResetAt).toBeNull();
 const since=budget.status().trackingSince;expect(new ExplorerBudget(db).status().trackingSince).toBe(since);db.close();
});

test('concurrent reservations cannot overspend the daily budget',async()=>{const db=new Database(':memory:');const budget=new ExplorerBudget(db,60,10,20);const attempts=await Promise.all(Array.from({length:20},async()=>budget.take()));expect(attempts.filter(Boolean)).toHaveLength(3);expect(budget.status().credits).toBe(60);expect(budget.status().mode).toBe('cached');db.close();});
test('background scans leave a quarter of the local allowance for research',()=>{const db=new Database(':memory:');const budget=new ExplorerBudget(db,80,10,20);expect(budget.take(true)).toBe(true);expect(budget.take(true)).toBe(true);expect(budget.take(true)).toBe(true);expect(budget.take(true)).toBe(false);expect(budget.take(false)).toBe(true);db.close();});
test('provider remaining balance wins and reordered responses cannot increase it',()=>{const db=new Database(':memory:');const budget=new ExplorerBudget(db,80000,20000,20);budget.observe(new Response('{}',{headers:{'x-credits-remaining':'20030'}}));expect(budget.take()).toBe(true);expect(budget.take()).toBe(false);budget.observe(new Response('{}',{headers:{'x-credits-remaining':'90000'}}));expect(budget.status().remaining).toBe(20010);budget.observe(new Response('{}',{status:402}));expect(budget.status().remaining).toBe(20010);budget.exhausted();expect(budget.status().remaining).toBe(0);expect(budget.status().mode).toBe('cached');db.close();});
test('usage survives controller recreation and resets on the next UTC day',()=>{const db=new Database(':memory:');let now=Date.parse('2026-10-02T23:59:59Z');let budget=new ExplorerBudget(db,80,10,20,()=>now);budget.take();budget=new ExplorerBudget(db,80,10,20,()=>now);expect(budget.status().credits).toBe(20);now+=2000;expect(budget.status().credits).toBe(0);expect(budget.status().remaining).toBeNull();db.close();});
test('response snapshots keep their original age and exclude expired entries',()=>{const db=new Database(':memory:');let now=10000;const budget=new ExplorerBudget(db,80,10,20,()=>now);budget.write('test',{items:[1]},'source');now+=60001;expect(budget.read('test',60000)).toBeNull();expect(budget.read('test',86400000)?.fetchedAt).toBe(10000);expect(budget.read('test',86400000)?.payload).toEqual({items:[1]});now+=86400000;expect(budget.read('test',86400000)).toBeNull();db.close();});
test('exhausted PRO budget serves stored evidence without making a network request',async()=>{const db=new Database(':memory:');const budget=initExplorerBudget(db);const url='https://example.com/api/v2/token-transfers';budget.write(url,{items:[{value:'42'}]},'Blockscout PRO');budget.observe(new Response('{}',{status:402,headers:{'x-credits-remaining':'0'}}));const result=await explorerRequest('https://api.blockscout.com/1/api/v2/token-transfers',url,'test-only-key',-1);expect(result.cached).toBe(true);expect(result.source).toContain('kayıtlı veri');expect(budget.status().pro_calls).toBe(0);expect(budget.status().public_calls).toBe(0);await expect(explorerRequest('https://api.blockscout.com/1/api/v2/tokens','https://example.com/api/v2/tokens','test-only-key',-1)).rejects.toThrow();});

test('a paid-chain restriction cannot zero the account or block other chains',()=>{const db=new Database(':memory:');const b=new ExplorerBudget(db);b.observe(new Response('{}',{headers:{'x-credits-remaining':'85790'}}));b.observe(new Response('{}',{status:402}));b.restrict('8453','Base requires Builder');expect(b.status().remaining).toBe(85790);expect(b.status().mode).toBe('normal');expect(b.restriction('8453')).toContain('Builder');expect(b.restriction('1')).toBeNull();expect(b.take()).toBe(true);db.close();});
test('legacy synthetic zero is invalidated once without clearing usage or genuine new zeros',()=>{const db=new Database(':memory:');let b=new ExplorerBudget(db);b.take();b.exhausted();db.exec("DELETE FROM explorer_budget_meta WHERE name='402-fix'");b=new ExplorerBudget(db);expect(b.status().remaining).toBeNull();expect(b.status().pro_calls).toBe(1);b.exhausted();b=new ExplorerBudget(db);expect(b.status().remaining).toBe(0);db.close();});
