import type {ExplorerQuery} from './chain-explorer';

export const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'';
export function safeEvidenceUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>2048)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function traceAmount(value:unknown):string|null{
 const raw=text(value);if(/^\d{1,100}$/.test(raw))return raw;
 if(/^0x[0-9a-f]{1,64}$/i.test(raw))return BigInt(raw).toString();return null;
}
export function abiEntries(value:unknown):Record<string,unknown>[] {
 if(typeof value==='string'){if(value.length>100000)return [];try{value=JSON.parse(value);}catch{return [];}}
 return Array.isArray(value)?value.slice(0,500).map(record).filter(row=>['function','event','constructor','error','fallback','receive'].includes(text(row.type))):[];
}
export function abiSignature(row:Record<string,unknown>):string{
 const parameters=Array.isArray(row.inputs)?row.inputs.slice(0,50).map(value=>text(record(value).type).slice(0,150)):[];
 return `${text(row.name)||text(row.type)}(${parameters.join(', ')})`;
}
/** Search stays within Arc and never converts a token ID to a floating-point value. */
export function explorerSearch(value:string,mode='auto'):ExplorerQuery|null{
 const input=value.trim();if(!input)return null;
 if(mode==='block'||/^(0|[1-9]\d*)$/.test(input))return {kind:'block',block:input};
 if(/^0x[0-9a-f]{40}$/i.test(input))return {kind:'transfers',address:input.toLowerCase()};
 if(/^0x[0-9a-f]{64}$/i.test(input))return {kind:'tx',hash:input.toLowerCase()};
 return {kind:'search',q:input};
}
export function evidenceFields(value:Record<string,unknown>){
 return Object.entries(value).filter(([key,v])=>!['abi','source_code','additional_sources','next_page_params'].includes(key)&&v!==null&&v!==undefined&&(typeof v==='string'||typeof v==='number'||typeof v==='boolean')).slice(0,60);
}
