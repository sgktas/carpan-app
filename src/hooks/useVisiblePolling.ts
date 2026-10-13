import { useEffect, useRef } from 'react';
import { startVisiblePolling } from '../visible-polling';

export function useVisiblePolling(callback: () => void, delay: number, enabled = true) {
  const current = useRef(callback); current.current = callback;
  useEffect(() => {
    if (!enabled) return;
    return startVisiblePolling(() => current.current(), delay, document, window);
  }, [delay, enabled]);
}
