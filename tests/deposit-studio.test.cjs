"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const js=fs.readFileSync("assets/deposit-studio.js","utf8");
const css=fs.readFileSync("assets/deposit-studio.css","utf8");
const sql=fs.readFileSync("db/0025_security_deposit_lifecycle.sql","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const finance=fs.readFileSync("assets/lease-finance.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const sandbox={window:{},document:{querySelector:()=>null},console,Date};vm.runInNewContext(js,sandbox,{filename:"deposit-studio.js"});
const studio=sandbox.window.ZimbaDepositStudio;
for(const fn of ["page","load","money","phases"])assert.equal(typeof studio[fn],"function",fn);
assert.ok(studio.page(true).includes("Track agreed deposits"));
assert.ok(studio.page(false).includes("request a refund"));
assert.equal(studio.money(500000),"UGX 500,000");
const statuses=["reported","tenant_acknowledged","disputed","requested","proposed",
 "accepted","awaiting_confirmation","confirmed","payout_disputed","settled"];
for(const status of statuses)assert.ok(studio.statuses[status],"No display state "+status);
const stages=studio.phases({required:500000,receipts:[],acknowledgedReceived:0,verifiedHeld:0,requests:[]});
assert.ok(stages.includes("Agreed"));
assert.ok(stages.includes("Receipt recorded"));
assert.ok(stages.includes("Tenant acknowledged"));
assert.ok(stages.includes("Financially verified"));
assert.ok(stages.includes("Refund settled"));
assert.ok(js.includes("manager-reported")||js.includes("Manager-reported"));
assert.ok(js.includes("Verified held"));
assert.ok(js.includes("Tenant-confirmed"));
assert.ok(js.includes("bank verification")||js.includes("Bank reconciliation"));
assert.ok(js.includes("zds-deduction-input"));
assert.ok(js.includes("deductReason")&&js.includes("deductEvidence"));
assert.ok(js.includes("dispute")&&js.includes("accept"));
assert.ok(js.includes("confirmDepositPayout"));
assert.ok(js.includes("startDepositRefund"));
assert.ok(js.includes("data-zds-end"),"Manager must be able to close a completed term before refund requests");
assert.ok(js.includes("api().endLease("),"End-tenancy action must call existing audited backend RPC");

assert.ok(js.includes("proposeDepositRefund"));
assert.ok(js.includes("reportDepositPayout"));
assert.ok(js.includes("respondDepositReceipt"));
assert.ok(js.includes("attestDepositReceipt"));
assert.ok(!js.includes("localStorage"),"Deposit money must not be client-side source of truth");
assert.ok(!js.includes("fetch("),"No direct third-party financial request should happen in browser");
const allFns=[
 "zimba_deposit_workspace","zimba_deposit_notify_parties","zimba_manager_attest_deposit_receipt",
 "zimba_tenant_respond_deposit_receipt","zimba_tenant_start_deposit_refund",
 "zimba_manager_propose_deposit_refund","zimba_tenant_answer_deposit_proposal",
 "zimba_manager_report_deposit_payout","zimba_tenant_confirm_deposit_payout"
];
for(const name of allFns)assert.ok(sql.includes("public."+name+"("),"Missing SQL function "+name);
for(const name of allFns.filter(n=>n!=="zimba_deposit_notify_parties"))
 assert.ok(auth.includes('"'+name+'"')||name==="zimba_deposit_agreement_notice","RPC absent from auth "+name);
for(const token of [
 "ENABLE ROW LEVEL SECURITY",
 "REVOKE ALL ON public.zimba_deposit_receipt_attestations FROM PUBLIC,anonymous,authenticated",
 "REVOKE ALL ON public.zimba_deposit_settlement_proposals FROM PUBLIC,anonymous,authenticated",
 "c.resident_auth_user_id=v_uid",
 "l.organization_id=v_org",
 "m.role IN ('owner','admin','manager')",
 "p_mode='tenant'",
 "p_mode='manager'",
 "status='reported'",
 "status='awaiting_confirmation'",
 "status='confirmed'",
 "IF v_deduct>v_r.amount_ugx",
 "deductions exceed the requested",
 "evidence",
 "v_s.gross_ugx>v_basis",
 "bankVerified",
 "moneyTransferred",
 "zimba_security_audit",
 "zimba_notifications",
 "payout_disputed",
 "tenant_responded_at",
 "NO_REFUND_THIS_IS_NOT_A_VALID_MARKER"
]){
 if(token==="NO_REFUND_THIS_IS_NOT_A_VALID_MARKER")continue;
 assert.ok(sql.toLowerCase().includes(token.toLowerCase()),"Missing SQL safety element "+token);
}
assert.ok(!sql.includes("INSERT INTO public.zimba_deposit_ledger"),"Manager and tenant confirmations must not invent verified funds");
assert.ok(!sql.includes("UPDATE public.zimba_deposit_ledger"),"Never rewrite bank-verified ledger from a manual form");
assert.ok(sql.includes("AND c.resident_auth_user_id=v_uid"),"Tenant actions must be scoped to linked resident");
assert.ok(sql.includes("status='ended'"),"Only ended tenancy may request refund");
assert.ok(sql.includes("v_previous.status<>'disputed'"),"Disputed payout should not be silently recycled");
assert.ok(sql.includes("v_r.reported_by=v_uid"),"Receipt reporter must not self-acknowledge as tenant");
assert.ok(sql.includes("v_s.proposed_by=v_uid"),"Manager must not self-accept a deduction proposal as tenant");
assert.ok(sql.includes("v_s.payout_reported_by=v_uid"),"Payout reporter must not self-confirm as tenant");
assert.ok(sql.includes("payout_reported_by=auth.uid()"),"Persist payout reporter identity for two-party approval");

assert.ok(sql.includes("Proposed deductions UGX"),"Proposal notification must explain deduction amount");
assert.ok(sql.includes("Reasons: "), "Private notification must summarize deduction reasons");
assert.ok(sql.includes("Manager reported return UGX"),"Payout notification must show return amount");

assert.ok(sql.includes("p_confirm IS DISTINCT FROM true"),"Explicit response intent is required");
assert.ok(finance.includes('kind==="deposits"&&window.ZimbaDepositStudio'));
assert.ok(html.includes("assets/deposit-studio.js"));
assert.ok(html.includes("assets/deposit-studio.css"));
assert.ok(css.includes(".zds-metrics")&&css.includes(".zds-record-sections"));
assert.equal(css.split("{").length,css.split("}").length,"Deposit CSS braces mismatch");
console.log("Security Deposits V2: agreement, receipt, deductions, refund, notifications and permissions validated");
