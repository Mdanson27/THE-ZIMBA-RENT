/* ZIMBA Phase 4A: verified enterprise operations. No client-side privilege decisions. */
(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG");
const date=v=>v?String(v).slice(0,10):"—";
const root=()=>document.querySelector("#zen-enterprise");
let generation=0,overview=null,active="overview",documents=[],audit=[],statement=null,statementId="";
const tabs=[["overview","Portfolio"],["team","Team & permissions"],["documents","Document register"],["statements","Owner statements"],["audit","Audit review"]];
const categories=["agreement","compliance","inspection","insurance","maintenance","finance","other"];
function page(){
 return '<section class="zen-page" id="zen-enterprise"><header class="zen-header"><div><span class="zen-kicker">ZIMBA / ENTERPRISE OPERATIONS</span><h1>Enterprise Centre</h1><p>One secure view of your portfolio, team, document references, and oversight.</p></div><button class="zen-btn" type="button" id="zen-refresh">Refresh centre</button></header><div class="zen-tabbar" role="tablist" aria-label="Enterprise sections">'+tabs.map(([key,label])=>'<button type="button" role="tab" data-zen-tab="'+key+'" aria-selected="'+(active===key)+'">'+esc(label)+'</button>').join("")+'</div><div id="zen-message" aria-live="polite"></div><div id="zen-content" role="tabpanel" tabindex="0"><div class="zen-loading">Checking your organisation access…</div></div></section>';
}
function message(text,bad=false){const e=root()?.querySelector("#zen-message");if(!e)return;e.className=bad?"zen-alert zen-alert-error":"zen-alert";e.textContent=text;}
function metric(label,value,note,currency=false){return '<article class="zen-metric"><span>'+esc(label)+'</span><strong>'+esc(currency?money(value):String(value??0))+'</strong><small>'+esc(note)+'</small></article>';}
function overviewHTML(){
 const d=overview||{},s=d.summary||{},props=d.properties||[];
 return '<div class="zen-hero"><div><span>YOUR VERIFIED ORGANISATION</span><h2>'+esc(d.organization||"Organisation")+'</h2><p>Signed in with '+esc(d.role||"manager")+' access · '+date(d.asOf)+'</p></div><span class="zen-status">Organisation scoped</span></div>'+
 '<div class="zen-metrics">'+metric("Managed properties",s.properties,"Non-archived portfolio")+
 metric("Total units",s.units,"Current room inventory")+metric("Occupied units",s.occupied,"According to unit status")+
 metric("Open maintenance",s.openMaintenance,"Requires follow-up")+metric("Verified rent",s.verifiedRent,"Capped to invoiced amounts",true)+
 metric("Outstanding rent",s.outstandingRent,"Invoiced minus verified evidence",true)+
 metric("Recorded expenses",s.recordedExpenses,"Recorded property expenditure",true)+metric("Active documents",s.registeredDocuments,"Metadata references only")+
 metric("Audit events",s.auditEvents,"Organisation activity log")+'</div>'+
 '<section class="zen-card"><h3>Property operations</h3><p class="zen-muted">Open a property workspace or select a statement to inspect reconciled records.</p>'+
 (props.length?'<div class="zen-properties">'+props.map(p=>'<article><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.city||"Location not specified")+' · '+Number(p.occupied||0)+' / '+Number(p.units||0)+' occupied · '+Number(p.openMaintenance||0)+' open repairs</small></div><div class="zen-actions"><a class="zen-btn zen-btn-quiet" href="#/workspace/property?property='+encodeURIComponent(p.id)+'">Open property</a><button type="button" class="zen-btn zen-btn-quiet" data-zen-statement="'+esc(p.id)+'">Statement</button></div></article>').join("")+'</div>':'<p class="zen-empty">No managed properties have been recorded yet.</p>')+
 (Number(s.properties)>props.length?'<p class="zen-muted">Showing the first '+props.length+' properties. Organisation totals include all properties.</p>':'')+
 '</section><p class="zen-disclaimer">Financial metrics come from recorded invoices, verified payment evidence and expenses. Security deposits are excluded from rent. These figures are not audited financial statements.</p>';
}
function teamHTML(){
 const d=overview||{},members=d.team||[];
 return '<section class="zen-card"><h3>Staff directory and current access</h3><p class="zen-muted">These are existing organisation memberships, not invitations or new staff accounts. Access rights are enforced by the database, not by the labels on this screen.</p>'+
 (members.length?'<div class="zen-tablewrap" tabindex="0"><table><thead><tr><th>Team member</th><th>Email</th><th>Membership</th><th>Status</th></tr></thead><tbody>'+members.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.email)+'</td><td><span class="zen-chip">'+esc(x.role)+'</span></td><td>'+esc(x.status)+'</td></tr>').join("")+'</tbody></table></div>':'<p class="zen-empty">No organisation memberships found.</p>')+
 '<div class="zen-note"><b>Permission boundaries</b><p>Owner and administrators can archive document register entries. Managers can register references and review authorised financial and operational records. Adding or revoking staff logins, assigning departmental roles, and separate external-owner access are not enabled in this release.</p></div></section>';
}
function documentHTML(){
 const d=overview||{},props=d.properties||[],canArchive=d.permissions?.archiveDocuments===true;
 return '<div class="zen-columns"><section class="zen-card"><h3>Register a document</h3><p class="zen-muted">Record an agreement, policy, certificate, inspection or financial document reference for a property.</p>'+
 '<form id="zen-document-form" class="zen-form"><label>Property<select name="property" required>'+props.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("")+'</select></label>'+
 '<label>Document title<input name="title" maxlength="180" minlength="3" placeholder="e.g. Insurance certificate — 2026" required></label>'+
 '<label>Category<select name="category">'+categories.map(x=>'<option value="'+x+'">'+x.charAt(0).toUpperCase()+x.slice(1)+'</option>').join("")+'</select></label>'+
 '<label>Reference (optional)<input name="reference" maxlength="120" placeholder="Policy / contract / certificate number"></label>'+
 '<label>Expiry date (optional)<input name="expires" type="date"></label>'+
 '<label>Notes (optional)<textarea name="notes" maxlength="1000" rows="3" placeholder="Where the original file is securely held, or follow-up notes"></textarea></label>'+
 '<button class="zen-btn zen-btn-primary" type="submit" '+(!props.length?"disabled":"")+'>Register reference</button></form>'+
 '<p class="zen-disclaimer">This is a secure metadata register. Actual PDF/image uploading, file preview and downloading are not yet available. Do not paste confidential document contents into notes.</p></section>'+
 '<section class="zen-card"><div class="zen-card-title"><div><h3>Document register</h3><p class="zen-muted">Active entries only · latest 300</p></div><button type="button" class="zen-btn" id="zen-doc-refresh">Refresh</button></div>'+
 '<div id="zen-document-list">'+(documents.length?documents.map(x=>'<article class="zen-document"><div><b>'+esc(x.title)+'</b><small>'+esc(x.property)+' · '+esc(x.category)+' · '+(x.reference?'Ref: '+esc(x.reference):'No reference')+'</small><small>Expires: '+date(x.expiresOn)+' · Registered '+date(x.createdAt)+'</small>'+(x.notes?'<p>'+esc(x.notes)+'</p>':'')+'</div>'+(canArchive?'<button type="button" class="zen-btn zen-btn-quiet" data-zen-archive="'+esc(x.id)+'">Archive</button>':'')+'</article>').join(""):'<p class="zen-empty">No document references registered.</p>')+'</div></section></div>';
}
function auditHTML(){
 return '<section class="zen-card"><div class="zen-card-title"><div><h3>Organisation audit review</h3><p class="zen-muted">Read-only activity already recorded by the security audit system.</p></div><button type="button" class="zen-btn" id="zen-audit-refresh">Refresh</button></div>'+
 (audit.length?'<div class="zen-tablewrap" tabindex="0"><table><thead><tr><th>Date</th><th>Action</th><th>Resource</th></tr></thead><tbody>'+audit.map(e=>'<tr><td>'+date(e.at)+'</td><td>'+esc(String(e.action||"").replaceAll("_"," "))+'</td><td>'+esc(e.resource||"—")+'</td></tr>').join("")+'</tbody></table></div>':'<p class="zen-empty">No audit events currently available.</p>')+
 '<p class="zen-disclaimer">Audit history is organisation-scoped. Entries are not editable here. For detailed operational security review, open <a href="#/workspace/security">Security & activity</a>.</p></section>';
}
function csvCell(value){let s=String(value??"");if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function exportStatement(report){
 const p=(overview?.properties||[]).find(x=>x.id===statementId);
 const rows=[["ZIMBA — Property statement",p?.name||""],["As of",report.asOf],["Metric","UGX"],["Verified rent",report.summary?.totalVerified||0],["Invoiced rent",report.summary?.totalInvoiced||0],["Outstanding rent",report.summary?.outstanding||0],["Recorded expenses",report.summary?.recordedExpenses||0],["Refundable deposits held",report.summary?.depositHeld||0],[],["Invoice","Due","Invoiced UGX","Verified UGX","Balance UGX","Status"]];
 (report.invoices||[]).forEach(x=>rows.push([x.reference,x.due,x.invoiced,x.verifiedPaid,x.remaining,x.status]));
 rows.push([],["Expense date","Category","Description","UGX"]);
 (report.expenses||[]).forEach(x=>rows.push([x.date,x.category,x.description,x.amount]));
 rows.push([],["Disclaimer","Unreviewed operating figures. Verified payment evidence only. Not an audited statement."]);
 const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="zimba-property-statement-"+date(report.asOf)+".csv";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function statementHTML(){
 const props=overview?.properties||[],p=props.find(x=>x.id===statementId)||props[0];
 const s=statement?.summary||{};
 return '<section class="zen-card"><h3>Property statement</h3><p class="zen-muted">For owners and managers: view recorded financial obligations, verified rent and property expenses.</p>'+
 '<label class="zen-statement-filter">Select property<select id="zen-property-statement">'+props.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===(p?.id||"")?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
 (statement&&p?'<div class="zen-metrics">'+metric("Verified rent",s.totalVerified,"Capped to invoiced amount",true)+metric("Rent outstanding",s.outstanding,"Unpaid, non-void invoices",true)+metric("Overdue rent",s.overdue,"Due before today",true)+metric("Recorded expenses",s.recordedExpenses,"Property expenditure",true)+metric("Refundable deposits",s.depositHeld,"Tenant liability, not income",true)+metric("Total invoiced",s.totalInvoiced,"Non-void invoices",true)+'</div>'+
 '<button class="zen-btn" id="zen-export-statement" type="button">Export statement CSV</button>'+
 '<div class="zen-tablewrap" tabindex="0"><table><thead><tr><th>Invoice</th><th>Due</th><th>Invoiced</th><th>Verified</th><th>Outstanding</th></tr></thead><tbody>'+
 (statement.invoices||[]).map(x=>'<tr><td>'+esc(x.reference)+'</td><td>'+date(x.due)+'</td><td>'+money(x.invoiced)+'</td><td>'+money(x.verifiedPaid)+'</td><td>'+money(x.remaining)+'</td></tr>').join("")+
 '</tbody></table></div><p class="zen-disclaimer">Historical, all-time totals. These are neither date-filtered owner distributions nor audited profit statements. No funds can be transferred from this screen.</p>':
 '<p class="zen-empty">'+(p?"Select a property to load its financial statement.":"No property available for a statement.")+'</p>')+'</section>';
}
function render(){
 const r=root(),host=r?.querySelector("#zen-content");if(!host||!overview)return;
 r.querySelectorAll("[data-zen-tab]").forEach(el=>{el.setAttribute("aria-selected",String(el.dataset.zenTab===active));el.tabIndex=el.dataset.zenTab===active?0:-1;});
 host.innerHTML=active==="overview"?overviewHTML():active==="team"?teamHTML():active==="documents"?documentHTML():active==="statements"?statementHTML():auditHTML();
 host.querySelectorAll("[data-zen-statement]").forEach(btn=>btn.onclick=()=>{statementId=btn.dataset.zenStatement;statement=null;active="statements";render();loadStatement();});
 host.querySelector("#zen-document-form")?.addEventListener("submit",saveDocument);
 host.querySelector("#zen-doc-refresh")?.addEventListener("click",loadDocuments);
 host.querySelectorAll("[data-zen-archive]").forEach(btn=>btn.onclick=()=>archiveDocument(btn.dataset.zenArchive));
 host.querySelector("#zen-audit-refresh")?.addEventListener("click",loadAudit);
 host.querySelector("#zen-property-statement")?.addEventListener("change",e=>{statementId=e.target.value;statement=null;render();loadStatement();});
 host.querySelector("#zen-export-statement")?.addEventListener("click",()=>{if(statement)exportStatement(statement);});
 window.ZimbaPrivacy?.refresh();
}
async function loadOverview(){
 const seq=++generation,r=root(),host=r?.querySelector("#zen-content");if(!host)return;
 if(!overview)host.innerHTML='<div class="zen-loading" role="status">Loading your secure enterprise workspace…</div>';
 try{
  const d=await window.ZimbaAuth.enterpriseOverview();
  if(seq!==generation||!r.isConnected)return;
  if(!d||d.currency!=="UGX"||!["owner","admin","manager"].includes(d.role))throw Error("Invalid organisation response");
  overview=d;
  const ids=(d.properties||[]).map(x=>x.id);
  if(!ids.includes(statementId)){statementId=ids[0]||"";statement=null;}
  render();
  if(active==="documents")loadDocuments();else if(active==="audit")loadAudit();else if(active==="statements")loadStatement();
 }catch(err){if(seq!==generation||!r.isConnected)return;if(overview){message("Unable to refresh: "+err.message,true);return;}host.innerHTML='<div class="zen-error" role="alert"><b>Enterprise Centre unavailable</b><p>'+esc(err.message)+'</p><button type="button" class="zen-btn" id="zen-retry">Retry secure connection</button></div>';host.querySelector("#zen-retry").onclick=loadOverview;}
}
async function loadDocuments(){
 const r=root(),seq=generation;if(!r||!overview)return;
 try{
  const result=await window.ZimbaAuth.enterpriseDocuments();
  if(!r.isConnected||seq!==generation||active!=="documents")return;
  documents=Array.isArray(result?.documents)?result.documents:[];
  render();
 }catch(err){if(r.isConnected&&seq===generation)message("Unable to load document register: "+err.message,true);}
}
async function saveDocument(event){
 event.preventDefault();const form=event.currentTarget,btn=form.querySelector("[type=submit]"),v=new FormData(form);btn.disabled=true;message("Saving document metadata securely…");
 try{
  await window.ZimbaAuth.enterpriseDocumentRegister({property:v.get("property"),title:v.get("title"),category:v.get("category"),reference:v.get("reference"),expires:v.get("expires"),notes:v.get("notes")});
  message("Document reference registered. No file was uploaded.");
  await loadDocuments();await loadOverview();
 }catch(err){message("Registration failed: "+err.message,true);btn.disabled=false;}
}
async function archiveDocument(id){
 const reason=window.prompt("Reason for archiving this register entry (8–500 characters):");
 if(reason===null)return;
 if(reason.trim().length<8||reason.length>500){message("Please provide an archive reason of 8–500 characters.",true);return;}
 if(!window.confirm("Archive this document reference? This does not delete any original file."))return;
 try{await window.ZimbaAuth.enterpriseDocumentArchive(id,reason.trim());message("Reference archived with a recorded audit event.");await loadDocuments();await loadOverview();}
 catch(err){message("Unable to archive document reference: "+err.message,true);}
}
async function loadAudit(){
 const r=root(),seq=generation;if(!r||!overview)return;
 try{const result=await window.ZimbaAuth.managerSecurityAudit(60);
 if(!r.isConnected||seq!==generation||active!=="audit")return;
 audit=Array.isArray(result)?result:(result?.events||[]);render();}
 catch(err){if(r.isConnected&&seq===generation)message("Unable to load audit trail: "+err.message,true);}
}
async function loadStatement(){
 const r=root(),seq=generation,id=statementId;if(!r||!overview||!id)return;
 const host=r.querySelector("#zen-content");if(host)host.insertAdjacentHTML("beforeend",'<p class="zen-loading" id="zen-statement-loading" role="status">Loading reconciled property records…</p>');
 try{const data=await window.ZimbaAuth.propertyFinancialReport(id);
 if(!r.isConnected||seq!==generation||id!==statementId||active!=="statements")return;
 if(!data||data.currency!=="UGX"||data.verifiedPaymentsOnly!==true)throw Error("Invalid financial records");
 statement=data;render();}
 catch(err){if(r.isConnected&&seq===generation)message("Unable to load statement: "+err.message,true);}
 finally{r.querySelector("#zen-statement-loading")?.remove();}
}
function bind(){
 const r=root();if(!r)return;
 overview=null;documents=[];audit=[];statement=null;statementId="";active="overview";
 r.querySelectorAll("[data-zen-tab]").forEach(el=>el.addEventListener("click",()=>{active=el.dataset.zenTab;message("");render();if(active==="documents")loadDocuments();else if(active==="audit")loadAudit();else if(active==="statements")loadStatement();}));
 r.querySelector("#zen-refresh")?.addEventListener("click",loadOverview);
 loadOverview();
}
window.ZimbaEnterprise={page,bind};
})();