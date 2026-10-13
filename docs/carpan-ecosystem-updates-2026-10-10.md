# Ecosystem research, Upcoming and project notifications —10October2026

## Delivered scope

Fourteen reviewed profiles now include a funding-context section and source-backed development/roadmap milestones. Arc and Extended have separate catalogue entries and official local logos; the existing12entries, approved community project and address/referral records are preserved. The financing sample is deliberately bounded: Circle's$400Mround mentioned in an April2022source, Blockscout's$3Mseed, Alchemy's$250MSeriesC and1inch's$175MSeriesB. These are historical sourced rounds, not a complete financing database, current valuations or Arc-specific investments. Circle product entries point to the company profile rather than duplicating its funding. Other records explicitly say that financing was not confirmed in the reviewed source set; this is not a claim of never having raised funds.

Development distinguishes released source announcements, documented capabilities and announced plans. Aave's EthereumV4 launch and1inch's Fusion+ development do not establish an Arc deployment. The Graph's2026roadmap remains a plan. Arc's2027Proof-of-Stake exploration is not a confirmed public token launch. Extended's announced Arc migration remains announced, with no invented contract/token/price; its existing documentation still describes Starknet.

## Upcoming

Three official-source records begin this release:

- Arc Microgrants: the source specifies14October2026at23:59ET, stored as15October03:59UTC and shown in the viewer's local time plus original source time. In Türkiye this is15October06:59. Eligibility and application decisions belong to Arc; no application is submitted by Carpan.
- Extended migration: the week of19October2026, not an exact go-live instant. The calendar week is an announced window; completion must be reverified.
- Arc Acceleration Season: the listed22September–24Octoberprogramme. Applications already closed22September. Ongoing programme status is not open application status.

Expired records leave the default Upcoming view; Archive preserves them. Original date precision remains visible. Catalogue membership, grants or an announced week do not guarantee an airdrop or partnership. This is a dated editorial review, not an automatic whole-ecosystem news feed.

## Opt-in notifications

Only existing verified Carpan sessions can manage private preferences. A project must first be saved. New reviewed updates and exact-deadline reminders are independently off by default. Preferences survive reload, UI writes respond immediately and roll back on errors, and stale account/background responses cannot replace a newly saved preference. Saving or deployment never opts an existing user in.

Fourteen project-research fingerprints and three public announcements are reconciled into a persistent source-version registry. A changed review date alone does not issue a notification. New reviewed facts/announcements notify only opted-in users who still save that project. Opt-in does not replay old source history. Exact source deadlines receive one reminder when less than24hours remain; day/week windows get no fabricated hour. Unsave removes preferences and stops future delivery. Read state and event deduplication are scoped per user. No email, browser push, provider credential or paid API is introduced; existing transactional login emails and onchain alerts remain separate.

## Primary sources

- [Arc mainnet and network roadmap](https://www.arc.io/blog/arc-economic-os-internet), [Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq), [Arc Acceleration Season](https://community.arc.io/public/events/arc-acceleration-season-vanemu91dk), [Arc House migration summary](https://community.arc.io/en), [Extended announcement page](https://community.arc.io/public/blogs/extended-is-coming-to-arc-2026-10-08), [Extended documentation](https://docs.extended.exchange/).
- [Circle historical financing context](https://www.circle.com/blog/institutional-adoption-of-digital-dollars-advances-cryptos-coming-of-age), [Blockscout seed](https://www.blog.blockscout.com/blockscout-raises-3m-seed-round-led-by-1kx/), [Alchemy SeriesC](https://www.alchemy.com/blog/alchemy-series-c-release), [1inch SeriesB](https://1inch.com/blog/post/the-1inch-network-closes-a-175-mln-series-b-round).
- [AaveV4 Ethereum launch](https://aave.com/blog/aave-v4-live-ethereum), [1inch Fusion+ launch](https://1inch.com/blog/post/fusion-plus-live), [The Graph roadmap](https://thegraph.com/roadmap/), [Arc data indexers](https://docs.arc.io/arc/tools/data-indexers), [Goldsky chain coverage](https://goldsky.com/chains), [Chainlink documentation](https://docs.chain.link/), [Across](https://across.to/), Circle's [CCTP](https://developers.circle.com/cctp), [Gateway](https://developers.circle.com/gateway), [StableFX](https://developers.circle.com/stablefx) guides.

## Verification and release

246server tests/1964assertions/0fail across49files passed. Seven new tests cover source/research ingestion, precision and expiry, opt-in/no-backfill/deduplication, owner isolation/read state, reminder timing and unsave, malformed-source atomic rejection, HTTP authentication/origin/private caching and demo isolation. Existing login/collection/bridge/source tests passed unchanged. The private loopback UI fixture verified preference persistence, explicit enable/disable and actual notification read state without using any production account. Its test record/session/database are excluded from source and release archives.390px Upcoming has no document overflow; original and local deadline time were verified. Final build, export and live evidence are recorded after deployment.

GitHub publication, actual hostedCI, application submission, new financial pilots and an offsite backup destination remain owner-deferred or unprovided. No grant submission, funding acceptance or user traction is claimed.

## Live deployment evidence

Release `20261010-02` is live; `20261010-01` remains for rollback. Backup succeeded before the atomic switch, API restarted only, private environment hash and indexer start were unchanged. Health at2026-10-09T21:59:36.307Z wasok; Google/email remained available, X/demo remained disabled, both services stayed active and database quick_check passed. Live catalogue retained the real community entry plus14curated entries,5assets and17source versions. The public feed returned3reviewed announcements; anonymous private inbox access was401. All11project logo content types/hashes matched and the existing market source returned20freshpools. No production preferences or financial/auth/account records were changed for QA.

Live Upcoming cards showed the correct source and local deadline time, programme application closure and migration week. The Extended research link, announced status and official logo loaded; desktop had no outer overflow. Public proof `.local/pilot-evidence/ecosystem-upcoming-live-20261010.png` is private and excluded from the402fileclean source export. Final build passed; existing third-party bundler size/annotation warnings remain unrelated to this revision. The temporary responsive viewport was reset. The private test-login route was closed and the normal isolated local API restored.
