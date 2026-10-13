# Explicit Google → existing wallet account linking

## Additional Google account acceptance — 9 October 2026

The owner signed in with a second distinct Google account. The live Carpan homepage gear menu showed that account and the actual method "Google ile giris" (Google sign-in). The second-account login is verified; this does not establish the Cloud publishing-status setting, branding review or final policy links. Those configuration/policy checks remain separate. No account merge, permission change or transaction was performed. The private screenshot is excluded from source export.

## Current acceptance status — release 20261009-20

Owner completed the explicit link at17:10Turkey on9October. Google and the verified wallet remain on the original admin account; obsolete X was disconnected. Returning wallet login17:45 and returning Google login20:53 both reached that account. The Google return preserved the existing wallet session and verified wallet; the already-open tab updated without reload. Only the old17:10Google session was revoked with the owner's specific approval. No additional sessions were revoked.

The real collection/CSV/alarm and Social approval/save pilots passed. New-tab email login20:55 was verified on its existing separate email profile; no implicit email/Google merge. See [final live acceptance](live-acceptance-2026-10-09.md). Google public audience/branding/policy acceptance remains separate. The sections below are implementation and earlier deployment history.

## Reason and scope

A wallet previously verified on an existing account cannot be attached to a second Google profile. The user approved adding an explicit ownership-verification flow before the real collection pilot. Existing `/wallet/verify` still rejects collisions; ordinary sign-in never implicitly merges identities.

## Flow

1. Sign in to the unused Google profile. A Google session issued within 15 minutes is required.
2. Connect the wallet and open Account center. Review the account link.
3. Read the Google email, destination wallet and separate linking message. The message names the existing account and its permissions, origin, purpose, expiry and one-use nonce.
4. Explicitly approve and sign that message in the wallet. An ordinary login signature cannot authorize this operation.
5. Inside one immediate SQLite transaction, link the verified Google identity to the existing wallet account, retire the unused source profile, revoke its sessions, record an audit event and issue a Google session for the destination account.

No records or money are moved. Destination ID, wallet, role, profile, existing sessions and business records remain unchanged. Source row and unused initial grants remain historical and do not add destination credits. Retired source sessions are rejected even if accidentally reissued. Only unused, real, ordinary Google-only profiles qualify; source business activity, consumed or assigned referral credits, conflicting target sign-in identities, changed account details, expired/replayed challenges or a different session stop linking. Accounts with activity require a separately reviewed migration; that is not implemented here. EOA message signatures only; no new smart-contract wallet claim.

## Verification

- Clean source export: 215 tests / 1,560 assertions / 0 failures across 44 files.
- New linking coverage: 8 tests / 69 assertions, including live-route local HTTP tests. Temporary isolated SQLite only; no real Google calls or production writes.
- Tests cover two ownership proofs, exact session, one-use/expiry, wrong signature/wallet, CSRF, revoked source sessions, retained roles/records, rollback, concurrent completion and returning wallet login to the same account.
- Lint 0 errors/warnings, TypeScript and production build passed. Existing large SDK chunk warnings remain.
- Full-suite checks found stale Turkish UI/format assertions after English-first and the outdated X return anchor; those test expectations were corrected. CSV verification checks amounts, provenance and one fee row independently of header language. Runtime finance/bridge behavior was not changed.
- Real Google repeat sign-in returned to the originating Collections screen and the gear showed Google as the session method. Google public audience/non-test-user acceptance is still pending.

## Live acceptance

Release `20261009-16` is live as of 9 October 2026, 17:00 Turkey time, with `15` retained. A VPS backup completed before deployment; private configuration was unchanged. API restarted at 14:00:25 UTC; indexer start time stayed unchanged. API/indexer active, database integrity `ok`, Google/email available, X/demo disabled. Anonymous link preview/completion return 401. No accounts were linked by deployment (audit count 0 and retired count 0 at the post-deployment check).

Chrome verified the new panel, stale-session refusal, Google reauthentication and successful link preview for the owner's existing wallet. The owner subsequently completed the linking signature: read-only production verification found the Google identity and verified wallet on the same original account, with its admin role preserved and an audit completion at `2026-10-09T14:10:11.877Z` (17:10 Turkey time). Returning Google/wallet sign-ins after this real link remain pending. No funds were sent and the collection pilot has not completed.

## Remove an obsolete X connection

The user then requested removing the legacy X connection. A user-operated disconnect control is available in full AccountConnections (Account center and Settings Security). The server requires an alternative Google, wallet or email session issued within 15 minutes, backed by that account's verified identity. It clears only the provider X identity/name/handle, preserves the account ID, custom public profile, Google, email, wallet and role, changes an X primary method to the retained alternative, revokes X and unknown legacy sessions, cancels pending account-bound X OAuth and appends an audit. It does not delete the external X account or claim provider-side app authorization revocation. A new X identity requires normal OAuth verification later. The public `@carpan_app` footer link is separate from a user's login identity.

Clean source checks for this change: 220 tests / 1,598 assertions / 0 failures across 45 files; lint/typecheck/build passed. Release `20261009-17` deployed at 17:19 Turkey time, with 16 retained. VPS backup completed; private configuration unchanged; API/indexer active and database integrity `ok`. The signed-in account panel displays the linked Google identity and verified wallet; it still shows the legacy X connection. The new removal confirmation was opened and handed to the owner. Live X removal is pending the owner's final click.
