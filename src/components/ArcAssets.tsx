import {useEffect,useRef,useState} from 'react';
import {useAccount} from 'wagmi';
import {createPublicClient,createWalletClient,custom,erc20Abi,formatUnits,http,isAddress,type EIP1193Provider,type Hex} from 'viem';
import {useI18n} from '../i18n';
import {api} from '../api';
import {DEFAULT_WALLET_FILTERS,type WalletHistory} from '../arc-wallet';
import {ARC_ASSETS,ARC_ASSET_SOURCE,assetPlan,assetBudget,decodeAssetTransfer,verifyAssetTransfer,type AssetTransfer} from '../arc-asset-transfers';
import {arcFeeQuote} from '../arc-fees';
import {walletRejected} from '../collection-checkout';
import {MAINNET_BRIDGE_CHAINS} from '../bridge-mainnet-config';
import {ensureBridgeWalletNetwork} from '../bridge-wallet-network';
import {WalletConnectionButton} from './WalletConnectionButton';
import './arc-assets.css';
const chain=MAINNET_BRIDGE_CHAINS.find(c=>c.id===5042)!;
const client=createPublicClient({chain,transport:http(undefined,{timeout:12000,retryCount:0})});
type Quote={wallet:Hex;token:Hex;recipient:Hex;raw:bigint;gasLimit:bigint;gasReserve:bigint;maxFeePerGas:bigint;maxPriorityFeePerGas:bigint;at:number};
export function ArcAssets(){
 const {language}=useI18n(),say=(en:string,tr:string)=>language==='en'?en:tr;
 const {address,connector}=useAccount();
 const [wallet,setWallet]=useState(''),[symbol,setSymbol]=useState<string>('EURC'),[balance,setBalance]=useState<string|null>(null),[history,setHistory]=useState<WalletHistory|null>(null),[subject,setSubject]=useState('');
 const [recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[record,setRecord]=useState<AssetTransfer|null>(null),[storageError,setStorageError]=useState(''),[manualHash,setManualHash]=useState('');
 const [clock,setClock]=useState(Date.now());const operation=useRef(false);
 const asset=ARC_ASSETS.find(a=>a.symbol===symbol)!;
 const storageKey=(w:string)=>`carpan.asset-transfer.v1.${w.toLowerCase()}`;
 useEffect(()=>{setQuote(null);setConsent(false);setRecord(null);setStorageError('');if(address){try{setRecord(decodeAssetTransfer(localStorage.getItem(storageKey(address)),address));}catch{setStorageError(say('Saved transfer could not be read. Inspect your wallet before sending again.','Kayıtlı transfer okunamadı. Yeniden göndermeden cüzdanını kontrol et.'));}}},[address]);
 useEffect(()=>{setQuote(null);setConsent(false);},[symbol,recipient,amount]);
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const unresolved=!!storageError||!!record&&!['confirmed','failed'].includes(record.state);
 let valid=false;try{const plan=assetPlan(symbol,recipient,amount);valid=!!quote&&quote.wallet===address&&quote.token===plan.asset.address&&quote.recipient===plan.recipient&&quote.raw===plan.raw&&clock-quote.at<60000;}catch{/* Incomplete form. */}
 function save(next:AssetTransfer){setRecord(next);try{localStorage.setItem(storageKey(next.wallet),JSON.stringify(next));}catch{setStorageError(say('Transfer checkpoint could not be saved. Do not resend; inspect your wallet.','Transfer kaydı saklanamadı. Yeniden gönderme; cüzdanını kontrol et.'));throw Error('Transfer recovery storage unavailable.');}}
 async function network(){if(!address||!connector)throw Error(say('Connect your wallet.','Cüzdanını bağla.'));const p=await connector.getProvider() as EIP1193Provider;await ensureBridgeWalletNetwork(p,chain,'mainnet');const accounts=await p.request({method:'eth_accounts'});if(accounts[0]?.toLowerCase()!==address.toLowerCase()||await client.getChainId()!==5042)throw Error('Wallet or network changed.');return p;}
 async function load(){if(operation.current)return;operation.current=true;setBusy(true);setError('');setBalance(null);setHistory(null);setSubject('');try{
  if(!isAddress(wallet))throw Error(say('Enter a valid Arc address.','Geçerli bir Arc adresi gir.'));const target=wallet.toLowerCase();if(await client.getChainId()!==5042)throw Error('Wrong RPC network.');
  const [decimals,raw]=await Promise.all([client.readContract({address:asset.address,abi:erc20Abi,functionName:'decimals'}),client.readContract({address:asset.address,abi:erc20Abi,functionName:'balanceOf',args:[target as Hex]})]);
  if(decimals!==asset.decimals)throw Error('Token precision does not match the official registry.');setSubject(target);setBalance(raw.toString());
  const h=await api.arcWalletHistory(target,{...DEFAULT_WALLET_FILTERS,token:asset.address});
  if(h.items.some(i=>i.token.toLowerCase()!==asset.address||i.decimals!==asset.decimals))throw Error('History token metadata does not match the official registry.');setHistory(h);
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{operation.current=false;setBusy(false);}}
 async function review(){if(operation.current||unresolved)return;operation.current=true;setBusy(true);setQuote(null);setConsent(false);setError('');try{
  await network();const plan=assetPlan(symbol,recipient,amount);if(plan.recipient===address!.toLowerCase())throw Error(say('Choose another recipient.','Farklı bir alıcı seç.'));
  const [decimals,raw,native,estimated]=await Promise.all([client.readContract({address:asset.address,abi:erc20Abi,functionName:'decimals'}),client.readContract({address:asset.address,abi:erc20Abi,functionName:'balanceOf',args:[address!]}),client.getBalance({address:address!}),client.estimateFeesPerGas()]);
  if(decimals!==asset.decimals)throw Error('Token precision mismatch.');
  const simulation=await client.simulateContract({account:address!,address:asset.address,abi:erc20Abi,functionName:'transfer',args:[plan.recipient,plan.raw]});if(simulation.result!==true)throw Error('Transfer simulation failed.');
  const gas=await client.estimateContractGas({account:address!,address:asset.address,abi:erc20Abi,functionName:'transfer',args:[plan.recipient,plan.raw]});const fees=arcFeeQuote(estimated),budget=assetBudget(raw,plan.raw,native,gas,fees.maxFeePerGas);
  if(!budget.ready)throw Error(say('Insufficient token balance or USDC for network fees.','Varlık bakiyesi veya ağ ücreti için USDC yetersiz.'));
  setQuote({wallet:address!,token:asset.address,recipient:plan.recipient,raw:plan.raw,...budget,...fees,at:Date.now()});
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{operation.current=false;setBusy(false);}}
 async function check(r:AssetTransfer){if(!r.hash)throw Error('Transaction hash required.');if(await client.getChainId()!==5042)throw Error('Wrong RPC network.');const receipt=await client.getTransactionReceipt({hash:r.hash});const result=verifyAssetTransfer(r,receipt);const block=await client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)throw Error('Receipt block could not be verified.');save(result);}
 async function send(){
  if(!address||!navigator.locks){setError(say('This browser cannot safely coordinate transfers across tabs.','Bu tarayıcı sekmeler arasında güvenli transfer kilidi sağlayamıyor.'));return;}
  await navigator.locks.request(storageKey(address),{ifAvailable:true},async lock=>{if(!lock){setError(say('A transfer is already being handled in another tab.','Başka bir sekmede transfer işlemi sürüyor.'));return;}await sendLocked();});
 }
 async function sendLocked(){if(operation.current||unresolved||!quote||!valid||!consent)return;operation.current=true;setBusy(true);setError('');let started:AssetTransfer|null=null;
  try{const p=await network();if(Date.now()-quote.at>=60000)throw Error('Fee quote expired.');
   const saved=localStorage.getItem(storageKey(quote.wallet));if(saved){decodeAssetTransfer(saved,quote.wallet);if(['signing','pending','uncertain'].includes(JSON.parse(saved).state))throw Error('An unresolved transfer exists. Check your wallet before sending again.');}
   const [raw,native]=await Promise.all([client.readContract({address:quote.token,abi:erc20Abi,functionName:'balanceOf',args:[quote.wallet]}),client.getBalance({address:quote.wallet})]);if(raw<quote.raw||native<quote.gasReserve)throw Error('Balance changed. Review the transfer again.');
   started={wallet:quote.wallet,token:quote.token,recipient:quote.recipient,raw:quote.raw.toString(),state:'signing'};save(started);
   const hash=await createWalletClient({chain,account:quote.wallet,transport:custom(p)}).writeContract({address:quote.token,abi:erc20Abi,functionName:'transfer',args:[quote.recipient,quote.raw],gas:quote.gasLimit,maxFeePerGas:quote.maxFeePerGas,maxPriorityFeePerGas:quote.maxPriorityFeePerGas});
   started={...started,hash,state:'pending'};save(started);setQuote(null);setConsent(false);await client.waitForTransactionReceipt({hash,confirmations:1,timeout:45000});await check(started);
  }catch(e){if(started&&!started.hash&&walletRejected(e)){try{localStorage.removeItem(storageKey(started.wallet));setRecord(null);}catch{setStorageError('Inspect your wallet before sending again.');}}else if(started&&!started.hash){try{save({...started,state:'uncertain'});}catch{/* Keep the in-memory recovery warning. */}}
   setError(started?say('Check your wallet and transaction hash before sending again. The outcome may be unconfirmed.','Yeniden göndermeden cüzdanını ve işlem hash’ini kontrol et. Sonuç henüz doğrulanmamış olabilir.'):e instanceof Error?e.message:String(e));
  }finally{operation.current=false;setBusy(false);}}
 async function recheck(){if(operation.current||!record)return;operation.current=true;setBusy(true);setError('');try{const hash=record.hash||manualHash.trim();if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Valid transaction hash required.');await check({...record,hash:hash as Hex});}catch(e){setError(e instanceof Error?e.message:String(e));}finally{operation.current=false;setBusy(false);}}
 const recordAsset=record&&ARC_ASSETS.find(a=>a.address===record.token);
 return <main className="aa-assets"><header><h1>{say('Arc assets','Arc varlıkları')}</h1><p>{say('EURC and cirBTC balances, transfer evidence and wallet-confirmed sends. Network fees are paid separately in USDC.','EURC ve cirBTC bakiyeleri, transfer kanıtları ve cüzdan onaylı gönderim. Ağ ücretleri ayrıca USDC ile ödenir.')}</p><a href={ARC_ASSET_SOURCE} target="_blank" rel="noreferrer">{say('Official token contracts','Resmî token kontratları')} ↗</a></header>
 <fieldset disabled={busy}><label>{say('Asset','Varlık')}<select value={symbol} onChange={e=>{setSymbol(e.target.value);setBalance(null);setHistory(null);setSubject('');}}>{ARC_ASSETS.map(a=><option key={a.symbol}>{a.symbol}</option>)}</select></label><code>{asset.address}</code><label>{say('Research wallet','İncelenecek cüzdan')}<input value={wallet} onChange={e=>{setWallet(e.target.value);setSubject('');setBalance(null);setHistory(null);}} placeholder="0x…"/></label><button onClick={()=>void load()}>{say('Load balance and movements','Bakiye ve hareketleri yükle')}</button>{balance!==null&&<p><strong>{formatUnits(BigInt(balance),asset.decimals)} {symbol}</strong> · <code>{subject}</code></p>}</fieldset>
 {error&&<p role="alert">{error}</p>}{storageError&&<p role="alert">{storageError}</p>}
 {history&&<section><h2>{say('Loaded transfers','Yüklenen transferler')}</h2><p>{say('Bounded provider history; an empty page does not prove no historical activity.','Sınırlı sağlayıcı geçmişi; boş sayfa, geçmişte hiç hareket olmadığını kanıtlamaz.')} {history.fetchedAt} {history.stale?say(' · Stale data',' · Eski veri'):''}</p><div className="aa-table"><table><thead><tr><th>{say('Transaction','İşlem')}</th><th>{say('Direction','Yön')}</th><th>{say('Amount','Tutar')}</th></tr></thead><tbody>{history.items.map(i=><tr key={i.id}><td><a href={'https://explorer.arc.io/tx/'+i.hash} target="_blank" rel="noreferrer">{i.hash.slice(0,14)}… ↗</a></td><td>{say(i.direction,{in:'Giriş',out:'Çıkış',self:'Kendine'}[i.direction])}</td><td>{formatUnits(BigInt(i.raw),asset.decimals)} {symbol}</td></tr>)}</tbody></table></div>{!history.items.length&&<p>{say('No matching transfers in the loaded range.','Yüklenen aralıkta eşleşen transfer yok.')}</p>}</section>}
 <section><h2>{say('Send on Arc Mainnet','Arc Mainnet üzerinde gönder')}</h2><WalletConnectionButton/>
 {record&&recordAsset&&<div role="status"><strong>{say('Recorded transfer status','Kayıtlı transfer durumu')}: {record.state}</strong><p>{formatUnits(BigInt(record.raw),recordAsset.decimals)} {recordAsset.symbol} → {record.recipient}</p>{record.hash&&<a href={'https://explorer.arc.io/tx/'+record.hash} target="_blank" rel="noreferrer">{record.hash} ↗</a>}{record.gasRaw18&&<p>{say('Actual network fee','Gerçek ağ ücreti')}: {formatUnits(BigInt(record.gasRaw18),18)} USDC</p>}{record.state==='confirmed'&&<p>{say('Exact recipient and amount verified onchain.','Kesin alıcı ve tutar zincirde doğrulandı.')}</p>}{!record.hash&&<label>{say('Wallet transaction hash','Cüzdandaki işlem hash’i')}<input disabled={busy} value={manualHash} onChange={e=>setManualHash(e.target.value)}/></label>}{!['confirmed','failed'].includes(record.state)&&<button disabled={busy} onClick={()=>void recheck()}>{say('Check existing transfer','Mevcut transferi kontrol et')}</button>}</div>}
 <fieldset disabled={busy||unresolved}><label>{say('Recipient','Alıcı')}<input value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="0x…"/></label><label>{say('Amount','Tutar')} · {symbol}<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></label><button disabled={!address} onClick={()=>void review()}>{say('Review transfer and fee','Transferi ve ücreti incele')}</button>
 {quote&&<div><p>{formatUnits(quote.raw,asset.decimals)} {symbol} → {quote.recipient}</p><p>{say('Maximum network fee reserve','Üst ağ ücreti rezervi')}: {formatUnits(quote.gasReserve,18)} USDC</p><label className="aa-consent"><input type="checkbox" checked={consent} disabled={!valid} onChange={e=>setConsent(e.target.checked)}/>{say('I approve this real asset transfer on Arc Mainnet and the separate USDC network fee.','Arc Mainnet üzerindeki bu gerçek varlık transferini ve ayrı USDC ağ ücretini onaylıyorum.')}</label><button disabled={!valid||!consent} onClick={()=>void send()}>{say('Confirm in wallet','Cüzdanda onayla')}</button>{!valid&&<p>{say('Review again to refresh the quote.','Teklifi yenilemek için yeniden incele.')}</p>}</div>}</fieldset></section></main>;
}
