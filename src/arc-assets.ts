/* carpan-localized */
import { t } from './i18n/index';
import {isAddress} from 'viem';
import {ARC_USDC} from './arc-wallet';
export type ArcAsset={address:string;symbol:string;decimals:number};
export const USDC_ASSET:ArcAsset={address:ARC_USDC,symbol:'USDC',decimals:6};
export function parseArcAsset(address:string,value:Record<string,unknown>):ArcAsset{
 const actual=value.address_hash;
 if(!isAddress(address)||typeof actual!=='string'||actual.toLowerCase()!==address.toLowerCase()||value.type!=='ERC-20'||value.decimals===null||value.decimals===undefined||!/^\d+$/.test(String(value.decimals)))throw new Error(t("Arc üzerinde doğrulanabilir bir ERC-20 token seç."));
 const decimals=Number(value.decimals);
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw new Error(t("Token hassasiyeti doğrulanamadı."));
 return {address:address.toLowerCase(),decimals,symbol:String(value.symbol||'ERC-20').slice(0,24)};
}
