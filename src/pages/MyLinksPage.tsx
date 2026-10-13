import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import React, { useEffect, useState } from 'react';
import { Link2, Plus, ExternalLink, Copy, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Project, ReferralLink, ReferralProgramStatus } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Card, CardTitle } from '../components/Card';
import { PageHeader, EmptyState, Btn, InlineError, Skeleton } from '../components/Layout';
import { toast } from 'sonner';

export function MyLinksPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [program, setProgram] = useState<ReferralProgramStatus | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ projectId: '', referralCode: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [activateId, setActivateId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.myLinks(), api.projects(), api.referralProgram()])
      .then(([ls, ps, status]) => { setLinks(ls); setProjects(ps); setProgram(status); })
      .catch((e: Error) => setLoadError(t("Referans linkleri yüklenemedi: {0}", [e.message])))
      .finally(() => setLoading(false));
  }, [user]);

  const handleAdd = async () => {
    if (!form.projectId || !form.referralCode) {
      setAddError('Proje ve referans kodu gerekli'); return;
    }
    setAddLoading(true); setAddError('');
    try {
      const link = await api.addLink({
        projectId: form.projectId,
        referralCode: form.referralCode,
      });
      setLinks(prev => [...prev, link]);
      setProgram(await api.referralProgram());
      setShowAdd(false);
      setForm({ projectId: '', referralCode: '' });
      toast.success(t("Referans kartın açıldı; ilk beşli hak bu projeye bağlandı."));
      refresh();
    } catch (e: any) { setAddError(e.message); }
    finally { setAddLoading(false); }
  };

  const activate = async (linkId: string) => {
    setActivateId(linkId);
    try {
      const updated = await api.activateLink(linkId);
      setLinks(links.map(link => link.id === linkId ? { ...link, ...updated } : link));
      setProgram(await api.referralProgram());
      refresh().catch(() => {});
      toast.success(t("Yeni beşli hak bu karta bağlandı"));
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : t("Kart açılamadı")); }
    finally { setActivateId(null); }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(t("{0} kopyalandı", [label])))
      .catch(() => toast.error(t("Kopyalama başarısız; adresi seçip elle kopyalayın.")));
  };

  const cardInviteUrl = (link: ReferralLink) => {
    const params = new URLSearchParams({ projectId: link.projectId, linkId: link.id });
    return `${window.location.origin}/?${params.toString()}`;
  };

  const verifiedReferrals = links.reduce((s, l) => s + l.timesReferred, 0);
  const availableProjects = projects.filter(p => p.status === 'approved' && p.allowsFreeParticipation && !links.find(l => l.projectId === p.id));

  return (
    <div className="carpan-social-page carpan-links-page space-y-5">
      <section className="carpan-social-intro"><PageHeader
        title={t("Referans Kartlarım")}
        action={<Btn onClick={() => setShowAdd(s => !s)} size="sm"><Plus size={14} />{translateText("Yeni Kart")}</Btn>}
      /></section>
      {loadError && <InlineError message={loadError} />}

      <Card glass className="carpan-social-card carpan-social-entitlement overflow-hidden">
          <div className="carpan-links-summary flex items-center justify-between gap-5 px-1 py-2">
            <div className="flex items-center gap-5 min-w-0">
              <div className="display text-6xl sm:text-7xl leading-none font-bold tabular-nums tracking-tight flex-none"
                style={{ color: 'var(--accent)', textShadow: '0 0 32px rgba(94,221,178,0.18)' }}
                aria-label={t("{0} kullanılabilir referans hakkı", [program?.availableSlots ?? user?.freeSlots ?? 0])}>
                {program?.availableSlots ?? user?.freeSlots ?? 0}
              </div>
              <div className="min-w-0">
                <div className="display text-lg sm:text-xl font-semibold" style={{ color: 'var(--ink)' }}>
                  {t("Kullanılabilir referans hakkın")}</div>
                <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  {t("Her beşli hak bir proje kartına bağlanır. Yalnızca doğrulanmış referans hakkı kullanır.")}</div>
              </div>
            </div>
            <div className="flex-none text-right border-l pl-5 sm:pl-8" style={{ borderColor: 'var(--border-strong)' }}>
              <div className="display text-3xl sm:text-4xl leading-none font-bold tabular-nums" style={{ color: 'var(--ink-2)' }}>
                {verifiedReferrals}
              </div>
              <div className="text-xs sm:text-sm mt-2" style={{ color: 'var(--muted)' }}>{t("Doğrulanmış referans")}</div>
            </div>
          </div>
      </Card>

      <Card className="carpan-social-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t("Sıradaki beşli hak")}</div>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {program?.progress ?? 0}{t("/5 farklı doğrulanmış görev · Bağlanmamış hak:")}{program?.unassignedSlots ?? 0}
            </p>
          </div>
          <Btn size="sm" variant="ghost" onClick={() => navigate('/projects')}>{t("Görevleri keşfet")}<RefreshCw size={13}/></Btn>
        </div>
      </Card>

      {/* Add form */}
      {showAdd && (
        <Card glass className="carpan-social-card carpan-proposal-card">
          <CardTitle>{t("Yeni Referans Kartı")}</CardTitle>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            {t("İlk kartın için beş hakkın ücretsizdir. Yeni kart için boş bir beşli hak gerekir; sonraki beşliyi beş farklı doğrulanmış görevle kazanırsın.")}</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>{translateText("Proje *")}</label>
              <select
                value={form.projectId}
                onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                <option value="">{t("Proje seçin...")}</option>
                {availableProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-2)' }}>
                  {projects.find(p => p.id === form.projectId)?.referralMode === 'code' ? 'Proje davet kodunuz *' : 'Referans kodunuz *'}
              </label>
              {form.projectId && (
                <div className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
                  {projects.find(p => p.id === form.projectId)?.referralMode === 'code'
                    ? t("Proje sayfası: {0} · Kod web adresine eklenmez; katılımcı kodu projenin uygulama veya eklenti akışında kullanır.", [projects.find(p => p.id === form.projectId)?.referralLinkPattern])
                    : `Link deseni: ${projects.find(p => p.id === form.projectId)?.referralLinkPattern.replace('{code}', '<KOD>')}`}
                </div>
              )}
              <input
                value={form.referralCode}
                onChange={e => setForm(f => ({ ...f, referralCode: e.target.value }))}
                placeholder={projects.find(p => p.id === form.projectId)?.referralMode === 'code' ? t("Örn. CONSO-58DQ8") : t("Örn. ALICE-001")}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </div>

            {addError && <InlineError message={addError} />}

            {(program?.unassignedSlots ?? 0) < 1 && <p className="text-xs" style={{ color: 'var(--warning)' }}>
              {t("Şu an bağlanmamış beşli hakkın yok. Farklı projelerdeki görevleri tamamlayarak yenisini kazanabilirsin.")}</p>}

            <div className="flex gap-2 pt-1">
              <Btn variant="ghost" onClick={() => setShowAdd(false)}>{t("İptal")}</Btn>
              <Btn onClick={handleAdd} loading={addLoading} disabled={(program?.unassignedSlots ?? 0) < 1} className="flex-1">{t("Kartı Aç")}</Btn>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : loadError ? null : links.length === 0 ? (
        <EmptyState
          icon={<Link2 size={36} />}
          title={t("Henüz kart açmadınız")}
          body={t("Bir proje seçip ilk beş ücretsiz hakkını o proje kartına bağla.")}
          action={<Btn size="sm" onClick={() => setShowAdd(true)}><Plus size={14} />{t("İlk Kartı Aç")}</Btn>}
        />
      ) : (
        <div className="space-y-4">
          {links.map(link => {
            const proj = projects.find(p => p.id === link.projectId);
            return (
              <Card key={link.id} className="carpan-social-card carpan-referral-card">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-base" style={{ color: 'var(--ink)' }}>
                      {proj?.name || link.projectId}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="text-xs font-mono" style={{ color: 'var(--muted)' }}>{link.referralCode}</div>
                      {proj?.referralMode === 'code' && <button onClick={() => copyText(link.referralCode, t("Davet kodu"))}
                        className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>{translateText("Kodu kopyala")}</button>}
                    </div>
                  </div>
                  <div className="text-right flex-none">
                    <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                      {link.timesReferred}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>{t("doğrulanmış")}</div>
                  </div>
                </div>

                <div className="text-xs mb-3" style={{ color: (link.availableSlots ?? 0) > 0 ? 'var(--success)' : 'var(--warning)' }}>
                  {(link.availableSlots ?? 0) > 0
                    ? t("{0} açık hak · {1} toplam kalan", [link.availableSlots, link.remainingSlots ?? 0])
                    : (link.remainingSlots ?? 0) > 0 ? t("Bekleyen katılımlar hakları ayırdı") : t("Haklar doldu · kart duraklatıldı")}
                </div>
                {(link.remainingSlots ?? 0) === 0 && (program?.unassignedSlots ?? 0) > 0 &&
                  <Btn size="sm" onClick={() => activate(link.id)} loading={activateId === link.id} className="mb-3">
                    {t("Kazanılan beşliyi bu karta bağla")}</Btn>}

                {/* Project destination or referral URL */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
                  style={{ background: 'var(--surface-muted)' }}>
                  <span className="text-xs truncate flex-1 font-mono" style={{ color: 'var(--ink-2)' }}>{link.fullLink}</span>
                  <button onClick={() => copyText(link.fullLink, proj?.referralMode === 'code' ? t("Katılım sayfası") : 'Referans linki')}
                    aria-label={proj?.referralMode === 'code' ? 'Proje adresini kopyala' : 'Referans linkini kopyala'}
                    className="flex-none transition-all hover:opacity-70"
                    style={{ color: 'var(--accent)' }}>
                    <Copy size={14} />
                  </button>
                  <a href={link.fullLink} target="_blank" rel="noopener noreferrer"
                    aria-label={proj?.referralMode === 'code' ? t("Proje katılım sayfasını aç") : t("Referans linkini aç")}
                    className="flex-none transition-all hover:opacity-70" style={{ color: 'var(--muted)' }}>
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => copyText(cardInviteUrl(link), t("Carpan katılım bağlantısı"))}
                    className="text-xs font-semibold rounded-lg px-3 py-2 border hover:opacity-80"
                    style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}>
                    <Copy size={13} className="inline mr-1.5"/>{t("Carpan kartını paylaş")}</button>
                  <a href={`https://x.com/intent/post?text=${encodeURIComponent(proj?.referralMode === 'code'
                    ? t("{0} için davet kodum: {1}. Katılımı Carpan kartımdan başlat: {2} · Proje: {3}", [proj.name, link.referralCode, cardInviteUrl(link), link.fullLink])
                    : t("{0} referans kartım: {1} · Referans sayfası: {2}", [proj?.name || 'Proje', cardInviteUrl(link), link.fullLink]))}`}
                    target="_blank" rel="noopener noreferrer" aria-label={t("Carpan kartını X'te paylaş")}
                    className="flex-none text-xs font-bold hover:opacity-70" style={{ color: 'var(--violet)' }}>𝕏</a>
                </div>

              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
