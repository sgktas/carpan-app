# Unified bridge network selection — 11 October 2026

Release **20261011-04** is live. Solana is an option in the same source and destination selectors as the reviewed EVM networks; the EVM/Solana category tabs are removed. Each environment displays 25 reviewed EVM networks plus Solana (Solana Devnet in testnet). Every selectable route includes the appropriate Arc network and has different source and destination networks.

## Flow and safeguards

- A Solana route opens the existing Arc and Solana wallet controls; EVM routes use the existing EVM wallet control.
- Network changes invalidate the quote and consent. Unsent amount and recipient fields are cleared so an address from another destination cannot be silently carried over.
- The current transfer or unfinished recovery locks route selection. A pending record restores its original route and fields; Solana recovery also aligns the displayed direction before retry.
- EVM account synchronization and Solana browser-only recovery storage retain their existing, explicitly different behavior. Storage keys and snapshot formats are unchanged.
- Source burn, destination delivery, contract/genesis verification, gas/rent reserves, manual signatures and retry functions are unchanged. Research still indexes Arc; adding bridge counterparties does not expand research coverage.

## Verification

TypeScript, lint (0 errors/0 warnings) and production build passed. 38 focused bridge tests passed across five files, including 11 new selector/normalization tests. Tests reject unknown and other-environment IDs and exhaustively check selection invariants. An independent AST comparison confirmed all 13 EVM and 11 Solana financial/history functions remain identical to the previous version.

Chrome local EN/TR checks covered Arc→Solana, Solana→Arc, return to EVM, cleared draft fields and mainnet/testnet separation. At 390px, the document fits its 386px available width without horizontal overflow. Live EN checks confirmed 26 options in both selectors, no family tabs, correct wallet controls, both Solana directions and testnet isolation. No new quote, wallet connection, signature or financial transfer was requested. Existing browser wallet reconnection was displayed.

Deployment used a verified archive, backup and atomic symlink activation. HTTPS health and exact frontend HTML bytes passed; database quick check was `ok`. The production environment hash and API/indexer activation timestamps were unchanged; both remained active without restart. Previous release03 remains available for rollback.

New route financial pilots remain owner-deferred. UI verification is not evidence of a completed Solana transfer.

## Brand icons

No new network logos were added in this release. The owner asked about permission, and current official rules were checked. Arc provides a dedicated network icon in its official ZIP; active builders may use its mark to explain supported infrastructure, subject to Circle's policy. A separate small-icon minimum is not specified and unrestricted commercial permission is not established. Other networks have their own rules. See [brand review](carpan-brand-usage-2026-10-10.md).
