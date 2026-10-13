import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useAccount} from 'wagmi';
import {useModal} from 'connectkit';
import {ArrowUpRight, Copy, Wallet} from 'lucide-react';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n';
import {api} from '../api';
import type {AccountLoginMethod} from '../types';

const short=(value:string)=>value.slice(0,6)+'…'+value.slice(-4);
const methodNames:Record<AccountLoginMethod,string>={wallet:'Cüzdanla giriş',x:'X ile giriş',google:'Google ile giriş',email:'E-posta ile giriş',demo:'Demo girişi'};
export const loginMethodLabel=(method:AccountLoginMethod|null|undefined)=>method?methodNames[method]:'Eski oturum · yöntem kaydı yok';

/** A session, a verified account identity and a browser wallet are different facts. */
export function AccountConnections({compact=false}:{compact?:boolean}){
  const {user,session,xLoginAvailable,refresh}=useAuth(),{t}=useI18n();
  const {address}=useAccount(),modal=useModal();
  const [copied,setCopied]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [confirmXRemoval,setConfirmXRemoval]=useState(false);
  if(!user)return null;
  const wallet=user.walletAddress,verified=Boolean(user.walletVerifiedAt),identities=user.linkedMethods||[];
  async function copyWallet(){if(!wallet)return;try{await navigator.clipboard.writeText(wallet);setCopied(true);}catch{setError(t('Adres kopyalanamadı.'));}}
  async function linkX(){setBusy(true);setError('');try{const {authUrl}=await api.xAccountLinkStart();window.location.assign(authUrl);}catch(e){setError(e instanceof Error?e.message:t('X bağlantısı başlatılamadı.'));}finally{setBusy(false);}}
  async function removeX(){if(busy)return;setBusy(true);setError('');try{await api.xAccountDisconnect();setConfirmXRemoval(false);await refresh();}catch(e){setError(e instanceof Error?e.message:t('X bağlantısı kaldırılamadı.'));}finally{setBusy(false);}}
  return <div className={`carpan-account-connections${compact?' is-compact':''}`}>
    <div className="carpan-session-method"><span>{t('Bu oturum')}</span><strong>{t(loginMethodLabel(user.isDemo?'demo':session?.method))}</strong></div>
    <div className="carpan-linked-identities"><span>{t('Hesaba bağlı girişler')}</span>{identities.filter(i=>i.method!=='wallet').map(identity=><div key={identity.method}><strong>{identity.method==='x'?'X':identity.method==='google'?'Google':t('E-posta')}</strong><small>{identity.method==='x'?`@${identity.identifier}`:identity.identifier}</small>{identity.method==='x'&&identity.identifier.toLowerCase()==='refvox'&&<em>{t('Eski X bağlantısı')}</em>}</div>)}
      {wallet&&<div className="carpan-account-wallet-row"><Link to={`/arc/addresses/${wallet.toLowerCase()}`} title={wallet}><Wallet size={14}/><span><strong>{short(wallet)}</strong><small>{verified?t('Hesaba doğrulanmış cüzdan'):t('Hesaba kayıtlı · doğrulanmamış')}</small></span><ArrowUpRight size={12}/></Link><button type="button" onClick={()=>void copyWallet()} aria-label={t('Hesap cüzdan adresini kopyala')}><Copy size={13}/></button></div>}
      {!wallet&&<small>{t('Hesaba doğrulanmış cüzdan yok')}</small>}
      {copied&&<small role="status">{t('Cüzdan adresi kopyalandı.')}</small>}
    </div>
    <button type="button" className="carpan-browser-wallet" onClick={()=>address?modal.openProfile():modal.setOpen(true)}><Wallet size={15}/><span><strong>{t('Tarayıcı cüzdanı')}</strong><small>{address?short(address):t('Bağlı değil · Cüzdan seç')}</small></span><ArrowUpRight size={13}/></button>
    {address&&wallet&&address.toLowerCase()!==wallet.toLowerCase()&&<small className="carpan-wallet-mismatch">{t('Bu tarayıcıdaki cüzdan, hesap cüzdanından farklı.')}</small>}
    {!compact&&<div className="carpan-identity-provider-actions"><button type="button" disabled={!xLoginAvailable||busy} onClick={()=>void linkX()}>{t(identities.some(i=>i.method==='x')?'X hesabını güncelle':'X hesabı bağla')}</button><p>{xLoginAvailable?t('X üzerinden doğrulayarak bu Carpan hesabına ekle. Ayrı profil açılmaz.'):t('X hesabını bağlamak için X giriş servisi etkinleştirilmeli.')}</p><p>{t('Bu oturumun giriş yöntemi ve bağlı hesaplar ayrı gösterilir. Cüzdan bağlantısı tek başına hesaba giriş değildir.')}</p></div>}
    {!compact&&identities.some(i=>i.method==='x')&&<div className="carpan-identity-provider-actions">
      {!confirmXRemoval?<button type="button" disabled={busy} onClick={()=>setConfirmXRemoval(true)}>{t('X bağlantısını kaldır')}</button>:<>
        <p>{t('Bu X hesabıyla Carpan’a giriş kapanır ve X oturumları sonlandırılır. Google veya doğrulanmış cüzdan girişin, kayıtların ve yetkilerin korunur. X’teki hesabın silinmez.')}</p>
        <button type="button" disabled={busy} onClick={()=>void removeX()}>{busy?t('Kontrol ediliyor…'):t('Evet, X bağlantısını kaldır')}</button>
        <button type="button" disabled={busy} onClick={()=>setConfirmXRemoval(false)}>{t('Vazgeç')}</button>
      </>}
    </div>}
    {error&&<small role="alert" className="carpan-control-error">{error}</small>}
  </div>;
}
