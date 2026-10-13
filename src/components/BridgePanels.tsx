import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import {Check,AlertCircle,RefreshCw} from 'lucide-react';
import {formatUnits} from 'viem';
import type {EVMChainDefinition,EstimateResult} from '@circle-fin/app-kit';
import {bridgeErrorInfo,bridgeReadiness,nativeGasForChain,receivedAmount} from '../arc-bridge';

export function BridgeError({message}:{message:string}){
 const info=bridgeErrorInfo(message);
 return <div className="ab-error-box" role="alert"><strong>{info.title}</strong><p>{info.action}</p><details><summary>{t("Teknik ayrıntı")}</summary><pre>{message}</pre></details></div>;
}

type CheckProps={from:EVMChainDefinition;to:EVMChainDefinition;raw?:bigint;usdc?:bigint;sourceNative?:bigint;destinationNative?:bigint;estimate?:EstimateResult;connected:boolean;walletChain?:number;failed:boolean;loading:boolean;refresh:()=>void};
export function BridgePreflight(p:CheckProps){
 const check=bridgeReadiness(p.from,p.to,p.raw,p.usdc,p.sourceNative,p.destinationNative,p.estimate);
 const native=(value:bigint|undefined,chain:EVMChainDefinition)=>value===undefined?t("Bakiye alınamadı"):`${formatUnits(value,chain.nativeCurrency.decimals)} ${chain.nativeCurrency.symbol}`;
 const gasState=(value:bigint|undefined,ready:boolean)=>value===undefined?'unknown':value===0n?'error':p.estimate?(ready?'success':'error'):'waiting';
 const state=p.failed?t("Kontrol tamamlanamadı"):p.loading?t('Bakiyeler kontrol ediliyor'):p.estimate&&check.usdcReady&&check.sourceReady&&check.destinationReady?t('Bakiyeler uygun'):t("İşlem öncesi kontrol");
 const rows=[
  {label:t("Gönderilecek USDC · {0}", [p.from.name]),value:p.usdc===undefined?t("Bakiye alınamadı"):`${formatUnits(p.usdc,6)} USDC`,tone:p.raw===undefined||p.usdc===undefined?'unknown':check.usdcReady?'success':'error',note:p.raw===undefined?t("Önce miktarı gir."):check.usdcReady?t("Gönderilecek miktarı karşılıyor."):t("USDC bakiyesi gönderilecek miktarı karşılamıyor.")},
  {label:t('Kaynak gas · {0}',[p.from.name]),value:native(p.sourceNative,p.from),tone:gasState(p.sourceNative,check.sourceReady),note:check.sourceRequired!==undefined?t("Kontrol için gereken: {0} {1}{2}.", [formatUnits(check.sourceRequired,p.from.nativeCurrency.decimals), p.from.nativeCurrency.symbol, [5042002,5042].includes(p.from.chainId)?t(' (gönderim + gas; aynı bakiye)'):'']):t("Gerekli gas, ücret teklifinden sonra hesaplanır.")},
  {label:t('Teslim gas · {0}',[p.to.name]),value:native(p.destinationNative,p.to),tone:gasState(p.destinationNative,check.destinationReady),note:check.destinationGas!==undefined?t("Kontrol için gereken: {0} {1}.", [formatUnits(check.destinationGas,p.to.nativeCurrency.decimals), p.to.nativeCurrency.symbol]):t("Teslim gas’ını alıcı değil, bağlı cüzdan öder.")},
 ];
 return <section className="ab-preflight" aria-label={t("İşlem öncesi kontrol")}><div className="ab-record-heading"><h2>{state}</h2><button className="aw-text" type="button" disabled={!p.connected||p.loading} onClick={p.refresh}><RefreshCw size={13}/> {translateText("Bakiyeleri yenile")}</button></div>
  {!p.connected?<p className="aw-note">{t("Bakiyeleri kontrol etmek için cüzdanını bağla.")}</p>:<><ul>{rows.map(row=><li key={row.label} data-tone={row.tone}>{row.tone==='success'?<Check size={15}/>:<AlertCircle size={15}/>}<div><span>{row.label}</span><strong>{row.value}</strong><small>{row.note}</small></div></li>)}</ul>
  <p className="aw-note">{p.walletChain===p.from.chainId?t("Cüzdan kaynak ağda."):t("Ücret hesaplanırken seçilen ağları ekleme / geçiş isteği cüzdanda gösterilir.")} {[421614,42161].includes(p.from.chainId)||[421614,42161].includes(p.to.chainId)?t("Arbitrum kontrolü gas tahmininin 2 katını rezerv olarak kullanır; gerçek ücret cüzdanda onaylanır."):''}</p></>}
 </section>;
}

export function BridgeFees({estimate,from,to,amount,recipient,remaining}:{estimate:EstimateResult;from:EVMChainDefinition;to:EVMChainDefinition;amount:string;recipient:string;remaining:number}){
 const received=receivedAmount(estimate);
 return <><div className="ab-amount-summary"><span>{t("GÖNDERİLEN")}<strong>{amount} <small>USDC</small></strong></span><span>{t("TAHMİNİ ALINACAK")}<strong>{received===null?t("Bilinmiyor"):formatUnits(received,6)} <small>USDC</small></strong></span></div>
 <dl><dt>{translateText("Rota")}</dt><dd>{from.name} → {to.name}</dd><dt>{t("Alıcı")}</dt><dd><code>{recipient}</code></dd>
 {estimate.fees.map((f,i)=><div className="ab-dl-row" key={i}><dt>{f.type==='provider'?t("Circle CCTP ücreti"):f.type==='forwarder'?t('Circle teslim hizmeti'):t("Diğer hizmet ücreti")}</dt><dd>{f.amount??t("Bilinmiyor")} {f.token}</dd></div>)}
 {!estimate.fees.some(f=>f.type==='provider')&&<><dt>{t("Circle CCTP ücreti")}</dt><dd>0 USDC</dd></>}
 <dt>{translateText("Carpan komisyonu")}</dt><dd>0 USDC</dd>
 {[from,to].map(chain=><div className="ab-dl-row" key={chain.chainId}><dt>{chain===from?t("Kaynak"):translateText("Hedef")} gas · {chain.nativeCurrency.symbol}</dt><dd>{formatUnits(nativeGasForChain(estimate,chain),chain.nativeCurrency.decimals)} {chain.nativeCurrency.symbol}</dd></div>)}</dl>
 <p className="aw-note">{t("USDC kesintileri Circle’a gider. Kaynak ve hedef gas ayrı ağ ücretidir; alınacak USDC’den düşülmez. Gas tutarları tahminidir, son teklif cüzdanda gösterilir.")}</p>
 <p className={`ab-quote-clock ${remaining===0?'expired':''}`} role="status">{remaining>0?t("Teklif {0} saniye daha geçerli.", [remaining]):t("Teklif süresi doldu. Ücretleri yeniden hesapla.")}</p>
 {estimate.warnings?.map((w,i)=><p className="aw-note" key={i}>{w.message||w.code}</p>)}</>;
}
