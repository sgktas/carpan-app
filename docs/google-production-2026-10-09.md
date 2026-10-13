# Google production preparation — 9 October 2026

## Completed live result

Frontend-only release **20261009-21** is live, with 20 retained. API/indexer remain active without restart; private configuration and database were preserved. Privacy and terms are public in English and Turkish. Desktop and 390px mobile layouts were checked; the mobile document has no horizontal overflow. Login/register and footer provide the policy links.

The owner explicitly authorized the root TXT addition and Search Console verification. Hostinger retained the existing website/mail/Resend records. Search Console now reports **verified owner** for carpan.app under the owner's existing Google account. Keep the verification TXT record in DNS.

Google Branding saved the Carpan logo, home `https://carpan.app`, privacy `/privacy` and terms `/terms`, with the existing Carpan Support group and info@carpan.app contact. Data Access declares only the three already-used non-sensitive scopes: openid, userinfo.email and userinfo.profile. Sensitive/restricted lists remain empty.

After separate action-time owner approval, Audience was changed to **In production / External**. Google subsequently verified the branding and the Publish branding action completed. Final returned UI: **“Your branding has been verified and is being shown to users.”** Verification Center reported that data-access verification is not required because no sensitive or restricted scopes are requested. No extra user login, account merge, session revocation or financial action was performed for this configuration step.

Private proof screenshots: `.local/pilot-evidence/google-domain-verified-20261009.jpg`, `google-production-20261009.jpg`, `google-branding-verified-20261009.jpg`, `legal-mobile-20261009.jpg`. These files stay out of the source package. Google approval concerns the configured branding and scopes; it is not a legal certification or proof that every possible product workflow has been tested.

Remaining outside this task: documented retention governance/international-transfer arrangements, offsite backup target, owner-deferred GitHub publication/actual CI and grant application materials/submission. The owner supplied operator name/country; team, budget and timeline must still be real owner inputs. New bridge pilots remain paused.

## Observed before changes

The real Carpan Google Cloud project has app name Carpan, support contact carpan-app-support@googlegroups.com, developer contact info@carpan.app and authorized domain carpan.app. Audience is External, publishing status Testing. The Publish app control is disabled pending Branding configuration. Logo, homepage, privacy and terms fields are empty. Cloud Data Access lists no declared scopes; runtime requests only openid/email/profile. Two distinct Google accounts have successfully signed in; this alone does not establish a production publishing state.

## Product changes prepared

- Public `/privacy` and `/terms` routes with complete English and Turkish text, independent of account authentication.
- Operator supplied directly by the owner: Semih Göktaş, Türkiye; contact info@carpan.app.
- Footer and login/register links; existing visual scenes and authentication handlers preserved.
- Privacy text grounded in actual Google identity verification, Resend delivery, session cookies, email-request IP records, account-scoped records, public payment payload, blockchain research and wallet/bridge integrations. No Gmail/Drive/Calendar access, invented self-service deletion or automatic identity merging.
- Clear retention, public-chain and provider-processing boundaries. These product notices are not a certification of GDPR/KVKK compliance. International-transfer arrangements and retention governance require separate legal/operational review; do not claim they were completed by adding links.

Google settings, domain ownership verification, public status and branding-review outcomes must be recorded from actual returned UI states. Do not claim Google verified/published the brand before that happens. An access-expanding publication or new domain-owner verification requires action-time browser confirmation.

## Verification

Lint passed with zero warnings/errors, TypeScript passed, production build passed. No authentication, finance, transfer-signature, database or provider-secret runtime changes. Earlier 229 source tests remain the last full suite; no new content-mirroring tests added. Frontend-only release 20261009-21 is deployed, with 20 preserved for rollback. Live route, language and mobile verification is recorded above.

Reference: [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Google policy requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [KVKK information requirements](https://www.kvkk.gov.tr/Icerik/2033/Aydinlatma-Yukumlulugu-).
