# Hero symbol revision — 25 October 2026

Only the homepage carousel artwork is changed. The Finance frame integrates the USDC symbol into its central glass/ring core. The Ecosystem frame integrates the Arc arch into its main sphere. Terminal artwork, hero copy, navigation, motion, footer and interior workspace backgrounds retain their existing references. Original v2 images remain available.

Built-in imagegen edit mode was used, with each original 1672×941 hero as the edit target and an official symbol reference as supporting input. Generated PNGs were encoded as quality-95 WebP without resizing; final files preserve the original hero dimensions. These are decorative generated scenes, not evidence of transactions, affiliation or endorsement.

## Prompt set

Finance: edit only the central glass core to include the official USDC dollar-and-open-brackets silhouette; preserve its proportions/gaps and all outer rings, purple trails, water, rocky landscape, lighting, camera and dark empty left side. No text, wordmark, blue disk or pasted-sticker effect.

Ecosystem: insert the official Arc arch silhouette with its curved crossbar into the central emerald sphere, upright and recognisable; preserve the orbiting bodies, metallic paths, fog, water reflections, green/black palette and dark left text area. No generic letter A, wordmark, UI or new background scene.

## Files and references

- `public/images/carpan-cinema-finance-usdc-v3.webp`
- `public/images/carpan-cinema-social-arc-v3.webp`
- USDC shape reference: [Circle official pressroom](https://www.circle.com/pressroom), USDC brand image linked from that page.
- Arc shape reference: existing official `public/images/networks/arc-network.svg`, originally obtained from the Circle Arc brand kit; see [provenance](carpan-arc-icon-2026-10-11.md).

## Acceptance

Desktop Finance and Ecosystem frames were inspected in Chrome with the existing copy and controls. Lint, frontend TypeScript, production build and repository guard passed. Deployed as `20261025-hero-symbols`, with original files retained for rollback. HTTPS health and frontend-byte checks passed; API/indexer were not restarted and production environment was unchanged.
