# Carpan — Finance, Terminal and Ecosystem on Arc

[Live product](https://carpan.app) · [Product walkthrough](https://carpan.app/about?lang=en) · [Reviewer guide](docs/reviewer-guide.md) · [Architecture](docs/architecture.md) · [Roadmap](ROADMAP.md)

Carpan is an independent onchain payment-data platform built first on Arc. Finance gives businesses a private workspace to load USDC evidence, associate counterparties and references, review movements and generate immutable JSON outputs. Terminal provides onchain research, and Ecosystem provides source-backed project discovery. Google, email and wallet sign-in share one account with explicit identity linking.

Collections remain a separate working flow: request → share link → payer reviews/signs a direct USDC transfer → receipt verification → owner matching → CSV. The Turkish desktop accounting product, Çarpan Muhasebe Asistanı, is separate from this web platform.

| Area | Working scope | Boundary |
| --- | --- | --- |
| Finance | Persistent company workspaces, eligible business wallets, private counterparties, cumulative canonical USDC movements, review/approval, decision history and immutable JSON exports; public wallet research and Collections | Bounded scans and discovered receipts have partial coverage; generated output is `readyForPosting:false` / `accountingStatus:not_submitted`, not an ERP posting |
| Terminal | Arc addresses/contracts/transfers/blocks/traces/token/NFT data, flow map, watchlist and alerts | Provider/index coverage applies; institutional ownership is not inferred |
| Ecosystem | Source-backed Arc directory and funding/development profiles; Arc pool prices and candlesticks; reviewed Upcoming announcements; private saved projects with opt-in in-app updates and exact-deadline reminders | Participation is not deployment; pools are provider-indexed, not every Arc token; research and announcements are dated editorial reviews, not an automatic news scraper; email/push project notifications are not enabled |
| USDC bridge | Reviewed Arc-centric EVM/Solana CCTP routes, original-transfer recovery | Historical Arc↔Arbitrum real pilots; new-route configuration checks are not financial pilots |
| API | Separate `/developers` category with an access-closed notice; connector implementation retained for a future launch | Key creation, external Finance API access and webhook delivery are closed; commercial ERP integration is not complete |

Scope updated **13 October 2026**. [Current readiness](docs/grant-readiness-2026-10-13.md) distinguishes implemented features, historical acceptance and remaining work.

The source package includes the [Finance operations report](docs/carpan-finance-operations-2026-10-12.md), [historical connector specification](docs/carpan-finance-integrations-2026-10-12.md), [history and credit repair report](docs/carpan-finance-history-api-budget-2026-10-12.md), [current API closure](docs/carpan-api-closed-2026-10-12.md) and [roadmap](ROADMAP.md). The selected public repository is [sgktas/carpan-app](https://github.com/sgktas/carpan-app); publication and its first hosted CI result are pending.

## Run locally

Use **Node 22.23.2**, **Bun 1.4.2**. `package-lock.json` is the installation lock.

```sh
npm ci
cp env.example .env
npm run start
```

PowerShell: `Copy-Item env.example .env`. Copy only if `.env` does not already exist. Open **http://127.0.0.1:5173**; API on port 3001. Set `VITE_APP_URL` to that exact browser origin. Wallet auth/payment RPC need no social-provider credentials. Full Blockscout research needs a server-only `BLOCKSCOUT_PRO_API_KEY`; no `VITE_` secret. Missing sources produce explicit errors, not sample data.

SQLite is created locally as `refbridge.db` unless configured. Never copy production data into a developer checkout. The indexer reads Arc Mainnet and direct deployments; it is not a complete chain index. Login is a free wallet message signature. Connection alone is not authentication. Financial signatures require separate review/approval. No demo account login. Google and email sign-in remain visible; they activate after server credentials and provider setup are complete. X remains disabled until explicitly enabled.

## Verify and export

```sh
npm run verify
npm run repo:prepare
```

Verification checks publication boundaries, lint, frontend TypeScript, isolated tests and build. The GitHub workflow is configured to run the same command with read-only repository permissions; an actual hosted result is pending publication. No funded wallet, real signature or transfer is needed by tests. This command does not establish a complete backend TypeScript check or an independent security audit.

The export creates a fresh `.local/carpan-repository-*` directory and SHA256 manifest from the reviewed source allowlist. Private environment values, databases, archives, runtime files and internal handoffs are excluded. Selected public documentation includes dated implementation and acceptance evidence. The export does not publish to GitHub. Inspect this clean export before initializing or publishing the selected repository. Do not publish the entire historical development directory.

**Licence:** the owner explicitly chose a public source repository without an open-source licence. No `LICENSE` file is included, and this README grants no open-source licence. Dependencies/assets retain their rights. [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md).

## Arc integration

Arc Mainnet 5042 / Testnet 5042002. USDC ERC-20 evidence uses 6 decimals; native system movements use exact 18-decimal quantities. Finance preserves their aliases without counting one payment twice and records gas separately. Circle App Kit/CCTP bridges USDC; wallets retain keys. Blockscout PRO/RPC provide evidence with source and coverage limits. Public payment links omit private customer/invoice fields. Legacy testnet escrow in `contracts/` is research, not the core payment-link contract; optional Foundry tests are separate.

Finance's internal operations remain available while the integration API is closed. `CARPAN_FINANCE_API_ENABLED=false` is the default: integration-management and external Finance API methods return `503 api_not_open`, and the webhook worker does not start. Opening the service requires the owner's explicit launch decision. Continuous indexing/backfill, additional-chain data adapters, actual accounting-software pilots, member invitations and pricing/billing remain planned.

[Grant brief](docs/grant-submission.md) · **info@carpan.app** · [@carpan_app](https://x.com/carpan_app).
