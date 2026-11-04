# Arc USDC bridge readiness — 4 November 2026

Required scope: every configured supported counterparty network → Arc and Arc → that network. Direct transfers between two non-Arc networks remain outside this product flow.

## Read-only live verification

All 25 configured EVM mainnets passed `bun run bridge:check-mainnet`: RPC chain ID, current block, six-decimal USDC, CCTP local domain, TokenMessenger-to-MessageTransmitter linkage and deployed contract code. Checked 4 November 2026, 06:37–06:38 UTC.

Arc, Arbitrum, Avalanche, Base, Codex, Cronos, Edge, Ethereum, HyperEVM, Injective, Ink, Linea, Monad, Morph, Optimism, Pharos, Plasma, Plume, Polygon, Sei, Sonic, Unichain, World Chain, X Layer and XDC passed. Arc is the hub, leaving 24 EVM counterparties and 48 directional EVM routes.

Solana mainnet also passed the existing `inspectSolanaChain` read-only validation: genesis hash, slot, canonical six-decimal USDC mint and executable CCTP programs/ProgramData. Slot 465204199. App Kit Arc/Solana definitions passed existing metadata validation. Arc ↔ Solana adds two directions.

## Automated checks

23 tests passed across `bridgeRoute`, `bridgeMainnetConfig` and `bridgeWalletNetwork` (21,058 assertions). These cover both-direction selectors, environment isolation, wallet network setup, rejection handling and recovery safeguards. They are not completed financial transfers.

## What is not established by these checks

No wallet signature, allowance, source burn or destination mint was performed. This report does not establish end-to-end completion for all 50 configured directional mainnet routes. Route-specific quotes, FAST support, provider availability, source USDC and source/destination gas still need to pass at execution time. Non-CCTP networks cannot be enabled by adding a menu entry.

Blockscout PRO plan restrictions affect research data, not this wallet/CCTP bridge execution path. No bridge execution gate was removed and no paid plan was purchased.
