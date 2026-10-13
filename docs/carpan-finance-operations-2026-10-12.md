# Carpan Finance — operational foundation, 12 October 2026

> Historical implementation record. For the current 13 October product scope use [submission readiness](grant-readiness-2026-10-13.md). Connector keys/scopes/webhooks were implemented later on 12 October, then intentionally closed: [API access boundary](carpan-api-closed-2026-10-12.md). Internal Finance operations remain available; neither an open commercial API nor a completed ERP pilot is claimed.

## Product direction

Carpan is independent onchain payment-data infrastructure. Arc Mainnet is the first chain adapter. The long-term customer is a business or accounting-software vendor consuming Carpan's payment records through an API. The existing Turkish accounting product remains separate.

## Implemented in this iteration

- Private company workspaces, current-account membership and owner/admin/reviewer/viewer authorization at the service layer. Workspace creation is explicit; simply visiting Finance does not create business records.
- Business wallets can be registered from the user's already verified wallet or an existing collection recipient belonging to that user. Recipient authority is not described as cryptographic ownership. Arbitrary addresses remain available through public Wallet research.
- Private counterparties with accounting codes and unique address mappings within each company.
- Canonical Arc USDC movement evidence: system event identity, exact 18-decimal quantities, preserved ERC-20 aliases, separate transaction fees and gas payer. Repeated equal-value transfers remain distinct. Ambiguous aliases are shown and do not migrate personal notes automatically.
- Manual latest/older-window scan: 1,024 blocks, 20 transactions, 100 movements, 5,000 provider logs and 30-second total deadline. Both incoming and outgoing USDC system events are inspected and rechecked against receipts and block hashes. No background accounting ingestion or complete-history claim.
- Explicit transaction-hash receipt import for previously known payments. Imports are partial coverage, never a complete block-history scan.
- Cumulative verified records retained across windows. Failed reads preserve saved evidence. Partial historical windows can be retried before continuing to older windows; no durable ingestion checkpoint is advanced.
- Movement classification/reference, private counterparty association, review/approval, atomic bulk updates and optimistic versions. Approval needs classification and a counterparty or reference. Mint/burn approval is restricted to internal transfers.
- Immutable decision audit and export batches. New exports must match the versions reviewed by the operator; the same idempotency key retrieves the original batch even after later edits.
- Structured JSON output `carpan.finance.operations.v1`, exact raw quantities and one fee record per selected transaction. Output explicitly says `readyForPosting:false` and `accountingStatus:not_submitted`.
- Authenticated internal HTTP services under `/api/finance/operations`, private caching and original-owner replay guard. Existing Collections and bridge execution remain unchanged.
- EN/TR operational screen, dense readable ledger, company/wallet selectors, filters, expandable evidence, counterpart/reference editor, approval and output history. Guest research remains available; authenticated Finance opens Business activity by default.

## Existing history failure repaired

A read-only VPS diagnostic found provider remaining credits at 19,980 with a 20,000 configured reserve. The guard was functioning, but the transfer endpoint returned a generic error. Wallet history now has a dedicated provenance-preserving loader: fresh data when permitted, otherwise an existing snapshot no older than 24 hours with true acquisition time, sources and a stale warning. Without a suitable cached page it returns a sanitized reserve/source error. General Explorer reads and alert freshness requirements remain unchanged. No reserve reduction, counter reset or public-provider budget bypass was introduced.

## Verification

- Focused canonical/store/router tests cover native/ERC-20 deduplication, exact precision, repeated events, receipt/block identity, gas, deadlines/caps, partial failures, organization isolation, session-owner replay, disabled wallet and revoked membership, exact versions, atomic bulk changes and immutable/idempotent output.
- Complete verification passed with localhost network permission: repository guard, lint, frontend TypeScript, all 321 tests / 23,562 assertions, and production build. The first sandbox run could not reach local test servers; its failures were not treated as a successful gate.
- New server modules were checked with strict TypeScript: only the pre-existing absence of `bun:sqlite` type declarations prevents a complete server type gate. Runtime Bun/SQLite tests and entry compilation are separate checks, not a claim that all server types passed.
- Browser QA used a memory-only isolated local API, never production account/collection data. Created a second company, registered its verified fixture wallet and confirmed that the other company's approval/counterparty/export did not appear. Counterparty → classification/reference → review → approval → JSON output succeeded. The downloaded file was parsed and its exact amount, one fee, reviewed reference and `not_submitted` status verified.
- Desktop EN/TR and 390px mobile checked. A screen-reader-only table label initially escaped its scroller; adding a positioning boundary fixed it. Document width 386px with a 940px table scrolling inside a 352px region.

## Still planned

This is the operation engine and internal service foundation. Commercial API keys/scopes, usage plans/billing, signed retryable webhooks, external accounting acknowledgement/record IDs, automated historical backfill, continuous gap-free indexing, accounting-software adapters, invitations/member management, richer matching rules and additional chains remain to be implemented and piloted. No external ERP posting, commercial API availability or complete wallet reconciliation is asserted. Personal legacy notes are retained in Wallet research; new company decisions are separate and no automatic migration occurs.

## Production acceptance

The first activation passed the actual Arc receipt scan, API health, exact HTTPS frontend-byte check, authentication availability, private401 boundaries and SQLite integrity. The operational monitor reported disk_space_low and the deployment automatically restored release20261011-05. Old release dependency copies occupied about68GB. Space recovery preserves all release paths and bytes, sharing only SHA256-identical regular dependency files in explicitly named inactive20261009/20261010 releases; active20261011-05 and prepared20261012-01 dependencies remain independent. Matching mode/owner/group/mtime, no symlinks or ACL/xattrs, atomic replacement and a private manifest are required. Linked inactive dependency trees must remain immutable; copy to a fresh release before installing dependencies, editing or changing permissions. After recovery, the original activation gates all passed. Release20261012-01 became live at11:20:26UTC (14:20Türkiye), with20261011-05 retained. Final read-only check11:25:30UTC: APIhealthy, monitorok/issuesempty/lag19, SQLitequick_checkok and approximately14.77GBfree. Environment hash and indexer start time were preserved. Google sign-in returned to `/finance` Business activity; the real private first-use view loaded. All new business tables remained empty: no production sample companies, decisions or exports were inserted. Public wallet research loaded11USDCrecords and displayed its true05:25:11UTCacquisition/stalewarning. Browser task tab and isolated local QA services were cleaned up. No payment, signature, account merge or external accounting action was executed.
