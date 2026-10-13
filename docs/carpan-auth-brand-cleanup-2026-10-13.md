# Login and registration brand cleanup — 13 October 2026

The owner requested removing the small Carpan emblem/wordmark above the login and registration headings because the large cinematic scene already carries the brand. Both routes use the same form component, so the duplicated brand link and its otherwise unused emblem import are removed once. Its unused base, cinematic, mobile and short-height CSS rules are removed.

The existing grid naturally centers the shorter form. The form begins with its localized sign-in/account-creation heading and description; no artificial replacement spacer is introduced. Scene artwork, motion controls, Home button, form fields, provider controls and legal links retain their existing implementation. Login/registration handlers, safe return URL handling, session behavior, OAuth, wallet signatures and email submission code are unchanged.

Verification: lint/TypeScript/production build and package guard, followed by read-only live desktop login and mobile registration layout checks. No sign-in, email sending or wallet signing is part of this cosmetic verification.
