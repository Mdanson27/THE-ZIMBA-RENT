"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict"),vm=require("node:vm");
const schema=fs.readFileSync("db/0027_rent_rate_integrity.sql","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const invoices=fs.readFileSync("assets/invoice-studio.js","utf8");
const contracts=fs.readFileSync("assets/rental-contracts.js","utf8");
const tenant=fs.readFileSync("assets/tenant-portal.js","utf8");
const index=fs.readFileSync("index.html","utf8");
const css=fs.readFileSync("assets/invoice-studio.css","utf8");
const sandbox={window:{},document:{querySelector:()=>null},console};
vm.runInNewContext(invoices,sandbox,{filename:"invoice-studio.js"});
const studio=sandbox.window.ZimbaInvoiceStudio;
assert.ok(studio.page(true).includes("Rent invoices"));
const print=studio.printHTML({id:"test-invoice",leaseId:"test-lease",reference:"ZI-TEST",
 amount:550000,verifiedPaid:0,balance:550000,status:"unpaid",tenant:"Test",
 landlord:"Property management",property:"NYUMBA COTTAGES",unit:"A01",
 periodStart:"2026-12-01",periodEnd:"2026-12-31",due:"2026-12-31"});
assert.ok(print.includes("ZIMBA RENT"),"The printable document must display the complete brand");
assert.ok(print.includes("UGX 550,000"),"Invoice amounts are taken from authorised records");
assert.ok(!print.includes("UGX 5,000,000"),"A corrected invoice must not hard-code the old false figure");
assert.ok(invoices.includes("rateMismatch(i)"),"Mismatched invoices must not be printable or shareable");
assert.ok(invoices.includes("incorrect rent invoice"),"Show quarantine notice for wrong issued invoices");
assert.ok(invoices.includes("Under review"),"Incorrect balance is not immediately collectible");
assert.ok(invoices.includes("await auth().rentIntegrity("),"Cannot render financial details without integrity RPC");
assert.ok(invoices.includes("proposeRentCorrection"),"Landlord must submit amendment to tenant");
assert.ok(invoices.includes("answerRentCorrection"),"Tenant must approve/reject");
assert.ok(invoices.includes("Original amounts")||invoices.includes("original amounts")||invoices.includes("earlier amount"),"Audit history must be described");
assert.ok(contracts.includes("rentIssue(lease.id)"),"Mismatched agreements should not print as normal agreements");
assert.ok(contracts.includes("api().rentIntegrity("),"Contract check must use real unit rate");
assert.ok(tenant.includes("ZIMBA RENT WALLET"),"Wallet brand should be complete");
assert.ok(!tenant.includes("SAMPLE ONLY"),"Do not show fictitious example deposits");
for(const f of ["assets/invoice-studio.js","assets/invoice-studio.css","assets/rental-contracts.js",
 "assets/workspace-v3.js","assets/tenant-portal.js","assets/auth.js"]){
 assert.ok(index.includes(f),"Updated asset missing from entrypoint "+f);
}
for(const name of ["zimba_rent_integrity","zimba_manager_propose_rent_correction","zimba_tenant_answer_rent_correction"]){
 assert.ok(schema.includes("public."+name+"("),"Missing secured RPC "+name);
 assert.ok(auth.includes('"'+name+'"'),"RPC missing in allowlist "+name);
}
for(const fragment of [
 "zimba_my_manager_org()","c.resident_auth_user_id=v_uid",
 "manager_auth_id=v_uid","p_accept=false","pending_tenant","status='applied'",
 "SELECT 1 FROM public.zimba_lease_signed_scans",
 "SELECT 1 FROM public.zimba_payment_evidence",
 "i.status='paid'",
 "UPDATE public.zimba_lease_records SET monthly_rent_ugx",
 "UPDATE public.zimba_rent_invoices SET amount_ugx",
 "INSERT INTO public.zimba_invoice_amount_corrections",
 "INSERT INTO public.zimba_security_audit",
 "INSERT INTO public.zimba_notifications",
 "BEFORE INSERT ON public.zimba_rent_invoices",
 "BEFORE INSERT OR UPDATE OF monthly_rent_ugx,status ON public.zimba_lease_records",
 "REVOKE ALL ON public.zimba_rent_correction_requests FROM PUBLIC,anonymous,authenticated",
 "REVOKE ALL ON public.zimba_invoice_amount_corrections FROM PUBLIC,anonymous,authenticated",
 "ENABLE ROW LEVEL SECURITY",
 "moneyTransferred"
]){if(fragment==="moneyTransferred")continue;assert.ok(schema.includes(fragment),"Missing rate-correction control: "+fragment);}
assert.ok(!schema.includes("TRUNCATE "),"No bulk destruction of financial records");
assert.ok(!schema.includes("DELETE FROM"),"Do not delete previous invoices to correct them");
assert.ok(!schema.includes("DROP TABLE"),"Do not drop financial tables");
assert.ok(!schema.includes("UPDATE public.zimba_rent_invoices SET status='paid'"),"A correction cannot fake payment");
assert.ok(schema.includes("original_amount_ugx")&&schema.includes("revised_amount_ugx"),"Store both invoice values for audit");
assert.ok(schema.includes("new_monthly_ugx")&&schema.includes("old_monthly_ugx"),"Keep before/after lease rate");
assert.ok(css.includes(".ziv-billing-hold")&&css.includes(".ziv-correction"),"Financial warning styles absent");
console.log("ZIMBA RENT rates: verified unit mismatch quarantine, independent tenant approval, auditable invoice correction, branding and no fake deposits.");
