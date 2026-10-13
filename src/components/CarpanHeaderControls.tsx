import {useEffect, useRef, useState} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {ArrowLeft, ChevronRight, LogOut, Settings} from 'lucide-react';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n';
import {useCarpanLogin} from './CarpanLogin';
import {loginMethodLabel} from './AccountConnections';
import {CarpanNotifications} from './CarpanNotifications';

/** One preferences menu; module navigation remains reachable without a second launcher. */
export function CarpanHeaderControls() {
  const {user,session,logout,authError,refresh}=useAuth();
  const {language,setLanguage,t}=useI18n();
  const {openLogin,openRegister}=useCarpanLogin();
  const location=useLocation(),navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const [section,setSection]=useState<'language'|null>(null);
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const root=useRef<HTMLDivElement>(null);
  const settingsButton=useRef<HTMLButtonElement>(null),backButton=useRef<HTMLButtonElement>(null),sectionButton=useRef<HTMLButtonElement|null>(null);
  const close=()=>{setOpen(false);setSection(null);};
  const back=()=>{setSection(null);requestAnimationFrame(()=>sectionButton.current?.focus());};
  useEffect(()=>{setOpen(false);setSection(null);setError('');},[location.pathname,location.search,user?.id]);
  useEffect(()=>{if(section)backButton.current?.focus();},[section]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)){setOpen(false);setSection(null);}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(section){setSection(null);requestAnimationFrame(()=>sectionButton.current?.focus());}else{setOpen(false);settingsButton.current?.focus();}}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open,section]);
  const name=user?.publicName||t('Carpan hesabı');
  async function signOut(){setBusy(true);setError('');try{await logout();close();navigate('/');}catch{setError(t('Çıkış yapılamadı. Yeniden dene.'));}finally{setBusy(false);}}
  return <div className="carpan-header-controls" ref={root}>
    {!user&&<><button className="carpan-signin-button" type="button" onClick={()=>openLogin()}>{t('Giriş yap')}</button><button className="carpan-register-button" type="button" onClick={()=>openRegister()}>{t('Ücretsiz kaydol')}</button></>}
    <CarpanNotifications open={notificationsOpen} onToggle={()=>{setOpen(false);setSection(null);setNotificationsOpen(v=>!v);}} onClose={()=>setNotificationsOpen(false)}/>
    <button ref={settingsButton} type="button" className="carpan-settings-button carpan-preferences-trigger" aria-label={t('Ayarlar menüsü')} title={t('Ayarlar')} aria-expanded={open} aria-controls="carpan-preferences-panel" onClick={()=>{setNotificationsOpen(false);setOpen(!open);setSection(null);}}><Settings size={20}/></button>
    {open&&<div id="carpan-preferences-panel" className="carpan-control-panel carpan-preferences-panel">
      <div className="carpan-preferences-identity">
        {user?<div><strong>{name}</strong>{user.email&&<small>{user.email}</small>}<span>{t(loginMethodLabel(user.isDemo?'demo':session?.method))}</span></div>:<div><strong>CARPAN</strong><small>Multiply what matters.</small></div>}
      </div>
      <nav aria-label={t('Ayarlar menüsü')}>
        <div hidden={section!==null}>
          <button type="button" aria-expanded={section==='language'} aria-controls="carpan-preferences-language" onClick={e=>{sectionButton.current=e.currentTarget;setSection('language');}}>{t('Dil')}<ChevronRight size={16}/></button>
          <Link to="/settings" onClick={close}>{t('Ayarlar')}</Link>
          {user?.role==='admin'&&<Link to="/admin" onClick={close}>{t('Yönetim')}</Link>}
          <Link to="/about" onClick={close}>{t('Carpan hakkında')}</Link>
          <a href="mailto:info@carpan.app" onClick={close}>{t('Destekle iletişime geç')}</a>
          {user&&<button type="button" className="carpan-menu-signout" disabled={busy} onClick={()=>void signOut()}><span>{t(busy?'Çıkış yapılıyor…':'Çıkış yap')}</span><LogOut size={17} aria-hidden="true"/></button>}
        </div>
        {section&&<button ref={backButton} type="button" className="carpan-preferences-back" onClick={back}><ArrowLeft size={16}/>{t('Dil')}</button>}
        {section==='language'&&<div id="carpan-preferences-language" role="group" aria-label={t('Dil seçimi')}>
          <button type="button" aria-pressed={language==='en'} onClick={()=>{setLanguage('en');close();}}>English <span>EN</span></button>
          <button type="button" aria-pressed={language==='tr'} onClick={()=>{setLanguage('tr');close();}}>Türkçe <span>TR</span></button>
        </div>}
      </nav>
      {(error||authError)&&<p className="carpan-control-error" role="alert">{error||t(authError)}</p>}
      {authError&&<button className="carpan-control-action" onClick={()=>void refresh()}>{t('Bağlantıyı tekrar dene')}</button>}
    </div>}
  </div>;
}
