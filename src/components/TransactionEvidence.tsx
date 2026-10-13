import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../api';
import {displayRaw} from '../arc-wallet';
import {researchUrl,type ExplorerResult} from '../chain-explorer';
import {BridgeTransactionResearch} from './BridgeResearch';
export function TransactionEvidence({chain,hash,onClose}:{chain:string;hash:string;onClose:()=>void}){
 const [data,setData]=useState<ExplorerResult|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setData(null);setError('');api.explorerData(chain,{kind:'tx',hash}).then(d=>{if(alive)setData(d);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[chain,hash]);
 const tx=data?.detail;
 const from=tx?.from&&typeof tx.from==='object'?(tx.from as {hash?:string}).hash:null,to=tx?.to&&typeof tx.to==='object'?(tx.to as {hash?:string}).hash:null;
 const valid=(a:string|null|undefined)=>a&&/^0x[0-9a-f]{40}$/i.test(a);
 return <section className="aw-evidence" aria-label={t("İşlem araştırması")}><div className="aw-flex"><strong>{t("İŞLEM KANITI")}</strong><button className="aw-text" onClick={onClose}>{t("Kapat")}</button></div><code>{hash}</code>
  {error?<p role="alert" className="aw-warning">{error}</p>:!tx?<p>{t("İşlem kaynağı yükleniyor…")}</p>:<><p>{t("Blok")}{String(tx.block_number??'—')} {translateText("· Durum:")}{String(tx.status??'—')} · {typeof tx.timestamp==='string'?new Date(tx.timestamp).toLocaleString(getLocale()):'Zaman bilgisi yok'}</p><p>{valid(from)?<Link to={researchUrl(chain,from!)}>{from}</Link>:'—'} → {valid(to)?<Link to={researchUrl(chain,to!)}>{to}</Link>:t("Kontrat oluşturma / alıcı bilgisi yok")}</p>{typeof tx.value==='string'&&/^\d+$/.test(tx.value)&&<p>{t("Native işlem değeri:")}{displayRaw(tx.value,18)} {data?.network.nativeSymbol} {t("· token transfer toplamı değildir.")}</p>}</>}
  <BridgeTransactionResearch chain={chain} hash={hash}/>
  <div className="aw-flex"><Link to={`/arc?view=explorer&chain=${chain}&data=tx&hash=${hash}`}>{t("Olaylar ve durum değişiklikleri ↗")}</Link><a href={`${data?.network.explorer||'https://explorer.arc.io'}/tx/${hash}`} target="_blank" rel="noopener noreferrer">{t("Explorer’da doğrula ↗")}</a></div>
 </section>;
}
