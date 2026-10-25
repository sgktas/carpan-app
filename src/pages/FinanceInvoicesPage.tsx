import {useState} from 'react';
import {ConnectKitButton} from 'connectkit';
import {Link,useSearchParams} from 'react-router-dom';
import {ArrowLeft,ExternalLink,FilePlus2,Search,Wallet,ShieldCheck} from 'lucide-react';
import {ArcTerminalHeader} from '../components/ArcTerminalHeader';
import {CreateInvoice} from '../components/invoices/CreateInvoice';
import {LookupInvoice} from '../components/invoices/LookupInvoice';
import {PayInvoice} from '../components/invoices/PayInvoice';
import {InvoicePaymentReceipt} from '../components/invoices/InvoicePaymentReceipt';
import {CONTRACT_ADDRESS,PILOT_KEY,PILOT_PAYMENT} from '../components/invoices/invoiceConfig';
import {useI18n} from '../i18n/index';
import './finance-invoices.css';

export function FinanceInvoicesPage(){
 const [params]=useSearchParams();const {language}=useI18n();
 const tr=language==='tr';const text=(en:string,translation:string)=>tr?translation:en;
 const initialKey=params.get('invoice')||'';const receiptHash=params.get('receipt')||'';
 const [tab,setTab]=useState<'create'|'lookup'|'pay'>(initialKey?'lookup':'create');
 return <div className="aw-terminal aw-terminal-v3 carpan-workspace carpan-data-workspace"><ArcTerminalHeader active="invoices"/><main className="fi-main">
  <Link className="fi-back" to="/finance/collections"><ArrowLeft size={15}/>{text('Back to Collections','Tahsilatlara dön')}</Link>
  <header className="fi-heading"><div><span className="fi-kicker">{text('COLLECTIONS / ONCHAIN PILOT','TAHSİLATLAR / ZİNCİR ÜSTÜ PİLOT')}</span><h1>{text('Onchain payment requests','Zincir üstü ödeme talepleri')}</h1><p>{text('Create a request. Receive USDC directly. Verify settlement on Arc.','Talep oluştur. USDC’yi doğrudan al. Ödemeyi Arc üzerinde doğrula.')}</p></div><div className="fi-network"><span/>Arc Mainnet <b>USDC</b></div></header>
  <aside className="fi-deploy-note"><ShieldCheck size={18}/><div><strong>{text('Live pilot · real USDC','Canlı pilot · gerçek USDC')}</strong><p>{text('This pilot records payment requests, not legal or tax invoices. No independent professional audit. Private collection matching and accounting exports remain separate. The pilot form is currently in English.','Bu pilot ödeme talebi kaydeder; yasal veya vergi faturası oluşturmaz. Bağımsız profesyonel denetim yapılmadı. Özel tahsilat eşleştirmesi ve muhasebe çıktıları ayrı akışlardır. Pilot formu şu an İngilizcedir.')}</p></div></aside>
  <div className="fi-wallet"><ConnectKitButton.Custom>{({isConnected,address,show})=><button className="fi-secondary" onClick={show}><Wallet size={15}/>{isConnected?address?.slice(0,6)+'…'+address?.slice(-4):text('Connect wallet','Cüzdan bağla')}</button>}</ConnectKitButton.Custom><span>{text('Viewing needs no wallet or Carpan login.','Görüntülemek için cüzdan veya Carpan girişi gerekmez.')}</span></div>
  <nav className="fi-tabs" aria-label={text('Payment request actions','Ödeme talebi işlemleri')}>{([['create',FilePlus2,text('Create request','Talep oluştur')],['lookup',Search,text('Verify request','Talebi doğrula')],['pay',Wallet,text('Pay request','Talebi öde')]] as const).map(([id,Icon,label])=><button key={id} className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}</nav>
  <section className="fi-workspace"><div className="fi-form fi-pilot">
    {tab==='create'&&<CreateInvoice/>}{tab==='lookup'&&(receiptHash?<InvoicePaymentReceipt hash={receiptHash} invoiceKey={initialKey}/>:<LookupInvoice key={initialKey} initialKey={initialKey}/>)}{tab==='pay'&&<PayInvoice initialKey={initialKey}/>}
  </div><aside className="fi-side"><span className="fi-side-kicker">{text('VERIFIABLE SETTLEMENT','DOĞRULANABİLİR ÖDEME')}</span><h2>{text('A request. A transfer. A receipt.','Bir talep. Bir transfer. Bir kanıt.')}</h2><p>{text('The contract holds no customer funds. An exact USDC allowance and payment each require a separate wallet signature. Reference hashes and payment details are public.','Kontrat müşteri fonlarını tutmaz. Tam tutar için USDC izni ve ödeme ayrı cüzdan imzaları gerektirir. Referans hash’leri ve ödeme detayları herkese açıktır.')}</p>
    <div className="fi-evidence"><strong>{text('Mainnet pilot completed','Mainnet pilotu tamamlandı')}</strong><p>{text('Owner-operated transfer between two wallets: 0.10 USDC, settled on 22 October 2026. This is a pilot, not customer traction.','İki kişisel cüzdan arasında 0,10 USDC; 22 Ekim 2026 tarihinde ödendi. Bu pilot, müşteri kullanımı değildir.')}</p><Link to={'/finance/invoices?invoice='+PILOT_KEY+'&receipt='+PILOT_PAYMENT} onClick={()=>setTab('lookup')}>{text('Inspect paid request','Ödenmiş talebi incele')} <Search size={13}/></Link><a href={'https://explorer.arc.io/tx/'+PILOT_PAYMENT} target="_blank" rel="noreferrer">{text('Payment receipt','Ödeme makbuzu')} <ExternalLink size={13}/></a></div>
    <div className="fi-contract"><span>{text('Invoice contract','Ödeme talebi kontratı')}</span><a href={'https://explorer.arc.io/address/'+CONTRACT_ADDRESS} target="_blank" rel="noreferrer">{CONTRACT_ADDRESS}<ExternalLink size={13}/></a></div>
    <div className="fi-chain-facts"><a href="https://studio.arc.io/app/6038d4e9-b980-42dc-a513-df90db3878ae" target="_blank" rel="noreferrer">Built with Arc Studio ↗</a><a href="https://github.com/sgktas/carpan-app/blob/main/docs/carpan-arc-invoices.md" target="_blank" rel="noreferrer">{text('Source and implementation notes','Kaynak ve uygulama notları')} ↗</a></div>
  </aside></section>
 </main></div>
}
