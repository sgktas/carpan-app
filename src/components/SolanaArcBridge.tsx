import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useAccount} from 'wagmi';
import {createViemAdapterFromProvider} from '@circle-fin/adapter-viem-v2';
import {AppKit,type AppKitActions,type BridgeStep,type EstimateResult} from '@circle-fin/app-kit';
import {formatUnits,type EIP1193Provider} from 'viem';
import {ArrowLeftRight,Check,Download,ExternalLink,LoaderCircle,RefreshCw,Wallet} from 'lucide-react';
import {useI18n} from '../i18n';
import dictionary from '../i18n/solana-en.json';
import {WalletConnectionButton} from './WalletConnectionButton';
import {ensureBridgeWalletNetwork} from '../bridge-wallet-network';
import {bridgeWalletChains} from '../bridge-networks';
import {
  SOLANA_BRIDGE_STEPS,SOLANA_CCTP_RENT_RESERVE,availableSolanaWallets,checkpointSolanaStep,createSolanaBrowserAdapter,decodeSolanaBridgeRecords,encodeSolanaBridgeRecords,
  inspectArcForSolana,inspectSolanaChain,readSolanaBridgeBalances,resumeSolanaBridge,shortBridgeAddress,solanaBridgeDefinitions,solanaBridgeExplorer,solanaBridgeReadiness,
  solanaBridgeStep,solanaBridgeStorage,solanaBridgeTxHash,solanaQuoteReceived,validateSolanaBridgeAmount,validateSolanaQuote,validateSolanaRecipient,verifySolanaBridgeStage,
  type SolanaBridgeBalances,type SolanaBridgeDirection,type SolanaBridgeEnvironment,type SolanaBridgeRecord,type SolanaWalletChoice,type SolanaWalletProvider,
} from '../solana-bridge';
import './arc-bridge.css';
import './solana-bridge.css';

type Props={environment?:SolanaBridgeEnvironment;direction:SolanaBridgeDirection;onRestoreDirection:(direction:SolanaBridgeDirection)=>void;renderRoute:(disabled:boolean)=>ReactNode;lock?:(busy:boolean)=>void};
type Quote={estimate:EstimateResult<string,string>;at:number;direction:SolanaBridgeDirection;amount:string;recipient:string;evmWallet:string;solanaWallet:string};
const sameWallet=(left:string,right:string)=>left.toLowerCase()===right.toLowerCase();
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
const labels:Record<string,string>={approve:'Harcama izni',burn:'Kaynak gönderim',fetchAttestation:'Circle tasdiği',mint:'Hedef teslim'};
/** Browser-only CCTP: explicit connections and user-driven transaction signatures. */
export function SolanaArcBridge({environment='testnet',...props}:Props){return <SolanaBridgeForm key={environment} environment={environment} {...props}/>;}
function SolanaBridgeForm({environment,direction,onRestoreDirection,renderRoute,lock}:Props&{environment:SolanaBridgeEnvironment}){
  const {language,t}=useI18n();
  const tr=(value:string,values:unknown[]=[])=>{const translated=language==='en'?(dictionary as Record<string,string>)[value]??t(value):value;return translated.replace(/\{(\d+)\}/g,(m,i)=>Number(i)<values.length?String(values[Number(i)]):m);};
  const kit=useMemo(()=>new AppKit(),[]),definitions=useMemo(()=>solanaBridgeDefinitions(kit,environment),[kit,environment]);
  const {address:evmWallet,connector}=useAccount();
  const storage=solanaBridgeStorage(environment),mainnet=environment==='mainnet';
  const [loaded]=useState(()=>{try{return {records:decodeSolanaBridgeRecords(localStorage.getItem(storage),definitions,environment),error:''};}catch{return {records:[] as SolanaBridgeRecord[],error:'Yerel köprü geçmişi okunamadı. Mevcut gönderimi incelemeden yeni transfer başlatma.'};}});
  const [records,setRecords]=useState(loaded.records),recordsRef=useRef(records);
  const [amount,setAmount]=useState(''),[recipient,setRecipient]=useState('');
  const [choices,setChoices]=useState<SolanaWalletChoice[]>([]),[choiceId,setChoiceId]=useState(''),[solanaProvider,setSolanaProvider]=useState<SolanaWalletProvider>(),[solanaWallet,setSolanaWallet]=useState('');
  const [balances,setBalances]=useState<SolanaBridgeBalances>(),[balanceError,setBalanceError]=useState(''),[quote,setQuote]=useState<Quote>(),[clock,setClock]=useState(Date.now());
  const [busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[phase,setPhase]=useState(''),[error,setError]=useState(loaded.error),[storageError,setStorageError]=useState(loaded.error),[consent,setConsent]=useState(false);
  const operation=useRef(false),providerRef=useRef(solanaProvider);providerRef.current=solanaProvider;
  const from=direction==='arc-to-solana'?definitions.arc:definitions.solana,to=direction==='arc-to-solana'?definitions.solana:definitions.arc;
  const target=recipient.trim()||(direction==='arc-to-solana'?solanaWallet:evmWallet??'');
  const connected=!!evmWallet&&!!connector&&!!solanaWallet&&!!solanaProvider?.isConnected;
  // Both identities are required to recover a snapshot, but any unfinished record
  // for either connected source wallet blocks a new burn from that wallet.
  const ownRecords=records.filter(r=>!!evmWallet&&sameWallet(r.evmWallet,evmWallet)||!!solanaWallet&&r.solanaWallet===solanaWallet);
  const blocked=!!storageError||ownRecords.some(r=>!['delivered','cancelled'].includes(r.status));
  const pending=ownRecords.find(r=>!['delivered','cancelled'].includes(r.status));
  const quoteValid=!!quote&&clock-quote.at<90000&&quote.direction===direction&&quote.amount===amount.trim()&&quote.recipient===target&&quote.evmWallet===evmWallet&&quote.solanaWallet===solanaWallet;
  let ready:ReturnType<typeof solanaBridgeReadiness>|undefined;
  if(quoteValid&&balances&&quote){try{ready=solanaBridgeReadiness(direction,validateSolanaBridgeAmount(amount.trim()),balances,quote.estimate,definitions);}catch{/* Unknown fees fail closed. */}}
  useEffect(()=>{lock?.(busy||blocked||refreshing);return()=>lock?.(false);},[busy,blocked,refreshing,lock]);
  useEffect(()=>{if(!pending)return;onRestoreDirection(pending.direction);setAmount(pending.amount);setRecipient(pending.recipient);},[pending?.id,evmWallet,solanaWallet,onRestoreDirection]);
  useEffect(()=>{if(!pending){setAmount('');setRecipient('');}},[direction]);
  useEffect(()=>{const discover=()=>{const wallets=availableSolanaWallets();setChoices(wallets);setChoiceId(id=>wallets.some(w=>w.id===id)?id:wallets[0]?.id??'');};discover();const timer=window.setInterval(discover,4000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{const timer=window.setInterval(()=>{setClock(Date.now());const provider=providerRef.current;if(provider&&(!provider.isConnected||provider.address!==solanaWallet)){setSolanaWallet('');setQuote(undefined);}},1000);return()=>window.clearInterval(timer);},[solanaWallet]);
  useEffect(()=>{setQuote(undefined);setConsent(false);setBalances(undefined);},[direction,amount,recipient,evmWallet,solanaWallet]);
  useEffect(()=>{if(!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  function save(record:SolanaBridgeRecord){
    const next=[record,...recordsRef.current.filter(r=>r.id!==record.id)];if(next.length>100)throw new Error('Yerel geçmiş doldu; işlem kayıtlarını dışa aktar.');
    try{localStorage.setItem(storage,encodeSolanaBridgeRecords(next));}catch(e){setStorageError(tr('İşlem kaydı saklanamadı. Kaynak işlemi yeniden gönderme; kurtarma dosyasını indir.'));throw e;}
    recordsRef.current=next;setRecords(next);
  }
  async function connectSolana(){
    if(operation.current)return;operation.current=true;setBusy(true);setError('');
    try{const choice=choices.find(w=>w.id===choiceId);if(!choice)throw new Error('Solana cüzdanını kur veya tarayıcı eklentisini aç.');const provider=choice.create(environment),result=await provider.connect();if(!provider.isConnected||provider.address!==result.address)throw new Error('Solana cüzdan bağlantısı doğrulanamadı.');setSolanaProvider(provider);setSolanaWallet(result.address);}
    catch(e){setError(tr(message(e)));}finally{operation.current=false;setBusy(false);}
  }
  async function disconnectSolana(){if(busy)return;try{await solanaProvider?.disconnect();}catch(e){setError(tr(message(e)));}finally{setSolanaProvider(undefined);setSolanaWallet('');setBalances(undefined);}}
  async function walletAdapters(){
    if(!evmWallet||!connector||!solanaProvider?.isConnected||solanaProvider.address!==solanaWallet)throw new Error('Aynı Arc ve Solana cüzdanlarını bağla.');
    const evm=await connector.getProvider() as EIP1193Provider,accounts=await evm.request({method:'eth_accounts'});if(!accounts[0]||!sameWallet(accounts[0],evmWallet))throw new Error('Arc cüzdan hesabı değişti; yeniden incele.');
    const arcChain=bridgeWalletChains(environment==='testnet').find(c=>c.id===definitions.arc.chainId)!;
    setPhase(tr('Arc ağı için cüzdan onayı bekleniyor…'));await ensureBridgeWalletNetwork(evm,arcChain,environment);
    return {arc:await createViemAdapterFromProvider({provider:evm}),solana:createSolanaBrowserAdapter(solanaProvider,environment,definitions.solana)};
  }
  async function refresh(){
    if(!connected||refreshing||!evmWallet)return;setRefreshing(true);setBalanceError('');
    try{const recipientForSolana=direction==='arc-to-solana'?target:solanaWallet;validateSolanaRecipient('arc-to-solana',recipientForSolana);setBalances(await readSolanaBridgeBalances(environment,evmWallet,solanaWallet,recipientForSolana));}
    catch(e){setBalances(undefined);setBalanceError(tr(message(e)));}finally{setRefreshing(false);}
  }
  async function verifyNetworks(){setPhase(tr('Arc kontratları ve Solana genesis / USDC / CCTP programları doğrulanıyor…'));await Promise.all([inspectArcForSolana(environment),inspectSolanaChain(environment)]);}
  async function estimate(){
    if(operation.current)return;operation.current=true;setBusy(true);setError('');setQuote(undefined);setConsent(false);
    try{
      if(!connected||!evmWallet)throw new Error('Aynı Arc ve Solana cüzdanlarını bağla.');if(blocked)throw new Error('Önce mevcut köprü kaydını incele; yeni kaynak gönderim başlatma.');
      const raw=validateSolanaBridgeAmount(amount.trim());validateSolanaRecipient(direction,target);await verifyNetworks();const adapters=await walletAdapters();
      const fresh=await readSolanaBridgeBalances(environment,evmWallet,solanaWallet,direction==='arc-to-solana'?target:solanaWallet);setBalances(fresh);
      if((direction==='arc-to-solana'?fresh.arcUsdc:fresh.solUsdc)<raw)throw new Error('Kaynak USDC bakiyesi yetersiz.');
      setPhase(tr('Circle ücret teklifi hesaplanıyor…'));
      const result=await kit.estimateBridge({from:{adapter:direction==='arc-to-solana'?adapters.arc:adapters.solana,chain:from},to:{adapter:direction==='arc-to-solana'?adapters.solana:adapters.arc,chain:to,recipientAddress:target,useForwarder:false},amount:amount.trim(),token:'USDC',config:{transferSpeed:'FAST'}});
      validateSolanaQuote(result,direction,amount.trim(),target,evmWallet,solanaWallet,definitions);solanaBridgeReadiness(direction,raw,fresh,result,definitions);
      setQuote({estimate:result,at:Date.now(),direction,amount:amount.trim(),recipient:target,evmWallet,solanaWallet});
    }catch(e){setError(tr(message(e)));}finally{operation.current=false;setBusy(false);setPhase('');}
  }
  async function delivery(record:SolanaBridgeRecord){const delivered=await verifySolanaBridgeStage(record,'mint');save({...record,status:'delivered',deliveredAmount:delivered.toString(),updatedAt:new Date().toISOString(),error:undefined});}
  async function execute(recovery?:SolanaBridgeRecord){
    if(operation.current)return;operation.current=true;setBusy(true);setError('');let current:SolanaBridgeRecord|undefined;
    const handler=(payload:AppKitActions[keyof AppKitActions])=>{
      if(!current||!('protocol' in payload)||payload.protocol!=='cctp'||!('method' in payload)||!('values' in payload)||!SOLANA_BRIDGE_STEPS.includes(payload.method as typeof SOLANA_BRIDGE_STEPS[number]))return;
      current={...current,result:checkpointSolanaStep(current.result,{...(payload.values as BridgeStep),name:payload.method}),updatedAt:new Date().toISOString()};save(current);
    };
    try{
      if(!connected||!evmWallet)throw new Error('Aynı Arc ve Solana cüzdanlarını bağla.');if(storageError)throw new Error(storageError);
      await verifyNetworks();const adapters=await walletAdapters();
      if(recovery){
        if(!sameWallet(recovery.evmWallet,evmWallet)||recovery.solanaWallet!==solanaWallet)throw new Error('Kurtarma için kayıtlı Arc ve Solana hesaplarını bağla.');
        if(solanaBridgeTxHash(recovery,'mint')){await delivery(recovery);return;}
        // Onchain source proof is required before SDK retry; the original burn is retained.
        await verifySolanaBridgeStage(recovery,'burn');const burn=solanaBridgeStep(recovery.result,'burn')!;
        current={...recovery,status:'running',error:undefined,result:checkpointSolanaStep(recovery.result,{...burn,state:'success'}),updatedAt:new Date().toISOString()};save(current);
        const fresh=await readSolanaBridgeBalances(environment,evmWallet,solanaWallet,recovery.direction==='arc-to-solana'?recovery.recipient:solanaWallet);setBalances(fresh);
        // Retry estimates source no longer owns burned USDC. Require a conservative
        // destination reserve; adapter simulation and wallet show the current fee.
        if(recovery.direction==='arc-to-solana'?fresh.solNative<SOLANA_CCTP_RENT_RESERVE+fresh.ataRent+50_000n:fresh.arcNative<100_000_000_000_000n)throw new Error('Hedef ağda gas / hesap oluşturma rezervi yetersiz; kaynak gönderimin korunuyor.');
      }else{
        if(blocked||!quote||!quoteValid)throw new Error('Güncel ücret teklifini incele ve mevcut gönderimi tamamla.');if(mainnet&&!consent)throw new Error('Gerçek USDC transfer özetini onayla.');
        const raw=validateSolanaBridgeAmount(amount.trim());validateSolanaRecipient(direction,target);
        const fresh=await readSolanaBridgeBalances(environment,evmWallet,solanaWallet,direction==='arc-to-solana'?target:solanaWallet);setBalances(fresh);
        const check=solanaBridgeReadiness(direction,raw,fresh,quote.estimate,definitions);if(!check.usdcReady||!check.arcReady||!check.solReady)throw new Error('Kaynak USDC, Arc gas veya Solana gas / rent rezervi yetersiz.');
        if(Date.now()-quote.at>=90000)throw new Error('Teklif süresi doldu; ücretleri yeniden hesapla.');
        const at=new Date().toISOString();current={version:1,id:crypto.randomUUID(),environment,direction,evmWallet,solanaWallet,recipient:target,amount:amount.trim(),createdAt:at,updatedAt:at,status:'running',result:{token:'USDC',amount:amount.trim(),state:'pending',provider:'CCTPV2BridgingProvider',config:{transferSpeed:'FAST'},source:{address:direction==='arc-to-solana'?evmWallet:solanaWallet,chain:from},destination:{address:direction==='arc-to-solana'?solanaWallet:evmWallet,chain:to,recipientAddress:target,useForwarder:false},steps:[]}};save(current);
      }
      setPhase(tr(recovery?'Mevcut kaynak gönderiminden devam ediliyor; ikinci burn yapılmıyor.':'Cüzdanındaki işlem imzalarını sırayla incele ve onayla.'));kit.on('*',handler);
      const result=recovery?await resumeSolanaBridge(kit,current!,evmWallet,solanaWallet,{from:recovery.direction==='arc-to-solana'?adapters.arc:adapters.solana,to:recovery.direction==='arc-to-solana'?adapters.solana:adapters.arc}):await kit.bridge({from:{adapter:direction==='arc-to-solana'?adapters.arc:adapters.solana,chain:from},to:{adapter:direction==='arc-to-solana'?adapters.solana:adapters.arc,chain:to,recipientAddress:target,useForwarder:false},token:'USDC',amount:amount.trim(),config:{transferSpeed:'FAST'}});
      let merged={...result,steps:current!.result.steps};for(const step of result.steps)merged=checkpointSolanaStep(merged,step);current={...current!,result:{...merged,state:result.state},status:result.state==='error'?'error':'interrupted',updatedAt:new Date().toISOString()};save(current);setQuote(undefined);
      if(solanaBridgeTxHash(current,'mint'))await delivery(current);
      else if(result.state==='error')throw new Error(result.steps.find(s=>s.state==='error')?.errorMessage??'Köprü yarım kaldı. Mevcut gönderimden devam et.');
    }catch(e){const detail=message(e);setError(tr(detail));if(current){current={...current,status:'error',error:detail,updatedAt:new Date().toISOString()};try{save(current);}catch{recordsRef.current=[current,...recordsRef.current.filter(r=>r.id!==current!.id)];setRecords(recordsRef.current);}}}
    finally{kit.off('*',handler);operation.current=false;setBusy(false);setPhase('');}
  }
  async function check(record:SolanaBridgeRecord){if(operation.current)return;operation.current=true;setBusy(true);setError('');try{if(solanaBridgeTxHash(record,'mint'))await delivery(record);else{await verifySolanaBridgeStage(record,'burn');const step=solanaBridgeStep(record.result,'burn')!;save({...record,status:'interrupted',error:undefined,result:checkpointSolanaStep(record.result,{...step,state:'success'}),updatedAt:new Date().toISOString()});}}catch(e){setError(tr(message(e)));}finally{operation.current=false;setBusy(false);}}
  function resumeRecord(record:SolanaBridgeRecord){onRestoreDirection(record.direction);setAmount(record.amount);setRecipient(record.recipient);setQuote(undefined);setConsent(false);void execute(record);}
  function exportRecord(record:SolanaBridgeRecord){const blob=new Blob([encodeSolanaBridgeRecords([record])],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`carpan-solana-bridge-${environment}-${record.id}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const canCancel=(record:SolanaBridgeRecord)=>record.status==='error'&&!record.result.steps.some(s=>s.name==='burn')&&/4001|user rejected|user denied|rejected the request/i.test(record.error??'');
  const row=(label:string,value:string,tone?:boolean)=> <li data-tone={tone===undefined?'unknown':tone?'success':'error'}>{tone?<Check size={15}/>:<Wallet size={15}/>}<div><span>{tr(label)}</span><strong>{value}</strong></div></li>;
  return <section className="ab-module sab-module">
    <header className="ab-heading"><div><span className="ab-kicker">CIRCLE CCTP · USDC</span><h1>{t('Arc köprüsü')}</h1><p>{t('USDC’yi Arc’a taşı veya Arc’tan gönder.')}</p></div><span className="ab-network">{mainnet?'MAINNET':'TESTNET'}</span></header>
    <p className="aw-note">{mainnet?t('Arc ve Circle’ın desteklediği ağlar arasında gerçek USDC taşır. Seçilen ağların kontratları gönderimden önce doğrulanır. Rota, tutar, alıcı ve gerçek ağ ücretlerini kontrol et.'):t('Araştırma ekranları Arc Mainnet’i gösterir. Bu köprü test ağlarında çalışır; gerçek varlık taşımaz.')}</p>
    <div className="ab-grid"><div className="aw-panel ab-form">
      <div className="sab-wallets"><div><span className="ab-kicker">ARC · EVM</span><WalletConnectionButton/>{evmWallet&&<code>{shortBridgeAddress(evmWallet)}</code>}</div><div><span className="ab-kicker">SOLANA</span>{solanaWallet?<><button className="aw-button" disabled={busy} onClick={()=>void disconnectSolana()}><Wallet size={14}/>{shortBridgeAddress(solanaWallet)}</button><small>{tr('Bağlantıyı kes')}</small></>:<><select aria-label={tr('Solana cüzdanı')} value={choiceId} disabled={busy} onChange={e=>setChoiceId(e.target.value)}>{!choices.length&&<option value="">{tr('Cüzdan bulunamadı')}</option>}{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="aw-button" disabled={busy||!choiceId} onClick={()=>void connectSolana()}><Wallet size={14}/>{tr('Solana cüzdanını bağla')}</button></>}</div></div>
      {!choices.length&&<p className="aw-note">{tr('Phantom, Solflare veya Solana Wallet Standard destekleyen bir tarayıcı cüzdanı kullan.')}</p>}
      <fieldset disabled={busy||blocked||refreshing}>{renderRoute(busy||blocked||refreshing)}<label>{tr('Gönderilecek USDC')}<input inputMode="decimal" autoComplete="off" value={amount} placeholder="0.10" onChange={e=>setAmount(e.target.value)}/></label><label>{tr('Hedef cüzdan adresi')}<input autoComplete="off" value={recipient} placeholder={direction==='arc-to-solana'?solanaWallet||'Solana wallet address':evmWallet||'0x…'} onChange={e=>setRecipient(e.target.value)}/></label><p className="aw-note">{tr('Boş bırakırsan hedefte bağlı hesabına teslim edilir. Solana token hesabı yerine cüzdan adresini kullan.')}</p><button className="aw-button ab-primary" disabled={!connected||!amount.trim()||blocked} onClick={()=>void estimate()}><RefreshCw size={15}/>{tr('Ücretleri hesapla')}</button></fieldset>
      {blocked&&<p className="ab-recovery-gas">{tr('Önce mevcut köprü kaydını incele; yeni kaynak gönderim başlatma.')}</p>}
    </div><aside className="aw-panel ab-review"><h2>{tr('Transfer özeti')}</h2>
      <section className="ab-preflight"><div className="ab-record-heading"><h2>{tr('İşlem öncesi kontrol')}</h2><button className="aw-text" disabled={!connected||busy||refreshing} onClick={()=>void refresh()}><RefreshCw size={13}/>{tr('Bakiyeleri yenile')}</button></div><ul>{row('Arc USDC bakiyesi',balances?`${formatUnits(balances.arcUsdc,6)} USDC`:tr('Bakiye alınamadı'),ready?ready.arcReady:undefined)}{row('Solana USDC bakiyesi',balances?`${formatUnits(balances.solUsdc,6)} USDC`:tr('Bakiye alınamadı'),ready?ready.usdcReady:undefined)}{row('Solana gas bakiyesi',balances?`${formatUnits(balances.solNative,9)} SOL`:tr('Bakiye alınamadı'),ready?ready.solReady:undefined)}</ul>{ready&&<p className="aw-note">{tr('İşlem için ayrılan rezerv: Arc {0} USDC · Solana {1} SOL.',[formatUnits(ready.arcRequired,18),formatUnits(ready.solRequired,9)])}</p>}{balanceError&&<p className="aw-note">{balanceError}</p>}</section>
      {quote?<><div className="ab-amount-summary"><span>{tr('GÖNDERİLEN')}<strong>{quote.amount} <small>USDC</small></strong></span><span>{tr('TAHMİNİ ALINACAK')}<strong>{formatUnits(solanaQuoteReceived(quote.estimate),6)} <small>USDC</small></strong></span></div><dl><dt>{tr('Rota')}</dt><dd>{from.name} → {to.name}</dd><dt>{tr('Alıcı')}</dt><dd><code>{quote.recipient}</code></dd>{quote.estimate.fees.map((fee,i)=><div className="ab-dl-row" key={i}><dt>{tr('Circle hizmet ücreti')}</dt><dd>{fee.amount} {fee.token}</dd></div>)}<dt>{tr('Carpan komisyonu')}</dt><dd>0 USDC</dd><dt>{tr('Solana CCTP hesap rezervi')}</dt><dd>{formatUnits(SOLANA_CCTP_RENT_RESERVE,9)} SOL</dd><dt>{tr('Solana alıcı token hesabı rezervi')}</dt><dd>{balances?formatUnits(direction==='arc-to-solana'?balances.ataRent:0n,9):'—'} SOL</dd>{ready&&<><dt>Arc gas</dt><dd>{formatUnits(ready.arcGas,18)} USDC</dd><dt>Solana gas</dt><dd>{formatUnits(ready.solGas,9)} SOL</dd></>}</dl><p className="aw-note">{tr('Solana hesap rezervi gas veya Carpan komisyonu değildir. Hesap açılırsa rent olarak tutulur; kullanılmayan rezerv cüzdanında kalır. Kaynak message-account rent’i otomatik geri alınmaz.')}</p><p className="ab-quote-clock">{quoteValid?tr('Teklif {0} saniye daha geçerli.',[Math.max(0,Math.ceil((90000-(clock-quote.at))/1000))]):tr('Teklif süresi doldu; ücretleri yeniden hesapla.')}</p>{quote.estimate.warnings?.map((w,i)=><p key={i} className="aw-note">{w.message||w.code}</p>)}{mainnet&&<label className="ab-mainnet-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>{tr('Gerçek USDC tutarını, iki cüzdanı, hedef alıcıyı ve ayrı gas / rent rezervlerini inceledim.')}</label>}<button className="aw-button ab-primary" disabled={busy||!quoteValid||blocked||!ready?.usdcReady||!ready.arcReady||!ready.solReady||mainnet&&!consent} onClick={()=>void execute()}>{busy?<LoaderCircle size={15} className="sab-spinner"/>:<ArrowLeftRight size={15}/>} {tr(mainnet?'USDC transferini başlat':'Test transferini başlat')}</button></>:<p className="ab-empty">{tr('İki cüzdanı bağla, miktarı gir ve gerçek ücret teklifini al. Kaynak gönderimden önce Arc USDC ve Solana SOL rezervleri kontrol edilir.')}</p>}
    </aside></div>
    {phase&&<p className="aw-note" role="status"><LoaderCircle size={14} className="sab-spinner"/> {phase}</p>}{error&&<div className="ab-error-box" role="alert"><strong>{tr('Köprü tamamlanamadı')}</strong><p>{error}</p></div>}
    <section className="aw-panel ab-history"><h2>{tr('Solana köprü geçmişi')}</h2><p className="aw-note">{tr('Bu geçmiş bu tarayıcı ve bu site adresinde saklanır. Mainnet ve testnet kayıtları ayrıdır; başka cihazlarla eşitlenmez. Kurtarma dosyası özel anahtar içermez.')}</p>{ownRecords.length===0?<p className="ab-empty">{tr('Henüz bu cüzdanlara ait Solana köprü kaydı yok.')}</p>:ownRecords.map(record=>{
      const resumable=record.status!=='delivered'&&record.status!=='cancelled'&&!!solanaBridgeTxHash(record,'burn'),mint=solanaBridgeTxHash(record,'mint');
      return <article key={record.id}><div className="ab-record-heading"><strong>{record.amount} USDC · {record.direction==='arc-to-solana'?'Arc → Solana':'Solana → Arc'}</strong><span className="ab-state" data-tone={record.status==='delivered'?'success':record.status==='error'?'error':'waiting'}>{tr(record.status==='delivered'?'Teslim doğrulandı':record.status==='cancelled'?'İptal edildi':mint?'Teslim kanıtı kontrol ediliyor':'Mevcut gönderim bekliyor')}</span></div><p className="aw-note"><code>{shortBridgeAddress(record.evmWallet)} · {shortBridgeAddress(record.solanaWallet)}</code> · {new Date(record.createdAt).toLocaleString(language==='en'?'en-US':'tr-TR')}</p><p className="aw-note">{tr('Alıcı')}: <code>{record.recipient}</code></p><ol className="ab-steps">{SOLANA_BRIDGE_STEPS.map(name=>{const step=solanaBridgeStep(record.result,name),url=name==='burn'||name==='mint'?solanaBridgeExplorer(record,name):null;return <li key={name} data-state={step?.state??'pending'}><strong>{tr(labels[name])}</strong><span>{tr(step?.state==='success'?'Doğrulandı':step?.state==='noop'?'Gerekmedi':step?.state==='error'?'Tamamlanmadı':'Bekliyor')}</span>{url&&<a href={url} target="_blank" rel="noopener noreferrer">{tr('İşlem kanıtı')}<ExternalLink size={11}/></a>}</li>;})}</ol>{record.deliveredAmount&&<p className="ab-delivery-amount">{tr('Doğrulanmış teslim')}: <strong>{formatUnits(BigInt(record.deliveredAmount),6)} USDC</strong></p>}{record.error&&<p className="aw-note">{tr(record.error)}</p>}<div className="ab-actions"><button className="aw-button" disabled={busy} onClick={()=>exportRecord(record)}><Download size={13}/> {tr('Kurtarma dosyasını indir')}</button>{record.status!=='delivered'&&record.status!=='cancelled'&&<button className="aw-button" disabled={busy} onClick={()=>void check(record)}><RefreshCw size={13}/> {tr('İşlem kanıtını kontrol et')}</button>}{resumable&&!mint&&<button className="aw-button ab-primary" disabled={busy||!connected||!evmWallet||!sameWallet(evmWallet,record.evmWallet)||solanaWallet!==record.solanaWallet} onClick={()=>resumeRecord(record)}>{tr('Mevcut gönderimden devam et')}</button>}{canCancel(record)&&<button className="aw-text" disabled={busy} onClick={()=>save({...record,status:'cancelled',updatedAt:new Date().toISOString()})}>{tr('İmzalanmayan kaydı kapat')}</button>}</div></article>;
    })}</section>
  </section>;
}
