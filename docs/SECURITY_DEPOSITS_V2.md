# ZIMBA RENT — Security Deposits V2

Released 14 November 2026.

## Purpose

Replace the basic "Deposit register" with an auditable process for amounts agreed, receipt claims, tenant acknowledgement, independently verified funds, tenant-initiated refund requests, proposed deductions, review, external payout records and recipient confirmation.

**Financial truth is never inferred from a manager checkbox.** The `zimba_deposit_ledger` only contains externally verified/reconciled entries. A manual receipt claim or tenant confirmation never writes to it.

## The three user-requested stages

1. **Determined / agreed.** The tenancy agreement in `zimba_lease_records.deposit_required_ugx` states the refundable amount. Once the agreement is issued, a notification is sent to the linked tenant and the authorised management team. At this stage `Agreed` does **not** mean received.
2. **Received / kept.** A manager adds the amount, date, cash-book or bank reference and a written evidence note, and attests that receipt occurred. This becomes `Manager reported receipt`. The tenant is notified and can acknowledge or dispute it. Tenant acknowledgement gives a separately labelled `Tenant-acknowledged receipt`, while `Verified held` remains calculated from the original independent reconciliation ledger. No document or amount is falsely marked bank-verified.
3. **Returned / deductions.** After an acknowledged tenancy term is formally ended, the tenant submits a refund request explaining the amount sought. The landlord proposes each deduction with an amount, detailed explanation and evidence/inspection reference. The tenant accepts or disputes the proposal. A manager can record the external payout/settlement reference only after tenant acceptance and availability checks against documented or independently verified deposits. Finally, the tenant confirms receiving the refund or disputes receipt. Only the separate **Tenant-confirmed return** total advances at this point; the independent financial ledger is never rewritten automatically.

## Detailed roles and workflow

### Landlord / authorised property manager

- Read a compact overview: total agreed deposits, verified held, tenant-acknowledged receipts and tenant-confirmed returns.
- Inspect property/unit-specific records, the agreed lease terms and a five-stage progression.
- Record a receipt attestation with evidence, date and reference. Can record multiple instalments within the agreed total; original records remain preserved.
- On a tenancy whose scheduled end date has passed, mark the acknowledged term ended with a reason through the original `zimba_manager_end_lease` backend audit path.
- Review tenant refund requests; propose a fully itemised settlement. Each deduction must have a positive amount, 20–500 character reason and an evidence reference. The total deduction cannot exceed the requested refund amount.
- On tenant acceptance, record an external payout/settlement reference and date. This is **manager-reported payout**, not bank verification.
- Read whether the tenant confirmed receipt, disputed a proposed deduction or disputed a reported payout. Disputed payouts require a human investigation rather than automatic repeat transfers.

### Tenant

- Read only their own connected tenancy deposit records and agreement clauses.
- Acknowledge or dispute a manager-reported deposit receipt.
- Once the tenancy is ended, enter a requested refundable amount and written reason; the landlord is notified.
- Inspect every proposed deduction, its justification, evidence reference and the proposed net refund. Accept or dispute in writing. A disputed proposal can be revised with an additional numbered version.
- After the manager reports the external transfer, explicitly confirm **actual receipt** or report missing/incorrect funds. The tenant response is preserved for auditing.

### Notifications

The new `zimba_deposit_notify_parties` helper creates private ZIMBA in-app notifications for the linked tenant plus active members with `owner`, `admin` or `manager` access to the responsible organisation. It never sends another unrelated tenant private amounts or deduction reasons, even if they rent another unit in the same building.

Notifications are created for:
- the issued tenancy's agreed deposit amount;
- manager's receipt attestation;
- tenant's receipt acknowledgement or dispute;
- tenant's refund request;
- manager's deduction/refund proposal, including amount and reason summary;
- tenant's acceptance or dispute of deductions;
- manager's reported payout/settlement, including amount and reference;
- tenant's final receipt confirmation or dispute.

The platform's existing notification bell and feed handle reading. No email or WhatsApp is falsely claimed as sent.

## Security, financial integrity and audit

- The new receipt and proposal tables have RLS enabled; browser roles have **no direct table SELECT/UPDATE grants**.
- All data is accessed only through authenticated, organisation- or linked-resident-scoped SECURITY DEFINER RPCs.
- Draft or issued active tenancies cannot use the post-termination refund-request action; the original ended-tenancy rule remains.
- Deduction explanations and evidence references are required even if the amount is small.
- Unrelated tenants do not see another tenant's deposit.
- Every meaningful transition is written to `zimba_security_audit`.
- Refund decisions and money transfer are different states. ZIMBA has not connected a bank/payment processor that could independently certify a deposit or refund; the UI accurately labels manager/tenant attestations.
- The original `zimba_deposit_ledger` is **never modified** by this new manager/tenant workflow.
- Existing `zimba_deposit_refund_requests` records are used instead of migrating away from their IDs; old historical requests remain visible.
- Manager-reported payouts use the stronger of independently verified original deposits and mutually acknowledged receipt claims as a bound, less previously committed settlements. This prevents arbitrary unbacked amounts, but does not replace external reconciliation.
- The legacy manager review RPC still exists for compatibility with previously deployed clients. It must be retired in a future audited backend migration to fully eliminate alternative approval paths.

## Files

- Database: `db/0025_security_deposit_lifecycle.sql`.
- Frontend: `assets/deposit-studio.js`, `assets/deposit-studio.css`.
- Routing: `assets/lease-finance.js` now selects the deposit studio for managers and tenants.
- RPC client: `assets/auth.js`.
- Entry point: `index.html`.
- Tests: `tests/deposit-studio.test.cjs` and `.github/workflows/validate-ui.yml`.

## Acceptance testing still needed

The development database currently has one rental agreement and **no** verified deposit ledger entries, receipt attestations, refund requests or completed payouts. Test with a manager and distinct linked tenant:
1. Confirm agreed UGX amount displays but received/verified totals remain zero before evidence.
2. Record a legitimate receipt with traceable reference, then have the tenant acknowledge or dispute it.
3. Confirm unrelated tenants and other organisations cannot read or act on the record.
4. Test reaching the ended-tenancy state on a valid end date.
5. Request refund from the tenant account. Propose two deductions with distinct evidence; tenant accepts or disputes.
6. Confirm that a transfer **cannot** be reported without accepted proposals and sufficient evidence of a held deposit.
7. If an actual external payout occurs, record its reference, then have the tenant confirm or dispute actual receipt.
8. Check every notification, audit entry, amount, tenant-specific record and reload state.
9. Confirm that neither a receipt claim nor tenant-confirmed payout creates fake bank-verified ledger entries.
10. Test a documented zero-refund settlement, a disputed payout, double submission, over-deduction, negative values and duplicate references.

**Before using this as an automated deposit-payments product, connect a verified financial reconciliation provider, assess applicable Uganda tenancy/deposit rules, and independently audit the transition permissions and payout settlement calculations.**
