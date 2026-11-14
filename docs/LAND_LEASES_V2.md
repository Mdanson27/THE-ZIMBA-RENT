# ZIMBA RENT — Land & Long-Term Leases V2

Updated: 14 November 2026.

## Objective

Upgrade the former one-time "Create a land lease draft" form to a complete, property-oriented long-term land agreement workspace, without mixing land leases with ordinary monthly residential agreements.

## Life cycle

1. **Draft & editing.** A manager opens **Rent & Finances → Land & long-term leases**. The builder records parcel reference and full description, linked ZIMBA property (optional), title/certificate reference, reported tenure and area, lessor and lessee, manager's capacity, other party's email, commencement and expiry, lease premium and recurring ground rent schedule, permitted use, payment terms, renewal, covenants and internal legal-review notes. Save creates a real Neon record in `zimba_land_lease_drafts` and `zimba_land_lease_parties`. Reopening and saving edits the same draft ID; there is no duplicate record for each edit.
2. **Issue.** Only a sufficiently completed draft can be issued. `zimba_manager_issue_land_lease` locks its terms in a separate workflow status. The other party must use a different email; the app creates an in-app notification only when an existing, email-verified ZIMBA account matches. No external email message is claimed. If there is no such account yet, managers must share the ZIMBA sign-in link and invite the party to register and verify that specific email.
3. **Print / Save PDF.** A manager or authorised counterparty can open a separate A4 document window and print or save it as PDF. It includes lessor and lessee, parcel and title particulars (clearly unverified), land details, term, premium, ground rent frequency, use, payment covenants, lease conditions, renewal, signature spaces for both parties, witnesses and a blank statutory/registration particulars section. A generated blank-signature printout is **not** an executed instrument.
4. **Sign physically.** Both parties separately review and sign the same complete agreed document. Verify identity, authority, land title, consent requirements and required registrable format independently.
5. **Upload the signed PDF.** Manager scans all signed pages together (PDF, up to 3 MB) and attests that the lessor and lessee signatures appear. `zimba_manager_upload_land_lease_pdf` validates PDF header and end marker and its SHA-256 checksum, stores exact private bytes in `zimba_land_lease_signed_scans` as a numbered append-only revision, and audits the action. State becomes **Signed PDF uploaded · awaiting other party**.
6. **Counterparty confirmation.** A second distinct ZIMBA user must have an email-verified account matching the issued lease's counterparty email. From **Land signing requests**, the person opens/downloads the exact saved PDF, checks the signatures and terms, and explicitly confirms the version's ID and SHA-256. `zimba_land_lease_counterparty_confirm` verifies account ownership, separate uploader/issuer identity and latest PDF hash. Only then is the visible document status **Signed PDF · both confirmed**.
7. **Private archive.** The saved signed PDF remains available to the authorised organisation manager and designated verified counterparty. Confirmed versions cannot be replaced. Earlier revisions remain in the audit record.

## Important legal separation

These are different conditions:

- **Draft:** terms being developed; no signature or registration.
- **Issued:** final terms shared; no signatures.
- **Uploaded for review:** manager attested both signatures on a PDF, pending counterparty confirmation.
- **Signed PDF · both confirmed:** a specific PDF was uploaded and counter-confirmed by separate authorised accounts.
- **Registered leasehold interest:** outside ZIMBA's automatic capabilities. Must be established through the applicable title/registration authorities and competent legal review. This implementation does not claim to verify it.

The Land Act and Registration of Titles Act in Uganda may impose specific tenure, consent, form and registration requirements. ZIMBA does not automatically validate land boundaries, encumbrances, power of attorney, registry entries, signatures, stamp duty or legal enforceability. Obtain professional review and relevant official endorsements before claiming a registered property right. See the current consolidated law at [Registration of Titles Act](https://ulii.org/en/akn/ug/act/ord/1922/22/eng%402023-12-31) and [Land Act](https://ulii.org/en/akn/ug/act/1998/16/eng%402023-12-31).

## Security and privacy

- The detailed party table and private PDF table have RLS enabled and no browser table grants for `PUBLIC`, `anonymous`, or `authenticated`.
- Manager operations enforce `zimba_my_manager_org()`, cross-organisation record checks and issued-term immutability.
- The signing inbox resolves only to the authenticated user's own email-verified, non-banned Neon Auth identity.
- Only a specified manager or counterparty can download the exact signed PDF via a scoped function. Users cannot open or enumerate unassigned documents.
- Upload and confirmation writes are not retried automatically by browser RPC code.
- PDFs are limited to 3 MB, versioned and SHA-256 checked; no forged or generated signatures are created.
- An archived copy contains whatever scanned content the user uploaded; malware scanning and dedicated object storage should be added before large-scale production deployment.
- A separate browser acceptance test is still required with two different verified accounts. No signing test can be completed in a database without a real counterpart and signed document.

## Technical changes

- `db/0023_land_lease_contract_execution.sql`: dedicated land party details, verified-email signing inbox, private signed scans, draft saving, issuing, scoped download and counter-confirmation.
- `assets/land-leases.js` and `assets/land-leases.css`: structured builder, register, A4 print and signatory inbox.
- `assets/workspace-v3.js`: manager and non-manager routes for land signing.
- `assets/auth.js`: RPC allowlist, read-only safe retries, write operations kept non-replayed.
- `index.html`: new source and CSS versions.
- `tests/land-leases.test.cjs` and `.github/workflows/validate-ui.yml`: static, document and access regression tests.

## Follow-on checklist

Verify a manager creates, saves, reopens, edits and issues a land lease. Confirm the saved printout contains the right parcel, lessee, lessor, dates, amount and signature spaces. With an external verified counterparty account, test access isolation, signed PDF upload/download, exact hash validation, confirmation and immutability. Test an unrelated account and another organisation, a non-verified email, expired login, corrupt PDF, >3 MB upload, duplicate issue and stale revision. Document title and registry checks are separate from the technical signing test.
