# CARPAN Ecosystem review — 25 October 2026

## What changed

- Refreshed the curated catalogue review date to 25 October 2026.
- Added Morpho, Uniswap, Aero, 0x, Hibachi, Pulsar, Envio, Pinax, thirdweb and Zerion.
- Added bilingual research profiles and source-linked milestones for the new records. Integrations without a published, independently sourced Arc contract remain `participant`; no address is inferred.
- Updated Extended from an announced migration to a completed Arc migration, based on Extended's own update dated 22 October. Its XTEN update says the white paper is expected on 31 October and TGE is planned for November subject to regulatory timelines; claiming is not open and users must not pay for a claim.
- Added Arc's documented mainnet ERC-8004 Identity, Reputation and Validation registry addresses to the Arc network profile.
- Added the Turkish display label for the Payments category.

## Asset coverage

The token/asset table remains limited to the five Arc mainnet assets with addresses in the official Arc contract reference: USDC, EURC, USYC, cirBTC and WETH. No BUIDL, JAAA, JTRSY or other token was added without an exact official contract reference in the reviewed contract-address page. ARC is not listed as an asset: Arc's white paper says the token has not launched and does not provide a live token contract or market.

## Source set

- [Arc ecosystem directory](https://www.arc.io/ecosystem)
- [Arc Mainnet announcement](https://www.arc.io/blog/arc-economic-os-internet)
- [Arc contract addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Arc data indexers](https://docs.arc.io/arc/tools/data-indexers)
- [Morpho and Earn Kit](https://www.arc.io/blog/how-earn-kit-keeps-usdc-in-arc-apps-productive-with-morpho-vaults)
- [Uniswap on Arc](https://www.arc.io/blog/how-uniswap-brings-deep-liquidity-for-apps-on-arc)
- [Aero launch update](https://aero.xyz/articles/aero-launch-update-all-systems-go/)
- [Hibachi on Arc](https://www.arc.io/blog/how-hibachi-is-bringing-fx-price-discovery-to-arc)
- [Pulsar on Arc](https://www.arc.io/blog/how-pulsar-is-building-a-cross-border-money-experience-with-arc)
- [Extended official updates](https://t.me/s/extended_updates)
- [ARC token white paper and status](https://www.arc.io/arc-token-whitepaper)

The Arc Microgrants and Arc Acceleration entries retain their original source dates and are past events; they should not appear as upcoming items.

## Deployment

Published to carpan.app as `20261025-ecosystem-refresh`. The live catalogue returns 24 curated projects, including all 10 additions, five documented assets and the review date `2026-10-25`. Existing Circle and 1inch logo paths remain present. TypeScript and the production build passed; the release build was prepared from the committed source plus the reviewed Ecosystem changes, excluding unrelated local edits.

The deployment archive was SHA256 verified (`3710f532e17be6104c251a7c15b9c87d5d6ac468fbc5735b8250a3b5e51e71e2`). Previous changed files were retained in the private server rollback directory. API restart, public HTTPS health, catalogue content, published HTML equality and deployed file hashes passed. Production environment content was unchanged; the indexer remained active without restart. This deployment did not push a GitHub commit.
