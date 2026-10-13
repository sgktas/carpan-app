import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import React, { createContext, useContext, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, LogOut, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import type { Project } from '../types';
import '../refvox-site.css';

const SiteUi = createContext({ openLogin: () => {} });
export const useSiteUi = () => useContext(SiteUi);

export function CarpanMark() {
  return null;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const openLogin = () => dialog.current?.showModal();

  const startXLogin = async () => {
    setLoginBusy(true);
    try {
      const result = await api.xOAuthStart('/projects');
      if ('authUrl' in result) window.location.assign(result.authUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("X girişi başlatılamadı."));
      setLoginBusy(false);
    }
  };

  return <SiteUi.Provider value={{ openLogin }}><div className="rv-site">
    <header className="top"><div className="wrap nav">
      <Link className="brand" to="/" aria-label={t("Carpan ana sayfa")}><CarpanMark />Carpan<span style={{ color: 'var(--teal)' }}>.</span></Link>
      <nav className="navlinks" aria-label={t("Ana menü")}>
        <Link to="/projects">{t("Keşfet")}</Link><a href="/#how">{t("Nasıl çalışır?")}</a>
        {user && <><Link to="/my-links">{t("Linklerim")}</Link><Link to="/saved">{t("Kaydedilenler")}</Link></>}
      </nav>
      <div className="navright">
        {user ? <><span className="rv-user">{user.authMethod === 'x' ? `@${user.xHandle}` : user.xDisplayName}</span><button className="rv-logout" onClick={async () => { await logout(); navigate('/'); }} aria-label={t("Çıkış yap")}><LogOut size={17}/></button></>
          : <button className="rv-login-link" onClick={openLogin}>{t("Giriş yap")}</button>}
        {user ? <Link className="btn small primary" to="/my-links">{t("Linkini paylaş")}<span className="arrow">↗</span></Link>
          : <button className="btn small primary" onClick={openLogin}>{t("Linkini paylaş")}<span className="arrow">↗</span></button>}
      </div>
    </div></header>
    {user?.isDemo && <div className="rv-demo">{t("Demo hesabı · Bu içerik ve tıklamalar gerçek kampanya veya ödeme değildir.")}</div>}
    {children}
    <footer className="footer"><div className="wrap footer-inner">
      <Link className="brand" to="/"><CarpanMark />Carpan<span style={{ color: 'var(--teal)' }}>.</span></Link>
      <p>{t("© 2026 Carpan · Yeni bağlantılar, yeni başlangıçlar.")}</p>
      <div className="footer-links"><a href="https://x.com/carpan_app" target="_blank" rel="noopener noreferrer">{translateText("Topluluk ↗")}</a><Link to="/projects">{t("Projeler")}</Link></div>
    </div></footer>
    <dialog ref={dialog} className="rv-dialog" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <button className="close" onClick={() => dialog.current?.close()} aria-label={t("Kapat")}><X size={20}/></button>
      <div className="kicker">{t("Topluluğa katıl")}</div><h2>{t("Seninle daha bağlantılı.")}</h2>
      <p>{t("Referans linkini ücretsiz paylaşmak ve projeleri kaydetmek için giriş yap.")}</p>
      <button className="btn primary" onClick={startXLogin} disabled={loginBusy}>{loginBusy ? t("Yönlendiriliyor…") : '𝕏  X ile devam et'}</button>
      <p className="fine">{t("Cüzdanla bağımsız giriş hazırlanıyor. X ile girişte cüzdan gerekmez.")}</p>
    </dialog>
    {user && <nav className="rv-mobile-nav" aria-label={t("Mobil gezinme")}>
      <Link to="/projects"><Search size={18}/>{t("Keşfet")}</Link><Link to="/my-links"><span style={{fontSize:20,lineHeight:18}}>⌁</span>{t("Linklerim")}</Link>
      <Link to="/saved"><Bookmark size={18}/>{t("Kaydedilenler")}</Link><Link to="/settings?tab=profile"><span style={{fontSize:20,lineHeight:18}}>◉</span>{t("Profil")}</Link>
    </nav>}
  </div></SiteUi.Provider>;
}

const covers = ['orbit-cover', 'luma-cover', 'nexus-cover'];
const symbols = ['◎', '✳', '≋'];

export function ProjectGallery({ projects, savedIds = [], onSave }: {
  projects: Project[]; savedIds?: string[]; onSave?: (project: Project) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'all' | 'new'>('all');
  const shown = projects.filter(project => `${project.name} ${project.description}`.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));
  if (sort === 'new') shown.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <>
    <div className="section-head"><div><div className="kicker">{t("Keşif alanın")}</div><h2>{t("Bir sonraki projen burada.")}</h2>
      <p>{t("İlgini çeken projeyi seç, koşullarını ve resmî adresini incele.")}</p></div>
      <label className="search"><Search size={17} aria-hidden="true"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t("Proje ara…")} aria-label={t("Proje ara")}/></label>
    </div>
    <div className="filters"><button className={`filter ${sort === 'all' ? 'active' : ''}`} onClick={() => setSort('all')}>{t("Tümü")}</button>
      <button className={`filter ${sort === 'new' ? 'active' : ''}`} onClick={() => setSort('new')}>{t("Yeni eklenenler")}</button>
      <span className="sample-note">{projects.length} {t("onaylı proje · Listeleme, proje ortaklığı anlamına gelmez")}</span>
    </div>
    {shown.length === 0 ? <div className="rv-empty"><strong>{projects.length ? t("Aramana uygun proje yok.") : t("Henüz yayınlanan proje yok.")}</strong><span>{projects.length ? t("Başka bir kelime dene.") : t("Onaylanan projeler burada görünecek.")}</span></div> :
      <div className="grid">{shown.map((project, index) => <article className="project" key={project.id}>
        <div className={`cover ${covers[index % covers.length]}`}>
          <span className="category">{project.isDemo ? translateText("DEMO PROJE") : t("TOPLULUK LİSTELEMESİ")}</span>
          {onSave && <button className="save" aria-label={`${project.name} projesini ${savedIds.includes(project.id) ? t("kayıtlardan çıkar") : 'kaydet'}`} aria-pressed={savedIds.includes(project.id)} onClick={() => onSave(project)}>{savedIds.includes(project.id) ? '♥' : '♡'}</button>}
          <div className="project-symbol" aria-hidden="true">{symbols[index % symbols.length]}</div>
        </div><div className="project-body"><div className="project-title"><h3>{project.name}</h3></div>
          <p>{project.description || t("{0} projesini keşfet.", [project.officialDomain])}</p>
          <div className="project-bottom"><span>{project.officialDomain}</span><Link to={`/projects/${encodeURIComponent(project.id)}`}>{translateText("Projeyi incele")}<span className="arrow">↗</span></Link></div>
        </div></article>)}</div>}
  </>;
}
