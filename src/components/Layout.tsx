/* carpan-localized */
import { t } from '../i18n/index';
import React from 'react';
import { ArcTerminalHeader } from './ArcTerminalHeader';
import { useAuth } from '../hooks/useAuth';
import '../pages/arc-wallet.css';
import '../pages/arc-terminal-v3.css';
import '../pages/carpan-workspace.css';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const active = 'account';

  return (
    <div className="aw-terminal aw-terminal-v3 carpan-workspace">
      {user?.isDemo && <div className="carpan-workspace-demo">{t("DEMO · Örnek hesap ve işlemler")}</div>}
      <ArcTerminalHeader active={active} />
      <main className="at-root-main at-module-main carpan-workspace-main">
        {children}
      </main>
    </div>
  );
}

// Small helper for page-level back breadcrumbs
export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="cp-page-header flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

// Reusable status pill
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    verified: { label: t("Doğrulandı"), color: 'var(--success)' },
    pending_verification: { label: t("Bekliyor"), color: 'var(--warning)' },
    rejected: { label: t("Reddedildi"), color: 'var(--danger)' },
    disputed: { label: t("İtiraz"), color: '#f07030' },
    expired: { label: t("Süresi Doldu"), color: 'var(--subtle)' },
    reserved: { label: t("Ayrıldı"), color: 'var(--accent)' },
    active: { label: t("Aktif"), color: 'var(--success)' },
    awaiting_payment: { label: t("Ödeme Bekleniyor"), color: 'var(--warning)' },
    completed: { label: t("Tamamlandı"), color: 'var(--success)' },
    released: { label: t("Ödendi"), color: 'var(--success)' },
    pending: { label: 'Beklemede', color: 'var(--warning)' },
    refunded: { label: t("İade Edildi"), color: 'var(--muted)' },
    demo: { label: t("Demo kaydı"), color: 'var(--violet)' },
  };
  const { label, color } = map[status] || { label: status, color: 'var(--muted)' };
  return (
    <span className="cp-status-pill inline-flex items-center text-xs px-2 py-0.5 rounded-full tabular-nums"
      style={{ color, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
      {label}
    </span>
  );
}

// Inline loading skeleton
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`cp-skeleton rounded animate-pulse ${className || ''}`} />
  );
}

// Empty state
export function EmptyState({ icon, title, body, action }: {
  icon: React.ReactNode; title: string; body: string; action?: React.ReactNode;
}) {
  return (
    <div className="cp-empty-state flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="cp-empty-icon mb-1">{icon}</div>
      <div className="cp-empty-title font-semibold text-base">{title}</div>
      <div className="cp-empty-body text-sm max-w-xs">{body}</div>
      {action}
    </div>
  );
}

// Primary button
export function Btn({ children, onClick, disabled, loading, variant = 'primary', size = 'md', className = '' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; className?: string;
}) {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-base' };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`cp-button cp-button--${variant} flex items-center justify-center gap-2 rounded-xl font-semibold disabled:cursor-not-allowed ${sizes[size]} ${className}`}>
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

// Inline error
export function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="cp-inline-error flex items-start gap-2 text-sm px-3 py-2.5 rounded-xl"
      style={{ background: 'rgba(240,96,128,0.08)', color: 'var(--danger)', border: '1px solid rgba(240,96,128,0.2)' }}>
      {message}
    </div>
  );
}
