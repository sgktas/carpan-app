import {Link} from 'react-router-dom';
import {ArrowUpRight,FileCheck2,GitBranch,Users,Wallet} from 'lucide-react';
import {t} from '../i18n';
import {ArcTerminalHeader} from '../components/ArcTerminalHeader';
import './carpan-workspace.css';
import './product-overview.css';
export function ProductOverviewPage(){return <div className="aw-terminal aw-terminal-v3 carpan-workspace"><ArcTerminalHeader active="about"/><main className="cp-overview">
 <header><h1>{t('Veriden karara.')}<br/><em>{t('Ödemeden kayda.')}</em></h1><p>{t('Carpan, Arc üzerindeki USDC hareketlerini, tahsilatlarını ve proje bağlantılarını aynı çalışma alanında birleştirir.')}</p><div className="cp-overview-actions"><Link className="aw-button primary" to="/finance/collections">{t('İlk tahsilatını oluştur')}<ArrowUpRight size={16}/></Link><Link className="aw-button" to="/arc?view=explorer&data=blocks">{t('Canlı Arc verisini incele')}<ArrowUpRight size={16}/></Link></div></header>
 <section className="cp-overview-products" aria-label={t('Carpan çalışma alanları')}>{[
  {Icon:Wallet,title:'Finans',description:'Talep oluştur, ödeme bağlantısını paylaş, gelen ödemenin kanıtını doğru işle eşleştir.',to:'/finance',action:'Finansı aç'},
  {Icon:GitBranch,title:'Terminal',description:'Adresleri, tokenları, blokları ve kontratları araştır. Akışı aç, takip listene kaydet.',to:'/arc',action:'Terminali aç'},
  {Icon:Users,title:'Ecosystem',description:'Arc projelerini kategorileri ve entegrasyon durumlarıyla keşfet. Kaynaklı kontratlarını Terminal’de araştır.',to:'/ecosystem',action:'Ekosistemi keşfet'},
 ].map(({Icon,...item})=><article key={item.to}><span><Icon size={24}/></span><h2>{t(item.title)}</h2><p>{t(item.description)}</p><Link to={item.to}>{t(item.action)}<ArrowUpRight size={16}/></Link></article>)}</section>
 <section className="cp-overview-flow"><div><span className="cp-overview-kicker">USDC · ARC MAINNET</span><h2>{t('Bir tahsilatın yolculuğu.')}</h2><p>{t('Ödeme zincirde gerçekleşir. Müşteri ve iş bilgileri kişisel hesabında kalır.')}</p></div><ol>{[
  ['Talebi oluştur','Alıcı cüzdanını, iş referansını ve USDC tutarını belirle.'],
  ['Bağlantıdan öde','Gönderen cüzdanını bağlar; alıcı, tutar ve ağ ücretini inceleyerek işlemi kendisi imzalar.'],
  ['Kanıtı eşleştir','Gelen kutusunu yenile veya işlem hash’ini ekle. Alıcı doğru işe ait olduğunu onaylar.'],
  ['Kaydı dışa aktar','Kısmi, tam ve fazla ödemeleri karar geçmişiyle takip et; CSV raporunu indir.'],
 ].map(([title,description],i)=><li key={title}><span>{String(i+1).padStart(2,'0')}</span><div><h3>{t(title)}</h3><p>{t(description)}</p></div></li>)}</ol></section>
 <section className="cp-overview-arc"><h2>{t('Arc bu akışın merkezinde.')}</h2><div><article><FileCheck2 size={22}/><h3>USDC</h3><p>{t('Ödeme ve ağ ücreti aynı USDC bakiyesinden karşılanır. Carpan bunları iki ayrı varlık olarak toplamaz.')}</p></article><article><GitBranch size={22}/><h3>CCTP</h3><p>{t('Desteklenen ağlardaki USDC’yi Arc’a getir veya Arc’tan gönder. Kaynak gönderim ve hedef teslimi ayrı kanıtlarla izlenir.')}</p></article><article><Wallet size={22}/><h3>{t('Kendi cüzdanın')}</h3><p>{t('Giriş ücretsiz mesaj imzasıdır. Ödemeler yalnız senin cüzdan onayınla gönderilir; özel anahtarın Carpan’a verilmez.')}</p></article></div></section>
 <section className="cp-overview-boundaries"><h2>{t('Bugünkü kapsam')}</h2><p>{t('Tahsilat eşleştirmesi kullanıcı onayı gerektirir; otomatik muhasebe değildir. Gelen kutusu sınırlı yakın dönem taraması yapar. Ekosistem kayıtları kaynaklıdır; katılımcı listesi mainnet dağıtımını kanıtlamaz. Kurum etiketleri sahiplik garantisi değildir.')}</p><p>{t('Köprüde Arc ↔ Arbitrum gerçek transferleri denenmiştir. Diğer rotalar için sözleşme kontrolleri yapılmış; gerçek transfer pilotları henüz tamamlanmamıştır.')}</p><a href="https://docs.arc.io" target="_blank" rel="noopener noreferrer">Arc documentation ↗</a></section>
 </main></div>;}
