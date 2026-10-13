import {usePageLoading} from '../hooks/usePageLoading';
import {useEffect,useRef,useState} from 'react';
import {Check,LogOut,Monitor,RefreshCw,ShieldCheck} from 'lucide-react';
import {api} from '../api';
import type {AccountSessions,ManagedAccountSession} from '../account-sessions';
import {useI18n,getLocale} from '../i18n';
import {loginMethodLabel} from './AccountConnections';

export function AccountSessionsPanel({onLogout,logoutBusy}:{onLogout:()=>void;logoutBusy:boolean}){
  const {t}=useI18n();
  const [data,setData]=useState<AccountSessions|null>(null),[loading,setLoading]=useState(true),[action,setAction]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [confirmation,setConfirmation]=useState<'others'|ManagedAccountSession|null>(null);
  const alive=useRef(false),version=useRef(0);
  const busy=loading||action||logoutBusy;
  usePageLoading(loading&&!data);
  async function load(){
    const ticket=++version.current;setLoading(true);setError('');setNotice('');setConfirmation(null);
    try{const next=await api.accountSessions.list();if(alive.current&&ticket===version.current)setData(next);}
    catch(e){if(alive.current&&ticket===version.current)setError(e instanceof Error?e.message:t('Oturumlar alınamadı. Yeniden dene.'));}
    finally{if(alive.current&&ticket===version.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;version.current++;};},[]);
  async function revoke(){
    if(!confirmation||busy)return;setAction(true);setError('');setNotice('');
    try{
      const result=confirmation==='others'?await api.accountSessions.revokeOthers():await api.accountSessions.revoke(confirmation.id);
      if(alive.current){setData(result.sessions);setConfirmation(null);setNotice(t('{0} oturum sonlandırıldı. Bu tarayıcı açık kaldı.',[result.revoked]));}
    }catch(e){if(alive.current){setConfirmation(null);setError(e instanceof Error?e.message:t('Oturumlar yönetilemedi. Yeniden dene.'));}}
    finally{if(alive.current)setAction(false);}
  }
  const when=(date:string)=>new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeStyle:'short'}).format(new Date(date));
  const others=Math.max(0,(data?.total||0)-1);
  return <>
    <section className="carpan-settings-card carpan-sessions-card" aria-busy={busy}>
      <header className="carpan-sessions-heading"><div><h2>{t('Aktif oturumlar')}</h2><p>{t('Carpan hesabının açık olduğu girişleri yönet.')}</p></div><button type="button" className="carpan-session-refresh" disabled={busy} onClick={()=>void load()} aria-label={t('Oturumları yenile')}><RefreshCw size={16}/></button></header>
      {error&&<p className="carpan-sessions-message is-error" role="alert">{error}</p>}
      {notice&&<p className="carpan-sessions-message is-success" role="status"><Check size={16}/>{notice}</p>}
      {!data&&loading&&<p className="carpan-sessions-message" role="status">{t('Oturumlar yükleniyor…')}</p>}
      {data&&<>
        <div className="carpan-sessions-overview"><span><ShieldCheck size={17}/>{t('{0} aktif oturum',[data.total])}</span><button type="button" className="carpan-session-action" disabled={busy||Boolean(error)||!others} onClick={()=>{setNotice('');setConfirmation('others');}}>{t('Diğer oturumları kapat')}</button></div>
        <p className="carpan-sessions-note">{t('Cihaz ve konum bilgisi kaydedilmiyor. Oturumları giriş yöntemi ve başlangıç zamanından ayırt edebilirsin.')}</p>
        {confirmation&&<div className="carpan-session-confirm" role="group" aria-label={t('Oturum sonlandırma onayı')}>
          <strong>{t(confirmation==='others'?'Diğer tüm oturumlar sonlandırılsın mı?':'Seçilen oturum sonlandırılsın mı?')}</strong>
          {confirmation!=='others'&&<small>{t(loginMethodLabel(confirmation.method))} · {when(confirmation.createdAt)}</small>}
          <p>{t('Bu tarayıcıdaki oturumun, hesabın ve kayıtların korunur. Kapatılan oturumlarda yeniden giriş gerekir.')}</p>
          <div><button className="carpan-session-action is-danger" type="button" disabled={busy} onClick={()=>void revoke()}>{t(action?'Sonlandırılıyor…':'Evet, sonlandır')}</button><button type="button" className="carpan-session-action" disabled={busy} onClick={()=>setConfirmation(null)}>{t('İptal')}</button></div>
        </div>}
        <ul className="carpan-sessions-list">{data.sessions.map(item=><li className={item.current?'is-current':''} key={item.id}>
          <span className="carpan-session-icon"><Monitor size={20}/></span><div className="carpan-session-details"><strong>{t(loginMethodLabel(item.method))}</strong><dl><div><dt>{t('Başlangıç')}</dt><dd>{when(item.createdAt)}</dd></div><div><dt>{t('Bitiş')}</dt><dd>{when(item.expiresAt)}</dd></div></dl></div>
          {item.current?<span className="carpan-settings-status is-verified"><Check size={14}/>{t('Bu tarayıcı')}</span>:<button className="carpan-session-action" type="button" disabled={busy||Boolean(error)} onClick={()=>{setNotice('');setConfirmation(item);}}>{t('Sonlandır')}</button>}
        </li>)}</ul>
        {data.truncated&&<p className="carpan-sessions-note">{t('En son 100 oturum gösteriliyor. Diğer oturumları kapat düğmesi listelenmeyen oturumları da sonlandırır.')}</p>}
      </>}
    </section>
    <section className="carpan-settings-card"><h2>{t('Bu tarayıcıdan çıkış')}</h2><div className="carpan-settings-row"><span><LogOut size={16}/>{t('Çıkış yap')}</span><div><strong>{t('Bu oturumu sonlandır.')}</strong><small>{t('Hesabın ve kayıtların korunur.')}</small></div><button type="button" className="is-danger" disabled={busy} onClick={onLogout}>{t(logoutBusy?'Çıkış yapılıyor…':'Çıkış yap')}</button></div></section>
  </>;
}
