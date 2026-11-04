import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeftRight,Check,ChevronDown,Search,X} from 'lucide-react';
import {t} from '../i18n';
import {bridgeRouteNetworks,changeBridgeRoute,type BridgeNetworkId,type BridgeRoute,type BridgeRouteSide} from '../bridge-route';
import type {BridgeEnvironment} from '../arc-bridge';
import {BridgeNetworkIcon} from './BridgeNetworkIcon';
import {useI18n} from '../i18n';
import './bridge-route-picker.css';

type Props={environment:BridgeEnvironment;route:BridgeRoute;disabled:boolean;onChange:(route:BridgeRoute)=>void};

/** One network chooser for both signing adapters; it never requests a wallet action. */
export function BridgeRoutePicker({environment,route,disabled,onChange}:Props){
  const networks=bridgeRouteNetworks(environment);
  const {language}=useI18n(),dialog=useRef<HTMLDialogElement>(null),search=useRef<HTMLInputElement>(null),id=useId();
  const [side,setSide]=useState<BridgeRouteSide>('source'),[query,setQuery]=useState('');
  useEffect(()=>{if(disabled)dialog.current?.close();},[disabled]);
  function open(value:BridgeRouteSide){if(disabled)return;setSide(value);setQuery('');dialog.current?.showModal();requestAnimationFrame(()=>search.current?.focus());}
  function selectNetwork(side:BridgeRouteSide,value:string){
    if(disabled)return;
    const id:BridgeNetworkId=value==='solana'?'solana':Number(value);
    let next:BridgeRoute;
    try{next=changeBridgeRoute(route,side,id,environment);}catch{return;}
    onChange(next);
    dialog.current?.close();
  }
  const filtered=networks.filter(n=>n.name.toLowerCase().includes(query.trim().toLowerCase()));
  const choice=(value:BridgeRouteSide)=>{const network=networks.find(n=>n.id===route[value])!;return <div className="ab-network-field"><span>{t(value==='source'?'Kaynak ağ':'Hedef ağ')}</span><button className="ab-network-trigger" type="button" aria-label={t(value==='source'?'Köprü kaynak ağı':'Köprü hedef ağı')} aria-haspopup="dialog" disabled={disabled} onClick={()=>open(value)}><BridgeNetworkIcon key={network.id} id={network.id} name={network.name}/><span translate="no"><strong>{network.name}</strong><small>{environment==='mainnet'?'Mainnet':'Testnet'}</small></span><ChevronDown size={16}/></button></div>;};
  return <div className="ab-route">
    {choice('source')}
    <button className="aw-button" type="button" aria-label={t('Köprü yönünü değiştir')} disabled={disabled} onClick={()=>selectNetwork('source',String(route.destination))}><ArrowLeftRight size={17}/></button>
    {choice('destination')}
    {createPortal(<dialog ref={dialog} className="bridge-network-dialog" aria-labelledby={id} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.current.close();}}}>
      <header><div><h2 id={id}>{language==='en'?'Select network':'Ağ seç'}</h2><p>{language==='en'?'Native USDC · Routes to and from Arc':'Native USDC · Arc ile çift yönlü rotalar'}</p></div><button type="button" aria-label={language==='en'?'Close':'Kapat'} onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
      <div className="bridge-network-search"><Search size={18}/><input ref={search} aria-label={language==='en'?'Search network':'Ağ ara'} placeholder={language==='en'?'Search network…':'Ağ ara…'} value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <div className="bridge-network-options" onKeyDown={e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;const buttons=Array.from(e.currentTarget.querySelectorAll('button'));if(!buttons.length)return;const active=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(active+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}>
        {filtered.map(network=><button type="button" key={network.id} aria-pressed={network.id===route[side]} onClick={()=>selectNetwork(side,String(network.id))}><BridgeNetworkIcon id={network.id} name={network.name}/><span translate="no"><strong>{network.name}</strong><small>{environment==='mainnet'?'Mainnet':'Testnet'}</small></span>{network.id===route[side]&&<Check size={18}/>}</button>)}
        {!filtered.length&&<p className="bridge-network-empty">{language==='en'?'No matching network':'Eşleşen ağ bulunamadı'}</p>}
      </div>
    </dialog>,document.body)}
  </div>;
}
