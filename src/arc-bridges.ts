/* carpan-localized */
import { t, localized } from './i18n/index';
import {decodeEventLog,parseAbi,type Hex} from 'viem';
import type {ExplorerRow} from './chain-explorer';

export const ARC_BRIDGE_SOURCE='https://docs.arc.io/arc/references/contract-addresses';
export const ARC_BRIDGES=localized([
 {name:'CCTP · TokenMessenger',address:'0x28b5a0e9c621a5badaa536219b3a228c8168cf5d'},
 {name:'CCTP · MessageTransmitter',address:'0x81d40f21f12a8f0e3252bccb954d722d4c464b64'},
 {name:"CCTP · Ücretli aktarımlar",address:'0x71f54f818671cd0d7ea140da213e5c8b5c92a408'},
 {name:'CrossChainTokenService',address:'0x431871229103b780868f8c6bb820cd16ecf942bc'},
 {name:'Gateway · Wallet',address:'0x77777777dcc4d5a8b6e418fd04d8997ef11000ee'},
 {name:'Gateway · Minter',address:'0x2222222d7164433c4c09b0b0d809a9b52c04c205'},
] as const);
export const BRIDGE_ABI=parseAbi([
 'event MintAndWithdraw(address indexed mintRecipient,uint256 amount,address indexed mintToken,uint256 feeCollected)',
 'event DepositForBurn(address indexed burnToken,uint256 amount,address indexed depositor,bytes32 mintRecipient,uint32 destinationDomain,bytes32 destinationTokenMessenger,bytes32 destinationCaller,uint256 maxFee,uint32 indexed minFinalityThreshold,bytes hookData)',
 'event AttestationUsed(address indexed token,address indexed recipient,bytes32 indexed transferSpecHash,uint32 sourceDomain,bytes32 sourceDepositor,bytes32 sourceSigner,uint256 value)',
]);
export type BridgeEvidence={label:string;direction:'in'|'out';raw:string;token:string;domain:number|null};
/** Classification requires the known emitter AND the matching raw event signature/data. */
export function bridgeEvidence(row:ExplorerRow,chain:string):BridgeEvidence|null{
 if(chain!=='5042')return null;
 const emitter=row.address?.toLowerCase();
 const topics=row.data.topics;
 if(!Array.isArray(topics)||typeof row.data.data!=='string')return null;
 try{
  const event=decodeEventLog({abi:BRIDGE_ABI,data:row.data.data as Hex,topics:topics.filter((t):t is Hex=>typeof t==='string'&&/^0x[0-9a-f]{64}$/i.test(t)) as [Hex,...Hex[]],strict:true});
  if((emitter===ARC_BRIDGES[0].address||emitter===ARC_BRIDGES[2].address)&&event.eventName==='MintAndWithdraw')return {label:t("Arc girişi · basım"),direction:'in',raw:event.args.amount.toString(),token:event.args.mintToken,domain:null};
  if((emitter===ARC_BRIDGES[0].address||emitter===ARC_BRIDGES[2].address)&&event.eventName==='DepositForBurn')return {label:t("Arc çıkışı · yakım"),direction:'out',raw:event.args.amount.toString(),token:event.args.burnToken,domain:event.args.destinationDomain};
  if(emitter===ARC_BRIDGES[5].address&&event.eventName==='AttestationUsed')return {label:t("Arc girişi · Gateway"),direction:'in',raw:event.args.value.toString(),token:event.args.token,domain:event.args.sourceDomain};
 }catch{/* Unknown or malformed events stay unclassified. */}
 return null;
}
