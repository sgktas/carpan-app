import {usePageLoading} from '../hooks/usePageLoading';
import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowUpRight, Bell, Check, ExternalLink, Layers, LoaderCircle, Radio, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { CarpanEmblem } from '../components/CarpanEmblem';
import { ArcTerminalArt } from '../components/ArcTerminalArt';
import { ArcTerminalHeader } from '../components/ArcTerminalHeader';
import { useAuth } from '../hooks/useAuth';
import type { ArcContractEvent, ArcContractProfile } from '../types';
import './arc-radar.css';
import './arc-contract.css';
import './arc-wallet.css';
import './arc-terminal-v2.css';
import './arc-terminal-v3.css';

const EXPLORER = 'https://explorer.arc.io';

function shortAddress(value: string) { return `${value.slice(0, 8)}…${value.slice(-6)}`; }
function timeLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}

function eventLabel(event: ArcContractEvent) {
  if (event.kind === 'transfer') return event.tokenId ? 'NFT transferi' : t("Transfer");
  if (event.kind === 'approval') return 'Onay';
  if (event.kind === 'ownership') return t("Sahiplik değişimi");
  return t("Kontrat olayı");
}

export function ArcContractPage() {
  const { address = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ArcContractProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  usePageLoading(loading&&!profile);
  const loadProfile = useCallback(async () => {
    try {
      const result = await api.arcContractProfile(address);
      setProfile(result);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Kontrat bilgisi yüklenemedi."));
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => {
    setLoading(true);
    void loadProfile();
    const timer = window.setInterval(() => { void loadProfile(); }, 30000);
    return () => window.clearInterval(timer);
  }, [loadProfile]);

  const toggleFollow = async () => {
    if (!user) {
      navigate(`/?login=1&next=${encodeURIComponent(`/arc/contracts/${address}`)}`);
      return;
    }
    if (!profile) return;
    setWorking(true);
    try {
      if (profile.isFollowing) await api.unfollowArcContract(address);
      else await api.followArcContract(address);
      await loadProfile();
      toast.success(profile.isFollowing ? t("Kontrat takipten çıkarıldı.") : t("Kontrat takibe alındı."));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Takip işlemi tamamlanamadı."));
    } finally { setWorking(false); }
  };

  const markSeen = async () => {
    try {
      await api.markArcActivitySeen(address);
      await loadProfile();
      toast.success(t("Yeni olaylar görüldü işaretlendi."));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Olaylar güncellenemedi."));
    }
  };

  return <div className="arc-radar arc-contract-page aw-terminal aw-terminal-v3 carpan-data-workspace">
    <ArcTerminalHeader active="contracts"/>
    <div className="aw-shell"><nav className="aw-sidebar" aria-label={t("Arc Terminal modülleri")}><span>{t("Araştırma")}</span><Link to={`/arc/contracts/${address}`} aria-current="page"><Layers size={16}/>{translateText("Kontrat profili")}</Link><Link to={`/arc/addresses/${address}`}><Wallet size={16}/>{translateText("Adres analizi")}</Link><Link to="/arc"><Activity size={16}/>{t("Yeni dağıtımlar")}</Link><span>{t("Keşfet")}</span><Link to="/arc"><Radio size={16}/>{t("Arc keşfi")}</Link><Link to="/#discover"><Layers size={16}/>{t("Projeler")}</Link><div className="aw-side-note"><CarpanEmblem size={30}/><strong>{t("Zincirde olanı keşfet.")}</strong><p>{t("Projeler, cüzdanlar ve bağlantılar. Tek araştırma alanında.")}</p><span><i/>{translateText("Salt okunur · Arc")}</span></div></nav>
    <main className="aw-main"><div className="aw-rail"><span><Link to="/arc">Arc Terminal</Link><span>/</span>{translateText("Kontrat profili")}</span><Link to={`/arc/addresses/${address}`}>{t("Adres analizini aç ↗")}</Link></div>
      <section className="arc-contract-hero">
        <ArcTerminalArt/>
        <span className="arc-radar-kicker">{t("ARC MAINNET · KONTRAT PROFİLİ")}</span>
        <h1>{profile?.name || t('Kontrat incelemesi')}</h1>
        <div className="arc-contract-address-line"><code>{address}</code><a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer" aria-label={t("Arc Explorer'da aç")}><ExternalLink size={16}/></a></div>
        {profile && <div className="arc-contract-actions">
          <button onClick={() => void toggleFollow()} disabled={working} className={profile.isFollowing ? 'is-following' : ''}>
            {working ? <LoaderCircle size={16}/> : profile.isFollowing ? <Check size={16}/> : <Bell size={16}/>}
            {profile.isFollowing ? translateText("Takip ediliyor") : t("Kontratı takip et")}
          </button>
          {profile.token && <span className="arc-contract-pill">{profile.token.type}{profile.token.symbol ? ` · ${profile.token.symbol}` : ''}</span>}
          <span className={`arc-contract-pill ${profile.sourceVerified ? 'verified' : ''}`}>
            {profile.sourceVerified === true ? t("Kaynak kodu doğrulandı")
              : profile.sourceVerified === false ? t("Kaynak kodu doğrulanmadı") : t('Kaynak bilgisi bekleniyor')}
          </span>
        </div>}
      </section>

      {loading && <div className="arc-radar-board arc-radar-loading"><LoaderCircle size={20}/> {t("Kontrat bilgisi yükleniyor…")}</div>}
      {error && <div className="arc-radar-error" role="alert">{error}</div>}
      {profile && <>
        <p className="arc-contract-context">{t("Bilgiler Arc zinciri ve Arc Explorer kayıtlarından alınır. Kaynak kodu doğrulaması veya bir proje kaydı, kontratın güvenli olduğunu göstermez.")}</p>
        <div className="arc-contract-grid">
          <section className="arc-radar-board arc-contract-panel">
            <span className="arc-radar-kicker">{t("ZİNCİR KAYDI")}</span><h2>{translateText("Kontrat bilgileri")}</h2>
            <dl>
              <div><dt>{t("Oluşturan")}</dt><dd>{profile.deployerAddress ? <a href={`${EXPLORER}/address/${profile.deployerAddress}`} target="_blank" rel="noopener noreferrer">{shortAddress(profile.deployerAddress)} <ArrowUpRight size={13}/></a> : t("Henüz bulunamadı")}</dd></div>
              <div><dt>{t("Oluşturma işlemi")}</dt><dd>{profile.deploymentTransactionHash ? <a href={`${EXPLORER}/tx/${profile.deploymentTransactionHash}`} target="_blank" rel="noopener noreferrer">{t("İşlemi aç")}<ArrowUpRight size={13}/></a> : t("Henüz bulunamadı")}</dd></div>
              <div><dt>{t("İlk taranan blok")}</dt><dd>{profile.deploymentBlock?.toLocaleString(getLocale()) || '—'}</dd></div>
              <div><dt>{t("Dağıtım zamanı")}</dt><dd>{timeLabel(profile.deployedAt)}</dd></div>
              <div><dt>{t("Takipçi")}</dt><dd>{profile.followerCount.toLocaleString(getLocale())}</dd></div>
              {profile.proxyType && <div><dt>{t("Proxy türü")}</dt><dd>{profile.proxyType}</dd></div>}
            </dl>
            {profile.token && <dl className="arc-contract-token">
              <div><dt>{t("Token adı")}</dt><dd>{profile.token.name || '—'}</dd></div>
              <div><dt>{translateText("Sembol")}</dt><dd>{profile.token.symbol || '—'}</dd></div>
              <div><dt>{t("Sahip sayısı")}</dt><dd>{profile.token.holdersCount || '—'}</dd></div>
            </dl>}
          </section>
          <section className="arc-radar-board arc-contract-panel">
            <span className="arc-radar-kicker">{t("PROJE BAĞLANTISI")}</span><h2>{t("Carpan bağlamı")}</h2>
            {profile.linkedProject ? <div className="arc-contract-project">
              <strong>{profile.linkedProject.name}</strong>
              <p>{profile.linkedProject.description}</p>
              <span>{profile.linkedProject.officialDomain}</span>
              <Link to={`/ecosystem/${profile.linkedProject.id}`}>{t("Proje ve kaynakları incele")}<ArrowUpRight size={14}/></Link>
            </div> : <div className="arc-contract-no-project">
              <p>{t("Bu adres için kaynak incelemesinden geçmiş bir proje bağlantısı henüz yok.")}</p>
              <Link to="/projects">{t("Proje öner")}<ArrowUpRight size={14}/></Link>
            </div>}
          </section>
        </div>
        <section className="arc-radar-board arc-contract-activity">
          <div className="arc-radar-feed-heading"><div><span className="arc-radar-kicker">{t("TAKİP EDİLEN ZİNCİR OLAYLARI")}</span><h2>{translateText("Son hareketler")}</h2></div>
            {profile.isFollowing && profile.unreadEvents > 0 && <button className="arc-radar-refresh" onClick={() => void markSeen()}>{t("Yeni olayları gördüm")}</button>}
          </div>
          {profile.events.length ? <div className="arc-contract-events">{profile.events.map(event => <a key={`${event.transactionHash}-${event.logIndex}`}
            href={`${EXPLORER}/tx/${event.transactionHash}`} target="_blank" rel="noopener noreferrer" className="arc-contract-event">
            <span className="arc-contract-event-icon"><Activity size={16}/></span><span className="arc-contract-event-main"><strong>{eventLabel(event)}</strong>
              <small>{event.fromAddress && event.toAddress ? `${shortAddress(event.fromAddress)} → ${shortAddress(event.toAddress)}` : t("Blok {0}", [event.blockNumber.toLocaleString(getLocale())])}</small>
              {event.amount && <small>{event.amount}{profile.token?.symbol ? ` ${profile.token.symbol}` : ''}</small>}
              {event.tokenId && <small>Token #{event.tokenId}</small>}</span>
            <time>{timeLabel(event.timestamp)}</time><ArrowUpRight size={15}/>
          </a>)}</div> : <div className="arc-radar-empty"><Activity size={27}/><strong>{t("Henüz izlenen olay yok")}</strong><span>{t("Yeni olaylar, bir kullanıcı bu kontratı takibe aldıktan sonra kaydedilir.")}</span></div>}
        </section>
      </>}
      
    </main></div>
  </div>;
}


