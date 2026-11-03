# CARPAN account wallets (Arc Testnet)

CARPAN provides an optional Circle user-controlled EOA wallet setup after normal account sign-in. Creation requires the owner's Circle email authorization and approval. Existing Google, email and external-wallet sign-in remain available.

## Account flow

- Main login/register offers an optional wallet destination; Settings → Security also links to `/wallet/setup`.
- The old `/finance?view=wallet` route redirects to that account page.
- The backend validates Circle user credentials through Circle and binds the returned user ID to one authenticated CARPAN account. Device-token subjects identify devices and are never compared with end-user IDs.
- Returning CARPAN sessions can read the linked wallet and token balances using backend-only Circle API credentials, without storing Circle user tokens in the browser or requiring repeated wallet authorization for public reads.
- Wallet listing and balances enforce the stored owner identity and Arc Testnet scope. Cross-account binding cannot overwrite an existing association.
- Native USDC and its canonical ERC-20 interface represent the same balance on Arc; the account view displays it once without adding the two representations.

## Configuration

`CIRCLE_WALLETS_ENABLED=true`, a test-only `CIRCLE_API_KEY`, and `CIRCLE_APP_ID` are required on the backend. `VITE_CIRCLE_WALLETS_ENABLED=true` enables the frontend entry points. Secrets must never use a `VITE_` prefix or enter Git, build output or logs.

The integration creates **Arc Testnet wallets only**. It has no payment, transfer or signing endpoint. Test tokens have no monetary value. Gateway mainnet writes remain separately disabled.

## Acceptance evidence

Owner-operated local browser checks on 3 November 2026 completed CARPAN email sign-in, Circle email authorization, approved wallet creation, page reload, sign-out, re-entry to the same wallet, and funded balances. The final balance view showed 40 test USDC, 20 test EURC and 0.0001 test cirBTC. No customer traction or mainnet wallet acceptance is implied.

Automated checks cover device/user identity separation, provider validation, immutable linking, owner/session isolation, pending-request recovery, read-only account restoration and USDC deduplication. Mainnet wallet support and wallet transfer/recovery operations require separate implementation and acceptance.

Sources: [Circle Wallets](https://developers.circle.com/wallets/user-controlled), [Arc contract reference](https://docs.arc.io/arc/references/contract-addresses).
