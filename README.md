# ZIMBA RENT â€” Production Foundation

Zimba Rent is a developing real-estate marketplace and property operations system for Uganda. The public experience is deployed on GitHub Pages, while backend and data services are being implemented separately.

## Current status (7 November 2026)

- Public website prototype: deployed on GitHub Pages
- Branded stick-figure house-entry loading sequence: implemented
- Neon project: Zimba Rent â€” Development
- Neon project ID: odd-snow-83079818
- Neon database: zimba_rent_dev
- Database schema: 18 initial PostgreSQL tables and indexes (confirmed through Neon)
- Tenant isolation: Row-Level Security enabled on organisation-owned tables, but production authentication policies are **not implemented yet**
- Public listings: protected database view and dedicated read-only role
- API: Node.js PostgreSQL-backed, *read-only* API scaffold, **not deployed**
- Payment, card scanning, login, lease administration: **not production-ready**

## Current architecture

GitHub Pages serves the public website and a browser-local demonstration management workspace.

Future secure runtime:

Browser â†’ HTTPS API â†’ restricted PostgreSQL role â†’ Neon PostgreSQL

The browser never receives PostgreSQL connection credentials. The API runs as a separate service and is designed to expose only published properties.

## Frontend

Open index.html locally or visit:
https://mdanson27.github.io/THE-ZIMBA-RENT/

The stickman-with-briefcase loader animates toward a house before revealing the ZIMBA RENT brand and opening the site. It honors reduced-motion accessibility preferences.

## Backend

The API lives in the api/ directory. Run:

cd api
npm install
npm start

Required server environment variable: DATABASE_URL (connection URL for the restricted **zimba_public_reader** role).

Optional variables:
- PORT (default 3000)
- CORS_ORIGINS (comma-separated origins; defaults to https://mdanson27.github.io)

Endpoints:
- GET /health â€” runtime status
- GET /ready â€” Postgres connectivity status
- GET /api/v1/properties â€” published property listings
- GET /api/v1/properties/:uuid â€” single published property

The public API is read-only; do not use a database owner/admin connection string in its environment. API health will succeed even without a database; readiness requires DATABASE_URL and actual connectivity.

## Security boundaries

- Never put DATABASE_URL or payment/card credentials in frontend code, GitHub files, or screenshots.
- RLS-enabled organisation tables default to denying access for non-privileged callers until tested role policies are created.
- No tenant/admin API is exposed yet; implementing proper authentication and scoped authorization is a future task.
- Card access and payment ledger structures are preparatory only, not a functioning access control or wallet system.
- No verified property inventory was imported. Demo listings are fictional and remain labelled as such.
- Do not use real resident/customer data in the browser-local demonstration.

## Next milestones

1. Deploy the API through an approved application-hosting connection and set the restricted DATABASE_URL as a server-only secret.
2. Verify API database connectivity and independently audit read-only permissions.
3. Implement proven identity/provider integration, role authorization and service-scoped tenant isolation.
4. Build administration, organisations, units, leases, residents, invoice and receipting workflows.
5. Establish migration from the existing Supabase dataset after auditing source ownership and schema.
6. Establish AWS/Genese Solution PoC architecture and acceptance tests, including monitoring and restore testing.
7. Demonstrate NFC card access only with test hardware/accounts, and payment workflows only with sandbox rails and authorized providers.

## AWS PoC

The expanded September 2026 AWS PoC questionnaire calls for a scalable AWS platform with secure resident identity, smart cards and property access, sandbox rent collection, monitoring, backups and audit trails. Neon is being used here for the development database as requested; the final AWS-managed database and migration strategy remain to be agreed with Genese Solution.

