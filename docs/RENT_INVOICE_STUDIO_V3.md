# ZIMBA RENT — Rent Invoice Studio V3

Released 14 November 2026.

## Purpose

Replace the basic "Generate month-end rent invoice" and simple list with an organised, professional invoice workspace that prints a dedicated landlord-to-tenant document and allows a manager to choose **ZIMBA in-app**, **Email draft** or **WhatsApp chat draft** for sharing.

The invoice is issued by the **landlord / property-management organisation**, using ZIMBA RENT as the software platform. It is not an invoice issued by ZIMBA itself as a supplier, nor a URA EFRIS fiscal document.

## Issue and billing

1. Manager opens Rent & Finances → Rent Invoices.
2. Selects a rental agreement in `acknowledged` status and a billing month.
3. The pre-existing `zimba_manager_issue_invoice` RPC computes actual billable days, rent, due date and reference from saved lease records. It rejects duplicate invoices for the same lease and period.
4. **Issue invoice** stores the invoice in Neon and automatically creates a tenant in-app notification through the existing issued-invoice RPC.
5. The new invoice register lists the resulting reference and includes tenant, property, unit, billing period, due date, gross amount, verified receipts, remaining balance and status (unpaid, overdue, partial, verified-paid, void).
6. Filters and search help managers locate an invoice; the tenant has a role-scoped view of invoices for their account.

Security deposits are kept out of the rent charge. Payments are displayed as verified only when they exist in `zimba_payment_evidence`, not because a user manually claimed they paid.

## Print / Save as PDF

**View / Print invoice** opens a dedicated A4 document in a separate browser window with:
- zimba. product branding, **RENT INVOICE** title, actual invoice reference and billing status;
- "Issued by" set to the landlord / property management organisation;
- "Billed to" set to the verified account's connected tenant;
- actual property and unit, postal/geographic address when recorded, invoice/issue date, billing month, coverage dates and due date;
- itemised monthly rent (including existing prorated billing calculations), subtotal, verified payments and balance due;
- recorded verified receipt references, if any;
- a safe payment-instructions notice to use a previously agreed payment method and quote the invoice reference.

The user chooses **Print** or **Save as PDF** in their browser's print dialog. No claim is made that ZIMBA has automatically stored a separate invoice PDF file; the invoice data and reference are durably stored in Neon.

## Delivery channels and exact meaning

### ZIMBA in-app — actually sent
- Manager selects an existing invoice, **Share invoice**, chooses **ZIMBA in-app notification**, chooses invoice or reminder, edits the message and sends.
- `zimba_manager_deliver_invoice_in_app` validates that the manager controls the invoice organisation, the invoice is not void, and payment reminders are not sent for fully verified-paid invoices.
- A new notification is stored for the connected tenant at `#/workspace/invoices`, and the action is recorded in `zimba_invoice_delivery_log` and the platform security audit.
- Duplicate in-app sends of the same invoice/intent are blocked within 24 hours.
- Issuing an invoice has already created the initial in-app notice, so this separate action is for a subsequent invoice copy or reminder.

### Email — manual user send
- Manager chooses **Email — open message draft**. ZIMBA uses the connected tenant's email and a user-editable message with the accurate property, invoice reference, date, amount and outstanding balance.
- The browser opens the system email composer using `mailto:`. The manager must review and press **Send**.
- **No outbound email API or SMTP service is configured in this static-hosted frontend**, and **no PDF is attached automatically**. The manager can first print/save the invoice as PDF and attach it manually. The UI must never claim "sent" for this composer action.
- Automated email delivery in the future requires a private authenticated server, transactional-mail provider, verified sender/domain and a delivery webhook/logging policy.

### WhatsApp — manual user send
- Manager chooses **WhatsApp — open chat draft**. The manager reviews or enters the tenant's international phone number (e.g., +256…).
- ZIMBA opens `https://wa.me/<international-number>?text=...` with a prefilled editable invoice message.
- The manager must confirm the recipient and press **Send** in WhatsApp. No automated WhatsApp Cloud API is configured, no PDF is attached automatically, and no delivery receipts are claimed.
- Automated WhatsApp Business messaging would require Meta's approved business phone account, template approvals where applicable, recipient consent, a private server and delivery status webhook.

**External-channel compose actions do not change invoice payment status or create a fake delivery record.** The in-app channel is the only one the app currently reports as sent.

## Data and security

- `db/0024_invoice_documents_delivery.sql`: adds dedicated, scoped JSON invoice reads and a private in-app delivery/audit log; leaves existing invoice generation untouched.
- `zimba_manager_invoice_documents` returns only the authenticated manager's organisation invoices and includes recorded tenant contact where available.
- `zimba_tenant_invoice_documents` returns only invoices linked to the signed-in tenant.
- Direct invoice-delivery table reads are revoked for anonymous and ordinary authenticated browser users; private RPC enforces organisation scoping.
- In-app delivery is a one-time DB write and **is not automatically retried** after ambiguous network failures.
- External composers are opened only after direct user interaction. The app does not persist or misreport external sends.
- New source assets `assets/invoice-studio.js`, `assets/invoice-studio.css`, and tests `tests/invoice-studio.test.cjs`. Existing `assets/lease-finance.js` routes the invoices section into the new UI.
- Original deposits and rental agreements are unchanged.

## Outstanding production acceptance

- With a real manager and tenant: issue an invoice, print it, verify A4 output, logout/login and print the identical saved bill.
- Confirm tenant cannot read other tenants' documents, manager cannot read a different organisation's invoices, and unauthenticated RPCs reject requests.
- Verify actual in-app notification receipt, 24h duplicate-message blocking, and that the tenant's invoice portal opens through the notification.
- Check mailto and WhatsApp composer behaviour on desktop/mobile and confirm external actions never show as actually sent.
- Validate phone/email availability and tenant permission to contact; test when there is no phone on file.
- Check partial and complete verified payments, reminders for paid/void invoices, invoice due dates, long property names, translated fields and dark/light responsive layout.
- If automated external delivery is required, integrate a private mail/WhatsApp API and test provider delivery webhooks separately.

**Important:** No live end-to-end cross-account test can be certified from static CI. The development database has one invoice and currently no verified payment records; no financial amounts should be fabricated.
