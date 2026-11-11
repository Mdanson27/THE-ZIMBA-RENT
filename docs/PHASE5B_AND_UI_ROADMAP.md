# ZIMBA RENT — Phase 5B release and section-by-section improvement plan

Updated 11 November 2026. This is an engineering plan and status record, not a declaration that every external integration is live.

## Release implemented in source (Phase 5B)

### Navigation system V4
- **Overview** is an independent entry, not under Property Management.
- **Property Management:** Properties, Property Workspace, Building Studio, Residents.
- **Communication & Care:** Messages and Maintenance.
- **Rent & Finances:** Financials, Rental Agreements, Land & Long-Term Leases, Rent Invoices, Deposits.
- **Intelligence & Insights:** ZIMBA Intelligence, including the Phase 5A dashboard and new Phase 5B AI Studio.
- **Enterprise Operations:** Enterprise Centre.
- **Account & Security:** Notifications, Plans & Billing, Security & Activity, Settings (and platform admin for eligible users).
- Tenants/search users receive appropriately reduced sections; they are not shown manager-only features.
- Sidebar expands or collapses to a narrow icon rail, with animated width and persisted per-user preference; mobile uses a drawer/backdrop.
- Each group can be opened independently. The active route's category opens by default, and group state persists.
- Thin scrollbars apply to sidebar navigation, main browser scroll, tables and modal content. On desktop, branding, account identity and footer remain in position while links scroll internally.
- Navigation uses buttons with aria-expanded/aria-controls, visible focus, descriptive icon titles, Escape for mobile drawer and reduced-motion CSS.

### Sidebar UX V5 — implementation update, 11 November 2026
- Replaced every symbolic manager/tenant navigation glyph with a consistent, locally defined set of stroke-based SVG icons (dashboard, property, floor/studio, residents, messages, repairs, money, agreements, land, invoices, deposits, intelligence, enterprise, notifications, plans, security and settings).
- Overview remains standalone; all other sections are grouped according to the task flow. The default expanded group is the currently active section; multiple groups may stay expanded by user choice.
- Expanded sidebar features compact section headings, clear chevrons, proper text truncation, subtle dividers, a green active indicator, and concise explanatory native hover titles.
- The compact sidebar is a **real navigation rail**, not a compressed list: each category has a meaningful SVG, highlights the active group, and opens an accessible floating menu of its actual destinations on hover, focus or click. Flyouts render outside the scroll container so they cannot be clipped. Overview and footer icons show separate name + purpose tooltips.
- Keyboard users can Tab to category triggers and destination links. Clicking a trigger focuses its first destination, Escape closes the flyout, focus outlines are visible, and reduced-motion preferences are respected.
- Main navigation alone scrolls, with slim hover-visible scrollbars; branding and account identity remain fixed above the list and subscription/marketplace/sign-out remain fixed below it. Desktop uses a full-height 278px panel or a 76px compact rail.
- The desktop topbar toggle is intentionally hidden to avoid the duplicate icon shown in the supplied screenshots. The sidebar header toggle remains; mobile instead uses the topbar button and backdrop drawer.
- Mobile uses a fully labelled sliding drawer, closes on outside click or Escape, and never shows a cramped compact rail. Existing role-scoped links and server permissions are unchanged.
- Navigation preference is stored **per signed-in user** and contains only group and collapsed state, not financial or account data.
- The existing static regression suite now covers SVG icon names, escaped labels, section descriptions, hover/flyout containers, active group, dark theme, and accessibility hooks. Live signed-in browser acceptance testing remains necessary.

### Intelligence and Phase 5B
- Phase 5A rule-based, read-only, organisation-scoped snapshot remains the source of truth.
- New **AI Studio** tab separates model-backed Q&A, document metadata review and human-edited reminder drafts.
- Operational AI answers: server endpoint `POST /api/v1/intelligence/ask` verifies signed JWT via Neon JWKS, uses that token to call the existing scoped `zimba_intelligence_snapshot` RPC, minimises model context, requires explicit consent, and sends only through a server-side provider key.
- Document extraction: `POST /api/v1/intelligence/extract` accepts only user-consented PDF/PNG/JPEG up to 3 MB, validates file magic, requests structured metadata with a vision-capable model, and returns a **draft only**. No file bytes are stored.
- Local document review: user may paste selected document text; a deliberately low-confidence deterministic parser suggests title/category/reference/expiry. It is never a legal determination or proof of authenticity.
- A user must review and explicitly confirm metadata before `zimba_enterprise_document_register` is called. The registered entry contains text metadata, **not** the file.
- Reminder drafts use live overdue invoice references from the authorised snapshot. The user reviews/copies a suggested message and opens the billing centre to check actual payment history. ZIMBA does not send reminders automatically or claim to have collected funds.
- Server model requests use `store:false`; no provider key is in GitHub Pages; no prompt or document content is saved in localStorage. In-process request throttling is basic, not yet a substitute for distributed production rate limits.
- Static JS syntax, page assets, grouped navigation, safe text escaping, rule consistency and explicit consent are checked through CI.

## Exact deployment boundary

The GitHub Pages frontend and Neon RPCs can be live independently, but a usable third-party **model** requires an HTTPS API deployment with `OPENAI_API_KEY`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL`, and `ZIMBA_NEON_DATA_API_URL` configured privately. The public URL must then be set in `assets/ai-runtime-config.js`. Until that happens, the AI Studio clearly disables model-backed questions and PDF/image extraction. The local metadata parser and reminder drafts are operational in the frontend and need no provider secret.

When hosting the API, set `CORS_ORIGINS` to the actual GitHub Pages origin, configure a secure reverse proxy/TLS, enforce HTTPS, add shared rate limiting and abuse monitoring, and verify the Neon signing key path/issuer with the exact provider-issued JWT. Do not add any API secrets to the static repository. Test with owner, manager, tenant, and a separate organisation account before enabling production document processing.

## Next section-by-section work, with acceptance criteria

### 1. Overview and workspace shell
- Replace generic or outdated placeholder KPIs and copy with true manager-specific counts from scoped Neon responses.
- Provide an at-a-glance task queue, selected property filters, realtime refresh without flicker, and clickable actions to the corresponding module.
- Test compact sidebar, grouped navigation, main width, topbar theme/notification controls, keyboard focus, and mobile drawer at 320–1440 px.

### 2. Property Management
- Property list: polished search/filter/sort, occupancy and status labels, archived-property handling, no duplicates.
- Property Workspace: unify all floor/unit/resident/maintenance/agreement/payment links, preserving property ID in navigation.
- Building Studio: professional floor layout, reliable editing, accessibility, statuses and vacancy totals.
- Residents: reference invitations, landlord approvals, explicit rent start, assignment to a unit, clear expiry/activation/revocation flows.
- Strictly enforce server-side property and organisation access for every operation.

### 3. Communication & Care
- Messages: separate threads by verified resident connection, clear unread state, accessible composition, no duplicate sends after connection loss.
- Maintenance: triage by severity/age, assignment and ETA, photo/document linkage only with secure storage, resident-visible progress and notifications.
- Audit all important state transitions; no fake "sent" confirmations.

### 4. Rent & Finances
- Rental agreements: refine the step-by-step form shown in user screenshots, conditional fields, better field-level errors, legal review, responsive use on phones.
- Land leases: distinguish multi-year parcel lease terms from monthly rental agreements.
- Invoices: reconcile partial/verified payments, overdue states, and prevent invoice duplicate issuance.
- Deposits: separately hold refundable balances and review refund requests. Never count security deposits as income.
- Financial reports: accurate date-scoped statements, expense classification, landlord/owner distributions after approval, CSV sanitisation, and compliance testing.

### 5. Intelligence (Phase 5C / deployment)
- Deploy and test the private Phase 5B AI service with explicit user consent and appropriate retention/disclosure.
- Verify structured PDF and scanned-image extraction using redacted non-production documents.
- Add recurring review reminders, not unilateral financial actions.
- Collect sufficiently long, verified history before *any* statistical forecast. Require holdout validation, confidence intervals, leakage checks, error bounds and clear "insufficient data" handling.
- Introduce feedback/rejection of AI draft recommendations; no automated lease approval, credit or financial decision.

### 6. Enterprise Operations
- Secure staff invitations, property-specific roles, revocation and a separate owner portal; owners must not automatically see unrelated tenant data.
- Real private file storage, signed download URLs, virus scanning, document versioning and access audit; registered metadata alone does not equal uploaded storage.
- Role-aware oversight, reports and independent property owner access.

### 7. Account, Security and Accessibility
- Stable login and refresh without unnecessary sign-outs; audit any authorization failure without exposing secrets.
- User account centre: identity, sessions/devices, preferences, notifications, data exports, and account security.
- Dark and light mode contrast audit to WCAG 2.2 AA, keyboard/screen-reader tests, focus order and accessible error text.
- Preferences, toggle and section state should remain stable across legitimate refreshes without persisting confidential records.

### 8. Production acceptance
- A complete regression suite with negative cross-tenant and cross-organisation tests.
- Test every available role, theme, mobile width, document consent route, rate limit, API fallback, and offline/recovery state.
- Confirm GitHub Actions validation, hosting delivery, zero high-severity console errors and a documented rollback route.
- Verify tenant messaging, money processing and banking/payment integrations separately before enabling payments.

**Product rule:** progress section by section. No pretend balances, phantom AI responses, unverified receipts, insecure uploads, automatic owner access, or silent sends. A feature that depends on an external service must visibly say it is not configured until live verification succeeds.
