import {useState} from 'react';
import {BRIDGE_NETWORK_FACTS} from '../bridge-networks';
import type {BridgeNetworkId} from '../bridge-route';

export function BridgeNetworkIcon({id,name}:{id:BridgeNetworkId;name:string}){
 const [failed,setFailed]=useState(false);
 const fact=BRIDGE_NETWORK_FACTS.find(f=>f.id===id),mainnet=fact&&BRIDGE_NETWORK_FACTS.find(f=>!f.testnet&&f.domain===fact.domain);
 const asset=id==='solana'?'solana.svg':mainnet?.id===5042?'arc-network.svg':mainnet?.id===81224?'81224.png':mainnet?.id===3343?'3343.ico':`${mainnet?.id}.svg`;
 return <span className="bridge-network-icon" aria-hidden="true">{failed?<span>{name.slice(0,2).toUpperCase()}</span>:<img key={asset} src={'/images/networks/'+asset} alt="" width={28} height={28} draggable={false} onError={()=>setFailed(true)}/>}</span>;
}
