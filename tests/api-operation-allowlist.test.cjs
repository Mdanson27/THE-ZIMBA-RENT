"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const auth=fs.readFileSync("assets/auth.js","utf8");
const contracts=fs.readFileSync("assets/rental-contracts.js","utf8");
const invoices=fs.readFileSync("assets/invoice-studio.js","utf8");

const guardStart=auth.indexOf('if(!["my_subscription"');
const guardEnd=auth.indexOf('].includes(name)) throw new Error("Unsupported API operation")',guardStart);
assert.ok(guardStart>=0&&guardEnd>guardStart,"Explicit API operation allowlist is missing");
const allowlist=auth.slice(guardStart,guardEnd);
const used=[...new Set([...auth.matchAll(/api\.rpc\("([^"]+)"/g)].map(x=>x[1]))];
const missing=used.filter(name=>!allowlist.includes('"'+name+'"'));
assert.deepEqual(missing,[],"All auth client methods must be allowed to reach Neon");
for(const name of [
 "zimba_manager_lease_contracts","zimba_tenant_lease_contracts",
 "zimba_rent_integrity","zimba_manager_propose_rent_correction",
 "zimba_tenant_answer_rent_correction"
])assert.ok(allowlist.includes('"'+name+'"'),"Missing rental agreement/tenant amendment RPC: "+name);
for(const name of ["zimba_rent_integrity","zimba_manager_lease_contracts","zimba_tenant_lease_contracts"]){
 assert.ok(auth.includes('"'+name+'"'),"Required secure reader is absent");
}
const readStart=auth.indexOf("const readOnly=new Set([");
const readEnd=auth.indexOf("]).has(name);",readStart);
assert.ok(readStart>=0&&readEnd>readStart);
const reads=auth.slice(readStart,readEnd);
assert.ok(reads.includes('"zimba_rent_integrity"'),"Rent integrity must retain read-only safe retries");
assert.ok(!reads.includes('"zimba_manager_propose_rent_correction"'),"Never retry manager amendments as read-only");
assert.ok(!reads.includes('"zimba_tenant_answer_rent_correction"'),"Never replay tenant consent");
assert.ok(contracts.includes("api().rentIntegrity(manager?"),"Rental agreement load must check correct rent");
assert.ok(contracts.includes("manager?api().managerLeaseContracts():api().tenantLeaseContracts()"));
assert.ok(invoices.includes('auth().rentIntegrity(manager?"manager":"tenant")'));
assert.ok(auth.includes('throw new Error("Unsupported API operation")'),"Keep unknown operations rejected");
console.log("API allowlist: all "+used.length+" exported RPC calls are supported; sensitive writes cannot auto-retry; agreement/invoice route safeguarded.");
