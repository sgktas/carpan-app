import {useEffect,useRef,useState} from 'react';
import {useAccount,useSignMessage} from 'wagmi';
import {api} from '../api';
import {t} from '../i18n';
import {useAuth} from '../hooks/useAuth';

type Preview=Awaited<ReturnType<typeof api.googleWalletLinkPreview>>;
const errors:Record<string,string>={
 'Sign in with Google again before linking accounts.':'Hesapları bağlamadan önce Google ile yeniden giriş yap.',
 'This account cannot be linked automatically. Contact Carpan support.':'Bu hesap otomatik bağlanamaz. Carpan desteğine başvur.',
 'This Google profile has activity. Automatic linking is unavailable.':'Bu Google profilinde kayıtlar var. Otomatik bağlama kullanılamıyor.',
 'An existing verified wallet account is required.':'Mevcut doğrulanmış bir cüzdan hesabı gerekli.',
 'The wallet account already has another sign-in identity. Contact Carpan support.':'Cüzdan hesabında başka bir giriş kimliği var. Carpan desteğine başvur.',
 'Invalid account-link signature.':'Hesap bağlama imzası geçersiz.',
 'Account-link request expired or was already used.':'Hesap bağlama isteği süresi dolmuş veya kullanılmış.',
 'Account details changed. Review the link again.':'Hesap bilgileri değişti. Bağlamayı yeniden incele.',
 'Account linking is currently unavailable.':'Hesap bağlama şu anda kullanılamıyor.',
};
export function GoogleWalletLink(){
 const {user,refresh}=useAuth(),{address}=useAccount(),{signMessageAsync}=useSignMessage();
 const [preview,setPreview]=useState<Preview|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const operation=useRef(false),generation=useRef(0);
 useEffect(()=>{generation.current++;setPreview(null);setConsent(false);setError('');return()=>{generation.current++;};},[address,user?.id]);
 if(!user?.linkedMethods?.some(m=>m.method==='google')||user.walletVerifiedAt||!address)return null;
 async function run(action:(version:number)=>Promise<void>){
  if(operation.current)return;operation.current=true;const version=generation.current;setBusy(true);setError('');
  try{await action(version);}catch(e){if(version===generation.current){const message=e instanceof Error?e.message:String(e);setError(t(errors[message]||message));}}
  finally{operation.current=false;setBusy(false);}
 }
 return <div className="carpan-google-wallet-link">
  <strong>{t('Google ve cüzdanla aynı hesaba gir.')}</strong>
  <p>{t('Bu cüzdan zaten bir Carpan hesabına bağlıysa, yeni ve kullanılmamış Google profilini o hesaba bağlayabilirsin. Mevcut cüzdan hesabının kayıtları ve yetkileri korunur.')}</p>
  {error&&<p role="alert">{error}</p>}
  <button type="button" disabled={busy} onClick={()=>void run(async version=>{setPreview(null);setConsent(false);const next=await api.googleWalletLinkPreview(address!);if(version===generation.current)setPreview(next);})}>{busy?t('Kontrol ediliyor…'):t('Hesap bağlantısını incele')}</button>
  {preview&&<>
   <p><strong>Google</strong> · {preview.email}<br/><strong>{t('Mevcut cüzdan hesabı')}</strong><br/><code>{preview.address}</code></p>
   <p>{t('Ayrı Google profili kullanım dışı kalır ve o profilin oturumları kapanır. Kayıt silinmez, para taşınmaz ve referans hakkı eklenmez. Google girişi mevcut cüzdan hesabının yetkilerine erişir.')}</p>
   <details><summary>{t('İmzalanacak mesajı incele')}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{preview.message}</pre></details>
   <label style={{display:'flex',gap:10,alignItems:'flex-start',margin:'14px 0'}}><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span>{t('Bu Google girişini mevcut cüzdan hesabıma bağlamayı onaylıyorum.')}</span></label>
   <button type="button" disabled={busy||!consent} onClick={()=>void run(async version=>{
    if(Date.parse(preview.expiresAt)<=Date.now())throw Error('Account-link request expired or was already used.');
    const signature=await signMessageAsync({message:preview.message});if(version!==generation.current)return;
    await api.googleWalletLinkComplete(preview.nonce,signature);await refresh();
   })}>{busy?t('Cüzdan doğrulanıyor…'):t('İmzala ve aynı hesaba bağla')}</button>
  </>}
  <button type="button" disabled={busy} onClick={()=>void run(async()=>{const flow=await api.googleOAuthStart('/settings?tab=security#account');window.location.assign(flow.authUrl);})}>{t('Google ile yeniden giriş yap')}</button>
 </div>;
}
