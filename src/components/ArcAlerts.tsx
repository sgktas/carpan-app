import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Bell,Check,ExternalLink,Pause,Play,Plus,RefreshCw,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {api} from '../api';
import {useAuth} from '../hooks/useAuth';
import {ARC_USDC,displayRaw} from '../arc-wallet';
import type {ArcAlertDashboard,ArcAlertDraft} from '../arc-alerts';
import {ArcAssetPicker,useArcAsset} from './ArcAssetPicker';
import {useVisiblePolling} from '../hooks/useVisiblePolling';
const short=(a:string)=>`${a.slice(0,8)}…${a.slice(-4)}`;
const time=(t:string)=>new Date(t).toLocaleString(getLocale(),{dateStyle:'short',timeStyle:'short'});

export function ArcAlerts({lagBlocks,indexLive}:{lagBlocks?:number;indexLive?:boolean}){
  const {user}=useAuth();const [params]=useSearchParams();
  const [draft,setDraft]=useState<ArcAlertDraft>({address:params.get('address')||'',name:'',kind:'token_transfer',direction:'all',minimum:'0',token:(params.get('token')||ARC_USDC).toLowerCase()});
  const [data,setData]=useState<ArcAlertDashboard|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[working,setWorking]=useState(false);
  const {asset,error:assetError}=useArcAsset(draft.token||ARC_USDC);
  const generation=useRef(0);
  const load=useCallback(async()=>{if(!user)return;const current=++generation.current;setLoading(true);try{const result=await api.arcAlerts();if(current!==generation.current)return;setData(result);setError('');}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:t("Alarmlar yüklenemedi."));}finally{if(current===generation.current)setLoading(false);}},[user]);
  useEffect(()=>{setData(null);setError('');setLoading(false);void load();return()=>{generation.current++;};},[load,user]);
  useVisiblePolling(()=>void load(),15000,!!user&&!loading&&!working);
  async function submit(e:FormEvent){e.preventDefault();if(!user||working)return;setWorking(true);try{await api.createArcAlert(draft);setDraft(d=>({...d,name:''}));await load();toast.success(t("Alarm hesabına kaydedildi."));}
    catch(e){toast.error(e instanceof Error?e.message:t('Alarm kaydedilemedi.'));}finally{setWorking(false);}}
  async function change(action:()=>Promise<unknown>){if(working)return;setWorking(true);try{await action();await load();}catch(e){toast.error(e instanceof Error?e.message:t("Değişiklik kaydedilemedi."));}finally{setWorking(false);}}
  return <div className="at-alerts-module">
    <div className="at-section-title"><h2><Bell size={20}/>{t("Alarmlar")}</h2><div><span className="at-alert-count">{data?.unread??'—'} {t("okunmamış")}</span><button aria-label={t("Alarmları yenile")} disabled={loading||!user} onClick={()=>void load()}><RefreshCw size={17}/></button></div></div>
    <p className="at-alert-intro">{t("Bir adresi izle. Seçtiğin tokenın hareketi veya yeni kontrat dağıtımı olduğunda Carpan içinde bildirim al.")}</p>
    {!!lagBlocks&&<p className="aw-note">{translateText("Kontrat indeksi")}{lagBlocks.toLocaleString(getLocale())} {t("blok geride. Dağıtım bildirimleri indeks ilgili bloğa ulaştığında oluşur; token alarmları ayrı Explorer taramasını kullanır.")}</p>}
    {!lagBlocks&&indexLive===false&&<p className="aw-note">{t("Kontrat indeksinin güncelliği doğrulanamıyor. Dağıtım bildirimleri gecikebilir; token alarmları ayrı Explorer taramasını kullanır.")}</p>}
    {draft.kind!=='deployment'&&<ArcAssetPicker token={draft.token||ARC_USDC} asset={asset} error={assetError} onChange={token=>setDraft(d=>({...d,token,kind:'token_transfer',minimum:'0'}))}/>}
    {!user?<section className="aw-panel at-alert-login"><Bell size={30}/><h2>{t("Takibin hesabında kalsın.")}</h2><p>{t("Alarm kurallarını kaydetmek ve bildirimlerini görmek için giriş yap.")}</p><Link className="aw-button primary" to={`/?login=1&next=${encodeURIComponent('/arc?view=alerts'+(draft.address?'&address='+draft.address:'')+'&token='+(draft.token||ARC_USDC))}`}>{t("Giriş yap")}</Link></section>:<>
      <section className="aw-panel"><h2><span>{translateText("Yeni alarm")}</span><small>Arc Mainnet</small></h2><form className="at-alert-form" onSubmit={submit}>
        <label className="at-alert-address">{t("İzlenecek adres")}<input required aria-label="Alarm adresi" placeholder="0x…" value={draft.address} onChange={e=>setDraft({...draft,address:e.target.value})}/></label>
        <label>{t("Alarm adı")}<input required maxLength={60} placeholder={t("Örn. Hazine çıkışı")} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
        <label>{translateText("Hareket")}<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as ArcAlertDraft['kind']})}><option value="token_transfer">{translateText("Token transferi")}</option><option value="deployment">{t("Yeni kontrat dağıtımı")}</option></select></label>
        {draft.kind!=='deployment'&&<><label>{t("Yön")}<select value={draft.direction} onChange={e=>setDraft({...draft,direction:e.target.value as ArcAlertDraft['direction']})}><option value="all">{t("Giriş ve çıkış")}</option><option value="in">{t("Giriş")}</option><option value="out">{t("Çıkış")}</option></select></label><label>{t("Minimum")}{asset?.symbol||'token'}<input required inputMode="decimal" value={draft.minimum} onChange={e=>setDraft({...draft,minimum:e.target.value.replace(',','.')})}/></label></>}
        <button className="aw-button primary" disabled={working||(draft.kind!=='deployment'&&!asset)}><Plus size={15}/>{working?t('Kaydediliyor…'):t("Alarm oluştur")}</button>
      </form><div className="aw-note">{t("Yalnızca alarm etkinleştirildikten sonraki hareketler bildirilir. Transferler yaklaşık 30 saniyelik tarama döngüsüyle kontrol edilir; yoğunluk ve kaynak gecikmesi süreyi uzatabilir. Dağıtım alarmları Carpan’ın doğrudan kontrat indeksini kullanır.")}</div></section>
      {error&&<p className="aw-error" role="alert">{error} <button type="button" className="aw-text" disabled={loading} onClick={()=>void load()}>{t('Yeniden dene')}</button></p>}
      <div className="at-alert-grid"><section className="aw-panel"><h2><span>{t("Kurallarım")}</span><span>{data?.rules.length??'—'} / 20</span></h2>
        {!data?<div className="aw-empty">{loading?t("Alarmlar yükleniyor…"):t("Alarmlar alınamadı.")}</div>:!data.rules.length?<div className="aw-empty"><Bell size={22}/><p>{t("İlk alarmını yukarıdan oluştur.")}</p></div>:<div className="at-alert-rules">{data.rules.map(r=><article key={r.id}>
          <div><strong>{r.name}</strong><Link to={`/arc/addresses/${r.address}?token=${r.token}`}>{short(r.address)} ↗</Link><p>{r.kind==='deployment'?t("Yeni doğrudan kontrat dağıtımı"):`${r.direction==='in'?t("Giriş"):r.direction==='out'?t("Çıkış"):t("Giriş / çıkış")} · ≥ ${r.minimum} ${r.symbol}`}</p><small className={r.error?'at-alert-error':''}>{!r.enabled?t("Duraklatıldı"):r.error|| (r.kind==='deployment'?t('Kontrat indeksi izleniyor'):r.lastCheckedAt?t('Son kontrol: {0}',[time(r.lastCheckedAt)]):t("İlk kontrol bekleniyor"))}</small></div>
          <div className="at-alert-rule-actions"><button className="aw-button" disabled={working} aria-label={t(r.enabled?'{0}: duraklat':'{0}: devam et',[r.name])} onClick={()=>void change(()=>api.setArcAlertEnabled(r.id,!r.enabled))}>{r.enabled?<Pause size={14}/>:<Play size={14}/>}</button><button className="aw-button" disabled={working} aria-label={t("{0}: kaldır", [r.name])} onClick={()=>void change(()=>api.deleteArcAlert(r.id))}><Trash2 size={14}/></button></div>
        </article>)}</div>}
      </section><section className="aw-panel"><h2><span>{t("Bildirim geçmişi")}</span><button className="aw-text" disabled={!data?.unread||working} onClick={()=>void change(()=>api.markArcAlertsRead())}><Check size={14}/>{t("Okundu işaretle")}</button></h2>
        {!data?<div className="aw-empty" role="status">{loading?t('Bildirimler yükleniyor…'):t('Bildirimler alınamadı.')}</div>:!data.notifications.length?<div className="aw-empty"><p>{t("Henüz eşleşen hareket yok.")}</p><small>{t("Bildirim geldiğinde işlem kanıtıyla burada görünür.")}</small></div>:<div className="at-alert-notifications">{data.notifications.map(n=><article className={n.readAt?'':'unread'} key={n.id}>
          <strong>{n.name}</strong><p>{n.kind==='deployment'?t("Yeni kontrat dağıtıldı"):`${n.symbol} ${n.direction==='in'?t("girişi"):t("çıkışı")} · ${displayRaw(n.raw||'0',n.decimals)} ${n.symbol}`}</p><div><Link to={`/arc/addresses/${n.address}?tx=${n.hash}&token=${n.token}`}>{short(n.address)} {t("· İşlemi araştır ↗")}</Link><time>{time(n.timestamp)}</time></div><a href={`https://explorer.arc.io/tx/${n.hash}`} target="_blank" rel="noopener noreferrer">{t("Explorer kanıtı")}<ExternalLink size={12}/></a>
        </article>)}</div>}
        <div className="aw-note">{t("Son 100 bildirim gösterilir. Alarmlar yalnızca Carpan içinde görünür; harici bildirim kanalı henüz bağlı değildir.")}</div>
      </section></div>
    </>}
  </div>;
}
