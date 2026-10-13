import {usePageLoading} from '../hooks/usePageLoading';
import {useEffect,useState,type FormEvent} from 'react';
import {useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {Check} from 'lucide-react';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n';
import {useCarpanLogin} from '../components/CarpanLogin';
import {AccountConnections} from '../components/AccountConnections';
import {AccountWalletLink} from '../components/AccountWalletLink';
import {AccountSessionsPanel} from '../components/AccountSessionsPanel';
import {api} from '../api';
import './carpan-account.css';

export function SettingsPage(){
  const {user,refresh,logout,authError}=useAuth(),{t,language,setLanguage}=useI18n(),{openLogin}=useCarpanLogin();
  const [params,setParams]=useSearchParams(),navigate=useNavigate(),location=useLocation();
  const requestedTab=params.get('tab');
  const tab=requestedTab==='security'?'security':requestedTab==='sessions'?'sessions':requestedTab==='preferences'?'preferences':'profile';
  const [profile,setProfile]=useState({handle:'',name:''}),[ready,setReady]=useState(false),[edit,setEdit]=useState<'name'|null>(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  usePageLoading(Boolean(user)&&tab==='profile'&&!ready&&!error);
  useEffect(()=>{let active=true;setReady(false);setError('');setEdit(null);if(user&&tab==='profile')api.myPublicProfile().then(value=>{if(active){setProfile(value);setReady(true);}}).catch(e=>{if(active)setError(e instanceof Error?e.message:t('Profil alınamadı.'));});return()=>{active=false;};},[user?.id,tab]);
  async function save(e:FormEvent){e.preventDefault();if(!edit||!ready||busy)return;setBusy(true);setError('');setSaved(false);try{const next={...profile,[edit]:draft.trim()};setProfile(await api.updatePublicProfile(next.handle,next.name));await refresh();setEdit(null);setSaved(true);}catch(e){setError(e instanceof Error?e.message:t('Profil kaydedilemedi.'));}finally{setBusy(false);}}
  async function endSession(){setBusy(true);setError('');try{await logout();navigate('/');}catch(e){setError(e instanceof Error?e.message:t('Çıkış yapılamadı. Yeniden dene.'));}finally{setBusy(false);}}
  function profileRow(){return <div className="carpan-settings-row"><span>{t('Ad')}</span><div>{edit?<form className="carpan-settings-edit" onSubmit={save}><label className="sr-only" htmlFor="settings-name">{t('Ad')}</label><input id="settings-name" autoFocus required minLength={2} maxLength={40} autoComplete="name" value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/><div><button disabled={busy} type="submit">{t(busy?'Kaydediliyor…':'Kaydet')}</button><button disabled={busy} type="button" className="is-secondary" onClick={()=>setEdit(null)}>{t('İptal')}</button></div></form>:<><strong>{ready?(profile.name||t('Henüz ayarlanmadı')):'—'}</strong><small>{t('Carpan içinde görünen adın.')}</small></>}</div>{!edit&&<button type="button" disabled={!ready||busy} onClick={()=>{setEdit('name');setDraft(profile.name);setSaved(false);}}>{t('Düzenle')}</button>}</div>;}
  return <div className="carpan-settings-page"><header className="carpan-settings-intro"><h1>{t('Ayarlar')}</h1></header><nav className="carpan-settings-tabs" aria-label={t('Hesap ayarları')}>
    {(['profile','security','sessions','preferences'] as const).map(value=><button type="button" key={value} aria-current={tab===value?'page':undefined} onClick={()=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('tab',value);return next;})}>{t(value==='profile'?'Profil':value==='security'?'Güvenlik':value==='sessions'?'Oturumlar':'Tercihler')}</button>)}
  </nav>
  {(error||authError)&&<p className="carpan-settings-error" role="alert">{error||authError}</p>}{saved&&<p className="carpan-settings-success" role="status"><Check size={16}/>{t('Carpan profilin güncellendi.')}</p>}
  {!user?<section className="carpan-settings-card"><h2>{t('Carpan hesabı')}</h2><div className="carpan-settings-row"><span>{t('Hesap')}</span><div><strong>{t('Hesap ayarlarını görmek için giriş yap.')}</strong><small>{t('Finans ve takip kayıtların aynı hesapta.')}</small></div><button type="button" onClick={()=>openLogin('/settings'+(location.search||''))}>{t('Giriş yap')}</button></div></section>:<>
    {tab==='profile'&&<section className="carpan-settings-card"><h2>{t('Profil')}</h2>
      <div className="carpan-settings-row"><span>{t('E-posta')}</span><div><strong>{user.email||t('E-posta bağlı değil')}</strong><small>{t('Hesabına kayıtlı iletişim adresi.')}</small></div><span className="carpan-settings-status">{t(user.linkedMethods?.some(i=>i.method==='email'||i.method==='google')?'Doğrulandı':'Bağlı değil')}</span></div>
      {profileRow()}
      <div className="carpan-settings-row"><span>{t('Üyelik tarihi')}</span><div><strong>{new Date(user.createdAt).toLocaleDateString(language==='en'?'en-GB':'tr-TR',{day:'numeric',month:'long',year:'numeric'})}</strong></div></div>
    </section>}
    {tab==='security'&&<section className="carpan-settings-card" id="account"><h2>{t('Giriş yöntemleri')}</h2><div className="carpan-settings-connections"><AccountConnections/><AccountWalletLink key={user.id}/></div><div className="carpan-settings-row"><span>{t('Parola')}</span><div><strong>{t('Parolasız giriş')}</strong><small>{t('Giriş, doğrulanmış cüzdan veya etkin hesap sağlayıcısıyla yapılır.')}</small></div></div></section>}
    {tab==='sessions'&&<AccountSessionsPanel key={user.id} onLogout={()=>void endSession()} logoutBusy={busy}/>}
  </>}
  {tab==='preferences'&&<section className="carpan-settings-card"><h2>{t('Tercihler')}</h2><div className="carpan-settings-row"><span>{t('Dil')}</span><div><strong>{language==='tr'?'Türkçe':'English'}</strong><small>{t('Carpan arayüzünün dili.')}</small></div><div className="carpan-language" role="group" aria-label={t('Dil seçimi')}><button type="button" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>EN</button><button type="button" aria-pressed={language==='tr'} onClick={()=>setLanguage('tr')}>TR</button></div></div></section>}
  </div>;
}
