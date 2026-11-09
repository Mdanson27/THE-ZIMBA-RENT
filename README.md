# ZIMBA RENT — Unified Property Platform (development)

Website: https://mdanson27.github.io/THE-ZIMBA-RENT/
Repository: https://github.com/Mdanson27/THE-ZIMBA-RENT

## November 9, 2026 development upgrade

ZIMBA now has a redesigned, independent management experience rather than the public site's navigation wrapped around a dashboard. Verified Neon Auth sessions are required before any workspace route is rendered.

### Premium experience
- Responsive public real estate marketplace.
- Cinematic high-resolution SVG loader: night house, sequential window lights, entrance light and glowing ZIMBA RENT reveal, plus a JavaScript exit fallback and reduced-motion support.
- Separate signed-in workspace shell with personalized greeting, account identity and online/offline network indicator.
- Four-step, role-specific first-login onboarding:
  - Landlord
  - Property manager
  - Tenant
  - Looking to rent
  - Looking to buy
- Distinct navigation and dashboard features for each role.
- Premium tier skins while preserving consistent layout: Free, Starter, Growth, Business, Enterprise.

### Database and auth
- Neon project odd-snow-83079818 / database zimba_rent_dev.
- Neon Managed Better Auth with Google shared OAuth and email/password verification.
- Neon Data API with broad default grants disabled and database-verified JWT identities.
- Database onboarding records keyed to Neon Auth user IDs, not locally trusted profiles.
- Automatic private organisation creation for landlords/managers.
- Automatic Free plan provisioning (UGX 0, one managed property).
- Optional first property created as a private draft during onboarding.
- Secure create/list property RPCs with organisation-membership verification, plan quota enforcement and row locking.
- Verified tenant reference IDs, single-use seven-day invitations, landlord-side issuance and tenant-side explicit acceptance.
- Restricted admin tier-assignment interface using audited Neon functions. Designated email: automindsafrica@gmail.com; actual admin claim requires verified Google identity.

### Code locations
- index.html — entry point, animated house loader.
- assets/arrival-v4.css — sequential window and wordmark lighting.
- assets/workspace-v3.css — responsive premium workspace styling.
- assets/workspace-v3.js — onboarding, role-specific dashboards, property creation and invitations.
- assets/auth.js — Neon Auth and guarded Data API calls.
- assets/app.js — marketplace and protected-route delegation.
- db/0004_role_onboarding_free_plan.sql — Free plan, onboarding and invitation tables.
- db/0005_secure_onboarding_property_rpcs.sql — verified onboarding, organization creation and quota-checked property creation.
- db/0006_secure_resident_invitations.sql — invite/accept/read resident connection functions.
- .github/workflows/validate-ui.yml — browser-script syntax and static contract checks.
- .github/workflows/deploy.yml — GitHub Pages deployment.

### Tiers (landlords / property managers only)

Suggested launch pricing based on published Uganda competitor benchmarks (Unbound, RENTLAR, PropertyFlow UG). Paid fees are not yet approved or collectible.
| Tier | Property cap | Pricing |
| --- | ---: | --- |
| Free | 1 | UGX 0 |
| Starter | 5 | Proposed UGX 49,000/month |
| Growth | 50 | Proposed UGX 149,000/month |
| Business | 250 | Proposed UGX 349,000/month |
| Enterprise | Custom | Not approved |

Tenants and buyers/rent seekers do not need paid management subscriptions. Free and paid plan authorizations are read from Neon and actual property caps are enforced server-side. The first-property onboarding flow provisions Free automatically, and all later upgrades require administrator authorization.

### Tenant reference and invitations
A tenant's displayed Zimba reference is for lookup only. It is NOT a login credential or a tenancy link. A verified landlord creates a short-lived cryptographically random invitation, whose SHA-256 hash is stored in Neon. Only the intended signed-in and email-verified tenant can accept the invitation, once, before expiry. Invite-related data tables remain closed to direct browser writes.

### Security and remaining production gates

Important: This is an active **development deployment**, not a completed production release.

- Authenticated database RPCs are configured and unauthenticated SQL calls were verified as denied; browser sign-in, onboarding and invitation workflows have **not yet been tested end to end using real separate accounts**.
- Property publishing, real rent, financial reconciliation, card access, lease agreements and maintenance handling still require approved backend workflows.
- User-facing legal terms and privacy policy are drafts; final legal review and versioned consent capture are pending.
- Neon shared Google OAuth and shared email sending must be replaced with approved production configuration.
- The current public marketplace includes illustrative listing data; it is not live inventory.
- Never use demo interfaces for live money, sensitive tenant information or door access decisions.
- The old API folder remains a separate undeployed Node scaffold; new account/property/invitation RPCs operate through the JWT-authenticated Neon Data API.
- Per-user roles, property quotas and landlord/tenant linking are enforced by Postgres functions, rather than browser-local settings. Further security review, access logging and multi-user tests are mandatory before launch.

## Next engineering tasks
1. Run full end-to-end browser flows with test accounts: landlord, tenant, renter, buyer, Google and email signup, session renewal, and logout.
2. Test two concurrent property creations on Free to confirm no quota bypass.
3. Test both authorized and rejected tenant invitations, replay, expiry and revocation.
4. Migrate genuine verified property records and professional photos.
5. Implement genuine leases, invoices, maintenance and approved payment flows.
6. Finalize legal policies, plan pricing, email delivery, backups and AWS/Genese Solution PoC acceptance.

## Super Administrator control centre (November 9, 2026)

- Super Admin route: `#/console/overview`
- Verified designated identity: `automindsafrica@gmail.com`, linked to Google OAuth.
- Platform administrator record provisioned for that verified account in Neon.
- Dashboard has a separate executive navigation and design from landlord workspaces.
- Sections: Command centre, User accounts, Organisations, Property inventory, Subscriptions, Audit activity, Platform health.
- Live aggregate metrics are returned by secured PostgreSQL functions; no fabricated revenue figures.
- Tier assignments are gated server-side through the existing audited administrator RPC.
- Public "My Zimba space" and account navigation route the designated admin to the control centre.
- SQL migration: `db/0007_superadmin_pricing.sql`. UI: `assets/super-admin.js` and `assets/super-admin.css`.
- Neon Data API schema-cache refresh requested using `NOTIFY pgrst, 'reload schema'` to address possible stale RPC 404 responses.

**Verification status:** source syntax and database privilege checks passed. Browser login-to-console, authenticated RPC calls, multi-device flows, and Pages completion still require independent end-to-end testing with the verified account; an HTTP 404 was reported in the prior deployment and should only be considered resolved after retesting.

**Production policy:** Do not remove disclosures about unverified listings, unapproved policies, absent payments, or unavailable workflows. Prototype banners may be replaced by accurate operating-status language, but no live service capability should be misrepresented.

## November 9: JWT 404 repair and welcome animation

User browser evidence showed `/auth/get-jwt-token` returning HTTP 404 during both private workspace and Super Admin API calls. The browser SDK was using `getJWTToken()`, which requested a route unavailable on the configured Managed Better Auth instance. The browser auth client now prefers the signed session `access_token` when available, then requests `GET /auth/token` with session cookies and no-store caching. JWTs remain browser-memory values and are sent to the Neon Data API only as Authorization Bearer tokens; opaque session tokens must not be substituted for JWTs.

Additional improvements:
- Clearer recovery screens for Auth connection failures versus actual permission denial.
- Removed the arrow in the non-clickable Welcome to ZIMBA banner.
- Added subtle moving green-light background animation, respecting reduced-motion preferences.
- Versioned static assets to discourage stale GitHub Pages browser caches.
- Verified JavaScript syntax, browser token-request mocks, permission gate tests and exact source integration.
- Actual end-to-end OAuth browser verification remains pending while the Desktop Commander device is offline; do not claim the HTTP 404 is resolved on a real signed-in browser until tested.

## November 9 — Subscriber controls, policies, operations

**Super Admin subscriptions:** Verified users who have not yet completed onboarding can receive a plan in `pending` status. Pending is not an active entitlement; after verified landlord/manager onboarding it activates. Tenant, renter, buyer and the platform admin identity are excluded. The administrator selects a tier, adds a 5–300 character reason, presses **Confirm tier**, and confirms the decision. Changes are logged, including previous and new plan.

**Policies:** Published policy versions 1.0 (Terms of Use and Privacy Policy) are shown via a full-screen two-tab modal with explicit separate checkboxes. Authenticated acceptance is written to `policy_acceptances`. The onboarding RPC requires current versions of both documents to have been accepted. Public pages display the full current policy text. The text is an operational starting policy requiring legal review, correct verified operator identity/physical address, retention schedule and any registration disclosures before commercial launch.

**Manager modules now backed by real Neon data:**
- Overview: organisation, property and connected-resident counts; urgent/open maintenance; rent receivables and recorded expenses; recent issues.
- Maintenance: create property-scoped requests (low/medium/high/urgent), view all records, update open/in-progress/completed/cancelled status.
- Financials: view rent-charge ledger and receivables; create/read categorised expense records. No customer payments or bank reconciliation are active.
- Settings: organisation name, preferred area and notification preferences, protected by membership and role.

SQL sources: `db/0009_policies_and_pending_tiers.sql` and `db/0010_operational_workspaces.sql`. Frontend: `assets/legal.js`, `assets/legal.css`, `assets/operations.js`, `assets/operations.css`.

**Security:** Anonymous calls are denied, and authenticated browser users do not receive direct write grants to maintenance or expense tables. Database functions resolve their own organisation from `auth.uid()` and a validated manager membership.

**Testing caveat:** SQL function creation, privilege checks and JavaScript syntax have passed. Browser OAuth, full subscription assignment, policy acceptance, expense creation, maintenance updates and Pages deployment must be tested in a signed-in browser before calling the release production-ready.
