# Carpan Finance — accounting connector API v1

> Historical implementation record. For the current 13 October product scope use [submission readiness](grant-readiness-2026-10-13.md). Connector keys/scopes/webhooks were implemented later on 12 October, then intentionally closed: [API access boundary](carpan-api-closed-2026-10-12.md). Internal Finance operations remain available; neither an open commercial API nor a completed ERP pilot is claimed.

## Product scope

Carpan supplies reviewed onchain payment data to accounting-software connectors. Wallets retain control of funds. Accounting-program posting and API subscription billing remain future phases. Arc Mainnet is the first data adapter. Existing wallets, payments, collections and bridges retain their execution flows.

The console is **Finance → Integrations** (`/finance?view=integrations`). A business workspace owner/admin creates a named connector, issues scoped credentials, optionally configures a public HTTPS webhook, and explicitly chooses an immutable output batch to deliver. Reviewers/viewers can inspect their workspace but cannot manage connections. First use does not create a key or transmit a batch automatically.

## Three separate facts

| Fact | Evidence | Meaning |
| --- | --- | --- |
| Output generated | Immutable batch, content hash, exact decision versions | A reviewed file exists. Its original `readyForPosting:false`, `accountingStatus:not_submitted` fields remain frozen. |
| HTTP delivered | Signed event, stable event ID, attempt history, 2xx response | The receiving endpoint accepted an HTTP request. This does not prove an accounting entry. |
| Accounting acknowledged | Receiver's explicit API request, exact movement/version, external record ID | The connector asserts it saved that version in its own system. Carpan does not independently inspect the external ledger. |

Historical acknowledgements remain valid historical assertions after a decision changes. The movement API exposes a current `accountingAcknowledgement` only when its decision version equals the acknowledged version. A partial batch response states its acknowledged count and `batchAccountingStatus:partial`; it never silently labels the whole batch complete.

## Credentials and isolation

API credentials are returned once, masked by default in the console and kept only in component memory. The server stores a SHA-256 hash of a high-entropy credential, not its plaintext. Never place credentials in browser code, URLs, analytics, logs or a source repository. Store them in the connector's server-side secret manager.

Choose only required scopes:

- `movements:read`: company wallets, canonical movements and coverage.
- `exports:read`: generated, immutable approved batches.
- `accounting:write`: explicit external record acknowledgements.

Expiry options are 30, 90 or 365 days. Revocation takes effect on the next request. Every request rechecks the issuer's current account and owner/admin membership, workspace/integration availability, expiry and scope. A merged account or removed/downgraded membership invalidates the credential. The organization is derived only from the Bearer credential; a cookie, body owner or foreign wallet ID cannot change it. No scanner, approval or payment execution route is available through an API credential.

Management routes use the existing authenticated cookie, origin guard and `ownerId` replay guard. All management and external responses have `Cache-Control:private, no-store`. Integration creation requires a business workspace. Caps: 20 connectors per workspace, 100 active keys per workspace and 100 key history rows per connector. The console shows recent 100 keys/acknowledgements and recent 50 deliveries; output choices use only metadata for the newest 100 batches.

## External API

Base: `https://carpan.app/api/v1/finance`. Supply `Authorization: Bearer YOUR_API_KEY` over HTTPS.

| Method/path | Scope | Result |
| --- | --- | --- |
| `GET /wallets` | movements:read | `items` of this credential's workspace wallets. |
| `GET /wallets/:walletId/movements` | movements:read | 50 canonical records, decisions, current-version acknowledgement, related fees, coverage and `nextCursor`. |
| `GET /wallets/:walletId/exports` | exports:read | 50 immutable batch metadata items and `nextCursor`. |
| `GET /wallets/:walletId/exports/:batchId` | exports:read | Exact saved batch metadata/content hash/payload. |
| `POST /wallets/:walletId/exports/:batchId/acknowledgements` | accounting:write | Receiver's versioned records and batch acknowledgement counts. |

Pass a returned cursor as `?cursor=...`; do not construct one. Movement pagination fails with 409 if the evidence/decisions changed between pages; restart from the first page. Export pagination follows creation time and ID. Raw quantities are strings representing exact integers. Canonical Arc movements use 18 decimals and native system-event identity `5042:transactionHash:logIndex`. ERC-20 aliases are source evidence, never extra payments. Transaction gas is separate, once per transaction, with stable `5042:transactionHash:gas` identity; deduplicate fee IDs across batches.

This API serves manually loaded, bounded evidence. It does not promise continuous or complete historical coverage. Inspect `coverage`, its partial flag and loaded-range count. Gas-only transactions remain outside the transfer scan's coverage.

### Acknowledge after storing the external entry

```json
{
  "contentHash": "THE_SAVED_BATCH_CONTENT_HASH",
  "idempotencyKey": "YOUR_DURABLE_POSTING_REQUEST_ID",
  "records": [
    {
      "movementId": "5042:TRANSACTION_HASH:LOG_INDEX",
      "decisionVersion": 1,
      "externalRecordId": "YOUR_ACCOUNTING_RECORD_ID"
    }
  ]
}
```

Send 1–100 unique records drawn from that exact batch, with its exported approved decision versions. Partial acknowledgements are allowed. Same request identity and same normalized records return the original evidence; reuse with different records returns 409. An already acknowledged version cannot receive a second posting identity in the same connector, even through another batch. Different connectors have separate accounting namespaces. Several movement records may share one external journal ID when the receiving software stores them in one entry.

Response fields: `acknowledgements`, `acknowledgedCount`, `batchMovementCount`, `batchAccountingStatus:'partial'|'acknowledged'`. Counters describe that connector/batch. Use the immutable acknowledgement IDs and the exact exported versions for reconciliation, not HTTP delivery state.

Errors include 400 invalid data, 401 invalid/expired/revoked credential, 403 insufficient scope, 404 missing/foreign resource, 409 evidence/idempotency conflict, 429 capacity/rate limit and sanitized 503 temporary failure. Process-local limits: 120 requests/key/minute, 600/workspace/minute, 240/source IP/minute, 30 management mutations/user/minute. Persistent UTC-day limits: 10,000/key and 50,000/workspace; authenticated permitted attempts are counted before the handler, including later validation failures. Usage is a protective counter, not billable metering or a payment invoice.

## Signed delivery

Event schema `carpan.finance.webhook.v1`; type `finance.export.generated`; event fields `id`, `createdAt`, `organizationId`, `integrationId`, and the immutable `batch`. A batch is queued explicitly and once for an endpoint version. Maximum whole event size is 512 KiB; larger events are rejected in full. Target URL must be public HTTPS on port 443 with no credentials, query or fragment. Each attempt checks all DNS answers and pins the verified public IP for TLS transport. Private/reserved addresses and redirects are rejected. Network time is bounded, responses limited to 4 KiB and response bodies are not retained.

Headers:

- `Carpan-Event-Id`: same value as signed body `id`.
- `Carpan-Timestamp`: Unix seconds for this attempt.
- `Carpan-Signature`: `v1=` plus hexadecimal HMAC-SHA256.

Compute HMAC using the **whole `whsec_...` string as UTF-8**, over `timestamp + '.' + exactRawBody`. Do not parse/re-serialize before signature verification, or base64-decode the secret. Check timestamp freshness within five minutes, compare in constant time and require event ID equality. Persistently deduplicate event ID before creating records. Retries preserve event ID and body bytes, with a fresh timestamp/signature; receiving services must be idempotent.

Endpoint signing secrets are encrypted at rest with AES-256-GCM and organization/endpoint-bound authenticated data. The stable server encryption master is server-only `FINANCE_WEBHOOK_ENCRYPTION_KEY` (64 hex) or `_FILE`. It is generated on the VPS without entering chat or repository files. Missing/invalid configuration disables webhook setup/sending while existing API access remains separate. Keep the master across deployments; master rotation requires re-encrypting endpoint records and is not an implemented console action. Endpoint signing-secret rotation is explicit, displays the new secret once and cancels outstanding old-version deliveries.

Worker: one bounded loop per API process, every 15 seconds, 2 concurrent deliveries, at most 10 claims/run, persistent 30-second leases. Interrupted attempts are reclaimed. Eight automatic attempts per cycle use exponential backoff (30 seconds up to one hour); the total delivery lifetime is 24 hours. Failed current-version deliveries allow at most three explicit retry cycles during that lifetime. Queue cap: 1,000 pending/sending rows per organization. Changing URL, enabling state or secret cancels queued/in-flight/failed old-version rows and requires a fresh explicit queue action. An already started HTTP request cannot be withdrawn; the receiver must deduplicate IDs and the completion check cannot resurrect a cancelled row.

## Backup and deployment

Consistent database backups with configured signing must include a matched private `.finance-webhooks.key` sidecar, mode 0600. Snapshot publication happens after the paired key is written; restore checks verify endpoint key fingerprints and reject missing/mismatched keys. Retention prunes only a validated snapshot and its exact named pair. Offsite backup remains unconfigured because the owner has no external storage account yet.

Deploy with additive schema migrations, database backup, verified source archive, atomic release activation, API restart, original health/monitor gates and rollback. Existing data, provider credentials and indexer are preserved. No real third-party endpoint, accounting-software account, subscription or financial transfer is created by deployment.

## Validation and remaining product work

Real Bun SQLite/Express tests cover credential scopes/isolation/revocation/issuer changes, immutable exact-version/partial acknowledgement, pagination changes, outbox signatures/retries/leases/SSRF/pinned transport and recoverable encryption-key snapshots. Local browser QA uses an isolated memory database and injected recipient, never a real external posting. EN/TR and 390px layouts are checked. Final release evidence is appended after production checks.

Still required for a commercial rollout: a chosen accounting-software adapter and its real end-to-end pilot, continuous gap-free indexing/backfill, member invitations, billing/pricing and customer quotas, multi-chain data adapters, offsite recovery and operational agreements. This release supplies the connector foundation; it does not imply those features already exist.

### Production acceptance — release 20261012-02

Activated 12 October 2026, 13:17:43 UTC (16:17 Türkiye). Previous 20261012-01 retained. Full verification: 358 tests, 24,047 assertions, 61 files, zero failures; repository guard, lint (zero warnings/errors), frontend TypeScript and production build passed. Bun compiled the API entry (741 modules). Strict full backend TypeScript still lacks installed real `bun:sqlite` type declarations; no claim of a complete backend typecheck is made.

Isolated browser/API QA verified masked one-time key issue, revocation, injected HTTP 204 delivery with no posting acknowledgement, then versioned `QA-ERP-001` acknowledgement. EN/TR and 390px layouts fit a 386px document; history tables scroll inside their 352px container. The authenticated live `CARPAN` workspace shows the unconfigured first-use connection screen, without inserting production fixtures or a destination. Both language switches update the modebar correctly through the existing App i18n subscription.

Release archive: 660 files, 7,925,610 bytes; SHA-256 `1ae5f871cae3db113633bac8a7fe4bb7d7ae0e9f00011303156e3610dec6f989`. Clean source export: 476 files, no private data, no Git publication. Backup, checksum, prepared-file byte checks, atomic switch, original health/monitor gate, exact HTTPS frontend and private 401 boundaries passed. Previous private environment settings and indexer start time are unchanged; only the new server encryption master was added and the API restarted. Homepage, login artwork, footer, bridge, collections and indexer source comparisons passed.

Linux backup and scratch restore passed with the matched encryption key sidecar, mode 0600. An independent private recovery copy of the master is retained for activation/rollback safety. Pinned TLS transport was checked only against Carpan's own domain using a harmless synthetic request (404 expected), without financial data or an external accounting destination. The previous Arc pilot receipt still normalizes to one canonical movement, one ERC-20 alias and separate gas.

Final 13:22:24 UTC: live health true, demo disabled, DB quick check `ok`, monitor true with no issues, API/indexer/backup/monitor active. New integration/key/endpoint/delivery/ack tables each contain zero records. VPS free disk 16.54%; only byte-identical inactive dependency files were linked to recover space, keeping active/rollback dependencies independent and all release paths/content. Linked inactive trees must never be installed into or edited before copying into a fresh independent release. No real accounting pilot, financial transfer, third-party webhook delivery or grant/repository publication was performed.
