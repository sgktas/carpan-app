# Finance history and Explorer credit use — 12 October 2026

## Incident

The selected business wallet had no saved Finance movements. Its latest refresh
covered only 1,024 recent blocks; earlier transfers existed outside that window.
An empty bounded scan was not evidence that the wallet had never received USDC.
The local Arc index and existing Explorer cache contained older receipt hints.

The Explorer account separately reported approximately 80,020 of its 100,000
daily credits used, with 19,980 remaining. The application protects a 20,000-credit
reserve, so fresh PRO queries were paused. Existing RPC balance and receipt reads
do not consume that Explorer credit pool.

Today's Developer Portal resource counts included:

| Endpoint class | Calls | Reported credits |
| --- | ---: | ---: |
| Address coin balance history | 507 | 25,350 |
| Address token transfers | 787 | 23,610 |
| Address overview | 542 | 10,840 |
| Address counters | 507 | 10,140 |
| Address token balances | 507 | 10,140 |

The provider's endpoint table and headline balance were sampled at different
reporting boundaries. They must not be summed into a more precise account debit.
The old application estimate used 20 credits per call; this understated the
50-credit balance-history and 30-credit address-transfer endpoints. Old feature
attribution was not recorded and cannot be reconstructed accurately.

A read-only aggregate of today's Nginx log found 2,972 public wallet-transfer and
2,889 wallet-research requests across 2,856 wallets. User-Agent classifications
included 5,620 AhrefsBot and 234 GPTBot requests. A User-Agent identifies a claimed
client, not a verified person or bot identity. Nevertheless, these repeated public
API reads explain why an interactive user's activity alone cannot account for the
consumption. The log aggregate contains no IP addresses, credentials or emails.

## Changes

- Finance loads historical candidates from the local index, private collection
  proofs and one budget-controlled Explorer page per request. Every imported
  receipt and its canonical block are rechecked through Arc RPC.
- Native USDC amounts retain 18-decimal precision. ERC-20 event aliases do not
  create a second payment; each transaction's gas is recorded once.
- Pagination is signed and bound to the authenticated owner, organization and
  business wallet. Write membership is rechecked after network reads. Failed
  candidates can be retried without starving later candidates.
- The interface distinguishes discovered receipt history from a complete
  historical scan. It displays source freshness, failures and continuation.
- Known crawler User-Agents are denied on public wallet-data API endpoints.
  API responses are marked against indexing; robots.txt excludes /api/.
- Public wallet reads receive a bounded per-client request limit. Repeated wallet
  enrichment reads share a five-minute cache with original acquisition times.
  These controls complement, and do not replace, the account credit reserve.
- Alarm reads use the background budget and fresh results only. Normal polling
  has a five-minute minimum, saving mode a fifteen-minute minimum, and a fair
  interval based on active addresses and worst-case page costs.
- New usage records distinguish endpoint class and purpose. No wallet address,
  query string, secret or identity is saved in the attribution table.

## Limits

Receipt discovery is not a full archive of every native-only payment. Missing
receipts, unavailable source pages or expired cursors remain visible as partial
coverage. Manual receipt import and bounded earlier-block scans remain available.
No transaction, export approval or accounting posting is triggered automatically.

No quota reset or reserve bypass is performed. Blockscout's documented daily pool
renews at midnight UTC, which is 03:00 in Türkiye. Local estimates and provider
observations are labeled separately.

## References

- [Blockscout PRO API guide](https://www.blog.blockscout.com/blockscout-pro-api-postman/)
- Developer Portal API call costs and account usage, inspected 12 October 2026.
- Private VPS read-only database and access-log aggregates; no sensitive log rows
  are included in this document.

## Verification and live release

- Full repository guard, lint, typecheck, tests and frontend build passed: 387
  server tests across 63 files, no failures. Bun compiled the server entry point.
- The VPS activated release `20261012-03`. A final atomic patch
  `20261012-03-p1` also protects URL-encoded wallet parameters. Original source
  files and the patch manifest are kept privately for rollback.
- Read-only pre-activation verification recovered three canonical USDC movements
  from three historical receipts while issuing zero PRO requests under the
  protected reserve. The check used an in-memory fixture; production persistence
  happened through the user's existing authenticated Finance interface.
- The live interface loaded the three movements. The incoming filter showed the
  existing 0.10 USDC collection; the outgoing filter showed two movements.
  Reloading history kept three saved movements and added zero duplicates.
- At a 390-pixel viewport the page and new scope bar had no horizontal overflow.
  A long 18-decimal summary value wrapped on desktop; KPI presentation was then
  shortened to at most six fractional digits, with `≈` for discarded nonzero
  precision and the complete exact value in its title. Receipt rows, decision
  evidence and exports retain their exact amounts.
- Live health, Google/email availability, private workspace 401 boundaries,
  ordinary and URL-encoded AhrefsBot/GPTBot 403 boundaries, database quick check,
  paired encryption-key backup and restore verification passed. Private settings
  were unchanged and the indexer did not restart.

These checks validate recovered evidence and the repaired flow. They do not
establish complete archive coverage or resistance to clients that disguise their
User-Agent. The credit reserve remains the final spending boundary.
