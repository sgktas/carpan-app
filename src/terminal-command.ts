import {ARC_USDC} from './arc-wallet';
import {ARC_ASSETS} from './arc-asset-transfers';
import {researchUrl,type ExplorerRow} from './chain-explorer';

/** Pure logic for the Terminal navigation and command palette: no UI, no network. Labels are Turkish source strings translated by the UI. */

export const PALETTE_CHAINS=[
 {id:'5042',name:'Arc',explorer:'https://explorer.arc.io'},
 {id:'8453',name:'Base',explorer:'https://base.blockscout.com'},
 {id:'42161',name:'Arbitrum',explorer:'https://arbitrum.blockscout.com'},
 {id:'1',name:'Ethereum',explorer:'https://eth.blockscout.com'},
] as const;
export type PaletteChainId=typeof PALETTE_CHAINS[number]['id'];
const chainInfo=(id:string)=>PALETTE_CHAINS.find(c=>c.id===id)??PALETTE_CHAINS[0];

/** Reviewed Arc assets only (the same lists the rest of the app already trusts). */
export const VERIFIED_ASSETS:readonly {symbol:string;address:string}[]=[
 {symbol:'USDC',address:ARC_USDC.toLowerCase()},
 ...ARC_ASSETS.map(a=>({symbol:a.symbol,address:a.address.toLowerCase()})),
];

export type QueryKind={type:'empty'}|{type:'address'|'hash'|'block'|'text';value:string};
export function classifyQuery(input:string):QueryKind{
 const value=input.trim();
 if(!value)return {type:'empty'};
 if(/^0x[0-9a-fA-F]{40}$/.test(value))return {type:'address',value:value.toLowerCase()};
 if(/^0x[0-9a-fA-F]{64}$/.test(value))return {type:'hash',value:value.toLowerCase()};
 if(/^(0|[1-9]\d{0,15})$/.test(value))return {type:'block',value};
 return {type:'text',value:value.slice(0,100)};
}

export type DestinationKind='address'|'transaction'|'block'|'token';
export function destinationUrl(chain:string,kind:DestinationKind,value:string):string{
 const id=encodeURIComponent(chain),v=encodeURIComponent(value);
 if(kind==='address')return researchUrl(chain,value);
 if(kind==='transaction')return `/arc?view=explorer&chain=${id}&hash=${v}&data=tx`;
 if(kind==='block')return `/arc?view=explorer&chain=${id}&block=${v}&data=block`;
 return `/arc?view=explorer&chain=${id}&token=${v}&data=token`;
}

/* ───── Navigation: one table drives the header, the sub-row, the active state and the palette's "go" list. ───── */
export type NavItem={key:string;label:string;to:string;keywords:string[]};
export type NavGroup={key:'live'|'explore'|'watch';label:string;to:string;views:string[];items:NavItem[]};
export const NAV_GROUPS:NavGroup[]=[
 {key:'live',label:'Canlı',to:'/arc',views:['overview'],items:[]},
 {key:'explore',label:'Keşfet',to:'/arc?view=explorer',views:['explorer','token','contracts','verified','flow'],items:[
  {key:'explorer',label:'Gezgin',to:'/arc?view=explorer',keywords:['gezgin','explorer','araştır','arastir']},
  {key:'token',label:'Token',to:'/arc?view=token',keywords:['token','varlık','varlik']},
  {key:'contracts',label:'Kontratlar',to:'/arc?view=contracts',keywords:['kontrat','contract','dağıtım','dagitim']},
  {key:'verified',label:'Doğrulananlar',to:'/arc?view=verified',keywords:['doğrulanan','dogrulanan','verified']},
  {key:'flow',label:'Akış haritası',to:'/arc?view=flow',keywords:['akış','akis','flow']},
 ]},
 {key:'watch',label:'İzleme',to:'/arc?view=following',views:['following','alerts','labels'],items:[
  {key:'following',label:'Takip listem',to:'/arc?view=following',keywords:['takip','izleme','watchlist','follow']},
  {key:'alerts',label:'Alarmlar',to:'/arc?view=alerts',keywords:['alarm','alert','bildirim']},
  {key:'labels',label:'Etiketler',to:'/arc?view=labels',keywords:['etiket','label']},
 ]},
];
const LIVE_PAGE:NavItem={key:'overview',label:'Canlı',to:'/arc',keywords:['canlı','canli','live','keşif','kesif','discover']};
export function activeGroup(view:string|undefined):NavGroup['key']|null{
 if(view===undefined)return 'live';
 return NAV_GROUPS.find(g=>g.views.includes(view))?.key??null;
}
const PAGES:NavItem[]=[LIVE_PAGE,...NAV_GROUPS.flatMap(g=>g.items)];

/* ───── Palette items ───── */
export type PaletteAction=
 |{type:'navigate';to:string}
 |{type:'watch';chain:string;address:string}
 |{type:'copy';value:string}
 |{type:'external';url:string}
 |{type:'search';query:string};
export type PaletteItem={id:string;group:'actions'|'go'|'results'|'recent';label:string;labelArgs?:string[];hint?:string;hintArgs?:string[];badge?:'verified'|'lookalike';action:PaletteAction};
export type RecentSearch={query:string;type:'address'|'hash'|'block'|'text'};

const short=(value:string)=>value.length>16?`${value.slice(0,8)}…${value.slice(-4)}`:value;
const MAX_RESULTS=8;

function addressActions(chain:string,address:string):PaletteItem[]{
 const info=chainInfo(chain);
 const items:PaletteItem[]=[
  {id:`open:${address}`,group:'actions',label:'Adresi aç',hint:short(address),action:{type:'navigate',to:destinationUrl(chain,'address',address)}},
  {id:`watch:${address}`,group:'actions',label:'Adresi izle',hint:info.name,action:{type:'watch',chain,address}},
 ];
 // Alerts are an Arc-only product feature today.
 if(chain==='5042')items.push({id:`alarm:${address}`,group:'actions',label:'Alarm kur',action:{type:'navigate',to:`/arc?view=alerts&address=${address}`}});
 items.push(
  {id:`copy:${address}`,group:'actions',label:'Adresi kopyala',action:{type:'copy',value:address}},
  {id:`ext:${address}`,group:'actions',label:'Explorer’da aç',hint:info.name,action:{type:'external',url:`${info.explorer}/address/${address}`}},
 );
 return items;
}

function pageItems(text:string):PaletteItem[]{
 const q=text.trim().toLowerCase();
 return PAGES.filter(p=>!q||p.label.toLowerCase().includes(q)||p.keywords.some(k=>k.includes(q)))
  .map(p=>({id:`go:${p.key}`,group:'go' as const,label:p.label,action:{type:'navigate' as const,to:p.to}}));
}

const symbolKey=(symbol:string)=>symbol.toUpperCase().replace(/[^A-Z0-9]/g,'');
/** One character inserted/removed, or two adjacent characters swapped. Substitutions are deliberately excluded so USDT or USD1 are not mistaken for USDC. */
function oneEditApart(a:string,b:string):boolean{
 if(Math.abs(a.length-b.length)===1){
  const [long,short]=a.length>b.length?[a,b]:[b,a];
  for(let i=0;i<long.length;i++)if(long.slice(0,i)+long.slice(i+1)===short)return true;
  return false;
 }
 if(a.length!==b.length)return false;
 for(let i=0;i<a.length-1;i++)if(a.slice(0,i)+a[i+1]+a[i]+a.slice(i+2)===b)return true;
 return false;
}
/** A non-verified token whose symbol is, or looks like, a verified asset's symbol (same, typo-squat, or the symbol plus a short suffix). */
function lookalikeOf(symbol:string):{asset:string;exact:boolean}|null{
 const key=symbolKey(symbol);
 if(!key)return null;
 for(const asset of VERIFIED_ASSETS){
  const ref=symbolKey(asset.symbol);
  if(key===ref)return {asset:asset.symbol,exact:true};
  if(ref.length<4||key.length<4)continue;
  if((key.startsWith(ref)&&key.length-ref.length<=4)||oneEditApart(key,ref))return {asset:asset.symbol,exact:false};
 }
 return null;
}

export function searchResultItems(chain:string,rows:ExplorerRow[]):PaletteItem[]{
 const arc=chain==='5042',items:PaletteItem[]=[];
 for(const row of rows){
  const type=String(row.data.type??'');
  const address=row.address;
  if(type==='ens_domain'){
   if(chain==='1'&&address)items.push({id:`r:ens:${address}`,group:'results',label:row.title||short(address),hint:'ENS',action:{type:'navigate',to:destinationUrl(chain,'address',address)}});
   continue;
  }
  if(type==='token'&&address){
   const verified=arc&&VERIFIED_ASSETS.some(a=>a.address===address);
   const match=arc&&!verified?lookalikeOf(row.symbol):null;
   items.push({id:`r:token:${address}`,group:'results',label:row.title||row.symbol||short(address),
    ...(match?(match.exact?{hint:'Aynı sembol ({0}), farklı kontrat',hintArgs:[row.symbol]}:{hint:'Benzer sembol ({0}); {1} ile karışabilir',hintArgs:[row.symbol,match.asset]}):{hint:row.symbol||short(address)}),
    ...(verified?{badge:'verified' as const}:match?{badge:'lookalike' as const}:{}),
    action:{type:'navigate',to:destinationUrl(chain,'token',address)}});
   continue;
  }
  if((type==='contract'||type==='address'||type==='label')&&address){
   items.push({id:`r:address:${address}`,group:'results',label:row.title||short(address),hint:row.title?short(address):type==='contract'?'Kontrat':'Adres',action:{type:'navigate',to:destinationUrl(chain,'address',address)}});
   continue;
  }
  if(type==='block'&&row.block!==null){
   items.push({id:`r:block:${row.block}`,group:'results',label:'Blok #{0}',labelArgs:[String(row.block)],action:{type:'navigate',to:destinationUrl(chain,'block',String(row.block))}});
   continue;
  }
  if(type==='transaction'&&row.hash){
   items.push({id:`r:tx:${row.hash}`,group:'results',label:'İşlem',hint:short(row.hash),action:{type:'navigate',to:destinationUrl(chain,'transaction',row.hash)}});
  }
 }
 const rank=(item:PaletteItem)=>item.badge==='verified'?0:item.badge==='lookalike'?2:1;
 return items.map((item,index)=>({item,index})).sort((a,b)=>rank(a.item)-rank(b.item)||a.index-b.index).map(x=>x.item).slice(0,MAX_RESULTS);
}

function recentItems(chain:string,recents:RecentSearch[]):PaletteItem[]{
 return recents.map(r=>{
  const action:PaletteAction=r.type==='address'?{type:'navigate',to:destinationUrl(chain,'address',r.query)}
   :r.type==='hash'?{type:'navigate',to:destinationUrl(chain,'transaction',r.query)}
   :r.type==='block'?{type:'navigate',to:destinationUrl(chain,'block',r.query)}
   :{type:'search',query:r.query};
  return {id:`recent:${r.type}:${r.query}`,group:'recent' as const,label:r.type==='address'||r.type==='hash'?short(r.query):r.query,action};
 });
}

export function buildPaletteItems({input,chain,searchRows,recents}:{input:string;chain:string;searchRows:ExplorerRow[];recents:RecentSearch[]}):PaletteItem[]{
 const kind=classifyQuery(input);
 if(kind.type==='empty')return [...recentItems(chain,recents),...pageItems('')];
 if(kind.type==='address')return addressActions(chain,kind.value);
 if(kind.type==='hash')return [
  {id:`tx:${kind.value}`,group:'actions',label:'İşlemi aç',hint:short(kind.value),action:{type:'navigate',to:destinationUrl(chain,'transaction',kind.value)}},
  {id:`blockhash:${kind.value}`,group:'actions',label:'Blok hash’i olarak aç',action:{type:'navigate',to:destinationUrl(chain,'block',kind.value)}},
  {id:`copy:${kind.value}`,group:'actions',label:'Hash’i kopyala',action:{type:'copy',value:kind.value}},
 ];
 if(kind.type==='block')return [{id:`block:${kind.value}`,group:'actions',label:'Blok #{0}',labelArgs:[kind.value],action:{type:'navigate',to:destinationUrl(chain,'block',kind.value)}}];
 return [...pageItems(kind.value),...searchResultItems(chain,searchRows)];
}
