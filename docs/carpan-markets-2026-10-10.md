# Arc market research — 10 October 2026

## Implemented

Tokens & Markets now has documented assets, Arc pools and new pools. The fixed Arc GeckoTerminal public API supplies normalized price, base-side24hour change, pool24hour volume/liquidity/transaction count and source OHLCV. Pool detail includes24hour/7day candlesticks, base/quote selection, pointer/keyboard inspection, exact token evidence and appropriate Terminal links. The market detail omits the large discovery hero to prioritize the chart; the approved discovery/home/auth scenes remain intact. English/TR and responsive card/table layouts are retained.

Token prices come from the exact matching token in the returned pool with the highest reported liquidity. Coverage is the provider's returned first page, not the entire market. Displayed volume and liquidity belong to the selected pool; they are not global token metrics and must not be summed across asset rows. Quote-token24hour changes are unavailable because the provider field describes the base token. Missing values remain null; true reported zero is distinct. USYC has no matching pool in the initial source snapshot, with an on-demand token-pool lookup available. No hypothetical price, fixedUSDCpeg, supply or marketcap is manufactured.

Provider Arc IDs and token relationships are validated. Native zero-address USDC is mapped to Arc's single canonical USDC interface; no second asset/balance or native `decimals()` lookup is introduced. Fortyhex-character pool addresses have Terminal contract links. Sixty-fourhex-character pool IDs are displayed as identifiers and link to the provider, never treated as EVM contract addresses. Unknown provider tokens are not inserted as approved project records. New pools remain separate from Upcoming announcements.

## Data engine

- Read-only `GET /ecosystem/markets`, `/pools/:id` and `/pools/:id/chart` are restricted to the fixed Arc provider origin and validated IDs/enums. Demo realms return explicit unavailability without real provider requests.
- Shared SQLite public-data cache and request coalescing survive API restart. Pool snapshots cache60seconds, token pool lookup120seconds, charts300seconds; dated stale values may be retained up to15minutes. Error/rate-limit retries back off60seconds. Provider calls are capped at8perminute for the API process, below the conservative advertised public limit.
- Visible pages refresh60seconds; hidden pages stop polling. No background whole-chain market scan, provider credential or paid subscription is introduced. Source attribution uses the unmodified official provider mark and hyperlink near data; each dataset identifies retrieval time and freshness.
- OHLCV rejects malformed/future rows, deduplicates timestamps and orders source candles. Empty intervals are not interpolated or represented as real trades.

## Source scope and conditions

Primary references: [GeckoTerminal developer API](https://www.geckoterminal.com/dex-api), [API specification](https://api.geckoterminal.com/docs/index.html), [attribution guide](https://brand.coingecko.com/resources/attribution-guide), [website terms](https://www.geckoterminal.com/terms-conditions), [API terms](https://www.coingecko.com/en/api_terms). The developer page explicitly invites app price/liquidity integration with the public API. This release uses that public service for the existing no-charge prototype, with attribution and request caps; it is not a declaration of an unrestricted commercial redistribution licence, SLA, provider partnership or endorsement. Paid commercialisation or data resale requires confirming the applicable provider plan/permission. DefiLlama republishing permission and any paid CoinGecko plan remain unresolved and are not activated. DexScreener was checked as a technical comparison but is not a production fallback in this release.

Official mark provenance and hash are recorded in `public/images/market-sources.json`; no sample attribution screenshot or generated logo is used.

## Verification

239server tests/1830assertions across48files passed, including6market tests covering network/token binding, nativeUSDC, poolID distinction, missing/zero data, valid candles, shared persistent cache, stale fallback/backoff, global cap, invalid-input rejection and demo isolation. Lint/typecheck/build passed. Real local source supplied20normalized pools and4documented assets with prices; WETH24hour/7day and USDCquote charts loaded.390px detail fits within the document, keyboard inspection works. No account/auth/payment/bridge mutation or financial signing occurs during market QA.

## Remaining stages

Official funding/development/roadmap research, sourced Upcoming events and opt-in project-update notifications remain separate subsequent stages. Public repo/actualCI/grant submission and new financial pilots remain owner-deferred; the grant deadline is not evidence of submission or acceptance.

The next authorised revision now implements these research, Upcoming and in-app notification stages. Their delivery boundaries and evidence are recorded in [Ecosystem updates](carpan-ecosystem-updates-2026-10-10.md); the preceding paragraph records the market release's original scope.

## Live release

`20261010-01` is live, with `20261009-25` retained for rollback. Backup succeeded before the atomic switch; only the API was restarted. The private environment hash and indexer start time remained unchanged. Health at2026-10-09T21:13:22.384Z was successful, Google/email login remained available, X/demo remained disabled, both services were active and database quick_check wasok. The source catalogue retained13entries/5assets and the new provider returned20freshArc pools. Official project/provider image content types and hashes matched overHTTPS.

The live WETH/USDC24hour and7day source charts, USDC quote-side7day series, pool metrics and exact Terminal evidence links were verified. Private public-screen proof: `.local/pilot-evidence/market-live-20261010.png`, excluded from the clean source export. Local V4 detail separately showed64hexPoolID with no incorrect contract link. Existing browser wallet-extension conflicts were observed; no market application error or financial action was introduced. Final lint/typecheck/build passed after number localisation. The clean export contains392source files; no secrets, database or private screenshots are included.
