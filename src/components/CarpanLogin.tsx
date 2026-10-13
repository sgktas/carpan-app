import {createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {useAccount, useSignMessage} from 'wagmi';
import {useModal} from 'connectkit';
import {ArrowLeft, Mail, Pause, Play, RefreshCw, Wallet} from 'lucide-react';
import '../pages/carpan-account.css';
import '../pages/carpan-auth-cinematic.css';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n';
import {api} from '../api';
import {clearReferralIntent, readPendingReferralIntent, referralIntentPath} from '../referral-intent';
import {normalizeLoginReturn} from '../auth-return';

const LoginContext=createContext({openLogin:(_next?:string)=>{},openRegister:(_next?:string)=>{}});
export const useCarpanLogin=()=>useContext(LoginContext);
function safeReturn(value:string|null){return value?normalizeLoginReturn(value):null;}
const errors:Record<string,string>={
  access_denied:'X hesabınız için erişim izni verilmedi.',invalid_request:'X giriş isteği reddedildi. Ayarları kontrol edip yeniden deneyin.',
  invalid_scope:'X uygulaması için gereken izinler etkin değil.',oauth_failed:'Giriş tamamlanamadı. Yeniden deneyin.',
  x_api_access:'X API erişimi kullanılamıyor.',x_unavailable:'X ile giriş şu an kapalı. Cüzdanla giriş yapabilirsiniz.',demo_mode:'Gerçek giriş demo ortamında kullanılamaz.',
  google_denied:'Google hesabı için giriş izni verilmedi.',google_unavailable:'Google girişi henüz yapılandırılmadı.',
  google_failed:'Google hesabı doğrulanamadı. Lütfen yeniden deneyin.',google_email_conflict:'Bu e-posta başka bir giriş yöntemiyle kullanılıyor. O yöntemle giriş yapın.',
  x_link_conflict:'Bu X hesabı başka bir Carpan hesabına bağlı. Hesaplar otomatik birleştirilmez.',
};
export function CarpanLoginProvider({children}:{children:ReactNode}){
  const {user,demoMode,googleLoginAvailable,emailLoginAvailable,xLoginAvailable,authError,refresh}=useAuth();
  const {t}=useI18n(),location=useLocation(),navigate=useNavigate();
  const {address}=useAccount(),{signMessageAsync}=useSignMessage(),walletModal=useModal();
  const dialog=useRef<HTMLDialogElement>(null),currentAddress=useRef(address),returnTo=useRef<string|null>(null);
  currentAddress.current=address;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[email,setEmail]=useState(''),[emailSent,setEmailSent]=useState(false),[emailToken,setEmailToken]=useState('');
  const [walletPending,setWalletPending]=useState(false),walletWasOpen=useRef(false);
  const [visualPaused,setVisualPaused]=useState(false),[pageHidden,setPageHidden]=useState(document.hidden);
  const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [loadedScene,setLoadedScene]=useState('');
  const authPage=location.pathname==='/login'||location.pathname==='/register',register=location.pathname==='/register';
  const sceneSrc='/images/carpan-auth-balanced-v4.webp';
  const postLoginPath=()=>{const intent=readPendingReferralIntent();return normalizeLoginReturn(intent?referralIntentPath(intent):returnTo.current||'/');};
  function rememberReturn(path:string){returnTo.current=safeReturn(path);try{sessionStorage.setItem('carpan-login-return',returnTo.current||'/');}catch{/* Private browsing */}}
  function openLogin(next?:string){openAuth('login',next);}
  function openRegister(next?:string){openAuth('register',next);}
  function openAuth(mode:'login'|'register',next?:string){setError('');setEmailSent(false);rememberReturn(next||(authPage?returnTo.current||'/':location.pathname+location.search+location.hash));navigate(`/${mode}?next=${encodeURIComponent(returnTo.current||'/')}`);}
  function close(){dialog.current?.close();navigate('/');}
  function finish(){const next=postLoginPath();clearReferralIntent();returnTo.current=null;try{sessionStorage.removeItem('carpan-login-return');}catch{/* Private browsing */}dialog.current?.close();navigate(next);}
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference=()=>setReducedMotion(preference.matches),updateVisibility=()=>setPageHidden(document.hidden);
    preference.addEventListener('change',updatePreference);document.addEventListener('visibilitychange',updateVisibility);
    return()=>{preference.removeEventListener('change',updatePreference);document.removeEventListener('visibilitychange',updateVisibility);};
  },[]);
  useEffect(()=>{
    const params=new URLSearchParams(location.search),code=params.get('error'),requested=params.get('login')==='1';
    const token=new URLSearchParams(location.hash.slice(1)).get('email_token');
    if(!authPage&&!requested&&!code&&!token){dialog.current?.close();return;}
    let stored:string|null=null;try{stored=sessionStorage.getItem('carpan-login-return');}catch{/* Private browsing */}
    rememberReturn(safeReturn(params.get('next'))||safeReturn(stored)||'/');
    if(user&&requested){navigate(postLoginPath(),{replace:true});return;}
    if(code)setError(errors[code]||errors.oauth_failed);
    if(token)setEmailToken(token);
    params.delete('login');params.delete('next');params.delete('error');
    if(!authPage||requested||code||token){navigate(`/login?next=${encodeURIComponent(returnTo.current||'/')}`,{replace:true});return;}
    if(!walletPending&&!dialog.current?.open)dialog.current?.showModal();
  },[location.pathname,location.search,location.hash]);
  useEffect(()=>{
    if(!walletPending)return;
    if(walletModal.open){walletWasOpen.current=true;return;}
    if(walletWasOpen.current){setWalletPending(false);walletWasOpen.current=false;if(authPage&&!dialog.current?.open)dialog.current?.showModal();}
  },[walletModal.open,walletPending,authPage]);
  function connectWallet(){dialog.current?.close();setWalletPending(true);walletWasOpen.current=false;walletModal.setOpen(true);}
  async function walletLogin(){
    if(!address){connectWallet();return;}
    const signingAddress=address;setBusy(true);setError('');
    try{const {nonce,message}=await api.walletLoginChallenge(signingAddress);const signature=await signMessageAsync({message});
      if(currentAddress.current?.toLowerCase()!==signingAddress.toLowerCase())throw new Error(t('İmzalama sırasında cüzdan değişti. Yeniden deneyin.'));
      await api.walletLoginComplete(signingAddress,nonce,message,signature);await refresh();finish();
    }catch(e){setError(e instanceof Error?e.message:t('Cüzdan girişi başarısız.'));}finally{setBusy(false);}
  }
  async function oauth(provider:'google'|'x'){setBusy(true);setError('');try{const result=provider==='google'?await api.googleOAuthStart(postLoginPath()):await api.xOAuthStart(postLoginPath());if('authUrl'in result)window.location.assign(result.authUrl);else setError(t('Giriş yöntemi şu anda kullanılamıyor.'));}catch(e){setError(e instanceof Error?e.message:t('Giriş başlatılamadı.'));}finally{setBusy(false);}}
  async function sendEmail(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api.emailLoginStart(email,postLoginPath());setEmailSent(true);}catch(e){setError(e instanceof Error?e.message:t('E-posta gönderilemedi.'));}finally{setBusy(false);}}
  async function finishEmail(){setBusy(true);setError('');try{await api.emailLoginComplete(emailToken);setEmailToken('');await refresh();finish();}catch(e){setError(e instanceof Error?e.message:t('E-posta girişi başarısız.'));}finally{setBusy(false);}}
  const unavailable=busy||Boolean(authError)||demoMode;
  const motionPaused=visualPaused||reducedMotion||pageHidden||!authPage||walletPending||busy;
  return <LoginContext.Provider value={{openLogin,openRegister}}>{children}
    <dialog ref={dialog} className={`carpan-login-dialog carpan-auth-screen carpan-auth-cinematic${motionPaused?' is-motion-paused':''}`} aria-labelledby="carpan-login-title" aria-describedby="carpan-auth-description" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
      <div className="carpan-auth-shell">
      {authPage&&<div className={`carpan-auth-scene${loadedScene===sceneSrc?' is-art-loaded':''}`} aria-hidden="true">
        <img key={sceneSrc} className="carpan-auth-art" src={sceneSrc} alt="" decoding="async" fetchPriority="high" draggable={false} onLoad={()=>setLoadedScene(sceneSrc)} onError={()=>setLoadedScene('')}/>
        <div className="carpan-auth-light carpan-auth-light--one"/><div className="carpan-auth-light carpan-auth-light--two"/>
        <div className="carpan-auth-scene-shade"/>
        <div className="carpan-auth-scene-signature"><span>Multiply what matters.</span><small>{t('Finans')}<i/>{t('Terminal')}<i/>{t("Ecosystem")}</small></div>
      </div>}
      <header className="carpan-auth-topbar">
        <button className="carpan-auth-back" disabled={busy} onClick={close}><ArrowLeft size={16}/>{t('Ana sayfa')}</button>
        {!reducedMotion&&<button type="button" className="carpan-auth-motion" aria-label={t(visualPaused?'Görsel hareketini başlat':'Görsel hareketini durdur')} aria-pressed={visualPaused} onClick={()=>setVisualPaused(value=>!value)}>{visualPaused?<Play size={16}/>:<Pause size={16}/>}</button>}
      </header>
      <div className="carpan-auth-pane"><div className="carpan-auth-layout">
      <section className="carpan-auth-form">
      <div className="carpan-auth-form-intro">
      <h1 id="carpan-login-title">{t(register?'Hesap oluştur':'Giriş yap')}</h1>
      <p id="carpan-auth-description">{t(register?'Kendi çalışma alanını oluştur. Doğrulanmış giriş yönteminle başla.':'Çalışma alanına dönmek için giriş yöntemini seç.')}</p></div>
      {(error||authError)&&<div className="carpan-login-error" role="alert">{t(error||authError)}{authError&&<button onClick={()=>void refresh()}>{t('Bağlantıyı tekrar dene')}</button>}</div>}
      {emailToken?<button className="carpan-auth-submit" disabled={busy||Boolean(authError)} onClick={()=>void finishEmail()}><Mail size={19}/>{t('E-posta girişini tamamla')}</button>:<>
        <button className="carpan-auth-provider" disabled={unavailable||!googleLoginAvailable} onClick={()=>void oauth('google')}><svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.6Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4L15.4 17c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4H3v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-4V7.3H3a10 10 0 0 0 0 9.4L6.4 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9 5.3L6.4 10C7.2 7.7 9.4 6 12 6Z"/></svg><span>{t('Google ile devam et')}</span>{!googleLoginAvailable&&<small>{t('Henüz etkin değil')}</small>}</button>
        <div className="carpan-auth-wallet-row"><button className="carpan-auth-provider" disabled={unavailable} onClick={()=>void walletLogin()}><Wallet size={20}/><span>{t(address?'Cüzdanla doğrula':'Cüzdanla devam et')}</span></button>
        {address&&!unavailable&&<button type="button" className="carpan-login-change" title={t('Başka cüzdan kullan')} aria-label={t('Başka cüzdan kullan')} onClick={connectWallet}><RefreshCw size={17}/></button>}</div>
        {xLoginAvailable&&<button className="carpan-auth-provider" disabled={unavailable} onClick={()=>void oauth('x')}><span aria-hidden="true">𝕏</span>{t('X ile devam et')}</button>}
        <div className="carpan-auth-divider"><span>{t('veya')}</span></div>
        <form className="carpan-auth-email" onSubmit={sendEmail}><label htmlFor="carpan-login-email">{t('E-posta')}</label><input id="carpan-login-email" type="email" autoComplete="email" required disabled={unavailable||!emailLoginAvailable} placeholder="you@example.com" value={email} onChange={e=>{setEmail(e.target.value);setEmailSent(false);}}/>
          <p className="carpan-auth-hint">{emailLoginAvailable?t('Parola gerekmez. Tek kullanımlık bağlantı e-postana gelir.'):t('E-posta girişi henüz etkin değil. Cüzdanını kullanabilirsin.')}</p>
          {emailSent&&<p className="carpan-auth-success" role="status">{t('Giriş bağlantısını e-postana gönderdik. 15 dakika geçerli.')}</p>}
          <button className="carpan-auth-submit" disabled={unavailable||!emailLoginAvailable||emailSent}>{t(busy?'Gönderiliyor…':'Bağlantı gönder')}</button></form>
        <div className="carpan-auth-switch"><span>{t(register?'Zaten hesabın var mı?':'Hesabın yok mu?')}</span><button type="button" disabled={busy} onClick={()=>openAuth(register?'login':'register',returnTo.current||'/')}>{t(register?'Giriş yap':'Ücretsiz kaydol')}</button></div>
        <p className="carpan-auth-note">{t(register?'İlk doğrulamada Carpan hesabın oluşturulur.':'Aynı doğrulanmış giriş yöntemiyle hesabına dön.')}<br/>{t('Cüzdan doğrulaması ücretsiz mesaj imzasıdır; gas gerekmez.')}</p>
        <p className="carpan-auth-legal"><Link to="/privacy">{t('Gizlilik')}</Link><span> · </span><Link to="/terms">{t('Kullanım koşulları')}</Link></p>
      </>}
      </section>
      </div>
      </div>
      </div>
    </dialog>
  </LoginContext.Provider>;
}
