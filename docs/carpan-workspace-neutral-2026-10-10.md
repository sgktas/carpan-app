# Neutral interior workspaces — 10 October 2026

## Scope

The owner replaced the previous category-colored cinematic interior direction. Cinematic imagery remains on the homepage and login/register. Finance, Terminal and Ecosystem now share one operational palette: graphite canvas, solid raised cards, visible borders, white text and blue actions/selection. Semantic chart, integration and transaction-status colors remain.

Finance's large first-use artwork was replaced with a compact title and existing address research form. Ecosystem's cinematic category header was replaced with compact context and existing submit action. Project, research, funding, Upcoming, watchlist, market, wallet, contract, transfer and financial child surfaces use the neutral palette. Market candles/line/volume and provider data continue unchanged. Unpriced assets remain readable with a dashed boundary.

The new shared stylesheet is scoped to `carpan-data-workspace`. Homepage, login/register, global header/footer source, images, translations, server code, packages, account records, API caches and notification behavior remain unchanged. Financial chart changes are presentational colors only.

## Validation

- Production build, TypeScript check and src lint passed.
- A source checksum audit protects 258 files; no unexpected changes.
- Terminal, wallet, contract, collection/payment and community project source additions are root-class-only; main entry adds one CSS import.
- Independent CSS audit found no unscoped shared selectors, syntax issues or remaining Ecosystem gradients.
- Chrome desktop: Finance first use, Ecosystem overview, Tokens & Markets with actual OHLCV, Terminal with public transfer/contract data.
- Chrome 390 × 844: Finance, Terminal and Ecosystem markets document width 386 px, without horizontal page overflow. Long tables and tabs scroll internally.
- The public local preview forwarded only allowed GET requests without cookies. No account mutation, signature or transfer was performed.

This is a visual release. It does not add new market coverage or imply further financial pilot acceptance. GitHub publication, grant submission, paused bridge pilots and an offsite backup target remain separate owner-deferred work.

## Deployment

Target frontend-only release: `20261010-04`, previous `20261010-03` retained. Checksum, backup and atomic switch required. API/indexer process start times and private environment hash must remain unchanged. Final live acceptance is appended after deployment.

### Live acceptance

Release `20261010-04` is live. Backup, archive checksum, atomic switch and database quick check passed. HTTPS health at `2026-10-10T07:03:22.151Z` returned `ok=true`, `demoMode=false`; Google and email login are available. Server source matched the previous release. API/indexer remained active without a restart; private environment hash was unchanged. Original homepage cinematic asset matched the previous release over HTTPS. Live Ecosystem shows the compact header and solid neutral cards. Public screenshot is stored under `.local/pilot-evidence/workspace-neutral-live-20261010.png` and excluded from the clean repository package.

Final polish release `20261010-05` supersedes 04; 04 remains available for rollback. Live inspection found a specificity conflict giving the compact bridge heading a card background and old purple number labels. Scoped CSS now makes the heading transparent and key values white, with common blue context. Build/source checks and the same backup/checksum/atomic/integrity/provider/process/environment gates passed. Final health: `2026-10-10T07:08:16.139Z`. Live bridge computed styles confirmed transparent heading, blue context (`rgb(140,187,255)`) and white preflight values (`rgb(246,248,252)`). Live markets confirmed five asset cards, actual chart rendering and unpriced-card opacity 1. Finance confirmed no first-use artwork and the shared graphite canvas. The proof screenshot was refreshed from the final live release, viewport reset and the task tab closed. No amount, quote, wallet signature or financial transaction was submitted.
