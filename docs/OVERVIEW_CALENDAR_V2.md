# ZIMBA RENT — Overview V2 & Live Portfolio Calendar

Updated 14 November 2026.

## Objective

Make the authenticated manager Overview a genuinely actionable daily workspace instead of a few unconnected dashboard cards. Correct the text overflow and apparent oversized type in the full navigation sidebar, preserve the compact rail, and add a calendar that connects **verified portfolio records** to their real dates.

## What the Overview now shows

- Welcome header and organisation-level summary, using data from `zimba_manager_overview`.
- Four portfolio indicators: properties, open maintenance, connected residents and **rent receivables computed from actual non-void rent invoices, less verified payments**. This replaces the misleading legacy charges figure when the upgraded invoicing system has financial records.
- Action centre: urgent repairs, actual overdue invoice count and amount, pending tenant deposit refunds and recorded expenses.
- A full-width calendar section with the following:
  - Previous/next month buttons and **Today**.
  - Monday-first month grid with markers for all saved events and distinctive categories.
  - Click any day to read the dated agenda, property, record status, amount if relevant and a direct link to its source.
  - Upcoming activities list for the displayed calendar weeks, with clickable source records.
  - Filters: all, rent and invoices, maintenance, tenancies, land leases, deposits and expenses.
  - Summary cards for overdue invoices, invoices due within seven days, open repairs and pending deposit refunds.
- Recent maintenance and quick links to key management sections.

The UI remains responsive, works in light/dark mode, respects reduced-motion preferences and keeps selected days/filters separate from business records.

## Sources of dates — no guesses

The SQL function `zimba_manager_overview_calendar(p_start date,p_end date)` is scoped to the authenticated user's actual manager organisation via `zimba_my_manager_org()` and exposes up to 63 days of records in each calendar fetch. It aggregates:

| Kind | Date(s) | Real source |
|---|---|---|
| Rent | **Actual invoice due date** | `zimba_rent_invoices` joined to `zimba_lease_records`; remaining amount after `zimba_payment_evidence` |
| Maintenance | Request-created date, and separately a saved expected-completion date if recorded | `maintenance_requests` |
| Tenancy | Saved start and end date, for non-draft agreements | `zimba_lease_records` |
| Land | End date of an issued land lease | `zimba_land_lease_drafts` and `zimba_land_lease_parties` |
| Deposit | Submitted refund request date | `zimba_deposit_refund_requests` |
| Expense | Recorded expense date | `property_expenses` |

The function also returns portfolio-wide outstanding invoice amount, overdue invoice amount/count, invoices coming due in seven days, open and urgent maintenance counts and pending deposit refund requests. These are not restricted to one visible month.

Overdue comparisons use **Africa/Kampala** local dates. Events and financial values are scoped to the caller's organisation, HTML-escaped, and linked only to a fixed allowlist of workspace routes. The function makes **no database writes**.

Important distinctions:
- A saved maintenance target is an estimate, not proof that the repair was completed then.
- Unissued future rent is not shown as an invoice or collectible receivable.
- A rent invoice marked paid without verified reconciled payment entries is not silently treated as settled in the Overview.
- Historical rent overdue remains in the portfolio-wide overdue metric even if its due date is outside the displayed month.
- An invoice/expense calendar record does not prove that money was actually received or disbursed.

## Navigation V7 corrections

Legacy `assets/workspace-v3.css` contained `.zv-sidebar nav a span {font-size:18px;width:20px;text-align:center}` for old icon glyphs. That rule also applied to text labels created by Navigation V5/V6. As a result, labels appeared centred, huge and truncated, even though parent links had compact font sizes.

The V7 override in `assets/navigation-system.css` now explicitly separates:

- **Expanded sidebar text label:** 10.9px (desktop), left-aligned, flexible width, natural wrapping and no ellipsis.
- **Icon:** remains a consistent 17–18px square independent of text.
- **Group heading:** compact uppercase text, left aligned, able to wrap if necessary.
- **Compact rail:** unchanged icon-only layout with accessible hover/focus descriptions and group flyouts.
- **Mobile:** slightly larger, touch-friendly labels and 44px minimum row height.

Navigation labels have accessible names/title tooltips and maintain the original role gating for managers, tenants, buyers and other accounts. No permission checks were loosened.

## Changes

- `db/0026_manager_overview_calendar.sql`: live manager-only calendar and true financial summary read RPC.
- `assets/overview-calendar.js`, `assets/overview-calendar.css`: calendar, filters, agenda, deadlines and priority cards.
- `assets/operations.js`: integrate calendar after initial manager overview render; update action centre and invoice KPI.
- `assets/navigation-system.css`: correct inherited font/width/centering issue with scoped expanded-mode rules.
- `assets/auth.js`: read-only API allowlist and `managerOverviewCalendar` method.
- `index.html`: load the CSS and JavaScript with versioned asset URLs.
- `tests/overview-calendar.test.cjs`, `.github/workflows/validate-ui.yml`: regression tests for dates, privacy constraints, navigation rendering and assets.

## Remaining acceptance testing

- With a real authorised manager session, open the Overview and confirm the newly deployed Data API resolves `zimba_manager_overview_calendar` without PGRST202.
- Compare the top rent receivable with actual non-void invoices less verified payments, including the existing billing month and next due date.
- Use next/previous month, Today, filter changes, day selection and source links.
- Create a maintenance request with a target date; confirm its two event milestones.
- Verify tenant accounts and managers of a different organisation cannot see calendar events.
- Test 320px and 1280px layouts, sidebar open/closed, keyboard focus, large text, light/dark mode and scrollbars.
- Test more than 350 events in one range: the API limits the returned event list to 350 while keeping portfolio-wide metrics accurate; consider pagination if portfolio scale requires more.

Automated syntax, static security and UI regression checks passing **does not** replace a signed-in browser session test.
