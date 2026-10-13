# Carpan footer and matte surfaces — 10 October 2026

## Owner direction

Align the footer emblem and wordmark, reduce the social icons, remove workspace heading colors and place the product explanation link with the other information links. Improve the cards without adding products or changing the approved homepage/auth cinematic scenes.

## Implemented

- Footer: a single flat charcoal surface, white logo and wordmark in one aligned row, separate slogan/description, equal neutral heading colors and compact 36px X/email buttons (44px minimum for coarse pointers).
- The existing `/about` page is populated with the three workspaces, payment journey, Arc rationale and current boundaries. Its link now belongs to the bottom product/legal information group, instead of competing with the brand description.
- Interior palette: canvas `#0b0c0f`, card `#151619`, raised surface `#1e2025`, recessed input `#101114`, clear white text and restrained blue actions. Thin borders and subtle depth replace large blue-gray fillings.
- Ecosystem directory/markets lose their redundant enclosing frames; actual project, asset and chart cards stay intact. Selection uses a narrow accent and border; missing prices remain unavailable.
- Finance first-use cards, Terminal cards, contract research, bridge forms and payment evidence use the same material. Error/success/chart colors retain their meanings. Bridge heading strips are removed.

## Verification

Desktop footer alignment and actual market/chart data inspected in Chrome. All four footer headings compute to `rgb(240,240,243)`. Finance first use and bridge forms inspected. At 390px the document remains 386px wide; footer uses two columns with full-width brand introduction and wraps its information links. EN/TR labels checked and EN restored. The viewport override is reset.

TypeScript, lint (113 files, zero errors/warnings), final production build and the source guard passed. The guard protects 406 pre-existing files without unexpected changes. No authentication, wallet signature, payment, provider, route or financial calculation is changed by this revision. Existing wallet SDK bundle-size warnings remain; this is not a performance certification.

## Brand usage

See [Arc and Circle brand review](carpan-brand-usage-2026-10-10.md). Infrastructure-identification guidance is conditional, and Circle's policy contains commercial-use restrictions. This revision retains the existing textual Arc attribution and adds no official Arc/USDC promotional mark. No licensing inquiry has been sent.

## Release acceptance

20261010-07 is live as a frontend-only overlay over 06; 06 remains available for rollback. Archive checksum, pre-deployment backup, atomic release switch, database quick check and HTTPS routes passed. Final health time: `2026-10-10T09:06:58.385Z`; Google/email login available and demo mode disabled. Private environment hash and API/indexer service start times are unchanged; both services remain active without restart. Header, homepage/auth cinematic sources and original image comparisons passed.

Live Chrome verification confirms the card `rgb(21,22,25)`, canvas/footer `rgb(11,12,15)`, no footer background image, four equal neutral headings and real provider-sourced market/chart values. Public proof screenshots are local only: `.local/pilot-evidence/cards-matte-live-20261010.png` and `.local/pilot-evidence/footer-refined-live-20261010.png`, excluded from the clean source package. No account or financial transaction was performed for acceptance.
