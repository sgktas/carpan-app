import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Award, Link2, RefreshCw, Users } from 'lucide-react';
import { api } from '../api';
import {useAuth} from '../hooks/useAuth';
import type { LeaderboardEntry, ReferralCard, ReferralProgramStatus } from '../types';
import { Card } from '../components/Card';
import { Btn, EmptyState, InlineError, PageHeader, Skeleton } from '../components/Layout';

type Period = 'week' | 'month' | 'all';

export function ReferralCenterPage() {
  const navigate = useNavigate();
  const {user}=useAuth();
  const [cards, setCards] = useState<ReferralCard[]>([]);
  const [status, setStatus] = useState<ReferralProgramStatus | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardsError,setCardsError]=useState(''),[statusError,setStatusError]=useState(''),[retry,setRetry]=useState(0);
  const [leadersLoading,setLeadersLoading]=useState(true),[leadersError,setLeadersError]=useState(''),[leaderRetry,setLeaderRetry]=useState(0);

  useEffect(() => {
    let current=true;setLoading(true);setCards([]);setStatus(null);setCardsError('');setStatusError('');
    Promise.allSettled([api.referralCards(), api.referralProgram()])
      .then(([newCards, newStatus]) => {
        if(!current)return;
        if(newCards.status==='fulfilled')setCards(newCards.value);else setCardsError(newCards.reason instanceof Error?newCards.reason.message:t('Referans kartları alınamadı.'));
        if(newStatus.status==='fulfilled')setStatus(newStatus.value);else setStatusError(newStatus.reason instanceof Error?newStatus.reason.message:t('Referans hakların alınamadı.'));
      })
      .finally(() => {if(current)setLoading(false);});
    return()=>{current=false;};
  }, [user?.id,retry]);

  useEffect(() => {
    let current=true;setLeadersLoading(true);setLeadersError('');setLeaders([]);
    api.leaderboard(period).then(rows=>{if(current)setLeaders(rows);}).catch((caught: Error) => {if(current)setLeadersError(caught.message);}).finally(()=>{if(current)setLeadersLoading(false);});
    return()=>{current=false;};
  }, [period,leaderRetry,user?.id]);

  return <div className="carpan-social-page space-y-5">
    <section className="carpan-social-intro"><PageHeader title={t("Referans Merkezi")} subtitle={t("Topluluk kartları, doğrulanmış katkılar ve adil dağıtım")} /></section>
    {statusError&&<div><InlineError message={statusError}/><Btn size="sm" variant="ghost" onClick={()=>setRetry(n=>n+1)}>{t('Yeniden dene')}</Btn></div>}

    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
      <Card glass className="carpan-social-card carpan-social-entitlement">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>{t("SENİN HAKLARIN")}</div>
            <h2 className="display text-xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{t("İlk 5 hak ücretsiz")}</h2>
            <p className="text-sm mt-2 max-w-lg" style={{ color: 'var(--muted)' }}>
              {t("Yeni bir beşli hak için beş farklı projede gerçek görevi tamamla. Katılımlar inceleme sonunda sayılır.")}</p>
          </div>
          <div className="display text-5xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
            {status?.availableSlots ?? '—'}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-5 text-xs" style={{ color: 'var(--ink-2)' }}>
          <span className="rounded-full px-3 py-1.5" style={{ background: 'var(--surface-muted)' }}>
            {t("Bağlanmamış hak:")}{status?.unassignedSlots ?? '—'}
          </span>
          <span className="rounded-full px-3 py-1.5" style={{ background: 'var(--surface-muted)' }}>
            {t("İncelemede ayrılan:")}{status?.pendingSlots ?? '—'}
          </span>
          <span className="rounded-full px-3 py-1.5" style={{ background: 'var(--surface-muted)' }}>
            {t("Sıradaki beşli:")}{status?.progress ?? '—'}{t("/5 görev")}</span>
          <span className="rounded-full px-3 py-1.5" style={{ background: 'var(--surface-muted)' }}>
            {t("Toplam doğrulanmış katkı:")}{status?.contributionCount ?? '—'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mt-5">
          <Btn size="sm" onClick={() => navigate('/projects')}>{t("Görevleri keşfet")}<ArrowUpRight size={14}/></Btn>
          <Btn size="sm" variant="ghost" onClick={() => navigate('/my-links')}>{t("Kartlarım")}<Link2 size={14}/></Btn>
        </div>
      </Card>

      <Card className="carpan-social-card">
        <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--ink)' }}><Users size={17}/> {translateText("Carpan profilin")}</div>
        <p className="text-xs mt-1 mb-4" style={{ color: 'var(--muted)' }}>
          {t("Görünen adını, kullanıcı adını ve bağlı cüzdanını ortak hesap merkezinden yönet. Referans kartların da aynı profilini kullanır.")}</p>
        <Btn size="sm" variant="ghost" onClick={() => navigate('/settings')}>{t("Hesabı düzenle")}<ArrowUpRight size={14}/></Btn>
      </Card>
    </div>

    <div className="flex items-center justify-between gap-3">
      <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>{t("Açık referans kartları")}</h2>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>{loading||cardsError?'—':cards.length} {translateText("kart")}</span>
    </div>
    {loading ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Skeleton className="h-40"/><Skeleton className="h-40"/></div>
      : cardsError?<div><InlineError message={cardsError}/><Btn size="sm" variant="ghost" onClick={()=>setRetry(n=>n+1)}>{t('Yeniden dene')}</Btn></div>:
      cards.length === 0 ? <EmptyState icon={<Link2 size={34}/>} title={t("Henüz açık kart yok")}
          body={t("Onaylı projelere eklenen ve kullanılabilir hakkı bulunan kartlar burada görünür.")}/>
        : <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{cards.map(card => <Card key={card.id} className="carpan-social-card carpan-referral-card">
          <div className="flex justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold" style={{ color: 'var(--ink)' }}>{card.projectName}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                {card.ownerName} · @{card.ownerHandle}
              </div>
            </div>
            <div className="text-xs whitespace-nowrap" style={{ color: 'var(--accent)' }}>{card.availableSlots} {t("açık hak")}</div>
          </div>
          <div className="inline-flex rounded-full px-2.5 py-1 mt-3 text-[11px] font-semibold"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            {card.referralMode === 'code' ? t("Davet koduyla katılım") : t("Referans linkiyle katılım")}
          </div>
          <p className="text-sm mt-4" style={{ color: 'var(--ink-2)' }}>{card.participantBenefit || t("Projenin katılımcı faydası henüz belirtilmedi.")}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>{t("Görev:")}{card.condition}</p>
          <div className="flex justify-between items-center mt-4">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>{card.verifiedReferrals} {t("doğrulanmış referans")}</span>
            <Btn size="sm" onClick={() => navigate(`/projects?projectId=${encodeURIComponent(card.projectId)}&linkId=${encodeURIComponent(card.id)}`)}>
              {t("Katıl")}<ArrowUpRight size={13}/>
            </Btn>
          </div>
        </Card>)}</div>}

    <Card className="carpan-social-card carpan-leaderboard-card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="display text-lg font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}><Award size={19}/> {t("Katkı sıralaması")}</h2>
        <div className="flex gap-1" role="tablist" aria-label={t("Sıralama dönemi")}>
          {([['week',translateText("Hafta")],['month',translateText("Ay")],['all',t("Tüm zamanlar")]] as const).map(([key,label]) =>
            <button key={key} role="tab" aria-selected={period === key} onClick={() => setPeriod(key)}
              className="text-xs px-3 py-1.5 rounded-lg" style={{ background: period === key ? 'var(--surface-muted)' : 'transparent', color: period === key ? 'var(--ink)' : 'var(--muted)' }}>{label}</button>)}
        </div>
      </div>
      {leadersLoading?<div role="status" className="text-sm" style={{color:'var(--muted)'}}>{t('Katkı sıralaması yükleniyor…')}</div>:leadersError?<div><InlineError message={leadersError}/><Btn size="sm" variant="ghost" onClick={()=>setLeaderRetry(n=>n+1)}>{t('Yeniden dene')}</Btn></div>:
      leaders.length === 0 ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{t("Bu dönemde doğrulanmış görev yok.")}</p>
        : <div className="space-y-2">{leaders.map(entry => <div key={entry.handle} className="flex items-center gap-3 rounded-xl p-2" style={{ background: 'var(--surface)' }}>
          <span className="w-8 text-center font-semibold" style={{ color: 'var(--accent)' }}>#{entry.rank}</span>
          <span className="flex-1 text-sm truncate" style={{ color: 'var(--ink)' }}>{entry.name} <span style={{ color: 'var(--muted)' }}>@{entry.handle}</span></span>
          <span className="text-sm font-semibold" style={{ color: 'var(--ink-2)' }}>{entry.score}</span>
        </div>)}</div>}
      <p className="text-xs mt-4 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
        <RefreshCw size={12}/> {t("Dönem puanı yenilenir; toplam doğrulanmış katkı geçmişi kalır. Ödül veya token sözü verilmez.")}</p>
    </Card>
  </div>;
}
