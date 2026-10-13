import {ArrowLeftRight} from 'lucide-react';
import {t} from '../i18n';
import {bridgeRouteNetworks,changeBridgeRoute,type BridgeNetworkId,type BridgeRoute,type BridgeRouteSide} from '../bridge-route';
import type {BridgeEnvironment} from '../arc-bridge';
import {ArcNetworkIcon} from './ArcNetworkIcon';
import './bridge-route-picker.css';

type Props={environment:BridgeEnvironment;route:BridgeRoute;disabled:boolean;onChange:(route:BridgeRoute)=>void};

/** One network chooser for both signing adapters; it never requests a wallet action. */
export function BridgeRoutePicker({environment,route,disabled,onChange}:Props){
  const networks=bridgeRouteNetworks(environment);
  function selectNetwork(side:BridgeRouteSide,value:string){
    if(disabled)return;
    const id:BridgeNetworkId=value==='solana'?'solana':Number(value);
    let next:BridgeRoute;
    try{next=changeBridgeRoute(route,side,id,environment);}catch{return;}
    onChange(next);
  }
  return <div className="ab-route">
    <label>{t('Kaynak ağ')}<span className="ab-network-choice">{(route.source===5042||route.source===5042002)&&<ArcNetworkIcon/>}<select aria-label={t('Köprü kaynak ağı')} value={route.source} disabled={disabled} onChange={event=>selectNetwork('source',event.target.value)}>{networks.map(network=><option key={network.id} value={network.id}>{network.name}</option>)}</select></span></label>
    <button className="aw-button" type="button" aria-label={t('Köprü yönünü değiştir')} disabled={disabled} onClick={()=>selectNetwork('source',String(route.destination))}><ArrowLeftRight size={17}/></button>
    <label>{t('Hedef ağ')}<span className="ab-network-choice">{(route.destination===5042||route.destination===5042002)&&<ArcNetworkIcon/>}<select aria-label={t('Köprü hedef ağı')} value={route.destination} disabled={disabled} onChange={event=>selectNetwork('destination',event.target.value)}>{networks.map(network=><option key={network.id} value={network.id}>{network.name}</option>)}</select></span></label>
  </div>;
}
