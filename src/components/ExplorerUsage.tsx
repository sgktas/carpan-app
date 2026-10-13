import {getLocale,useI18n} from '../i18n/index';
import {useEffect,useState} from 'react';
import {api} from '../api';
type Breakdown={purpose:string;endpoint:string;pro_calls:number;estimated_credits:number;cache_hits:number;errors:number};
type Usage={day:string;pro_calls:number;credits:number;public_calls:number;cache_hits:number;errors:number;remaining:number|null;limit:number;reserve:number;available:number;mode:string;resetAt:string;breakdown?:Breakdown[];trackingSince?:string;unattributedProCalls?:number;background_credits?:number};
export function ExplorerUsage(){
 const {language:lang}=useI18n(),say=(en:string,tr:string)=>lang==='tr'?tr:en;
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState('');
 async function load(){try{setUsage(await api.explorerUsage());setError('');}catch(e){setError(e instanceof Error?e.message:say('Usage could not be loaded.','Kullanım alınamadı.'));}}
 useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},60000);return()=>window.clearInterval(timer);},[]);
 const labels:Record<string,string>={research:say('Terminal research','Terminal araştırması'),discovery:say('Discovery polling','Keşif sorguları'),alerts:say('Background alerts','Arka plan alarmları'),finance_history:say('Finance history discovery','Finans geçmişi keşfi'),arc_enrichment:say('Address and token research','Adres ve token araştırması')};
 const number=(n:number)=>n.toLocaleString(getLocale());
 return <section className="p-5 rounded-xl space-y-4" style={{background:'var(--surface)',color:'var(--ink)'}}>
  <div className="flex items-center justify-between"><h2>{say('Onchain API usage','Onchain API kullanımı')}</h2><button type="button" onClick={()=>void load()} className="text-xs">{say('Refresh','Yenile')}</button></div>
  {error&&<p role="alert">{error}</p>}
  {usage&&<>
   <p className="text-xs" style={{color:'var(--muted)'}}>{usage.day} · {usage.mode==='cached'?say('Credit reserve protected · stored data','Kredi rezervi korunuyor · kayıtlı veri'):usage.mode==='saving'?say('Saving mode','Tasarruf modu'):say('Normal mode','Normal mod')}</p>
   <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
    {[[say('Estimated local credits','Tahmini yerel kredi tüketimi'),`${number(usage.credits)} / ${number(usage.limit)}`],[say('Provider reported remaining','Sağlayıcının bildirdiği kalan'),usage.remaining===null?say('Not yet reported','Henüz bildirilmedi'):number(usage.remaining)],[say('PRO requests','PRO istekleri'),number(usage.pro_calls)],[say('Public Explorer requests','Genel Explorer istekleri'),number(usage.public_calls)],[say('Cache hits','Önbellekten karşılanan'),number(usage.cache_hits)],[say('Provider errors','Kaynak hataları'),number(usage.errors)]].map(([label,value])=><div key={label}><span className="text-xs" style={{color:'var(--muted)'}}>{label}</span><strong className="block mt-1">{value}</strong></div>)}
   </div>
   <p className="text-xs" style={{color:'var(--muted)'}}>{say('Protected reserve:','Korunan rezerv:')} {number(usage.reserve)} · {say('Local daily counter resets:','Yerel günlük sayaç yenileme:')} {new Date(usage.resetAt).toLocaleString(getLocale())}. {say('This is not a provider credit top-up. The provider balance is observed separately; estimates use the endpoint costs (20–50 credits) checked in the provider portal.','Bu, sağlayıcı kredilerinin yenilendiği anlamına gelmez. Sağlayıcı bakiyesi ayrı izlenir; tahminler sağlayıcı panelinde doğrulanan uç nokta maliyetlerini (20–50 kredi) kullanır.')}</p>
   <div className="border-t pt-4" style={{borderColor:'var(--border)'}}>
    <h3 className="text-sm mb-2">{say('Requests by feature','Bölüme göre istekler')}</h3>
    <p className="text-xs mb-3" style={{color:'var(--muted)'}}>{say('Attribution starts on','Bölüm ayrımı başlangıcı:')} {usage.trackingSince?new Date(usage.trackingSince).toLocaleString(getLocale()):'—'}. {say('Earlier requests cannot be assigned retrospectively.','Önceki istekler geriye dönük bölümlere dağıtılamaz.')}{!!usage.unattributedProCalls&&` ${number(usage.unattributedProCalls)} ${say('earlier PRO requests today.','bugünkü önceki PRO isteği.')}`}</p>
    {usage.breakdown?.length?<div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead><tr>{[say('Feature / resource','Bölüm / kaynak'),say('PRO calls','PRO isteği'),say('Estimated credits','Tahmini kredi'),say('Cache','Önbellek')].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{usage.breakdown.map(row=><tr key={`${row.purpose}:${row.endpoint}`} className="border-t" style={{borderColor:'var(--border)'}}><td className="p-2">{labels[row.purpose]||row.purpose}<span className="block mt-1" style={{color:'var(--muted)'}}>{row.endpoint}</span></td><td className="p-2">{number(row.pro_calls)}</td><td className="p-2">{number(row.estimated_credits)}</td><td className="p-2">{number(row.cache_hits)}</td></tr>)}</tbody></table></div>:<p className="text-xs" style={{color:'var(--muted)'}}>{say('No feature-attributed requests yet today.','Bugün henüz bölüm ayrımlı istek yok.')}</p>}
   </div>
  </>}
 </section>;
}
