## Production status confirmed — 9 October 2026

Google Audience now External / In production following explicit owner approval. Carpan logo/home/privacy/terms saved; domain ownership verified in Search Console; Google branding verified and published. Only openid/userinfo.email/userinfo.profile declared; sensitive/restricted empty. EN/TR policy routes and auth/footer links are live in release20261009-21. This supersedes older pending production/brand/policy statements below. Real returning Google, second distinct Google and Resend new-tab login acceptance was already completed; no new auth session or merge for this configuration. See [production record](google-production-2026-10-09.md).

# Carpan login provider setup

## Additional Google account acceptance — 9 October 2026

The owner signed in with a second distinct Google account. The live Carpan homepage gear menu showed that account and the actual method "Google ile giris" (Google sign-in). The second-account login is verified; this does not establish the Cloud publishing-status setting, branding review or final policy links. Those configuration/policy checks remain separate. No account merge, permission change or transaction was performed. The private screenshot is excluded from source export.

Current acceptance — release 20261009-20: first and returning Google/email logins passed live. Returning Google20:53 reached the original linked wallet/admin account, preserving the existing wallet session. The owner completed the Resend email link in a new tab; Security/Sessions showed the actual email method and20:55session. An already-open tab updated without manual reload after both provider changes. Email remains a separate profile; no implicit merge. Legacy X is removed. Google public audience/non-test-user/branding/policy checks remain pending. See [final live acceptance](live-acceptance-2026-10-09.md). Earlier preparation notes below are historical.

Update — release 20261009-16: live Google reauthentication returned to the originating Collections page and showed the actual Google session in the gear menu. Explicit Google → existing verified wallet account linking is deployed, limited to unused Google-only source profiles and requiring a fresh Google session plus a separate, purpose-bound wallet signature. Live owner completion remains pending. This is not implicit identity merging, email-account linking or Google public-audience acceptance. See [account-link verification](google-wallet-account-link-2026-10-09.md).

Google and email remain part of the product. Visible controls stay disabled until the server is configured. A green `/api/auth/status` availability flag confirms configuration presence, not a successful live sign-in.

Status on 2026-10-09: Google credentials are applied privately to the VPS, and a user-completed first live login is verified by the account screen's Google session and linked identity. API/indexer health passed after the API-only restart. Google public audience/branding acceptance and a repeated sign-out/sign-in pilot are not yet verified. The owner verified the Resend account. `auth.carpan.app` is verified in Resend after three exact provider-generated Hostinger DNS records were added with explicit approval. TLS is enforced; a tracking subdomain was not configured. The owner created and privately saved the domain-restricted Sending-access key. The two Resend fields were applied to the VPS after database/environment backups with an API-only restart. Production availability is Google=true/email=true/X=false. Real login emails show delivered in Resend. A user-completed live email login is verified by a new email session in the database and the account menu showing E-posta ile giriş and a linked Email identity. Release20261009-12 also preserves internal product destinations through OAuth and email links. X remains deferred.

## Google

1. Create a separate Google Cloud project for Carpan. A personal Google account can own a project without an organization. The owner must accept applicable Google terms.
2. In Google Auth Platform configure Carpan branding, an External audience and the developer contact. Only `openid email profile` are requested. No Gmail, Drive or Calendar permission is needed.
3. Create a Web application OAuth client with the exact production redirect URI `https://carpan.app/api/auth/google/callback`. If an origin is requested, use `https://carpan.app`.
4. Add the account used for the pilot as a test user while the application is in Testing. Testing is not public launch.
5. Save client credentials privately as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; neither belongs in Vite variables, source archives or chat.
   Google displays and downloads the full secret only when it is created. Keep that dialog open until the owner stores it securely. If the value was not saved, the owner uses the client's **Add secret** control and saves the new value immediately. After the new secret is verified in use, disable the unused earlier secret; do not delete a credential as part of an incidental UI check. See [Google client secret visibility and rotation](https://support.google.com/cloud/answer/15549257?hl=en).
6. Before a public release, configure and verify the authorized domain, complete the homepage/privacy/terms links and applicable brand review. The support email selector accepts the signed-in Google account or a managed Google Group; an arbitrary Hostinger mailbox does not automatically appear there.

## Email through Resend

1. The owner creates a Resend account and accepts its terms.
2. Add `auth.carpan.app` as the sending domain. Use the exact DNS records supplied by the provider in Hostinger. Preserve the existing root-domain mailbox records. Do not guess DKIM/SPF values.
3. Verify the domain. Disable click/open tracking for login messages so login-token links are not rewritten for tracking.
4. Create a Sending-access API key restricted to this sending domain. Save it privately as `RESEND_API_KEY`; sender is `RESEND_FROM_EMAIL=Carpan <login@auth.carpan.app>`.
5. Apply only the four provider fields to the server environment, take a backup, restart the API and verify health. A mailbox alone does not provide an email API.

### Verified domain setup on 2026-10-09

The Resend region is Ireland (`eu-west-1`). The actual provider UI generated a DKIM TXT record at `resend._domainkey.auth`, plus CNAME records `rsend.auth` → `rsend-euw1.forge.rmta.net` and `send.auth` → `send.forge.rmta.net`. All three use TTL 3600 in Hostinger and were observed through public DNS from the VPS. Resend reports every required record and the domain as **verified**. These are observed records for this account, not a universal template for other Resend domains. The existing root MX/SPF/DMARC, Hostinger DKIM, website A and www records were retained. Receiving remains disabled. The sending identity is `Carpan <login@auth.carpan.app>`.

No tracking domain was added, so tracking is not enabled. Enforced TLS is selected and verified in the domain configuration; delivery to a receiving server without TLS will fail instead of exposing a login link over an unencrypted connection. No login email was sent as part of DNS setup. Subsequently, after provider configuration, owner-requested login emails were observed as delivered.

## Live acceptance

### Return to the originating product page

Header sign-in/sign-up retains the current internal page, including product filters and anchors. Home sign-in returns home; `/dashboard` is reached through the explicit Account overview destination or an explicit protected-page request. Wallet and OAuth use the same safe destination rules. Email links carry an encoded `next` query parameter so opening the link in another tab does not depend on that tab's session storage; the one-use token remains in the fragment and requires explicit completion. Foreign URLs, ambiguous slashes, control characters, API endpoints and login/register loops fall back to home. Referral intents remain intact. No account identities are merged by this routing change.

- Google: real browser consent → the intended Carpan destination → account menu shows Google. Sign out and sign in again to confirm the same account.
- Email: request a real email → open the link → explicitly complete sign-in → account menu shows email. Check expiry and one-use behavior with isolated tests, not destructive production changes.
- Do not silently merge identities that share an email. Explicit cross-provider linking is not implemented. A verified wallet can be linked from the existing account to retain that account for later wallet login.
- No provider is described as operational until the corresponding live pilot succeeds. X stays deferred.

Official references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google branding](https://support.google.com/cloud/answer/15549049), [Resend domains](https://resend.com/docs/dashboard/domains/introduction), [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction).
