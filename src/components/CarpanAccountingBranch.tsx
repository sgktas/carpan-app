import {ArrowUpRight} from 'lucide-react';
import {BRAND} from '../brand';
import {useI18n} from '../i18n';

export function CarpanAccountingBranch(){const {t}=useI18n();return <section className="carpan-accounting-branch carpan-accounting-branch--editorial" aria-labelledby="carpan-accounting-heading">
  <div className="carpan-accounting-media"><div className="carpan-accounting-screen"><img src="/images/carpan-ai-screen-1586.webp" srcSet="/images/carpan-ai-screen-793.webp 793w, /images/carpan-ai-screen-1586.webp 1586w" sizes="(max-width: 760px) 280px, (max-width: 1100px) 36vw, 420px" width={1586} height={992} loading="lazy" decoding="async" alt={t('Çarpan muhasebe otomasyonu ekranı')}/></div></div>
  <div className="carpan-accounting-copy"><span className="carpan-panel-caption">{t('ÇARPAN / MUHASEBE')}</span><h2 id="carpan-accounting-heading">{t(BRAND.accountingName)}</h2><strong>{t(BRAND.accountingDescription)}</strong><p>{t('Carpan’ın Türkiye’ye yönelik muhasebe ürünü. Çalışan yazılımımız ve muhasebe deneyimimiz, aynı ürün ailesinin bir parçası.')}</p><a href={BRAND.accountingUrl} target="_blank" rel="noopener noreferrer">{t('Muhasebe asistanını keşfet')}<ArrowUpRight size={16}/><small>çarpan.com</small></a></div>
  </section>;}
