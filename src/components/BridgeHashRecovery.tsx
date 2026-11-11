import {t} from '../i18n/index';
import {useMemo,useState,type FormEvent} from 'react';
import {useAccount} from 'wagmi';
import {createPublicClient,createWalletClient,custom,formatUnits,http,type EIP1193Provider,type Hex} from 'viem';
import {CheckCircle2,ExternalLink,LoaderCircle,LifeBuoy,Search} from 'lucide-react';
import {BRIDGE_NETWORK_FACTS,bridgeWalletChains} from '../bridge-networks';
import {CCTP_ABI,inspectRecovery,receiveRequest,verifyDelivery,type RecoveryItem,type RecoveryIo,type BridgeEnvironment} from '../bridge-recovery';
import {ensureBridgeWalletNetwork} from '../bridge-wallet-network';
import {WalletConnectionButton} from './WalletConnectionButton';
import {BridgeError} from './BridgePanels';
import './bridge-recovery.css';

const short=(value:string)=>`${value.slice(0,8)}…${value.slice(-6)}`;
const client=(chainId:number)=>{const f=BRIDGE_NETWORK_FACTS.find(n=>n.id===chainId);if(!f)throw new Error(t('Desteklenmeyen ağ.'));return createPublicClient({transport:http(f.rpcs[0],{timeout:15000,retryCount:1})});};
const io:RecoveryIo={
 receipt:(chainId,hash)=>client(chainId).getTransactionReceipt({hash}),
 iris:async url=>{const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});return {status:response.status,body:await response.json().catch(()=>null)};},
 usedNonce:async(chainId,transmitter,nonce)=>await client(chainId).readContract({address:transmitter,abi:CCTP_ABI,functionName:'usedNonces',args:[nonce]}) as bigint,
};
/** Built per render so a language switch updates the labels. */
const states=():Record<RecoveryItem['state'],{label:string;tone:string;note:string}>=>({
 awaiting_attestation:{label:t('Circle tasdiki bekleniyor'),tone:'waiting',note:t('Kaynak gönderim doğrulandı. Tasdik hazır olduğunda bu ekrandan hedefte tamamlayabilirsin. Yeniden gönderme.')},
 ready:{label:t('Hedefte tamamlanmaya hazır'),tone:'ready',note:t('Circle tasdiki hazır ve hedef ağ bu mesajı henüz almadı. Hedef ağda kendi cüzdanınla tamamlayabilirsin.')},
 delivered:{label:t('Hedefte teslim edilmiş'),tone:'success',note:t('Hedef ağ bu mesajı zaten işlemiş. Yapılacak bir şey yok.')},
 unsupported_destination:{label:t('Hedef bu ekranda desteklenmiyor'),tone:'waiting',note:t('Hedef alan incelenmiş EVM ağları arasında değil (örn. Solana). Gönderim kanıtı gösterilir; tamamlama için hedef ağın kendi aracını kullan.')},
 mismatch:{label:t('Circle mesajı kaynakla uyuşmuyor'),tone:'error',note:t('Tasdikli mesajın alıcı, miktar veya rota alanları kaynak olayla eşleşmedi. Güvenlik nedeniyle imza istenmez.')},
});

/** Recover any CCTP V2 USDC transfer from its source transaction hash, with or without a Carpan record. */
export function BridgeHashRecovery({environment}:{environment:BridgeEnvironment}){
 const networks=useMemo(()=>BRIDGE_NETWORK_FACTS.filter(f=>f.testnet===(environment==='testnet')),[environment]);
 const [source,setSource]=useState(()=>environment==='testnet'?5042002:5042),[hash,setHash]=useState('');
 const [items,setItems]=useState<RecoveryItem[]|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [open,setOpen]=useState(false);
 async function inspect(event?:FormEvent){event?.preventDefault();setLoading(true);setError('');setItems(null);
  try{setItems(await inspectRecovery(environment,source,hash,io));}catch(e){setError(e instanceof Error?e.message:t('Transfer incelenemedi.'));}finally{setLoading(false);}}
 return <section className="aw-panel ab-history br-recovery" aria-label={t('Hash ile köprü kurtarma')}>
  <div className="ab-record-heading"><h2><LifeBuoy size={17}/> {t('Takılan transferi hash ile kurtar')}</h2><button className="aw-text" type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?t('Gizle'):t('Aç')}</button></div>
  <p className="aw-note">{t('Carpan kaydın kaybolduysa veya transferi başka bir uygulamadan yaptıysan, kaynak işlem hash’iyle durumunu kontrol et. Kanıt yalnızca kaynak makbuzu, incelenmiş Circle sözleşmeleri ve Circle tasdikinden gelir.')}</p>
  {open&&<>
   <form className="ab-form br-recovery-form" onSubmit={inspect}>
    <label>{t('Kaynak ağ')}<select value={source} disabled={loading} onChange={e=>{setSource(Number(e.target.value));setItems(null);}}>{networks.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    <label>{t('Kaynak işlem hash’i')}<input value={hash} disabled={loading} placeholder="0x…" spellCheck={false} autoComplete="off" onChange={e=>{setHash(e.target.value);setItems(null);}}/></label>
    <button className="aw-button ab-primary" type="submit" disabled={loading||!hash.trim()}>{loading?<LoaderCircle size={15} className="at-spinning"/>:<Search size={15}/>} {t('Durumu kontrol et')}</button>
   </form>
   {error&&<BridgeError message={error}/>}
   {items?.map(item=><RecoveryCard key={`${item.index}`} item={item} environment={environment} refresh={()=>void inspect()}/>)}
  </>}
 </section>;
}

function RecoveryCard({item,environment,refresh}:{item:RecoveryItem;environment:BridgeEnvironment;refresh:()=>void}){
 const {address,connector}=useAccount();
 const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState(''),[delivered,setDelivered]=useState<{kind:'already'}|{kind:'tx';hash:Hex}|null>(null),[pendingHash,setPendingHash]=useState<Hex|null>(null);
 const labels=states(),state=delivered?labels.delivered:labels[item.state],destination=item.destination;
 const received=item.feeExecuted===null?null:item.amount-item.feeExecuted;
 async function complete(){
  if(!destination||!connector||!address)return;setBusy(true);setError('');
  try{
   const request=receiveRequest(item,address);
   const provider=await connector.getProvider() as EIP1193Provider;
   const accounts=await provider.request({method:'eth_accounts'}) as string[];
   if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw new Error(t('Bağlı cüzdan değişti; işlemi yeniden incele.'));
   const chain=bridgeWalletChains(environment==='testnet').find(c=>c.id===destination.id);if(!chain)throw new Error(t('Hedef ağ bulunamadı.'));
   setPhase(t('{0} ağına geçiş için cüzdan onayı bekleniyor.',[destination.name]));
   await ensureBridgeWalletNetwork(provider,chain,environment);
   const reader=createPublicClient({chain,transport:http(destination.rpcs[0])});
   // Re-check right before signing: another party may have completed it meanwhile.
   if(await reader.readContract({address:destination.messageTransmitter,abi:CCTP_ABI,functionName:'usedNonces',args:[item.nonce!]}) as bigint>0n){setDelivered({kind:'already'});return;}
   setPhase(t('İşlem simüle ediliyor…'));
   await reader.simulateContract({...request,account:address as Hex});
   setPhase(t('Cüzdanında hedef işlemi incele ve onayla.'));
   const hash=await createWalletClient({chain,account:address as Hex,transport:custom(provider)}).writeContract({...request,account:address as Hex,chain});
   setPendingHash(hash);setPhase(t('Hedef işlem makbuzu bekleniyor…'));
   const receipt=await reader.waitForTransactionReceipt({hash,timeout:180000});
   if(!verifyDelivery(item,receipt))throw new Error(t('Hedef işlem makbuzu bu mesajın teslimini doğrulamadı. Hash: {0}',[hash]));
   setDelivered({kind:'tx',hash});
  }catch(e){setError(e instanceof Error?e.message:t('Hedef işlem tamamlanamadı.'));}
  finally{setBusy(false);setPhase('');}
 }
 return <article className="br-recovery-card" data-tone={delivered?'success':state.tone}>
  <div className="ab-record-heading"><strong>{item.source.name} → {destination?.name||t('Alan {0}',[item.parsed.destinationDomain])}</strong><span>{state.label}</span></div>
  <dl className="br-recovery-facts">
   <dt>{t('Gönderilen')}</dt><dd>{formatUnits(item.amount,6)} USDC</dd>
   {received!==null&&<><dt>{t('Hedefte alınacak')}</dt><dd>{formatUnits(received,6)} USDC</dd></>}
   <dt>{t('Alıcı')}</dt><dd><code>{item.recipient||item.parsed.body.mintRecipient}</code></dd>
   {item.nonce&&<><dt>Nonce</dt><dd><code title={item.nonce}>{short(item.nonce)}</code></dd></>}
   {item.delayReason&&<><dt>{t('Gecikme nedeni')}</dt><dd>{item.delayReason}</dd></>}
  </dl>
  <p className="aw-note">{delivered?.kind==='tx'?t('Hedef işlem makbuzu doğrulandı: mesaj bu nonce ile teslim edildi.'):state.note}</p>
  {delivered?.kind==='tx'&&destination&&<a href={`${destination.explorer}/tx/${delivered.hash}`} target="_blank" rel="noopener noreferrer"><CheckCircle2 size={14}/> {t('Hedef işlemi explorer’da gör')} <ExternalLink size={12}/></a>}
  {pendingHash&&!delivered&&destination&&<a href={`${destination.explorer}/tx/${pendingHash}`} target="_blank" rel="noopener noreferrer">{t('Gönderilen hedef işlemi')} <ExternalLink size={12}/></a>}
  {item.state==='awaiting_attestation'&&<button className="aw-text" type="button" onClick={refresh}>{t('Tasdiki yeniden kontrol et')}</button>}
  {item.state==='ready'&&!delivered&&<div className="br-recovery-action">
   {!address?<><p className="aw-note">{t('Hedefte tamamlamak için cüzdanını bağla. Hedef ağda gas ({0}) gerekir.',[destination?.symbol||''])}</p><WalletConnectionButton/></>:<>
    <label className="ab-mainnet-consent"><input type="checkbox" checked={accepted} disabled={busy} onChange={e=>setAccepted(e.target.checked)}/> {t('{0} ağında receiveMessage işlemini kendi cüzdanımla göndereceğimi, gas ücretini ödeyeceğimi ve USDC’nin yukarıdaki alıcıya gideceğini anladım.',[destination?.name||''])}</label>
    <button className="aw-button ab-primary" type="button" disabled={!accepted||busy} onClick={()=>void complete()}>{busy?<LoaderCircle size={15} className="at-spinning"/>:null} {t('Hedefte tamamla')}</button>
    {phase&&<p className="aw-note" role="status">{phase}</p>}
   </>}
  </div>}
  {error&&<BridgeError message={error}/>}
  <p className="aw-note br-recovery-source">{t('Kanıt: {0} makbuzu · Circle Iris tasdiki · hedef ağ nonce kontrolü',[item.source.name])}</p>
 </article>;
}
