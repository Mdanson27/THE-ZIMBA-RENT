"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const script=fs.readFileSync("assets/invoice-studio.js","utf8");
const styles=fs.readFileSync("assets/invoice-studio.css","utf8");
const sql=fs.readFileSync("db/0024_invoice_documents_delivery.sql","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const route=fs.readFileSync("assets/lease-finance.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const ctx={window:{},document:{querySelector:()=>null},console};
vm.runInNewContext(script,ctx,{filename:"invoice-studio.js"});
const studio=ctx.window.ZimbaInvoiceStudio;
assert.equal(typeof studio.page,"function");
assert.equal(typeof studio.load,"function");
assert.equal(typeof studio.printHTML,"function");
assert.equal(typeof studio.shareText,"function");
assert.equal(typeof studio.safePhone,"function");
assert.ok(studio.page(true).includes("Rent invoices"));
assert.ok(studio.page(false).includes("My rent invoices"));
const fixture={
 id:"f915b17a-0000-4000-8000-111111111111",
 leaseId:"c8bbac41-0000-4000-8000-111111111111",
 reference:"ZI-SAMPLE123",landlord:"Nyumba Property Company",
 property:'The <img src=x onerror=alert(1)> Estate',
 propertyAddress:"Plot 7, Kampala",city:"Kampala",country:"Uganda",
 unit:"B-03",tenant:'Jane <script>alert(1)</script> Doe',tenantEmail:"jane@example.com",
 amount:500000,verifiedPaid:200000,balance:300000,periodStart:"2026-11-01",
 periodEnd:"2026-11-30",issuedAt:"2026-11-02T11:00:00+03:00",
 due:"2026-11-30",status:"partial",
 receipts:[{reference:"ZRCP-VERIFIED",amount:200000,source:"reconciled_bank",verifiedAt:"2026-11-12T12:00:00Z"}]
};
const printed=studio.printHTML(fixture);
for(const marker of ["RENT INVOICE","zimba","Issued by","Billed to","ZI-SAMPLE123",
 "Nyumba Property Company","Kampala","B-03","UGX 500,000","UGX 200,000",
 "UGX 300,000","ZRCP-VERIFIED","Payment instructions",
 "not a receipt","EFRIS","@page{size:A4","window.print()"]){
 assert.ok(printed.includes(marker),"Missing print field "+marker);
}
assert.ok(!printed.includes('<script>alert(1)</script>'),"Tenant name must be escaped");
assert.ok(!printed.includes('<img src=x onerror=alert(1)>'),"Property name must be escaped");
assert.ok(printed.includes("&lt;script&gt;"),"Tenant script markup must be escaped");
assert.ok(printed.includes("&lt;img"),"Property HTML must be escaped");
assert.ok(!printed.includes("security deposit: UGX"),"Deposits must not count as rent");
assert.equal(studio.statusLabel(fixture)[0],"Partially paid");
assert.equal(studio.statusLabel({...fixture,status:"overdue"})[0],"Overdue");
assert.equal(studio.statusLabel({...fixture,status:"paid"})[0],"Paid · verified");
const invoiceMessage=studio.shareText(fixture,"invoice");
const reminder=studio.shareText(fixture,"reminder");
for(const value of ["ZI-SAMPLE123","UGX 500,000","UGX 300,000","Kampala","Sign in","Nyumba Property Company"])
 assert.ok(invoiceMessage.includes(value),"Missing customer message detail "+value);
assert.ok(reminder.toLowerCase().includes("reminder"));
assert.notEqual(invoiceMessage,reminder);
assert.ok(invoiceMessage.length<=700,"The default notification must fit DB limit");
assert.equal(studio.safePhone("+256 (770) 123-456"),"256770123456");
for(const op of ["zimba_manager_invoice_documents","zimba_tenant_invoice_documents","zimba_manager_deliver_invoice_in_app"]){
 assert.ok(sql.includes(op),"Missing secured invoice RPC "+op);
 assert.ok(auth.includes('"'+op+'"'),"RPC absent from browser allowlist: "+op);
}
for(const value of [
 "WHERE l.organization_id=public.zimba_my_manager_org()",
 "WHERE c.resident_auth_user_id=v_user",
 "zimba_payment_evidence","verifiedPaid",
 "zimba_invoice_delivery_log","ENABLE ROW LEVEL SECURITY",
 "REVOKE ALL ON public.zimba_invoice_delivery_log FROM PUBLIC,anonymous,authenticated",
 "p_intent='reminder' AND v_paid>=v_inv.amount_ugx",
 "interval '24 hours'","zimba_notifications","zimba_security_audit",
 "'invoice_in_app_delivered'","'channel','in_app'",
 "NOTIFY pgrst"]){
 assert.ok(sql.includes(value),"Missing billing security behaviour "+value);
}
assert.ok(!sql.includes("GRANT SELECT ON public.zimba_invoice_delivery_log"),"No raw delivery-table privileges");
assert.ok(sql.includes("greatest(i.amount_ugx-pay.paid,0)"),"Invoice balance must come from real payments");
assert.ok(sql.includes("CASE WHEN i.status='void'"),"Voided invoices must not be presented as payable");
assert.ok(script.includes('window.location.href=uri'),"Email should open mailto composer");
assert.ok(script.includes('"https://wa.me/"'),"WhatsApp should open direct composer");
assert.ok(script.includes("has not sent or verified"),"External channels must disclose delivery limitations");
assert.ok(script.includes("deliverInvoiceInApp("),"In-app delivery must use authenticated RPC");
assert.ok(script.includes("Copy message"),"Manual sharing fallback should exist");
assert.ok(script.includes('err?.code==="PGRST202"'),"Recover a stale document RPC without clearing a live session");
assert.ok(script.includes('data-ziv-fallback="schema-cache"'),"Show the old invoice register during a schema-cache outage");
assert.ok(script.includes("Printing, sharing and verified balance calculations are temporarily paused"),"Degraded display must not present unverified balances");
assert.ok(script.includes("await auth().managerInvoices()"),"Fallback must reuse existing authorised invoice records");
assert.ok(script.includes("await auth().tenantInvoices()"),"Tenant fallback must preserve user-scoped billing");

assert.ok(script.includes("Print / Save as PDF"),"Invoice must be printable");
assert.ok(route.includes('if(kind==="invoices"&&window.ZimbaInvoiceStudio)'));
assert.ok(html.includes("assets/invoice-studio.js"));
assert.ok(html.includes("assets/invoice-studio.css"));
assert.ok(styles.includes(".ziv-page")&&styles.includes(".ziv-share"));
assert.equal(styles.split("{").length,styles.split("}").length,"Invoice stylesheet CSS rule braces mismatch");
console.log("Invoice Studio V3 tests passed: scoped billing, A4 print, verified balance and channel delivery boundaries");
