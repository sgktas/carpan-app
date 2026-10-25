import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
import {useI18n} from '../i18n/index';
import type {ExplorerResult} from '../chain-explorer';
import {usdcPage,validTreasuryAddress} from '../treasury-review';
import {PaymentFlowSummary} from './PaymentFlowSummary';
export function TransactionPaymentAnalysis({chain,hash,wallet}:{chain:string;hash:string;wallet:string}){
  const {language}=useI18n(),tr=language==='tr';const [data,setData]=useState<ExplorerResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);const generation=useRef(0);
  useEffect(()=>{generation.current++;setData(null);setError('');setBusy(false);return()=>{generation.current++;};},[chain,hash,wallet]);
  if(!validTreasuryAddress(wallet)||!/^0x[0-9a-f]{64}$/i.test(hash))return null;
  async function load(){const id=++generation.current;setBusy(true);setError('');try{const result=await api.explorerData(chain,{kind:'txTransfers',hash});if(id===generation.current)setData(result);}catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'Provider unavailable.');}finally{if(id===generation.current)setBusy(false);}}
  return <section className="cx-coverage"><h3>{tr?'Bu işlemin işletme ödeme analizi':'Business payment analysis for this transaction'}</h3><p>{tr?'İncelenen cüzdan':'Reviewed wallet'}: <code>{wallet}</code></p><button className="aw-button" disabled={busy} onClick={()=>void load()}>{busy?(tr?'Yükleniyor…':'Loading…'):(tr?'Blockscout USDC olaylarını analiz et':'Analyze Blockscout USDC events')}</button>{error&&<p role="alert">{error}</p>}{data&&<><p>{data.source} · {data.fetchedAt} · {data.cached?(tr?'Önbellek':'Cached'):(tr?'Kaynak okuması':'Provider read')}</p><PaymentFlowSummary rows={data.items} chain={chain} wallet={wallet}/>{!usdcPage(data.items,chain,wallet).length&&<p>{tr?'Yüklenen olaylarda bu cüzdana ait uygun USDC transferi bulunmadı.':'No eligible USDC transfer for this wallet was found in the loaded events.'}</p>}{data.nextCursor&&<p>{tr?'İşlem olaylarının yalnız ilk sayfası incelendi. Tüm olaylar için token transferleri bölümünü aç.':'Only the first page of transaction events was analyzed. Open the token transfers section for all pages.'}</p>}</>}</section>;
}
