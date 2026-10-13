import {describe,it,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {normalizeWalletTransfer,parseWalletFilters,matchesWalletTransfer,encodeWalletCursor,decodeWalletCursor,scanWalletHistory,scanArcTransferFeed,initWalletTables,saveWalletLabel,walletLabel} from './arcWallet';
import {ARC_USDC,decimalRaw,displayRaw,summarizeTransfers} from '../src/arc-wallet';
const subject='0x1111111111111111111111111111111111111111',peer='0x2222222222222222222222222222222222222222';
const raw=(index=1,amount='1000000')=>({transaction_hash:'0x'+'a'.repeat(64),log_index:index,block_number:100-index,
  timestamp:'2026-09-30T10:00:00Z',from:{hash:peer},to:{hash:subject},token:{address_hash:ARC_USDC,decimals:'6',symbol:'USDC'},total:{value:amount,decimals:'6'}});
describe('Arc wallet amounts and identity',()=>{
  it('keeps micro-USDC and large amounts exact',()=>{
    expect(decimalRaw('9007199254740993.000001',6)).toBe(9007199254740993000001n);
    expect(displayRaw('9007199254740993000001')).toBe('9,007,199,254,740,993.000001');
    expect(()=>decimalRaw('0.0000001',6)).toThrow();
    expect(matchesWalletTransfer(normalizeWalletTransfer(raw(1,'1'),subject)!,parseWalletFilters({minimum:'0.000001'}))).toBe(true);
  });
  it('rejects missing log identity, metadata, and lookalike precision',()=>{
    expect(normalizeWalletTransfer({...raw(),log_index:null},subject)).toBeNull();
    expect(normalizeWalletTransfer({...raw(),total:{value:'10'},token:{address_hash:ARC_USDC}},subject)).toBeNull();
    expect(normalizeWalletTransfer({...raw(),total:{value:'10',decimals:'18'}},subject)).toBeNull();
    expect(normalizeWalletTransfer(raw(), '0x'+'3'.repeat(40))).toBeNull();
  });
  it('keeps multiple transfers in one tx and excludes self transfers from cashflow',()=>{
    const a=normalizeWalletTransfer(raw(1,'1'),subject)!,b=normalizeWalletTransfer(raw(2,'2'),subject)!;
    const self=normalizeWalletTransfer({...raw(3),from:{hash:subject}},subject)!;
    expect(a.id).not.toBe(b.id);expect(self.direction).toBe('self');
    expect(summarizeTransfers([a,b,self]).incoming).toBe(3n);expect(summarizeTransfers([a,b,self]).peers[0].count).toBe(2);
  });
  it('validates date boundaries, token/minimum pairing, and counterpart filter',()=>{
    expect(()=>parseWalletFilters({from:'2026-02-30'})).toThrow();
    expect(()=>parseWalletFilters({from:'2026-10-01',to:'2026-09-01'})).toThrow();
    expect(()=>parseWalletFilters({minimum:'1',token:'all'})).toThrow();
    const t=normalizeWalletTransfer(raw(),subject)!;
    expect(matchesWalletTransfer(t,parseWalletFilters({from:'2026-09-30',to:'2026-09-30',peer}))).toBe(true);
    expect(matchesWalletTransfer(t,parseWalletFilters({direction:'out'}))).toBe(false);
  });
});
describe('history pagination',()=>{
  it('binds cursors to address and filters and rejects tampering',()=>{
    const f=parseWalletFilters({}),cursor=encodeWalletCursor(subject,f,{index:50,block_number:10});
    expect(decodeWalletCursor(cursor,subject,f)).toEqual({index:50,block_number:10});
    expect(()=>decodeWalletCursor(cursor,peer,f)).toThrow();
    expect(()=>decodeWalletCursor(cursor,subject,{...f,minimum:'10'})).toThrow();
    expect(()=>decodeWalletCursor(cursor+'x',subject,f)).toThrow();
    expect(()=>decodeWalletCursor(cursor+'.extra',subject,f)).toThrow();
  });
  it('returns every matching row in a full source page without losing its tail',async()=>{
    const items=Array.from({length:50},(_,i)=>raw(i));
    const p=await scanWalletHistory(subject,parseWalletFilters({}),{},async()=>({items,next_page_params:{block_number:10,index:49}}));
    expect(p.items.length).toBe(50);expect(p.items[49].logIndex).toBe(49);expect(p.nextCursor).not.toBeNull();
  });
  it('continues sparse filters through later pages and preserves empty continuation',async()=>{
    let pages=0;const f=parseWalletFilters({minimum:'10'});
    const p=await scanWalletHistory(subject,f,{},async path=>{pages++;if(pages>1)expect(path).toContain('index=');return {items:[raw(pages,pages===3?'12000000':'1000000')],next_page_params:{block_number:10,index:pages}};});
    expect(p.scannedPages).toBe(3);expect(p.items.length).toBe(1);expect(p.items[0].raw).toBe('12000000');expect(p.nextCursor).not.toBeNull();
    const empty=await scanWalletHistory(subject,f,{},async()=>({items:[],next_page_params:null}));expect(empty.nextCursor).toBeNull();
  });
  it('does not present provider errors or invalid pagination as an empty history',async()=>{
    await expect(scanWalletHistory(subject,parseWalletFilters({}),{},async()=>{throw new Error('upstream');})).rejects.toThrow();
    await expect(scanWalletHistory(subject,parseWalletFilters({}),{index:1},async()=>({items:[],next_page_params:{index:1}}))).rejects.toThrow();
  });
  it('accepts Blockscout repeated query fields without allowing them to change the filters',async()=>{
    const filters=parseWalletFilters({direction:'in'});
    const page=await scanWalletHistory(subject,filters,{index:113,block_number:100,token:ARC_USDC,type:'ERC-20',filter:'to',batch_log_index:null},async path=>{
      expect(path).toContain('index=113');expect(path).not.toContain('token=');expect(path.match(/type=/g)?.length).toBe(1);
      return {items:[raw()],next_page_params:null};
    });
    expect(page.items.length).toBe(1);
    await expect(scanWalletHistory(subject,filters,{token:peer},async()=>({items:[],next_page_params:null}))).rejects.toThrow();
  });
});
describe('private labels',()=>{
  it('isolates users and allows deletion without affecting another account',()=>{
    const db=new Database(':memory:');initWalletTables(db);saveWalletLabel(db,'alice',subject,'Hazine');
    expect(walletLabel(db,'alice',subject.toUpperCase())).toBe('Hazine');expect(walletLabel(db,'bob',subject)).toBe('');
    saveWalletLabel(db,'bob',subject,'Operasyon');expect(walletLabel(db,'alice',subject)).toBe('Hazine');
    saveWalletLabel(db,'alice',subject,'');expect(walletLabel(db,'alice',subject)).toBe('');expect(walletLabel(db,'bob',subject)).toBe('Operasyon');
    expect(()=>saveWalletLabel(db,'bob',subject,'x'.repeat(61))).toThrow();db.close();
  });
});


describe('network USDC feed',()=>{
  it('preserves all logs and page tails, exports only public Explorer names',async()=>{
    const items=Array.from({length:50},(_,i)=>({...raw(i),from:{hash:peer,name:'Public contract',private_tags:[{label:'Secret'}]},to:{hash:subject,private_tags:[{label:'Hidden'}]}}));
    const p=await scanArcTransferFeed('1',{},async()=>({items,next_page_params:{block_number:80,index:49}}));
    expect(p.items.length).toBe(50);expect(new Set(p.items.map(t=>t.id)).size).toBe(50);
    expect(p.items[49].logIndex).toBe(49);expect(p.items[0].fromName).toBe('Public contract');expect(p.items[0].toName).toBeNull();
    expect(JSON.stringify(p)).not.toContain('Secret');expect(JSON.stringify(p)).not.toContain('Hidden');
    const next=decodeWalletCursor(p.nextCursor!,'arc-usdc-feed',parseWalletFilters({minimum:'1'}));
    expect(next).toEqual({block_number:80,index:49});
    expect(()=>decodeWalletCursor(p.nextCursor!,subject,parseWalletFilters({minimum:'1'}))).toThrow();
    expect(()=>decodeWalletCursor(p.nextCursor!,'arc-usdc-feed',parseWalletFilters({minimum:'0'}))).toThrow();
  });
  it('filters by exact USDC amount and rejects other assets or precision',async()=>{
    const p=await scanArcTransferFeed('9007199254740993.000001',{},async()=>({items:[raw(1,'9007199254740993000000'),raw(2,'9007199254740993000001'),{...raw(3,'9007199254740993000002'),token:{address_hash:peer,decimals:'6'}},{...raw(4,'9007199254740993000003'),total:{value:'9007199254740993000003',decimals:'18'}}],next_page_params:null}));
    expect(p.items.map(t=>t.logIndex)).toEqual([2]);expect(p.skipped).toBe(2);
  });
  it('scans sparse pages within a bound without losing continuation',async()=>{
    let calls=0;const p=await scanArcTransferFeed('10',{},async path=>{calls++;expect(path).toStartWith(`/tokens/${ARC_USDC}/transfers`);return {items:[raw(calls,calls===3?'10000000':'1')],next_page_params:{block_number:100,index:calls}};});
    expect(calls).toBe(3);expect(p.items.length).toBe(1);expect(p.nextCursor).not.toBeNull();
  });
  it('rejects URL overrides, stalled cursors, and provider failures',async()=>{
    await expect(scanArcTransferFeed('1',{url:'https://attacker.invalid'},async()=>({items:[],next_page_params:null}))).rejects.toThrow();
    await expect(scanArcTransferFeed('1',{index:1},async()=>({items:[],next_page_params:{index:1}}))).rejects.toThrow();
    await expect(scanArcTransferFeed('1',{},async()=>{throw new Error('upstream');})).rejects.toThrow();
  });
});
