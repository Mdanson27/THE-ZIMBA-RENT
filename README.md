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

## Resident onboarding and Building Studio — November 9, 2026

**Resident onboarding is no longer based on a pasted invitation URL or a 48-character input.**

1. Tenant creates a verified Zimba account with a short, public reference `ZR-XXXXXXXXXXXX`.
2. Landlord/manager opens **Residents**, selects an authorized property and optionally an available room.
3. They paste the **tenant reference** (15 characters including `ZR-`) and submit.
4. Neon validates the reference and creates an in-app, account-bound invitation. The landlord's directory displays the tenant's name and a grey **Pending approval** state; the room remains unoccupied.
5. On **My home** and **Connect to a home**, the intended tenant can review the landlord, property and room, then **Approve & connect** or **Decline**.
6. On approval, the tenant is linked to the property in `resident_connections`, and the selected room is marked `occupied`. Approval is one-time, and expired invitations cannot be accepted. Declining removes pending status.
7. No private tenancy records are accessible to the invited tenant until approval. No physical entry, legal lease execution or payments are implied.

The pending inbox is currently refreshed when a tenant opens the corresponding page or presses Refresh. Real-time cross-device push notifications and email alerts are future enhancements.

**Building Studio** is available from the landlord sidebar and property portfolio:
- A responsive interactive floor-by-floor **2D occupancy grid** (not a measured architectural drawing).
- A compact **1D list** alternative.
- Add/edit room number, floor name, per-room monthly rent in UGX and availability.
- Availability states: `vacant`, `occupied`, `reserved`, `maintenance`. An outstanding invitation overlays the room as **grey pending approval**.
- Edit building name, address, description and asking price.
- Generate up to 100 sequentially numbered rooms for a floor in one operation, then edit them individually.
- Counts of available, occupied and pending rooms come directly from Neon.
- An existing verified resident prevents casually changing their assigned room back to vacant.

Backend migration: `db/0011_room_inventory_resident_approvals.sql`. Frontend: `assets/building.js`, `assets/building.css` and the upgraded `assets/workspace-v3.js`.

Security: All new functions are granted only to `authenticated`; manager operations verify the user's managed organisation using `auth.uid()`, and tenant approvals check the intended account, expiry and room availability under row locks. Direct browser INSERT grants on units and resident invitations remain disabled.

**Release qualification:** Database functions are installed, anonymous access checks and static JS syntax checks passed. The complete two-account flow, frontend UI, and GitHub Pages deployment still need signed-in browser end-to-end tests before commercial release.

Additional November 9 improvements:
- Manager views an approved resident directory with verified email and assigned room; pending candidates appear separately without approved contact access.
- The 2D Building Studio supports **Generate floor** to create up to 100 sequential room numbers with a starting monthly rent in one database transaction, up to 500 units per property.
- Refreshed frontend cache version `20261109-build3`.

## November 9: session stability and API schema repair

Browser evidence: the same verified user could sign into Zimba but navigation repeatedly showed HTTP 403 for `my_onboarding` / `my_properties` and HTTP 404 for newer `zimba_property_details` / `zimba_manager_units` / `zimba_save_unit`.

Neon `neon_auth.session` inspection confirmed existing active sessions were created with **7-day expiration intervals**. They had been repeatedly revoked by our own `recover()` -> `relogin()` -> `client.signOut()` client-side implementation, even for database-only errors.

Fixes:
- Explicit logout is now the only code path that calls `client.signOut()`.
- Auth refresh preserves the last verified identity when the Auth service temporarily fails, without claiming the server has verified a new token.
- Data API 401/403/404 no longer clear the user session; they display service-specific messages. A verified Auth session remains independent of database RPC availability.
- The manager overview now greets the actual signed-in user's given name.
- Building errors leave the user in the workspace instead of ejecting them to sign-in.
- Added Zimba SVG favicon and cache-versioned site assets.
- Neon Data API configuration update performed (also refreshes the schema cache), retaining `public` schema, `authenticated` JWT role claim, and GitHub Pages CORS origin.
- Default Better Auth session duration is seven days, verified against database records; this is not a promise to suppress explicit sign-outs, user revocation, or legitimate expiry.

**Not yet confirmed:** signed-in browser requests on GitHub Pages after schema refresh, and whether the 403 operations succeed with the actual browser JWT. Do not represent all API permissions as repaired until a real account tests again. If the 403 persists, inspect actual `code` and `message` in the API response body and compare the verified JWT's role claim and database `auth.uid()`. Never disable RLS, issue a privileged browser secret, or grant anonymous access to solve this.

## Resident account v2: verified home, month-end rent and communication (9 Nov 2026)

- **Resident home:** After a tenant accepts an invitation, `zimba_tenant_home()` returns the actual property, location, assigned room, management organisation, configured room rent and start date. The app displays them on the tenant dashboard and in their rent schedule. Older connections with no start date correctly display "Not set" rather than an invented date.
- **Rent start and due dates:** The landlord/manager chooses a required `rent_start_date` while sending the invite. On approval this date is copied into the active connection. The next scheduled payment date is the end of the calendar month containing the later of today or the rent start date. Actual rent invoices, pro-rating, arrears, grace periods and automatic rent collection are **not yet implemented**.
- **Resident messages:** A one-to-one conversation is tied to each approved property connection. Tenant and authorised members of that property's management organisation can read and send messages from their respective dashboards. Messages are stored in Neon and rate limited. They are not SMS, email or push notifications.
- **Maintenance:** A tenant with an approved connection can file a priority-labelled maintenance issue. Tenant history is filtered to their own `requested_by_auth_id`, preventing viewing a former resident's issues. The landlord's maintenance programme can see all organisation issues.
- **Wallet:** Each verified tenant can generate a wallet **reference**, which is only an internal identifier. The actual balance is derived exclusively from `zimba_wallet_entries` with verification provenance. The example UGX 250,000 deposit is clearly labelled **sample/not deposited**, and does not write to the balance. Deposits, withdrawals and rent debits are disabled until a licensed provider, secure webhooks, reconciliation, refunds and audit logging are implemented.
- **Frontend:** `assets/tenant-portal.js`, `assets/tenant-portal.css`. Authenticated operations use `assets/auth.js` and route through `assets/workspace-v3.js`.
- **Backend:** Reproducible migration `db/0012_resident_rent_messaging_wallet.sql`.

**Security verification:** Anonymous RPC access denied, direct authenticated browser INSERT on wallet transactions/messages denied, and new SQL functions reject execution without a valid tenant/manager identity. The browser flow and GitHub Pages deployment remain unverified because Desktop Commander DANSON is offline. Do not claim real payments are active.

## Maintenance progress and notifications — 9 November 2026

Tenant maintenance now displays a percentage complete, status, expected completion date, latest management note, and an expandable chronological progress history. Existing tickets start at 0% until their first manager update; no progress is fabricated.

Authorised organisation managers can post `open`, `in_progress`, `completed` or `cancelled` statuses, a matching progress percentage, an optional ETA, and a required explanation in the Management → Maintenance area. Updates are inserted into `zimba_maintenance_updates` with the authenticated actor and timestamp, and a tenant-specific notification is created when the request has an author.

Each authenticated user has a dedicated notification feed with unread badge and top-right bell, plus a Notifications page. Events include new tenant messages, replies from managers, new tenant repair submissions, posted repair updates, newly issued property invitations, and tenant invitation approvals/declines. The badge refreshes when a page is rendered and every 45 seconds while the browser is visible; this is polling, not real-time push or email delivery. Viewing a notification marks it read and navigates to its feature area.

Backend migration: `db/0013_repair_tracking_notifications.sql`. Frontend: `assets/notifications.js`, `assets/notifications.css`, and enhancements to `assets/tenant-portal.js`, `assets/operations.js`, `assets/workspace-v3.js`.

Security: notifications are scoped to `auth.uid()`; manager repair changes use `zimba_my_manager_org()`; tenant progress shows only maintenance submitted by that tenant for an active home. An unauthenticated user cannot call these functions, and authenticated browser roles cannot directly insert or modify the notification ledger or progress history.

Release gate: source syntax and privilege checks passed, but an authenticated tenant-manager browser journey and deployed GitHub Pages assets remain unverified.

## Security hardening phase — 9 November 2026

**Implemented and deployed to Neon development:**
- Separate privileged PostgreSQL RPC permissions for verified super administrators and scoped landlord/manager accounts; anonymous users cannot invoke audit or rent-edit endpoints.
- Read-only super-admin audit feed at **ZIMBA Control → Audit activity** and organisation-only landlord audit feed at **Workspace → Security & activity**.
- Append-only database audit ledger with safe metadata for property, unit, maintenance, resident connection and invitation changes; separate message and wallet-entry metadata auditing (no message body).
- Security-definer audit and throttle helpers have no direct browser EXECUTE grants. Authenticated clients have no direct SELECT, INSERT, UPDATE or DELETE privileges on the audit ledger or rate-limit counters.
- Database-enforced per-account write limits: **20 invitations per day, 12 messages per minute, 10 maintenance requests per hour, 500 room creations per day, 120 maintenance progress updates per day, and 20 rent-date corrections per day**. Limits are enforced server-side via row triggers or protected RPC, not UI alone. These are *per authenticated account*, not per IP.
- Landlord or manager can edit approved tenant rent start date with required 8–500-character reason. Neon verifies the actor's own organisation and active resident connection, records both old and new dates in audit, and sends the tenant an in-app notice.
- Controlled background refresh at most once every 90 seconds for relevant visible workspace sections; it pauses offline, while hidden, or while the user is editing a form or modal. Notification polling remains separate.
- RLS and browser-grant checks for audit/security tables are validated. New audit events will be captured after deployment; historical activity is not backfilled.

**Still required before production security sign-off:** independent authenticated two-role UI tests, end-to-end API and browser console checks, CI/Pages deployment confirmation, managed-auth login throttling and MFA enforcement, WAF/IP abuse rules at the edge, automated backup/restore test, audit retention and partitioning policy, log monitoring/alerting, secret rotation, independent penetration testing and load testing. GitHub Pages alone cannot host an API gateway, so IP-level throttling must be implemented in a trusted edge/backend service. No zero-console-error guarantee is made without running the live browser.
