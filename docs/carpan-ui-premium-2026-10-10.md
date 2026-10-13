# Carpan existing workspace UI polish — 10 October 2026

## Scope

Refine the current Finance, Terminal and Ecosystem workspaces. No new products, market feeds, financial features or provider capabilities. Approved cinematic homepage/login/register, brand, global menu, footer and imagery remain intact. Neutral graphite interiors and one shared blue action accent continue the latest owner direction.

## Changes

- Consistent 1480px maximum content width, 32px desktop padding and 16px mobile padding.
- Compact 32px page headings (28px mobile), balanced descriptions and spacing.
- Solid graphite cards with subtle inset light/depth and clearer hover/focus boundaries; reduced-motion preferences respected.
- Smaller data captions, source labels, chart inspection and OHLC values raised to 11px; descriptions to 13px where scoped.
- Tabular numeric values and clearer existing table labels. Existing units and factual coverage retained.
- Mobile pool summary metrics stack into readable rows; chart inspection wraps rather than squeezing values into narrow columns.
- Existing controls get clearer dimensions and 44px targets on coarse pointers where scoped.
- Ten identified bridge balance/gas/service/destination strings and the transfer refresh accessibility label completed in English through the existing translation system. This is a focused completion, not a certification that every provider error or user content is translated.

## Verification

- Source guard: 402 protected repository files unchanged. Allowed changes are the scoped workspace CSS, three UI text components, extra English dictionary and documentation/export manifest.
- Frontend lint: zero warnings/errors. TypeScript and production build passed.
- Desktop Finance address-entry screen, populated public Terminal transfer/address cards and actual Ecosystem OHLCV chart inspected.
- 390px market/chart layout: document width 386px, stacked metrics and wrapped candle inspection readable; temporary viewport reset.
- UI preview forwards only explicitly permitted public GET endpoints without cookies. No login, wallet signature, account mutation, saved watchlist change or financial transaction performed.
- Existing SDK bundle-size build warning remains; this visual pass does not claim a performance optimization.

## Deployment

Frontend-only release 20261010-06 prepared from 05, with a backup, archive checksum, atomic current-link switch and rollback on failed checks. API/indexer code, private environment and financial/account records are outside this change. Final live acceptance is recorded after deployment below.

### Final live acceptance

06 is live; 05 is retained. Archive checksum passed; backup service completed; database quick check returned ok. Health at 07:58:08 UTC: ok=true, demoMode=false. Google/email availability flags true. Private environment hash and API/indexer activation timestamps are unchanged, both services active without restart. Protected homepage/header/footer source comparisons and original cinematic image bytes passed.

After reloading the published asset bundle, the live market screen has 1480px maximum content width, 11px source/OHLC labels, new subtle card shadow and a real OHLCV SVG. Desktop width 1536px/document width 1531px: no outer horizontal overflow. Proof: `.local/pilot-evidence/workspace-premium-live-20261010.png` (public page only, excluded from repository package). QA tab closed; viewport override reset. Local QA preview processes are stopped at completion.

## Deferred work

GitHub publication, actual CI execution, grant submission, offsite backup destination and new bridge route transfer pilots remain separate owner-deferred work. This revision does not add or certify those capabilities.
