"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const sql=fs.readFileSync("db/0022_signed_lease_document_workflow.sql","utf8");
const js=fs.readFileSync("assets/rental-contracts.js","utf8");
const css=fs.readFileSync("assets/rental-contracts.css","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const lease=fs.readFileSync("assets/lease-finance.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const sandbox={window:{},document:{querySelector:()=>null},console};
vm.runInNewContext(js,sandbox,{filename:"rental-contracts.js"});
const contract=sandbox.window.ZimbaRentalContracts;
assert.equal(typeof contract.page,"function");
assert.equal(typeof contract.load,"function");
assert.equal(typeof contract.legalDocument,"function");
assert.equal(typeof contract.pdfData,"function");
const l={
 id:"e8f30000-0000-4000-8000-000000000000",
 tenant:'Jane <img src=x onerror=alert(1)> Smith',
 landlord:"Garden Court LTD",property:"Garden Court",room:"A-12",
 propertyAddress:"Plot 24 Main Road",city:"Kampala",country:"Uganda",
 rent:500000,deposit:500000,start:"2026-11-15",end:"2027-11-14",
 terms:"Utilities are metered separately. Repairs and lawful access must follow the written terms.",
 depositTerms:"The security deposit is refundable under the agreed terms; ordinary wear is excluded.",
 status:"issued",docStatus:"not_signed"
};
const printed=contract.legalDocument(l);
for(const marker of ["RESIDENTIAL TENANCY AGREEMENT","LANDLORD / AUTHORISED REPRESENTATIVE","TENANT","Signature","Date signed","Optional witness details","Uganda","UGX 500,000","Garden Court","A-12","Plot 24 Main Road"]){
 assert.ok(printed.includes(marker),"Missing printable field "+marker);
}
assert.ok(printed.includes("ISSUED COPY · SIGNATURES REQUIRED"));
assert.ok(!printed.includes('<img src=x onerror='),"Do not inject tenant names into HTML");
assert.ok(printed.includes("&lt;img"),"Tenant data must be escaped");
assert.ok(printed.toLowerCase().includes("not a receipt"),"Deposit must not be called collected rent");
assert.ok(printed.includes("window.print()"),"Provide explicit print / save as PDF");
assert.ok(printed.includes("@page{size:A4"),"Use A4 paper");
for(const pair of [
 [{...l,status:"draft",docStatus:"draft"},"Draft · editable"],
 [{...l,status:"issued",docStatus:"not_signed"},"Issued · not signed"],
 [{...l,status:"acknowledged",docStatus:"not_signed"},"Terms acknowledged · not signed"],
 [{...l,status:"issued",docStatus:"pending_tenant_confirmation"},"Awaiting tenant confirmation"],
 [{...l,status:"acknowledged",docStatus:"signed"},"Signed · both confirmed"]
]){
 assert.equal(contract.statusData(pair[0])[0],pair[1]);
}
for(const marker of ["managerLeaseContracts()","tenantLeaseContracts()","privateLeasePdf(scanId)","uploadSignedLease(","confirmSignedLease("]){
 assert.ok(auth.includes(marker),"Missing authorised API method "+marker);
}
for(const op of ["zimba_manager_lease_contracts","zimba_tenant_lease_contracts","zimba_private_lease_pdf","zimba_manager_upload_signed_lease","zimba_tenant_confirm_signed_lease"]){
 assert.ok(sql.includes(op),"Missing DB function "+op);
 assert.ok(auth.includes('"'+op+'"'),"Missing RPC allowlist "+op);
}
assert.ok(sql.includes("octet_length(pdf_content) BETWEEN 150 AND 3000000"));
assert.ok(sql.includes("ENABLE ROW LEVEL SECURITY"));
assert.ok(sql.includes("REVOKE ALL ON public.zimba_lease_signed_scans FROM PUBLIC,anonymous,authenticated"));
assert.ok(sql.includes("IF p_attest_both IS DISTINCT FROM true"),"Manager must attest two physical signatures");
assert.ok(sql.includes("tenant_confirmed_at IS NOT NULL"),"Confirmed agreement cannot be overwritten");
assert.ok(sql.includes("IF v_current.id IS DISTINCT FROM p_scan"),"Tenant must confirm current version");
assert.ok(sql.includes("v_current.sha256 IS DISTINCT FROM lower(p_sha256)"),"Tenant must confirm exact SHA");
assert.ok(sql.includes("WHERE c.resident_auth_user_id=auth.uid()"),"Tenant list must be scoped");
assert.ok(sql.includes("c.resident_auth_user_id=v_uid"),"Download/confirmation must be tenant-scoped");
assert.ok(sql.includes("manager_attested_at"),"Manager attestation required");
assert.ok(sql.includes("v_current.uploaded_by=v_uid"),"Uploader must not self-confirm as tenant");
assert.ok(sql.includes("'status','signed'"),"Signed state only after tenant confirmation");
assert.ok(sql.includes("signed_lease_tenant_confirmed"),"Signature confirmations must be audited");
assert.ok(sql.includes("sha256"),"Signed file integrity must be recorded");
assert.ok(!sql.includes("GRANT SELECT ON"),"No direct read access to PDF bytes");
assert.ok(js.includes("URL.createObjectURL"),"Private document download uses temporary URLs");
assert.ok(js.includes("crypto.subtle.digest"),"Client must compute PDF checksum");
assert.ok(js.includes("Print / Save PDF"),"Print action required");
assert.ok(js.includes("tenant confirmation"),"Upload must require counterparty confirmation");
assert.ok(lease.includes('if(kind==="lease"&&window.ZimbaRentalContracts)'));
assert.ok(html.includes("rental-contracts.js"));
assert.ok(html.includes("rental-contracts.css"));
assert.ok(css.includes(".zrl-panel")&&css.includes(".zrl-tenant-card"));
assert.equal(css.split("{").length,css.split("}").length,"Rental contract stylesheet must have balanced braces");
console.log("Rental contract: print, draft/edit, signature status, private PDF security checks passed");
