/* carpan-localized */
import { t } from '../i18n/index';
import {useEffect,useState,type FormEvent} from 'react';
import {isAddress} from 'viem';
import {api} from '../api';
import {ARC_USDC} from '../arc-wallet';
import {parseArcAsset,USDC_ASSET,type ArcAsset} from '../arc-assets';
export function useArcAsset(token:string){
 const [asset,setAsset]=useState<ArcAsset|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setAsset(null);setError('');if(token===ARC_USDC){setAsset(USDC_ASSET);return;}if(!isAddress(token)){setError(t("Geçerli bir token kontratı gir."));return;}
 api.explorerData('5042',{kind:'token',token}).then(d=>{const result=parseArcAsset(token,d.detail||{});if(live)setAsset(result);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[token]);
 return {asset:asset?.address===token?asset:null,error};
}
export function ArcAssetPicker({token,onChange,asset,error}:{token:string;onChange:(token:string)=>void;asset:ArcAsset|null;error:string}){
 const [input,setInput]=useState(token),[invalid,setInvalid]=useState('');useEffect(()=>{setInput(token);setInvalid('');},[token]);
 function apply(e:FormEvent){e.preventDefault();if(!isAddress(input.trim())){setInvalid(t("Geçerli bir ERC-20 kontrat adresi gir."));return;}setInvalid('');onChange(input.trim().toLowerCase());}
 return <div className="aw-panel" style={{padding:16,marginBottom:16}}><form className="aw-flex" onSubmit={apply}><label style={{flex:1}}>{t("İzlenen token")}<input aria-label={t("İzlenen token kontratı")} value={input} onChange={e=>setInput(e.target.value)} placeholder={t("ERC-20 kontratı · 0x…")} style={{width:'100%'}}/></label><button className="aw-button" type="submit">{t("Tokenı seç")}</button><button className="aw-text" type="button" onClick={()=>onChange(ARC_USDC)}>USDC</button></form><p className={error||invalid?'aw-error':'aw-note'} role={error||invalid?'alert':undefined}>{invalid||error||(asset?t("{0} · {1} ondalık · {2}", [asset.symbol, asset.decimals, asset.address]):t("Token bilgisi doğrulanıyor…"))}</p></div>;
}
