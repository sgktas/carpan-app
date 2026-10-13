import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale, useI18n } from '../i18n/index';
import {ExplorerUsage} from '../components/ExplorerUsage';
import {ProductUsage} from '../components/ProductUsage';
import {Link, useSearchParams} from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { Shield, CheckCircle, X } from 'lucide-react';
import { api } from '../api';
import type { Participation, Project, User, AdminStats } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { PageHeader, StatusPill, Btn, InlineError, Skeleton } from '../components/Layout';
import { toast } from 'sonner';

type AdminTab = 'overview' | 'usage' | 'participations' | 'projects' | 'users';
const ADMIN_TABS: AdminTab[] = ['overview', 'usage', 'participations', 'projects', 'users'];

export function AdminPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const say = (en: string, tr: string) => language === 'tr' ? tr : en;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as AdminTab;
  const tab: AdminTab = ADMIN_TABS.includes(requestedTab) ? requestedTab : 'overview';
  const setTab = (next: AdminTab) => setSearchParams(previous => {
    const params = new URLSearchParams(previous);
    if (next === 'overview') params.delete('tab'); else params.set('tab', next);
    return params;
  });
  const [loadedOwnerId, setLoadedOwnerId] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [parts, setParts] = useState<Participation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [partFilter, setPartFilter] = useState<string>('');

  useEffect(() => {
    if (user?.role !== 'admin' || tab === 'usage' || loadedOwnerId === user.id) return;
    let current = true;
    setLoading(true); setLoadError('');
    setStats(null); setParts([]); setProjects([]); setUsers([]);
    const load = async () => {
      const [s, ps, projs, us] = await Promise.all([
        api.adminStats(), api.adminParticipations(), api.projects(), api.adminUsers(),
      ]);
      if (!current) return;
      setStats(s); setParts(ps); setProjects(projs); setUsers(us);
      setLoadedOwnerId(user.id);
    };
    load().catch((e: Error) => { if (current) setLoadError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, user?.role, tab, loadedOwnerId]);

  if (user?.role !== 'admin') {
    return <div className="text-center py-20" style={{ color: 'var(--muted)' }}>{t("Erişim yok")}</div>;
  }

  const handleVerify = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await api.verifyParticipation(id);
      setParts(prev => prev.map(p => p.id === id ? updated : p));
      toast.success(t("Katılım doğrulandı"));
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason) { toast.error('Red sebebi gerekli'); return; }
    setActionLoading(id);
    try {
      const updated = await api.rejectParticipation(id, rejectReason);
      setParts(prev => prev.map(p => p.id === id ? updated : p));
      setRejectId(null); setRejectReason('');
      toast.success(t("Katılım reddedildi"));
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleApproveProject = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await api.approveProject(id);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      toast.success(t("Proje onaylandı"));
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRejectProject = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await api.rejectProject(id, rejectReason || t("Yönetici kararı"));
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      toast.success('Proje reddedildi');
    } catch (e: any) { toast.error(e.message); }
    finally { setActionLoading(null); }
  };

  const handleSponsor = async (id: string, days: 0 | 30) => {
    setActionLoading(id);
    try {
      const updated = await api.sponsorProject(id, days);
      setProjects(prev => prev.map(project => project.id === id ? updated : project));
      toast.success(days ? t("30 günlük sponsorlu görünüm açıldı") : t("Sponsorlu görünüm kapatıldı"));
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : t("İşlem başarısız")); }
    finally { setActionLoading(null); }
  };

  const tabs: { key: AdminTab; label: string; count?: number }[] = [
    { key: 'overview', label: t("Özet") },
    { key: 'usage', label: say('Usage', 'Kullanım') },
    { key: 'participations', label: t("Katılımlar"), count: stats?.pendingParticipations },
    { key: 'projects', label: t("Projeler"), count: stats?.pendingProjects },
    { key: 'users', label: t("Kullanıcılar") },
  ];

  const filteredParts = partFilter ? parts.filter(p => p.status === partFilter) : parts;

  return (
    <div className="space-y-5">
      <PageHeader title={t("Yönetici Paneli")}
        subtitle={<span className="flex items-center gap-1.5"><Shield size={13} />{t("Admin erişimi")}</span> as any} />

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" aria-label={say('Admin sections', 'Yönetim bölümleri')} style={{ background: 'var(--surface)' }}>
        {tabs.map(t => (
          <button type="button" key={t.key} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}
            className="flex-1 min-w-max px-3 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all"
            style={{
              background: tab === t.key ? 'var(--surface-strong)' : 'transparent',
              color: tab === t.key ? 'var(--ink)' : 'var(--muted)',
            }}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs"
                style={{ background: 'var(--warning)', color: '#000', fontSize: '10px' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab !== 'usage' && loadError && <InlineError message={t("Yönetici verileri yüklenemedi: {0}", [loadError])} />}
      {tab === 'usage' ? <ProductUsage key={user.id} /> : loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <>
          {/* Overview */}
          {tab === 'overview' && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={t("Kullanıcı")} value={stats.users} />
              <StatCard label="Proje" value={stats.projects} badge={stats.pendingProjects} />
              <StatCard label={t("Katılım")} value={stats.participations} badge={stats.pendingParticipations} />
            </div>
          )}

          {tab === 'overview' && <ExplorerUsage/>}

          {/* Participations */}
          {tab === 'participations' && (
            <>
              <div className="flex gap-2 flex-wrap">
                {['', 'pending_verification', 'disputed', 'verified', 'rejected'].map(f => (
                  <button key={f} onClick={() => setPartFilter(f)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      background: partFilter === f ? 'var(--accent)' : 'var(--surface)',
                      color: partFilter === f ? '#0b1120' : 'var(--muted)',
                      border: '1px solid var(--border)',
                    }}>
                    {f === '' ? t("Tümü") : f === 'pending_verification' ? translateText("Bekleyen") : f === 'disputed' ? t("İtirazlı") : f === 'verified' ? t("Doğrulandı") : t("Reddedildi")}
                    {f === 'pending_verification' && stats?.pendingParticipations ? ` (${stats.pendingParticipations})` : ''}
                  </button>
                ))}
              </div>

              {filteredParts.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>{t("Katılım yok")}</div>
              ) : (
                <div className="space-y-2">
                  {filteredParts.map(part => {
                    const proj = projects.find(p => p.id === part.projectId);
                    const isActionable = ['pending_verification', 'disputed'].includes(part.status);
                    return (
                      <Card key={part.id}>
                        <div className="flex items-start gap-3 justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                                {proj?.name || part.projectId}
                              </span>
                              <StatusPill status={part.status} />
                              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                               {part.participationType === 'free' ? t("Ücretsiz") : t("Eski ücretli kayıt")}
                              </span>
                            </div>
                            <div className="text-xs" style={{ color: 'var(--muted)' }}>
                              {t("Katılımcı:")}{part.participantId.slice(-8)} · {new Date(part.createdAt).toLocaleDateString(getLocale())}
                            </div>
                            {part.submittedProof && (
                              <div className="text-xs mt-1 font-mono" style={{ color: 'var(--subtle)' }}>
                                {t("Kanıt:")}{part.submittedProof}
                              </div>
                            )}
                          </div>
                          {isActionable && (
                            <div className="flex gap-1.5 flex-none">
                              <Btn size="sm" onClick={() => handleVerify(part.id)}
                                loading={actionLoading === part.id}>
                                <CheckCircle size={12} />
                              </Btn>
                              <Btn size="sm" variant="danger" onClick={() => {
                                setRejectId(part.id); setRejectReason('');
                              }}>
                                <X size={12} />
                              </Btn>
                            </div>
                          )}
                        </div>
                        {rejectId === part.id && (
                          <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                              placeholder="Red sebebi..." className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
                            <div className="flex gap-2">
                              <Btn variant="ghost" size="sm" onClick={() => setRejectId(null)}>{t("İptal")}</Btn>
                              <Btn variant="danger" size="sm" loading={actionLoading === part.id}
                                onClick={() => handleReject(part.id)}>
                                {t("Reddet")}</Btn>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Projects */}
          {tab === 'projects' && (
            <div className="space-y-3">
              {projects.map(proj => (
                <Card key={proj.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{proj.name}</span>
                        <StatusPill status={proj.status} />
                      </div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{proj.officialDomain}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                        {t("Katılımcı faydası:")}{proj.participantBenefit || t("Belirtilmemiş")}
                      </div>
                      {proj.sponsoredUntil && new Date(proj.sponsoredUntil) > new Date() &&
                        <div className="text-xs mt-1" style={{ color: 'var(--violet)' }}>{translateText("Sponsorlu:")}{new Date(proj.sponsoredUntil).toLocaleDateString(getLocale())} {translateText("tarihine kadar")}</div>}
                    </div>
                    {proj.status === 'pending' && (
                      <div className="flex gap-1.5 flex-none">
                        <Btn size="sm" onClick={() => handleApproveProject(proj.id)}
                          loading={actionLoading === proj.id}>
                          <CheckCircle size={12} />{t("Onayla")}</Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleRejectProject(proj.id)}
                          loading={actionLoading === proj.id}>
                          <X size={12} />{t("Reddet")}</Btn>
                      </div>
                    )}
                  </div>
                  {proj.status === 'approved' && <Link to={`/ecosystem/${proj.id}`} className="text-xs block mt-3">{t("Zincir adreslerini yönet ↗")}</Link>}
                  {proj.status === 'approved' && <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs flex-1" style={{ color: 'var(--muted)' }}>{t("Reklam anlaşması doğrulandıktan sonra yönetici tarafından işaretlenir.")}</span>
                    <Btn size="sm" variant="ghost" loading={actionLoading === proj.id}
                      onClick={() => handleSponsor(proj.id, proj.sponsoredUntil && new Date(proj.sponsoredUntil) > new Date() ? 0 : 30)}>
                      {proj.sponsoredUntil && new Date(proj.sponsoredUntil) > new Date() ? t("Sponsorluğu kapat") : t("30 gün sponsorlu göster")}
                    </Btn>
                  </div>}
                </Card>
              ))}
            </div>
          )}

          {/* Users */}
          {tab === 'users' && (
            <div className="space-y-3">
              {users.map(u => (
                <Card key={u.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-none"
                      style={{ background: 'rgba(46,196,240,0.12)', color: 'var(--accent)' }}>
                      {u.xDisplayName?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{u.xDisplayName}</span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>{u.authMethod === 'x' ? `@${u.xHandle}` : u.email || u.walletAddress}</span>
                        {u.role === 'admin' && (
                          <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(46,196,240,0.1)', color: 'var(--accent)' }}>admin</span>
                        )}
                        {u.isDemo && (
                          <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>demo</span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                        {u.totalFreeParticipations} {t("katılım ·")}{u.freeSlots} {translateText("toplam kalan hak")}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, badge }: { label: string; value: number; badge?: number }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</div>
        {badge !== undefined && badge > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--warning)', color: '#000', fontSize: '10px' }}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
