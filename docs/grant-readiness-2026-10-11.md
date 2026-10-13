# Historical readiness audit — superseded by 13 October

Use [current submission readiness](grant-readiness-2026-10-13.md) for present product/API scope and repository blockers. The dated report below preserves earlier acceptance evidence.

# Carpan — current readiness audit

Date: 11 October 2026. Product: https://carpan.app. This report supersedes pending items in the historical 9 October snapshots.

## Decision

The existing Finance, Terminal and Ecosystem MVP is suitable for a product demonstration and technical review. A grant submission has not been made. The public repository requirement is still outstanding; a local source export and CI configuration are not a published repository or a completed hosted CI run.

## Evidence and scope

| Area | Verified evidence | Boundary |
| --- | --- | --- |
| Authentication | Google Production/domain/branding; returning Google and wallet login; second Google account; Resend email link opened in a new tab; cross-tab session refresh | Real browser acceptance on 9 October; current provider availability rechecked on 11 October. New signatures/login emails were not requested in this audit. X sign-in is intentionally disabled. |
| One account | Explicit Google/wallet identity linking, original role retained, legacy X identity removed | Independent email accounts are not implicitly merged. |
| Collections | User-signed 0.10 USDC Mainnet checkout, receipt, owner matching, CSV and actual alarm | Owner-funded acceptance pilot, not customer revenue, a tax invoice or external traction. |
| Finance research | Live RPC balance, 11 loaded ERC-20 movements and cash-flow/counterparty views loaded in Chrome on 11 October | Loaded range only; not a full accounting/tax engine or all-history portfolio. |
| Terminal | Live index/API, address/contract research, evidence links, private watches and alarms | Index lag is measured, not forced to zero; provider/history limits remain visible. |
| Ecosystem | 15 public projects, including 14 reviewed profiles; 5 documented assets; 3 reviewed announcements | Reviewed source catalogue, not automatic coverage of every Arc project. |
| Markets | 20 fresh Arc pools; actual price/liquidity/volume and source chart loaded in Chrome | Provider snapshot/first page; pool metrics are not global token aggregates. Missing price remains unavailable. |
| Project notifications | Private saved-project preferences and notifications covered by isolation/opt-in tests | In-app only; no email/push or automatic opt-in. No live preference changed in this audit. |
| Bridges | Previous real Arc↔Arbitrum deliveries and recovery acceptance | Additional EVM/Solana routes have configuration checks; their real transfer pilots remain owner-deferred. |
| Operations | API/indexer/backup/restore/monitor timers active; SQLite quick_check=ok; today's restore rehearsal | Same-VPS backups only. Offsite storage and external outage alerts are not configured. |
| Presentation | Existing cinematic home/auth and neutral interiors preserved; EN/TR views and actual market chart inspected | This is not an independent security assessment or exhaustive device/performance certification. |

The financial receipt and earlier login acceptance are recorded in [live acceptance](live-acceptance-2026-10-09.md). Google configuration evidence is in [production setup](google-production-2026-10-09.md). Provider and notification boundaries are in [markets](carpan-markets-2026-10-10.md) and [project updates](carpan-ecosystem-updates-2026-10-10.md).

## Defects found and repaired

1. **Finance notes across an account change.** A delayed save or unmount flush could use a newer shared session cookie. Edits now retain their original account ID, and the server checks it against the authenticated cookie owner before writing. A mismatched save returns 409; the payload never determines account authority. Regression cases cover timer, cleanup, forged owner and retry.
2. **Route scrolling.** Footer navigation could open a new page at its footer, and asynchronous hash targets were not handled. New paths start at the top; search/tab changes preserve position; section links wait for their actual target. The observer is bounded and cancelled by route/user interaction.
3. **Stale monitor success.** A database/disk read exception could leave the earlier healthy marker unchanged. A fresh timestamped failed report now replaces it with a fixed, non-sensitive issue code. SQLite open/query and disk failures are tested.
4. **Reviewer documentation.** The payment URL is `/pay/:token`; obsolete Social, missing-market and pending-Google statements have been corrected in the submission brief. Historical reports are explicitly labelled.

Complete verification passed: **256 tests, 2,030 assertions, 0 failures across 51 files**; source guard, lint (0 errors/warnings), TypeScript and production build passed. The first sandbox run could not reach test loopback sockets; the permitted run exposed an older integration fixture missing the new account guard, which was updated without weakening that guard. The final full suite passed. Large SDK bundle warnings remain.

Release **20261011-01** is live. Backup/checksum/prepared-file verification, atomic activation, API-only restart, health/provider checks, unauthenticated private-write rejection (401) and SQLite integrity passed. Private environment hash and indexer start remained unchanged. The initial deployment comparison normalized Windows CRLF and incorrectly failed; automatic rollback kept the prior release working. Byte comparison proved identical content and the corrected activation passed.

Chrome acceptance of the deployed release: footer → Finance ends at `scrollY=0`; Gateway → Circle `#development` reaches the actual funding section (target top about 110px). Live 24-hour/7-day source candles, Finance ledger, all-token Terminal transfers and enabled Google/email/wallet controls were inspected. No fresh payment, signature, account merge, grant submission or publication was performed. Private screenshots and deployment details remain outside the source export.

Latest read-only production check at 18:16 UTC: API/indexer/all operations timers active, database `ok`, actual sampled index lag 10 blocks, fresh healthy monitor marker and today's successful restore rehearsal. These are point-in-time checks, not an uptime guarantee.

## What is actually missing for submission

### Arc Microgrants

The official programme requests a working Mainnet link, public repo, short product/Arc explanation and public builder profile. The product and English walkthrough already exist. Remaining: choose the repository owner/publication and licence, publish the clean source, obtain its actual CI result, choose the builder profile and submit the form. An open-source licence is a separate owner decision; public visibility alone does not grant reuse rights.

The stated deadline is **14 October 2026, 23:59 ET — 15 October, 06:59 Türkiye**. Dates may change. [Official programme](https://community.arc.io/public/events/arc-microgrants-f8tijfjhyq), checked 11 October. Prior Circle/Arc funding and rights-to-submit declarations require the owner's truthful confirmation in the application.

### Circle Developer Grants

A larger proposal needs the real team/technical ownership, business and usage path, roadmap and proposed milestones. Budget, dates and a short demo should be prepared for that proposal rather than presented as completed facts. [Official programme](https://www.circle.com/grant), checked 11 October. Builders Fund is an investment initiative with a separate application, not this grant.

## Before wider user rollout

- Independent offsite backup and restore evidence.
- External failure-alert delivery and an outage drill.
- Performance work on large Circle SDK chunks and first-load size.
- New bridge-route pilots when the owner resumes them.
- Further real users and feedback; current owner pilots do not establish traction.

These engineering improvements are separate from the Microgrants public-repo requirement. No extra product is needed to explain the present MVP.
