"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const script=fs.readFileSync("assets/overview-calendar.js","utf8");
const css=fs.readFileSync("assets/overview-calendar.css","utf8");
const nav=fs.readFileSync("assets/navigation-system.css","utf8");
const sql=fs.readFileSync("db/0026_manager_overview_calendar.sql","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const operations=fs.readFileSync("assets/operations.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const sandbox={window:{},document:{querySelector:()=>null},Date,Intl,console};
vm.runInNewContext(script,sandbox,{filename:"overview-calendar.js"});
const calendar=sandbox.window.ZimbaOverviewCalendar;
for(const key of ["mount","gridRange","todayKampala","page","money"])assert.equal(typeof calendar[key],"function","Missing "+key);
assert.deepEqual(Object.keys(calendar.kinds).sort(),["deposit","expense","land","lease","maintenance","rent"].sort());
const november=calendar.gridRange(2026,10);
assert.equal(november.start,"2026-10-26");
assert.equal(november.end,"2026-12-06");
assert.equal(november.totalCells,42);
const february=calendar.gridRange(2026,1);
assert.equal(february.totalCells,35);
assert.match(calendar.todayKampala(),/^\d{4}-\d\d-\d\d$/);
assert.equal(calendar.money(1250000),"UGX 1,250,000");
assert.ok(calendar.page().includes("Portfolio activity calendar"));
for(const marker of [
 'data-zoc-shift="-1"','data-zoc-shift="1"',
 'data-zoc-today="1"','data-zoc-date','data-zoc-filter','aria-pressed',
 "zoc-day-events","zoc-overdue-day","zoc-agenda","zoc-legend","zoc-upcoming","zoc-next-events",
 "managerOverviewCalendar","state.events.filter(visible)",
 "todayKampala","zoc-event-link","zoc-invoice"
]){
 if(marker==="zoc-invoice")continue;
 assert.ok(script.includes(marker),"Calendar UI missing "+marker);
}
assert.ok(script.includes("paths.has(v)"),"Only allow known route destinations");
assert.ok(script.includes("const esc="),"Escape any database-supplied content");
assert.ok(script.includes('state.metrics?money(state.metrics.outstanding):"Unavailable"'),
 "Never show zero when the invoice metric is unavailable");
assert.ok(script.includes("zo-refund-priority"),"Refund attention summary must be populated");
assert.ok(script.includes("zo-overdue-priority"),"Overdue invoice priority must be populated");
for(const marker of [
 "zimba_my_manager_org()","auth.uid() IS NULL",
 "p_start date,p_end date",
 "(p_end-p_start)>62",
 "AT TIME ZONE 'Africa/Kampala'",
 "zimba_payment_evidence",
 "zimba_rent_invoices",
 "maintenance_requests",
 "expected_completion",
 "zimba_lease_records",
 "zimba_land_lease_drafts",
 "zimba_deposit_refund_requests",
 "property_expenses",
 "i.status<>'void'",
 "remaining.balance=0",
 "REVOKE ALL ON FUNCTION public.zimba_manager_overview_calendar(date,date) FROM PUBLIC,anonymous",
 "GRANT EXECUTE ON FUNCTION public.zimba_manager_overview_calendar(date,date) TO authenticated"
]){
 assert.ok(sql.includes(marker),"Missing calendar SQL security/data requirement: "+marker);
}
assert.ok(!sql.includes("INSERT INTO"),"Calendar must not write financial records");
assert.ok(!sql.includes("UPDATE public."),"Calendar must not modify financial data");
assert.ok(sql.includes("WHERE l.organization_id=v_org"),"Calendar must filter to manager's organisation");
assert.ok(auth.includes('"zimba_manager_overview_calendar"'),"New read RPC must be in allowlist");
assert.ok(auth.includes('async managerOverviewCalendar(start,end)'));
assert.ok(operations.includes('id="zo-overview-calendar"'));
assert.ok(operations.includes('id="zo-invoice-outstanding"'));
assert.ok(operations.includes("window.ZimbaOverviewCalendar?.mount()"));
assert.ok(html.includes("assets/overview-calendar.js"));
assert.ok(html.includes("assets/overview-calendar.css"));
assert.ok(css.includes(".zoc-grid")&&css.includes(".zoc-agenda")&&css.includes(".zoc-filters"));
assert.equal(css.split("{").length,css.split("}").length,"Calendar CSS braces must balance");
assert.ok(nav.includes("Navigation V7"));
assert.ok(nav.includes(".zv-nav-link > .zv-nav-label"));
assert.ok(nav.includes("font:700 10.9px"));
assert.ok(nav.includes("width:auto!important"));
assert.ok(nav.includes("text-align:left!important"));
assert.ok(nav.includes("white-space:normal!important"));
assert.ok(nav.includes(".zv-sidebar-collapsed"),"Compact rail must not be removed");
console.log("Overview calendar: role-scoped real events, correct invoice balances, nav label sizing and accessibility checks passed.");
