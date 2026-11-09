# ZIMBA RENT — Neon Auth and subscriptions

Public site: https://mdanson27.github.io/THE-ZIMBA-RENT/

## Development status (9 November 2026)

ZIMBA has a public real-estate frontend hosted on GitHub Pages, a property-management demo, and a Neon development database with property and subscription schemas.

Neon Managed Better Auth is enabled for the zimba_rent_dev database, including:
- Email/password signup and sign-in
- Email OTP verification
- Google OAuth via Neon shared development provider
- Session revocation on password reset
- GitHub Pages trusted origin

Site routes:
- #/auth — sign in
- #/signup — create account
- #/verify-email — enter OTP
- #/account — view account and current tier
- #/workspace/overview — session-gated management demo
- #/workspace/admin — administrator tier assignments
- #/plans — provisional subscription tiers
- #/legal/terms and #/legal/privacy — policy drafts

## Subscription tiers

Starter (5 properties, 1 team member), Growth (50, 10), Business (250, 50), Enterprise (custom).
These are provisional entitlement definitions. Pricing, payment collection, renewals and cancellation rules are not yet active.

The plan tables, role controls and audited RPCs are versioned in db/0003_auth_subscriptions.sql.

## Administrator activation

The designated platform administrator is automindsafrica@gmail.com.

The administrator must authenticate with that exact verified Google account. The Neon claim_zimba_admin RPC checks the verified identity and linked Google OAuth account before creating an admin record. Revoked admin records cannot be reclaimed.

The admin directory RPC and audited plan assignment RPC enforce privileges in the database, not merely the public frontend. Every tier assignment requires an audit reason.

## Neon APIs

Auth base URL:
https://ep-misty-frost-ber91fca.neonauth.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/auth

Data API URL:
https://ep-misty-frost-ber91fca.apirest.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/rest/v1

These are public endpoint addresses, not secrets. Keep database credentials out of GitHub Pages.

Authenticated RPCs: my_subscription, claim_zimba_admin, admin_user_directory and admin_assign_plan. Neon Data API was enabled with broad default table grants disabled.

## Security and production limitations

The management workspace currently contains browser-local demonstration data. The route is session-gated but does not yet handle genuine tenant or financial records securely.

Policy screens are drafts requiring legal review. Signup agreement acknowledgements are not yet persistent legally binding consent records.

Google shared OAuth and SMTP are for development, not a final branded production configuration. The login, signup, OTP, Google and browser session flows still require end-to-end verification with test accounts.

The separate Node API scaffold in api/ has not been deployed. Tier assignment can instead use the secured Neon Data API RPCs directly.

Remaining work:
1. End-to-end test account creation, Google sign-in, OTP, logout and session persistence.
2. Move actual property operations from browser storage into authenticated org-scoped database services.
3. Enforce tier entitlements on the server and create properly licensed payment and billing workflows.
4. Finalise legal terms, privacy policy, policy acceptance records, production Google OAuth and email sending.
5. Complete role isolation, security testing, backups and AWS/Genese PoC gates.

Never use the current prototype for live customer funds or confidential tenant records.
