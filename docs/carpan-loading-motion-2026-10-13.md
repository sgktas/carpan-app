# Latest revision: transparent frost, original colors preserved

13 October 2026. Owner clarified that loading must not recolor the page: the original black background remains visible, with a light frosted blur that makes text indistinct. The previous white-tinted overlay is superseded.

Overlay background is fully transparent (computed rgba(0,0,0,0)); backdrop-filter alone applies blur(8px). No brightness, saturation, white or dark scrim. Bootstrap HTML no longer includes the white-tint pseudo-element; its existing black loading background remains. Centered white emblem rotation, no progress line, delay and loading protections unchanged.

A delayed local ecosystem page was inspected with its real layout visible behind the blur: black remains black, page text/controls lose sharpness, only the rotating logo stays crisp. Evidence .local/pilot-evidence/loading-frost-preview-20261013.png. Lint 0 errors/0 warnings and production build passed. Cosmetic CSS/HTML update, no new API reads or backend changes. Prepared frontend-only patch04-p8 uses the existing protected package and rollback procedure.

---

## Previous light-tinted revision (superseded)

# Latest revision: rotating emblem and light frosted blur

13 October 2026. Owner corrected the requested loader: no line underneath; the Carpan emblem itself rotates around its center, over a light blur.

The loading track is removed from both React and bootstrap HTML. The original white emblem rotates continuously through 360 degrees in 2.4 seconds with a linear speed and fixed transform origin. The full-screen scrim is now rgba(239,243,249,.48), retaining the 16px background blur and centered position. Reduced-motion stops rotation. Existing delay, concurrent loading tokens, inert/scroll restoration and Home scrolling remain unchanged.

Local delayed-page verification: no track node; computed animation carpan-loader-orbit; six consecutive transform matrices changed from matrix(.976379,.216063,-.216063,.976379,0,0) to matrix(.670713,.741717,-.741717,.670713,0,0), while center stayed 768 / 319.6 in a 1536 x 639 viewport. White logo and light full-viewport blur inspected in screenshot .local/pilot-evidence/loading-orbit-preview-20261013.png. Lint (0 errors/0 warnings), TypeScript and production build passed. This is a visual correction; no additional backend test suite or API requests introduced. Deployment uses the same strict frontend-only backup/hash procedure under patch04-p7.

---

## Previous loader revision (superseded visually)

# Carpan: home motion and delayed page loading

Date: 13 October 2026

## Requested behavior

The brand link returns to the top with a fast upward movement. A delayed page load shows the Carpan emblem and a moving indeterminate line at the center of the screen, blurring the complete underlying viewport.

## Implementation

- Shared CarpanHomeLink uses a 620 ms cubic ease-out scroll. Same-page selection preserves the current URL. From another page it finishes the upward scroll before navigating Home. Modified/new-tab links retain browser behavior. Wheel, touch or scroll keys cancel movement; unmount cancels pending frames and navigation. Reduced-motion preference uses an immediate return.
- A single portal host starts after 280 ms of continuous loading, with a white original Carpan emblem, subtle breathing animation, indeterminate sliding line and 16 px full-viewport backdrop blur. No invented progress percentage.
- Independent load tokens cover authentication, lazy page bundles, bridge bundle and the initial primary reads in Finance operations, collections/payment detail, Terminal/contracts/wallets, ecosystem/catalog/market snapshots/project detail and account profile/sessions. Completion, failure or unmount releases tokens. Multiple simultaneous reads cannot stack overlays.
- Underlying content is inert while the overlay is visible. Body scrolling is locked with scrollbar compensation; prior styles and connected focus are restored on completion. The logo/progress animation respects reduced motion. A live status supplies localized accessible loading text.
- Critical HTML contains the same delayed mark for slow initial JavaScript download. React replaces this temporary bootstrap view. Existing page styles, hero assets and financial/authentication handlers are preserved.
- Background polling with already loaded data, notification refresh, profile saves, session revocation and wallet/payment signatures do not acquire a new global loading token. This change adds no API reads or new provider costs.

## Verification

Isolated localhost fixture, no production DB or outbound provider:

- Delayed ecosystem read: one overlay, white logo, blur(16px), root inert; center 768 / 319.6 in a 1536 x 639 viewport. Successful completion removes the overlay/inert and restores overflow.
- Simulated delayed HTTP 503: overlay closes, error and Retry are usable. Fast retry produced no overlay or inert in ten successive observations.
- Mobile delayed profile: center 195.2 / 422 in a 390 x 844 viewport; full coverage, no horizontal overflow; completion restored interaction.
- From ecosystem footer, observed descending scroll positions 515, 444, 364, 308, 270, 214, 184, 157, 133, 111, 86, 61, 45, 34, 26, 19 while pathname remained /ecosystem; afterward Home pathname / at scrollY 0.
- Full existing verification passed: repository guard, lint, typecheck, 401 tests / 24,340 assertions / 65 files / zero failures, production build. Final added initial-read hooks receive lint/typecheck/build checks again before packaging.

Evidence: .local/pilot-evidence/loading-motion-{preview,mobile,scroll}-20261013 files. Fixtures and evidence are excluded from the release archive.

## Deployment

Frontend-only patch prepared for active release 20261012-04, with the existing protected allowlist / private rollback / archive hash procedure. Immutable assets precede HTML activation. API/indexer restart and environment changes are unnecessary. Actual deployment outcome and archive fingerprint are recorded in the private patch manifest and AGENTS.md after successful activation.
