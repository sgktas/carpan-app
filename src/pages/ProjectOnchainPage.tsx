import {usePageLoading} from '../hooks/usePageLoading';
import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useNavigate,useParams,useSearchParams,useLocation} from 'react-router-dom';
import {Bookmark,Check,GitBranch,ExternalLink,Plus,RefreshCw} from 'lucide-react';
import {api} from '../api';
import {useAuth} from '../hooks/useAuth';
import {ArcTerminalHeader} from '../components/ArcTerminalHeader';
import {addressRoles,type ProjectAddress} from '../project-onchain';
import type {Project} from '../types';
import './arc-wallet.css';import './arc-terminal-v2.css';import './arc-terminal-v3.css';import './project-onchain.css';
export function ProjectOnchainPage(){const {id}=useParams();return <ProjectOnchainContent key={id||'catalog'}/>;}
function ProjectOnchainContent(){
 const {id}=useParams(),{user}=useAuth(),navigate=useNavigate(),location=useLocation(),[params,setParams]=useSearchParams();
 const [projects,setProjects]=useState<Project[]>([]),[project,setProject]=useState<Project|null>(null),[addresses,setAddresses]=useState<ProjectAddress[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false);
 const [saved,setSaved]=useState<Project[]>([]),[savedLoading,setSavedLoading]=useState(false),[savedLoaded,setSavedLoaded]=useState(false),[savedError,setSavedError]=useState(''),[savedRetry,setSavedRetry]=useState(0),[saving,setSaving]=useState(''),[saveNotice,setSaveNotice]=useState('');
 const savedOnly=!id&&params.get('saved')==='1',savedIds=new Set(saved.map(p=>p.id));
 const savedGeneration=useRef(0);
 usePageLoading(loading);
 const shown=savedOnly?saved:projects;
 const [draft,setDraft]=useState({address:'',role:'contract',label:'',sourceUrl:'',sourceNote:'',reviewed:false});
 useEffect(()=>{let current=true;setLoading(true);setLoadError('');setProject(null);setAddresses([]);
  (id?Promise.all([api.discoverProject(id),api.projectAddresses(id)]).then(([p,a])=>{if(current){setProject(p);setAddresses(a);}}):api.discoverProjects().then(p=>{if(current)setProjects(p);})).catch(e=>{if(current)setLoadError(e.message);}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[id,retry]);
 useEffect(()=>{let current=true;savedGeneration.current++;setSaved([]);setSavedLoaded(false);setSavedError('');setSaveNotice('');setSaving('');
  if(!user){setSavedLoading(false);return;}setSavedLoading(true);
  api.savedProjects().then(rows=>{if(current){setSaved(rows);setSavedLoaded(true);}}).catch(e=>{if(current)setSavedError(e.message);}).finally(()=>{if(current)setSavedLoading(false);});return()=>{current=false;savedGeneration.current++;};},[user?.id,savedRetry]);
 async function toggleSaved(p:Project){
  if(!user){navigate(`/login?next=${encodeURIComponent(location.pathname+location.search)}`);return;}
  if(saving||!savedLoaded)return;const version=savedGeneration.current;setSaving(p.id);setSavedError('');setSaveNotice('');
  try{if(savedIds.has(p.id)){await api.unsaveProject(p.id);if(version!==savedGeneration.current)return;setSaved(rows=>rows.filter(row=>row.id!==p.id));setSaveNotice(t('Proje kaydettiklerinden kaldırıldı.'));}
   else{await api.saveProject(p.id);if(version!==savedGeneration.current)return;setSaved(rows=>[p,...rows.filter(row=>row.id!==p.id)]);setSaveNotice(t('Proje hesabına kaydedildi.'));}}
  catch(e){if(version===savedGeneration.current)setSavedError(e instanceof Error?e.message:t('Proje kaydedilemedi.'));}finally{if(version===savedGeneration.current)setSaving('');}
 }
 const saveButton=(p:Project)=><button type="button" className="aw-button po-save" disabled={!!saving||Boolean(user)&&(!savedLoaded||savedLoading)} aria-pressed={savedIds.has(p.id)} onClick={()=>void toggleSaved(p)}>{savedIds.has(p.id)?<Check size={15}/>:<Bookmark size={15}/>} {saving===p.id?t('Kaydediliyor…'):savedIds.has(p.id)?t('Kaydedildi'):t('Kaydet')}</button>;
 async function save(e:FormEvent){e.preventDefault();if(!id||busy)return;setBusy(true);setError('');try{setAddresses(await api.saveProjectAddress(id,draft));setDraft({address:'',role:'contract',label:'',sourceUrl:'',sourceNote:'',reviewed:false});}catch(e){setError(e instanceof Error?e.message:t('Adres kaydedilemedi.'));}finally{setBusy(false);}}
 async function revoke(a:ProjectAddress){if(!id||busy)return;setBusy(true);try{await api.revokeProjectAddress(id,a.id);setAddresses(rows=>rows.filter(r=>r.id!==a.id));}catch(e){setError(e instanceof Error?e.message:t("Bağlantı kaldırılamadı."));}finally{setBusy(false);}}
 return <div className="aw-terminal aw-terminal-v3 carpan-project-research carpan-data-workspace"><ArcTerminalHeader/><main className="po-main"><div className="po-heading"><span className="aw-eyebrow">{t("PROJE ARAŞTIRMASI · ARC MAINNET")}</span><h1>{project?.name||t("Arc üzerinde inşa edenler")}</h1><p>{project?.description||t("Arc projelerini resmî kaynaklarıyla tanı, adreslerini araştır ve deneyimini referans merkezinde paylaş.")}</p></div>
 {!id&&<div className="po-catalog-toolbar"><div role="group" aria-label={t('Proje kataloğu görünümü')}><button className={`aw-button ${!savedOnly?'primary':''}`} type="button" aria-pressed={!savedOnly} onClick={()=>setParams({})}>{t('Tüm projeler')}</button><button className={`aw-button ${savedOnly?'primary':''}`} type="button" aria-pressed={savedOnly} onClick={()=>setParams({saved:'1'})}><Bookmark size={15}/>{t('Kaydettiklerim')}</button></div><Link className="aw-button" to="/projects">{t('Proje Öner')}<Plus size={15}/></Link></div>}
 {saveNotice&&<p className="aw-note" role="status">{saveNotice}</p>}
 {savedError&&<p className="aw-error" role="alert">{savedError} <button type="button" className="aw-text" onClick={()=>setSavedRetry(n=>n+1)}>{t('Kaydettiklerimi yeniden yükle')}</button></p>}
 {error&&<p className="aw-error" role="alert">{error}</p>}
 {loadError&&<p className="aw-error" role="alert">{loadError} <button type="button" className="aw-text" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>{t('Yeniden dene')}</button></p>}
 {loading?<div className="aw-empty" role="status">{t("Projeler yükleniyor…")}</div>:!id?<>
 {savedOnly&&!user?<section className="aw-panel po-empty"><Bookmark size={32}/><h2>{t('Kaydettiklerin aynı hesabında kalsın.')}</h2><p>{t('Projeleri kaydetmek ve başka cihazda yeniden bulmak için giriş yap.')}</p><Link className="aw-button primary" to="/login?next=%2Fonchain%2Fprojects%3Fsaved%3D1">{t('Giriş yap')}</Link></section>:
 savedOnly&&savedLoading?<div className="aw-empty" role="status">{t('Kaydedilen projeler yükleniyor…')}</div>:
 (savedOnly?!savedLoaded:!!loadError)?null:
 !shown.length?<section className="aw-panel po-empty"><GitBranch size={32}/><h2>{savedOnly?t('Henüz kaydettiğin proje yok.'):t("Henüz yayımlanmış proje yok.")}</h2><p>{savedOnly?t('Katalogdan bir projeyi kaydet; burada ve diğer cihazlarında aynı hesabınla bulabilirsin.'):t("Proje kayıtları onaylandığında burada görünür. Adres bağlantıları ayrıca kaynak incelemesinden geçer.")}</p><div className="po-actions">{savedOnly?<Link className="aw-button primary" to="/ecosystem">{t('Tüm projeler')}</Link>:<><Link className="aw-button primary" to="/projects">{t("Arc projesi öner ↗")}</Link><Link className="aw-button" to="/arc">{t("Zinciri araştır ↗")}</Link><a className="aw-button" href="https://docs.arc.io/build" target="_blank" rel="noreferrer">{t("Arc geliştirme kaynakları ↗")}</a></>}</div></section>:
 <div className="po-grid">{shown.map(p=><article className="aw-panel po-card" key={p.id}><Link className="po-card-main" to={`/ecosystem/${p.id}`}><h2>{p.name}</h2><span>{p.officialDomain}</span><p>{p.description}</p><strong>{translateText("Proje ve adresleri incele ↗")}</strong></Link><div className="po-card-save">{saveButton(p)}</div></article>)}</div>}</>:!loadError&&project&&<>
 <div className="po-links"><Link to="/ecosystem">{t("← Tüm projeler")}</Link><a href={`https://${project.officialDomain}`} target="_blank" rel="noopener noreferrer">{translateText("Resmî site")}<ExternalLink size={13}/></a>{saveButton(project)}{project.allowsFreeParticipation&&<Link to={`/projects?projectId=${encodeURIComponent(project.id)}`}>{t('Referans programını incele')}<ExternalLink size={13}/></Link>}</div>
 <section className="aw-panel"><h2><span>{t("Kaynakla ilişkilendirilen adresler")}</span><small>{addresses.length} {translateText("adres")}</small></h2><p className="aw-note">{t("Her bağlantı resmî kaynak üzerinden yönetici tarafından incelenir. Bu inceleme, projenin güvenliği veya yatırım kalitesi hakkında bir onay değildir.")}</p>
 {!addresses.length?<div className="aw-empty"><p>{t("Bu proje için henüz kaynak incelemesinden geçmiş Arc adresi yok.")}</p>{project.arcContractAddress&&<small>{t("Bildirilen eski kontrat alanı kaynak incelemesi olmadan bu listeye alınmaz.")}</small>}</div>:addresses.map(a=><article className="po-address" key={a.id}><div><span className="aw-chip">{t(addressRoles[a.role])}</span><h3>{a.label}</h3><code>{a.address}</code><p>{a.sourceNote}</p><a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">{t("Resmî kaynağı aç ↗")}</a><small>{translateText("Kaynak incelendi ·")}{new Date(a.reviewedAt).toLocaleDateString(getLocale())}</small></div><div className="po-actions"><Link className="aw-button" to={`/arc/addresses/${a.address}`}>{t("Cüzdan analizi")}</Link>{a.role==='contract'&&<Link className="aw-button" to={`/arc/contracts/${a.address}`}>{translateText("Kontrat profili")}</Link>}<Link className="aw-button primary" to={`/arc?view=flow&address=${a.address}`}>{t("Akış haritası")}</Link><Link className="aw-button" to={`/arc?view=alerts&address=${a.address}`}>{t("Alarm oluştur")}</Link>{user?.role==='admin'&&<button className="aw-text" disabled={busy} onClick={()=>void revoke(a)}>{t("Adres bağlantısını kaldır")}</button>}</div></article>)}
 </section>
 {user?.role==='admin'&&<section className="aw-panel po-admin"><h2>{translateText("Adres ve kaynak incelemesi")}</h2><form onSubmit={save}><label>{translateText("Arc Mainnet adresi")}<input required value={draft.address} onChange={e=>setDraft({...draft,address:e.target.value})}/></label><label>{t("Adres adı")}<input required maxLength={60} value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label><label>{translateText("Rol")}<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}>{Object.entries(addressRoles).map(([value,name])=><option key={value} value={value}>{t(name)}</option>)}</select></label><label>{translateText("Resmî kaynak URL")}<input required type="url" placeholder={`https://${project.officialDomain}/…`} value={draft.sourceUrl} onChange={e=>setDraft({...draft,sourceUrl:e.target.value})}/></label><label>{t("Kaynakta ne doğrulandı?")}<textarea required maxLength={1000} value={draft.sourceNote} onChange={e=>setDraft({...draft,sourceNote:e.target.value})}/></label><label className="po-checkbox"><input type="checkbox" required checked={draft.reviewed} onChange={e=>setDraft({...draft,reviewed:e.target.checked})}/>{t("Resmî kaynağı inceledim; adres, rol ve Arc Mainnet bağlantısı kaynakta belirtiliyor.")}</label><button className="aw-button primary" disabled={busy}><Plus size={15}/>{busy?t('Kaydediliyor…'):t("İncelenen bağlantıyı yayımla")}</button></form><p className="aw-note">{t("Kaynak sayfası otomatik doğrulanmaz. Bu form yönetici incelemesini kaydeder. Mevcut bir adres yeniden kaydedildiğinde açıklaması ve kaynağı güncellenir.")}</p></section>}
 </>}
 </main></div>;
}
