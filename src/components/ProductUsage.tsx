import { useEffect, useId, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Bot, Check, Database, LogIn, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n/index';
import type { ProductUsageClient, ProductUsageDaily, ProductUsageEvent, ProductUsageModule, ProductUsageStockId, ProductUsageSummary } from '../product-usage-contract';
import './product-usage.css';

type Series = 'activeAccounts' | 'loginEvents' | 'actionRequests';
type Say = (english: string, turkish: string) => string;

function DailyChart({ data, series, label, locale, say }: { data: ProductUsageSummary; series: Series; label: string; locale: string; say: Say }) {
  const gradientId = useId().replace(/:/g, '');
  const width = 820, height = 210, left = 44, right = 12, top = 16, bottom = 29;
  const startDay = data.range.measurementSince.slice(0, 10);
  const measured = data.days.map((day, index) => ({ day, index })).filter(({ day }) => day.day >= startDay);
  const maximum = Math.max(1, ...measured.map(({ day }) => day[series]));
  const floor = height - bottom;
  const x = (index: number) => left + (data.days.length <= 1 ? (width - left - right) / 2 : index / (data.days.length - 1) * (width - left - right));
  const y = (value: number) => floor - value / maximum * (height - top - bottom);
  const path = measured.map(({ day, index }, i) => `${i === 0 ? 'M' : 'L'}${x(index).toFixed(2)},${y(day[series]).toFixed(2)}`).join(' ');
  const area = measured.length ? `${path} L${x(measured[measured.length - 1].index)},${floor} L${x(measured[0].index)},${floor} Z` : '';
  const date = (day: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  const ticks = data.days.length ? [...new Set([0, Math.floor((data.days.length - 1) / 2), data.days.length - 1])] : [];
  return <div className="pu-chart">
    {measured.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label} · ${data.range.fromDay} — ${data.range.toDay} · UTC`}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b6d3ff" stopOpacity=".19" /><stop offset="100%" stopColor="#b6d3ff" stopOpacity="0" /></linearGradient></defs>
      {[...new Set([0, Math.floor(maximum / 2), maximum])].map(value => <g key={value}><line x1={left} y1={y(value)} x2={width - right} y2={y(value)} className="pu-gridline" /><text x={left - 10} y={y(value) + 4} textAnchor="end">{value.toLocaleString(locale)}</text></g>)}
      {area && <path d={area} fill={`url(#${gradientId})`} />}
      {path && <path d={path} className="pu-chart-line" />}
      {measured.map(({ day, index }) => <circle key={day.day} cx={x(index)} cy={y(day[series])} r={measured.length <= 7 ? 3.5 : 2} className="pu-chart-dot"><title>{`${day.day} UTC · ${label}: ${day[series].toLocaleString(locale)}`}</title></circle>)}
      {ticks.map(index => <text key={index} x={x(index)} y={height - 6} textAnchor={index === 0 ? 'start' : index === data.days.length - 1 ? 'end' : 'middle'}>{date(data.days[index].day)}</text>)}
    </svg> : <div className="pu-empty"><Activity size={22} /><p>{say('No measured days in this range yet.', 'Bu aralıkta henüz ölçülmüş gün yok.')}</p></div>}
    <p className="pu-chart-note">{say('Daily totals use UTC. Dates before measurement began have no recorded activity data.', 'Günlük toplamlar UTC kullanır. Ölçüm başlamadan önceki tarihler için etkinlik verisi yok.')}</p>
    <details className="pu-daily"><summary>{say('View daily figures', 'Günlük değerleri gör')}<ArrowUpRight size={13} /></summary>
      <div className="pu-table-scroll" tabIndex={0} role="region" aria-label={say('Daily usage figures, scroll horizontally', 'Günlük kullanım değerleri, yatay kaydırılabilir')}>
        <table><caption className="pu-sr-only">{say('Daily measured account activity and request counts', 'Günlük ölçülen hesap etkinliği ve istek sayıları')}</caption><thead><tr><th>{say('Date / UTC', 'Tarih / UTC')}</th><th>{say('Active accounts', 'Etkin hesaplar')}</th><th>{say('Completed logins', 'Tamamlanan girişler')}</th><th>{say('Product action requests', 'Ürün işlem istekleri')}</th><th>{say('Crawler requests', 'Bot istekleri')}</th><th>{say('Unclassified requests', 'Sınıflanmayan istekler')}</th></tr></thead><tbody>{[...data.days].reverse().map(day => {
          const isMeasured = day.day >= startDay;
          const value = (key: keyof Omit<ProductUsageDaily, 'day'>) => isMeasured ? day[key].toLocaleString(locale) : '—';
          return <tr key={day.day}><td>{day.day}{!isMeasured && <small>{say('Before measurement', 'Ölçümden önce')}</small>}</td><td>{value('activeAccounts')}</td><td>{value('loginEvents')}</td><td>{value('actionRequests')}</td><td>{value('crawlerRequests')}</td><td>{value('unclassifiedRequests')}</td></tr>;
        })}</tbody></table>
      </div>
    </details>
  </div>;
}

export function ProductUsage() {
  const { language } = useI18n();
  const say: Say = (english, turkish) => language === 'tr' ? turkish : english;
  const locale = language === 'tr' ? 'tr-TR' : 'en-US';
  const [days, setDays] = useState<7 | 30 | 90>(7), [includeAdmin, setIncludeAdmin] = useState(false);
  const [data, setData] = useState<ProductUsageSummary | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [series, setSeries] = useState<Series>('activeAccounts');
  const sequence = useRef(0);
  useEffect(() => {
    let current = true;
    const requestId = ++sequence.current;
    setLoading(true); setError('');
    api.productUsage(days, includeAdmin).then(result => {
      if (current && requestId === sequence.current) setData(result);
    }).catch(caught => {
      if (current && requestId === sequence.current) setError(caught instanceof Error ? caught.message : 'Usage could not be loaded.');
    }).finally(() => { if (current && requestId === sequence.current) setLoading(false); });
    return () => { current = false; };
  }, [days, includeAdmin, refresh]);

  const number = (value: number) => value.toLocaleString(locale);
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value));
  const moduleLabels: Record<ProductUsageModule, string> = { finance: say('Finance', 'Finans'), terminal: 'Terminal', ecosystem: 'Ecosystem', auth: say('Sign-in', 'Giriş'), account: say('Account', 'Hesap'), bridge: say('Bridge', 'Köprü'), integration: say('Integration API', 'Entegrasyon API') };
  const eventLabels: Record<ProductUsageEvent, string> = {
    product_read: say('Product reads', 'Ürün okuma istekleri'), finance_refresh_request: say('Movement updates', 'Hareket güncelleme istekleri'), finance_change_request: say('Finance changes', 'Finans değişiklik istekleri'), collection_change_request: say('Collection changes', 'Tahsilat değişiklik istekleri'), export_request: say('Export requests', 'Çıktı istekleri'), watchlist_change_request: say('Watchlist changes', 'Takip listesi değişiklik istekleri'), terminal_change_request: say('Terminal changes', 'Terminal değişiklik istekleri'), ecosystem_change_request: say('Ecosystem changes', 'Ekosistem değişiklik istekleri'), referral_change_request: say('Referral changes', 'Referans değişiklik istekleri'), account_change_request: say('Account changes', 'Hesap değişiklik istekleri'), bridge_history_request: say('Bridge history changes', 'Köprü geçmişi değişiklik istekleri'), login_google: say('Google sign-in', 'Google ile giriş'), login_email: say('Email sign-in', 'E-posta ile giriş'), login_wallet: say('Wallet sign-in', 'Cüzdan ile giriş'), login_x: say('X sign-in', 'X ile giriş'),
  };
  const stockLabels: Record<ProductUsageStockId, string> = {
    accounts: say('Accounts', 'Hesaplar'), verified_wallet_accounts: say('Accounts with verified wallets', 'Doğrulanmış cüzdanlı hesaplar'), business_workspaces: say('Business workspaces', 'İşletme çalışma alanları'), business_wallets: say('Business wallets', 'İşletme cüzdanları'), collection_requests: say('Collection requests', 'Tahsilat talepleri'), collection_receipts: say('Collection receipt records', 'Tahsilat işlem kanıtları'), saved_projects: say('Saved projects', 'Kaydedilmiş projeler'), terminal_watches: say('Terminal watches', 'Terminal takip kayıtları'), network_watches: say('Network watches', 'Ağ takip kayıtları'), referral_cards: say('Referral cards', 'Referans kartları'), referral_participations: say('Referral participations', 'Referans katılımları'), export_batches: say('Export batches', 'Çıktı paketleri'),
  };
  const clientLabels: Record<ProductUsageClient, string> = {
    ahrefsbot: 'AhrefsBot', gptbot: 'GPTBot', other_crawler: say('Other crawler labels', 'Diğer bot etiketleri'), authenticated_account: say('Authenticated account', 'Oturum açmış hesap'), internal_admin: say('Administrator account', 'Yönetici hesabı'), unclassified: say('Unclassified public traffic', 'Sınıflanmayan genel trafik'), service_api: say('Integration API requests', 'Entegrasyon API istekleri'),
  };
  const metrics: { key: Series; label: string }[] = [ { key: 'activeAccounts', label: say('Active accounts', 'Etkin hesaplar') }, { key: 'loginEvents', label: say('Completed logins', 'Tamamlanan girişler') }, { key: 'actionRequests', label: say('Product action requests', 'Ürün işlem istekleri') } ];
  const botClients: ProductUsageClient[] = ['ahrefsbot', 'gptbot', 'other_crawler'];
  const clientCount = (client: ProductUsageClient) => data?.traffic.filter(row => row.client === client).reduce((total, row) => total + row.requests, 0) ?? 0;
  const periodActions = data?.events.filter(row => !row.event.startsWith('login_')) ?? [];
  const logins = data?.events.filter(row => row.event.startsWith('login_')) ?? [];
  const previousSelection = data && (data.range.days !== days || data.includeAdmin !== includeAdmin);

  return <section className="pu-console" aria-labelledby="product-usage-title" aria-busy={loading}>
    <header className="pu-heading"><div><span className="pu-private"><ShieldCheck size={14} />{say('Private administration', 'Özel yönetim')}</span><h2 id="product-usage-title">{say('Product usage', 'Ürün kullanımı')}</h2><p>{say('See account activity and business records separately from automated public traffic.', 'Hesap etkinliğini ve işletme kayıtlarını otomatik genel trafikten ayrı izle.')}</p></div><button type="button" className="pu-refresh" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={15} />{loading ? say('Loading…', 'Yükleniyor…') : say('Refresh report', 'Raporu yenile')}</button></header>
    <div className="pu-controls"><div className="pu-range" aria-label={say('Reporting period', 'Rapor dönemi')}>{([7, 30, 90] as const).map(value => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value} {say('days', 'gün')}</button>)}</div><label className="pu-admin-check"><input type="checkbox" checked={includeAdmin} onChange={event => setIncludeAdmin(event.target.checked)} />{say('Include administrators', 'Yöneticileri dahil et')}</label><span className="pu-period">{data ? `${data.range.fromDay} — ${data.range.toDay} · UTC` : say('UTC reporting', 'UTC raporlama')}</span></div>
    {error && <div className="pu-error" role="alert"><div><strong>{say('Report could not be loaded.', 'Rapor yüklenemedi.')}</strong><p>{error}</p>{data && <p>{say('The last successful report remains visible below.', 'Son başarılı rapor aşağıda görünmeye devam ediyor.')}</p>}</div><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>{say('Try again', 'Yeniden dene')}</button></div>}
    {previousSelection && <p className="pu-notice" role="status">{say('The previous selection is still displayed until the new report loads.', 'Yeni rapor yüklenene kadar önceki seçimin verileri gösteriliyor.')}</p>}
    {loading && !data && <div className="pu-loading" role="status"><div className="pu-skeleton-grid">{[0, 1, 2, 3].map(value => <span key={value} />)}</div><span className="pu-skeleton-chart" /><p>{say('Loading measured activity…', 'Ölçülen etkinlik yükleniyor…')}</p></div>}
    {data && <>
      <div className="pu-kpis">
        <article><span><Users size={16} />{say('Active accounts', 'Etkin hesaplar')}</span><strong>{number(data.totals.activeAccounts)}</strong><p>{say('Distinct authenticated accounts using the product in this period.', 'Bu dönemde ürünü kullanan farklı, oturum açmış hesaplar.')}</p></article>
        <article><span><LogIn size={16} />{say('Completed logins', 'Tamamlanan girişler')}</span><strong>{number(data.totals.loginEvents)}</strong><p>{say('Successful Google, email, wallet or X login completions.', 'Başarılı Google, e-posta, cüzdan veya X girişleri.')}</p></article>
        <article><span><Check size={16} />{say('Product action requests', 'Ürün işlem istekleri')}</span><strong>{number(data.totals.actionRequests)}</strong><p>{say('Successful action requests. Repeated requests may be included.', 'Başarılı işlem istekleri. Yinelenen istekler dahil olabilir.')}</p></article>
        <article><span><Bot size={16} />{say('Crawler-labelled requests', 'Bot etiketli istekler')}</span><strong>{number(data.totals.crawlerRequests)}</strong><p>{say('Claimed crawler User-Agents, counted separately from accounts.', 'Bot olduğunu bildiren User-Agent etiketleri; hesaplardan ayrı sayılır.')}</p></article>
      </div>
      <p className="pu-definition"><ShieldCheck size={14} />{say('Accounts are not a verified count of people. Login-only activity and background polling do not make an account active here.', 'Hesaplar doğrulanmış kişi sayısı değildir. Yalnız giriş yapılması ve arka plan sorguları burada hesabı etkin saydırmaz.')}</p>
      <div className="pu-columns">
        <article className="pu-panel pu-activity"><header><div><h3>{say('Activity over time', 'Zaman içindeki etkinlik')}</h3><p>{say('Measured activity within the selected UTC period.', 'Seçili UTC dönemindeki ölçülen etkinlik.')}</p></div><div className="pu-series" aria-label={say('Chart metric', 'Grafik ölçütü')}>{metrics.map(metric => <button type="button" key={metric.key} aria-pressed={series === metric.key} onClick={() => setSeries(metric.key)}>{metric.label}</button>)}</div></header><DailyChart data={data} series={series} label={metrics.find(metric => metric.key === series)!.label} locale={locale} say={say} /></article>
        <article className="pu-panel pu-traffic"><header><div><h3>{say('API traffic', 'API trafiği')}</h3><p>{say('Account, automated and unclassified requests.', 'Hesap, otomatik ve sınıflanmayan istekler.')}</p></div><Bot size={19} /></header><div className="pu-traffic-list"><div><span>{say('Signed-in account requests', 'Oturum açmış hesap istekleri')}</span><strong>{number(data.totals.authenticatedRequests)}</strong></div>{[...botClients, 'unclassified', 'service_api'].map(client => <div key={client}><span>{clientLabels[client as ProductUsageClient]}</span><strong>{number(clientCount(client as ProductUsageClient))}</strong></div>)}</div><p className="pu-panel-note">{say('Bot labels come from User-Agent strings; the source IP owner is not verified. Unclassified requests are not counted as visitors or active accounts.', 'Bot etiketleri User-Agent bilgisinden alınır; kaynak IP sahibi doğrulanmaz. Sınıflanmayan istekler ziyaretçi veya etkin hesap sayılmaz.')}</p></article>
      </div>
      <article className="pu-panel pu-events"><header><div><h3>{say('Product requests', 'Ürün istekleri')}</h3><p>{say('Successful server observations by product and action in this period.', 'Bu dönemde ürün ve işlem bazında başarılı sunucu gözlemleri.')}</p></div><Activity size={19} /></header>
        {periodActions.length ? <div className="pu-table-scroll" role="region" tabIndex={0} aria-label={say('Product request breakdown, scroll horizontally', 'Ürün istek dökümü, yatay kaydırılabilir')}><table><caption className="pu-sr-only">{say('Product request breakdown for the loaded report period', 'Yüklü rapor döneminin ürün istek dökümü')}</caption><thead><tr><th>{say('Workspace', 'Çalışma alanı')}</th><th>{say('Action', 'İşlem')}</th><th>{say('Requests', 'İstekler')}</th><th>{say('Distinct accounts', 'Farklı hesaplar')}</th></tr></thead><tbody>{periodActions.map(row => <tr key={`${row.module}:${row.event}`}><td>{moduleLabels[row.module]}</td><td>{eventLabels[row.event]}</td><td>{number(row.requests)}</td><td>{number(row.activeAccounts)}</td></tr>)}</tbody></table></div> : <div className="pu-empty"><Activity size={23} /><strong>{say('No product requests recorded yet', 'Henüz ürün isteği kaydedilmedi')}</strong><p>{say('New measured requests will appear after authenticated product activity.', 'Oturum açmış hesaplar ürünü kullandıkça yeni ölçülen istekler burada görünür.')}</p></div>}
        <p className="pu-panel-note">{say('Request counts do not prove a newly created record, completed transfer or accounting posting. Accounts can appear in more than one row.', 'İstek sayıları yeni kayıt, tamamlanan transfer veya muhasebe kaydı oluştuğunu kanıtlamaz. Aynı hesap birden fazla satırda bulunabilir.')}</p>
      </article>
      <div className="pu-columns pu-bottom-columns"><article className="pu-panel"><header><div><h3>{say('Stored business records', 'Kaydedilmiş işletme verileri')}</h3><p>{say('Current record totals, not events within the selected period.', 'Mevcut kayıt toplamları; seçili dönemdeki olay sayıları değildir.')}</p></div><Database size={19} /></header><dl className="pu-stock">{data.stock.map(record => <div key={record.id}><dt>{stockLabels[record.id]}</dt><dd>{record.available && record.value !== null ? number(record.value) : <span className="pu-unavailable">{say('Unavailable', 'Alınamadı')}</span>}</dd></div>)}</dl><p className="pu-panel-note">{say('Historical records can exist before usage measurement began. These totals are not daily active account history.', 'Kullanım ölçümü başlamadan önce kayıtlar oluşturulmuş olabilir. Bu toplamlar geçmiş günlük etkin hesap verisi değildir.')}</p></article>
        <article className="pu-panel pu-logins"><header><div><h3>{say('Sign-in methods', 'Giriş yöntemleri')}</h3><p>{say('Completed login events in this period.', 'Bu dönemde tamamlanan giriş olayları.')}</p></div><LogIn size={19} /></header><div className="pu-login-list">{(['login_google', 'login_email', 'login_wallet', 'login_x'] as const).map(event => { const value = logins.filter(row => row.event === event).reduce((total, row) => total + row.requests, 0); return <div key={event}><span>{eventLabels[event]}</span><strong>{number(value)}</strong></div>; })}</div><p className="pu-panel-note">{say('One account may sign in several times or use multiple linked methods. Completed logins are events, not new accounts.', 'Bir hesap birkaç kez giriş yapabilir veya birden fazla bağlı yöntem kullanabilir. Tamamlanan girişler olay sayısıdır; yeni hesap sayısı değildir.')}</p><div className="pu-measurement"><span><ShieldCheck size={15} />{say('Measurement scope', 'Ölçüm kapsamı')}</span><dl><div><dt>{say('Started', 'Başlangıç')}</dt><dd>{timestamp(data.range.measurementSince)} UTC</dd></div><div><dt>{say('Retention', 'Saklama')}</dt><dd>{data.range.retentionDays} {say('days', 'gün')}</dd></div><div><dt>{say('Administrators', 'Yöneticiler')}</dt><dd>{data.includeAdmin ? say('Included', 'Dahil') : say('Excluded', 'Hariç')}</dd></div><div><dt>{say('Report refreshed', 'Rapor yenilendi')}</dt><dd>{timestamp(data.generatedAt)} UTC</dd></div></dl><p>{say('No analytics cookies, external analytics service or additional Explorer API requests are needed for this report.', 'Bu rapor için analiz çerezi, harici analiz hizmeti veya ek Explorer API isteği kullanılmaz.')}</p></div></article></div>
    </>}
  </section>;
}
