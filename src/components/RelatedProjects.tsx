import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import {useEffect,useState} from 'react';import {Link} from 'react-router-dom';
import {api} from '../api';import type {RelatedProject} from '../project-onchain';
export function RelatedProjects({address}:{address:string}){
 const [rows,setRows]=useState<RelatedProject[]>([]),[error,setError]=useState('');
 useEffect(()=>{let current=true;setRows([]);setError('');api.relatedProjects(address).then(r=>{if(current)setRows(r);}).catch(()=>{if(current)setError(t("Proje bağlantıları şu anda alınamadı."));});return()=>{current=false;};},[address]);
 if(!rows.length&&!error)return null;
 return <section className="aw-panel" style={{margin:'18px 0'}}><h2>{t("İlişkili projeler")}</h2>{error?<p className="aw-note">{error}</p>:rows.map(p=><div key={p.id} className="aw-note"><Link to={`/ecosystem/${p.id}`}><strong>{p.name}</strong> · {p.label} ↗</Link><p>{p.sourceNote}</p><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{t("Resmî kaynak ↗")}</a><span> {translateText("· Kaynak incelendi:")}{new Date(p.reviewedAt).toLocaleDateString(getLocale())}</span></div>)}</section>;
}
