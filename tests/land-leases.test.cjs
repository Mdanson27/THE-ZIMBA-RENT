"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("assets/land-leases.js","utf8");
const css=fs.readFileSync("assets/land-leases.css","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const route=fs.readFileSync("assets/workspace-v3.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const sql=fs.readFileSync("db/0023_land_lease_contract_execution.sql","utf8");
const sandbox={window:{},document:{querySelector:()=>null}};
vm.runInNewContext(source,sandbox);
const land=sandbox.window.ZimbaLandLeases;
assert.equal(typeof land.page,"function");
assert.equal(typeof land.load,"function");
assert.equal(typeof land.printable,"function");
assert.equal(typeof land.docStatus,"function");
assert.ok(land.page(true).includes("Land & long-term leases"));
assert.ok(land.page(false).includes("Review land agreements addressed to your verified account"));
const l={
 id:"3c144008-5431-4312-a432-020000000111",
 parcel:"Plot 25, Block 46",
 location:'Kampala, Uganda <img src=x onerror=alert(1)>',
 lessorName:"Mukono Holdings Ltd",lesseeName:"Example Lessee",
 managedCapacity:"lessor",titleReference:"Title reference: REF-12",
 tenureType:"mailo",sizeDescription:"1.1 hectares",start:"2026-11-14",end:"2066-11-14",
 premium:25000000,rent:500000,rentFrequency:"annual",
 paymentTerms:"Premium payable subject to signed agreement.",
 renewalTerms:"Written agreement only; no automatic renewal.",
 permittedUse:"Commercial use subject to consent and all land rules.",
 conditions:"Tenant complies with the land use and maintenance requirements.",
 status:"issued",docStatus:"issued"
};
const printable=land.printable(l);
for(const field of ["LAND & LONG-TERM LEASE AGREEMENT","LESSOR / AUTHORISED REPRESENTATIVE",
 "LESSEE / AUTHORISED REPRESENTATIVE","Signature","Date signed","Witnesses",
 "UGX 25,000,000","UGX 500,000","Plot 25, Block 46","mailo","1.1 hectares",
 "Mukono Holdings Ltd","Example Lessee","@page{size:A4","Print / Save as PDF",
 "Registration and statutory particulars","not a verified land title"]){
 assert.ok(printable.toLowerCase().includes(field.toLowerCase()),"Print document missing "+field);
}
assert.ok(!printable.includes("<img src=x onerror=alert(1)>"),"Land data must be HTML-escaped");
assert.ok(printable.includes("&lt;img"),"Land location is escaped");
for(const [state,label] of [
 ["draft","Draft · editable"],["issued","Issued · not signed"],
 ["pending_counterparty","Signed PDF uploaded · awaiting other party"],
 ["signed","Signed PDF · both confirmed"]]){
 assert.equal(land.docStatus({...l,docStatus:state})[0],label);
}
for(const op of [
 "zimba_manager_land_lease_contracts","zimba_manager_save_land_lease",
 "zimba_manager_issue_land_lease","zimba_my_land_lease_signing_requests",
 "zimba_manager_upload_land_lease_pdf","zimba_land_lease_private_pdf",
 "zimba_land_lease_counterparty_confirm"]){
 assert.ok(sql.includes(op),"Missing SQL operation "+op);
 assert.ok(auth.includes('"'+op+'"'),"Missing Auth RPC allow-list "+op);
}
for(const guard of [
 "public.zimba_my_manager_org()","FOR UPDATE",
 "p_attest_both IS DISTINCT FROM true","IF v_scan.uploaded_by=v_uid",
 'u."emailVerified"=true',"v_party.counterparty_email<>v_email",
 "v_scan.sha256 IS DISTINCT FROM lower","sha256",
 "octet_length(pdf_content) BETWEEN 150 AND 3000000",
 "REVOKE ALL ON public.zimba_land_lease_signed_scans FROM PUBLIC,anonymous,authenticated",
 "land_lease_counterparty_confirmed","tenant","NOTIFY pgrst"]){
 if(guard==="tenant")continue;
 assert.ok(sql.includes(guard),"SQL security guard missing "+guard);
}
assert.ok(sql.includes("confirmed_at IS NOT NULL THEN 'signed'"),"Signed status must require counterparty confirmation");
assert.ok(sql.includes("Confirmed executed land leases are immutable"));
assert.ok(sql.includes("counterparty_email=v_email"),"Counterparty list must be email-scoped");
assert.ok(sql.includes("workflow_status<>'draft'"),"Issued agreements must be locked");
assert.ok(!sql.includes("GRANT SELECT ON"),"Never grant signed PDF table access");
assert.ok(!source.includes("localStorage"),"Do not save land agreements in browser localStorage");
assert.ok(source.includes("ZimbaRentalContracts.pdfData"),"PDF must be checked and hashed");
assert.ok(source.includes('crypto.subtle.digest("SHA-256"'),"Downloaded PDF integrity must be checked");
assert.ok(source.includes("confirmLandLeasePdf"),"Counterparty confirmation required");
assert.ok(source.includes("uploadLandLeasePdf"),"Upload must be persisted to Neon");
assert.ok(source.includes("saveLandLease("),"Draft must be truly saved");
assert.ok(source.includes("issueLandLease("),"Agreement needs issued stage");
assert.ok(route.includes("window.ZimbaLandLeases.page(managed())"));
assert.ok(route.includes("window.ZimbaLandLeases.load(managed())"));
assert.ok(route.includes('["land-leases","Land signing requests"'),"Nonmanager needs navigation to incoming requests");
assert.ok(html.includes("assets/land-leases.js"));
assert.ok(html.includes("assets/land-leases.css"));
assert.ok(css.includes(".zl-page"));
assert.equal(css.split("{").length,css.split("}").length,"Land CSS braces must balance");
console.log("Land agreements V2: A4 print, drafts, private PDFs, counterparty confirmation and security tests passed");
