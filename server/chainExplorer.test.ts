import {describe,expect,test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {normalizeDirectory,parseExplorerQuery,explorerPath,encodeExplorerCursor,decodeExplorerCursor,normalizeExplorerRow,initNetworkWatch,saveNetworkWatch,networkWatchlist,arcResearchQuery,explorerData} from './chainExplorer';
describe('multichain research boundaries',()=>{
 test('selected mainnets support research while unsupported chains fail before network reads',async()=>{
  expect(arcResearchQuery('5042',{kind:'transfers'})).toEqual({kind:'transfers'});
  expect(explorerPath(arcResearchQuery('5042',{kind:'transfers'}))).toBe('/token-transfers');
  expect(arcResearchQuery('5042',{kind:'transfers',type:'ERC-721'}).type).toBe('ERC-721');
  const token='0x'+'1'.repeat(40);
  expect(arcResearchQuery('5042',{kind:'transfers',token}).token).toBe(token);
  expect(arcResearchQuery('8453',{kind:'transfers'})).toEqual({kind:'transfers'});
  expect(arcResearchQuery('42161',{kind:'address',address:token})).toEqual({kind:'address',address:token});
  await expect(explorerData('84532',{kind:'transfers'})).rejects.toThrow('Unsupported research network');
 });
 test('only numeric supported IDs and HTTPS explorer metadata enter the directory',()=>{
  expect(normalizeDirectory({'1':'https://eth.blockscout.com','x':'https://evil.test','2':'http://localhost','3':'https://user:pass@host.test'},{'1':{name:'Ethereum',isTestnet:false}})).toEqual([{id:'1',name:'Ethereum',explorer:'https://eth.blockscout.com',isTestnet:false,nativeSymbol:'',nativeDecimals:18}]);
 });
 test('a continuation cannot be replayed against another chain, address or token filter',()=>{
  const q=parseExplorerQuery({kind:'transfers',address:'0x'+'1'.repeat(40),type:'ERC-20'});
  const cursor=encodeExplorerCursor('1',q,{block_number:123,index:4});
  expect(decodeExplorerCursor('1',{...q,cursor})).toEqual({block_number:123,index:4});
  expect(()=>decodeExplorerCursor('8453',{...q,cursor})).toThrow();
  expect(()=>decodeExplorerCursor('1',{...q,address:'0x'+'2'.repeat(40),cursor})).toThrow();
  expect(()=>decodeExplorerCursor('1',{...q,type:'ERC-721',cursor})).toThrow();
  expect(()=>decodeExplorerCursor('1',{...q,cursor:cursor+'a'})).toThrow();
 });
 test('arbitrary paths, URLs and missing research identities are rejected',()=>{
  expect(()=>parseExplorerQuery({kind:'../../admin'})).toThrow();
  expect(()=>parseExplorerQuery({kind:'address',address:'https://localhost'})).toThrow();
  expect(()=>parseExplorerQuery({kind:'tx'})).toThrow();
  expect(()=>explorerPath({kind:'transfers'},{url:'https://localhost'})).toThrow();
 });
 test('ERC20 raw amounts retain integer precision and transfers differ by chain',()=>{
  const row={transaction_hash:'0x'+'a'.repeat(64),log_index:3,from:{hash:'0x'+'1'.repeat(40)},to:{hash:'0x'+'2'.repeat(40)},token:{address_hash:'0x'+'3'.repeat(40),decimals:'18',symbol:'TOKEN'},total:{value:'123456789012345678901234567890',decimals:'18'}};
  const a=normalizeExplorerRow(row,'1','transfers',0),b=normalizeExplorerRow(row,'8453','transfers',0);
  expect(a.raw).toBe('123456789012345678901234567890');expect(a.decimals).toBe(18);expect(a.id).not.toBe(b.id);
  expect(normalizeExplorerRow({hash:'0x'+'b'.repeat(64),height:123},'1','blocks',0).hash).toBeNull();
 });
 test('NFT ID is not converted into fungible amount or a price',()=>{
  const row=normalizeExplorerRow({token:{type:'ERC-721',symbol:'NFT'},total:{token_id:'999999999999999999999',value:'1'}},'1','transfers',0);
  expect(row.nftId).toBe('999999999999999999999');expect(row.decimals).toBeNull();
 });
 test('address scope and type are carried into every transfer page',()=>{
  const q=parseExplorerQuery({kind:'transfers',address:'0x'+'1'.repeat(40),type:'ERC-1155'});
  expect(explorerPath(q,{block_number:12,index:3})).toBe(`/addresses/${q.address}/token-transfers?type=ERC-1155&block_number=12&index=3`);
  expect(()=>explorerPath(q,{type:'ERC-20'})).toThrow();
 });
 test('watch records persist across reopening and isolate both account and network',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const folder=mkdtempSync(join(tmpdir(),'carpan-watch-')),file=join(folder,'test.db');let db=new Database(file);
  const networks=normalizeDirectory({'1':'https://eth.blockscout.com','8453':'https://base.blockscout.com'},{});
  const directory=async()=>({networks,asOf:'test',stale:false,proConfigured:true}),a='0x'+'1'.repeat(40);
  try{initNetworkWatch(db);await saveNetworkWatch(db,'alice','1',{address:a,label:'Ethereum'},false,directory);await saveNetworkWatch(db,'alice','8453',{address:a,label:'Base'},false,directory);await saveNetworkWatch(db,'bob','1',{address:a,label:'Private'},false,directory);
   db.close();db=new Database(file);expect(networkWatchlist(db,'alice')).toHaveLength(2);expect(networkWatchlist(db,'bob')[0].label).toBe('Private');
   await saveNetworkWatch(db,'alice','1',{address:a},true,directory);expect(networkWatchlist(db,'alice')[0].chainId).toBe('8453');expect(networkWatchlist(db,'bob')).toHaveLength(1);
  }finally{db.close();rmSync(folder,{recursive:true,force:true});}
 });
});
