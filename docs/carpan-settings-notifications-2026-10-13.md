# Settings, notifications and compact network indicators

Owner requested seven refinements: smaller Arc marks, Profile inside Settings, no workspace switcher in the gear menu, a single name field, no footer language selector, a notification bell beside Settings, and the homepage logo returning to the page top.

## Changes

- Settings defaults to Profile, followed by Security, Sessions and Preferences. The public display name is the only editable name; email and member-since date are read-only. The existing public handle remains stored and is preserved verbatim by name updates. No identity or business records are deleted.
- `/profile` and old `/dashboard` bookmarks redirect into Settings. The existing `#account` wallet-link destination still goes to Security. The account header now uses the Finance / Terminal / Ecosystem / API navigation rather than Terminal-only research links.
- Gear menu no longer duplicates Profile or the workspace launcher. Language, Settings, administrator-only management, About, Support and final separated Logout remain.
- Notification bell uses the two existing authenticated, account-scoped Terminal and Ecosystem inboxes. It loads only when opened or manually refreshed; there is no automatic polling, new worker, browser push or email channel. At most eight notifications are shown, unread first; notification links retain transaction/token evidence or project notification anchors. Opening or following a notification does not silently mark it read. Read controls and preferences remain in their respective modules.
- Failed sources are identified individually and cannot appear as a complete empty inbox or misleading zero unread count. Late requests are ignored after closing or changing account. Visitors see a sign-in prompt and make no inbox requests.
- Official Arc SVG bytes/colors/aspect ratio remain unchanged. Requested compact presentation uses 28px imagery in a 44px footprint, replacing 50px imagery with a 90px footprint. Bridge network selectors now have a 56px minimum height; route, quote, signature and transfer handlers are untouched. This is a presentation revision, not a new licensing statement.
- Footer language controls removed; language is still available from the gear menu and Settings Preferences. Shared CarpanHomeLink returns an already-open homepage to scroll position zero and preserves modified/new-tab clicks. Footer, main header and tools use it.

## Verification

- Repository guard, lint, TypeScript and production build passed. Full suite: 401 tests, 24,340 assertions, 65 files, zero failures. The first sandbox run encountered local networking/hard-link restrictions; the same suite passed outside those restrictions.
- Isolated loopback fixture verified name save with unchanged handle, EN/TR layout, removed menu rows, combined inbox, partial source failure with retained successful notifications, empty state, Escape focus restoration and 390px viewport fit. Fixture operations use no production database or outbound provider calls.
- Footer logo returned the same homepage to `scrollY=0`; Arc images rendered at 28px and footer language controls were absent.
- Deployment uses a strictly allowlisted frontend patch with private rollback copies, immutable assets before HTML, exact package comparison and unchanged private environment. No API or indexer restart, payment, signature, session revocation, profile mutation or notification read action is required for live visual verification.

Public commercial API remains closed. Financial pilots, repository publication and grant submission remain outside this revision.
