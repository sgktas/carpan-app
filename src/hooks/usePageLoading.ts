import {useEffect, useSyncExternalStore} from 'react';

const pending = new Set<symbol>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

/** Track independent page reads without conflating them with wallet/signature actions. */
export function beginPageLoading() {
  const token = Symbol('page load');
  pending.add(token);
  emit();
  return () => { if (pending.delete(token)) emit(); };
}

export async function withPageLoading<T>(read: () => Promise<T>): Promise<T> {
  const stop = beginPageLoading();
  try { return await read(); } finally { stop(); }
}

export function usePageLoading(active: boolean) {
  useEffect(() => { if (active) return beginPageLoading(); }, [active]);
}

export function usePendingPageLoads() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => pending.size > 0, () => false);
}
