import {describe,expect,test} from 'bun:test';
import {BRIDGE_NETWORK_FACTS} from '../src/bridge-networks';
import {bridgeRouteNetworks,changeBridgeRoute,defaultBridgeRoute,routeForSolana,type BridgeNetworkId,type BridgeRoute,type BridgeRouteSide} from '../src/bridge-route';
import type {BridgeEnvironment} from '../src/arc-bridge';

for(const environment of ['mainnet','testnet'] as const){
  const arc=environment==='mainnet'?5042:5042002;
  describe(`${environment} unified bridge route`,()=>{
    test('selector uses only the reviewed environment registry and one Solana entry',()=>{
      const networks=bridgeRouteNetworks(environment),expected=BRIDGE_NETWORK_FACTS.filter(network=>network.testnet===(environment==='testnet'));
      expect(networks.filter(network=>network.type==='evm').map(network=>network.id)).toEqual(expected.map(network=>network.id));
      expect(networks.filter(network=>network.type==='solana')).toEqual([{id:'solana',name:environment==='mainnet'?'Solana':'Solana Devnet',type:'solana'}]);
      expect(new Set(networks.map(network=>network.id)).size).toBe(networks.length);
      expect(networks.some(network=>network.id===arc)).toBe(true);
      expect(defaultBridgeRoute(environment)).toEqual({source:arc,destination:environment==='mainnet'?42161:11155111});
    });

    test('all source and target selections keep the selected side, different networks and Arc',()=>{
      const networks=bridgeRouteNetworks(environment);
      for(const counterpart of networks.filter(network=>network.id!==arc)){
        for(const original of [{source:arc,destination:counterpart.id},{source:counterpart.id,destination:arc}] satisfies BridgeRoute[]){
          const snapshot={...original};
          for(const side of ['source','destination'] as const){
            for(const network of networks){
              const next=changeBridgeRoute(original,side,network.id,environment);
              expect(next[side]).toBe(network.id);
              expect(next.source).not.toBe(next.destination);
              expect([next.source,next.destination]).toContain(arc);
              expect(original).toEqual(snapshot);
            }
          }
        }
      }
    });

    test('selecting a different counterpart pins Arc and selecting Arc preserves the counterpart across a swap',()=>{
      const initial=defaultBridgeRoute(environment);
      expect(changeBridgeRoute(initial,'source','solana',environment)).toEqual({source:'solana',destination:arc});
      expect(changeBridgeRoute(initial,'destination','solana',environment)).toEqual({source:arc,destination:'solana'});
      for(const route of [routeForSolana('arc-to-solana',environment),routeForSolana('solana-to-arc',environment),initial]){
        const swapped=changeBridgeRoute(route,'source',route.destination,environment);
        expect(swapped).toEqual({source:route.destination,destination:route.source});
        expect(changeBridgeRoute(swapped,'source',swapped.destination,environment)).toEqual(route);
      }
      expect(changeBridgeRoute(routeForSolana('arc-to-solana',environment),'destination',arc,environment)).toEqual(routeForSolana('solana-to-arc',environment));
    });

    test('unknown, malformed and other-environment choices fail closed',()=>{
      const initial=defaultBridgeRoute(environment),otherIds=BRIDGE_NETWORK_FACTS.filter(network=>network.testnet===(environment==='mainnet')).map(network=>network.id);
      for(const id of [...otherIds,-1,0,NaN,Infinity,1.5,'Solana','5042',null,undefined] as BridgeNetworkId[]){
        for(const side of ['source','destination'] as const)expect(()=>changeBridgeRoute(initial,side,id,environment)).toThrow();
      }
      expect(()=>changeBridgeRoute(initial,'other' as BridgeRouteSide,'solana',environment)).toThrow();
      const nonArc=bridgeRouteNetworks(environment).find(network=>network.id!==arc&&network.id!=='solana')!.id;
      for(const invalid of [{source:arc,destination:arc},{source:nonArc,destination:'solana'},{source:-1,destination:arc}] as BridgeRoute[])expect(()=>changeBridgeRoute(invalid,'destination','solana',environment)).toThrow();
    });

    test('both Solana directions use the current Arc environment',()=>{
      expect(routeForSolana('arc-to-solana',environment)).toEqual({source:arc,destination:'solana'});
      expect(routeForSolana('solana-to-arc',environment)).toEqual({source:'solana',destination:arc});
      expect(()=>routeForSolana('other' as 'arc-to-solana',environment)).toThrow();
    });
  });
}

test('unknown environments never produce selectable networks or routes',()=>{
  const invalid='devnet' as BridgeEnvironment;
  expect(()=>bridgeRouteNetworks(invalid)).toThrow();
  expect(()=>defaultBridgeRoute(invalid)).toThrow();
  expect(()=>routeForSolana('arc-to-solana',invalid)).toThrow();
  expect(()=>changeBridgeRoute({source:5042,destination:42161},'source','solana',invalid)).toThrow();
});
