import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Compass, ExternalLink, CheckCircle, Info, Clock, Tag, ChevronDown, ChevronUp, X, Plus, Copy } from 'lucide-react';
import { api } from '../api';
import type { Project, Participation } from '../types';
import { useAuth } from '../hooks/useAuth';
import { PageHeader, EmptyState, Btn, InlineError, Skeleton } from '../components/Layout';
import { toast } from 'sonner';
import { clearReferralIntent, readPendingReferralIntent } from '../referral-intent';

type Step = 'browse' | 'reserve' | 'submit' | 'done';
interface ReservationResult {
  reservation: { id: string; expiresAt: string; participationType: string };
  referralLink: string;
  referralCode: string;
  project: Project;
  expiresAt: string;
}

export function ProjectsPage() {
  const { user, refresh } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [myParts, setMyParts] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Join flow
  const [step, setStep] = useState<Step>('browse');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [reservation, setReservation] = useState<ReservationResult | null>(null);
  const [proof, setProof] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [preferredLinkId, setPreferredLinkId] = useState<string | undefined>();
  const [showProposal, setShowProposal] = useState(false);
  const [referralEnabled,setReferralEnabled]=useState(false);
  const [proposal, setProposal] = useState({ name: '', description: '', officialDomain: '', arcContractAddress: '',
    referralLinkPattern: '', referralMode: 'url' as 'url' | 'code',
    validParticipationCondition: '', participantBenefit: '' });

  useEffect(() => {
    let current=true;setLoading(true);setLoadError('');
    Promise.all([api.projects(), api.myParticipations()])
      .then(([projs, parts]) => {
        if(!current)return;
        setProjects(projs);
        setMyParts(parts);
      })
      .catch((e: Error) => {if(current)setLoadError(t("Projeler yüklenemedi: {0}", [e.message]));})
      .finally(() => {if(current)setLoading(false);});
    return()=>{current=false;};
  }, [user?.id,retry]);


  const joinedProjectIds = new Set(
    myParts.filter(p => !['rejected','expired'].includes(p.status)).map(p => p.projectId)
  );

  useEffect(() => {
    if (loading || loadError || step !== 'browse') return;
    const projectId = searchParams.get('projectId');
    const pendingIntent = projectId ? null : readPendingReferralIntent();
    const targetProjectId = projectId || pendingIntent?.projectId;
    if (!targetProjectId) return;
    const selected = projects.find(project => project.id === targetProjectId);
    if (selected && selected.status==='approved'&&selected.allowsFreeParticipation&&!joinedProjectIds.has(targetProjectId)) {
      setSelectedProject(selected);
      setPreferredLinkId(searchParams.get('linkId') || pendingIntent?.linkId);
      setStep('reserve');
    }
    clearReferralIntent();
    setSearchParams({}, { replace: true });
  }, [loading, loadError, step, projects, searchParams, setSearchParams]);

  const handleStartJoin = (proj: Project) => {
    setSelectedProject(proj);
    setPreferredLinkId(undefined);
    setError('');
    setStep('reserve');
  };

  const handleReserve = async () => {
    if (!selectedProject) return;
    setActionLoading(true); setError('');
    try {
      const result = await api.reserve(selectedProject.id, preferredLinkId);
      setReservation(result as ReservationResult);
      setStep('submit');
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const handleSubmit = async () => {
    if (!reservation) return;
    setActionLoading(true); setError('');
    try {
      await api.submitParticipation(reservation.reservation.id, proof || undefined);
      toast.success(t("Katılım gönderildi! Doğrulama bekleniyor..."));
      setStep('done');
      // The submission already succeeded; a failed refresh must not invite a duplicate submission.
      api.myParticipations().then(setMyParts).catch(() => {});
      refresh().catch(() => {});
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(false); }
  };

  const resetFlow = () => {
    setStep('browse');
    setSelectedProject(null);
    setPreferredLinkId(undefined);
    setReservation(null);
    setProof('');
    setError('');
  };

  const submitProposal = async () => {
    setActionLoading(true); setError('');
    try {
      await api.submitProject({...proposal,allowsFreeParticipation:referralEnabled});
      setShowProposal(false);
      setProposal({ name: '', description: '', officialDomain: '', arcContractAddress: '', referralLinkPattern: '',
        referralMode: 'url', validParticipationCondition: '', participantBenefit: '' });
      setReferralEnabled(false);
      toast.success(t("Proje önerin yönetici incelemesine gönderildi"));
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("Proje gönderilemedi")); }
    finally { setActionLoading(false); }
  };

  if (loading) return (
    <div className="carpan-social-page space-y-5">
      <section className="carpan-social-intro"><PageHeader title={t("Projeler")} /></section>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
      </div>
    </div>
  );

  // Join flow modal overlay
  if (step !== 'browse') {
    return (
      <div className="carpan-social-dialog fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
        <div className="carpan-social-dialog-panel w-full max-w-md rounded-2xl border p-5 relative"
          style={{ background: 'var(--surface-strong)', borderColor: 'var(--border-strong)' }}>
          <button onClick={resetFlow} className="absolute top-4 right-4" style={{ color: 'var(--muted)' }}>
            <X size={18} />
          </button>

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(34,201,138,0.15)', color: 'var(--success)' }}>
                <CheckCircle size={28} />
              </div>
              <div className="display text-lg font-bold mb-2" style={{ color: 'var(--ink)' }}>{t("Katılım Gönderildi")}</div>
              <div className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                {user?.isDemo ? t("Demo katılımı kısa süre içinde otomatik doğrulanacak.") : t("Katılımın inceleme kuyruğuna alındı. Projedeki işlem yalnızca bu bildirimle doğrulanmış sayılmaz.")}
              </div>
              <Btn onClick={resetFlow}>{t("Projelere Dön")}</Btn>
            </div>
          )}

          {step === 'reserve' && selectedProject && (
            <>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--muted)' }}>{t("Ücretsiz katılım")}</div>
              <div className="display text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>
                {selectedProject.name}
              </div>

              <div className="rounded-xl p-3 mb-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                {t("Katılım ücretsizdir. Başlamak için ödeme bilgisi gerekmez.")}</div>

              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--ink-2)' }}>{t("Katılım koşulu:")}</strong>
                {selectedProject.validParticipationCondition}
              </div>

              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}>
                <strong>{t("Katılımcı faydası:")}</strong>
                {selectedProject.participantBenefit || t("Proje tarafından belirtilmedi")}
              </div>

              {error && <InlineError message={error} />}

              <div className="flex gap-2 mt-4">
                <Btn variant="ghost" onClick={resetFlow}>{t("İptal")}</Btn>
                <Btn onClick={handleReserve} loading={actionLoading} className="flex-1">
                  {selectedProject.referralMode === 'code' ? t('Davet Kodunu Al') : t('Referans Linki Al')}
                </Btn>
              </div>
            </>
          )}

          {step === 'submit' && reservation && (
            <>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--muted)' }}>
                {selectedProject?.referralMode === 'code' ? t('Proje Davet Kodu') : t('Referans Linki')}
              </div>
              <div className="display text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>
                {selectedProject?.name}
              </div>

              {selectedProject?.referralMode === 'code' ? (
                <div className="space-y-3 mb-3">
                  <div className="rounded-xl p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{t("Bu katılım için kullanacağınız davet kodu:")}</div>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-base font-bold tracking-wide" style={{ color: 'var(--accent)' }}>{reservation.referralCode}</code>
                      <Btn size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(reservation.referralCode)
                        .then(() => toast.success(t("Davet kodu kopyalandı")))
                        .catch(() => toast.error(t("Kopyalama başarısız; kodu elle seçip kopyalayın.")))}>
                        <Copy size={13}/> {translateText("Kodu kopyala")}</Btn>
                    </div>
                  </div>
                  <a href={reservation.referralLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl p-3 text-sm font-medium"
                    style={{ background: 'var(--surface)', color: 'var(--accent)' }}>
                    {t("Projenin katılım sayfasını aç")}<ExternalLink size={14} className="flex-none" />
                  </a>
                </div>
              ) : (
                <div className="rounded-xl p-3 mb-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{t("Bu linki kullanarak katılın:")}</div>
                  <a href={reservation.referralLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-medium break-all"
                    style={{ color: 'var(--accent)' }}>
                    {reservation.referralLink}
                    <ExternalLink size={13} className="flex-none" />
                  </a>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs mb-4" style={{ color: 'var(--muted)' }}>
                <Clock size={13} />
                {t("Rezervasyon süresi:")}{new Date(reservation.expiresAt).toLocaleTimeString(getLocale())} {translateText("tarihine kadar")}</div>

              <div className="mb-4">
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
                  {t("Katılım Kanıtı")}{user?.isDemo ? t("(demo için opsiyonel)") : '*'}
                </label>
                <textarea
                  value={proof}
                  onChange={e => setProof(e.target.value)}
                  placeholder="Tx hash, profil linki veya not..."
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--ink)', fontFamily: 'inherit',
                  }}
                />
              </div>

              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(240,192,64,0.08)', color: 'var(--warning)' }}>
                <Info size={13} className="inline mr-1.5" />
                {t("Tıklama geçerli katılım değildir. Referans sahibi tek başına doğrulama yapamaz.")}{selectedProject?.validationMethod === 'demo' && t(" Demo modunda otomatik doğrulanacaktır.")}
              </div>

              {error && <InlineError message={error} />}

              <div className="flex gap-2">
                <Btn variant="ghost" onClick={() => setStep('reserve')}>{t("Geri")}</Btn>
                <Btn onClick={handleSubmit} loading={actionLoading} disabled={!user?.isDemo && !proof.trim()} className="flex-1">
                  {t("Katılımı Gönder")}</Btn>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const available = projects.filter(p => p.status==='approved'&&p.allowsFreeParticipation && !joinedProjectIds.has(p.id));
  const joined = projects.filter(p => joinedProjectIds.has(p.id));

  return (
    <div className="carpan-social-page carpan-social-projects space-y-5">
      <section className="carpan-social-intro"><PageHeader
        title={t("Görevler")}
        subtitle={t("{0} katılabilir proje", [available.length])}
        action={<Btn size="sm" onClick={() => setShowProposal(value => !value)}><Plus size={14}/>{t("Proje Öner")}</Btn>}
      /></section>
      {error && <InlineError message={error} />}
      {loadError&&<div><InlineError message={loadError}/><Btn size="sm" variant="ghost" onClick={()=>setRetry(n=>n+1)}>{t('Yeniden dene')}</Btn></div>}
      <p className="text-xs" style={{color:'var(--muted)'}}>{t('Referans programı olmayan projeleri katalogda inceleyebilirsin.')} <Link to="/ecosystem" style={{color:'var(--accent)'}}>{t('Proje kataloğu')} ↗</Link></p>

      {showProposal && <div className="carpan-social-card carpan-proposal-card refbridge-card rounded-2xl p-5 space-y-3" style={{ border: '1px solid var(--border)' }}>
        <h2 className="font-semibold" style={{ color: 'var(--ink)' }}>{t("Yeni proje önerisi")}</h2>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('Arc projesini kataloğa öner. Referans programı isteğe bağlıdır; listeleme yönetici incelemesinden sonra açılır.')}</p>
        <label className="flex gap-3 items-center rounded-xl p-3 text-sm" style={{background:'var(--surface)',border:'1px solid var(--border)',color:'var(--ink)'}}><input type="checkbox" checked={referralEnabled} onChange={e=>setReferralEnabled(e.target.checked)} style={{accentColor:'var(--accent)'}}/>{t('Bu projeye referans programı ekle')}</label>
        {referralEnabled&&<div className="block text-xs" style={{ color: 'var(--ink-2)' }}>
          {t("Katılım yöntemi")}<div className="flex gap-2 mt-1">
            {([['url', 'Referans linki'], ['code', 'Eklenti davet kodu']] as const).map(([mode, label]) => (
              <button key={mode} type="button" onClick={() => setProposal({ ...proposal, referralMode: mode })}
                aria-pressed={proposal.referralMode === mode}
                className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: proposal.referralMode === mode ? 'var(--accent)' : 'var(--bg)',
                  color: proposal.referralMode === mode ? '#10152a' : 'var(--muted)', border: '1px solid var(--border)' }}>
                {t(label)}
              </button>
            ))}
          </div>
        </div>}
        {([
          ['name',t("Proje adı"),t("Örn. Yeni Proje")],
          ['officialDomain',t("Resmî alan adı"),'ornek.com'],
          ['arcContractAddress',t("Arc Mainnet kontratı (isteğe bağlı)"),'0x…'],
          ['referralLinkPattern', proposal.referralMode === 'code' ? t("Katılım sayfası (HTTPS)") : t('Referans link deseni'),
            proposal.referralMode === 'code' ? 'https://conso.xyz/' : 'https://ornek.com/ref/{code}'],
          ['participantBenefit',t("Katılımcıya sağlanan fayda"),t("Örn. erken erişim")],
          ['validParticipationCondition',t("Doğrulanacak görev"),t("Örn. kayıt ve profil oluşturma")],
          ['description',t("Kısa açıklama"),t("Projenizi anlatın")],
        ] as const).filter(([key])=>referralEnabled||!['referralLinkPattern','participantBenefit','validParticipationCondition'].includes(key)).map(([key,label,placeholder]) => <label key={key} className="block text-xs" style={{ color: 'var(--ink-2)' }}>
          {label}
          <input value={proposal[key]} onChange={event => setProposal({ ...proposal, [key]: event.target.value })}
            placeholder={placeholder} className="w-full rounded-xl px-3 py-2 text-sm mt-1"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--ink)' }}/>
        </label>)}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('Arc adresi ayrı resmî kaynak incelemesinden sonra projeyle ilişkilendirilir. Adres girmek sahipliği doğrulamaz.')}</p>
        {referralEnabled&&proposal.referralMode === 'code' && <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {t("Davet kodu web adresine eklenmez. Kart sahibi kodunu paylaşır; katılımcı kodu projenin kendi eklenti veya kayıt akışında kullanır.")}</p>}
        <Btn size="sm" onClick={submitProposal} loading={actionLoading}>{t("İncelemeye Gönder")}</Btn>
      </div>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : loadError ? null : available.length === 0 ? (
        <EmptyState
          icon={<Compass size={36} />}
          title={t("Katılabileceğiniz proje yok")}
          body={projects.length === 0 ? t("Onaylanan projeler burada yayınlanacak.") : t("Şu anda katılabileceğiniz yeni ücretsiz proje yok.")}
        />
      ) : (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--subtle)' }}>
            {t("Katılılabilir Projeler")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {available.map(proj => (
              <ProjectCard
                key={proj.id}
                project={proj}
                joined={false}
                expanded={expandedId === proj.id}
                onToggle={() => setExpandedId(expandedId === proj.id ? null : proj.id)}
                onJoin={handleStartJoin}
              />
            ))}
          </div>
        </>
      )}

      {joined.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wider mt-2 mb-1" style={{ color: 'var(--subtle)' }}>
            {t("Zaten Katıldıklarınız")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {joined.map(proj => (
              <ProjectCard key={proj.id} project={proj} joined={true} expanded={false}
                onToggle={() => {}} onJoin={() => {}} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectCard({ project, joined, expanded, onToggle, onJoin }: {
  project: Project;
  joined: boolean;
  expanded: boolean;
  onToggle: () => void;
  onJoin: (proj: Project) => void;
}) {
  const isDemo = project.validationMethod === 'demo';

  return (
    <div className="carpan-project-card carpan-social-card refbridge-card rounded-2xl border overflow-hidden"
      style={{ borderColor: joined ? 'var(--border)' : 'var(--border-strong)' }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="font-semibold text-base truncate" style={{ color: 'var(--ink)' }}>{project.name}</div>
              {project.sponsoredUntil && new Date(project.sponsoredUntil) > new Date() && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface-muted)', color: 'var(--violet)' }}>{translateText("Sponsorlu")}</span>}
              {isDemo && (
                <span className="text-xs px-1.5 py-0.5 rounded flex-none"
                  style={{ background: 'rgba(240,192,64,0.1)', color: 'var(--warning)', fontSize: '10px' }}>
                  demo
                </span>
              )}
            </div>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>{project.officialDomain}</div>
          </div>
          {joined && (
            <div className="flex-none flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
              style={{ background: 'rgba(34,201,138,0.1)', color: 'var(--success)' }}>
              <CheckCircle size={12} />
              {t("Katıldı")}</div>
          )}
        </div>

        <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--muted)' }}>{project.description}</p>
        {project.participantBenefit && <p className="text-xs mb-3" style={{ color: 'var(--ink-2)' }}>{t("Katılımcıya:")}{project.participantBenefit}</p>}

        <div className="flex gap-2 flex-wrap text-xs mb-3">
          {project.allowsFreeParticipation && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ background: 'rgba(94,221,178,0.1)', color: 'var(--accent)' }}>
              <Tag size={11} />{t("Ücretsiz")}</span>
          )}
          <span className="px-2 py-1 rounded-lg"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            {project.referralMode === 'code' ? t("Davet koduyla katılım") : t("Referans linkiyle katılım")}
          </span>
        </div>

        {!joined && (
          <div className="flex gap-2">
            {project.allowsFreeParticipation && (
              <Btn size="sm" variant="ghost" onClick={() => onJoin(project)} className="flex-1">
                {t("Ücretsiz Katıl")}</Btn>
            )}
          </div>
        )}
      </div>

      {/* Details expandable */}
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs border-t transition-all hover:opacity-80"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'rgba(255,255,255,0.02)' }}>
        <span>{t("Koşulları Gör")}</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 text-xs space-y-2" style={{ color: 'var(--muted)' }}>
          <div>
            <span style={{ color: 'var(--ink-2)' }}>{t("Katılım koşulu:")}</span>
            {project.validParticipationCondition}
          </div>
          <div>
            <span style={{ color: 'var(--ink-2)' }}>{t("Doğrulama:")}</span>
            {isDemo ? t("⚠ Demo doğrulama (gerçek entegrasyon yok)") : t("Yönetici incelemesi")}
          </div>
          <div><Link to={`/ecosystem/${project.id}`}>{translateText("Proje adresleri ve zincir analizi ↗")}</Link></div>{project.arcContractAddress && <div>
            <span style={{ color: 'var(--ink-2)' }}>{t("Arc kontratı:")}</span>
            <Link to={`/arc/contracts/${project.arcContractAddress}`} style={{ color: 'var(--violet)' }}>
              {project.arcContractAddress} ↗
            </Link>
          </div>}
        </div>
      )}
    </div>
  );
}
