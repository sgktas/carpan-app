import {useState} from 'react';
import {useAccount} from 'wagmi';
import {formatUnits,type EIP1193Provider} from 'viem';
import {Hourglass,LoaderCircle,RefreshCw} from 'lucide-react';
import {useI18n} from '../i18n';
import {gatewayAmount,gatewayNetwork,gatewayWithdrawalState,type GatewayEnvironment,type GatewayWithdrawal} from '../gateway';
import {walletRejected} from '../collection-checkout';

import './gateway-recovery.css';
const sdk=()=>import('../gateway-client');
function duration(seconds:number,en:boolean){const d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.ceil(seconds%3600/60);return d?(en?`~${d}d ${h}h`:`~${d} gün ${h} sa`):h?(en?`~${h}h ${m}m`:`~${h} sa ${m} dk`):(en?`~${m}m`:`~${m} dk`);}

/**
 * Circle Gateway's fallback exit: start a delayed removal, wait the contract's 7-day delay,
 * then complete it. Every step is the owner's own wallet transaction and is verified onchain.
 * Writes follow the page's environment gate (testnet only while mainnet writes are closed).
 */
export function GatewayWithdrawals({environment,writes,locked}:{environment:GatewayEnvironment;writes:boolean;locked:boolean}){
 const {address,connector}=useAccount(),{language}=useI18n(),en=language==='en',say=(e:string,tr:string)=>en?e:tr;
 const [rows,setRows]=useState<GatewayWithdrawal[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[done,setDone]=useState('');
 const [chain,setChain]=useState(''),[amount,setAmount]=useState(''),[consent,setConsent]=useState(false);
 async function read(){if(!address)return;setBusy('read');setError('');try{setRows(await (await sdk()).readGatewayWithdrawals(address,environment));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy('');}}
 async function session(name:string){if(!address||!connector)throw Error(say('Connect your wallet first.','Önce cüzdanını bağla.'));return (await sdk()).gatewayWithdrawalSession(await connector.getProvider() as EIP1193Provider,address,name,environment,writes);}
 async function initiate(){if(!chain||!consent)return;setBusy('initiate');setError('');setDone('');
  try{gatewayAmount(amount);const result=await (await session(chain)).initiate(amount);setDone(say(`Withdrawal started and verified: ${formatUnits(result.after.withdrawing,6)} USDC pending. Transaction ${result.hash}`,`Çekim başlatıldı ve doğrulandı: ${formatUnits(result.after.withdrawing,6)} USDC bekliyor. İşlem ${result.hash}`));setConsent(false);setAmount('');await read();}
  catch(e){setError(walletRejected(e)?say('Wallet request cancelled.','Cüzdan isteği iptal edildi.'):say('Not verified. Check your wallet and refresh before trying again: ','Doğrulanmadı. Yeniden denemeden önce cüzdanını kontrol et ve yenile: ')+(e instanceof Error?e.message:String(e)));}
  finally{setBusy('');}}
 async function complete(name:string){setBusy(`complete:${name}`);setError('');setDone('');
  try{const result=await (await session(name)).complete();setDone(say(`${formatUnits(result.amount,6)} USDC returned to your wallet and verified. Transaction ${result.hash}`,`${formatUnits(result.amount,6)} USDC cüzdanına döndü ve doğrulandı. İşlem ${result.hash}`));await read();}
  catch(e){setError(walletRejected(e)?say('Wallet request cancelled.','Cüzdan isteği iptal edildi.'):say('Not verified. Check your wallet and refresh: ','Doğrulanmadı. Cüzdanını kontrol et ve yenile: ')+(e instanceof Error?e.message:String(e)));}
  finally{setBusy('');}}
 const selected=rows?.find(r=>r.chain===chain),restarts=!!selected&&selected.withdrawing>0n;
 return <section className="cg-card cg-withdrawals" aria-label={say('Delayed withdrawal','Gecikmeli çekim')}>
  <div className="cg-card-title"><h2>{say('Delayed withdrawal (7 days)','Gecikmeli çekim (7 gün)')}</h2><Hourglass size={18}/></div>
  <p className="cg-muted">{say('The fallback exit that does not depend on Circle\'s API: start a removal on one network, wait for the contract delay, then complete it to return USDC to your wallet. Normal transfers use “Send to a wallet”.','Circle API’sine bağlı olmayan yedek çıkış: bir ağda çekimi başlat, sözleşme bekleme süresi dolunca tamamla; USDC cüzdanına döner. Normal transferler için “Cüzdana gönder”i kullan.')}</p>
  <button className="cg-secondary" type="button" disabled={!address||!!busy} onClick={()=>void read()}>{busy==='read'?<LoaderCircle size={15} className="at-spinning"/>:<RefreshCw size={15}/>} {say('Read pending withdrawals','Bekleyen çekimleri oku')}</button>
  {rows&&<div className="cg-chain-grid">{rows.map(r=>{const s=gatewayWithdrawalState(r),network=gatewayNetwork(r.chain,environment);return <div key={r.chain} data-state={s.state}>
   <span>{network.name}</span><strong>{formatUnits(r.withdrawing,6)} USDC</strong>
   <small>{s.state==='none'?say('No pending withdrawal','Bekleyen çekim yok'):s.state==='ready'?say('Ready to complete','Tamamlanabilir'):say(`${s.blocksLeft.toLocaleString()} blocks left · ${duration(s.secondsLeft,en)}`,`${s.blocksLeft.toLocaleString('tr-TR')} blok kaldı · ${duration(s.secondsLeft,en)}`)}</small>
   {s.state==='ready'&&<button className="cg-primary" type="button" disabled={!writes||locked||!!busy} onClick={()=>void complete(r.chain)}>{busy===`complete:${r.chain}`?<LoaderCircle size={14} className="at-spinning"/>:null}{say('Complete withdrawal','Çekimi tamamla')}</button>}
  </div>;})}</div>}
  {rows&&writes&&<fieldset className="cg-withdraw-form" disabled={!!busy||locked}>
   <label>{say('Network','Ağ')}<select value={chain} onChange={e=>{setChain(e.target.value);setConsent(false);}}><option value="">{say('Choose a network','Ağ seç')}</option>{rows.map(r=><option key={r.chain} value={r.chain}>{gatewayNetwork(r.chain,environment).name}</option>)}</select></label>
   <label>{say('Amount · USDC','Tutar · USDC')}<input value={amount} inputMode="decimal" placeholder="0.00" onChange={e=>{setAmount(e.target.value);setConsent(false);}}/></label>
   {restarts&&<p className="cg-alert">{say('A withdrawal is already pending here. Starting another adds to it and restarts the full delay.','Bu ağda bekleyen bir çekim var. Yenisini başlatmak tutarı ekler ve bekleme süresini baştan başlatır.')}</p>}
   <label className="cg-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{say('I understand these funds stop being spendable through Gateway now and return to my wallet only after the delay and a second transaction.','Bu tutarın şimdi Gateway’de kullanılamaz hale geleceğini ve ancak bekleme süresi ile ikinci bir işlemden sonra cüzdanıma döneceğini anladım.')}</label>
   <button className="cg-primary" type="button" disabled={!chain||!amount||!consent} onClick={()=>void initiate()}>{busy==='initiate'?<LoaderCircle size={14} className="at-spinning"/>:null}{say('Start withdrawal in wallet','Çekimi cüzdanda başlat')}</button>
  </fieldset>}
  {rows&&!writes&&<p className="cg-muted">{say('Reading is available. Starting or completing a withdrawal opens after the testnet acceptance run.','Okuma açık. Çekim başlatma ve tamamlama testnet kabul testinden sonra açılacak.')}</p>}
  {done&&<p className="cg-success" role="status">{done}</p>}
  {error&&<div className="cg-alert" role="alert">{error}</div>}
 </section>;
}
