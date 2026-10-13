import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import React, { useEffect, useState } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import type { Participation, Project } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { PageHeader, StatusPill, EmptyState, Btn, Skeleton } from '../components/Layout';
import { toast } from 'sonner';

export function ParticipationsPage() {
  const { user } = useAuth();
  const [parts, setParts] = useState<Participation[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeLoading, setDisputeLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.myParticipations(), api.projects()])
      .then(([ps, projs]) => {
        setParts(ps.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setProjects(Object.fromEntries(projs.map(p => [p.id, p])));
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleDispute = async (id: string) => {
    setDisputeLoading(true);
    try {
      const updated = await api.disputeParticipation(id, disputeNote);
      setParts(prev => prev.map(p => p.id === id ? updated : p));
      setDisputeId(null);
      setDisputeNote('');
      toast.success(t("İtiraz gönderildi"));
    } catch (e: any) { toast.error(e.message); }
    finally { setDisputeLoading(false); }
  };

  const statusOrder: Record<string, number> = {
    pending_verification: 0, disputed: 1, reserved: 2,
    verified: 3, rejected: 4, expired: 5,
  };
  const sorted = [...parts].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  return (
    <div className="carpan-social-page space-y-5">
      <section className="carpan-social-intro"><PageHeader title={t("Katılımlarım")} subtitle={t("{0} katılım", [parts.length])} /></section>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<Users size={36} />} title={t("Henüz katılım yok")}
          body={t("Projelere katılarak ilerlemenizi başlatın.")} />
      ) : (
        <div className="space-y-3">
          {sorted.map(part => {
            const proj = projects[part.projectId];
            const canDispute = ['pending_verification', 'rejected'].includes(part.status);
            return (
              <Card key={part.id} className="carpan-social-card carpan-participation-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
                        {proj?.name || part.projectId}
                      </span>
                      {part.isDemo && (
                        <span className="text-xs px-1.5 py-0.5 rounded flex-none"
                          style={{ background: 'rgba(240,192,64,0.1)', color: 'var(--warning)', fontSize: '10px' }}>
                          demo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <StatusPill status={part.status} />
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                        {part.participationType === 'free' ? t("Ücretsiz") : t("Eski ücretli kayıt")} ·{' '}
                        {new Date(part.createdAt).toLocaleDateString(getLocale())}
                      </span>
                    </div>
                    {part.status === 'verified' && part.verifiedBy === 'demo' && (
                      <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                        {t("⚠ Demo doğrulama — gerçek entegrasyon yok")}</div>
                    )}
                    {part.rejectionReason && (
                      <div className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                        {translateText("Red sebebi:")}{part.rejectionReason}
                      </div>
                    )}
                    {part.disputeNote && (
                      <div className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
                        {t("İtiraz notu:")}{part.disputeNote}
                      </div>
                    )}
                  </div>
                  {canDispute && !part.disputedAt && (
                    <Btn variant="danger" size="sm" onClick={() => setDisputeId(part.id)}>
                      <AlertTriangle size={12} />{t("İtiraz")}</Btn>
                  )}
                </div>

                {disputeId === part.id && (
                  <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                    <textarea
                      value={disputeNote}
                      onChange={e => setDisputeNote(e.target.value)}
                      placeholder={t("İtiraz notunuzu yazın...")}
                      rows={2}
                      className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)', fontFamily: 'inherit' }}
                    />
                    <div className="flex gap-2">
                      <Btn variant="ghost" size="sm" onClick={() => setDisputeId(null)}>{t("İptal")}</Btn>
                      <Btn variant="danger" size="sm" loading={disputeLoading}
                        onClick={() => handleDispute(part.id)}>
                        {t("İtiraz Gönder")}</Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
