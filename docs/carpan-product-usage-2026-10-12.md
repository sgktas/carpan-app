# Product usage and automated traffic — 12 October 2026

## Purpose

The previous Nginx audit classified requests declaring AhrefsBot and GPTBot. Those
requests are neither a count of people nor proof that someone used a signed-in
Carpan workspace. Historical User-Agent labels were not authenticated against
their operators' IP lists. Provider usage and product adoption are separate.

The administrator Usage view separates:

- Observed authenticated account activity and completed sign-ins after measurement
  started. Accounts are not unique people or independently verified customers.
- Successful server product requests, named as requests rather than newly created
  resources or completed payments. Retries may produce more than one request.
- Current durable records belonging to real, unmerged accounts: business
  workspaces, wallets, collection requests and receipts, watch entries, referrals
  and export batches. These are a current snapshot, not period activity or revenue.
- Automated User-Agent declarations and unidentified public API traffic. Unknown
  clients are never automatically labeled as human visitors. External integration
  API requests are a separate service category.

## Measurement

First-party server observations use UTC calendar days and fixed categories. The
first initialization stores a measurement start time; it does not reconstruct
past logins or account activity from existing sessions. Existing sessions are
deleted on logout, expiry and maintenance, making that reconstruction unreliable.

Demo and merged account aliases are excluded. Administrator activity is excluded
by default and can be included explicitly for internal testing. Daily unique
accounts and unique accounts across an entire range are different metrics; daily
counts must never be summed into a range's unique accounts.

Only successful selected product requests with a server-validated account qualify
for account activity. Authentication/status polls, notifications, health checks,
administrator reports, background workers and service API calls do not establish
active account usage. Known crawler declarations remain crawler traffic even if
a request has a valid cookie. Login measurement follows successful provider or
wallet verification; account-link session rotation is not a new login event.

The report endpoint is `GET /api/admin/usage?days=7&includeAdmin=false`, with only
7, 30 or 90 accepted days. It requires the existing administrator session and
returns private, non-cacheable aggregate data. It reads local SQLite only; it
never requests Blockscout, RPC, Google Analytics or another measurement provider.

## Data and limits

Daily account rows contain an internal user ID, UTC date, fixed event and count.
Traffic rows contain only fixed module, client and response categories and counts.
No new IP, full User-Agent, email, wallet address, URL/query, request body,
transaction amount, session token or advertising identifier is stored in these
measurement tables. Existing security/application records retain their original
purpose and retention.

Measurement rows are retained for 90 UTC calendar days. The privacy notice in both
languages describes this server-side measurement, retention and administrator
access. No extra browser tracking cookie, public telemetry endpoint or third-party
audience tracker is introduced. Measurement writes are best effort and must not
prevent authentication, financial operations or other product responses.

This is not a complete website visitor counter. It does not track every static
page view, independently verify a person, prove all supported bridge routes were
used, or establish that a receipt was posted to an external accounting program.
Old crawler totals are not imported as new measurements.

## Verification

- Full repository verification passed: 399 tests across 64 files, 24,320
  assertions, zero failures; source guard, lint, TypeScript and production build
  passed. The Bun server entry point compiled successfully.
- Focused measurement and account-link tests passed: 19 tests, 110 assertions.
  Tests cover declared crawlers with cookies, unknown visitors, UTC ranges,
  distinct accounts, demo/merged/admin exclusion, polling, retention, private
  administrator access and zero measurement provider requests.
- The new account observation table initially triggered the existing fresh
  Google profile's business-data guard. The guard now ignores only this incidental
  telemetry table; actual business ownership, fresh authentication, dual proof,
  existing permissions and one-use signature requirements remain enforced. The
  route regression test confirms telemetry exists before the successful link.
- Isolated, in-memory UI fixtures verified 7/30/90-day selection, administrator
  exclusion/inclusion, manual refresh and English/Turkish display. At 390 pixels
  the document width was 386 pixels and the console about 354 pixels, with no
  horizontal page overflow. Before-measurement dates display no data rather than
  fabricated zeros. An API outage retained the last successful report with a
  retry message. These fixture figures are not production adoption evidence.
- 477 existing source files were checked against a pre-change hash manifest.
  Apart from explicitly reviewed account-link guard/test edits, protected
  homepage, authentication visuals, footer, provider, chain and financial
  implementation files are unchanged.

- VPS release `20261012-04` activated at 19:29 UTC / 22:29 Türkiye. Measurement
  initialization was `2026-10-12T19:29:00.739Z`. Database integrity, public health,
  Google/email availability, guest administrator API 401, crawler API 403,
  exact frontend bytes, existing private settings and unchanged indexer start
  time passed. Consistent backup and paired-key restore checks passed; the prior
  release remains available. The unchanged monitor passed with 15.37% free disk.
- The authenticated live administrator report showed current records separately
  from newly measured events. Reading the existing collection screen produced
  one observed administrator account and two Finance reads when administrators
  were explicitly included. The default scope excludes those internal reads.
  No new account, signature, collection, transfer or accounting record was created.
- The first two crawler-labelled counts were the deployment's deliberate
  AhrefsBot/GPTBot rejection probes; the initial external API attempt was a private
  401 boundary probe. They are request observations, not actual visitor/customer
  evidence. External API counts include failed attempts, not just authenticated
  integrations. The display calls them integration API requests.
