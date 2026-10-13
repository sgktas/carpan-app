export type VisibilitySource = {
  hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};
export type PollingTimers = { setInterval(callback: () => void, delay: number): number; clearInterval(id: number): void };

/** Pauses timers in hidden pages and refreshes once when the user returns. */
export function startVisiblePolling(callback: () => void, delay: number, page: VisibilitySource, timers: PollingTimers) {
  let timer: number | undefined, stopped = false;
  const tick = () => { if (!stopped && !page.hidden) callback(); };
  const stopTimer = () => { if (timer !== undefined) { timers.clearInterval(timer); timer = undefined; } };
  const startTimer = () => { if (!stopped && !page.hidden && timer === undefined) timer = timers.setInterval(tick, delay); };
  const visibility = () => {
    if (page.hidden) stopTimer();
    else { tick(); startTimer(); }
  };
  page.addEventListener('visibilitychange', visibility); startTimer();
  return () => { stopped = true; stopTimer(); page.removeEventListener('visibilitychange', visibility); };
}
