import {t} from '../i18n/index';
import {useState} from 'react';
import {ArrowLeftRight,Coins,FileCode2,Flame,Sparkles,Workflow} from 'lucide-react';
import './terminal-visuals.css';

/** Deterministic 5×5 mirrored identicon. Purely visual: it identifies an address at a glance, never an owner. */
export function AddressAvatar({address,size=18}:{address:string|null|undefined;size?:number}){
 const value=(address||'').toLowerCase().replace(/^0x/,'');
 if(!/^[0-9a-f]{40}$/.test(value))return <span className="tv-avatar is-empty" style={{width:size,height:size}} aria-hidden="true"/>;
 const hue=parseInt(value.slice(0,3),16)%360,hue2=(hue+40+parseInt(value.slice(3,5),16)%80)%360;
 const cells:[number,number][]=[];
 for(let row=0;row<5;row++)for(let col=0;col<3;col++){if(parseInt(value[row*3+col+6],16)%2===0){cells.push([col,row]);if(col<2)cells.push([4-col,row]);}}
 return <svg className="tv-avatar" width={size} height={size} viewBox="0 0 5 5" aria-hidden="true" shapeRendering="crispEdges">
  <rect width="5" height="5" fill={`hsl(${hue2} 45% 22%)`}/>
  {cells.map(([x,y])=><rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={`hsl(${hue} 70% 62%)`}/>)}
 </svg>;
}

const allowedIcon=(url:unknown)=>{if(typeof url!=='string')return null;try{const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}};
/** Provider-supplied token logo (https only) with a letter fallback when absent or broken. */
export function TokenMark({symbol,icon,size=18}:{symbol:string;icon?:unknown;size?:number}){
 const [broken,setBroken]=useState(false),src=allowedIcon(icon);
 if(src&&!broken)return <img className="tv-token" src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={()=>setBroken(true)}/>;
 const label=(symbol||'?').replace(/[^\p{L}\p{N}]/gu,'').slice(0,1).toUpperCase()||'?';
 const hue=[...(symbol||'?')].reduce((n,c)=>(n*31+c.charCodeAt(0))%360,7);
 return <span className="tv-token is-letter" style={{width:size,height:size,fontSize:Math.round(size*.5),background:`hsl(${hue} 40% 26%)`,color:`hsl(${hue} 80% 78%)`}} aria-hidden="true">{label}</span>;
}

const types:Record<string,{label:string;icon:typeof Coins;tone:string}>={
 token_transfer:{label:'Token transferi',icon:Coins,tone:'token'},
 coin_transfer:{label:'Transfer',icon:ArrowLeftRight,tone:'coin'},
 contract_call:{label:'Kontrat çağrısı',icon:Workflow,tone:'call'},
 contract_creation:{label:'Kontrat oluşturma',icon:Sparkles,tone:'create'},
 token_minting:{label:'Basım',icon:Sparkles,tone:'create'},
 token_burning:{label:'Yakım',icon:Flame,tone:'burn'},
};
/** Blockscout transaction_types, most specific first. */
export function transactionType(value:unknown):string{
 const list=Array.isArray(value)?value.map(String):[];
 return ['contract_creation','token_minting','token_burning','token_transfer','contract_call','coin_transfer'].find(k=>list.includes(k))||'contract_call';
}
export function TxTypeBadge({type}:{type:string}){
 const meta=types[type]||{label:type,icon:FileCode2,tone:'call'},Icon=meta.icon;
 return <span className={`tv-badge is-${meta.tone}`}><Icon size={11} aria-hidden="true"/>{t(meta.label)}</span>;
}
