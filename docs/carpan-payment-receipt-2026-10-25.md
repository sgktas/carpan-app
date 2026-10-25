# Payment status and inline receipt — 25 October 2026

## Change

The direct Collections checkout now displays a shared inline receipt after its exact USDC transfer is verified. The invoice checkout distinguishes wallet signature, submitted/confirming and verified receipt states; after transaction confirmation it reads and verifies the payment before displaying the receipt. Receipt-check failure is unknown, not a failed payment; retry guidance explicitly discourages paying again.

The receipt includes amount, sender, recipient, UTC chain timestamp, request reference, transaction hash, block and separate actual USDC gas. Users can download a plain-text acknowledgement or copy it. Invoice receipts have a shareable link that reconstructs and verifies evidence without wallet/login; the successful invoice flow retains that link in the URL for refresh/recovery. Explorer is a secondary detail link. No legal/tax invoice, ERP posting or collection-business matching is implied.

## Verification boundary

Invoice evidence requires a successful transaction to the configured Arc Mainnet contract, paid invoice state, exactly one matching InvoicePaid event and an exact matching six-decimal USDC Transfer total. Receipt block hash must match the canonical block before its timestamp is shown. Approval-only transactions, reverted/missing/removed events, wrong invoice/recipient/amount/contract and duplicate settlement events do not produce a successful receipt. Direct checkout retains its existing exact-recipient/amount proof and rechecks canonical block metadata. Local saved confirmation is rechecked after refresh.

## Acceptance

The existing owner-operated 0.10 USDC pilot was checked read-only: block 27299344, UTC 22 October 2026 14:45:02, gas 0.001920595 USDC. Chrome displayed the inline receipt and downloaded its text file; contents matched the verified public evidence. No new payment, approval or wallet signature was performed. Direct checkout uses the same display component; a new funded transfer was not repeated for acceptance.

Final verification: 411 tests, 24,393 assertions, zero failures; lint, TypeScript, build and publication guard passed. Both desktop and 390px receipt layouts were inspected. Text download was parsed and checked against the real pilot. No new funded transfer was used.
