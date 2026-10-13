# Profile, Settings and account menu — 12 October 2026

Owner requested removal of the obsolete dashboard/referral summary from account
navigation, distinct Profile and Settings destinations, and a clear logout row.

- Account name/email/session method in the gear menu are informational text.
- Profile opens `/profile`: email, existing public name and username editing.
- Settings opens `/settings`: Security, Sessions and Preferences. The profile
  editor is not repeated inside Settings; legacy `?tab=account` opens Profile.
- Logout is a separated final menu row with visible label and icon. Existing
  logout failure handling preserves the current account/session.
- The dashboard screen, its referral summaries and polling have been removed.
  Existing `/dashboard` bookmarks redirect to Profile; the former `#account`
  wallet-link target redirects to Security settings.
- Wallet verification and explicit Google-wallet linking live in Security, using
  the same server nonce, original message signing and verification APIs. Provider
  linking returns to Security. No signature or transfer is automatic.
- Landing account CTA and collection wallet-link prompts use the new destinations.

Account identities, stored public profiles, referral/project records, Finance data,
sessions and permissions are not rewritten. The separately closed API category
remains closed. This is a frontend-only change; private server/environment and
indexer files remain unchanged.

Full repository guard, lint, TypeScript, 401 tests across 65 files and production
build passed. Existing auth and linking regression tests remain green. No live
profile edit, logout, signature, provider-link removal or payment is required for
the navigation/visual checks.
