# Arc compatibility review — 2 November 2026

Local source changes; not deployed or pushed to GitHub by this review.

## Findings and fixes

- Finance already treats system-emitter Transfer logs as canonical, pairs ERC-20 mirrors without double counting, retains native 18-decimal quantities and records gas independently. Existing adversarial receipt/scan tests passed.
- Collections explicitly estimates and submits EIP-1559 fees. Its quote now applies Arc's documented 20 Gwei minimum max fee, retaining a higher live RPC quote or priority fee. The displayed gas reserve and submitted fee cap use the same adjusted quote; no transfer is initiated by this change.
- Invoice creation previously treated any receipt-query error as a reverted transaction. It now reports an unverified outcome and instructs the operator to inspect the existing hash before resubmitting. A verified reverted receipt still reports failure.
- Crossmint was added as a source-backed ecosystem participant with bilingual profile and development evidence. No contract address or CARPAN integration is inferred. Its own review date is 2 November; other projects retain their earlier review dates.
- Ecosystem notification tests now require one research update per catalogue project and verify the current Extended status. They no longer hardcode the obsolete 14-project snapshot. Initial loopback test refusal was resolved by rerunning with local loopback access.

## SDK inventory

Public npm registry checked during this review:

| Package | Installed | Registry latest |
| --- | --- | --- |
| @circle-fin/app-kit | 1.16.0 | 1.20.0 |
| @circle-fin/adapter-viem-v2 | 1.18.0 | 1.20.0 |
| @circle-fin/adapter-solana-kit | 1.6.4 | 1.7.0 |

Dependencies were not upgraded. Existing mainnet metadata, environment isolation, route selection and wallet-network tests passed (23 tests). A version upgrade still needs a comparison of the new SDK's route/contracts metadata and recovery serialization against CARPAN's explicit reviewed-network registry. New SDK-supported routes should not automatically become enabled routes.

## Validation

25 Finance/receipt/checkout/fee tests passed (145 assertions); 7 Ecosystem tests passed (176 assertions). The 23 bridge configuration/route/wallet tests passed in the initial combined run; the initial Ecosystem failures were obsolete snapshot assertions plus a sandbox loopback refusal, then fixed/rechecked. TypeScript, frontend lint (zero warnings/errors) and production build passed. Existing dependency annotation and large-chunk build warnings remain. No new onchain signature, transfer, funded-wallet test or professional contract audit occurred.

## Remaining work

### Follow-up completed on 2 November

This section supersedes the SDK/error/news tasks below. Installed exact Circle releases: App Kit 1.20.0, Viem adapter 1.20.0 and Solana adapter 1.7.0; package-lock.json records the resolved dependency graph. Install scripts were disabled during upgrade. The existing reviewed route allowlist remains authoritative; new SDK routes do not automatically become selectable. SDK route, mainnet contract metadata, interrupted-burn recovery, Solana safeguards and wallet-network tests passed in the full suite.

Payment error handling now recognizes wallet cancellation by EIP-1193 code 4001, including nested causes. A generic provider `access denied`, timeout or simulation revert does not prove an onchain failed transaction. Uncertain invoice write errors block approval/payment buttons until the user reviews their wallet and explicitly resets the flow. Collection checkout retains its existing uncertain/pending checkpoint and now shows the shared actionable message. Invoice creation cannot resubmit while an existing hash lacks a definitive receipt. Explicit address restrictions and low fee errors have distinct explanations. New error-classification tests cover unknown results, nested errors and cyclic causes.

Primary-announcement review: the official Extended updates channel still exposes its earlier XTEN white-paper target and conditional November TGE announcement. No new publication/claim confirmation was established in this review. The catalogue now states that uncertainty as of 2 November, instead of presenting the passed 31 October target as a future event. Expired Acceleration content explicitly describes a historical programme. Crossmint's sourced profile remains included. SELAT's Arc spotlight was reviewed as a research lead; no unverified standalone domain/contract was added.

Full verification after the SDK upgrade and final checkout/create guards: 415 tests passed, zero failures, 24,529 assertions; publication guard, lint and TypeScript passed. The production build is part of the final verification log at `.local/arc-upgrade-final-20261102.log`. No financial transaction or live wallet signature was performed. These updates remain local and have not been deployed/pushed in this follow-up.

The items below describe the initial review's pending work, now addressed as above or explicitly retained as separate future product work.

- Compare and test the latest Circle SDK versions before changing installed dependencies.
- Review the remaining payment error surfaces against blocklist/no-receipt behavior; generic RPC or timeout failures must not be presented as proof of a reverted payment or an invitation to send again.
- Check SELAT's official product domain before adding a standalone directory entry; the official Arc spotlight alone is already a research lead.
- Refresh time-sensitive Extended/XTEN claims against new primary announcements before changing the existing dated review. This pass does not assert that every catalogue record has been reviewed on 2 November.
- New Onramp/Earn/Borrow/Gateway features remain separate product work.

## Primary references

## Deployment — 2 November 2026

Released to carpan.app as `20261102-arc-refresh`. The production dependency tree passed a fresh `npm ci --ignore-scripts` in a separate inactive release. An npm 10/11 lockfile discrepancy involving optional `utf-8-validate` was repaired using npm 10.9.8 (the server version); the corrected lockfile completed clean installation. Existing live dependencies were not overwritten during preparation.

The clean frontend build used committed source plus reviewed updates, excluding unrelated local `env.example` and Finance CSS edits. The release archive SHA256 was `4c4a9d801c6753217e2c37e5bf537ed32e8ec2871b28930a6adf0013b36487ad`. Inactive source imports passed. The current symlink was switched to the new release and API/indexer restarted; the previous release remains available for rollback. Production environment content was unchanged.

HTTPS health, published HTML equality, 25 curated projects including Crossmint, and both active services passed on the VPS. An external check returned health=true, Crossmint present and HTTP 200 for `/finance/invoices`. No new wallet signature or payment was made. These checks do not replace a user-operated financial pilot. GitHub was not updated by this deployment.

- https://docs.arc.io/llms.txt
- https://docs.arc.io/arc/references/gas-and-fees
- https://www.arc.io/blog/porting-contracts-to-arc-native-value-rules-and-key-implementation-differences
- https://www.arc.io/blog/integrating-arc-for-deposits-and-withdrawals
- https://www.arc.io/blog/how-crossmint-supports-stablecoin-apps-and-the-agentic-economy-on-arc
- https://www.arc.io/blog/how-selat-uses-circle-gateway-to-make-arc-the-home-treasury-for-every-agent
