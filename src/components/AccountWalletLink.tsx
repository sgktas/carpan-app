import {useState} from 'react';
import {useAccount,useSignMessage} from 'wagmi';
import {ConnectKitButton} from 'connectkit';
import {useAuth} from '../hooks/useAuth';
import {useI18n} from '../i18n';
import {api} from '../api';
import {GoogleWalletLink} from './GoogleWalletLink';

/** Existing nonce/signature verification, now available from Security settings. */
export function AccountWalletLink(){
  const {user,refresh}=useAuth(),{t}=useI18n(),{address,chainId}=useAccount(),{signMessageAsync}=useSignMessage();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[linked,setLinked]=useState(false);
  if(!user||user.walletAddress)return null;
  async function linkWallet(){
    if(!address||busy)return;setBusy(true);setError('');setLinked(false);
    try{const {nonce,message}=await api.walletNonce();const signature=await signMessageAsync({message});await api.verifyWallet(address,signature,message,nonce,chainId);await refresh();setLinked(true);}
    catch(caught){setError(caught instanceof Error?caught.message:t('Cüzdan bu hesaba bağlanamadı.'));}finally{setBusy(false);}
  }
  return <div className="carpan-settings-wallet-link">
    <ConnectKitButton.Custom>{({show})=><button type="button" disabled={busy} onClick={()=>{if(address)void linkWallet();else if(show)show();else setError(t('Cüzdan seçici yüklenemedi. Sayfayı yenileyip tekrar dene.'));}}>{t(busy?'Cüzdan doğrulanıyor…':address?'Cüzdanı bu hesaba bağla':'Cüzdan seç')}</button>}</ConnectKitButton.Custom>
    <p>{t('Bağlama, yeni profil açmadan cüzdanı bu hesabına ekler. Ağ değiştirmen gerekmez; ücretsiz mesaj imzası işlem veya gas gerektirmez.')}</p>
    {linked&&<p role="status">{t('Cüzdan bu Carpan hesabına bağlandı.')}</p>}{error&&<p role="alert">{error}</p>}
    <GoogleWalletLink/>
  </div>;
}
