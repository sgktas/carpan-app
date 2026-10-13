# API category and closed access — 12 October 2026

Owner requested a separate API category and no current API usage. The homepage
navigation, workspace switcher and global workspace header link to `/developers`,
labelled **API**. This public EN/TR placeholder states that access is closed.
The URL deliberately stays outside the reserved `/api/` backend proxy namespace.

Finance contains only business movements and wallet research. Its previous
`?view=integrations` bookmark redirects to the closed API page. The integration
component and its private data remain available as implementation for a later
approved launch, but there is no active key/webhook console in the current UI.

`CARPAN_FINANCE_API_ENABLED` is a server-only owner launch switch, default false.
The global gate rejects all internal integration management and external Finance
API methods with HTTP 503 and `api_not_open`, before service handlers. It also
prevents the main process from starting the webhook worker. Existing API keys do
not bypass this gate. No key, integration, queued delivery, database record or
encryption master is deleted. Internal Finance wallet/collection operations,
the consumed Arc/Blockscout APIs, authentication and private administrator usage
reports retain their original behavior. Future opening requires the owner's
explicit release decision and interface/configuration revision.

Full source guard, lint, TypeScript, 401 tests across 65 files and production build
passed. The dedicated closure tests verify all methods with presented credentials
are rejected without invoking service handlers and that deliberate future enabling
delegates to the existing authorization boundary.
