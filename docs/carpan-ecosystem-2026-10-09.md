# Carpan Ecosystem — 9 October 2026

## Research and notification stage update —10October

Release20261010-02 adds funding/development profiles, Arc/Extended source entries and official logos, three reviewed Upcoming records and opt-in in-app project notifications. This supersedes the historical V3 pending status below. These are dated official-source reviews with explicit coverage limits, not a whole-ecosystem automatic scraper. [Scope and live evidence](carpan-ecosystem-updates-2026-10-10.md).

## Market stage update — 10 October

Release20261010-01 adds live provider-indexed Arc pools, prices, pool volume/liquidity and source24hour/7day candlesticks. This supersedes the historical V2 market-pending status below. Funding/roadmap research, sourced Upcoming and opt-in project notifications remain pending. See [market scope and evidence](carpan-markets-2026-10-10.md).

## Product revision

The third workspace is **Ecosystem**: discover Arc projects, assets and their source evidence. Finance manages money; Terminal investigates activity. Ecosystem finds the projects worth researching. This replaces the former Social positioning throughout navigation, homepage hero/cards, footer, auth signature, product guide and metadata. Approved cinematic assets remain intact.

## V1 implemented

- `/ecosystem` and backwards compatible `/onchain/projects` routes.
- Overview, Projects, Tokens & Markets, Upcoming and private My Watchlist views.
- Category, integration status and search filters; shared-link filter state.
- Twelve curated source entries, plus approved real community submissions. Circle/CCTP/Gateway/StableFX have documented Arc Mainnet addresses. Aave/1inch/Across/Blockscout/Alchemy/Chainlink/Goldsky/The Graph are treated as participants; no mainnet deployment or token market is inferred for them.
- Mainnet, testnet, announced, participant and unclassified community states remain distinct. Empty filter results are visible; a submitted contract field does not count as reviewed evidence.
- Official-source/date references, contract research and flow links; Terminal address research links back to the corresponding curated project.
- Persistent account-scoped project bookmarks through the existing saved-project API. Unknown IDs and pending proposals cannot be saved. Repeated saving is idempotent. Another user cannot read/remove the owner’s list.
- Five officially documented Arc token contracts: USDC, EURC, USYC, cirBTC and WETH. This is a contract directory, not a market listing. USDC native/ERC-20 remains one balance. WETH has no inferred Circle issuer association.
- Existing proposal/admin/source review, referral and participation workflows remain available as optional opportunities. No invented launch/funding/referral programme.
- English first, Turkish copy and responsive layouts.

The catalogue is a reviewed **9 October source snapshot** served with a 60-second public response cache; it does not imply an automatic refresh from external sources. Community records preserve their own approval/source history. Directory membership, contract evidence, token identity and tradeable pairs are separate facts.

## Sources

- [Arc ecosystem directory](https://www.arc.io/ecosystem): participant listings.
- [Arc contract reference](https://docs.arc.io/arc/references/contract-addresses): network-specific contract/asset addresses.
- [Arc data indexers](https://docs.arc.io/arc/tools/data-indexers): indexing integrations, including Goldsky/The Graph. Their evidence is the documentation rather than an assumed directory listing.
- CryptoRank/CMC informed the comparison-table information architecture; no prices or rankings were copied into Arc records.

## Next development stages

**V2 — market data:** identify actual Arc pairs/pools and a data provider. Store pair/network/token identities, observation time, liquidity/volume definitions and source. Show stale/unavailable states; do not use a global token price as proof of Arc trading. Market cap requires sourced supply. This feed is not connected in V1.

**V3 — events/intelligence:** source-confirmed launches, funding/TGE/unlock milestones and project-specific alerts using the existing Terminal infrastructure. Upcoming currently explains that no verified future event has been added; it does not claim a live event feed. Project saving works now; new project-alert automation is a later stage.

## Verification and release

Focused catalogue tests: 8 passed / 73 assertions. Full server suite: 232 passed / 1,703 assertions across 47 files. Lint, TypeScript and build passed. Browser preview confirmed DeFi filtering, participant detail, five asset rows, guest watchlist/login return and 390px layouts without document overflow; wide tables scroll internally. Financial/authentication signing was not performed for this revision.

Release 22 is live with 21 retained. Live contract-profile acceptance identified one missing curated lookup in the older single-project context. Release **20261009-23** adds that lookup and is live, retaining 22 for rollback. API restart is needed for the new read catalogue and curated bookmark IDs; indexer and private provider settings are preserved. Live deployment/acceptance results follow.


### Live acceptance

22 and23 deployed with checksum verification, a successful backup, atomic symlink switch and API restart. Health/providers/source catalogue/database integrity passed; private configuration hash and indexer start time were unchanged. Latest health was19:49:27UTC. Catalogue shows13entries:12curated references plus the existing owner-approved Carpan listing, not synthetic users or seeded proposals.5assets.

Chrome verified catalogue menu/navigation/reload, CCTP search and sourced profile, real Terminal contract metadata for TokenMessengerV2 (AdminUpgradableProxy), the repaired Circle CCTP project context and return to the project. EN/TR catalogue and390px document fit were checked. Browser was signed out: new curated bookmark persistence/privacy was checked in isolated API tests, not by fabricating a production login. Existing real community approval/save and account/payment pilots remain the earlier separate acceptance evidence. No new payment, account merge or provider configuration.


### Final frontend completion / release24

The language provider was also updating document.title with the retired Social label;24 corrects it in EN/TR.24 is frontend-only with23 retained. Backend directory comparison, private-env hash, API/indexer start invariants and health passed (19:54:13UTC). Final visible title is “Carpan — Arc Finance, Terminal & Ecosystem”. Original source-note content is preserved outside UI translation dictionaries. Lint/typecheck/build passed; last full server suite remains232/1703/0fail.368clean source files. Normal viewport/English were restored and the task tab closed; public Ecosystem profile screenshot .local/pilot-evidence/ecosystem-live-20261009.png is excluded from the source package.
# Profile research revision — 9 October 2026

The second pass deepens the 12 curated project profiles, preserving Finance + Terminal + Ecosystem and the approved cinematic scenes.

- Official logo assets are served locally in catalogue, curated profiles and homepage project cards. Nine distinct marks cover 12 entries; Circle's four products use their parent identity. Asset provenance, review date and hashes are recorded in `public/images/ecosystem/sources.json`. No third-party avatar service or inferred logo is used. Failed images fall back to project initials.
- Each curated profile now provides a bilingual project brief, capabilities, explicit Arc integration context, official research resources and existing Carpan tool links. CCTP leads to the existing USDC bridge; Circle leads to Finance. Gateway and StableFX are research records, not newly enabled deposit/trading services.
- Source-backed contracts retain direct Terminal and flow-map links. Participants without a sourced contract remain clearly distinguished. Funding, roadmaps, future events and Arc market metrics remain unreviewed or unconnected; no values or dates are fabricated.
- Community submissions retain their existing owner description, address review, approval and referral controls. They are not overwritten with curated claims.
- 1inch's official domain was updated to `1inch.com`, following the official site's redirect and the Arc directory link.

Primary project references reviewed: [Circle](https://www.circle.com), [CCTP](https://developers.circle.com/cctp), [Gateway](https://developers.circle.com/gateway), [StableFX](https://developers.circle.com/stablefx), [Aave](https://aave.com/docs), [1inch](https://1inch.com/), [Across](https://across.to/), [Blockscout](https://www.blockscout.com/), [Alchemy](https://www.alchemy.com/), [Chainlink](https://chain.link/), [Goldsky](https://goldsky.com/), [The Graph](https://thegraph.com/). Arc evidence comes from its [directory](https://www.arc.io/ecosystem), [contract reference](https://docs.arc.io/arc/references/contract-addresses) and [data-indexer guide](https://docs.arc.io/arc/tools/data-indexers). Logos come from the directory, Circle's documentation identity and The Graph's official brand package; attribution does not imply partnership.

Verification: lint/typecheck/build passed; 233 server tests, 1791 assertions, no failures across 47 files. The initial sandboxed HTTP test run could not reach loopback; the network-enabled isolated run passed. No financial signing or account mutation is part of this revision.


### Release25 deployment

Deployed atomically to the existing VPS after backup, retaining release24. Live catalogue13records/5assets, all12curated profiles enriched. Health2026-10-09T20:22:08UTC, API/indexer active, database quick_checkOK and provider availability unchanged. The private environment hash and indexer start were preserved; only API restarted. Clean source export383files excludes local credentials, private data and browser evidence.390px profile has no document overflow; all12catalogue images loaded on desktop, TR profile checked. Price/volume/liquidity and sourced future-event feeds remain the next stages.

The new static asset directory initially inherited a restrictive extraction mode. Public logo directories were corrected to0755 and files0644; all9assets returned actual image types and matching recordedSHA256 overHTTPS. This check is included in the release helper. No private configuration permissions changed.

Live UI acceptance: the catalogue rendered all12curated logos; CCTP profile → existing Arc Mainnet USDC bridge opened correctly. No amount was entered or transaction signed. Private public-profile proof saved under .local/pilot-evidence/ecosystem-profile-live-20261009.png, excluded from repository export. Temporary viewport reset and the task tab closed; user language preference retained.
