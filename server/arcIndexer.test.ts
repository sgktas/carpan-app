import { afterAll, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { padHex } from 'viem';

const folder = mkdtempSync(join(tmpdir(), 'carpan-indexer-audit-'));
process.env.REFBRIDGE_DB_PATH = join(folder, 'indexer.sqlite');
const { db } = await import('./sqliteDb');
const { indexBlock,indexBlockRange } = await import('./arcIndexer');
const watched = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const token = '0x3600000000000000000000000000000000000000';
const txHash = `0x${'a'.repeat(64)}`;
const transfer = {
  address: token, transactionHash: txHash, logIndex: 0,
  topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', padHex(watched, { size: 32 }), padHex(recipient, { size: 32 })],
  data: padHex('0x0f4240', { size: 32 }),
};
function client(fail = false) {
  return {
    getBlock: async () => ({ timestamp: 1_700_000_000n, transactions: [{ hash: txHash, from: watched, to: null, input: '0x' }] }),
    getTransactionReceipt: async () => ({ status: 'success', contractAddress: recipient }),
    getLogs: async (query: { address?: unknown }) => {
      if (query.address) return [];
      if (fail) throw new Error('Temporary transfer RPC failure');
      return [transfer];
    },
  } as unknown as NonNullable<Parameters<typeof indexBlock>[1]>;
}
beforeEach(() => {
  for (const table of ['arc_contract_deployments', 'arc_contract_events', 'arc_address_activity', 'arc_contract_watches', 'arc_indexer_state']) db.run(`DELETE FROM ${table}`);
  db.run('INSERT INTO arc_indexer_state(chain_id,last_processed_block,updated_at) VALUES(5042,100,?)', [new Date().toISOString()]);
  db.run('INSERT INTO arc_contract_watches(user_id,chain_id,contract_address,followed_at) VALUES(?,5042,?,?)', ['audit-user', watched, new Date().toISOString()]);
});
afterAll(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });

test('a failed followed-token scan does not commit the deployment or advance the block checkpoint', async () => {
  await expect(indexBlock(101n, client(true))).rejects.toThrow('Temporary transfer RPC failure');
  expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({ last_processed_block: 100 });
  expect(db.query('SELECT COUNT(*) AS n FROM arc_contract_deployments').get()).toEqual({ n: 0 });
  expect(db.query('SELECT COUNT(*) AS n FROM arc_address_activity').get()).toEqual({ n: 0 });
});

test('retrying the original block stores complete activity once and advances the checkpoint', async () => {
  await indexBlock(101n, client());
  await indexBlock(101n, client());
  expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({ last_processed_block: 101 });
  expect(db.query('SELECT COUNT(*) AS n FROM arc_contract_deployments').get()).toEqual({ n: 1 });
  expect(db.query('SELECT COUNT(*) AS n FROM arc_address_activity').get()).toEqual({ n: 2 });
  expect(db.query("SELECT token_address,amount_raw FROM arc_address_activity WHERE activity_type='token_transfer'").get()).toEqual({ token_address: token, amount_raw: '1000000' });
});

test('empty watched blocks do not scan logs and still checkpoint successfully',async()=>{
 let reads=0;const fake={...client(),getBlock:async()=>({timestamp:1_700_000_000n,transactions:[]}),getLogs:async()=>{reads++;throw Error('must not scan an empty block');}} as unknown as NonNullable<Parameters<typeof indexBlock>[1]>;
 await indexBlock(101n,fake);expect(reads).toBe(0);expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({last_processed_block:101});
});

test('a bounded window shares three log scans, associates evidence with its exact block and checkpoints in order',async()=>{
 const calls:{fromBlock:bigint;toBlock:bigint;address?:unknown}[]=[],blocks:bigint[]=[];
 const fake={getBlock:async({blockNumber}:{blockNumber:bigint})=>{blocks.push(blockNumber);return {timestamp:1_700_000_000n+blockNumber,transactions:blockNumber===102n?[{hash:txHash,from:watched,to:recipient,input:'0x'}]:[]};},getLogs:async(q:typeof calls[number])=>{calls.push(q);return q.address?[]:[{...transfer,blockNumber:102n,removed:false}];}} as unknown as NonNullable<Parameters<typeof indexBlock>[1]>;
 await indexBlockRange(101n,132n,fake);expect(calls).toHaveLength(3);expect(calls.every(q=>q.fromBlock===101n&&q.toBlock===132n)).toBe(true);expect(blocks).toHaveLength(32);expect(blocks[0]).toBe(101n);expect(blocks.at(-1)).toBe(132n);
 expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({last_processed_block:132});
 expect(db.query("SELECT block_number,amount_raw FROM arc_address_activity WHERE activity_type='token_transfer'").all()).toEqual([{block_number:102,amount_raw:'1000000'}]);
});
test('failed or unverifiable window logs never advance a checkpoint; a later block failure keeps only a contiguous prefix',async()=>{
 const base={getBlock:async()=>({timestamp:1_700_000_000n,transactions:[]}),getLogs:async()=>[]} as unknown as NonNullable<Parameters<typeof indexBlock>[1]>;
 await expect(indexBlockRange(101n,132n,{...base,getLogs:async()=>{throw Error('rate limited');}} as typeof base)).rejects.toThrow('rate limited');
 await expect(indexBlockRange(101n,132n,{...base,getLogs:async()=>[{...transfer,blockNumber:140n}]} as unknown as typeof base)).rejects.toThrow('Unverifiable');
 expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({last_processed_block:100});
 const partial={...base,getBlock:async({blockNumber}:{blockNumber:bigint})=>{if(blockNumber===105n)throw Error('block failed');return {timestamp:1_700_000_000n,transactions:[]};}} as unknown as typeof base;
 await expect(indexBlockRange(101n,132n,partial)).rejects.toThrow('block failed');expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({last_processed_block:104});
 await indexBlockRange(105n,132n,base);expect(db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=5042').get()).toEqual({last_processed_block:132});
 await expect(indexBlockRange(133n,261n,base)).rejects.toThrow('bounded');
});
