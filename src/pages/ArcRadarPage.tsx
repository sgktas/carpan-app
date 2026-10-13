import {usePageLoading,withPageLoading} from '../hooks/usePageLoading';
import {CarpanPageLoading} from '../components/CarpanLoadingOverlay';
import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Activity, ArrowUpRight, Bell, Check, ExternalLink, LoaderCircle,
  Plus, RefreshCw, Search, Tags, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ArcTerminalHeader } from '../components/ArcTerminalHeader';
import { ArcDiscovery, ArcTokenModule } from '../components/ArcDiscovery';
import {ArcAlerts} from '../components/ArcAlerts';
import {ArcFlowMap} from '../components/ArcFlowMap';
import {ChainResearch} from '../components/ChainResearch';
import { useAuth } from '../hooks/useAuth';
import {useVisiblePolling} from '../hooks/useVisiblePolling';
import { api } from '../api';
import type { ArcDeployment, ArcFollowedContract, ArcIndexerStatus, ArcVerifiedContract } from '../types';
import './arc-radar.css';
import './arc-wallet.css';
import './arc-terminal-v2.css';
import './arc-terminal-v3.css';

const EXPLORER = 'https://explorer.arc.io';
const ArcBridge=lazy(()=>Promise.resolve().then(()=>withPageLoading(()=>import('../components/ArcBridge').then(m=>({default:m.ArcBridge})))));
const PAGE_SIZE = 25;

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function isEvmAddress(value: string) {
  return /^0x[0-9a-f]{40}$/i.test(value);
}

function timeLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ArcRadarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const loginPath = `/?login=1&next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
  const [params]=useSearchParams();
  const [view,setView]=useState(()=>['overview','contracts','verified','following','labels','token','alerts','flow','explorer','bridge'].includes(params.get('view')||'')?params.get('view')!:'overview');
  const [tab, setTab] = useState<'new' | 'verified' | 'following'>('new');
  const [status, setStatus] = useState<ArcIndexerStatus | null>(null);
  const [deployments, setDeployments] = useState<ArcDeployment[]>([]);
  const [verified, setVerified] = useState<ArcVerifiedContract[]>([]);
  const [verifiedLoading, setVerifiedLoading] = useState(false);
  const [verifiedError, setVerifiedError] = useState('');
  const verifiedLoaded=useRef(false);
  const [following, setFollowing] = useState<ArcFollowedContract[]>([]);
  const [followingLoading,setFollowingLoading]=useState(false),[followingLoaded,setFollowingLoaded]=useState(false);
  const currentUser=useRef(user?.id);currentUser.current=user?.id;
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  usePageLoading((loading&&['overview','contracts'].includes(view))||(['overview','verified'].includes(view)&&verifiedLoading&&!verifiedLoaded.current)||(view==='following'&&followingLoading&&!followingLoaded));
  const [hasMore, setHasMore] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [workingAddress, setWorkingAddress] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [addressError, setAddressError] = useState('');

  const loadStatus = useCallback(async () => {
    try { setStatus(await api.arcStatus()); }
    catch { /* Keep the last successful network status visible. */ }
  }, []);

  const loadFollowing = useCallback(async () => {
    if (!user) { setFollowing([]);setFollowingLoaded(false);setFollowingLoading(false); return; }
    const owner=user.id;setFollowingLoading(true);
    try {
      const rows = await api.arcFollowing();
      if(currentUser.current!==owner)return;
      setError('');
      setFollowing(rows);
      setFollowingLoaded(true);
    } catch (caught) {
      if(currentUser.current===owner)setError(caught instanceof Error ? caught.message : t("Takip listen yüklenemedi."));
    }finally{if(currentUser.current===owner)setFollowingLoading(false);}
  }, [user?.id]);

  const loadDeployments = useCallback(async (term: string) => {
    try {
      const rows = await api.arcDeployments({ limit: PAGE_SIZE, q: term });
      setError('');
      setDeployments(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Arc akışı yüklenemedi."));
    }
  }, []);

  const loadVerified = useCallback(async () => {
    setVerifiedLoading(true);
    try {
      setVerified(await api.arcVerifiedContracts());
      setVerifiedError('');
    } catch (caught) {
      setVerifiedError(caught instanceof Error ? caught.message : t("Doğrulanmış kontratlar yüklenemedi."));
    } finally { verifiedLoaded.current=true;setVerifiedLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if(!['overview','contracts'].includes(view)){setLoading(false);if(view==='alerts')void loadStatus();return;}
    let current = true;
    setLoading(true);
    setError('');
    Promise.all([api.arcStatus(), api.arcDeployments({ limit: PAGE_SIZE, q: search })])
      .then(([nextStatus, rows]) => {
        if (!current) return;
        setError('');
        setStatus(nextStatus);
        setDeployments(rows);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(caught => {
        if (current) setError(caught instanceof Error ? caught.message : t("Arc akışı yüklenemedi."));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [search,view,loadStatus]);

  useEffect(() => {setFollowing([]);setFollowingLoaded(false);void loadFollowing();}, [loadFollowing]);
  useEffect(() => { if (view==='verified'||view==='overview') void loadVerified(); }, [view,loadVerified]);
  useEffect(()=>{const next=params.get('view')||'overview';setView(['overview','contracts','verified','following','labels','token','alerts','flow','explorer','bridge'].includes(next)?next:'overview');setTab(next==='verified'?'verified':next==='following'?'following':'new');setQuery(params.get('q')||'');},[params]);

  useVisiblePolling(()=>{
    void loadStatus();
    if(view==='overview'||view==='contracts')void loadDeployments(search);
    else if(view==='verified')void loadVerified();
    else if(view==='following')void loadFollowing();
  },15000,['overview','contracts','verified','following','alerts'].includes(view)&&!loading&&!moreLoading&&!verifiedLoading&&!followingLoading&&(view!=='contracts'||deployments.length<=PAGE_SIZE));

  const followingAddresses = useMemo(
    () => new Set(following.map(item => item.contractAddress.toLowerCase())), [following],
  );
  const unreadFollowingCount = useMemo(
    () => following.reduce((total, item) => total + item.unreadEvents, 0), [following],
  );

  const handleFollow = async (address: string) => {
    if (!user) {
      navigate(loginPath);
      return;
    }
    setWorkingAddress(address);
    try {
      if (followingAddresses.has(address.toLowerCase())) {
        await api.unfollowArcContract(address);
        toast.success(t("Kontrat takip listesinden çıkarıldı."));
      } else {
        await api.followArcContract(address);
        toast.success(t('Kontrat takip listene eklendi.'));
      }
      await Promise.all([loadFollowing(), loadDeployments(search)]);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Takip işlemi tamamlanamadı."));
    } finally { setWorkingAddress(''); }
  };

  const addManualContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      navigate(loginPath);
      return;
    }
    setWorkingAddress(manualAddress);
    try {
      await api.followArcContract(manualAddress.trim());
      setManualAddress('');
      setTab('following');
      await loadFollowing();
      toast.success(t('Kontrat takip listene eklendi.'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('Kontrat takip edilemedi.'));
    } finally { setWorkingAddress(''); }
  };

  const loadMore = async () => {
    setMoreLoading(true);
    try {
      const rows = await api.arcDeployments({ limit: PAGE_SIZE, offset: deployments.length, q: search });
      setDeployments(current => [...current, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t("Daha fazla kontrat yüklenemedi."));
    } finally { setMoreLoading(false); }
  };

  return <div className="arc-radar aw-terminal aw-terminal-v3 at-home carpan-data-workspace">
    <ArcTerminalHeader active={view}/>
    <main className={view==='overview'?'at-root-main':'at-root-main at-module-main'}>
      {view==='overview'?<ArcDiscovery deployments={deployments} verified={verified} deploymentLoading={loading} deploymentError={error} verifiedLoading={verifiedLoading} verifiedError={verifiedError} lagBlocks={status?.lagBlocks||0}/>:
        view==='explorer'?<ChainResearch/>:
        view==='flow'?<ArcFlowMap/>:
        view==='bridge'?<Suspense fallback={<CarpanPageLoading/>}><ArcBridge/></Suspense>:
        view==='token'?<ArcTokenModule/>:
        view==='alerts'?<ArcAlerts lagBlocks={status?.lagBlocks??undefined} indexLive={status?.live}/>:
        view==='labels'?<section className="at-label-module"><Tags size={30}/><h1>{t("Özel adres etiketleri")}</h1><p>{t("Bir cüzdan veya kontrat aç, yalnızca hesabında görünen bir isim ver.")}</p><form className="at-module-search" onSubmit={event=>{event.preventDefault();if(!isEvmAddress(addressQuery.trim())){setAddressError(t("0x ile başlayan geçerli bir adres gir."));return;}navigate(`/arc/addresses/${addressQuery.trim().toLowerCase()}?module=labels`);}}><Search size={18}/><input aria-label="Etiketlenecek adres" placeholder="0x…" value={addressQuery} onChange={event=>{setAddressQuery(event.target.value);setAddressError('');}}/><button type="submit">{t("Adresi aç")}<ArrowUpRight size={16}/></button></form>{addressError&&<p role="alert">{addressError}</p>}</section>:
      <section className="arc-radar-board" aria-label={t("Arc kontrat radarı")}>
        <div className="arc-radar-toolbar">
          {tab==='following'?<Link className="at-context-link" to="/arc">{t("Keşfe dön")}<ArrowUpRight size={15}/></Link>:<div className="arc-radar-tabs" role="tablist" aria-label={t("Kontrat akışı")}>
            <button role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'active' : ''} onClick={() => navigate('/arc?view=contracts')}>
              <Activity size={16}/> {t("Yeni dağıtımlar")}</button>
            <button role="tab" aria-selected={tab === 'verified'} className={tab === 'verified' ? 'active' : ''} onClick={() => navigate('/arc?view=verified')}>
              <Check size={16}/> {t("Kodu doğrulananlar")}</button>
          </div>}
          {tab === 'new' && <label className="arc-radar-search"><Search size={16}/>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Kontrat veya deployer ara" aria-label="Kontrat veya deployer ara"/>
          </label>}
        </div>

        {tab === 'new' ? <div className="arc-radar-feed">
          <div className="arc-radar-feed-heading"><div><span className="arc-radar-kicker">{t("ZİNCİRDEN CANLI VERİ")}</span><h2>{translateText("Son indekslenen kontratlar")}</h2></div>
            <button className="arc-radar-refresh" onClick={() => { void loadStatus(); void loadDeployments(search); }} aria-label={t("Akışı yenile")}><RefreshCw size={16}/> {t("Yenile")}</button>
          </div>
          {!!status?.lagBlocks&&<p className="arc-radar-small-note">{t("Kontrat indeksi geçmişi tamamlıyor ·")}{status.lagBlocks.toLocaleString(getLocale())} {translateText("blok geride.")}</p>}<details className="arc-radar-coverage"><summary>{t("Akış kapsamı · doğrudan kontrat dağıtımları")}</summary><p>{t("Fabrika içinde oluşturulan kontratlar bu akışa dahil değildir. Bir dağıtım kaydı, projenin güvenli veya doğrulanmış olduğunu göstermez.")}</p></details>
          {isEvmAddress(search) && <Link className="arc-radar-address-shortcut" to={`/arc/addresses/${search}`}>
            <span><strong>{t("Bu adresin profilini aç")}</strong><small>{t("İşlemlerini, bağlantılarını ve dağıttığı kontratları incele")}</small></span>
            <ArrowUpRight size={17}/>
          </Link>}
          {error && <div className="arc-radar-error" role="alert">{error}</div>}
          {loading ? <div className="arc-radar-loading"><LoaderCircle size={21}/> {t("Arc blokları yükleniyor…")}</div>
            : error && deployments.length === 0 ? null : deployments.length === 0 ? <div className="arc-radar-empty"><Activity size={27}/>
              <strong>{search ? t("Eşleşen kontrat yok") : status?.live ? t("Henüz yeni dağıtım görünmüyor") : t("Canlı akış bağlanıyor")}</strong>
              <span>{search ? t("Farklı bir adresle yeniden ara.") : t("İndeksleyici çalıştığında yeni Arc dağıtımları burada belirecek.")}</span>
            </div>
            : <div className="arc-radar-list">{deployments.map(deployment => <DeploymentCard
              key={`${deployment.chainId}-${deployment.contractAddress}`}
              deployment={deployment}
              isFollowing={followingAddresses.has(deployment.contractAddress.toLowerCase()) || deployment.isFollowing}
              working={workingAddress.toLowerCase() === deployment.contractAddress.toLowerCase()}
              onFollow={() => void handleFollow(deployment.contractAddress)}
            />)}</div>}
          {hasMore && !loading && <button className="arc-radar-more" onClick={() => void loadMore()} disabled={moreLoading}>
            {moreLoading ? <LoaderCircle size={15}/> : null}{moreLoading ? t("Yükleniyor…") : t("Daha fazla kontrat göster")}
          </button>}
        </div> : tab === 'verified' ? <div className="arc-radar-feed">
          <div className="arc-radar-feed-heading"><div><span className="arc-radar-kicker">{translateText("ARC EXPLORER KAYITLARI")}</span><h2>{t("Yeni doğrulanan kodlar")}</h2></div>
            <button className="arc-radar-refresh" onClick={() => void loadVerified()}><RefreshCw size={16}/> {t("Yenile")}</button>
          </div>
          <div className="arc-radar-coverage">{t("Buradaki sıralama kontratın dağıtım tarihine değil, kaynak kodunun Arc Explorer’da doğrulandığı tarihe göredir. Kod doğrulaması güvenlik denetimi anlamına gelmez.")}</div>
          {verifiedError && <div className="arc-radar-error" role="alert">{verifiedError}</div>}
          {verifiedLoading && verified.length === 0 ? <div className="arc-radar-loading"><LoaderCircle size={21}/> {t("Doğrulanmış kontratlar yükleniyor…")}</div>
            : verifiedError && verified.length === 0 ? null : verified.length === 0 ? <div className="arc-radar-empty"><Check size={27}/><strong>{t("Henüz kayıt görünmüyor")}</strong><span>{t("Arc Explorer verisi geldiğinde burada listelenecek.")}</span></div>
              : <div className="arc-radar-list">{verified.map(item => <VerifiedCard key={item.contractAddress} item={item}/>)}</div>}
        </div> : <div className="arc-radar-feed">
          <div className="arc-radar-feed-heading"><div><span className="arc-radar-kicker">{t("KİŞİSEL ADRES AKIŞIN")}</span><h2>{t("Takip listem")}{user&&following.length>0&&<span className="arc-radar-count">{following.length}</span>}{user&&unreadFollowingCount>0&&<span className="arc-radar-count arc-radar-count-alert">{unreadFollowingCount>99?'99+':unreadFollowingCount}</span>}</h2></div>
            <span className="arc-radar-small-note">{t("Yeni işlemler ve token hareketleri blok geldikçe görünür.")}</span>
          </div>
          {!user ? <div className="arc-radar-login-prompt"><Bell size={25}/><strong>{t("Takip listeni Carpan hesabına kaydet.")}</strong>
            <span>{t("Arc adreslerini incelemek ücretsiz; takip listen hesabına kaydedilir.")}</span>
            <Link to={loginPath}>{t("Giriş yap")}<ArrowUpRight size={15}/></Link>
          </div> : <>
            <form className="arc-radar-add-form" onSubmit={addManualContract}>
              <label htmlFor="arc-watch-address">{t("Cüzdan veya kontrat adresi ekle")}</label>
              <div><input id="arc-watch-address" value={manualAddress} onChange={event => setManualAddress(event.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off"/>
                <button type="submit" disabled={!manualAddress.trim() || Boolean(workingAddress)}><Plus size={15}/> {translateText("Takibe al")}</button>
              </div>
              <small>{t("Yeni işlemleri ve ERC-20 token hareketlerini izle. En fazla 100 adres ekleyebilirsin.")}</small>
            </form>
            {error && <div className="arc-radar-error" role="alert">{error}</div>}
            {!followingLoaded?<div className="arc-radar-empty" role="status"><strong>{followingLoading?t('Takip listen yükleniyor…'):t('Takip listen yüklenemedi.')}</strong>{!followingLoading&&<button className="aw-text" type="button" onClick={()=>void loadFollowing()}>{t('Yeniden dene')}</button>}</div>:following.length === 0 ? <div className="arc-radar-empty"><Bell size={27}/><strong>{t("Takip listen boş")}</strong>
              <span>{t("Yeni dağıtımları keşfet veya bir adres profiline gidip takip listene ekle.")}</span>
              <button onClick={() => navigate('/arc?view=contracts')}>{t("Yeni dağıtımları keşfet")}<ArrowUpRight size={15}/></button>
            </div> : <div className="arc-radar-list">{following.map(item => <FollowingCard
              key={`${item.chainId}-${item.contractAddress}`}
              item={item}
              working={workingAddress.toLowerCase() === item.contractAddress.toLowerCase()}
              onRemove={() => void handleFollow(item.contractAddress)}
            />)}</div>}
          </>}
        </div>}
      </section>

      }
      
      {['overview','contracts','verified','following','alerts'].includes(view)&&<div className="at-footer"><span>{t("ARC KONTRAT İNDEKSİ ·")}{status?.lastProcessedBlock?t("BLOK {0}", [status.lastProcessedBlock.toLocaleString(getLocale())]):t("BAĞLANIYOR")}</span></div>}
    </main>
  </div>;
}

function DeploymentCard({ deployment, isFollowing, working, onFollow }: {
  deployment: ArcDeployment; isFollowing: boolean; working: boolean; onFollow: () => void;
}) {
  return <article className="arc-radar-card">
    <div className="arc-radar-card-top"><span className="arc-radar-deploy-tag"><span/>{t("Doğrudan dağıtım")}</span><time>{timeLabel(deployment.deployedAt)}</time></div>
    <div className="arc-radar-address-row"><Link to={`/arc/contracts/${deployment.contractAddress}`} className="arc-radar-address">{deployment.contractAddress}</Link>
      <a className="arc-radar-explorer" href={`${EXPLORER}/tx/${deployment.transactionHash}`} target="_blank" rel="noopener noreferrer" aria-label={t("Dağıtım işlemini explorer'da aç")}><ExternalLink size={14}/></a>
    </div>
    <div className="arc-radar-meta"><span>{t("Dağıtan")}<Link to={`/arc/addresses/${deployment.deployerAddress}`}>{shortAddress(deployment.deployerAddress)}</Link></span>
      <span>{t("Blok")}{deployment.blockNumber.toLocaleString(getLocale())}</span><span>{deployment.followerCount} {t("takipçi")}</span></div>
    <div className="arc-radar-card-bottom"><a href={`${EXPLORER}/tx/${deployment.transactionHash}`} target="_blank" rel="noopener noreferrer">{t("Dağıtım kaydı")}<ArrowUpRight size={13}/></a>
      <button className={isFollowing ? 'following' : ''} onClick={onFollow} disabled={working}>
        {working ? <LoaderCircle size={14}/> : isFollowing ? <><Check size={14}/> {translateText("Takip ediliyor")}</> : <><Bell size={14}/> {translateText("Takip et")}</>}
      </button>
    </div>
  </article>;
}

function VerifiedCard({ item }: { item: ArcVerifiedContract }) {
  return <article className="arc-radar-card">
    <div className="arc-radar-card-top"><span className="arc-radar-deploy-tag"><span/>{t("Kaynak kodu doğrulandı")}</span><time>{timeLabel(item.verifiedAt)}</time></div>
    <div className="arc-radar-address-row"><Link to={`/arc/contracts/${item.contractAddress}`} className="arc-radar-verified-name">{item.name || shortAddress(item.contractAddress)}</Link>
      <a className="arc-radar-explorer" href={`${EXPLORER}/address/${item.contractAddress}?tab=contract`} target="_blank" rel="noopener noreferrer" aria-label={t("Doğrulanmış kodu explorer'da aç")}><ExternalLink size={14}/></a>
    </div>
    <div className="arc-radar-meta"><span>{shortAddress(item.contractAddress)}</span>
      {item.language && <span>{item.language}</span>}
      {item.transactionCount !== null && <span>{item.transactionCount} {t("işlem")}</span>}
      {item.proxyType && <span>Proxy · {item.proxyType}</span>}</div>
    <div className="arc-radar-card-bottom"><Link to={`/arc/contracts/${item.contractAddress}`}>{t("Kontratı incele")}<ArrowUpRight size={13}/></Link></div>
  </article>;
}

function FollowingCard({ item, working, onRemove }: {
  item: ArcFollowedContract; working: boolean; onRemove: () => void;
}) {
  return <article className="arc-radar-card">
    <div className="arc-radar-card-top"><span className="arc-radar-deploy-tag"><span/>{translateText("Adres takibinde")}</span><time>{translateText("Eklenme")}{timeLabel(item.followedAt)}</time></div>
    <div className="arc-radar-address-row"><Link to={`/arc/addresses/${item.contractAddress}`} className="arc-radar-address">{item.privateLabel || item.contractAddress}</Link>
      <a className="arc-radar-explorer" href={`${EXPLORER}/address/${item.contractAddress}`} target="_blank" rel="noopener noreferrer" aria-label={t("Adresi explorer'da aç")}><ExternalLink size={14}/></a>
    </div>
    <div className="arc-radar-meta"><span>{item.deployerAddress ? <>{t("Dağıtan")}<Link to={`/arc/addresses/${item.deployerAddress}`}>{shortAddress(item.deployerAddress)}</Link></> : t("Dağıtım geçmişi henüz indekslenmedi")}</span>
      {item.latestActivityBlock ? <span className="arc-radar-new-events"><Activity size={13}/>{item.unreadEvents ? t('{0} yeni olay',[item.unreadEvents]) : t('Son olay · blok {0}',[item.latestActivityBlock.toLocaleString(getLocale())])}</span>
        : <span>{t("Yeni zincir olayı bekleniyor")}</span>}</div>
    <div className="arc-radar-card-bottom"><Link to={`/arc/addresses/${item.contractAddress}`}>{t("Adres profilini aç")}<ArrowUpRight size={13}/></Link>
      <button className="remove" onClick={onRemove} disabled={working}>
        {working ? <LoaderCircle size={14}/> : <><Trash2 size={14}/> {t("Takipten çıkar")}</>}
      </button>
    </div>
  </article>;
}


