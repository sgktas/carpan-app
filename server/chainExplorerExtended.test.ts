import {describe,expect,test} from 'bun:test';
import {parseExplorerQuery,explorerPath,encodeExplorerCursor,decodeExplorerCursor,normalizeExplorerPayload,normalizeExplorerRow,arcBlockHash} from './chainExplorer';
import {abiEntries,abiSignature,explorerSearch,safeEvidenceUrl,traceAmount} from '../src/explorer-presentation';

const token='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),owner='0x'+'2'.repeat(40);
describe('Arc contextual Blockscout reads',()=>{
 test('block resources accept canonical safe numbers or hashes, reject traversal and precision loss',()=>{
  expect(explorerPath(parseExplorerQuery({kind:'block',block:'0'}))).toBe('/blocks/0');
  expect(explorerPath(parseExplorerQuery({kind:'blockTransactions',block:123}))).toBe('/blocks/123/transactions');
  expect(explorerPath(parseExplorerQuery({kind:'blockInternals',block:hash}))).toBe(`/blocks/${hash}/internal-transactions`);
  for(const block of ['-1','1.1','1e3','01','9007199254740992','../../config',token,{},['1']])expect(()=>parseExplorerQuery({kind:'block',block})).toThrow();
  expect(()=>parseExplorerQuery({kind:'blockTransactions'})).toThrow();
  expect(arcBlockHash({result:{hash,number:'0x7b'}},'123')).toBe(hash);
  expect(()=>arcBlockHash({result:{hash,number:'0x7c'}},'123')).toThrow();
  expect(()=>arcBlockHash({result:null},'123')).toThrow();
 });
 test('NFT identities retain uint256 precision and bind all continuation pages to the instance',()=>{
  const max=(2n**256n-1n).toString(),q=parseExplorerQuery({kind:'nftTransfers',token,tokenId:max});
  expect(explorerPath(q)).toBe(`/tokens/${token}/instances/${max}/transfers`);
  expect(explorerPath(parseExplorerQuery({kind:'nftCounters',token,tokenId:'0'}))).toBe(`/tokens/${token}/instances/0/transfers-count`);
  for(const tokenId of ['-1','01','1e18',(2n**256n).toString(),Number.MAX_SAFE_INTEGER+1,'../holders'])expect(()=>parseExplorerQuery({kind:'nft',token,tokenId})).toThrow();
  expect(()=>parseExplorerQuery({kind:'nft',token})).toThrow();
  const cursor=encodeExplorerCursor('5042',q,{token_id:max});
  expect(decodeExplorerCursor('5042',{...q,cursor})).toEqual({token_id:max});
  expect(()=>decodeExplorerCursor('5042',{...q,tokenId:'0',cursor})).toThrow();
 });
 test('added context paths remain explicit reads and require matching identities',()=>{
  const pairs={txInternals:`/transactions/${hash}/internal-transactions`,txTransfers:`/transactions/${hash}/token-transfers`,txTrace:`/transactions/${hash}/raw-trace`,tokenCounters:`/tokens/${token}/counters`,tokenInstances:`/tokens/${token}/instances`,nftCollections:`/addresses/${owner}/nft/collections`,balanceByDay:`/addresses/${owner}/coin-balance-history-by-day`,txStats:'/transactions/stats',globalInternals:'/internal-transactions',txChart:'/stats/charts/transactions',hotContracts:'/stats/hot-smart-contracts',contractCounters:'/smart-contracts/counters',audits:`/smart-contracts/${owner}/audit-reports`,indexing:'/main-page/indexing-status'};
  for(const [kind,path] of Object.entries(pairs))expect(explorerPath(parseExplorerQuery({kind,hash,token,address:owner}))).toBe(path);
  expect(()=>parseExplorerQuery({kind:'refetch-metadata',token})).toThrow();
  expect(()=>parseExplorerQuery({kind:'txTrace'})).toThrow();
  expect(()=>parseExplorerQuery({kind:'nftCollections'})).toThrow();
 });
 test('raw execution traces use bounded signed local pages without forwarding artificial offsets',()=>{
  const q=parseExplorerQuery({kind:'txTrace',hash}),list=Array.from({length:205},(_,i)=>({action:{from:owner,to:token,value:'0x1'},type:'call',traceAddress:[i],transactionHash:hash}));
  const first=normalizeExplorerPayload(list,'5042',q);expect(first.items).toHaveLength(100);expect(first.next).toEqual({trace_offset:100});expect(first.page).toEqual({offset:0,total:205,limit:100});
  const cursor=encodeExplorerCursor('5042',q,first.next),next=decodeExplorerCursor('5042',{...q,cursor});
  expect(explorerPath(q,next)).toBe(`/transactions/${hash}/raw-trace`);
  const second=normalizeExplorerPayload(list,'5042',q,next);expect(second.items[0].id).not.toBe(first.items[0].id);
  expect(normalizeExplorerPayload(list,'5042',q,{trace_offset:200}).items).toHaveLength(5);
  expect(()=>explorerPath(q,{trace_offset:-1})).toThrow();expect(()=>explorerPath(q,{trace_offset:1})).toThrow();expect(()=>explorerPath(q,{url:'https://evil.example'})).toThrow();
  expect(()=>normalizeExplorerPayload(Array(5001).fill({}),'5042',q)).toThrow();
  expect(()=>normalizeExplorerPayload([{input:'x'.repeat(2000001)}],'5042',q)).toThrow();
  expect(()=>normalizeExplorerPayload({message:'trace unavailable'},'5042',q)).toThrow();
  const tree=normalizeExplorerPayload({type:'CALL',from:owner,to:token,value:'0x0',calls:[{type:'STATICCALL',from:token,to:owner,value:'0x1',gasUsed:'0x123'}]},'5042',q);
  expect(tree.items).toHaveLength(2);expect(tree.items[1].data.traceAddress).toEqual([0]);expect(tree.items[1].from).toBe(token);expect(tree.items[1].hash).toBe(hash);
  expect(tree.items[0].data.calls).toBeUndefined();
 });
 test('NFT ID zero and large identifiers survive display; charts are source series, never synthetic totals',()=>{
  const row=normalizeExplorerRow({id:'0',owner:{hash:owner},metadata:{name:'First NFT'}},'5042','tokenInstances',0);
  expect(row.nftId).toBe('0');expect(row.from).toBe(owner);expect(row.title).toBe('First NFT');expect(row.raw).toBeNull();
  const result=normalizeExplorerPayload({chart_data:[{date:'2026-10-09',value:'123456789012345678901'}]},'5042',{kind:'balanceByDay',address:owner});
  expect(result.items[0].raw).toBe('123456789012345678901');expect(result.items[0].timestamp).toBe('2026-10-09');
  expect(()=>normalizeExplorerPayload({items:Array(501).fill({})},'5042',{kind:'transfers'})).toThrow();
 });
 test('read evidence does not inject URLs or lose trace values; ABI is bounded and typed',()=>{
  expect(safeEvidenceUrl('javascript:alert(1)')).toBeNull();expect(safeEvidenceUrl('https://user:password@example.com')).toBeNull();expect(safeEvidenceUrl('https://example.com/nft')).toBe('https://example.com/nft');
  expect(traceAmount('0xffffffffffffffff')).toBe('18446744073709551615');expect(traceAmount('1e18')).toBeNull();
  const abi=abiEntries(JSON.stringify([{type:'function',name:'balanceOf',inputs:[{type:'address'}],stateMutability:'view'},{type:'unknown'}]));
  expect(abi).toHaveLength(1);expect(abiSignature(abi[0])).toBe('balanceOf(address)');expect(abiEntries('[')).toEqual([]);expect(abiEntries(' '.repeat(100001))).toEqual([]);
  expect(explorerSearch('123')).toEqual({kind:'block',block:'123'});expect(explorerSearch(hash,'block')).toEqual({kind:'block',block:hash});expect(explorerSearch(hash)).toEqual({kind:'tx',hash});
 });
});
