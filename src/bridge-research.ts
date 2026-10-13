/* carpan-localized */
import { t } from './i18n/index';
import {displayedBridgeStep,mintHash,type BridgeRecord} from './arc-bridge';
import {MAINNET_BRIDGE_FACTS} from './bridge-mainnet-config';

export function arcBridgeResearch(record:BridgeRecord){
 if(![record.source,record.destination].includes(5042)||![record.source,record.destination].every(id=>MAINNET_BRIDGE_FACTS.some(f=>f.id===id))||record.source===record.destination)return null;
 const outbound=record.source===5042,address=outbound?record.wallet:record.recipient;
 const candidate=outbound?displayedBridgeStep(record,'burn')?.txHash:mintHash(record.result);
 const hash=candidate&&/^0x[0-9a-f]{64}$/i.test(candidate)?candidate:null;
 return {address,hash,direction:outbound?t("Arc’tan çıkış"):t("Arc’a giriş"),walletUrl:`/arc/addresses/${address}`,transactionUrl:hash?`/arc/addresses/${address}?token=0x3600000000000000000000000000000000000000&tx=${hash}`:null};
}
export function bridgeRecordsForAddress(records:BridgeRecord[],address:string){return records.filter(r=>arcBridgeResearch(r)?.address.toLowerCase()===address.toLowerCase());}
export function bridgeRecordForTransaction(records:BridgeRecord[],chain:string,hash:string){return chain==='5042'?records.find(r=>arcBridgeResearch(r)?.hash?.toLowerCase()===hash.toLowerCase()):undefined;}
