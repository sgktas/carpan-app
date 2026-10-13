import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowUpRight, Bell, Check, ExternalLink, LoaderCircle, Radio, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../api';
import { CarpanEmblem } from '../components/CarpanEmblem';
import { useAuth } from '../hooks/useAuth';
import type { ArcAddressActivity, ArcAddressProfile, ArcAddressTransfer } from '../types';
import './arc-radar.css';
import './arc-address.css';

const EXPLORER = 'https://explorer.arc.io';

function shortAddress(address: string) { return `${address.slice(0, 8)}…${address.slice(-6)}`; }

function timeLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
}

type Relationship = { address: string; sent: number; received: number; lastBlock: number; symbols: Set<string> };

function relationshipsFor(profile: ArcAddressProfile): Relationship[] {
  const subject = profile.address.toLowerCase();
  const map = new Map<string, Relationship>();
  const add = (from: string | null, to: string | null, block: number | null, symbol?: string | null) => {
    const fromAddress = from?.toLowerCase();
    const toAddress = to?.toLowerCase();
    if (!fromAddress || !toAddress || fromAddress === toAddress) return;
    const address = fromAddress === subject ? toAddress : toAddress === subject ? fromAddress : null;
    if (!address || !/^0x[0-9a-f]{40}$/i.test(address)) return;
    const relationship = map.get(address) || { address, sent: 0, received: 0, lastBlock: 0, symbols: new Set<string>() };
    if (fromAddress === subject) relationship.sent += 1;
    else relationship.received += 1;
    relationship.lastBlock = Math.max(relationship.lastBlock, block || 0);
    if (symbol) relationship.symbols.add(symbol);
    map.set(address, relationship);
  };

  const transferTransactions = new Set(profile.transfers.map(transfer => transfer.transactionHash.toLowerCase()));
  for (const transfer of profile.transfers) add(transfer.fromAddress, transfer.toAddress, transfer.blockNumber, transfer.tokenSymbol);
  // Contract-to-contract calls give contracts and new wallets useful graph edges even before token transfers exist.
  for (const activity of profile.transactions) {
    if (!transferTransactions.has(activity.transactionHash.toLowerCase())) {
      add(activity.fromAddress, activity.toAddress, activity.blockNumber);
    }
  }
  return [...map.values()].sort((left, right) =>
    (right.sent + right.received) - (left.sent + left.received) || right.lastBlock - left.lastBlock,
  ).slice(0, 8);
}

function RelationshipGraph({ relationships }: { relationships: Relationship[] }) {
  if (relationships.length === 0) return <div className="arc-address-empty">{t("Bu adres için Arc Explorer’dan bağlantı verisi gelmedi.")}</div>;
  const center = { x: 380, y: 150 };
  const points = relationships.map((relationship, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / relationships.length;
    return { relationship, x: center.x + Math.cos(angle) * 250, y: center.y + Math.sin(angle) * 86 };
  });

  return <svg className="arc-address-graph" viewBox="0 0 760 300" role="img" aria-label={t("Adresin son zincir etkileşim bağlantıları")}>
    <defs><radialGradient id="arc-address-hub"><stop stopColor="#ac98ef" stopOpacity=".28"/><stop offset="1" stopColor="#ac98ef" stopOpacity=".02"/></radialGradient></defs>
    <circle cx={center.x} cy={center.y} r="66" fill="url(#arc-address-hub)"/>
    {points.map(({ relationship, x, y }) => <line key={`edge-${relationship.address}`} x1={center.x} y1={center.y} x2={x} y2={y}
      stroke="#b9a8de" strokeOpacity=".55" strokeWidth={Math.min(4, 1 + (relationship.sent + relationship.received) / 2)}/>)}
    <circle cx={center.x} cy={center.y} r="31" fill="#4b3975" stroke="#ac98ef" strokeWidth="2"/>
    <text x={center.x} y={center.y + 4} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{translateText("BU ADRES")}</text>
    {points.map(({ relationship, x, y }) => <Link key={relationship.address} to={`/arc/addresses/${relationship.address}`}
      aria-label={`${shortAddress(relationship.address)} adresini incele`}>
      <title>{shortAddress(relationship.address)} · {relationship.sent} {t("gönderim ·")}{relationship.received} {t("alım")}</title>
      <circle cx={x} cy={y} r="28" fill="#f4efff" stroke="#947bc8" strokeWidth="1.5"/>
      <text x={x} y={y + 4} textAnchor="middle" fill="#483669" fontSize="9" fontWeight="700">{shortAddress(relationship.address)}</text>
      <text x={x} y={y + 43} textAnchor="middle" fill="#746a85" fontSize="9">{relationship.sent + relationship.received} {t("etkileşim")}</text>
    </Link>)}
  </svg>;
}

type TimelineItem = {
  transactionHash: string;
  fromAddress: string | null;
  toAddress: string | null;
  blockNumber: number | null;
  timestamp: string | null;
  label: string;
  detail: string;
};

function timelineFor(profile: ArcAddressProfile): TimelineItem[] {
  const transferItems = profile.transfers.map((transfer: ArcAddressTransfer) => ({
    transactionHash: transfer.transactionHash,
    fromAddress: transfer.fromAddress,
    toAddress: transfer.toAddress,
    blockNumber: transfer.blockNumber,
    timestamp: transfer.timestamp,
    label: `${transfer.tokenType || 'Token'} transferi`,
    detail: [transfer.amount, transfer.tokenSymbol].filter(Boolean).join(' ') || transfer.tokenName || 'Token hareketi',
  }));
  const transferHashes = new Set(transferItems.map(item => item.transactionHash));
  const transactionItems = profile.transactions.filter((item: ArcAddressActivity) => !transferHashes.has(item.transactionHash)).map(item => ({
    transactionHash: item.transactionHash,
    fromAddress: item.fromAddress,
    toAddress: item.toAddress,
    blockNumber: item.blockNumber,
    timestamp: item.timestamp,
    label: item.kind === 'contract_creation' ? t("Kontrat oluşturuldu") : item.method || t("Zincir işlemi"),
    detail: item.fromAddress && item.toAddress ? `${shortAddress(item.fromAddress)} → ${shortAddress(item.toAddress)}` : t("Arc Explorer işlem kaydı"),
  }));
  return [...transferItems, ...transactionItems].sort((left, right) =>
    (right.blockNumber || 0) - (left.blockNumber || 0),
  ).slice(0, 20);
}

export function ArcAddressPage() {
  const { address = '' } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ArcAddressProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followWorking, setFollowWorking] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await api.arcAddressProfile(address));
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Arc adres profili yüklenemedi."));
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => {
    setLoading(true);
    void loadProfile();
    const timer = window.setInterval(() => { void loadProfile(); }, 30000);
    return () => window.clearInterval(timer);
  }, [loadProfile]);

  useEffect(() => {
    let current = true;
    if (!user) { setIsFollowing(false); return () => { current = false; }; }
    void api.arcFollowing().then(rows => {
      if (current) setIsFollowing(rows.some(row => row.contractAddress.toLowerCase() === address.toLowerCase()));
    }).catch(() => { if (current) setIsFollowing(false); });
    return () => { current = false; };
  }, [address, user]);

  useEffect(() => {
    if (user && isFollowing) void api.markArcActivitySeen(address).catch(() => undefined);
  }, [address, isFollowing, user]);

  const toggleFollow = async () => {
    if (!user) {
      window.location.assign(`/?login=1&next=${encodeURIComponent(`/arc/addresses/${address}`)}`);
      return;
    }
    setFollowWorking(true);
    try {
      if (isFollowing) {
        await api.unfollowArcContract(address);
        setIsFollowing(false);
        toast.success(t("Adres takip listesinden çıkarıldı."));
      } else {
        await api.followArcContract(address);
        setIsFollowing(true);
        toast.success('Adres takip listene eklendi.');
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Adres takip edilemedi.');
    } finally { setFollowWorking(false); }
  };

  const relationships = useMemo(() => profile ? relationshipsFor(profile) : [], [profile]);
  const timeline = useMemo(() => profile ? timelineFor(profile) : [], [profile]);
  const title = profile?.name || (profile?.isContract ? t("Arc kontratı") : 'Arc adresi');

  return <div className="arc-radar arc-address-page">
    <header className="arc-radar-header"><div className="arc-radar-wrap arc-radar-nav">
      <Link to="/" className="arc-radar-brand"><CarpanEmblem size={34}/>Carpan</Link>
      <div className="arc-radar-nav-actions"><Link to="/arc" className="arc-radar-back"><Radio size={15}/> {t("Arc Terminali")}</Link></div>
    </div></header>
    <main className="arc-radar-wrap">
      <section className="arc-address-hero">
        <Link to="/arc" className="arc-radar-home"><ArrowLeft size={14}/> {t("Arc Terminali’ne dön")}</Link>
        <div className="arc-radar-eyebrow"><span className="arc-radar-live-dot"/> {t("CARPAN · ARC ADRES İNCELEMESİ")}</div>
        <h1>{title}</h1>
        <div className="arc-address-line"><code>{address}</code>
          <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noopener noreferrer" aria-label={t("Arc Explorer'da aç")}><ExternalLink size={15}/></a>
        </div>
        {profile && <div className="arc-address-follow-row">
          <button className={isFollowing ? 'is-following' : ''} onClick={() => void toggleFollow()} disabled={followWorking}>
            {followWorking ? <LoaderCircle size={15}/> : isFollowing ? <Check size={15}/> : <Bell size={15}/>}
            {followWorking ? 'Kaydediliyor…' : isFollowing ? 'Takip listende' : 'Bu adresi takip et'}
          </button>
          <span>{t("Yeni Arc işlemleri ve token hareketleri takip listene eklenir.")}</span>
        </div>}
        {profile && <div className="arc-address-pills">
          <span><Wallet size={14}/>{profile.isContract ? t("Akıllı kontrat") : t("Cüzdan adresi")}</span>
          {profile.token && <span>{profile.token.type}{profile.token.symbol ? ` · ${profile.token.symbol}` : ''}</span>}
          <span className={profile.sourceVerified ? 'is-verified' : ''}>
            {profile.sourceVerified === true ? <><Check size={13}/>{t("Kaynak kodu doğrulandı")}</>
              : profile.sourceVerified === false ? t("Kaynak kodu doğrulanmadı") : 'Kaynak kodu bilgisi yok'}
          </span>
          {profile.proxyType && <span>{profile.proxyType}</span>}
        </div>}
      </section>

      {loading && <div className="arc-radar-board arc-radar-loading"><LoaderCircle size={20}/> {t("Arc adres verisi yükleniyor…")}</div>}
      {error && <div className="arc-radar-error" role="alert">{error}</div>}

      {profile && <>
        <p className="arc-address-provenance">{t("Adres bilgileri Arc Explorer’dan, Carpan’un deployer bağlantıları ise indekslenen Arc bloklarından gelir. Kaynak kodu doğrulaması güvenlik denetimi anlamına gelmez.")}</p>
        <section className="arc-address-stats" aria-label={t("Adres özeti")}>
          <article><span>{t("Arc Explorer işlemleri")}</span><strong>{profile.transactionCount?.toLocaleString(getLocale()) ?? '—'}</strong></article>
          <article><span>{translateText("Token transferleri")}</span><strong>{profile.tokenTransferCount?.toLocaleString(getLocale()) ?? '—'}</strong></article>
          <article><span>{t("Carpan indeksindeki dağıtımları")}</span><strong>{profile.indexedDeploymentCount.toLocaleString(getLocale())}</strong></article>
        </section>

        {profile.isContract && <section className="arc-address-contract-cta">
          <div><span className="arc-radar-kicker">{t("KONTRAT PROFİLİ")}</span><strong>{t("Bu kontratın dağıtım kaydını ve izlenen olaylarını aç.")}</strong></div>
          <Link to={`/arc/contracts/${profile.address}`}>{t("Kontratı incele")}<ArrowUpRight size={15}/></Link>
        </section>}

        {profile.creatorAddress && <section className="arc-address-creator">
          <span>{t("Kontratı dağıtan adres")}</span><Link to={`/arc/addresses/${profile.creatorAddress}`}>{shortAddress(profile.creatorAddress)} <ArrowUpRight size={13}/></Link>
          {profile.creationTransactionHash && <a href={`${EXPLORER}/tx/${profile.creationTransactionHash}`} target="_blank" rel="noopener noreferrer">{t("Dağıtım işlemi")}<ExternalLink size={12}/></a>}
        </section>}

        <section className="arc-radar-board arc-address-graph-panel">
          <div className="arc-address-section-heading"><div><span className="arc-radar-kicker">{t("SON ETKİLEŞİMLERDEN")}</span><h2>{t("Adres bağlantıları")}</h2></div>
            <span>{t("Çizgiler son işlemlerdeki doğrudan etkileşimleri gösterir.")}</span></div>
          <RelationshipGraph relationships={relationships}/>
          {relationships.length > 0 && <div className="arc-address-peer-list">{relationships.map(item => <Link key={item.address} to={`/arc/addresses/${item.address}`}>
            <span>{shortAddress(item.address)}</span><small>{item.sent} {t("gönderim ·")}{item.received} {t("alım")}</small>
            {item.symbols.size > 0 && <small>{[...item.symbols].slice(0, 2).join(', ')}</small>}<ArrowUpRight size={14}/>
          </Link>)}</div>}
        </section>

        {profile.indexedDeployments.length > 0 && <section className="arc-radar-board arc-address-deployments">
          <div className="arc-address-section-heading"><div><span className="arc-radar-kicker">{t("CARPAN ARC İNDEKSİ")}</span><h2>{t("Bu adresin dağıttığı kontratlar")}</h2></div>
            <span>{t("İndeksin kapsadığı blok aralığındaki kayıtlar")}</span></div>
          <div className="arc-address-deployment-list">{profile.indexedDeployments.map(item => <Link key={item.contractAddress} to={`/arc/contracts/${item.contractAddress}`}>
            <span><strong>{shortAddress(item.contractAddress)}</strong><small>{t("Blok")}{item.blockNumber.toLocaleString(getLocale())} · {timeLabel(item.deployedAt)}</small></span>
            <ArrowUpRight size={15}/>
          </Link>)}</div>
        </section>}

        <section className="arc-radar-board arc-address-activity">
          <div className="arc-address-section-heading"><div><span className="arc-radar-kicker">{translateText("ARC EXPLORER KAYITLARI")}</span><h2>{t("Son işlemler")}</h2></div>
            <span>{profile.transfers.length ? t("Transferler ve işlemler") : t("İşlemler")}</span></div>
          {timeline.length === 0 ? <div className="arc-address-empty">{t("Bu adres için listelenecek yakın tarihli işlem bulunamadı.")}</div>
            : <div className="arc-address-timeline">{timeline.map((item, index) => <a key={`${item.transactionHash}-${index}`}
              href={`${EXPLORER}/tx/${item.transactionHash}`} target="_blank" rel="noopener noreferrer">
              <span className="arc-address-timeline-icon"><Activity size={15}/></span>
              <span className="arc-address-timeline-main"><strong>{item.label}</strong><small>{item.detail}</small>
                <small>{item.fromAddress && item.toAddress ? `${shortAddress(item.fromAddress)} → ${shortAddress(item.toAddress)}` : item.transactionHash}</small></span>
              <span className="arc-address-timeline-meta"><small>{item.blockNumber ? t("Blok {0}", [item.blockNumber.toLocaleString(getLocale())]) : ''}</small><time>{timeLabel(item.timestamp)}</time></span>
              <ArrowUpRight size={14}/>
            </a>)}</div>}
        </section>
      </>}
      
    </main>
  </div>;
}
