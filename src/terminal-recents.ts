import {PALETTE_CHAINS,classifyQuery,type PaletteChainId,type RecentSearch} from './terminal-command';

/** Per-device memory for the command palette. Storage can be missing, full or hostile: every path fails soft. */
export const RECENTS_KEY='carpan.terminal.recents.v1';
export const CHAIN_KEY='carpan.terminal.chain.v1';
const MAX_RECENTS=8;
type ReadStorage=Pick<Storage,'getItem'>;
type WriteStorage=Pick<Storage,'setItem'>;

const normalise=(entry:RecentSearch)=>entry.query.trim().toLowerCase();
function valid(value:unknown):value is RecentSearch{
 if(!value||typeof value!=='object')return false;
 const {query,type}=value as Record<string,unknown>;
 if(typeof query!=='string'||typeof type!=='string')return false;
 if(!['address','hash','block','text'].includes(type))return false;
 // A stored address, hash or block must still classify as that type; anything else is junk.
 const kind=classifyQuery(query);
 return type==='text'?kind.type==='text':kind.type===type;
}

export function addRecent(list:RecentSearch[],entry:RecentSearch):RecentSearch[]{
 const query=entry.query.trim();
 if(!query)return list.slice(0,MAX_RECENTS);
 const next:RecentSearch={query:entry.type==='address'||entry.type==='hash'?query.toLowerCase():query,type:entry.type};
 return [next,...list.filter(r=>normalise(r)!==normalise(next))].slice(0,MAX_RECENTS);
}

export function loadRecents(storage:ReadStorage):RecentSearch[]{
 try{
  const parsed:unknown=JSON.parse(storage.getItem(RECENTS_KEY)??'[]');
  return Array.isArray(parsed)?parsed.filter(valid).slice(0,MAX_RECENTS):[];
 }catch{return [];}
}
export function saveRecents(storage:WriteStorage,list:RecentSearch[]){
 try{storage.setItem(RECENTS_KEY,JSON.stringify(list.slice(0,MAX_RECENTS)));}catch{/* The palette works without memory. */}
}

export function loadChain(storage:ReadStorage):PaletteChainId{
 try{
  const value=storage.getItem(CHAIN_KEY);
  return PALETTE_CHAINS.find(c=>c.id===value)?.id??'5042';
 }catch{return '5042';}
}
export function saveChain(storage:WriteStorage,chain:PaletteChainId){
 try{storage.setItem(CHAIN_KEY,chain);}catch{/* Preference only. */}
}
