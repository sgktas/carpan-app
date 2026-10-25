# Blockscout Sprint 2 — implementation status

Updated 25 October 2026. Implementation deployed; no Sprint 2 submission receipt.

| Judge request | Implemented locally | Remaining acceptance |
| --- | --- | --- |
| Blockscout central to Finance | Bounded transfer discovery plus address labels and token metadata inside payment review; source/cache/time shown. Public labels remain suggestions. | Live provider and authenticated review acceptance. |
| Multichain | Circle USDC contract allowlist on Arc, Base, Arbitrum and Ethereum; independent network pages and combined loaded totals. | Provider availability on every selected network. Private accounting remains Arc-only. |
| Terminal analysis | Counterparty grouping and exact USDC incoming/outgoing; transaction analysis in wallet context. | Verify deep links with real evidence. No inferred business purpose or entity ownership. |
| Real Finance demo | Read-only access to existing owner-operated mainnet pilot. | Record a new authenticated import → review → approval → JSON export walkthrough. Prior synthetic Finance demo does not satisfy this. |
| Clear first-time flow | Public Finance starts with wallet research, three steps guide review, private workspace has workflow guidance; README starts with one business payment. | Desktop/mobile usability review and new focused demo. |

## Data boundaries

Only exact Circle-issued USDC contracts with six decimals count. Failed transfers, unrelated wallets and malformed amounts are excluded; rows deduplicate by chain/event identity. Gas and self transfers do not inflate incoming/outgoing. A bounded page is not complete wallet history or current balance. Crosschain transfers are not automatically matched or netted as treasury movements.

Address/token enrichment uses the existing server-only Blockscout gateway and its cache/quota controls. Missing data is an error or unknown, never sample data. Commercial API access and webhook delivery remain closed. No private business decision is changed by a public provider label.

## Real pilot

The existing 0.10 USDC payment is between the developer’s own wallets, not customer revenue. See [contract and settlement evidence](carpan-arc-invoices.md). No new transfer is required for this work. The contract has not received an independent professional audit.

## Finish before submission

Real private Finance acceptance and public 390px layout checks passed. Final verification passed. Deployment completed; record the focused walkthrough before submission. Submit only once the completed evidence is reviewed. No new video, social post or Sprint 2 submission has been published by this implementation.

## Verification completed locally

- Full `npm run verify`: 408 passing tests, zero failures; publication guard, lint, frontend typecheck and production build passed. Existing large-chunk build warning remains.
- Read-only live-provider checks returned HTTP 200 and USDC token metadata on Arc, Base, Arbitrum and Ethereum through the local server gateway. This verifies metadata availability, not complete history on those networks.
- Chrome UI read the existing owner-operated Arc pilot as 0.10 USDC outgoing to the expected counterparty. Address enrichment returned no public label, correctly presented as unknown; token enrichment returned USDC.
- Finance → Terminal retained network, wallet and transaction context. Terminal computed 0.10 USDC outgoing and the same counterparty from actual Blockscout token events.
- Authenticated private review/export passed after owner wallet sign-in; 390px public research layout was checked; the squeezed table was corrected with horizontal scrolling. No production database or credentials were copied into this test environment.

## Focused recording checklist

Use the existing pilot wallet and settlement hash in `src/treasury-review.ts`; do not create a new payment. In Finance research, inspect the pilot and expand the counterparty/token evidence. Follow Terminal and run the transaction payment analysis. In an authenticated private workspace, select the same wallet, use Find a transaction with the same hash, verify/import, inspect receipt/discovery evidence, add an accurate owner-operated pilot reference and category, explicitly approve the reviewed movement, and export only that selected record. Explain that the JSON remains not submitted to accounting software. Show source timestamps and partial coverage. Do not represent the self-test as a customer sale.

A local session uses a separate empty database. Account authentication and any wallet signatures must be completed by the owner; no production account or data is manufactured for a recording.

## Authenticated Finance acceptance — 24 October 2026

The owner signed into the isolated local preview. A new pilot workspace and the verified F281 wallet were created through the UI. Direct hash import verified the existing mainnet payment against its canonical receipt/block: 0.10 USDC outgoing to the owner’s af09 wallet; transaction gas 0.001920595 USDC was separate and counted once. The operator saved an internal-transfer reference explicitly identifying an owner-operated self-test, approved the record and exported one JSON record through the UI.

The downloaded file was parsed and checked: one canonical system event, matched six-decimal ERC-20 mirror (not a second payment), approved internal-transfer decision, `readyForPosting:false`, `accountingStatus:not_submitted`. No new financial transaction, production account mutation or accounting-system posting occurred. This is verified real-data acceptance, not yet a recorded/published video demo. The initial bounded automatic history lookup returned zero candidates in this isolated environment; manual verified-hash import succeeded. Complete automatic history coverage is not claimed.

## Deployment — 25 October 2026

The reviewed source and production build were deployed as patch `20261025-sprint2`, with previous files retained for rollback. API restart and HTTPS health check succeeded; indexer remained active without restart. Production environment hash was unchanged. Runtime databases, credentials, dependencies and local test files were excluded. Full final verification: 408 tests, 24,371 assertions, zero failures, lint/typecheck/build/publication guard passed. Build retains the existing large-chunk warning. No new video, X post or Sprint 2 submission was published.

## Prepared demonstration — 25 October 2026

A 150.7-second 1920×1080 edited screenshot walkthrough with offline synthetic English narration was generated and its five scene previews checked. It includes live production research/Blockscout PRO analysis and clearly labelled isolated local private Finance acceptance with the real mainnet payment. [Narration and provenance](blockscout-sprint2-demo.md). This is not continuous screen recording and does not show customer traction. The MP4 is prepared locally for review; it has not been publicly uploaded or submitted to Craftora.

## History discovery repair — 25 October 2026

Root cause: current Blockscout transfer rows use `type:token_transfer` and carry ERC-20 in `token_type`/`token.type`; the older Finance filter expected `type:ERC-20`. The adapter now accepts both documented response shapes while rejecting contradictory token standards and retaining exact USDC/wallet and canonical-receipt checks. A regression test covers the live-shaped response, duplicate candidates, foreign tokens and conflicting standards.

Real public-page acceptance discovered the pilot automatically with Blockscout provenance. In authenticated local UI, history loading added two previously missing verified movements while retaining the already-approved pilot. Missing historical RPC receipts were reported and kept retryable, not imported as financial evidence. This repair does not claim complete archive coverage. Full verification: 409 tests, 24,377 assertions, zero failures.

The history repair was deployed with rollback backup `20261025-history-repair`; health and environment-integrity checks passed. The updated 181.5-second (3:01) six-scene demo includes automatic-history acceptance and is now published at https://carpan.app/media/carpan-blockscout-sprint2-demo-20261025.mp4. Published bytes were SHA256-verified: `faba5dab44dd812f7cfca2274adf2fe2f7734d9e78f81459fed164a129d236cd`. [Published transcript](https://carpan.app/media/carpan-blockscout-sprint2-transcript-20261025.md). Earlier local-only/demo-duration notes above describe the previous preparation stage. Sprint 2 submission is not yet confirmed.
