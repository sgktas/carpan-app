# Carpan Arc Studio mainnet pilot walkthrough

Edited captured-screen walkthrough; not a continuous live session. Microsoft Zira offline synthetic English narration. Original captures span testnet development and 22 October 2026 mainnet verification. No new payment was performed for this video.

## Carpan Finance / Collections

Carpan connects finance, onchain research, and ecosystem discovery on Arc. This new Finance pilot is available from Collections. It adds verifiable payment requests to the existing product, without replacing private collection records or accounting reconciliation.

## Built with Arc Studio

The invoice settlement module was developed in Arc Studio. This earlier development capture shows the Solidity contract, its functions, and the testnet deployment. We tested the payment flow on testnet, then deployed the same reviewed initialization bytecode to Arc Mainnet.

## Direct USDC settlement

The owner created a payment request on Arc Mainnet, approved exactly point one USDC, and signed payment separately. The contract transferred USDC directly from payer to recipient. Carpan did not hold the funds. This was a controlled transfer between two owned wallets, not customer traction.

## Independent onchain receipt

The public transaction receipt confirms a successful pay Invoice call and a point one USDC transfer. We independently checked the successful receipt, matching Invoice Paid event, paid invoice state, and zero remaining allowance. Gas was paid separately in USDC.

## Live / inspect without signing

The integrated Carpan page reads the completed request directly from Arc Mainnet. Anyone can inspect the paid record without connecting a wallet or signing in. Create, token approval, and payment remain explicit wallet actions. Reference hashes and payment details are public. This is not a legal or tax invoice, and no independent professional audit is claimed. The public repository documents the contract, limitations, and mainnet evidence.