/* carpan-localized */
import { t } from '../i18n/index';
import { ArrowDownLeft, ArrowUpRight, Check, FileText, GitBranch, Link2, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import './product-cards.css';

/** Workflow illustrations only: no invented balances, records or live activity. */
export function ProductCards() {
  return <section className="rvx-products rvx-products--editorial" aria-labelledby="carpan-products-title">
    <div className="rvx-products-heading"><div><span className="rvx-kicker">{t('BİR HESAP. ÜÇ ÇALIŞMA ALANI.')}</span><h2 id="carpan-products-title">{t('Arc’ta ne yapmak')}<br/><em>{t('istiyorsun?')}</em></h2></div><p>{t('Ödemelerini düzenle, zinciri araştır, Arc ekosistemini keşfet. İhtiyacın olan yerden başla.')}</p></div>
    <div className="rvx-product-grid">
      <article className="rvx-product-card product-finance">
        <div className="rvx-product-story">
          <div className="rvx-product-top"><span>{t('Finans')}</span><Wallet size={19}/></div>
          <h3>{t('USDC’nin')}<br/>{t('hesabını tut.')}</h3>
          <p>{t('Giriş ve çıkışlarını incele. Tahsilat taleplerini gelen ödemeyle eşleştir.')}</p>
          <div className="rvx-product-capabilities"><span>{t('Tahsilatlar')}</span><span>{t('Nakit akışı')}</span><span>{t('USDC köprüsü')}</span></div>
          <Link className="rvx-product-open" to="/finance">{t('Finans çalışma alanı')}<ArrowUpRight size={19}/></Link>
        </div>
        <div className="rvx-workflow-art rvx-finance-art" role="img" aria-label={t('Tahsilat akışı şeması')}>
          <div className="rvx-art-caption"><span>{t('TAHSİLAT AKIŞI')}</span><span>{t('ŞEMA')}</span></div>
          <div className="rvx-finance-connection" aria-hidden="true"><i/><i/><i/></div>
          <div className="rvx-request-sheet"><div className="rvx-sheet-top"><FileText size={19}/><span>{t('Ödeme talebi')}</span><b>01</b></div><span className="rvx-sheet-description">{t('Müşteri · tutar · iş referansı')}</span><div className="rvx-sheet-lines" aria-hidden="true"><i/><i/><i/></div><div className="rvx-sheet-token"><Wallet size={15}/><span>USDC</span><ArrowUpRight size={16}/></div></div>
          <div className="rvx-proof-sheet"><div className="rvx-sheet-top"><ArrowDownLeft size={19}/><span>{t('Arc işlem kanıtı')}</span><b>02</b></div><span className="rvx-sheet-description">{t('Alıcı · USDC · işlem ücreti')}</span><div className="rvx-proof-code" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="rvx-sheet-evidence"><ShieldCheck size={17}/><span>{t('Kanıtı doğrula.')}</span></div></div>
          <div className="rvx-match-sheet"><span className="rvx-match-icon"><Check size={18}/></span><div><small>03</small><strong>{t('İncele ve faturayla eşleştir')}</strong></div></div>
        </div>
      </article>
      <article className="rvx-product-card product-terminal">
        <div className="rvx-product-story">
          <div className="rvx-product-top"><span>{t('Terminal')}</span><Search size={19}/></div>
          <h3>{t('Bir hareketten')}<br/>{t('izini sür.')}</h3>
          <p>{t('Transferin kaynağına in. Cüzdanları, tokenları ve kontratları birlikte araştır.')}</p>
        </div>
        <div className="rvx-workflow-art rvx-terminal-art" role="img" aria-label={t('Zincir araştırması şeması')}>
          <div className="rvx-art-caption"><span>{t('ARC ARAŞTIRMASI')}</span><span>{t('ŞEMA')}</span></div>
          <svg className="rvx-network-links" viewBox="0 0 520 240" aria-hidden="true"><path className="rvx-link-muted" d="M0 52H107Q125 52 125 70V116M0 203H90Q108 203 108 185V135M290 118H360Q375 118 375 103V43H520M290 134H334Q352 134 352 152V202H520"/><path className="rvx-link-main" d="M132 125H205Q220 125 220 108V62H304M132 125H206Q223 125 223 142V188H305M353 62H417Q431 62 431 76V114H470M353 188H417Q431 188 431 174V139H470"/><circle cx="223" cy="125" r="4"/><circle cx="431" cy="125" r="4"/></svg>
          <div className="rvx-network-node rvx-network-wallet"><Wallet size={22}/><span>{t('Cüzdan')}</span></div>
          <div className="rvx-network-node rvx-network-transfer"><ArrowUpRight size={19}/><span>{t('İşlem')}</span></div>
          <div className="rvx-network-node rvx-network-contract"><FileText size={19}/><span>{t('Kontrat')}</span></div>
          <div className="rvx-network-node rvx-network-proof"><ShieldCheck size={22}/><span>{t('Kanıtı doğrula.')}</span></div>
          <div className="rvx-art-footnote"><GitBranch size={15}/>{t('Akışı aç, zincir kanıtına ulaş')}</div>
        </div>
        <div className="rvx-product-bottom"><div className="rvx-product-capabilities"><span>{t('Transferler')}</span><span>{t('Akış haritası')}</span><span>{t('Alarmlar')}</span></div><Link className="rvx-product-open" to="/arc">{t('Terminali keşfet')}<ArrowUpRight size={19}/></Link></div>
      </article>
      <article className="rvx-product-card product-community">
        <div className="rvx-product-story">
          <div className="rvx-product-top"><span>{t('Ecosystem')}</span><Users size={19}/></div>
          <h3>{t('Projeyi tanı.')}<br/>{t('Kanıtına ulaş.')}</h3>
          <p>{t('Projeleri kategorileri ve entegrasyon durumlarıyla keşfet. Kaynaklı Arc kontratlarını araştır.')}</p>
        </div>
        <div className="rvx-workflow-art rvx-ecosystem-art" role="img" aria-label={t('Ekosistem araştırması şeması')}>
          <div className="rvx-art-caption"><span>{t('EKOSİSTEM ARAŞTIRMASI')}</span><span>{t('ŞEMA')}</span></div>
          <div className="rvx-research-spine" aria-hidden="true"><i/><i/><i/></div>
          <div className="rvx-research-dossier"><span className="rvx-research-mark"><GitBranch size={23}/></span><div><small>{t('Projeler')}</small><strong>{t('Proje profili')}</strong></div><span className="rvx-dossier-lines" aria-hidden="true"><i/><i/></span></div>
          <div className="rvx-research-source"><Link2 size={18}/><div><strong>{t('Arc entegrasyonu')}</strong><small>{t('Kategori · durum · kontrat kaynağı')}</small></div><ArrowUpRight size={16}/></div>
          <div className="rvx-research-source rvx-research-source--proof"><ShieldCheck size={18}/><div><strong>{t('Resmî kaynaklar · Arc adresleri')}</strong><small>{t('Projeyi kaydet, Terminal’de araştır')}</small></div><ArrowUpRight size={16}/></div>
        </div>
        <div className="rvx-product-bottom"><div className="rvx-product-capabilities"><span>{t('Projeler')}</span><span>{t('Tokenlar')}</span><span>{t('Takip listesi')}</span></div><Link className="rvx-product-open" to="/ecosystem">{t('Ekosistemi keşfet')}<ArrowUpRight size={19}/></Link></div>
      </article>
    </div>
  </section>;
}
