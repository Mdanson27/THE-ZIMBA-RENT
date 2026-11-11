"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict"),vm=require("node:vm");
const navigation=fs.readFileSync("assets/navigation-system.js","utf8");
const studio=fs.readFileSync("assets/ai-studio.js","utf8");
const workspace=fs.readFileSync("assets/workspace-v3.js","utf8");
const auth=fs.readFileSync("assets/auth.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const server=fs.readFileSync("api/intelligence.mjs","utf8");

const storage=new Map();
const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
const context={window:{ZimbaAuth:{state:{user:{id:"user-1"}}},matchMedia:()=>({matches:false})},localStorage,document:{querySelector:()=>null,querySelectorAll:()=>[]}};
vm.runInNewContext(navigation,context);
const nav=context.window.ZimbaNavigation;
assert.equal(nav.groupFor("home"),"overview");
assert.equal(nav.groupFor("properties"),"property");
assert.equal(nav.groupFor("building"),"property");
assert.equal(nav.groupFor("residents"),"property");
assert.equal(nav.groupFor("lease"),"finances");
assert.equal(nav.groupFor("maintenance"),"care");
assert.equal(nav.groupFor("enterprise"),"enterprise");
assert.equal(nav.groupFor("intelligence"),"intelligence");
assert.equal(nav.groupFor("security"),"account");
assert.equal(typeof nav.toggle,"function");

const links=[["home","Overview","layout-dashboard"],["properties","Properties","house"],["building","Building studio","building-2"],["residents","Residents","users-round"],["finance","Financials","wallet"],["intelligence","ZIMBA Intelligence","brain-circuit"]];
let output=nav.build(links,"finance");
assert.ok(output.includes("zv-nav-standalone"));
assert.ok(output.includes("data-zv-group=\"property\""));
assert.ok(output.includes("data-zv-group=\"finances\""));
assert.ok(output.includes("data-zv-group=\"intelligence\""));
assert.ok(output.includes("aria-current=\"page\""));
assert.ok(output.includes("aria-controls=\"zv-links-finances\""));
assert.ok(output.includes("aria-expanded=\"true\""));
assert.ok(output.includes("zv-section-links"));
assert.ok(output.includes("zv-nav-label"));
// V6 grouping: only the current category opens, even when a V4 profile had all groups expanded.
assert.equal((output.match(/data-expanded="true"/g)||[]).length,1,"Only the current group should open by default");
assert.ok(output.includes('data-zv-group="finances" data-expanded="true"'));
assert.ok(output.includes('data-zv-group="property" data-expanded="false"'));
assert.ok(!nav.initialCollapsed());
localStorage.setItem("zimba-nav-v4:user-1",JSON.stringify({collapsed:true,groups:{property:true,care:true,finances:true,intelligence:true,enterprise:true,account:true}}));
assert.equal(nav.initialCollapsed(),true,"Preserve compact mode from V4 preferences");
const tidy=nav.build(links,"finance");
assert.equal((tidy.match(/data-expanded="true"/g)||[]).length,1,"Migrate away from legacy multi-open sections");
assert.ok(tidy.includes('data-zv-group="property" data-expanded="false"'));
assert.ok(!output.includes("zv-nav-group"),"flat ungrouped headings should not appear");
const bad=nav.build([["properties",'<img src=x onerror=alert(1)>',"house"]],"properties");
assert.ok(!bad.includes("<img src=x"),"Navigation titles must be escaped");
assert.ok(bad.includes("&lt;img"));

assert.ok(workspace.includes('window.ZimbaNavigation.bind(section)'));
assert.ok(workspace.includes("window.ZimbaNavigation.initialCollapsed()"));
assert.ok(workspace.includes("window.ZimbaNavigation.build(nav,section)"));
assert.ok(workspace.includes("zv-sidebar-backdrop"));
assert.ok(workspace.includes("zv-sidebar-pin"));
assert.ok(workspace.includes('["home","Overview","layout-dashboard"]'));
assert.ok(workspace.includes('["intelligence","ZIMBA Intelligence"'));
assert.ok(html.includes("navigation-system.css"));
assert.ok(html.includes("navigation-system.js"));


// V5: iconography is semantic, safe, consistent and needs no external library.
assert.ok(nav.icon("layout-dashboard").includes("<svg"));
for(const key of ["house","panels-top-left","building-2","users-round","message-circle","wrench",
 "wallet","file-text","map-pinned","receipt-text","hand-coins","brain-circuit",
 "briefcase-business","bell","credit-card","shield-check","settings","store","log-out"]){
 const svg=nav.icon(key);
 assert.ok(svg.includes("stroke="),key+" must be a consistent stroke icon");
 assert.ok(svg.includes("<svg")&&svg.includes("</svg>"),key+" must be a complete vector icon");
 assert.ok(!svg.includes("<script"),key+" must not embed scripts");
}
assert.ok(nav.overlayMarkup().includes('id="zv-rail-flyout"'));
assert.ok(nav.overlayMarkup().includes('id="zv-rail-tooltip"'));
for(const group of ["property","care","finances","intelligence","enterprise","account"]){
 assert.ok(nav.meta[group]?.label&&nav.meta[group]?.description);
}
assert.ok(output.includes('data-zv-tooltip="Properties"'),"Links must have meaningful hover labels");
assert.ok(output.includes('data-zv-subtitle="View and manage your portfolio"'),"Links must explain their destination");
assert.ok(output.includes('data-zv-tooltip="Rent &amp; Finances"'),"Section headers need tooltips");
assert.ok(output.includes('zv-group-active'),"Active module needs a visible parent group");
assert.ok(workspace.includes('window.ZimbaNavigation.overlayMarkup()'),"Overlay must live outside the scrolling sidebar");
assert.ok(workspace.includes('window.ZimbaNavigation.icon("log-out")'),"Sign out icon must be semantic");
assert.ok(workspace.includes('window.ZimbaNavigation.icon("store")'),"Marketplace icon must be semantic");
assert.ok(workspace.includes('data-zv-tooltip="Your account"'),"Account rail needs a hover label");
const navCSS=fs.readFileSync("assets/navigation-system.css","utf8");
for(const rule of [".zv-nav-link.selected", ".zv-group-active", ".zv-rail-flyout", ".zv-rail-tooltip", ".zv-nav-standalone", ".zv-sidebar-collapsed", "prefers-reduced-motion", "max-width:800px"]){
 assert.ok(navCSS.includes(rule),"Navigation styling missing "+rule);
}
assert.equal(navCSS.split("{").length,navCSS.split("}").length,"Navigation CSS braces mismatch");
assert.ok(navCSS.includes("Navigation V6"),"Compact organisation refinements should load");
assert.ok(navCSS.includes("--zv-nav-wide:258px"),"Sidebar should be narrower and better balanced");
assert.ok(navCSS.includes("min-height:37px"),"Links should no longer be oversized");
assert.ok(navCSS.includes("min-height:31px"),"Section headings should be compact");
assert.ok(navCSS.includes("min-height:44px"),"Mobile links must preserve touch-friendly hit targets");
assert.ok(navCSS.includes("border-left:1px solid var(--zv-nav-rule)"),"Child links need a subtle grouped indent");

const studioContext={window:{},document:{querySelector:()=>null},navigator:{},console};
vm.runInNewContext(studio,studioContext);
const helper=studioContext.window.ZimbaAIStudio;
assert.equal(typeof helper.parseLocal,"function");
const doc=helper.parseLocal("Property insurance certificate\nReference: ABC-2026-20\nExpiry date: 2027-12-11\nPolicy applies to building.");
assert.equal(doc.category,"insurance");
assert.equal(doc.reference,"ABC-2026-20");
assert.equal(doc.expiresOn,"2027-12-11");
assert.equal(doc.confidence,"low");
assert.throws(()=>helper.parseLocal("short"));
const draft=helper.reminderText({reference:"RENT-100",due:"2026-10-05",property:"Block A",remaining:240000});
assert.ok(draft.includes("UGX 240,000"));
assert.ok(draft.includes("verify and reconcile"));
assert.ok(!/localStorage\.(?:setItem|getItem)/.test(studio));
assert.ok(!studio.includes("OPENAI_API_KEY"));
assert.ok(!studio.includes("api.openai.com"));
assert.ok(studio.includes("enterpriseDocumentRegister"));
assert.ok(studio.includes("navigator.clipboard.writeText"));
assert.ok(studio.includes("consent:true"));
assert.ok(studio.includes("not be uploaded or saved"));
assert.ok(html.includes("ai-studio.js"));
assert.ok(html.includes("ai-studio.css"));
assert.ok(auth.includes("async intelligenceSnapshot(property=null)"));

assert.ok(server.includes('import { createRemoteJWKSet,jwtVerify } from "jose"'));
assert.ok(server.includes("snapshot(identity.token,propertyId)"));
assert.ok(server.includes("rpc/zimba_intelligence_snapshot"));
assert.ok(server.includes("consent!==true"));
assert.ok(server.includes("store:false"));
assert.ok(server.includes("OPENAI_API_KEY"));
assert.ok(server.includes("MAX")||server.includes("LIMIT_JSON"));
assert.ok(server.includes("rate(identity.userId"));
assert.ok(server.includes("fileStored:false"));
assert.ok(server.includes("No metadata has been saved."));
assert.ok(!html.includes("sk-"));
assert.ok(!studio.includes("sk-"));
console.log("Zimba Phase 5B sidebar/AI/document/reminder static & unit checks passed");
