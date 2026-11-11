/* Zimba operational workspace — live, organisation-scoped Neon workflows */
(()=>{
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG");
const num=v=>Number(v||0).toLocaleString("en-UG");
const dt=v=>v?new Date(v).toLocaleDateString("en-UG",{day:"numeric",month:"short",year:"numeric"}):"—";
const auth=()=>window.ZimbaAuth;
let version=0;
function shell(section){
 const titles={home:["Your portfolio, clearly.","A complete overview of what matters today."],maintenance:["Maintenance centre","Keep every repair visible, assigned and progressing."],finance:["Finance & reports","Accurate records and clearer financial decisions."],settings:["Workspace settings","Shape Zimba around how your organisation works."]};
 const t=titles[section]||titles.home;
 return '<div class="zo-page"><div class="zo-head"><div><span class="zo-eyebrow">ZIMBA · YOUR MANAGEMENT SPACE</span><h1>'+t[0]+'</h1><p>'+t[1]+'</p></div><button class="zo-btn secondary" id="zo-reload" type="button">↻ Refresh</button></div><div id="zo-body"><div class="zo-loading"><span class="zo-spinner"></span><strong>Loading your secure records…</strong></div></div></div>';
}
function notice(text){return '<div class="zo-notice"><span>ⓘ</span><p>'+text+'</p></div>'}
function card(ico,label,value,desc){return '<article class="zo-card"><span class="zo-card-icon">'+ico+'</span><strong>'+value+'</strong><b>'+label+'</b><small>'+desc+'</small></article>'}
function panel(title,body,extra=""){return '<section class="zo-panel"><div class="zo-panel-title"><h2>'+title+'</h2><span>'+extra+'</span></div>'+body+'</section>'}
function statNote(msg){return '<p class="zo-muted">'+msg+'</p>'}
function feedback(msg,bad=false){const el=$("#zo-feedback");if(el){el.textContent=msg;el.className="zo-feedback "+(bad?"error":"success");el.hidden=false}}
async function fail(err){
 const handled=await auth()?.recover?.(err);
 if(handled)return;
 const b=$("#zo-body");if(!b)return;
 b.innerHTML='<div class="zo-error"><h2>This feature could not load</h2><p>'+esc(err.message||"Service unavailable")+'</p><p>You are still signed in. Your portfolio and other areas remain accessible.</p><button id="zo-try-again" class="zo-btn">Check again ↗</button></div>';
 $("#zo-try-again").onclick=()=>$("#zo-reload")?.click();
}
function overview(data,record){
 const identity=window.ZimbaAuth?.state?.user;
 const preferredName=String(identity?.name||identity?.email?.split("@")[0]||"there").trim().split(/\s+/)[0];
 const greetingName=preferredName.charAt(0).toUpperCase()+preferredName.slice(1);
 const recent=data.latestMaintenance||[];
 const plan=String(record.plan||"free").toUpperCase();
 return '<div class="zo-hero"><div><span class="zo-eyebrow">PORTFOLIO PULSE · '+plan+'</span><h2>Welcome back, '+esc(greetingName)+'.</h2><p>'+esc(data.organization||"Your organisation")+' · Live records from Neon</p><a href="#/workspace/properties" class="zo-btn light">Explore your properties ↗</a></div><div class="zo-hero-art">⌂</div></div>'+
 '<div class="zo-cards">'+card("⌂","Properties",num(data.properties),"Managed portfolio","properties")+
 card("⚒","Open maintenance",num(data.maintenanceOpen),"Issues requiring attention","maintenance")+
 card("♙","Connected residents",num(data.residents),"Verified property connections","residents")+
 card("▤","Rent receivables",money(data.rentDue),"Charges due or partially paid","receivables")+'</div>'+
 '<div class="zo-two">'+panel("Operational priorities",'<div class="zo-priority"><div><span class="zo-priority-dot"></span><strong>'+num(data.maintenanceUrgent)+' urgent maintenance cases</strong><a href="#/workspace/maintenance">Review ↗</a></div><div><span class="zo-priority-dot calm"></span><strong>'+num(data.properties)+' properties on record</strong><a href="#/workspace/properties">View ↗</a></div><div><span class="zo-priority-dot calm"></span><strong>'+money(data.recordedExpenses)+' recorded expenses</strong><a href="#/workspace/finance">Open ↗</a></div></div>','YOUR NEXT ACTIONS','priorities')+
 panel("Recent maintenance",recent.length?'<div class="zo-activity">'+recent.map(x=>'<article><strong>'+esc(x.issue)+'</strong><small>'+esc(x.property)+' · '+esc(x.priority)+' · '+esc(x.status.replaceAll("_"," "))+'</small></article>').join("")+'</div>':statNote("No maintenance cases recorded yet."),"LIVE ACTIVITY","recent")+'</div>'+
 panel("Quick actions",'<div class="zo-quick-actions"><a href="#/workspace/properties">Manage properties ↗</a><a href="#/workspace/building">Configure rooms ↗</a><a href="#/workspace/residents">Manage residents ↗</a><a href="#/workspace/lease">Rental agreements ↗</a><a href="#/workspace/invoices">Issue invoices ↗</a><a href="#/workspace/maintenance">Track repairs ↗</a></div>','MANAGE YOUR PROPERTY')+
 notice("The figures above come from your authenticated organisation records. Financial receivables are not proof of payment received.");
}
function maintenance(data,record){
 const props=(record.properties||[]).filter(x=>x.id);
 return '<div class="zo-cards compact">'+card("⚒","Total requests",num(data.length),"All request statuses")+
 card("◉","Open",num(data.filter(x=>x.status==="open").length),"Awaiting attention")+
 card("◷","In progress",num(data.filter(x=>x.status==="in_progress").length),"Work being handled")+
 card("✓","Completed",num(data.filter(x=>x.status==="completed").length),"Resolved records")+'</div>'+
 '<div class="zo-two"><section class="zo-panel"><div class="zo-panel-title"><h2>New maintenance request</h2><span>CREATE RECORD</span></div><form id="zo-create-maintenance" class="zo-form"><label>Property<select name="property" required>'+props.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("")+'</select></label><label>Issue description<textarea name="issue" required minlength="8" maxlength="1200" rows="4" placeholder="Describe what needs attention…"></textarea></label><label>Priority<select name="priority"><option value="medium">Medium</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><button class="zo-btn" type="submit" '+(props.length?"":"disabled")+'>Create request ↗</button></form><div id="zo-feedback" hidden></div></section>'+
 panel("Maintenance workflow",'<div class="zo-steps"><p><strong>01 · Open</strong><span>Record the issue and its priority</span></p><p><strong>02 · In progress</strong><span>Track what is being done</span></p><p><strong>03 · Completed</strong><span>Close the request when resolved</span></p></div>',"WORKFLOW")+'</div>'+
 panel("Repair progress & updates",data.length?'<div class="zo-repair-list">'+data.map(x=>'<article class="zo-repair-card"><div class="zo-repair-intro"><div><strong>'+esc(x.issue)+'</strong><small>'+esc(x.property)+' · '+esc(x.priority)+' · '+dt(x.date)+'</small></div><span>'+esc(x.status.replaceAll("_"," "))+'</span></div><div class="zo-repair-progress"><span style="width:'+Number(x.progress||0)+'%"></span></div><small>'+Number(x.progress||0)+'% complete'+(x.eta?' · Expected '+dt(x.eta):'')+'</small><form class="zo-progress-form" data-zo-progress="'+esc(x.id)+'"><label>Status<select name="status">'+["open","in_progress","completed","cancelled"].map(s=>'<option value="'+s+'" '+(s===x.status?'selected':'')+'>'+s.replaceAll("_"," ")+'</option>').join("")+'</select></label><label>Progress (%)<input type="number" name="progress" min="0" max="100" required value="'+Number(x.progress||0)+'"></label><label>Expected completion<input name="eta" type="date" value="'+esc(x.eta||"")+'"></label><label class="zo-note-input">Update for tenant<textarea name="note" rows="2" maxlength="1000" minlength="3" required placeholder="Describe the work completed or next steps"></textarea></label><button type="submit" class="zo-btn">Post progress update ↗</button><div role="status" class="zo-progress-error"></div></form></article>').join("")+'</div>':statNote("No requests yet. Create the first one above."),"LIVE REPAIR TRACKING");
}
function financial(data,record){
 const expenses=data.expenses||[],charges=data.charges||[],props=(record.properties||[]).filter(x=>x.id);
 return '<div class="zo-cards compact">'+card("▤","Rent receivables",money(data.receivables),"Unpaid or partial charges")+
 card("↗","Recorded expenses",money(data.recordedExpenses),"Manual expense records")+
 card("▣","Rent charges",num(charges.length),"Recent charge entries")+
 card("◌","Expense entries",num(expenses.length),"Recent expense entries")+'</div>'+
 '<div class="zo-two"><section class="zo-panel"><div class="zo-panel-title"><h2>Record an expense</h2><span>ORGANISATION LEDGER</span></div><form id="zo-record-expense" class="zo-form"><label>Description<input name="description" maxlength="300" minlength="4" required placeholder="e.g. Plumbing repair invoice"></label><div class="zo-inline"><label>Amount in UGX<input name="amount" type="number" min="1" max="100000000000" step="1" required placeholder="250000"></label><label>Category<select name="category"><option value="maintenance">Maintenance</option><option value="utilities">Utilities</option><option value="taxes">Taxes</option><option value="management">Management</option><option value="other">Other</option></select></label></div><label>Property (optional)<select name="property"><option value="">Organisation-wide</option>'+props.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("")+'</select></label><button class="zo-btn" type="submit">Save expense ↗</button></form><div id="zo-feedback" hidden></div></section>'+
 panel("Finance integrity",'<div class="zo-steps"><p><strong>Charges</strong><span>Shown from your Neon rent-charge ledger</span></p><p><strong>Expenses</strong><span>Organisation-specific entries recorded by users</span></p><p><strong>Payments</strong><span>No payment collection or bank reconciliation is activated</span></p></div>',"ACCOUNTING RULES")+'</div>'+
 panel("Expense history",expenses.length?'<div class="zo-table-wrap"><table class="zo-table"><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Property</th><th>UGX</th></tr></thead><tbody>'+expenses.map(x=>'<tr><td>'+dt(x.date)+'</td><td><strong>'+esc(x.description)+'</strong></td><td>'+esc(x.category)+'</td><td>'+esc(x.property||"Organisation")+'</td><td>'+money(x.amount)+'</td></tr>').join("")+'</tbody></table></div>':statNote("No expenses recorded yet."),"LIVE RECORDS")+
 panel("Rent charge register",charges.length?'<div class="zo-table-wrap"><table class="zo-table"><thead><tr><th>Due date</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>'+charges.map(x=>'<tr><td>'+dt(x.date)+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.status)+'</td><td>'+esc(x.reference||"—")+'</td></tr>').join("")+'</tbody></table></div>':statNote("No lease-linked rent charges exist yet."),"READ-ONLY")+
 notice("Recorded expenses are bookkeeping entries, not verified bank payments. Rent balances are derived from existing charges; no payment gateway has been connected.");
}
function settings(data){
 const n=data.notifications||{maintenance:true,financial:true,property:true};
 return '<div class="zo-two"><section class="zo-panel"><div class="zo-panel-title"><h2>Organisation and preferences</h2><span>ACCOUNT SETTINGS</span></div><form class="zo-form" id="zo-settings-form"><label>Organisation name<input name="organization" required minlength="2" maxlength="100" value="'+esc(data.organization||"")+'"></label><label>Preferred location<input name="area" maxlength="120" placeholder="e.g. Kampala" value="'+esc(data.area||"")+'"></label><label>Account email<input value="'+esc(data.email||"")+'" disabled></label><div class="zo-settings-options"><strong>Notification preferences</strong><label><input type="checkbox" name="maintenance" '+(n.maintenance?"checked":"")+'> Maintenance updates</label><label><input type="checkbox" name="financial" '+(n.financial?"checked":"")+'> Financial updates</label><label><input type="checkbox" name="property" '+(n.property?"checked":"")+'> Property updates</label></div><button class="zo-btn" type="submit">Save settings ↗</button></form><div id="zo-feedback" hidden></div></section>'+
 panel("Identity and privacy",'<div class="zo-steps"><p><strong>Verified email</strong><span>'+esc(data.email)+'</span></p><p><strong>Account role</strong><span>'+esc(data.role||"Property manager")+'</span></p><p><strong>Organisation created</strong><span>'+dt(data.createdAt)+'</span></p></div><div class="zo-settings-cta"><button class="zo-btn secondary" type="button" data-legal-open="terms">Read Terms of Use</button><button class="zo-btn secondary" type="button" data-legal-open="privacy">Privacy Policy</button></div>',"ACCOUNT SAFETY")+'</div>'+
 notice("Changes are saved to your account or organisation in Neon. Email and administrator privileges cannot be changed from this screen.");
}
function activate(section,record){
 const host=$("#zo-body"),id=++version;
 const map={home:()=>auth().managerOverview(),maintenance:()=>auth().managerMaintenanceList(),finance:()=>auth().financials(),settings:()=>auth().settings()};
 const loader=map[section]||map.home;
 loader().then(data=>{
  if(id!==version||!host.isConnected)return;
  host.innerHTML=section==="home"?overview(data,record):section==="maintenance"?maintenance(data,record):section==="finance"?financial(data,record):settings(data);
  if(section==="home")window.ZimbaDashboard?.activate();
  if(section==="maintenance")bindMaintenance(record);
  if(section==="finance")bindFinancial(record);
  if(section==="settings")bindSettings(record);
 }).catch(fail);
 $("#zo-reload")?.addEventListener("click",()=>{host.innerHTML='<div class="zo-loading">Refreshing records…</div>';activate(section,record)});
}
function bindMaintenance(record){
 $("#zo-create-maintenance")?.addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector("[type=submit]");button.disabled=true;
  try{await auth().createMaintenance(f.get("property"),f.get("issue"),f.get("priority"));activate("maintenance",record)}
  catch(err){feedback(err.message,true);button.disabled=false}
 });
 document.querySelectorAll("[data-zo-progress]").forEach(form=>{
  const status=form.querySelector('[name="status"]'),progress=form.querySelector('[name="progress"]');
  status.addEventListener("change",()=>{if(status.value==="completed")progress.value=100;else if(status.value==="open")progress.value=0;else if(status.value==="in_progress"&&(Number(progress.value)===0||Number(progress.value)===100))progress.value=25;else if(status.value==="cancelled"&&Number(progress.value)===100)progress.value=99});
  form.onsubmit=async e=>{e.preventDefault();const d=new FormData(form),btn=form.querySelector('button[type="submit"]');btn.disabled=true;
   try{await auth().managerMaintenanceProgress(form.dataset.zoProgress,String(d.get("status")),Number(d.get("progress")),String(d.get("note")).trim(),d.get("eta")||null);activate("maintenance",record);window.ZimbaNotify?.refresh();}
   catch(err){form.querySelector(".zo-progress-error").textContent=err.message;btn.disabled=false}
  };
 });
}
function bindFinancial(record){
 $("#zo-record-expense")?.addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector("[type=submit]");button.disabled=true;
  try{await auth().recordExpense(f.get("description"),Number(f.get("amount")),f.get("category"),f.get("property")||null);activate("finance",record)}
  catch(err){feedback(err.message,true);button.disabled=false}
 });
}
function bindSettings(record){
 $("#zo-settings-form")?.addEventListener("submit",async e=>{
  e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector("[type=submit]");button.disabled=true;
  try{await auth().updateSettings(f.get("organization"),f.get("area"),{maintenance:f.has("maintenance"),financial:f.has("financial"),property:f.has("property")});feedback("Settings saved securely.",false);button.disabled=false}
  catch(err){feedback(err.message,true);button.disabled=false}
 });
}
window.ZimbaOperations={shell,activate};
})();