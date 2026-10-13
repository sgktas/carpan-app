# Blockscout demonstration — 3 minutes 45 seconds

English recording script, prepared 13 October 2026. **This document is a script; it is not a recorded video.** Use a clean recording profile and a dedicated demonstration workspace. Local test data must be visibly identified as synthetic. Do not present a cache response as a new live PRO call.

## Before recording

Choose a known qualifying Arc transaction. Load the wallet once, open its movement and verify the displayed provider, original acquisition time, cache flag and RPC verification. If quota permits no new PRO request, disclose that the demonstration uses a previously acquired PRO page. If its discovery provenance is missing, use a newly acquired, correctly labelled record; do not relabel an old one.

Hide credentials, personal email, private counterparties and invoices. Financial transfers or new wallet signatures are not needed. Use local injected receipts for approval/export examples if altering live business records has not been specifically authorized.

## 0:00–0:25 — Problem and product

Show the product entry and Finance workspace.

> Carpan helps businesses turn Arc USDC transfers into reviewable records. A transaction hash tells us what happened onchain, but the business still needs to understand the counterparty and payment reference. Carpan connects transaction research with a private review workflow.

## 0:25–1:05 — Blockscout discovery

Show history discovery, its partial coverage and a loaded movement. Expand Discovery and verification.

> Blockscout's address token-transfer API discovers historical transaction candidates. Each movement preserves where it was found, the original source-read time and whether that read used a cached page. Local index entries and collection receipts can also provide hints. We keep these discovery sources separate from proof of the payment.

State the actual source/cache label visible in this recording. Explain that no complete wallet history is claimed.

## 1:05–1:50 — Research in Terminal

Click **Research in Terminal**. Confirm the same transaction hash. Show summary, transfer page, logs and one available state/internal-call panel, then the Explorer link.

> The same transaction opens in Terminal. Blockscout supplies transaction context, transfers, events and deeper research where available. This lets a reviewer investigate a movement before deciding what it means for their business. Unavailable or restricted data stays explicit.

Only describe a panel as available if it actually returned data. Do not use blank or cached panels to imply an unsupported API capability.

## 1:50–2:30 — Canonical verification

Return to Finance and show the RPC verification block hash, event identity, linked ERC-20 evidence and separate gas.

> Arc RPC independently checks the receipt and canonical block. Native USDC system events retain exact quantities, while ERC-20 mirror events remain linked aliases of the same payment. They are not a second payment. Transaction gas is shown separately and counted once.

## 2:30–3:15 — Private business review

In a dedicated local demonstration workspace, attach a clearly synthetic counterparty or reference, save for review, approve and download the JSON output.

> A workspace label is our own business record, not verified address ownership. Review and approval are versioned. The approved data can be exported as an immutable file. This is a reviewed export, not an acknowledgement that an accounting application has posted it.

Show `readyForPosting:false` and `accountingStatus:not_submitted` in the file. Avoid editing real account records solely for the recording.

## 3:15–3:45 — New work and verification

Show the public repository's new dated commit, relevant tests and architecture diagram.

> Carpan predates this buildathon. Our new work extends Finance history discovery and provider-cost controls, then adds persistent source provenance and direct Terminal investigation. Tests cover canonical verification, private workspace boundaries, preserved discovery on refresh and immutable exports. Continuous history and commercial accounting delivery remain future milestones.

## Recording acceptance

- 3–5 minutes, readable browser UI, one coherent transaction throughout.
- Actual provider/cache state disclosed; local examples visibly labelled.
- Same-hash Finance → Terminal navigation shown.
- Public repo, API explanation and Explorer evidence shown.
- No private keys, provider keys, personal contact information or unapproved live mutations.
- Record the actual video URL and final X post URL only after they exist.
