import {explorerData,ExplorerError} from './chainExplorer';
import {discoveryPolicy} from './explorerBudget';
import {ARC_BRIDGES} from '../src/arc-bridges';
import {bridgeFlowTotals,decodeBridgeFlow,type BridgeFlowSnapshot} from '../src/bridge-flow';

/** Shared live snapshot of Arc CCTP flows: one provider read per section per live interval for all viewers. */
export async function liveBridgeFlow(load:typeof explorerData=explorerData):Promise<BridgeFlowSnapshot>{
 const policy=discoveryPolicy(),ttl=policy.liveMs;
 const sections=[{name:'messenger',address:ARC_BRIDGES[0].address},{name:'transmitter',address:ARC_BRIDGES[1].address}] as const;
 const results=await Promise.allSettled(sections.map(s=>load('5042',{kind:'logs',address:s.address},false,ttl)));
 const [messenger,transmitter]=results;
 if(messenger.status==='rejected')throw messenger.reason instanceof ExplorerError?messenger.reason:new ExplorerError('Köprü akışı alınamadı.');
 // Without MessageReceived logs, inbound rows remain usable but their source network is unknown.
 const failed=transmitter.status==='rejected'?[{section:'transmitter',error:transmitter.reason instanceof Error?transmitter.reason.message:'Alınamadı'}]:[];
 const rows=decodeBridgeFlow(messenger.value.items,transmitter.status==='fulfilled'?transmitter.value.items:[]);
 const times=[messenger.value.fetchedAt,...(transmitter.status==='fulfilled'?[transmitter.value.fetchedAt]:[])].map(Date.parse).filter(Number.isFinite);
 return {rows,totals:bridgeFlowTotals(rows),fetchedAt:new Date(times.length?Math.min(...times):Date.now()).toISOString(),source:messenger.value.source,liveMs:ttl,mode:policy.mode,failed};
}
