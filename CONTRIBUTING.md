# Contributing

Use Node22.23.2, Bun1.4.2 and `npm ci`. Run `npm run verify` before proposing a change. Tests use isolated databases and mocked providers; never point tests at the production database.

Preserve the approved cinematic dark design, responsive layouts and explicit TR/EN strings. Do not create demo login, invented activity/balances, automatic payment retries, or implicit wallet signatures. Research remains Arc-only; crosschain networks are bridge routes, not a background scanner.

Financial changes require tests for amount precision, native/ERC-20 duplication, failed/unknown outcomes, recipient/network identity and owner isolation. No live signing is part of CI. Document the difference between configured, automatically tested, historically piloted and currently observed functionality.

Do not commit environment files, databases, deployment archives, private operational notes or credentials. Use `npm run repo:prepare` to export the reviewed source allowlist from a development workspace. The export does not publish to GitHub.
