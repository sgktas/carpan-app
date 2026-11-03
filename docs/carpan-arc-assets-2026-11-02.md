# Arc EURC / cirBTC — first implementation

Local implementation at `/finance?view=assets`. This module is not yet deployed or pushed to GitHub. It adds explicit token selection, precision-verified ERC-20 balances, bounded filtered history via the existing public wallet API, and separately reviewed wallet-signed direct transfers on Arc Mainnet. EURC uses 6 decimals and cirBTC 8; both pay fees in the separate USDC native balance. They are not added to USDC accounting totals or legal invoice flows.

The quote checks chain/account, exact official token address/decimals, positive exact-precision amount, recipient, simulation, gas and balances. Fee caps respect the documented Arc floor. A distinct user consent and wallet signature are required; there is no automatic payment. An unresolved transfer is checkpointed before requesting a signature. A timeout/ambiguous wallet response retains the checkpoint and blocks new sends. A hash can be checked without another signature. Refresh treats prior local confirmations as pending until reverified against the receipt. Token, payer, recipient, amount, successful status and canonical receipt block must agree before showing confirmed; failed receipts retain gas separately.

Verification: 419 tests passed, zero failures; publication guard, TypeScript, lint and production build passed. Four new tests cover exact precision, token/gas balance isolation, receipt spoofing/reverts/removed logs, and recovery states. Existing Terminal generic-token parsing was preserved in `src/arc-assets.ts`; the new transfer model is `src/arc-asset-transfers.ts`.

Chrome verified asset switching, invalid-address rejection and disconnected-wallet payment disablement. At a 390px viewport, document width was 386px (no horizontal overflow). The local preview's backend API was not started, so full local UI history retrieval was not accepted as tested. Direct live Arc RPC reads verified EURC=6/cirBTC=8 decimals; the existing public pilot wallet had zero of both tokens. This is read-only evidence, not an actual transfer acceptance pilot.

Crosschain EURC/cirBTC bridge/recovery and private multiasset business accounting are not implemented by this first module. The existing USDC bridge remains its original reviewed flow. These are the next integration stages and require token-specific route/contract/decimal and interrupted-transfer identity checks. No real signature or financial transfer occurred during implementation.

Additional acceptance: the deployed public wallet-history API accepted both official token filters for the existing pilot wallet, returning bounded empty pages with Blockscout PRO provenance. This verifies route availability, not a positive transfer history. The final send path also uses a browser Web Lock per wallet and rereads the persisted checkpoint while holding it, preventing two open tabs from independently initiating an unresolved transfer. Browsers without the lock capability fail closed. TypeScript, lint and all four targeted asset tests passed again after this guard was added.

Sources reviewed:
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/app-kit/references/supported-blockchains
