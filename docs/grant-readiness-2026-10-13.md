# Carpan — submission readiness, 13 October 2026

This assessment supersedes the submission blockers and product descriptions in the 11 October report. Historical receipts and test runs remain dated evidence. No grant application or GitHub publication has been completed.

## Decision

Carpan is ready to be presented as a working Arc Mainnet MVP for Arc Microgrants. The remaining submission work is repository publication and packaging the application, rather than adding another product. This is an engineering assessment of the implemented scope, not a funding decision or exhaustive security certification.

Before pressing Submit: provide the public repository and builder profile, run its actual hosted CI, confirm rights to submit and any prior Circle/Arc funding, and review the final application facts with the owner. The owner has selected GitHub account sgktas and no open-source licence. Public repository publication and hosted CI remain pending until actually completed. The historical development directory is not a Git repository; do not publish its private runtime/history files.

## Current implementation to describe

- Finance: authenticated business workspaces and eligible wallets; cumulative canonical Arc USDC movement evidence; private counterparties/references, review and versioned approval; immutable audit/output batches. Wallet research and Collections remain available.
- Collection evidence: earlier owner-signed 0.10 USDC Mainnet request/payment/receipt/reconciliation/CSV/alarm pilot. This is historical acceptance evidence, not customer revenue or independent traction.
- Source/history limits: bounded reads, manual history/receipt recovery and explicit incomplete coverage. There is no continuous gap-free ingestion or guarantee of a wallet's entire history. Native/ERC-20 mirrored evidence is deduplicated; network fees remain separate.
- Terminal: Arc evidence research, source links, token-aware flow/watch/alerts subject to provider and index coverage.
- Ecosystem: reviewed project/source profiles, source pool snapshots/candles, dated announcements and optional private in-app project updates. Old catalogue/pool counts are snapshots, not live adoption claims.
- API: separate `/developers` category is intentionally closed. All Finance integration-management and external `/api/v1/finance` services return the closed gate; webhook worker is disabled. Connector implementation exists for a later approved launch. No live accounting-software posting, billed API service or ERP pilot is claimed.
- Turkish accounting product: Çarpan Muhasebe Asistanı is separate from Carpan.app's global onchain Finance product.
- UI: cinematic homepage/auth, neutral workspace interiors, compact angled accounting promotion, consolidated Settings/notifications, removed homepage referral promotion and duplicate auth form logos.

## Verification available

The latest full backend gate recorded for the current service version passed 401 tests / 24,340 assertions / 65 files. Subsequent approved frontend revisions passed lint, TypeScript, production build and publication guard; no fresh full backend test or fresh financial pilot is claimed today. Authentication functional code in the latest form-logo revision was compared against the prior archive and changes were confined to the removed logo import/markup.

Read-only live check on 13 October: `/api/health` reports `ok:true`, `demoMode:false`; API/indexer and backup/monitor timers are active. Latest deployed frontend patch is 20261012-04-p13. Public read-only routes also report Arc Mainnet chain5042/liveindex, 15 catalogue projects and5documented assets (source catalogue dated9October), and503api_not_open for the external Finance movements endpoint. These checks establish current availability at inspection time, not all-feature acceptance or an uptime guarantee. Real Google/email/wallet acceptance and identity linking remain documented earlier evidence.

Publications will use the allowlisted source export produced by `npm run repo:prepare`, plus its SHA256 manifest and source guard. Environment files, databases, private key material, private .local evidence/archives, production state and installed dependencies are excluded. The source guard is a targeted publication check, not an independent comprehensive security audit. GitHub CI configuration exists; a hosted result only exists after a real push.

## Official programme requirements rechecked

[Arc Microgrants](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq), checked 13 October 2026: working Arc Mainnet deployment link, public repo, short project/Arc-use description and public GitHub/X/Farcaster builder profile. The programme offers 500 USDC per selected project; it does not require a company, traction, deck or roadmap. Prior Circle/Arc-funded work is ineligible and the submitter must have the right to submit the work. The stated closing time is **14 October 2026 at 23:59 ET**, equivalent to **15 October 2026 at 06:59 Türkiye**. Programme dates/counts can change; recheck when submitting.

[Circle Developer Grants](https://www.circle.com/grant), checked 13 October: a larger proposal needs business/Circle-and-Arc integration details, technical ownership, roadmap and proposed milestones. Usage/pilots/revenue or a credible path to them inform review. Carpan's accounting-data infrastructure direction is the strongest focus for that proposal, but funding amount, dates, team roles and commercial adoption must be actual owner inputs.

## Publication/application steps

1. Use owner sgktas, repository carpan-app, public visibility and no open-source licence, as selected by the owner. The Microgrants repo must be public; public visibility and an open-source licence are distinct decisions.
2. Publish the clean source with current README, architecture, run instructions, limitations and CI workflow. Get the actual hosted verification result.
3. Prepare a short English demo and application text focused on Arc USDC settlement, verified movements and explicit business reconciliation. Additional demo polish is optional for Microgrants, not an official prerequisite.
4. Attach carpan.app, the public repository, builder profile and historical receipt evidence as appropriate; check truthful eligibility statements and submit with owner review.

## Work after the MVP submission

Independent offsite backup/restore and external failure alerts; first-load SDK bundle performance; new bridge-route pilots when the owner resumes them; continuous history ingestion; real accounting-software adapters/pilots; commercial API launch, pricing and customer usage. These are future product/operations milestones, not completed capability or Microgrants public-repo substitutes.
