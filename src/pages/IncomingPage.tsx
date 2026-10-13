import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t, getLocale } from '../i18n/index';
import React, { useEffect, useState } from 'react';
import { ArrowDownLeft } from 'lucide-react';
import { api } from '../api';
import type { Participation, Project } from '../types';
import { useAuth } from '../hooks/useAuth';
import { Card } from '../components/Card';
import { PageHeader, StatusPill, EmptyState, Skeleton } from '../components/Layout';

export function IncomingPage() {
  const { user } = useAuth();
  const [parts, setParts] = useState<Participation[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.incomingParticipations(), api.projects()])
      .then(([ps, projs]) => {
        setParts(ps.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setProjects(Object.fromEntries(projs.map(p => [p.id, p])));
      })
      .finally(() => setLoading(false));
  }, [user]);

  const byProject: Record<string, Participation[]> = {};
  for (const p of parts) {
    if (!byProject[p.projectId]) byProject[p.projectId] = [];
    byProject[p.projectId].push(p);
  }

  const verified = parts.filter(p => p.status === 'verified').length;
  const pending = parts.filter(p => p.status === 'pending_verification').length;

  return (
    <div className="carpan-social-page space-y-5">
      <section className="carpan-social-intro"><PageHeader title={t("Gelen Referanslar")}
        subtitle={t("{0} doğrulanmış · {1} beklemede", [verified, pending])} /></section>

      {/* Summary */}
      {parts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label={translateText("Toplam")} value={parts.length} color="var(--ink)" />
          <StatCard label={t("Doğrulandı")} value={verified} color="var(--success)" />
          <StatCard label={t("Bekliyor")} value={pending} color="var(--warning)" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : parts.length === 0 ? (
        <EmptyState icon={<ArrowDownLeft size={36} />} title={t("Henüz gelen referans yok")}
          body={t("Referans linkinizi yayınladıktan sonra gelen katılımlar burada görünecek.")} />
      ) : (
        <div className="space-y-4">
          {Object.entries(byProject).map(([projId, projParts]) => {
            const proj = projects[projId];
            return (
              <Card key={projId} className="carpan-social-card carpan-incoming-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold" style={{ color: 'var(--ink)' }}>{proj?.name || projId}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {projParts.filter(p => p.status === 'verified').length}/{projParts.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {projParts.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0"
                      style={{ borderColor: 'var(--border)' }}>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        {p.participationType === 'free' ? t("Ücretsiz") : t("Eski ücretli kayıt")} ·{' '}
                        {new Date(p.createdAt).toLocaleDateString(getLocale())}
                      </div>
                      <StatusPill status={p.status} />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="carpan-social-card carpan-social-stat rounded-2xl p-3 border text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}
