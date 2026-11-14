# ZIMBA RENT — Rental Agreements V2

## Goal
Provide properly laid-out, property-specific, editable rental agreement drafts and a private, durable archive of the **actual physically signed PDF**. A tenant's old "acknowledged" status is explicitly **not** a signature.

## Contract workflow

1. **Draft:** Manager opens **Rent & Finances → Rental agreements**, chooses an approved connected resident and property, enters the dates, agreed monthly rent and refundable deposit, edits both sets of legal terms, and selects **Save editable draft**. This calls the existing `zimba_manager_prepare_lease(...,p_issue=false)` RPC and stores the actual draft in Neon. Editing is permitted while status is `draft`.
2. **Issue:** Manager selects **Issue to tenant**. Existing write function changes the draft to `issued` and notifies the linked tenant. Issued terms are locked; altering an already-issued agreement requires a proper amendment process rather than overwriting the original.
3. **Print:** Manager chooses **Print / Save PDF** from the saved agreement register. ZIMBA renders an A4 agreement with the saved landlord organisation, named connected tenant, property address, assigned room, term dates, rent and deposit, editable clauses, two full signature blocks and optional witness lines. The browser print dialog permits either physical printing or "Save as PDF." The blank printout is **not** an executed contract.
4. **Sign physically:** Both parties review and sign the **same** agreed copy (and any relevant witness fields). Each party should keep a complete copy and verify identity and legal authority.
5. **Upload:** Manager scans the complete signed document as a PDF up to 3 MB, verifies both physical signatures are present, attests it is the issued agreement, and uploads through `zimba_manager_upload_signed_lease`. The actual PDF bytes are stored privately in the Neon database, with SHA-256 digest, uploader, timestamp, and revision. The status becomes `pending_tenant_confirmation`. This does **not** mark the contract as signed.
6. **Tenant confirmation:** The linked tenant logs in using an account **different from the uploader**, opens/downloads the exact saved PDF, checks both signatures, the parties, and the terms, and confirms with an explicit checkbox. `zimba_tenant_confirm_signed_lease` verifies the tenant's authenticated identity, the latest scan ID and exact SHA-256, then records tenant ID and timestamp. Only **then** does the document status become `signed`.
7. **Archive:** Managers and the linked tenant can download the exact saved signed PDF through the authorised `zimba_private_lease_pdf` RPC. The file is immutable after tenant confirmation. Earlier unconfirmed uploads are retained as immutable revisions for investigation.

### State semantics
- **Draft · editable:** Editable backend draft. No signatures.
- **Issued · not signed:** Sent for tenant review. Not executed.
- **Terms acknowledged · not signed:** Legacy tenant account acknowledgement. Not a wet-ink signature or executed document.
- **Awaiting tenant confirmation:** Manager uploaded and attested an allegedly signed PDF. Not yet counter-confirmed.
- **Signed · both confirmed:** Manager attested both physical signatures and the linked tenant authenticated and confirmed the exact PDF. This is an **attested archive**; it is not forensic signature authentication, legal notarisation, or judicial proof of validity.

### Security
- `zimba_lease_signed_scans` has RLS enabled and **no direct table privileges for anonymous/authenticated clients**.
- All signed-PDF bytes are available only via a SECURITY DEFINER RPC scoped to the authenticated tenant or authorised organisation manager.
- Only currently issued/acknowledged lease records accept uploads; drafts cannot be misrepresented as signed.
- PDFs are capped at 3 MB, require a PDF header/end marker and SHA-256 match, with max 10 revisions per lease.
- Confirming a stale PDF revision is rejected; once confirmed, it cannot be replaced in this workflow.
- Upload and tenant confirmation are recorded in `zimba_security_audit`. A linked tenant gets a notification when a copy is uploaded.
- The existing invoicing, deposit ledger and legacy lease record statuses remain compatible.
- As with any user-uploaded file workflow, deploy independent malware scanning, private-object storage, retention rules, server-side file inspection, and verified role-based browser E2E tests before large-scale production use. File header checking alone is not comprehensive malware screening.

### Legal review
Uganda's Landlord and Tenant Act, 2022 (as revised, Cap. 238) provides a prescribed written tenancy format in Schedule 2, with modifications allowed. A legal professional should review the system-generated agreement, especially identity, party capacity, unit/premises particulars, any utility and deposit provisions, signatures, notice terms and legal restrictions. This software deliberately does not assert that generated clauses are a fully compliant prescribed form or that any scanned signature has been independently authenticated.

## Release files
- `db/0022_signed_lease_document_workflow.sql`
- `assets/rental-contracts.js` and `assets/rental-contracts.css`
- `assets/lease-finance.js` (lease-specific routing only)
- `assets/auth.js` (authenticated RPC methods)
- `index.html`
- `tests/rental-contracts.test.cjs` and `.github/workflows/validate-ui.yml`

## Acceptance tests still requiring signed-in browser accounts
- Manager: save/reopen/edit a draft, print with correct property, issue, upload real signed PDF; fail on wrong type/oversize, no signatures, or checksum mismatch.
- Tenant: cannot see drafts or a different tenant's lease; can download issued document and the signed scan, and only confirm the latest exact scanned PDF.
- Signed: survives full reload and returns identical PDF bytes; new manager uploads rejected, and stale-version confirmations rejected.
- Organisation B: cannot enumerate, view, or modify organisation A's rental agreements.
- Billing: existing invoice and deposit records remain accurate; an old account acknowledgement must never be displayed as proof of signatures.
- Browser: desktop/mobile layouts, accessible print flow, CORS/Neon schema refresh, error recovery, and dark/light modes.

**Do not use dummy money, synthetic signatures, silently generated handwritten marks, or claim two people signed if the stored PDF and their explicit attestations do not support it.**
