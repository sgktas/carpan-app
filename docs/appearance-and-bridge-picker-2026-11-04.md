# Appearance and bridge network picker

Deployed 4 November 2026 as frontend patch `20261104-appearance`. HTTPS bridge, settings and wallet routes returned the exact deployed HTML. Production environment hash and API/indexer start timestamps remained unchanged; neither service was restarted. Existing files were backed up before atomic replacement of the HTML entry point.

## Behavior

- Replaced native network selects with a searchable modal containing the network mark, name, environment and current-selection check. Existing route validation still pins one side to Arc. Search/selection never requests a wallet action.
- All 26 mainnet entries have locally served marks. Testnet icons resolve to the same network by reviewed CCTP domain. Arc uses the previously reviewed official asset. Other assets and origins are recorded in `public/images/networks/bridge-sources.json`: LI.FI chain icons, Codex's official app icon and EdgeX's official favicon. These identify supported networks and do not indicate endorsement.
- Native modal provides focus containment and Escape handling; results also support arrow keys, Home and End. Active operations close/disable the chooser. Modal is rendered outside the financial fieldset to avoid inherited form styling.
- Dark/light controls appear in the header settings menu and Settings → Preferences, accessible without login. Dark remains the default. Choice is stored in browser local storage and synchronized across same-origin tabs. Storage failure does not prevent an in-tab change. Initial HTML applies the saved choice before React loads.
- ConnectKit and toast appearance follow the selection. Light surfaces cover shared navigation, operational modules, tables, settings and below-hero content. Cinematic hero/auth artwork retains its dark material and original colors.

## Verification

- TypeScript and lint passed; no lint errors or warnings.
- Existing 23 bridge route/configuration/wallet tests passed, including both-direction validation and recovery safeguards. No financial logic changed.
- Chrome local acceptance: all 26 modal image elements loaded successfully; search `sol` returned Solana; selection opened the existing Solana bridge; Escape restored focus to the chooser; saved light choice survived navigation/reload. Dark choice restored successfully.
- At 390px: document width 386px; dialog width approximately 352px, no horizontal overflow. Viewport reset after inspection.
- Light Finance/Terminal/Ecosystem views inspected using GET-only proxy to public production APIs. Preview rejects non-GET API calls and performs no wallet transactions. The normal committed Vite proxy is unchanged.

Local preview: `http://127.0.0.1:5195/arc?view=bridge&environment=mainnet&lang=en`. Public screenshots retain the user's Chrome automatic translation; network names are explicitly excluded from translation.
