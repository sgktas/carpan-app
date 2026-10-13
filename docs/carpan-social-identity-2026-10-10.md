# Carpan browser and social identity — 2026-10-10

Owner requested a brighter browser icon and black/white premium social profile, header and campaign artwork in formal and cinematic treatments.

## Implementation

- Existing public emblem remains unchanged. Canonical SHA256: `bd5cf5eed4c6c9cd47a31b5436fb84dccb77ee620b00c95550d47dc067b311b8`.
- Favicon uses the exact original alpha, white on opaque black, optically centered. Sizes16/32/48/64/256, multi-sizeICO, self-contained raster-backedSVG,180AppleTouch,192/512app and maskable512. Small-size proof inspected on light and dark surroundings. Embedded white source has zero alpha differences from original.
- Versioned metadata avoids reusing the old plum source as the browser icon. Manifest display remains browser; no offline/PWA capability implied.
- Link preview now has a dedicated readable CARPAN1200×630 black/white brand image instead of an unbranded cinematic scene. OpenGraph dimensions/alt and Twitter image/alt are explicit.
- Social kit has12formal designs with editableSVG counterparts and5native cinematic originals. Exact dimensions and source-fidelity limits are documented in the gallery/kitREADME. Built-in imagegen prompts retained, no artificial upscale/4K claim.
- Profile: formal2048/1024;Xheader3000×1000/1500×500; square2160²;portrait2160×2700;landscape2400×1350;threeproductposts;template;linkpreview. Cinematic originals1254²,2170×725,1122×1402 and1672×941.

## Scope

No page design, header mark, cinematic homepage/auth scene, account method, API/indexer, data, wallet/signature/transfer or server configuration changes. No social account upload or post. No third-party logos/endorsement claims. Native source logo is raster1254; SVG layouts embed it honestly.

## Acceptance

Production build passed. Release20261010-09 is live, prior08 retained. Backup/checksum/atomic switch/DBquickcheck passed. HTTPS icon, manifest and social-card bytes match deployed assets; index references the versioned white/black favicon and new link-preview image. Health2026-10-10T12:47:14.226Z, demo disabled, Google/email available. Application/server source, original public mark, homepage scene, private env hash and API/indexer start timestamps unchanged; services active without restart.

Social deliverable folder: `brand/carpan/social-20261010`; gallery `index.html`, README and prompt set. Private proofs are excluded from the repository export.
