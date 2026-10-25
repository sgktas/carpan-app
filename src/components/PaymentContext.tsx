import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {useI18n} from '../i18n/index';
import {providerLabels,validTreasuryAddress} from '../treasury-review';
import type {ExplorerResult} from '../chain-explorer';

/** Provider labels are suggestions; they never mutate private counterparties. */
export function PaymentContext({chain,address,token}:{chain:string;address:string;token?:string}){
  const {language}=useI18n(),tr=language==='tr',text=(en:string,turkish:string)=>tr?turkish:en;
  const [result,setResult]=useState<ExplorerResult|null>(null),[tokenResult,setToken]=useState<ExplorerResult|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);
  useEffect(()=>{generation.current++;setResult(null);setToken(null);setError('');setBusy(false);return()=>{generation.current++;};},[chain,address,token]);
  async function load(){
    const id=++generation.current;setBusy(true);setError('');setResult(null);setToken(null);
    const values=await Promise.allSettled([api.explorerData(chain,{kind:'address',address}),...(token?[api.explorerData(chain,{kind:'token',token})]:[])]);
    if(id!==generation.current)return;
    if(values[0].status==='fulfilled')setResult(values[0].value);
    if(values[1]?.status==='fulfilled')setToken(values[1].value);
    const failed=values.find(v=>v.status==='rejected');if(failed?.status==='rejected')setError(failed.reason instanceof Error?failed.reason.message:text('Provider metadata unavailable.','Sağlayıcı bilgileri alınamadı.'));
    setBusy(false);
  }
  const labels=providerLabels(result?.detail||null);
  return <section className="fo-discovery"><h4>{text('Blockscout payment context','Blockscout ödeme bağlamı')}</h4>
    <button type="button" disabled={busy||!validTreasuryAddress(address)} onClick={()=>void load()}>{busy?text('Loading…','Yükleniyor…'):text('Load counterparty and token context','Karşı taraf ve token bilgilerini getir')}</button>
    {error&&<p role="alert">{error}</p>}
    {result&&<><p>{labels.length?labels.join(' · '):text('No public counterparty label returned.','Kaynak herkese açık karşı taraf etiketi döndürmedi.')}</p><small>{result.source} · {result.cached?text('Cached','Önbellek'):text('Provider read','Kaynak okuması')} · {result.fetchedAt}</small></>}
    {tokenResult&&<p>{text('Token metadata','Token bilgisi')}: {String(tokenResult.detail?.name||'—').slice(0,120)} · {String(tokenResult.detail?.symbol||'—').slice(0,20)} · {tokenResult.source} · {tokenResult.fetchedAt}</p>}
    <p>{text('Public labels are research suggestions, not proof of ownership or business purpose. Save a counterparty only after your own review.','Herkese açık etiketler araştırma önerisidir; sahiplik veya iş amacı kanıtı değildir. Karşı tarafı kendi incelemenden sonra kaydet.')}</p>
  </section>;
}
