import {Link} from 'react-router-dom';
import {Code2,LockKeyhole,ArrowLeft} from 'lucide-react';
import {useI18n} from '../i18n';
import {ArcTerminalHeader} from '../components/ArcTerminalHeader';
import './carpan-workspace.css';
import './api-page.css';

export function ApiPage(){
  const {language}=useI18n(),say=(en:string,tr:string)=>language==='tr'?tr:en;
  return <div className="aw-terminal aw-terminal-v3 carpan-workspace carpan-data-workspace"><ArcTerminalHeader active="api"/>
    <main className="ca-api"><section aria-labelledby="carpan-api-title"><div className="ca-api-icon"><Code2 size={30} aria-hidden="true"/></div>
      <span className="ca-api-status"><LockKeyhole size={14} aria-hidden="true"/>{say('Access closed','Erişim kapalı')}</span>
      <h1 id="carpan-api-title">API</h1><p>{say('Carpan’s integration API will have its own workspace here. Access is not open yet.','Carpan’ın entegrasyon API’si bu ayrı çalışma alanında yer alacak. Henüz kullanıma açık değil.')}</p>
      <div className="ca-api-details"><strong>{say('Available after launch','Kullanıma açıldığında')}</strong><span>{say('Wallet movement data · Accounting exports · Webhooks','Cüzdan hareket verileri · Muhasebe çıktıları · Webhook’lar')}</span></div>
      <p className="ca-api-note">{say('API key creation, external data access and webhook delivery are paused. Finance and your saved records remain available.','API anahtarı oluşturma, dışarıdan veri erişimi ve webhook teslimi duraklatıldı. Finans ve mevcut kayıtların kullanılabilir durumda.')}</p>
      <Link className="ca-api-back" to="/"><ArrowLeft size={16}/>{say('Back to home','Ana sayfaya dön')}</Link>
    </section></main>
  </div>;
}
