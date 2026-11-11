"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

const src=fs.readFileSync("assets/zimba-intelligence.js","utf8");
const sql=fs.readFileSync("db/0021_intelligence_snapshot.sql","utf8");
const context={window:{},location:{hash:"#/workspace/intelligence"},URLSearchParams};
vm.runInNewContext(src,context,{filename:"zimba-intelligence.js"});
const logic=context.window.ZimbaIntelligence;
assert.equal(typeof logic.page,"function");
assert.equal(typeof logic.evaluateQuestion,"function");
assert.equal(typeof logic.recommendations,"function");
assert.ok(sql.includes("public.zimba_my_manager_org()"),"DB data must be organisation scoped");
assert.ok(sql.includes("p_property IS NOT NULL AND NOT EXISTS"),"Property scope must be checked");
assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.zimba_intelligence_snapshot(uuid) TO authenticated"));
assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.zimba_intelligence_snapshot(uuid) FROM PUBLIC, anonymous"));
assert.ok(sql.includes("LEFT JOIN LATERAL"),"Verify partial payments against evidence");
assert.ok(sql.includes("status<>'void'"),"Void invoices excluded");
assert.ok(sql.includes("readOnly',true"),"Read-only response is required");
assert.ok(!sql.includes("neon_auth.\"user\""),"No tenant contact PII should be returned");

const d={
  currency:"UGX",readOnly:true,verifiedPaymentsOnly:true,method:"transparent_rules_v1",asOf:"2026-11-11T06:00:00Z",
  summary:{units:4,occupiedUnits:2,vacantUnits:2,maintenanceUnits:0,pricedUnits:3,
    vacantMonthlyPotential:750000,invoiced:800000,verified:300000,outstanding:500000,
    overdue:250000,overdueCount:1,dueNext7Days:1,urgentMaintenance:1,
    openMaintenance:2,agedMaintenance:1,pastExpectedCompletion:0,
    expiredDocuments:1,expiringDocuments:1,registeredDocuments:2,reconciliationFlags:0},
  dataQuality:{invoiceCount:2,invoicePeriods:1,verifiedEvidenceEntries:1,forecastReady:false},
  overdueInvoices:[{reference:"ZINV-100",daysLate:17,remaining:250000,
    property:"The Grove",propertyId:"0a6c2900-0000-0000-0000-000000000000"}],
  maintenanceAttention:[{priority:"urgent",issue:"Roof leak",daysOpen:2,
    property:"The Grove",propertyId:"0a6c2900-0000-0000-0000-000000000000"}],
  documentDeadlines:[{title:"Fire safety inspection",daysUntil:-3,expiresOn:"2026-11-08",
    property:"The Grove",propertyId:"0a6c2900-0000-0000-0000-000000000000"}],
  properties:[{id:"0a6c2900-0000-0000-0000-000000000000",name:"The Grove",vacant:2,vacancyPotential:750000}]
};
const actions=logic.recommendations(d);
assert.ok(actions.length>=5);
assert.equal(actions[0].severity,"high");
assert.ok(actions.some(a=>a.kind==="Rent"&&a.severity==="high"));
assert.ok(actions.some(a=>a.kind==="Maintenance"&&a.severity==="high"));
assert.ok(actions.some(a=>a.kind==="Documents"&&a.severity==="high"));
assert.ok(actions.some(a=>a.kind==="Data quality"));
assert.ok(actions.every(x=>x.basis),"Every recommendation must explain its rule");

const rent=logic.evaluateQuestion("How much rent is overdue?",d);
assert.ok(rent.answer.includes("UGX 250,000"),"Verified arrears should be included");
assert.ok(rent.basis.includes("verified"));
const forecast=logic.evaluateQuestion("Can you predict next month?",d);
assert.ok(forecast.answer.toLowerCase().includes("cannot provide"),"No fake prediction allowed");
const docs=logic.evaluateQuestion("Which documents expire soon?",d);
assert.ok(docs.answer.includes("Fire safety inspection"),"Expiry alert context should be surfaced");
const maintenance=logic.evaluateQuestion("What repairs need attention?",d);
assert.ok(maintenance.answer.includes("1 are urgent"),"Urgent count should be surfaced");
const unsupported=logic.evaluateQuestion("Write to every tenant and transfer money",d);
assert.ok(unsupported.answer.includes("structured questions"));
const html=logic.page({properties:[{id:"123",name:'A <img src=x onerror=alert(1)> building'}]});
assert.ok(!html.includes('<img src=x onerror='),"Property names must be escaped");
assert.ok(html.includes("&lt;img"),"Property data should be HTML escaped");
assert.ok(!src.includes("apiKey"),"No AI keys in browser code");
assert.ok(!src.includes("fetch("),"No prompt exfiltration or third-party calls");
console.log("ZIMBA Intelligence deterministic security and rules tests passed");
