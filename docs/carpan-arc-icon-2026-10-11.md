# Official Arc network icon — 11 October 2026

Owner explicitly requested using the Arc icon to identify infrastructure supported by Carpan. Release **20261011-05** is live.

## Placement

- Homepage: the existing `A` placeholder next to `BUILT ON ARC` is replaced by the official network icon. The original cinematic artwork, carousel controls, navigation and copy are preserved. Existing mobile visibility of this badge remains unchanged.
- Shared footer: the existing infrastructure dot is replaced by the same official icon next to `Built on Arc` (localized in Turkish).
- Bridge: the icon accompanies whichever selected side is Arc or Arc Testnet. It moves with the route; other networks are not given the Arc mark. Native selectors, supported options and controlled-route handlers remain unchanged.

The official image renders at 50×50px with a 20px surrounding space. Narrow bridge forms stack their source/destination choices so network names remain readable. Disabled controls are muted individually, preserving the mark's original color when an operation or recovery blocks editing.

## Asset provenance

Source: [Circle Brand Kit](https://www.circle.com/pressroom#brand-kit), [official Arc ZIP](https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Brand/Arc/Arc_Logos.zip), exact member `Arc_Logos/Arc Network Icon/Arc_network.svg`.

Local file: `public/images/networks/arc-network.svg`, 1063 bytes. SHA256: `0c641405f429884228c0db4287e1b89774d21973c2d443b028b7cfa854c6f828`. Bytes remain unchanged. No script, external reference, recoloring, crop, redraw or image filter. Provenance is recorded in `public/images/networks/sources.json`.

The [official Arc builder guidance](https://community.arc.io/public/blogs/arc-brand-guidelines-and-partner-toolkit-is-live-2026-07-16) describes infrastructure-identification use in product UI by active builders. Placement identifies the supported network; no Circle/Arc endorsement or formal partnership is claimed. No special licence was obtained and no permission request was sent. Existing broader commercial-policy limits are documented in [brand review](carpan-brand-usage-2026-10-10.md).

## Verification and deployment

Lint (0 errors/0 warnings), TypeScript and final production build passed. Independent AST comparison confirmed 86 protected JSX attributes and all call expressions across the three consumers remain unchanged. No financial, wallet, provider, account or data function changed.

Chrome confirmed loaded, unfiltered 50×50px images on homepage/footer and the selected Arc side of the bridge. Reversing the route moves the icon to the destination. Local 930px/390px forms stack appropriately and fit their 926px/386px available document widths; icon size remains50px. Existing English/Turkish copy remains in place.

Frontend-only deployment passed backup, archive checksum, atomic activation, exact HTTPS HTML byte comparison, official SVG hash/content-type check and read-only DB quick check. Health at20:21:31UTC was ok/demoModefalse. Environment hash and API/indexer activation timestamps were unchanged; services stayed active without restart. Previous release04 remains available for rollback. No signature, quote or transfer was requested.
