/** Decorative network paths echo the Carpan landing artwork; not a data chart. */
export function ArcTerminalArt() {
  return <svg className="aw-signal-art" viewBox="0 0 1000 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><pattern id="aw-signal-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="currentColor" strokeWidth=".6"/></pattern></defs>
    <rect width="1000" height="260" fill="url(#aw-signal-grid)" opacity=".2"/>
    <g fill="none" stroke="currentColor"><path d="M450 260C570 230 620 5 760 60S930 220 1040 80" strokeWidth="1.2"/><path d="M390 290C550 100 700 300 800 160S940 0 1040 50" strokeWidth=".7" opacity=".6"/><circle cx="760" cy="60" r="6"/><circle cx="800" cy="160" r="4"/></g>
  </svg>;
}
