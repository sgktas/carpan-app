# Carpan Finance — onchain payment request pilot

Updated 22 October 2026. Carpan remains the product; this module is a Finance / Collections capability built in Arc Studio. It records payment requests, **not legal or tax invoices**. No independent professional security audit has been completed.

## Implementation

- Studio project: https://studio.arc.io/app/6038d4e9-b980-42dc-a513-df90db3878ae
- Product route: `/finance/invoices`, linked from Collections.
- Source: `contracts/CarpanInvoice.sol`, `src/components/invoices/`, `src/pages/FinanceInvoicesPage.tsx`.
- Reference hashes are creator-scoped: `keccak256(abi.encode(creator, keccak256(UTF8(reference))))`. The hash and payment details are public. Hashing is not encryption; do not put personal data in references.
- Direct, noncustodial USDC settlement: payer → recipient. The contract never holds customer funds. It charges no platform commission; network gas applies.
- Create, lookup and payment are separate actions. Exact-amount ERC-20 allowance and payment require separate wallet approvals. No transaction runs on lookup or page load.
- Create preflight rejects duplicates and failed RPC/simulation reads, validates recipient/amount/expiry and checks the live wallet after asynchronous reads. Payment rechecks invoice state, expiry and allowance before requesting a signature. Receipt status must be successful before displaying success.
- Optional expiry and creator-only cancellation exist in the contract. Cancellation UI is not yet provided.
- The historical `CarpanInvoicePayments` draft used a different ABI and was replaced; it is **not** the deployed contract.

## Verified deployments

| Network | Chain | Contract |
| --- | --- | --- |
| Arc Mainnet | 5042 | [0x8b151423b836db39b6d740c186a215e0105c0ebe](https://explorer.arc.io/address/0x8b151423b836db39b6d740c186a215e0105c0ebe) |
| Arc Testnet | 5042002 | [0x248d2ed657dbcb686fc61c180fc480ba0bd681a4](https://explorer.testnet.arc.io/address/0x248d2ed657dbcb686fc61c180fc480ba0bd681a4) |

Both use USDC `0x3600000000000000000000000000000000000000` (ERC-20: 6 decimals; native gas accounting: 18 decimals). Runtime bytecode matches across these deployments. Mainnet initialization bytecode matches the reviewed Studio compiled artifact plus constructor arguments: keccak256 `0x4d450e1adf972f44d1b2e7749117e480169710a0073933e424327e9bc96f1317`. Explorer source-code verification is a separate step and is not claimed here.

## Mainnet evidence — 22 October 2026

This was an owner-operated pilot between two owned wallets, **not customer traction**.

- [Contract deployment](https://explorer.arc.io/tx/0xebe5354eeb3ef62ca34b56d4eda561d463fff5ccbda8564f3fb8fe923ca1ee61): success, block 27297591, gas 0.01212596 USDC.
- [Payment request creation](https://explorer.arc.io/tx/0xa96d2ccd809697a3027b40413cf4a79b661ba0407c2b53e2059dd98b1c1aa58d): success, block 27298725.
- [0.10 USDC settlement](https://explorer.arc.io/tx/0x19b5ea4afda6463038218af88010dfe6903e1c21fd72c64ae0b25839a2cce964): success, block 27299344, gas 0.001920595 USDC.
- Invoice key: `0x7b77de0ea8d42ade16091a2d7827b3c6678c32d0ba4f10ed64b619516fe3559d`.
- Payer: `0xFcDFE331d8A712ab450FB539Ed2CC27297CcF281`; recipient: `0xC00820213335E3C25d0a542c3d8F132716c9af09`.
- Independently checked: successful receipt, ERC-20 Transfer raw `100000`, matching InvoicePaid event, getInvoice status `1` (Paid), remaining allowance `0`.
- [Earlier testnet settlement](https://explorer.testnet.arc.io/tx/0x748798df08e32240aeffa43511988040fd261d6959467f8ead482b2ec8fa7f67).

## Local review

Use the main repository setup instructions (`npm ci`, configured backend, `npm run dev`). The invoice route reads public chain data directly and does not need a signer to inspect the completed pilot. A wallet is required only for explicit writes. Use the pilot's existing paid key for read-only demos; do not repeat payments to obtain screenshots.

The Studio source reported 44 passing frontend checks and a successful lint/typecheck/build after hardening. The exported local pilot independently passed 30 create/payment regression checks. These are distinct code snapshots; integration checks are recorded separately when executed. Contract tests are in `contracts/test/CarpanInvoice.t.sol` (`npm run contracts:test` with Foundry and the repository dependencies installed).

## Scope and remaining work

Private Carpan collection records, invoice matching decisions and accounting exports remain separate. This module does not automatically post to an ERP, create tax documents, or mark a private collection accepted. Those decisions require the existing business workflow. The customer API remains closed.

Before the Built with Arc Studio submission: verify the public deployment and repo, capture the actual Studio development and mainnet receipt in the updated demo, recheck the programme form and obtain the owner's final submission approval. Do not claim the new application has been submitted.

Original Carpan code remains UNLICENSED; existing third-party licences remain applicable.
