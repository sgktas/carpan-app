import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import {lazy,Suspense,useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useAccount,useBalance,useReadContract} from 'wagmi';
import {WalletConnectionButton} from './WalletConnectionButton';
import {createPublicClient,decodeEventLog,erc20Abi,formatUnits,http,zeroAddress,type EIP1193Provider,type Hex} from 'viem';
import {createViemAdapterFromProvider} from '@circle-fin/adapter-viem-v2';
import type {BridgeResult,BridgeStep,EstimateResult,AppKitActions} from '@circle-fin/app-kit';
import {LoaderCircle,RefreshCw} from 'lucide-react';
import {createBridgeKit,supportedBridgeChains,BRIDGE_WALLET_CHAINS} from '../arc-bridge-client';
import {MAINNET_BRIDGE_CHAINS,MAINNET_BRIDGE_STORAGE,MAINNET_BRIDGE_FACTS,inspectMainnetChain,mainnetReader,verifiedMainnetDefinitions} from '../bridge-mainnet-config';
import {BRIDGE_STORAGE,BRIDGE_STEPS,canResume,checkpointStep,mergeBridgeCheckpoints,completeEstimate,encodeRecords,decodeRecords,hasBurn,mintHash,resumeBridge,bridgeGasBudget,bridgeReadiness,validateBridge,verifyBridgeBurn,type BridgeRecord,type BridgeEnvironment} from '../arc-bridge';
import {BridgeError,BridgePreflight,BridgeFees} from './BridgePanels';
import {BridgeHistoryRecord} from './BridgeHistory';
import './arc-bridge.css';
import {bridgeSdkProvider,ensureBridgeWalletNetwork} from '../bridge-wallet-network';
import {useBridgeHistory} from '../hooks/useBridgeHistory';
import {Download,Upload} from 'lucide-react';
import {BridgeRoutePicker} from './BridgeRoutePicker';
import {defaultBridgeRoute,routeForSolana,type BridgeRoute} from '../bridge-route';
import type {SolanaBridgeDirection} from '../solana-bridge';

type Quote={estimate:EstimateResult;at:number;wallet:string;source:number;destination:number;recipient:string;amount:string};
const short=(a:string)=>`${a.slice(0,8)}…${a.slice(-6)}`;
const errorText=(e:unknown)=>e instanceof Error?e.message:t("Köprü bağlantısı tamamlanamadı.");
const SolanaBridge=lazy(()=>import('./SolanaArcBridge').then(m=>({default:m.SolanaArcBridge})));
export function ArcBridge(){
 const [environment,setEnvironment]=useState<BridgeEnvironment>(()=>new URLSearchParams(window.location.search).get('environment')==='testnet'?'testnet':'mainnet'),[locked,setLocked]=useState(false);
 const [route,setRoute]=useState<BridgeRoute>(()=>defaultBridgeRoute(environment));
 const restoreSolanaRoute=useCallback((direction:SolanaBridgeDirection)=>setRoute(routeForSolana(direction,environment)),[environment]);
 const renderRoute=(disabled:boolean)=><BridgeRoutePicker environment={environment} route={route} disabled={disabled} onChange={setRoute}/>;
 function selectEnvironment(next:BridgeEnvironment){if(locked||next===environment)return;setEnvironment(next);setRoute(defaultBridgeRoute(next));}
 return <><div className="ab-switches"><div className="ab-environment" role="group" aria-label={t("Köprü ortamı")}><button className="aw-button" aria-pressed={environment==='mainnet'} disabled={locked} onClick={()=>selectEnvironment('mainnet')}>Mainnet · USDC</button><button className="aw-button" aria-pressed={environment==='testnet'} disabled={locked} onClick={()=>selectEnvironment('testnet')}>Testnet</button></div></div>{route.source!=='solana'&&route.destination!=='solana'?<BridgeForm key={environment} environment={environment} route={{source:route.source,destination:route.destination}} onRestoreRoute={setRoute} renderRoute={renderRoute} lock={setLocked}/>:<Suspense fallback={<p className="aw-note">{t("Köprü yükleniyor…")}</p>}><SolanaBridge environment={environment} direction={route.source==='solana'?'solana-to-arc':'arc-to-solana'} onRestoreDirection={restoreSolanaRoute} renderRoute={renderRoute} lock={setLocked}/></Suspense>}</>;
}
function BridgeForm({environment,route,onRestoreRoute,renderRoute,lock}:{environment:BridgeEnvironment;route:{source:number;destination:number};onRestoreRoute:(route:BridgeRoute)=>void;renderRoute:(disabled:boolean)=>ReactNode;lock:(value:boolean)=>void}){
 const isMainnet=environment==='mainnet',arcId=isMainnet?5042:5042002;
 const walletChains=isMainnet?MAINNET_BRIDGE_CHAINS:BRIDGE_WALLET_CHAINS,storage=isMainnet?MAINNET_BRIDGE_STORAGE:BRIDGE_STORAGE;
 const kit=useMemo(createBridgeKit,[]),chains=useMemo(()=>isMainnet?verifiedMainnetDefinitions(kit):supportedBridgeChains(kit),[kit,isMainnet]);
 const {address,connector,chainId:walletChain}=useAccount();
 const {source,destination}=route;
 const [amount,setAmount]=useState(''),[recipient,setRecipient]=useState('');
 const history=useBridgeHistory(storage,chains,environment,address),{records,save}=history;
 const importInput=useRef<HTMLInputElement>(null);
 const [quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[clock,setClock]=useState(Date.now());
 const [phase,setPhase]=useState(''),[accepted,setAccepted]=useState(false);
 const operation=useRef(false);
 const from=chains.find(c=>c.chainId===source),to=chains.find(c=>c.chainId===destination),target=recipient.trim()||address||'';
 const ownRecords=records.filter(r=>r.wallet.toLowerCase()===address?.toLowerCase());
 const blocked=(history.eligible&&!history.loaded)||ownRecords.some(r=>r.status==='running'||r.status==='interrupted'||r.status==='error'&&(hasBurn(r.result)||r.result.steps.some(s=>s.name==='burn'&&s.state==='pending')));
 const pending=ownRecords.find(r=>r.status!=='delivered'&&hasBurn(r.result));
 useEffect(()=>{lock(busy||blocked);return()=>lock(false);},[busy,blocked,lock]);
 useEffect(()=>{if(!pending)return;onRestoreRoute({source:pending.source,destination:pending.destination});setAmount(pending.amount);setRecipient(pending.recipient);},[pending?.id,address,onRestoreRoute]);
 useEffect(()=>{if(!pending){setAmount('');setRecipient('');}},[source,destination]);
 const balance=useReadContract({address:from?.usdcAddress as Hex|undefined,abi:erc20Abi,functionName:'balanceOf',args:address?[address]:undefined,chainId:source,query:{enabled:!!address&&!!from}});
 const sourceGasBalance=useBalance({address,chainId:source,query:{enabled:!!address,refetchInterval:30000}});
 const targetGasBalance=useBalance({address,chainId:destination,query:{enabled:!!address,refetchInterval:30000}});
 function refreshBalances(){void Promise.all([balance.refetch(),sourceGasBalance.refetch(),targetGasBalance.refetch()]);}
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{setQuote(null);setError('');setAccepted(false);},[source,destination,amount,recipient,address]);
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 function exportHistory(){const blob=new Blob([encodeRecords(ownRecords)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`carpan-usdc-${environment}-recovery.json`;a.click();URL.revokeObjectURL(url);}
 async function importHistory(file?:File){if(!file||!address)return;try{if(file.size>2000000)throw new Error(t('Kurtarma dosyası çok büyük.'));const imported=decodeRecords(await file.text(),chains,environment);if(!imported.length||imported.some(r=>r.wallet.toLowerCase()!==address.toLowerCase()))throw new Error(t('Kurtarma dosyası bu cüzdan ve ortamla uyuşmuyor.'));for(const r of imported){const existing=ownRecords.find(x=>x.id===r.id);if(existing)continue;save({...r,status:r.status==='delivered'?'interrupted':r.status,deliveredAmount:undefined});}setError('');}catch(e){setError(errorText(e));}finally{if(importInput.current)importInput.current.value='';}}
 function validate(){if(!from||!to||!address||!connector)throw new Error(t("Cüzdanını bağla ve desteklenen bir rota seç."));return validateBridge(from,to,amount,target,environment);}
 async function walletProvider(){if(!connector||!address)throw new Error(t("Cüzdanını bağla."));const provider=await connector.getProvider() as EIP1193Provider;const accounts=await provider.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw new Error(t("Bağlı cüzdan değişti; işlemi yeniden incele."));return provider;}
 async function adapter(){
  const provider=bridgeSdkProvider(await walletProvider(),walletChains,async chainId=>{
   const gasClient=createPublicClient({chain:walletChains.find(c=>c.id===chainId)!,transport:http()});
   const [block,gasPrice]=await Promise.all([gasClient.getBlock({blockTag:'latest'}),gasClient.getGasPrice()]);
   return {baseFee:block.baseFeePerGas??0n,gasPrice};
  },environment);
  return createViemAdapterFromProvider({provider});
 }
 async function prepareNetworks(sourceId:number,destinationId:number,resuming=false){
  const provider=await walletProvider(),destinationChain=walletChains.find(c=>c.id===destinationId),sourceChain=walletChains.find(c=>c.id===sourceId);
  if(!destinationChain||!sourceChain)throw new Error(t("Seçilen ortamda desteklenen ağ bulunamadı."));
  setPhase(t("{0} için cüzdan ağ onayı bekleniyor. Eksikse ağı ekleme isteğini onayla.", [destinationChain.name]));
  await ensureBridgeWalletNetwork(provider,destinationChain,environment);
  if(!resuming){setPhase(t("{0} kaynak ağına geçiliyor; cüzdan isteğini onayla.", [sourceChain.name]));await ensureBridgeWalletNetwork(provider,sourceChain,environment);}
 }
 async function verifyMainnet(sourceId=source,destinationId=destination){if(!isMainnet)return;setPhase(t("Mainnet ağları ve USDC / CCTP kontratları doğrulanıyor…"));const facts=[sourceId,destinationId].map(id=>MAINNET_BRIDGE_FACTS.find(f=>f.id===id));if(facts.some(f=>!f))throw new Error(t("Desteklenmeyen köprü ağı."));await Promise.all(facts.map(f=>inspectMainnetChain(f!,mainnetReader(f!.id))));}
 async function estimate(){if(operation.current)return;operation.current=true;setBusy(true);setError('');setQuote(null);setAccepted(false);try{
  const raw=validate();if(blocked)throw new Error(t("Önce devam eden transferini incele."));await verifyMainnet();
  const client=createPublicClient({chain:walletChains.find(c=>c.id===source)!,transport:http()});
  const available=await client.readContract({address:from!.usdcAddress as Hex,abi:erc20Abi,functionName:'balanceOf',args:[address!]});if(raw>available)throw new Error('USDC bakiyesi yetersiz.');
  await prepareNetworks(source,destination);setPhase(t("Circle ücret teklifi hesaplanıyor…"));
  const a=await adapter();const result=await kit.estimateBridge({from:{adapter:a,chain:from!},to:{adapter:a,chain:to!,recipientAddress:target},amount:amount.trim(),token:'USDC',config:{transferSpeed:'FAST'}});
  if(!completeEstimate(result))throw new Error(t("Sağlayıcı tüm ücretleri hesaplayamadı. Transfer başlatılmadı; tekrar teklif al."));
  bridgeGasBudget(result,from!);bridgeGasBudget(result,to!); // Require coverage for both selected networks.
  setQuote({estimate:result,at:Date.now(),wallet:address!,source,destination,recipient:target,amount:amount.trim()});
 }catch(e){setError(errorText(e));}finally{operation.current=false;setBusy(false);setPhase('');refreshBalances();}}
 const quoteValid=!!quote&&clock-quote.at<90000&&quote.wallet===address&&quote.source===source&&quote.destination===destination&&quote.amount===amount.trim()&&quote.recipient===target;

 async function verifyDelivery(record:BridgeRecord){
  const hash=mintHash(record.result);if(!hash)throw new Error(t("Hedef teslim kanıtı henüz yok. Kaynak gönderim teslim anlamına gelmez."));
  const client=createPublicClient({chain:walletChains.find(c=>c.id===record.destination)!,transport:http()});
  const receipt=await client.getTransactionReceipt({hash:hash as Hex});if(receipt.status!=='success')throw new Error(t("Hedef işlem başarılı değil."));
  const token=chains.find(c=>c.chainId===record.destination)!.usdcAddress!;
  let delivered=0n;
  for(const log of receipt.logs){
   if(log.address.toLowerCase()!==token.toLowerCase())continue;
   try{const event=decodeEventLog({abi:erc20Abi,data:log.data,topics:log.topics});if(event.eventName==='Transfer'&&event.args.from.toLowerCase()===zeroAddress&&event.args.to.toLowerCase()===record.recipient.toLowerCase())delivered+=event.args.value;}catch{/* Other contract events are not delivery evidence. */}
  }
  const sent=validateBridge(chains.find(c=>c.chainId===record.source)!,chains.find(c=>c.chainId===record.destination)!,record.amount,record.recipient,environment);
  if(delivered<=0n||delivered>sent)throw new Error(t("Hedef makbuzunda doğru USDC / alıcı / teslim tutarı doğrulanamadı."));
  save({...record,status:'delivered',deliveredAmount:delivered.toString(),updatedAt:new Date().toISOString(),error:undefined});
 }
 async function execute(resume?:BridgeRecord){
  if(operation.current)return;operation.current=true;setBusy(true);setError('');let current:BridgeRecord|undefined;
  const handler=(payload:AppKitActions[keyof AppKitActions])=>{
   if(!current||!('protocol' in payload)||payload.protocol!=='cctp'||!('method' in payload)||typeof payload.method!=='string'||!('values' in payload))return;
   const name=payload.method;if(!BRIDGE_STEPS.includes(name as typeof BRIDGE_STEPS[number]))return;
   const step={...(payload.values as BridgeStep),name};
   current={...current,result:checkpointStep(current.result,step),updatedAt:new Date().toISOString()};save(current);
  };
  try{
   if(isMainnet&&!resume&&!accepted)throw new Error(t("Gerçek USDC transfer özetini onayla."));
   await verifyMainnet(resume?.source??source,resume?.destination??destination);
   if(resume){
    if(resume.wallet.toLowerCase()!==address?.toLowerCase()||!canResume(resume))throw new Error(t("Kaynak cüzdanı bağla; bu kayıt için yeni gönderim başlatma."));
    const sourceClient=createPublicClient({chain:walletChains.find(c=>c.id===resume.source)!,transport:http()});
    const burn=resume.result.steps.find(s=>s.name==='burn'&&s.txHash)!;
    verifyBridgeBurn(resume,await sourceClient.getTransactionReceipt({hash:burn.txHash as Hex}),chains,environment);
    current={...resume,status:'running',error:undefined};save(current);
    await prepareNetworks(resume.source,resume.destination,true);
    const destinationClient=createPublicClient({chain:walletChains.find(c=>c.id===resume.destination)!,transport:http()});
    const destinationChain=walletChains.find(c=>c.id===resume.destination)!;
    if(await destinationClient.getBalance({address:address!})===0n)throw new Error(t("{0} (ağ {1}) bakiyen 0 {2}. Teslim için bu ağa {3} {4} gerekiyor. Arc üzerindeki USDC bu ağın ücretini ödemez; mevcut gönderimin korunuyor.", [destinationChain.name, resume.destination, destinationChain.nativeCurrency.symbol, isMainnet?'gerçek':'test', destinationChain.nativeCurrency.symbol]));
   }else{
    const raw=validate();if(blocked||!quote||!quoteValid)throw new Error(t("Güncel bir teklif al ve devam eden transferlerini kontrol et."));
    await prepareNetworks(source,destination);
    if(Date.now()-quote.at>=90000)throw new Error(t("Ağ onayları sırasında teklif süresi doldu; ücretleri yeniden hesapla."));
    const destinationClient=createPublicClient({chain:walletChains.find(c=>c.id===destination)!,transport:http()});
    if(await destinationClient.getBalance({address:address!})<bridgeGasBudget(quote.estimate,to!))throw new Error(t("{0} ağında teslim ücreti için {1} bakiyesi yetersiz. Kaynak gönderim başlatılmadı.", [to!.name, to!.nativeCurrency.symbol]));
    const client=createPublicClient({chain:walletChains.find(c=>c.id===source)!,transport:http()});
    const available=await client.readContract({address:from!.usdcAddress as Hex,abi:erc20Abi,functionName:'balanceOf',args:[address!]});
    const gas=bridgeGasBudget(quote.estimate,from!);
    const native=await client.getBalance({address:address!});
    if(raw>available||native<gas+(source===arcId?raw*10n**12n:0n))throw new Error(t("Transfer ve kaynak ağ ücreti için bakiye yetersiz."));
    const at=new Date().toISOString();current={id:crypto.randomUUID(),wallet:address!,source,destination,recipient:target,amount:amount.trim(),createdAt:at,updatedAt:at,status:'running',result:{amount:amount.trim(),token:'USDC',state:'pending',provider:'CCTPV2BridgingProvider',config:{transferSpeed:'FAST'},source:{address:address!,chain:from!},destination:{address:address!,chain:to!,recipientAddress:target},steps:[]}};
    save(current); // Persistence must succeed before funds move.
    await history.persist(current); // Authenticated recovery also survives device loss.
   }
   setPhase(resume?t("Mevcut gönderimin tasdiği / hedef teslimi sürdürülüyor; yeni kaynak gönderim yapılmıyor."):t("Köprü aşamaları yürütülüyor; cüzdan işlem imzalarını onayla."));const a=await adapter();kit.on('*',handler);
   const result:BridgeResult<string>=resume?await resumeBridge(kit,resume,address!,{from:a,to:a}):await kit.bridge({from:{adapter:a,chain:from!},to:{adapter:a,chain:to!,recipientAddress:target},amount:amount.trim(),token:'USDC',config:{transferSpeed:'FAST'}});
   current={...current,result:mergeBridgeCheckpoints(current!.result,result),status:result.state==='error'?'error':'interrupted',updatedAt:new Date().toISOString()};save(current);setQuote(null);
   if(mintHash(result))await verifyDelivery(current);
   else if(result.state==='error')throw new Error(result.steps.find(s=>s.state==='error')?.errorMessage||t("Transfer yarım kaldı. Geçmiş kaydından devam edebilirsin."));
  }catch(e){const message=errorText(e);setError(message);if(current){current={...current,status:'error',error:message,updatedAt:new Date().toISOString()};try{save(current);}catch{setError(t("İşlem kaydı saklanamadı. Cüzdan geçmişini kontrol et; yeniden gönderme."));}}}
  finally{kit.off('*',handler);operation.current=false;setBusy(false);setPhase('');refreshBalances();}
 }
 async function check(record:BridgeRecord){if(operation.current)return;operation.current=true;setBusy(true);setError('');try{await verifyDelivery(record);}catch(e){setError(errorText(e));}finally{operation.current=false;setBusy(false);}}
 async function checkSource(record:BridgeRecord){if(operation.current)return;operation.current=true;setBusy(true);setError('');try{
  const burn=record.result.steps.find(s=>s.name==='burn');if(!burn?.txHash)throw new Error(t("Kaynak işlem kanıtı bulunamadı; cüzdan geçmişini kontrol et."));
  const client=createPublicClient({chain:walletChains.find(c=>c.id===record.source)!,transport:http()});
  const receipt=await client.getTransactionReceipt({hash:burn.txHash as Hex});verifyBridgeBurn(record,receipt,chains,environment);
  save({...record,status:'interrupted',error:undefined,updatedAt:new Date().toISOString(),result:checkpointStep(record.result,{...burn,state:'success'})});
 }catch(e){setError(errorText(e));}finally{operation.current=false;setBusy(false);}}
 let rawAmount:bigint|undefined;try{if(from&&to&&address)rawAmount=validateBridge(from,to,amount,target,environment);}catch{/* Invalid form stays editable. */}
 const checks=from&&to?bridgeReadiness(from,to,rawAmount,balance.isError?undefined:balance.data,sourceGasBalance.isError?undefined:sourceGasBalance.data?.value,targetGasBalance.isError?undefined:targetGasBalance.data?.value,quoteValid?quote?.estimate:undefined):null;
 const funded=!!checks?.usdcReady&&!!checks?.sourceReady&&!!checks?.destinationReady;
 return <section className="ab-module" aria-label={t("Arc köprüsü")}>
  <div className="ab-heading"><div><span className="ab-kicker">CIRCLE CCTP · USDC</span><h1>{t("Arc köprüsü")}</h1><p>{t("USDC’yi Arc’a taşı veya Arc’tan gönder.")}</p></div><span className="ab-network">{isMainnet?'MAINNET':'TESTNET'}</span></div>
  <p className="aw-note">{isMainnet?t("Arc ve Circle’ın desteklediği ağlar arasında gerçek USDC taşır. Seçilen ağların kontratları gönderimden önce doğrulanır. Rota, tutar, alıcı ve gerçek ağ ücretlerini kontrol et."):t("Araştırma ekranları Arc Mainnet’i gösterir. Bu köprü test ağlarında çalışır; gerçek varlık taşımaz.")}</p>
  <div className="ab-grid"><div className="aw-panel ab-form"><div className="ab-wallet"><strong>{address?short(address):t("Cüzdanını bağla")}</strong><WalletConnectionButton/></div>
   <fieldset disabled={busy||blocked}>{renderRoute(busy||blocked)}
   <label>{translateText("Miktar · USDC")}<input aria-label={t("Köprü USDC miktarı")} inputMode="decimal" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></label><p className="aw-note">{translateText("Bakiye:")}{balance.data!==undefined?`${formatUnits(balance.data,6)} USDC`:balance.isError?t("Alınamadı"):'—'} · {from?.nativeCurrency.symbol} {t("ağ ücreti gerekir.")}</p>
   <label>{t("Alıcı adresi")}<input aria-label={t("Köprü alıcı adresi")} placeholder={address||'0x…'} value={recipient} onChange={e=>setRecipient(e.target.value)}/></label><p className="aw-note">{t("Boş bırakırsan kendi cüzdanına gönderilir.")}</p>
   <button className="aw-button ab-primary" disabled={!address||busy} onClick={()=>void estimate()}>{busy?<LoaderCircle size={16}/>:<RefreshCw size={16}/>} {t("Ücretleri hesapla")}</button></fieldset>
   {blocked&&<p className="aw-note">{t("Devam eden bir kaydın var. Geçmişten teslimi kontrol et veya kaldığı yerden sürdür.")}</p>}
   {busy&&phase&&<p className="aw-note" role="status">{phase}</p>}
   {error&&<BridgeError message={error}/>}
  </div><div className="aw-panel ab-review"><h2>{t("Transfer özeti")}</h2>
   {from&&to&&<BridgePreflight from={from} to={to} raw={rawAmount} usdc={balance.isError?undefined:balance.data} sourceNative={sourceGasBalance.isError?undefined:sourceGasBalance.data?.value} destinationNative={targetGasBalance.isError?undefined:targetGasBalance.data?.value} estimate={quoteValid?quote?.estimate:undefined} connected={!!address} walletChain={walletChain} failed={balance.isError||sourceGasBalance.isError||targetGasBalance.isError} loading={balance.isFetching||sourceGasBalance.isFetching||targetGasBalance.isFetching} refresh={refreshBalances}/>}
   {quote?<><BridgeFees estimate={quote.estimate} from={chains.find(c=>c.chainId===quote.source)!} to={chains.find(c=>c.chainId===quote.destination)!} amount={quote.amount} recipient={quote.recipient} remaining={Math.max(0,Math.ceil((90000-(clock-quote.at))/1000))}/>
    {isMainnet&&<label className="ab-mainnet-consent"><input type="checkbox" checked={accepted} disabled={busy||!quoteValid} onChange={e=>setAccepted(e.target.checked)}/> {quote.amount} {t("gerçek USDC’yi")}{from!.name} → {to!.name} {t("rotasında belirtilen alıcıya göndermeyi ve gösterilen ücretleri onaylıyorum.")}</label>}
    <button className="aw-button ab-primary" disabled={!quoteValid||busy||blocked||!funded||(isMainnet&&!accepted)} onClick={()=>void execute()}>{isMainnet?t("Gerçek USDC köprüle"):t("USDC köprüle")}</button>
    {quoteValid&&!funded&&<p className="aw-note">{t("Bakiye kontrolleri tamamlanmadan veya gereken bakiye eklenmeden gönderim açılamaz.")}</p>}
   </>:<p className="aw-note">{t("Miktarı girip ücretleri hesapla. Önce bakiyeler ve gerekli cüzdan ağları kontrol edilir; teklif almak transfer başlatmaz.")}</p>}
  </div></div>
  <div className="aw-panel ab-history"><div className="ab-record-heading"><h2>{isMainnet?t("Mainnet köprü geçmişi"):t("Testnet köprü geçmişi")}</h2><div className="ab-actions"><button className="aw-button" disabled={busy||!ownRecords.length} onClick={exportHistory}><Download size={14}/> {t('Dışa aktar')}</button><button className="aw-button" disabled={busy||!address} onClick={()=>importInput.current?.click()}><Upload size={14}/> {t('Kurtarma kaydı yükle')}</button><input ref={importInput} type="file" accept="application/json,.json" hidden onChange={e=>void importHistory(e.target.files?.[0])}/>{history.eligible&&<button className="aw-button" disabled={busy||history.loading} onClick={history.reload}>{history.loading?t('Eşitleniyor…'):t('Hesabıma eşitle')}</button>}</div></div><p className="aw-note">{history.eligible?t('Doğrulanmış kaynak cüzdanının kayıtları Carpan hesabında ve bu cihazda saklanır. Kayıt tek başına ödeme kanıtı değildir; teslim zincir makbuzuyla doğrulanır.'):t('Bu cihazda saklanır. Aynı cüzdanla Carpan hesabına giriş yaparak geçmişini cihazlar arasında eşitleyebilirsin.')}</p>
   {history.syncError&&<p className="ab-error-box" role="alert">{history.syncError}</p>}
   {!ownRecords.length&&<p className="ab-empty">{address?t("Henüz bir köprü işlemi yok."):t("Geçmişini görmek için cüzdanını bağla.")}</p>}
   {ownRecords.map(r=><BridgeHistoryRecord key={r.id} record={r} chains={chains} busy={busy} onResume={r=>void execute(r)} onCheck={r=>void check(r)} onCheckSource={r=>void checkSource(r)}/>)}
  </div>
 </section>;
}
