/* carpan-localized */
import { localized } from '../i18n/index';
import React from 'react';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = localized({
  verified: { label: 'Doğrulandı', color: '#22c98a', bg: 'rgba(34,201,138,0.12)' },
  pending_verification: { label: 'Doğrulama Bekliyor', color: '#f0c040', bg: 'rgba(240,192,64,0.12)' },
  reserved: { label: 'Ayrıldı', color: '#2ec4f0', bg: 'rgba(46,196,240,0.12)' },
  rejected: { label: 'Reddedildi', color: '#f06080', bg: 'rgba(240,96,128,0.12)' },
  disputed: { label: 'İtiraz Edildi', color: '#f07030', bg: 'rgba(240,112,48,0.12)' },
  expired: { label: 'Süresi Doldu', color: '#b5b5c1', bg: 'rgba(181,181,193,0.10)' },
  approved: { label: 'Onaylı', color: '#22c98a', bg: 'rgba(34,201,138,0.12)' },
  pending: { label: 'Beklemede', color: '#f0c040', bg: 'rgba(240,192,64,0.12)' },
  active: { label: 'Aktif', color: '#2ec4f0', bg: 'rgba(46,196,240,0.12)' },
  released: { label: 'Ödendi', color: '#22c98a', bg: 'rgba(34,201,138,0.12)' },
  refunded: { label: 'İade Edildi', color: '#b5b5c1', bg: 'rgba(181,181,193,0.10)' },
  free: { label: 'Ücretsiz', color: '#8fa3bf', bg: 'rgba(143,163,191,0.12)' },
  paid: { label: 'Ücretli', color: '#2ec4f0', bg: 'rgba(46,196,240,0.12)' },
});

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: '#b5b5c1', bg: 'rgba(181,181,193,0.10)' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}
