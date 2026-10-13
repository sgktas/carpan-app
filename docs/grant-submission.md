# Carpan — grant preparation brief

Updated 13 October 2026. [Current audit](grant-readiness-2026-10-13.md) supersedes the older readiness snapshots.

Product: https://carpan.app · English walkthrough: https://carpan.app/about?lang=en · Contact: info@carpan.app.
Public builder profile: [sgktas](https://github.com/sgktas). Selected public source repository: [sgktas/carpan-app](https://github.com/sgktas/carpan-app), with publication and hosted CI pending. The owner chose to include no open-source licence or `LICENSE` file. The application must use truthful rights-to-submit details.

## Short application description

Carpan is independent onchain payment-data infrastructure built first on Arc. Businesses can keep private workspaces, load canonical USDC movements, associate counterparties and references, review/approve records and generate immutable JSON outputs. Terminal connects the records to address, contract and transaction evidence; Ecosystem adds reviewed project profiles and actual Arc pool data. A separate Collections flow supports payment requests, checkout links, receipt verification, owner matching and CSV reconciliation.

Arc settles payments and supplies USDC gas. Circle App Kit/CCTP supports USDC funding and withdrawal routes, while Arc RPC and Blockscout evidence connect private work records to public movements. Wallet keys and financial approval stay with users. Native system events and ERC-20 aliases represent one canonical payment, with gas recorded separately. Historical discovery and bounded scans have explicit partial coverage; a receipt alone does not establish an invoice's purpose.

The web platform is separate from the Turkish desktop product Çarpan Muhasebe Asistanı. The future customer is a company or accounting-software vendor consuming reviewed payment data. The connector implementation is retained, but the separate `/developers` API category is intentionally closed: key creation, external API methods and webhook delivery are unavailable. Generated files retain `readyForPosting:false` and `accountingStatus:not_submitted`. No completed commercial ERP integration, billing service or continuous gap-free accounting index is claimed.

## Current evidence

- Finance · Terminal · Ecosystem are live, with EN/TR UI, real Google/email/wallet authentication and explicit identity linking.
- Finance's company operations foundation was implemented on 12 October: persistent workspace isolation, counterparties, canonical evidence, versioned decisions, review/approval and immutable outputs. Historical receipt discovery then recovered three existing canonical movements in the owner's selected wallet, without duplicate ERC-20 counting. This was historical evidence recovery, not a new payment or complete archive. [Operations](carpan-finance-operations-2026-10-12.md) · [History repair and limits](carpan-finance-history-api-budget-2026-10-12.md).
- The API was deliberately closed later on 12 October. Internal Finance operations remain available; integration-management and external methods return `503 api_not_open`, including with existing credentials, and the webhook worker does not run. [Current API boundary](carpan-api-closed-2026-10-12.md).
- Historical 9 October authentication acceptance covered Google public Production/domain/branding and public policy links, returning Google/wallet login, a second Google account, new-tab email login and cross-tab synchronization. [Acceptance scope](live-acceptance-2026-10-09.md).
- A user-signed 0.10 USDC Arc Mainnet acceptance pilot on 9 October completed request → checkout → receipt → owner matching → downloaded CSV and actual in-app alarm. [Receipt](https://explorer.arc.io/tx/0xd2edb3897c7fd8d91fb059231bbe84f459f6005e3c4545dbb6fb65ddb337a443) · [Acceptance scope](live-acceptance-2026-10-09.md).
- The 11 October catalogue snapshot recorded 14 reviewed profiles plus one approved community entry, 5 documented assets and 3 reviewed announcements. Project approval, private saving/removal and persistence had passed acceptance; these are dated counts, not a new live inventory.
- Arc pool prices, liquidity, volume and 24-hour/7-day source charts and opt-in private in-app project notifications are implemented. Source snapshots, provider limits and unavailable states remain visible.
- Previous Arc↔Arbitrum transfers/recovery passed. Further EVM/Solana routes have configuration checks; additional real financial pilots are paused by the owner.
- Automated tests use isolated databases and mocked providers. CI configuration/source export are not a hosted CI run or repository publication. See the current audit for the final test/deployment result.

These are owner-funded acceptance pilots and implementation evidence, not paying customers, external traction, an issued tax invoice or Circle endorsement.

## Arc Microgrants preparation

The official programme, rechecked 13 October, offers **$500 USDC** and asks for a working Mainnet link, public repository, short product/Arc explanation and public builder profile. The live product, explanation and selected [builder profile](https://github.com/sgktas) are prepared; publication of the selected **public repository** remains pending. The owner has chosen no open-source licence. Record the actual hosted CI result after publication as technical review evidence; CI is not listed as a programme application requirement.

The deadline is **14 October 2026, 23:59 ET — 15 October, 06:59 Türkiye**. Microgrants does not require a deck, traction, company formation or roadmap. No application has been submitted. [Official programme](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq), checked 13 October 2026. Recheck the form at submission and use truthful prior-funding and rights-to-submit declarations.

## Larger Developer Grants proposal — proposed, not achieved targets

The included [roadmap](../ROADMAP.md) develops the existing Finance foundation through durable history/review pilots, an accounting-software adapter pilot and controlled API launch, then billing and additional-chain data. It supplies proposed work, with no invented delivery dates, budgets or partners. The [operations](carpan-finance-operations-2026-10-12.md), [historical connector](carpan-finance-integrations-2026-10-12.md), [history repair](carpan-finance-history-api-budget-2026-10-12.md) and [API closure](carpan-api-closed-2026-10-12.md) reports are included with the source.

| Milestone | Deliverable | Evidence |
| --- | --- | --- |
| M1, existing baseline | Private movement operations and immutable output; Collections request → receipt → owner reconciliation → CSV | Dated operation/history acceptance and existing signed collection pilot; partial coverage retained |
| M2, proposed | Approved API launch and a chosen accounting-software adapter | Scoped connector access and a real receiver pilot; HTTP delivery and receiver accounting acknowledgement reported separately |
| M3, proposed | Initial cohort of businesses/builders | Actual use, paid/matched requests separated and consented feedback |
| M4, proposed | Independent backup and outage response | Offsite restore and external alert drill |
| M5, proposed | Research quality and reusable receipt interface | Reviewed entries, documented coverage and third-party feedback |

Funding amount, dates, team/technical ownership and usage plan need the owner's actual inputs. No invented customer targets or budget are submission facts. [Circle Developer Grants](https://www.circle.com/grant) reviews the business, Arc/Circle integration, roadmap and proposed milestones. [Arc Builders Fund](https://www.arc.io/builders-fund) is a separate investment initiative. Programme/portal details must be rechecked at application time.
