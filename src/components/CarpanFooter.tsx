import {CarpanHomeLink} from './CarpanHomeLink';
import {Link,useLocation} from 'react-router-dom';
import {useI18n} from '../i18n';
import {CarpanEmblem} from './CarpanEmblem';
import {ArrowUpRight, Mail} from 'lucide-react';
import {BRAND} from '../brand';
import {ArcNetworkIcon} from './ArcNetworkIcon';
import '../pages/legal.css';
import './carpan-footer.css';
export function CarpanFooter(){const {t,language}=useI18n();const location=useLocation();if(location.pathname==='/login'||location.pathname==='/register')return null;return <footer className="carpan-footer carpan-footer--refined">
  <div className="carpan-footer-grid">
    <div className="carpan-footer-intro"><CarpanHomeLink className="carpan-footer-brand" aria-label={t("Carpan ana sayfa")}><CarpanEmblem size={40}/><span>CARPAN</span></CarpanHomeLink>
      <p className="carpan-footer-tagline">Multiply what matters.</p><p className="carpan-footer-description">{t('Arc üzerinde finans, zincir araştırması ve ekosistem keşfi için ortak çalışma alanın.')}</p>
      <div className="carpan-footer-connections">
        <a className="carpan-footer-icon" href={BRAND.communityUrl} target="_blank" rel="noopener noreferrer" aria-label={t('Carpan’ı X üzerinde takip et')} title="@carpan_app"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932 6.064-6.933Zm-1.29 19.49h2.039L6.486 3.24H4.298L17.61 20.644Z"/></svg></a>
        <a className="carpan-footer-icon is-mail" href="mailto:info@carpan.app" aria-label={t('Carpan’a e-posta gönder')} title="info@carpan.app"><Mail size={18} strokeWidth={1.8} aria-hidden="true"/></a>
      </div><span className="carpan-footer-chain"><ArcNetworkIcon/>{t('Arc üzerinde geliştiriliyor')}</span>
    </div>
    <nav data-workspace="finance" aria-label={t('Footer · Finans')}><h3>{t('Finans')}</h3><Link to="/finance">{t('Finans paneli')}</Link><Link to="/finance/collections">{t('Tahsilatlar')}</Link><Link to="/arc?view=bridge&environment=mainnet">{t('USDC köprüsü')}</Link></nav>
    <nav data-workspace="terminal" aria-label={t('Footer · Terminal')}><h3>{t('Terminal')}</h3><Link to="/arc">{t('Keşif')}</Link><Link to="/arc?view=flow">{t('Akış haritası')}</Link><Link to="/arc?view=following">{t('Takip listem')}</Link><a href="https://explorer.arc.io" target="_blank" rel="noopener noreferrer">Arc Explorer<ArrowUpRight size={12}/></a><Link to="/arc/tools">{t('Geliştirici araçları · Testnet')}</Link></nav>
    <nav data-workspace="social" aria-label={t('Footer · Ecosystem')}><h3>{t('Ecosystem')}</h3><Link to="/ecosystem">{t('Projeler')}</Link><Link to="/ecosystem?view=tokens">{t('Tokenlar ve piyasalar')}</Link><Link to="/ecosystem?view=upcoming">{t('Yaklaşanlar')}</Link><Link to="/ecosystem?view=watchlist">{t('Takip listem')}</Link></nav>
    <nav aria-label={t('Footer · Muhasebe')}><h3>{t('Muhasebe')}</h3><a href={BRAND.accountingUrl} target="_blank" rel="noopener noreferrer">{t(BRAND.accountingName)}<ArrowUpRight size={12}/></a><p>{t(BRAND.accountingDescription)}<br/><span>çarpan.com</span></p></nav>
  </div>
  <div className="carpan-footer-bottom"><p>© {new Date().getFullYear()} Carpan · {t('Tüm hakları saklıdır.')}</p><nav className="carpan-footer-legal" aria-label={language==='en'?'Product and legal information':'Ürün ve hukuki bilgiler'}><Link to="/about">{t('Carpan nasıl çalışır?')}</Link><Link to="/privacy">{language==='en'?'Privacy':'Gizlilik'}</Link><Link to="/terms">{language==='en'?'Terms of use':'Kullanım koşulları'}</Link></nav></div>
</footer>;}
