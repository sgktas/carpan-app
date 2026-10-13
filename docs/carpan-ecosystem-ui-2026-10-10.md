# Carpan Ecosystem — content and market interface

Date: 10 October 2026. Release: 20261010-03. Scope: frontend presentation of the existing Ecosystem data and account workflows.

## Preserved interface

The global logo, header/menu, footer, homepage, Finance, Terminal and auth source files are unchanged. The Ecosystem cinematic scene, headline, hero proportions/composition, profile header and category tabs are unchanged. The original ecosystem.css is byte-identical. New content styles are scoped to Ecosystem components. No package, server, indexer, financial contract or provider configuration changes are included.

## Implemented content

- Overview has a compact coverage strip, six selected project research cards, category entry points and an Upcoming agenda alongside the cards. Selection is editorial, not a performance ranking.
- Projects and My Watchlist use project cards by default, with an optional compact list. Search, category, integration status and existing URL filters remain available. Sparse market/token table columns were removed from the project directory. Card facts, actions and spacing align across entries.
- Project cards distinguish sourced Arc addresses from participant membership and announced plans. Selected historical company funding rounds show their own year; Circle product records do not duplicate parent funding. Documented token links open the asset directory.
- Research profiles group project brief, chain evidence, funding timeline, development, sources and existing tool actions into distinct cards. Upcoming uses a date rail and type filters, retaining exact/day/week precision and archive behavior.
- Watchlist entry states, notification preferences and the in-app inbox are clearer. Existing account scope, save/unsave behavior, opt-in defaults, no historical replay, optimistic error rollback and stale response guards are preserved. The legacy saved=1 alias retains the effective watchlist view when a filter/layout changes.

## Tokens & Markets

Documented asset cards lead to existing Arc market data. Pool research has a wide chart with an adjacent evidence/metrics panel, asset-side selection and 24H/7D ranges. The chart uses actual OHLCV candles or a selectable close-price line plus volume bars. Responsive dimensions, USD price axes, time labels and crosshair/OHLC inspection support desktop and mobile. Keyboard inspection and previous/next controls provide a hover-independent path; pointer movement does not flood the live announcement region.

Missing time intervals remain gaps. Missing, stale, unavailable and loading data are explicit. Quote-side prices do not reuse the base asset's 24-hour percentage. Native USDC normalization and the distinction between an EVM contract and a pool identifier remain intact. Source attribution, freshness and pool-specific metric labels are visible. Refresh retains the last same-key snapshot while a new response is pending.

The source remains the existing bounded GeckoTerminal integration: one provider page, not a full Arc liquidity census. No market cap, FDV, aggregate token volume, popularity score, invented candle or cross-network deployment is inferred. Upcoming remains editor-reviewed; email/push notifications and automatic external news ingestion are not added.

## Reference adaptation

The information hierarchy draws on [RootData project research](https://www.rootdata.com/projects), [DappRadar category discovery](https://dappradar.com/rankings), [CryptoRank Upcoming](https://cryptorank.io/upcoming-ico) and [DropsTab funding history](https://news.dropstab.com/research/crypto-fundraising-rounds-guide). Market layout uses pool research conventions with the existing GeckoTerminal data. These are design references, not endorsements or partnerships. Research and access limitations are recorded in carpan-ecosystem-ui-references-2026-10-10.md.

## Verification

- Production build, TypeScript and src lint pass; no new dependencies. Existing large-bundle warning remains.
- Relevant market/notification regression suites pass: 13 tests, 159 assertions, zero failures. Server code is unchanged; no new financial pilot or production account mutation was performed.
- Protected-file hash audit passes for 265 files; hero/menu/profile-header fragments and original Ecosystem CSS are unchanged.
- Browser preview verifies project category filtering and list view, Upcoming launch filtering and profile navigation, real 24H/7D candles, line/volume rendering, quote-side price and keyboard OHLC inspection.
- At a 390px mobile viewport the document width is 386px and the actual chart adapts to approximately 302px. The normal viewport is restored after testing.

## Release approach

Frontend-only overlay of the prior 20261010-02 release, with a verified backup, archive checksum, protected-file comparisons, readable static-file permissions, atomic symlink switch and rollback on failed checks. API/indexer processes and the private environment file are preserved. Production acceptance is recorded below after deployment. Screenshots and local preview fixtures are private QA artifacts excluded from the source/release payload.

## Production acceptance

20261010-03 is live; 20261010-02 is retained. The archive checksum, backup result and pre-switch www-data static-read checks passed. HTTPS health was healthy at 2026-10-10T06:40:51.871Z with demoMode=false. Google and email availability remained enabled; database quick_check returned ok. The original Ecosystem hero image matched the preceding release byte-for-byte. API and indexer remained active without restart, and the private environment hash remained unchanged.

Live browser acceptance confirmed the preserved cinematic Overview with new research cards/agenda, and the real cirBTC/USDC price chart with volume and pool evidence. At the normal 1536px viewport the document width remained 1536px. Public screen evidence is saved privately in .local/pilot-evidence/ecosystem-cards-ui-live-20261010.png and ecosystem-pool-ui-live-20261010.png. The 406-file clean repository export was refreshed, excluding secrets, databases, local QA fixtures and screenshots. No GitHub publication or application submission occurred.
