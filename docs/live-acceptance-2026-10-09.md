## Later Google publication result — 9 October 2026 / release21

Google Cloud Production/External, Search Console verified ownership and Carpan branding verified/published now confirmed after required owner approvals. Public EN/TR policy routes and auth/footer links are live; desktop/390px layouts checked. This supersedes the earlier Google configuration/policy pending entry. No repeat login, payment, account link or session revocation was needed. [Configuration evidence](google-production-2026-10-09.md).

# Carpan live acceptance — 9 October 2026

## Additional Google account acceptance — 9 October 2026

The owner signed in with a second distinct Google account. The live Carpan homepage gear menu showed that account and the actual method "Google ile giris" (Google sign-in). The second-account login is verified; this does not establish the Cloud publishing-status setting, branding review or final policy links. Those configuration/policy checks remain separate. No account merge, permission change or transaction was performed. The private screenshot is excluded from source export.

## Final browser acceptance — 9 October 2026, release 20261009-20

Chrome control recovered. The previously pending live checks now passed through the real production UI:

- Returning Google sign-in reached Settings / Sessions at 20:53 Turkey time. The original admin account and verified wallet remained; the existing 17:45 wallet session was not revoked. Security showed Google plus the verified wallet and no legacy X connection.
- The already-open Carpan tab changed to the Google session label without a manual reload. The release-20 cross-tab synchronization fix is now verified live.
- The real Carpan project proposal was approved in the admin UI, appeared in public discovery, saved to the account, remained saved after reload, was removed and then saved again. Its description uses the real product/domain; no referral program or contract was invented. This owner listing/save is acceptance evidence, not external traction.
- A login email was sent through Resend to the existing email account. The owner opened the link in a new tab and completed sign-in. The already-open tab changed to the email account without reload. Security showed the actual email method; Sessions showed the current email session started at 20:55 Turkey time. The email profile remains separate from the explicitly linked Google/wallet admin account. No implicit merge or additional wallet link was performed.

Private screenshots are stored under `.local/pilot-evidence` and excluded from the source ZIP. No credentials, email tokens, cookies or screenshots are published with the repository. No new payment or session revocation was performed during these checks. The earlier collection, CSV and alarm evidence remains valid.

Full source verification: **229 tests / 1,676 assertions / 0 failures across 47 files**; focused authentication/Social checks: 21 tests / 215 assertions. TypeScript and the source guard passed. Release 20's previously verified lint/build remains the deployed runtime; the later test/report changes do not require a runtime rebuild.

Still separate and pending: Google public audience/non-test-user acceptance and final branding/policy links; GitHub publication and actual CI; legal/operator, team, budget, dates and demo/application materials; independent offsite backup. New bridge-route financial pilots remain paused by the owner. No grant application or repository was published. Historical pending notes below record earlier observations and do not override this final acceptance.

## Financial pilot evidence — release 20261009-20

**The real collection pilot completed.** Owner signed 0.10 USDC from the distinct payer wallet to the verified recipient on Arc Mainnet. Successful transaction [0xd2ed…a443](https://explorer.arc.io/tx/0xd2edb3897c7fd8d91fb059231bbe84f459f6005e3c4545dbb6fb65ddb337a443), block 25,088,751 at 14:59:08 UTC / 17:59:08 Turkey time. Gas was 0.00097900004909685 USDC, separate from the payment.

The public checkout verified delivery and prevented resending. The owner's inbox found one canonical incoming payment, suggested the same request by exact amount and payer, and attached one proof (system event log 25 / ERC-20 mirror deduplicated). Before matching, credited amount remained zero and state was review. Explicit matching then gave 0 outstanding, 0.10 matched and an empty review queue. Append-only audit actions are `linked`, `accepted`. This is an owner-funded acceptance pilot, not customer revenue or an issued tax invoice.

Actual downloaded CSV was inspected with a standard CSV parser: 16 columns, one request row (expected/accepted 0.10), one movement row (0.10), one transaction-fee row (0.00097900004909685), and the same transaction hash in evidence/fee rows. Private local copy and checks in `.local/pilot-evidence`, excluded from source publishing.

The active USDC alarm produced the matching `in` notification with raw amount `100000` for the exact same hash. Real alarm delivery is therefore established in addition to create/persist/pause/resume. The account retained admin, Google and verified wallet; X is absent. After explicitly approved revocation of the old 17:10 Google session, only the current wallet session remains. Read-only production database integrity is `ok`; index is live with actual lag 20, block 25,089,284 and 10,919 indexed deployments in the latest sample.

20 deployed frontend-only at 17:58 Turkey time with API/indexer starts unchanged. Live Google/email/cross-tab and Social acceptance subsequently passed as recorded above. Source-only HTTP regression scenarios cover linked-account returning Google login and the submit/admin-approval/save/remove lifecycle using temporary databases and mocked providers; those source results are distinct from the real browser evidence above.

## Remaining preparation

- Google public audience/non-test-user acceptance and final policy links.
- GitHub/CI and owner-supplied legal/operator/team/budget/timeline/demo/application materials.
- Independent offsite backup and restore evidence.
- New bridge-route financial pilots remain paused.

## Earlier observations — superseded by the latest result above

- Owner completed Google → existing wallet identity linking at 17:10 Turkey time. Read-only database and signed-in UI show the Google identity plus verified wallet on the original admin account.
- Owner removed the old X link. Read-only database: no numeric X identity, one X disconnect audit event, Google and verified wallet retained, admin role retained. Signed-in menu/AccountConnections no longer shows `@refvox`.
- Settings Account/Security/Sessions and the authenticated gear navigation load real account data. Sessions shows the current Google session; no fabricated device/location information. No profile fields were changed for testing.
- A temporary watch for the owner's existing wallet saved successfully, survived reload and appeared as one address in My watchlist.
- A temporary USDC transfer alarm for that wallet saved and survived reload. Its first real Explorer scan completed; no matching new transfer was observed. Pause was exercised. An end-to-end delivered notification requires a new qualifying onchain event and is not established by rule creation.

## Bug found during acceptance

Adding a watch exposed a growing indexer lag. Service logs confirmed Arc RPC `-32005`, `rate limit exceeded`, and an `eth_getLogs` request with `topics: []` and no address filter. The running indexer had not restarted with the newer source releases.

The source also used raw `topics` with Viem `getLogs`; the installed Viem action accepts `event`/`args`, so those raw filters were ignored. Added `arcWatchedLogs` using the Transfer ABI and indexed `from`/`to` address OR groups capped at 50. Actual Viem transport regression checks assert outgoing RPC topic filters, including both directions. Empty watches never query the whole chain. Empty blocks cannot contain logs and now skip those reads. Removed/non-Transfer events are excluded. Failed watch scans still do not commit a deployment or advance the checkpoint; idempotent retry coverage remains.

18 was deployed with an indexer-only restart and preserved API sessions. Live verification showed the correct filters but the provider still rate-limited repeated per-block reads. Follow-up shares heavy log reads across windows of up to 128 blocks, commits each block in order, validates log block association and waits for a short group of 32 when watches exist. It retries from the contiguous stored checkpoint after failure and applies a retry delay. Watched updates therefore occur in short groups; actual block lag remains visible in `/arc/status`. No artificial zero lag or complete-history claim is added. Seven targeted tests / 40 assertions cover outgoing RPC, bounded queries, correct log block association, failure/retry and contiguous checkpoints. Follow-up live recovery is still pending at source preparation.

Clean source checks before batching: 223 tests / 1,616 assertions / 0 failures across 46 files; lint 0 errors/warnings and TypeScript passed. Frontend is unchanged from the previously verified 17 build.

## Preparation history

### Later observations

- 19 deployed with another indexer-only restart and retained API sessions. Actual watched-address indexing recovered from roughly 1,900 blocks behind to `live=true`, lag 20, block 25,086,840 and 10,888 deployments. The sampled new service logs showed resumed deployments. The real lag is intentionally not forced to zero.
- Owner completed returning wallet login at 17:45 Turkey time. The same linked account's Sessions screen displayed the current wallet session plus the previous Google session. Owner explicitly approved ending only the old 17:10 Google session; the in-product confirmation was used. Returning Google login after that remains pending.
- A real Carpan project proposal was submitted for admin review with its actual `carpan.app` domain and no invented referral program or contract ownership. It is not a published catalog entry yet.
- Prepared one explicitly named acceptance collection, reference `CP-8D532362A408`, 0.10 USDC, recipient the verified owner wallet, payer the distinct owner-supplied second wallet. It is a pilot, not an invoice or customer traction. The public preview shows the correct remaining amount and recipient; owner payment and reconciliation remain pending.
- Read-only balances confirmed the second wallet already has 1 USDC and the main wallet 11.383514 USDC. No agent-originated funding was submitted; do not send a duplicate 0.30 funding merely because an earlier proposal mentioned it.
- A second tab kept the previous Google session label after wallet login changed the shared cookie. Added timestamp-only cross-tab auth announcements and focus/visibility refresh, with latest-read ordering so stale replies cannot replace newer auth state. No identity/token/cookie is placed in localStorage. Two event-signal tests passed; live cross-tab acceptance is pending deployment.
- Latest clean suite: 227 tests / 1,640 assertions / 0 failures across 47 files; lint/typecheck/build passed.

- Returning Google and wallet login after the real identity link; user wallet signature required.
- Email link in a new tab: use the already existing email account; it is not implicitly merged into the Google/wallet account.
- Real collection request → distinct payer wallet payment → receipt → owner matching → CSV, and resulting alarm notification. Payer wallet and amount require owner input; no self-payment or signature is inferred from previous bridge pilots.
- Sourced Social project submission/approval/save pilot. The catalog is empty; no fake fixture projects are published for acceptance.
- Google public audience/non-test-user acceptance, offsite backup target and GitHub/CI/application materials remain separate pending tasks.

Temporary personal records are acceptance data, not customer traction. Restore or disable them after testing and record the final state.
