# CARPAN Gateway integration — 2 November 2026

Status: local implementation; not deployed or pushed. Mainnet writes are deliberately disabled pending wallet acceptance. This is separate from the previously deployed SDK refresh and local EURC/cirBTC module.

## Implemented

- Finance → Gateway (`/finance?view=gateway`), English and Turkish, using the existing dark workspace design.
- Testnet and mainnet balance reads for the connected or explicitly entered public address. Scope: Arc, Base, Arbitrum, Ethereum and their reviewed test networks.
- Circle App Kit 1.20.0 `unifiedBalance` API with its existing Viem browser-wallet adapter. No new dependency, server credential or private key is needed for Gateway.
- Confirmed versus pending funds, consistent per-chain totals and manual refresh. Ordinary wallet funds are not presented as already deposited Gateway funds.
- Standard, own-account USDC deposit; single selected source-network spend to an explicit EVM recipient, submitted by the user's browser wallet on the destination network. No forwarding service or delegate is enabled in this first version.
- Separate review, fee estimate, explicit checkbox and wallet confirmation. Native fee tokens remain separate from USDC transfer amounts; changed estimates require a new review. Estimates are not advertised as fixed-price guarantees.
- Network/account checks at provider signing boundaries, SDK metadata checked against CARPAN's reviewed registry, Arc fee floor, no signatures in fee previews.
- Per-wallet/environment persistent operation checkpoints plus browser Web Locks. An accepted signature, ambiguous write, or unverified receipt blocks new operations. Refresh never silently discards an unresolved submission.
- Canonical receipt, matching USDC amount/recipient, official token precision and selected operation contract required before showing confirmation. Minimum receipt block prevents reusing an older transaction as recovery evidence. A reverted destination transaction remains unresolved because the source spend may already be committed.
- An operation is not automatically marked as income, a customer payment or a posted accounting entry.

## Validation

- SDK configuration matched all four networks in both environments.
- Live, read-only requests for the owner-operated pilot address ending F281 returned zero confirmed and pending Gateway funds in both environments. The browser testnet read also succeeded.
- Four new financial-boundary tests cover amount precision, environment separation, per-token fee changes, receipt spoofing/duplicate/removed/old evidence and unresolved operation restoration.
- Full `npm run verify` passed after the adapter correction: 424 tests across 72 files; lint, TypeScript, repository guard and production build passed. Local HTTP tests require access to loopback networking.
- Owner-signed deposit succeeded on Arc Testnet: 0.10 test USDC, transaction `0x0d9cb59a4c463ba314b623d7acbd04156df679f9af9bfca755125916f50a244a`. The UI verified the canonical receipt and exact token transfer; actual gas was 0.003283475 test USDC. Refreshing Circle's balance API then showed 0.10 confirmed and zero pending on Arc Testnet.
- Owner-signed spend back to the same owner's wallet succeeded on Arc Testnet: 0.05 test USDC, transaction `0x1b079222eb10a457d4277fd7d9a67e3b8ac7b0a789d8b3f5c8945fb450080d45`. The UI verified the canonical destination receipt, recipient and exact amount. Actual destination gas was 0.00311188245815 test USDC. Refreshed Gateway balance was 0.0465 confirmed and zero pending; the 0.0035 difference after subtracting the 0.05 spend is the observed Gateway deduction, separately from destination gas. This was same-chain deposit/spend acceptance, not proof of an interchain transfer. No mainnet transaction has been requested by this module.
- First wallet acceptance attempt exposed an SDK parameter error: the browser adapter's inferred generic had prompted explicit `address` fields, which App Kit rejects for user-controlled adapters before signing. Specify the adapter's `addressContext: 'user-controlled'` capability and omit those fields. A regression invokes the real SDK with both legacy parameter sets and proves rejection with zero sign/send requests. Only hashless checkpoints from that pre-revision-2 local implementation migrate to `not-submitted`; revision-2 uncertain operations and all hashed operations still require verification.

## Remaining acceptance and release requirements

1. Completed: owner-signed small testnet deposit; canonical receipt and eventual confirmed Gateway balance verified. A transient pending phase was not captured and must not be claimed as observed.
2. Completed on Arc Testnet: owner-reviewed spend back to their own wallet, exact destination receipt and remaining balance. Cross-network wallet acceptance remains outstanding.
3. Completed browser refresh acceptance after successful spend: the saved operation returned as pending verification, blocked new submissions and preserved its hash. Read-only verification of that same receipt restored confirmed status and unlocked the form without another wallet request. Interrupted destination-mint recovery still requires a separate acceptance run; never submit another source operation to recover a committed spend.
4. SDK-assisted continuation after a failed destination mint and the delayed-removal UI are not implemented here. Current recovery can verify an existing final transaction hash; unresolved operations without that evidence remain blocked with a support instruction. The official fallback withdrawal has a seven-day delay.
5. Keep mainnet writes closed until the real wallet and recovery acceptance checks are satisfactory. No deployment or public launch is claimed by local tests.

## Circle Wallet next

Circle's current support matrix lists Arc EOA/SCA support for user-controlled wallets. Proposed product: an optional user-controlled EOA wallet on Arc, with each sensitive operation approved by its owner. Retain external wallets as an option.

CARPAN's existing Google/email authentication is not a Circle wallet session. Integration requires the Circle User-Controlled Wallet app ID, a server-side API credential, and the selected email/social authentication setup in Circle Console. Do not expose the API credential in Vite/browser variables, logs or exports. Do not create a wallet simply because somebody logs into CARPAN.

The next implementation must bind the Circle user to the authenticated CARPAN account server-side, keep Circle authentication material in memory rather than localStorage, isolate wallets/transactions per user and require Circle's user approval challenges. SDK setup, wallet recovery and transfers must be tested separately; no Circle wallet integration is claimed complete in this release.

## Sources

- https://developers.circle.com/gateway
- https://developers.circle.com/wallets/supported-blockchains
- https://developers.circle.com/wallets/user-controlled
- Installed App Kit 1.20.0 declarations and Unified Balance API (`unifiedBalance.d.ts`).
