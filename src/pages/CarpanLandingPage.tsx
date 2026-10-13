import {CarpanHomeLink} from '../components/CarpanHomeLink';
import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { ProductCards } from '../components/ProductCards';
import {EcosystemLogo} from '../components/EcosystemLogo';
import {ArcNetworkIcon} from '../components/ArcNetworkIcon';
import { CarpanHeroVisual } from '../components/CarpanHeroVisual';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { CarpanEmblem } from '../components/CarpanEmblem';
import { CarpanProductNavigation } from '../components/CarpanProductNavigation';
import { BRAND } from '../brand';
import { CarpanHeaderControls } from '../components/CarpanHeaderControls';
import { useCarpanLogin } from '../components/CarpanLogin';
import { CarpanAccountingBranch } from '../components/CarpanAccountingBranch';
import { parseReferralIntent, referralIntentPath, rememberReferralIntent } from '../referral-intent';
import type {EcosystemEntry} from '../ecosystem';
import {useI18n} from '../i18n';
import './refvox-landing.css';
import './carpan-hero.css';
import './carpan-immersive.css';
import './carpan-home-editorial.css';

function Brand() {
  return <span className="rvx-brand"><CarpanEmblem size={44}/><span className="rvx-brand-name">{BRAND.wordmark}</span></span>;
}

const makeHeroSlides = () => [
  {
    module: t("Finans"),
    title: <>{t("USDC’nin hareketi.")}<br/><em>{t("İşinin kontrolü.")}</em></>,
    description: t("Cüzdanının giriş ve çıkışlarını gör. Ödeme talebi oluştur, gelen USDC’yi işlem kanıtıyla ilgili işe eşleştir."),
    primary: t("Finansı aç"),
    primaryTo: '/finance',
    secondary: t("Tahsilatları yönet"),
    secondaryTo: '/finance/collections',
    note: t("Müşteri ve fatura bilgileri kişisel hesabında"),
  },
  {
    module: t("Terminal"),
    title: <>{t("Hareketi gör.")}<br/><em>{t("Kaynağına in.")}</em></>,
    description: t("Arc’taki transferleri, cüzdanları ve yeni kontratları araştır. Adresler arasındaki akışı aç, takip etmek istediklerini kaydet."),
    primary: t("Terminali aç"),
    primaryTo: '/arc',
    secondary: t("Akış haritasını gör"),
    secondaryTo: '/arc?view=flow',
    note: t("Her hareketten işlem kanıtına ulaş"),
  },
  {
    module: t("Ecosystem"),
    title: <>{t("Arc’ta keşfet.")}<br/><em>{t("Kanıtına ulaş.")}</em></>,
    description: t("Arc projelerini kategorileri ve entegrasyon durumlarıyla keşfet. Token kontratlarına ve resmî kaynaklara ulaş, araştırmanı Terminal’de sürdür."),
    primary: t("Ekosistemi keşfet"),
    primaryTo: '/ecosystem',
    secondary: t("Tokenları incele"),
    secondaryTo: '/ecosystem?view=tokens',
    note: t("Resmî kaynaklar, entegrasyon durumu ve Arc adresleri"),
  },
] as const;

export function CarpanLandingPage() {
  const heroSlides = makeHeroSlides();
  const {language}=useI18n();
  const { user, demoMode } = useAuth();
  const { openLogin } = useCarpanLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const heroRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(100);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [projects, setProjects] = useState<EcosystemEntry[]>([]);
  const [projectError, setProjectError] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectRetry, setProjectRetry] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroHasChanged, setHeroHasChanged] = useState(false);
  const [heroPaused, setHeroPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const referralIntent = parseReferralIntent(location.search);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const updateHeight = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    const updateScroll = () => setHeaderScrolled(window.scrollY > 24);
    updateHeight();
    updateScroll();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    window.addEventListener('scroll', updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateScroll);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (heroPaused || reducedMotion || !pageVisible) return;
    const timer = window.setInterval(() => {
      if (!heroRef.current?.matches(':hover') && !heroRef.current?.contains(document.activeElement)) {
        setHeroHasChanged(true);
        setHeroIndex(index => (index + 1) % heroSlides.length);
      }
    }, 7000);
    return () => window.clearInterval(timer);
  }, [heroIndex, heroPaused, reducedMotion, pageVisible]);

  useEffect(() => { rememberReferralIntent(referralIntent); }, [referralIntent?.projectId, referralIntent?.linkId]);

  useEffect(() => {
    if (user && referralIntent) navigate(referralIntentPath(referralIntent), { replace: true });
  }, [user, referralIntent?.projectId, referralIntent?.linkId, navigate]);

useEffect(() => { let current = true; setProjectsLoading(true); setProjectError(false);
    api.ecosystem().then(value => { if (current) setProjects([...value.projects].sort((a,b)=>{const picks=['eco_circle','eco_aave','eco_blockscout'];const rank=(id:string)=>picks.includes(id)?picks.indexOf(id):picks.length;return rank(a.id)-rank(b.id);})); })
      .catch(() => { if (current) setProjectError(true); })
      .finally(() => { if (current) setProjectsLoading(false); });
    return () => { current = false; };
  }, [projectRetry, demoMode]);

  return <div className={`rvx-page rvx-page--immersive${demoMode ? ' has-demo-banner' : ''}`} style={{ '--landing-header-height': `${headerHeight}px` } as CSSProperties}>
    <header className={`rvx-header${headerScrolled ? ' is-scrolled' : ''}`} ref={headerRef}><div className="rvx-wrap rvx-nav">
      <CarpanHomeLink aria-label={t("Carpan ana sayfa")}><Brand/></CarpanHomeLink>
      <CarpanProductNavigation/>
      <div className="rvx-nav-actions"><CarpanHeaderControls/></div>
    </div></header>
    {demoMode && <div className="rvx-mode">{t("Demo ortamı · Bu ekrandaki örnek hesaplar ve işlemler gerçek kampanya veya ödeme değildir.")}</div>}
    <main>
      <section className={`rvx-hero rvx-hero--studio hero-module-${heroIndex}${heroPaused || reducedMotion || !pageVisible ? ' is-motion-paused' : ''}`} ref={heroRef} aria-label={t("Carpan tanıtım bannerı")}>
        <CarpanHeroVisual variant={heroIndex}/>
        <div className={`rvx-hero-layout${heroHasChanged ? ' is-changing' : ''}`} key={heroIndex}>
        <div className="rvx-hero-copy">
          <h1>{heroSlides[heroIndex].title}</h1>
          <p>{heroSlides[heroIndex].description}</p>
          <div className="rvx-hero-actions">
            {heroSlides[heroIndex].primaryTo.startsWith('#')
              ? <a className="rvx-button primary" href={heroSlides[heroIndex].primaryTo}>{heroSlides[heroIndex].primary} <ArrowUpRight size={17}/></a>
              : <Link className="rvx-button primary" to={heroSlides[heroIndex].primaryTo}>{heroSlides[heroIndex].primary} <ArrowUpRight size={17}/></Link>}
            {heroSlides[heroIndex].secondaryTo.startsWith('#')
              ? <a className="rvx-button secondary" href={heroSlides[heroIndex].secondaryTo}>{heroSlides[heroIndex].secondary} <span>↘</span></a>
              : <Link className="rvx-button secondary" to={heroSlides[heroIndex].secondaryTo}>{heroSlides[heroIndex].secondary} <ArrowUpRight size={17}/></Link>}
          </div>
          <p className="rvx-hero-note"><Check size={14}/> {heroSlides[heroIndex].note}</p>
        </div>
        </div>
        <div className="rvx-hero-controls" aria-label={t("Tanıtım bannerı kontrolleri")}>
          <div className="rvx-hero-platform"><ArcNetworkIcon/> BUILT ON ARC</div>
          <div className="rvx-hero-tabs">
          {heroSlides.map((slide, index) => <button type="button" key={index} className={`rvx-module-control${index === heroIndex ? ' is-active' : ''}`}
            aria-label={t("{0} bannerını göster", [slide.module])} aria-pressed={index === heroIndex} onClick={() => { setHeroHasChanged(true); setHeroIndex(index); }}>{slide.module}</button>)}
          </div>
          <div className="rvx-hero-paging">
            {!reducedMotion && <button type="button" onClick={() => setHeroPaused(!heroPaused)} aria-label={heroPaused ? t("Otomatik geçişi başlat") : t("Otomatik geçişi durdur")}>
              {heroPaused ? <Play size={15}/> : <Pause size={15}/>}</button>}
            <button className="rvx-hero-arrow" type="button" onClick={() => { setHeroHasChanged(true); setHeroIndex(index => (index - 1 + heroSlides.length) % heroSlides.length); }} aria-label={t("Önceki banner")}><ChevronLeft size={17}/></button>
            <button className="rvx-hero-arrow" type="button" onClick={() => { setHeroHasChanged(true); setHeroIndex(index => (index + 1) % heroSlides.length); }} aria-label={t("Sonraki banner")}><ChevronRight size={17}/></button>
          </div>
        </div>
      </section>
      <div className="rvx-wrap rvx-home-content rvx-home-content--premium">
      <ProductCards/>
      <section className="rvx-community-section" aria-label={t("Ekosistemi keşfet")}>
      <section className="rvx-explore rvx-directory-explore" id="discover"><div className="rvx-section-head"><div><span className="rvx-kicker">{t("ECOSYSTEM / PROJELER")}</span><h2>{t("Arc’ta kim, ne inşa ediyor?")}</h2><p>{t("Projeyi tanı. Kaynaklarını ve Arc adreslerini incele.")}</p></div><Link to="/ecosystem">{t("Proje kataloğu")}<ArrowUpRight size={16}/></Link></div>
        {projectsLoading ? <div className="rvx-empty" role="status">{t("Projeler yükleniyor…")}</div> : projectError ? <div className="rvx-empty" role="alert">{t("Projeler yüklenemedi.")}<button className="rvx-button" onClick={() => setProjectRetry(n => n + 1)}>{translateText("Yeniden dene")}</button></div> : projects.length === 0 ? <div className="rvx-empty rvx-community-empty"><strong>{t("İlk proje kayıtlarına yer açıyoruz.")}</strong><p>{t("Arc üzerinde geliştirdiğin projeyi gönder. İncelenip yayımlanan kayıtlar burada görünür.")}</p><Link to="/projects">{t("Proje öner")}<ArrowUpRight size={15}/></Link></div> :
          <div className="rvx-project-grid">{projects.slice(0, 3).map((project, index) => <article className="rvx-project" key={project.id}>
            <div className={`rvx-project-cover cover-${index % 3}`}><span>{project.curated ? t("RESMÎ KAYNAKLI KAYIT") : t("TOPLULUK LİSTELEMESİ")}</span><EcosystemLogo project={project} size="cover"/></div>
            <div className="rvx-project-content"><h3>{project.name}</h3><p>{project.description[language] || t("{0} projesini keşfet.", [project.domain])}</p><div><span>{project.domain}</span><Link to={`/ecosystem/${project.id}`}>{translateText("Projeyi incele")}<ArrowUpRight size={15}/></Link></div></div>
          </article>)}</div>}
      </section>
      </section>
      <section className="rvx-how" id="how"><div><span className="rvx-kicker">{t("FİNANS / TAHSİLAT NASIL İŞLER?")}</span><h2>{t("Ödemeden kayda,")}<br/>{t("her adımın karşılığı var.")}</h2></div><div className="rvx-steps"><article><b>01 /</b><h3>{t("Talebi paylaş.")}</h3><p>{t("Müşteri, iş referansı ve USDC tutarını kaydet. Ödeme bilgisi bağlantısını müşterine gönder.")}</p></article><article><b>02 /</b><h3>{t("Kanıtı doğrula.")}</h3><p>{t("Gelen ödemenin işlem hash’ini ekle. Carpan, Arc üzerindeki alıcıyı ve tutarı kontrol eder.")}</p></article><article><b>03 /</b><h3>{t("Eşleşmeyi onayla.")}</h3><p>{t("Ödemenin ilgili işe ait olduğunu onayla. Kısmi veya fazla ödemeleri incele, CSV olarak aktar.")}</p></article></div></section>
      <CarpanAccountingBranch/>
      <section className="rvx-join"><div><h2>{t("Arc’taki çalışma alanın.")}<br/>{t("Kaldığın yerden devam et.")}</h2><p>{t("Tahsilatların ve takip listen aynı hesapta.")}</p></div>{user ? <Link className="rvx-button primary" to="/settings?tab=profile">{t("Hesabıma git")}<ArrowUpRight size={17}/></Link> : <button className="rvx-button primary" onClick={()=>openLogin()}>{t("Carpan’a giriş yap")}<ArrowUpRight size={17}/></button>}</section>
      </div>
    </main>

  </div>;
}
