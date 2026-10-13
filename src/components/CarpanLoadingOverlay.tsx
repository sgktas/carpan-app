import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {usePageLoading, usePendingPageLoads} from '../hooks/usePageLoading';
import {t, useI18n} from '../i18n';
import {CarpanEmblem} from './CarpanEmblem';
import './carpan-loading.css';

/** A single host keeps concurrent route/auth/data loads from stacking overlays. */
export function CarpanLoadingOverlay() {
  useI18n();
  const pending = usePendingPageLoads();
  const [visible, setVisible] = useState(false);
  const status = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 280);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (!visible) return;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    const padding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (root) root.inert = true;
    if (scrollbar) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`;
    document.body.style.overflow = 'hidden';
    status.current?.focus({preventScroll: true});
    return () => {
      if (root) root.inert = wasInert ?? false;
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = padding;
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({preventScroll: true});
    };
  }, [visible]);

  if (!visible) return null;
  return createPortal(<div className="carpan-loading-overlay">
    <div className="carpan-loading-mark" role="status" aria-live="polite" tabIndex={-1} ref={status}>
      <div className="carpan-loading-emblem"><CarpanEmblem size={72}/></div>
      <span className="sr-only">{t('Sayfa yükleniyor...')}</span>
    </div>
  </div>, document.body);
}

/** Keep layout height while initial auth or a lazy route has no content yet. */
export function CarpanPageLoading() {
  usePageLoading(true);
  return <div className="carpan-loading-placeholder" aria-hidden="true"/>;
}
