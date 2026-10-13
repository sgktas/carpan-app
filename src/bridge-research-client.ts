import {decodeRecords} from './arc-bridge';
import {createBridgeKit} from './arc-bridge-client';
import {MAINNET_BRIDGE_STORAGE,verifiedMainnetDefinitions} from './bridge-mainnet-config';

// Local snapshots are supplementary context, not a global bridge index.
export function loadResearchBridgeRecords(){
 const value=localStorage.getItem(MAINNET_BRIDGE_STORAGE);if(!value)return [];
 return decodeRecords(value,verifiedMainnetDefinitions(createBridgeKit()),'mainnet');
}
