# Çarpan AI homepage introduction — 13 October 2026

The owner supplied an office photograph for the existing homepage accounting product card, then requested only the software screen because the warm room did not fit the dark site. The accepted direction uses a straight-on, screen-only product visual inside a subtle dark frame, with no office, desk or monitor stand.

The built-in Imagegen edit uses the supplied photograph as its target. Prompt: extract only the monitor’s software interface, correct perspective to a flat rectangle, retain the Turkish accounting dashboard/left navigation/right detail panel and remove the office, physical monitor and cinematic lighting. The image is promotional imagery, not a live data feed or independent proof of working integrations.

Desktop places the product visual left and existing copy right. Below 760 pixels, the image precedes the copy. Intrinsic image dimensions reserve layout space; loading is lazy and asynchronous. Responsive WebP encodings and Turkish/English alternative text are included. Product name, description and external çarpan.com CTA remain.

Scope is the accounting introduction card and its image assets. Homepage hero, header, footer, loading frost/motion, account flows and financial services retain their existing behavior.

Verification: lint found zero warnings/errors; TypeScript passed. Isolated Chrome review confirmed the full screen-only composition, unchanged external CTA, English/Turkish copy and alternatives. At 390px, the 345.6px card stacks the image above text, document width is 386px, and the full card is visible without horizontal overflow. Desktop uses a 1.25:1 image/copy column ratio with no crop. WebP assets are 1586×992 (255,924 bytes) and 793×496 (91,218 bytes), with lazy/async loading. Private generated PNG is retained in .local/carpan-ai-screen-source.png; public optimized assets are public/images/carpan-ai-screen-{1586,793}.webp. Screenshots: .local/pilot-evidence/carpan-ai-screen-{desktop,mobile}-20261013.png.

The frontend package is deployed through the existing strict file allowlist and private rollback backup; live package/HTML equality, unchanged private environment and service health are checked at deployment. No account, session or financial mutation is part of this change.


## Angled compact revision

Owner rejected the oversized flat screen and requested a smaller side-facing product visual, themed to the site; fine print need not be readable. The existing screen asset is retained. CSS places it in a 280px desktop stage with a 420px maximum screen width, rotated in three dimensions (Y−24°, X6°, Z−5°). A dark bezel, quiet lavender aura, subdued image brightness/saturation and edge shading integrate it with the neutral dark card. The card is approximately 346px high at full desktop width, rather than scaling the screen to the column width. Mobile uses a 205px stage/280px maximum screen width and a gentler angle. Image sizes metadata matches the compact presentation. This is a static CSS presentation; no new image generation or backend behavior.

This revision supersedes the earlier flat 1.25:1 desktop composition. Verification includes visual desktop/mobile review, translated copy and overflow checks, then a strict backed-up frontend deployment.

Angled revision verification: lint0/0, TypeScript and production build passed. Desktop card1400x345.6px with transformed screen397.8x303px (420px untransformed maximum); original flat screen was716.9px wide/card514px high. Mobile390px has345.6px card, transformed screen269.5px inside300px column; document386px, no horizontal overflow. Image remains lazyloaded from793px responsive asset on phone, English copy and original externalCTA retained. Static CSS presentation introduces no ongoing motion.


## Product naming revision

Owner accepted the compact angled composition and requested a descriptive accounting product name instead of Çarpan AI. Shared product name is now Çarpan Muhasebe Asistanı, with Akıllı muhasebe otomasyonu underneath. Card and footer localize these as Çarpan Accounting Assistant / Intelligent accounting automation in English. Card CTA and descriptive alt use accounting wording. Screenshot asset filenames are retained; visual composition, external destination and functionality are unchanged.


## Homepage referral promotion cleanup

Owner identified the legacy homepage ECOSYSTEM / FIRSATLAR block as a leftover. Remove the entire section#center, all its loading/error/empty/populated referral-card variants, associated card request/state/join handler and unused editorial styling. The closing homepage copy now mentions collections and watchlist only, in Turkish and English. Projects now flow directly into the Finance how-it-works section. Incoming referral-intent routing remains compatible with existing shared URLs; this UI cleanup does not delete saved records or the separately available Ecosystem module.

Related legacy navigation cleanup also removes the shared footer referral-center promotion and Arc contract sidebar /#center link. The deleted homepage anchor therefore has no remaining active source links.
