import {BRIDGE_NETWORK_FACTS} from './bridge-networks';
import type {BridgeEnvironment} from './arc-bridge';

export type BridgeNetworkId=number|'solana';
export type BridgeRouteSide='source'|'destination';
export type BridgeRoute={source:BridgeNetworkId;destination:BridgeNetworkId};
export type BridgeRouteNetwork={id:BridgeNetworkId;name:string;type:'evm'|'solana'};

function arcNetworkId(environment:BridgeEnvironment){
  if(environment!=='mainnet'&&environment!=='testnet')throw new Error('Unsupported bridge environment.');
  return environment==='mainnet'?5042:5042002;
}

/** Display metadata only. Execution continues to verify the selected SDK definitions. */
export function bridgeRouteNetworks(environment:BridgeEnvironment):BridgeRouteNetwork[]{
  arcNetworkId(environment);
  return [
    ...BRIDGE_NETWORK_FACTS.filter(network=>network.testnet===(environment==='testnet')).map(network=>({id:network.id,name:network.name,type:'evm' as const})),
    {id:'solana',name:environment==='mainnet'?'Solana':'Solana Devnet',type:'solana'},
  ];
}

function validateRoute(route:BridgeRoute,environment:BridgeEnvironment){
  const arc=arcNetworkId(environment),ids=new Set(bridgeRouteNetworks(environment).map(network=>network.id));
  if(!ids.has(route.source)||!ids.has(route.destination)||route.source===route.destination||route.source!==arc&&route.destination!==arc)throw new Error('Select different supported networks including Arc.');
  return {arc,ids};
}

export function defaultBridgeRoute(environment:BridgeEnvironment):BridgeRoute{
  const route={source:arcNetworkId(environment),destination:environment==='mainnet'?42161:11155111};
  validateRoute(route,environment);
  return route;
}

/** The selected side wins; its counterpart is Arc or the previous counterpart. */
export function changeBridgeRoute(route:BridgeRoute,side:BridgeRouteSide,id:BridgeNetworkId,environment:BridgeEnvironment):BridgeRoute{
  const {arc,ids}=validateRoute(route,environment);
  if(side!=='source'&&side!=='destination'||!ids.has(id))throw new Error('Unsupported bridge network selection.');
  const other=side==='source'?'destination':'source';
  const counterpart=id!==arc?arc:route[other]===arc?route[side]:route[other];
  const next=side==='source'?{source:id,destination:counterpart}:{source:counterpart,destination:id};
  validateRoute(next,environment);
  return next;
}

export function routeForSolana(direction:'arc-to-solana'|'solana-to-arc',environment:BridgeEnvironment):BridgeRoute{
  const arc=arcNetworkId(environment);
  if(direction!=='arc-to-solana'&&direction!=='solana-to-arc')throw new Error('Unsupported Solana bridge direction.');
  return direction==='arc-to-solana'?{source:arc,destination:'solana'}:{source:'solana',destination:arc};
}
