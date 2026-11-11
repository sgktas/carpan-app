import {useCallback,useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation,useNavigate} from 'react-router-dom';
import {Bell,BadgeCheck,Compass,Copy,CornerDownLeft,ExternalLink,Eye,History,LoaderCircle,Search,TriangleAlert,ArrowUpRight} from 'lucide-react';
import {toast} from 'sonner';
import {api} from '../../api';
import {useAuth} from '../../hooks/useAuth';
import {useI18n} from '../../i18n';
import type {ExplorerRow} from '../../chain-explorer';
import {PALETTE_CHAINS,buildPaletteItems,classifyQuery,type PaletteChainId,type PaletteItem,type RecentSearch} from '../../terminal-command';
import {addRecent,loadChain,loadRecents,saveChain,saveRecents} from '../../terminal-recents';
import './command-palette.css';

const GROUP_TITLES:Record<PaletteItem['group'],string>={actions:'Eylemler',go:'Git',results:'Sonuçlar',recent:'Son aramalar'};
const store=():Storage|null=>{try{return window.localStorage;}catch{return null;}};
const noStorage={getItem:()=>null,setItem:()=>{}};

function icon(item:PaletteItem){
 if(item.group==='recent')return <History size={15}/>;
 if(item.group==='go')return <Compass size={15}/>;
 switch(item.action.type){
  case 'watch':return <Eye size={15}/>;
  case 'copy':return <Copy size={15}/>;
  case 'external':return <ExternalLink size={15}/>;
  case 'search':return <Search size={15}/>;
  default:return item.id.startsWith('alarm:')?<Bell size={15}/>:<ArrowUpRight size={15}/>;
 }
}

/** Search + actions. Addresses, hashes and blocks always open directly; only free text asks the provider. */
export function CommandPalette({open,onClose}:{open:boolean;onClose:()=>void}){
 const {t}=useI18n(),{user}=useAuth(),navigate=useNavigate(),location=useLocation(),base=useId();
 const [input,setInput]=useState(''),[chain,setChain]=useState<PaletteChainId>(()=>loadChain(store()??noStorage));
 const [rows,setRows]=useState<ExplorerRow[]>([]),[loading,setLoading]=useState(false),[searchError,setSearchError]=useState('');
 const [recents,setRecents]=useState<RecentSearch[]>([]),[label,setLabel]=useState(''),[index,setIndex]=useState(0);
 const inputRef=useRef<HTMLInputElement>(null),dialogRef=useRef<HTMLDivElement>(null),listRef=useRef<HTMLUListElement>(null),requestId=useRef(0),returnFocus=useRef<HTMLElement|null>(null);
 const kind=useMemo(()=>classifyQuery(input),[input]);
 const text=kind.type==='text'?kind.value:'',address=kind.type==='address'?kind.value:'';

 // Open: remember the caller's focus, load recents, focus the field. Close: reset everything and give focus back.
 useEffect(()=>{
  if(!open)return;
  returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setRecents(loadRecents(store()??noStorage));setInput('');setIndex(0);
  const timer=window.setTimeout(()=>inputRef.current?.focus(),0);
  return()=>{window.clearTimeout(timer);returnFocus.current?.focus?.();};
 },[open]);

 // Free-text search: debounced, minimum two characters, stale replies are ignored.
 useEffect(()=>{
  setRows([]);setSearchError('');
  if(!open||text.length<2){setLoading(false);return;}
  const id=++requestId.current;setLoading(true);
  const timer=window.setTimeout(()=>{
   api.explorerData(chain,{kind:'search',q:text})
    .then(result=>{if(id===requestId.current)setRows(result.items);})
    .catch(error=>{if(id===requestId.current)setSearchError(error instanceof Error?error.message:t('Arama kaynağı yanıt vermiyor.'));})
    .finally(()=>{if(id===requestId.current)setLoading(false);});
  },300);
  return()=>{window.clearTimeout(timer);requestId.current++;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open,text,chain]);

 // A signed-in user's saved label for the typed address (read-only, Arc).
 useEffect(()=>{
  setLabel('');
  if(!open||!user||chain!=='5042'||!address)return;
  let live=true;
  api.arcWalletLabel(address).then(result=>{if(live&&result.label)setLabel(result.label);}).catch(()=>{/* A label is a convenience. */});
  return()=>{live=false;};
 },[open,user?.id,chain,address]);

 const items=useMemo(()=>buildPaletteItems({input,chain,searchRows:rows,recents}).map(item=>label&&item.id.startsWith('open:')?{...item,hint:t('Etiket: {0}',[label]),hintArgs:undefined}:item),[input,chain,rows,recents,label,t]);
 useEffect(()=>{setIndex(0);},[items.length,input]);
 useEffect(()=>{listRef.current?.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'});},[index,items]);

 const remember=useCallback((entry:RecentSearch|null)=>{
  if(!entry)return;
  const next=addRecent(recents,entry);setRecents(next);const s=store();if(s)saveRecents(s,next);
 },[recents]);

 async function run(item:PaletteItem){
  const entry:RecentSearch|null=item.group==='recent'?recents.find(r=>`recent:${r.type}:${r.query}`===item.id)??null
   :item.group==='go'?null
   :item.group==='results'?(text?{query:text,type:'text'}:null)
   :kind.type==='address'||kind.type==='hash'||kind.type==='block'?{query:kind.value,type:kind.type}:null;
  const action=item.action;
  if(action.type==='search'){setInput(action.query);inputRef.current?.focus();return;}
  remember(entry);
  if(action.type==='navigate'){onClose();navigate(action.to);return;}
  if(action.type==='external'){window.open(action.url,'_blank','noopener,noreferrer');onClose();return;}
  if(action.type==='copy'){
   try{await navigator.clipboard.writeText(action.value);toast.success(t('Kopyalandı'));}catch{toast.error(t('Kopyalanamadı'));}
   onClose();return;
  }
  // watch
  if(!user){onClose();navigate(`/?login=1&next=${encodeURIComponent(location.pathname+location.search)}`);return;}
  try{await api.saveNetworkWatch(action.chain,action.address);toast.success(t('Takip listesine eklendi'));}
  catch(error){toast.error(error instanceof Error?error.message:t('Takip kaydedilemedi.'));}
  onClose();
 }

 function onKeyDown(event:React.KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();onClose();return;}
  if(event.key==='ArrowDown'&&items.length){event.preventDefault();setIndex(i=>(i+1)%items.length);return;}
  if(event.key==='ArrowUp'&&items.length){event.preventDefault();setIndex(i=>(i-1+items.length)%items.length);return;}
  if(event.key==='Enter'&&event.target===inputRef.current){const item=items[index];if(item){event.preventDefault();void run(item);}return;}
  if(event.key==='Tab'){
   const focusable=[...(dialogRef.current?.querySelectorAll<HTMLElement>('input,select,button:not([disabled])')??[])];
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 }

 if(!open)return null;
 const listId=`${base}-list`,optionId=(i:number)=>`${base}-option-${i}`;
 const empty=kind.type==='text'&&!loading&&!items.length;
 let previous='';
 return createPortal(<div className="cp-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div ref={dialogRef} className="cp-panel" role="dialog" aria-modal="true" aria-label={t('Komut paleti')} onKeyDown={onKeyDown}>
   <div className="cp-field">
    <Search size={17} aria-hidden="true"/>
    <input ref={inputRef} role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={items.length?optionId(index):undefined}
     aria-label={t('Terminal araması')} placeholder={t('Adres, işlem, blok veya token ara')} value={input} maxLength={200} autoComplete="off" spellCheck={false}
     onChange={event=>setInput(event.target.value)}/>
    {loading&&<LoaderCircle size={16} className="cp-spin" aria-label={t('Aranıyor…')}/>}
    <select aria-label={t('Ağ')} value={chain} onChange={event=>{const next=event.target.value as PaletteChainId;setChain(next);const s=store();if(s)saveChain(s,next);}}>
     {PALETTE_CHAINS.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
   </div>
   {searchError&&<p className="cp-note" role="status">{t('Arama kaynağı yanıt vermiyor. Doğrudan açma ve sayfa komutları çalışıyor.')}</p>}
   <ul ref={listRef} id={listId} role="listbox" aria-label={t('Sonuçlar')} className="cp-list">
    {items.map((item,i)=>{
     const heading=item.group!==previous;previous=item.group;
     return <li key={item.id} role="presentation">
      {heading&&<div className="cp-group" role="presentation">{t(GROUP_TITLES[item.group])}</div>}
      <div id={optionId(i)} role="option" aria-selected={i===index} className={`cp-item${i===index?' is-active':''}${item.badge==='lookalike'?' is-lookalike':''}`}
       onMouseMove={()=>{if(i!==index)setIndex(i);}} onClick={()=>void run(item)}>
       <span className="cp-icon" aria-hidden="true">{icon(item)}</span>
       <span className="cp-text"><strong>{t(item.label,item.labelArgs)}</strong>{item.hint&&<small>{t(item.hint,item.hintArgs)}</small>}</span>
       {item.badge==='verified'&&<span className="cp-badge is-verified"><BadgeCheck size={12} aria-hidden="true"/>{t('Doğrulanmış varlık')}</span>}
       {item.badge==='lookalike'&&<span className="cp-badge is-warn"><TriangleAlert size={12} aria-hidden="true"/>{t('Taklit olabilir')}</span>}
       {i===index&&<CornerDownLeft size={14} className="cp-enter" aria-hidden="true"/>}
      </div>
     </li>;
    })}
   </ul>
   {empty&&<p className="cp-empty">{t('Sonuç bulunamadı. Bir adres, işlem veya blok numarası yapıştırarak doğrudan açabilirsiniz.')}</p>}
   <div className="cp-footer"><span>{t('↑↓ gezin · ↵ aç · Esc kapat')}</span><span>{PALETTE_CHAINS.find(c=>c.id===chain)?.name}</span></div>
  </div>
 </div>,document.body);
}
