/* carpan-localized */
import { t } from './i18n/index';
import type {DiscoveryTransfer} from './discovery-transfers';
import type {ArcAsset} from './arc-assets';
import {decimalRaw} from './arc-wallet';

export type DiscoveryFilters={minimum:string;from:string;to:string};
export function filterDiscovery(items:DiscoveryTransfer[],filters:DiscoveryFilters,asset:ArcAsset|null){
 const from=filters.from?Date.parse(filters.from):null,to=filters.to?Date.parse(filters.to):null;
 if(from!==null&&!Number.isFinite(from)||to!==null&&!Number.isFinite(to)||from!==null&&to!==null&&from>to)throw new Error(t("Geçerli bir başlangıç ve bitiş zamanı seç."));
 if(filters.minimum&&!asset)throw new Error(t("Minimum miktar için tek bir ERC-20 token seç."));
 const minimum=filters.minimum?decimalRaw(filters.minimum,asset!.decimals):null;
 return items.filter(t=>{
  if(minimum!==null&&(t.token!==asset!.address||t.decimals!==asset!.decimals||t.nftId!==null||t.raw===null||!/^\d+$/.test(t.raw)||BigInt(t.raw)<minimum))return false;
  if(from!==null||to!==null){const at=t.timestamp?Date.parse(t.timestamp):NaN;if(!Number.isFinite(at)||from!==null&&at<from||to!==null&&at>to)return false;}
  return true;
 });
}
