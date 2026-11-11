import {test,expect} from 'bun:test';
import {classifyQuery,destinationUrl,buildPaletteItems,activeGroup,NAV_GROUPS,PALETTE_CHAINS,searchResultItems,VERIFIED_ASSETS} from '../src/terminal-command';
import type {ExplorerRow} from '../src/chain-explorer';

const ADDRESS='0x'+'ab'.repeat(20),HASH='0x'+'cd'.repeat(32);
const row=(type:string,over:Partial<ExplorerRow>={},data:Record<string,unknown>={}):ExplorerRow=>({id:Math.random().toString(),title:'',address:null,from:null,to:null,hash:null,token:null,symbol:'',raw:null,decimals:null,nftId:null,block:null,timestamp:null,status:null,data:{type,...data},...over});

test('classifyQuery recognises addresses, hashes, blocks and text without a network call',()=>{
 expect(classifyQuery('')).toEqual({type:'empty'});
 expect(classifyQuery('   ')).toEqual({type:'empty'});
 expect(classifyQuery(ADDRESS.toUpperCase().replace('0X','0x'))).toEqual({type:'address',value:ADDRESS});
 expect(classifyQuery(`  ${ADDRESS}  `)).toEqual({type:'address',value:ADDRESS});
 expect(classifyQuery(HASH)).toEqual({type:'hash',value:HASH});
 expect(classifyQuery('30686511')).toEqual({type:'block',value:'30686511'});
 expect(classifyQuery('0')).toEqual({type:'block',value:'0'});
 expect(classifyQuery('usdc')).toEqual({type:'text',value:'usdc'});
});

test('malformed hex and oversized input never become addresses, hashes or blocks',()=>{
 expect(classifyQuery('0x'+'ab'.repeat(19)).type).toBe('text');
 expect(classifyQuery('0x'+'zz'.repeat(20)).type).toBe('text');
 expect(classifyQuery('0x'+'ab'.repeat(33)).type).toBe('text');
 expect(classifyQuery('007').type).toBe('text');
 expect(classifyQuery('1'.repeat(17)).type).toBe('text');
 const long=classifyQuery('a'.repeat(300));expect(long.type).toBe('text');expect((long as {value:string}).value.length).toBe(100);
});

test('destinations stay on existing URLs and carry the selected network',()=>{
 expect(destinationUrl('5042','address',ADDRESS)).toBe(`/arc/addresses/${ADDRESS}`);
 expect(destinationUrl('8453','address',ADDRESS)).toBe(`/arc?view=explorer&chain=8453&address=${ADDRESS}`);
 expect(destinationUrl('5042','transaction',HASH)).toBe(`/arc?view=explorer&chain=5042&hash=${HASH}&data=tx`);
 expect(destinationUrl('1','block','123')).toBe('/arc?view=explorer&chain=1&block=123&data=block');
 expect(destinationUrl('42161','token',ADDRESS)).toBe(`/arc?view=explorer&chain=42161&token=${ADDRESS}&data=token`);
});

test('an address offers open, watch, alarm (Arc only), copy and external actions',()=>{
 const arc=buildPaletteItems({input:ADDRESS,chain:'5042',searchRows:[],recents:[]}).filter(i=>i.group==='actions');
 expect(arc.map(i=>i.action.type)).toEqual(['navigate','watch','navigate','copy','external']);
 expect(arc[2].action).toEqual({type:'navigate',to:`/arc?view=alerts&address=${ADDRESS}`});
 expect(arc[4].action).toEqual({type:'external',url:`https://explorer.arc.io/address/${ADDRESS}`});
 const base=buildPaletteItems({input:ADDRESS,chain:'8453',searchRows:[],recents:[]}).filter(i=>i.group==='actions');
 expect(base.map(i=>i.action.type)).toEqual(['navigate','watch','copy','external']);
 expect(base[3].action).toEqual({type:'external',url:`https://base.blockscout.com/address/${ADDRESS}`});
});

test('a 64-hex value opens as a transaction first and as a block hash second',()=>{
 const items=buildPaletteItems({input:HASH,chain:'5042',searchRows:[],recents:[]}).filter(i=>i.group==='actions');
 expect(items[0].action).toEqual({type:'navigate',to:destinationUrl('5042','transaction',HASH)});
 expect(items[1].action).toEqual({type:'navigate',to:destinationUrl('5042','block',HASH)});
});

test('page commands match Turkish and English words; empty input lists them all',()=>{
 const text=(input:string)=>buildPaletteItems({input,chain:'5042',searchRows:[],recents:[]}).filter(i=>i.group==='go').map(i=>i.action.type==='navigate'?i.action.to:'');
 expect(text('alarm')).toContain('/arc?view=alerts');
 expect(text('watchlist')).toContain('/arc?view=following');
 expect(text('canlı')).toContain('/arc');
 expect(text('xyzxyz')).toEqual([]);
 expect(text('').length).toBe(9);
});

test('a verified asset ranks first and a same-symbol lookalike is flagged and pushed last on Arc',()=>{
 const usdc=VERIFIED_ASSETS.find(a=>a.symbol==='USDC')!;
 const fake='0x'+'11'.repeat(20);
 const rows=[row('token',{address:fake,title:'UpSideDownCat',symbol:'USDC'}),row('token',{address:'0x'+'22'.repeat(20),title:'Other',symbol:'OTH'}),row('token',{address:usdc.address,title:'USDC',symbol:'USDC'})];
 const items=searchResultItems('5042',rows);
 expect(items.map(i=>i.badge)).toEqual(['verified',undefined,'lookalike']);
 expect(items[0].action).toEqual({type:'navigate',to:destinationUrl('5042','token',usdc.address)});
 expect(items[2].hintArgs).toContain('USDC');
});

test('typo-squats of a verified symbol are flagged, but a genuinely different token is not',()=>{
 const flagged=(symbol:string)=>searchResultItems('5042',[row('token',{address:'0x'+'33'.repeat(20),title:'X',symbol})])[0].badge;
 for(const symbol of ['UDSC','USDCAT','USDC-G','usdc','USDCC','USDC.e','EURCX','CIRBTC','ECURC'])expect(flagged(symbol)).toBe('lookalike');
 for(const symbol of ['USDT','USD1','DAI','WETH','PUSD','ABCD',''])expect(flagged(symbol)).toBeUndefined();
});

test('an exact match says "same symbol"; a near match says "similar symbol" and names the asset it resembles',()=>{
 const item=(symbol:string)=>searchResultItems('5042',[row('token',{address:'0x'+'33'.repeat(20),title:'X',symbol})])[0];
 expect(item('USDC').hint).toBe('Aynı sembol ({0}), farklı kontrat');
 expect(item('UDSC').hint).toBe('Benzer sembol ({0}); {1} ile karışabilir');
 expect(item('UDSC').hintArgs).toEqual(['UDSC','USDC']);
});

test('lookalike warnings apply only to Arc, because the verified list is Arc-specific',()=>{
 const items=searchResultItems('8453',[row('token',{address:'0x'+'11'.repeat(20),title:'Fake',symbol:'USDC'})]);
 expect(items[0].badge).toBeUndefined();
});

test('ENS results are hidden outside Ethereum, and unknown result types are ignored',()=>{
 const rows=[row('ens_domain',{address:ADDRESS,title:'x.eth'}),row('weird',{address:ADDRESS}),row('contract',{address:ADDRESS,title:'Pool'})];
 expect(searchResultItems('5042',rows).length).toBe(1);
 expect(searchResultItems('1',rows).length).toBe(2);
});

test('blocks and transactions in provider results link to their pages; results are capped at 8',()=>{
 const items=searchResultItems('5042',[row('block',{block:77}),row('transaction',{hash:HASH})]);
 expect(items.map(i=>i.action.type==='navigate'?i.action.to:'')).toEqual([destinationUrl('5042','block','77'),destinationUrl('5042','transaction',HASH)]);
 const many=Array.from({length:20},(_,i)=>row('contract',{address:'0x'+i.toString(16).padStart(40,'0')}));
 expect(searchResultItems('5042',many).length).toBe(8);
});

test('empty input shows recents and every page; recents are not repeated as results',()=>{
 const items=buildPaletteItems({input:'',chain:'5042',searchRows:[],recents:[{query:ADDRESS,type:'address'},{query:'usdc',type:'text'}]});
 expect(items.filter(i=>i.group==='recent').length).toBe(2);
 expect(items.filter(i=>i.group==='actions').length).toBe(0);
});

test('every Terminal view maps to exactly one navigation group',()=>{
 for(const [view,group] of Object.entries({overview:'live',explorer:'explore',token:'explore',contracts:'explore',verified:'explore',flow:'explore',following:'watch',alerts:'watch',labels:'watch'}))expect(activeGroup(view)).toBe(group);
 expect(activeGroup('finance')).toBeNull();
 expect(activeGroup(undefined)).toBe('live');
 const targets=NAV_GROUPS.flatMap(g=>g.items.map(i=>i.to));
 expect(new Set(targets).size).toBe(targets.length);
 expect(targets).toContain('/arc?view=labels');
});

test('palette chains list Arc first and each has an explorer base',()=>{
 expect(PALETTE_CHAINS.map(c=>c.id)).toEqual(['5042','8453','42161','1']);
 for(const c of PALETTE_CHAINS)expect(c.explorer.startsWith('https://')).toBe(true);
});
