/* ZIMBA Intelligence / Phase 5A — explainable operational signals.
 * This is a read-only, rule-based assistant. No LLM, OCR, user prompt uploads
 * or speculative financial predictions are performed on the client.
 */
(()=>{
"use strict";
const api=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ugx=v=>"UGX "+Number(v||0).toLocaleString("en-UG",{maximumFractionDigits:0});
const number=v=>Number(v||0).toLocaleString("en-UG");
const day=v=>v?String(v).slice(0,10):"—";
const tabs=[["pulse","Portfolio pulse"],["priorities","Recommended actions"],["assistant","Ask ZIMBA"],["readiness","Data readiness"]];
const questions=[
 "What needs attention today?","How much rent is overdue?","Which properties have vacancies?",
 "What repairs need attention?","Which documents expire soon?","Can you predict next month's rent?"
];
let scope="",active="pulse",report=null,reply=null,request=0,propertyOptions=[];
const root=()=>document.querySelector("#zai-root");
function page(record){
 propertyOptions=(record?.properties||[]).filter(p=>p&&p.id).map(p=>({id:String(p.id),name:String(p.name||"Property")}));
 const selected=new URLSearchParams((location.hash.split("?")[1]||"")).get("property");
 scope=propertyOptions.some(p=>p.id===selected)?selected||"":"";
 active="pulse";report=null;reply=null;
 return '<section class="zai-page" id="zai-root"><div class="zai-head"><div><span class="zai-kicker">ZIMBA / INTELLIGENCE</span><h1>Your properties. <em>Clearer decisions.</em></h1><p>Signals grounded in your organisation’s records, with explanations you can inspect.</p></div><button type="button" class="zai-btn" id="zai-refresh">Refresh intelligence</button></div>'+
 '<div class="zai-toolbar"><label for="zai-property">Analysis scope</label><select id="zai-property"><option value="">All managed properties</option>'+propertyOptions.map(p=>'<option value="'+esc(p.id)+'" '+(scope===p.id?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select><span class="zai-readonly">Read-only analysis</span></div>'+
 '<div class="zai-tabs" role="tablist" aria-label="Intelligence sections">'+tabs.map(([k,n])=>'<button type="button" role="tab" data-zai-tab="'+k+'" aria-selected="'+String(k===active)+'">'+esc(n)+'</button>').join("")+'</div>'+
 '<div id="zai-status" aria-live="polite"></div><div id="zai-panel" role="tabpanel" tabindex="0"><div class="zai-loading" role="status">Loading verified operational signals…</div></div></section>';
}
function status(message,error=false){const t=root()?.querySelector("#zai-status");if(!t)return;t.textContent=message||"";t.className=error?"zai-status zai-status-error":"zai-status";}
function metric(title,value,detail){return '<article class="zai-metric"><span>'+esc(title)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></article>';}
function safePct(num,den){return den>0?Math.max(0,Math.min(100,Math.round(num/den*100))):0;}
function nav(id){return "#/workspace/property?property="+encodeURIComponent(String(id||""));}
function formatLink(item){return item.propertyId?'<a href="'+nav(item.propertyId)+'" class="zai-small-link">Open property</a>':'';}
function recommendations(d){
 const s=d.summary||{},quality=d.dataQuality||{},items=[];
 const push=(severity,kind,title,detail,basis,propertyId,property)=>items.push({severity,kind,title,detail,basis,propertyId,property});
 for(const x of (d.overdueInvoices||[])){
  const late=Math.max(0,Number(x.daysLate||0));
  push(late>=14?"high":"medium","Rent","Follow up on overdue invoice "+x.reference,
   ugx(x.remaining)+" outstanding · "+late+" day"+(late===1?"":"s")+" past due","Due date passed and independently verified payment evidence does not cover the invoice.",x.propertyId,x.property);
 }
 for(const x of (d.maintenanceAttention||[])){
  const urgent=x.priority==="urgent",past=x.expectedCompletion&&x.expectedCompletion<day(d.asOf);
  push(urgent||past?"high":"medium","Maintenance",(urgent?"Urgent: ":"Review: ")+x.issue,
   number(x.daysOpen)+" days open · "+x.priority+" priority"+(past?" · expected completion passed":""),
   "Recorded priority, age over seven days, or missed expected completion date.",x.propertyId,x.property);
 }
 for(const x of (d.documentDeadlines||[])){
  const expired=Number(x.daysUntil)<0;
  push(expired?"high":"medium","Documents",(expired?"Expired: ":"Renewal approaching: ")+x.title,
   (expired?"Expired "+number(Math.abs(Number(x.daysUntil)))+" days ago":"Expires in "+number(x.daysUntil)+" days")+" · "+day(x.expiresOn),
   "Based on the expiry date entered in the document metadata register; no file content has been scanned.",x.propertyId,x.property);
 }
 if(Number(s.reconciliationFlags)>0)push("high","Data quality","Review payment evidence exceeding invoice amounts",number(s.reconciliationFlags)+" invoice(s) require reconciliation.","Verified evidence exceeds an invoice; figures are capped at invoice amounts in totals.",null,null);
 if(Number(s.units)>0&&Number(s.pricedUnits)<Number(s.units))push("low","Data quality","Complete rent configuration for rooms",number(s.units-s.pricedUnits)+" room(s) have no positive configured monthly rent.","Vacancy exposure excludes unpriced rooms, which can understate theoretical potential.",null,null);
 for(const x of (d.properties||[])){
  if(Number(x.vacant)>0)push("low","Vacancy","Review available rooms at "+x.name,
   number(x.vacant)+" vacant · "+ugx(x.vacancyPotential)+" configured monthly rent",
   "An opportunity indicator, not assured rent collection or occupancy forecast.",x.id,x.name);
 }
 const rank={high:0,medium:1,low:2};items.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.kind.localeCompare(b.kind));
 return items.slice(0,65);
}
function insightCard(x){
 return '<article class="zai-recommendation"><div class="zai-rec-main"><div class="zai-rec-top"><span class="zai-tag zai-'+esc(x.severity)+'">'+esc(x.severity.toUpperCase())+'</span><span class="zai-rec-category">'+esc(x.kind)+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.detail)+'</p><details><summary>Why this appears</summary><p>'+esc(x.basis)+'</p></details></div><div class="zai-rec-side">'+(x.property?'<small>'+esc(x.property)+'</small>':'')+formatLink(x)+'</div></article>';
}
function pulse(d){
 const s=d.summary||{},q=d.dataQuality||{},units=Number(s.units||0),occupied=Number(s.occupiedUnits||0),
  actions=recommendations(d),urgent=actions.filter(x=>x.severity==="high").length,pct=safePct(occupied,units);
 return '<div class="zai-feature"><div><span class="zai-eyebrow">LIVE MANAGEMENT SIGNALS</span><h2>'+ (urgent?number(urgent)+" priority alerts":actions.length?number(actions.length)+" actions to review":"Your monitored records are clear")+'</h2><p>'+esc(urgent?"High-priority items need human review.":"Recommendations update when verified property records change.")+'</p><button type="button" class="zai-primary" id="zai-view-priorities">Review recommended actions</button></div><div class="zai-feature-meta"><span>As of</span><strong>'+day(d.asOf)+'</strong><small>Source: organisation-scoped Neon records</small></div></div>'+
 '<div class="zai-metrics">'+metric("Overdue rent",ugx(s.overdue),"Verified evidence deducted")+
 metric("Rent outstanding",ugx(s.outstanding),"Across non-void invoices")+
 metric("Vacant rooms",number(s.vacantUnits),"From recorded room statuses")+
 metric("Vacancy exposure / month",ugx(s.vacantMonthlyPotential),"Configured rent, not a forecast")+
 metric("Urgent repairs",number(s.urgentMaintenance),"Open urgent-priority requests")+
 metric("Document deadlines",number(Number(s.expiredDocuments||0)+Number(s.expiringDocuments||0)),"Expired or due within 45 days")+'</div>'+
 '<div class="zai-columns"><section class="zai-card"><h3>Occupancy signal</h3><p>Room-status occupancy across your selected properties.</p><div class="zai-occupancy"><strong>'+pct+'%</strong><small>'+number(occupied)+' of '+number(units)+' units occupied</small></div><div class="zai-track" role="meter" aria-label="Recorded unit occupancy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><i style="width:'+pct+'%"></i></div><div class="zai-split"><span>Vacant: '+number(s.vacantUnits)+'</span><span>Maintenance: '+number(s.maintenanceUnits)+'</span></div></section>'+
 '<section class="zai-card"><h3>Financial evidence</h3><p>Non-void invoices versus independently verified payment records.</p><div class="zai-finance-row"><span>Total invoiced</span><strong>'+ugx(s.invoiced)+'</strong></div><div class="zai-finance-row"><span>Verified against invoices</span><strong>'+ugx(s.verified)+'</strong></div><div class="zai-finance-row"><span>Invoices past due</span><strong>'+number(s.overdueCount)+'</strong></div><div class="zai-note">Payment totals are capped to invoice amounts. Refundable deposits are not rental income.</div></section></div>'+
 '<section class="zai-card"><div class="zai-card-head"><h3>Top recommendations</h3><button type="button" class="zai-btn" id="zai-see-all">See all</button></div>'+
 (actions.length?actions.slice(0,4).map(insightCard).join(""):'<p class="zai-empty">No alert conditions were found. Continue maintaining accurate invoices, unit status, maintenance updates and document expiry dates.</p>')+'</section>'+
 '<p class="zai-disclaimer">ZIMBA Intelligence currently uses transparent decision rules, not a trained prediction model. It does not verify bank balances, collect money, send reminders, or make decisions for you.</p>';
}
function priorities(d){
 const items=recommendations(d),counts={high:0,medium:0,low:0};items.forEach(x=>counts[x.severity]++);
 return '<section class="zai-card"><h2>Recommended next actions</h2><p>Priorities are calculated from overdue dates, configured status, verified financial records and document register deadlines. Nothing is automatically changed.</p><div class="zai-priority-counts"><span><b>'+counts.high+'</b> High</span><span><b>'+counts.medium+'</b> Medium</span><span><b>'+counts.low+'</b> Opportunity & data quality</span></div>'+
 (items.length?items.map(insightCard).join(""):'<p class="zai-empty">There are no current recommendations for this scope. Missing records cannot be assessed automatically.</p>')+
 ((d.overdueInvoices||[]).length===20|| (d.maintenanceAttention||[]).length===20||(d.documentDeadlines||[]).length===20?
 '<p class="zai-disclaimer">Showing up to 20 records in each source category. Review the relevant workspace for the complete history.</p>':'')+
 '</section>';
}
function evaluateQuestion(question,d){
 const t=String(question||"").toLowerCase().trim(),s=d.summary||{},props=d.properties||[],q=d.dataQuality||{};
 if(!t)return {answer:"Choose a question or ask about overdue rent, occupancy, repairs, document deadlines or data readiness.",basis:"Supported questions only."};
 if(/predict|forecast|next month|future|projection|profit|roi|growth/.test(t)){
  return {answer:"I cannot provide a reliable payment forecast or profit prediction. The current records cover "+number(q.invoiceCount)+" non-void invoices over "+number(q.invoicePeriods)+" distinct invoice months. Even if more records are added, an approved forecast model must be validated before predictions are enabled. The vacancy exposure figure is only configured monthly rent on vacant rooms.",basis:"No machine-learning forecast is available in Phase 5A. Forecast readiness is a data-volume check, not an accuracy guarantee."};
 }
 if(/document|certificat|expiry|expire|insurance|renewal/.test(t)){
  return {answer:number(s.expiredDocuments)+" registered documents are past their expiry date and "+number(s.expiringDocuments)+" expire within 45 days. "+((d.documentDeadlines||[]).length?"Earliest: "+d.documentDeadlines[0].title+" ("+day(d.documentDeadlines[0].expiresOn)+").":"No registered expiry dates trigger an alert right now."),basis:"Dates from the secure document metadata register. ZIMBA has not read or extracted the underlying documents."};
 }
 if(/repair|maintenance|urgent|fix|service/.test(t)){
  return {answer:number(s.openMaintenance)+" maintenance requests remain open. Of these, "+number(s.urgentMaintenance)+" are urgent, "+number(s.agedMaintenance)+" have been open for over seven days, and "+number(s.pastExpectedCompletion)+" are past their expected completion date. Review the maintenance priority cards to act.",basis:"Priority, status, created date and expected completion fields from manager-authorised maintenance records."};
 }
 if(/vacan|occup|empty|unit|room|rent potential|available/.test(t)){
  const p=props.filter(x=>Number(x.vacant)>0).slice(0,4).map(x=>x.name+" ("+number(x.vacant)+" vacant)").join("; ");
  return {answer:number(s.vacantUnits)+" rooms are recorded as vacant and "+number(s.occupiedUnits)+" as occupied. Configured monthly rent for vacant rooms totals "+ugx(s.vacantMonthlyPotential)+". "+(p?"Properties to review: "+p+".":"No current vacancy by property is listed."),basis:"Direct unit status and configured monthly rent; potential is illustrative, not a prediction."};
 }
 if(/overdue|arrear|late|unpaid|owe|outstand|rent|invoice|payment|collection/.test(t)){
  return {answer:"Total non-void rent invoiced is "+ugx(s.invoiced)+". "+ugx(s.verified)+" is backed by verified evidence; "+ugx(s.outstanding)+" remains outstanding, including "+ugx(s.overdue)+" past due across "+number(s.overdueCount)+" overdue invoices. "+number(s.dueNext7Days)+" invoice(s) have remaining balances due within the next seven days.",basis:"Invoiced amounts minus verified payment evidence; overpayments are capped for reporting. This is not a bank balance."};
 }
 if(/ready|confidence|data|accur|reliable|quality|missing|trust/.test(t)){
  return {answer:"There are "+number(s.units)+" configured units, "+number(s.pricedUnits)+" with positive monthly rent, "+number(q.invoiceCount)+" invoices over "+number(q.invoicePeriods)+" invoice months, and "+number(q.verifiedEvidenceEntries)+" verified payment entries. "+(q.forecastReady?"The minimum history-count threshold is met, but no forecasting model is active.":"History is still too limited for a meaningful statistical forecast."),basis:"Completeness checks from recorded room prices, invoice periods and verified payment entries. No claim of predictive accuracy."};
 }
 if(/priority|attention|today|action|task|focus|what should|recommend/.test(t)){
  const actions=recommendations(d),h=actions.filter(x=>x.severity==="high");
  return {answer:actions.length?number(actions.length)+" actions meet the configured review rules. "+(h.length?number(h.length)+" are high priority. ":"")+"Start with: "+actions.slice(0,3).map(x=>x.title).join("; ")+".":"No triggered alerts in the selected scope. This is not confirmation that every record is complete.",basis:"Invoice due dates, verified payment amounts, maintenance age and priority, document expiry dates, and vacancy status."};
 }
 return {answer:"I can answer structured questions about rent arrears, vacancies, maintenance, document deadlines, data quality and priorities. Please rephrase your question using one of those subjects. I do not access outside sources or make financial decisions.",basis:"Phase 5A uses an explainable, local rules assistant. No question is sent to an external AI service."};
}
function assistant(d){
 return '<section class="zai-card zai-assistant"><div class="zai-assistant-header"><div><span class="zai-kicker">GUIDED INTELLIGENCE</span><h2>Ask ZIMBA</h2><p>Ask about verified operational facts. Responses come from the report already loaded for your organisation, not a generative AI model.</p></div><span class="zai-readonly">No external AI service</span></div>'+
 '<div class="zai-quick-questions">'+questions.map((q,i)=>'<button type="button" data-zai-question="'+i+'">'+esc(q)+'</button>').join("")+'</div>'+
 '<form id="zai-question-form" class="zai-question-form"><label for="zai-question">Your question</label><div class="zai-question-row"><input id="zai-question" name="question" maxlength="240" autocomplete="off" placeholder="e.g. How much rent is overdue?" required><button type="submit" class="zai-primary">Get answer</button></div></form>'+
 (reply?'<section class="zai-answer" aria-live="polite"><span>ANSWER FROM RECORDED DATA</span><h3>'+esc(reply.question)+'</h3><p>'+esc(reply.answer)+'</p><details open><summary>Evidence and limits</summary><p>'+esc(reply.basis)+'</p></details></section>':
 '<div class="zai-example">Try a suggested question to see how ZIMBA explains the numbers behind a recommendation.</div>')+
 '<p class="zai-disclaimer">This is not open-ended AI chat: questions are evaluated locally against an authorised, read-only snapshot. It cannot submit transactions, send notices, or change tenancy records.</p></section>';
}
function readiness(d){
 const s=d.summary||{},q=d.dataQuality||{};
 const checks=[
  ["Room rent configuration",number(s.pricedUnits)+" of "+number(s.units)+" rooms have rent above zero",Number(s.units)>0&&Number(s.pricedUnits)===Number(s.units)],
  ["Invoice coverage",number(q.invoiceCount)+" non-void invoices",Number(q.invoiceCount)>=12],
  ["Historical depth",number(q.invoicePeriods)+" different invoice months",Number(q.invoicePeriods)>=3],
  ["Verified payment evidence",number(q.verifiedEvidenceEntries)+" independently verified entries",Number(q.verifiedEvidenceEntries)>0],
  ["Registered documents",number(s.registeredDocuments)+" active metadata references",Number(s.registeredDocuments)>0],
  ["Reconciliation exceptions",number(s.reconciliationFlags)+" invoices with evidence exceeding amounts",Number(s.reconciliationFlags)===0]
 ];
 return '<section class="zai-card"><h2>Evidence coverage and readiness</h2><p>Before predictive analytics can be justified, the underlying operational records must be accurate and representative.</p>'+
 '<div class="zai-quality-list">'+checks.map(([name,note,good])=>'<article><span class="zai-quality-mark '+(good?"ok":"todo")+'">'+(good?"✓":"!")+'</span><div><b>'+esc(name)+'</b><p>'+esc(note)+'</p></div><small>'+ (good?"Meets basic check":"Needs review")+'</small></article>').join("")+'</div>'+
 '<div class="zai-note"><strong>'+ (q.forecastReady?"Minimum invoice-history threshold reached":"Historical data is insufficient for statistical forecasts")+'</strong><p>The threshold is 12 or more invoices across at least three different months. Passing this does not enable forecasting or prove prediction accuracy. No trained model, benchmark, confidence interval or automated financial decision system is running in this release.</p></div>'+
 '<div class="zai-method"><h3>How recommendations are calculated</h3><p><b>Rent:</b> Due invoices minus verified payment evidence, excluding void invoices.</p><p><b>Vacancy:</b> Room statuses and configured monthly rent, not market-rate estimates.</p><p><b>Maintenance:</b> A record is flagged if urgent, more than seven days open, or past its expected completion.</p><p><b>Documents:</b> Registry expiry dates, not extracted or interpreted document text.</p><p><b>Decision-making:</b> Human review is always required.</p></div></section>';
}
function render(){
 const r=root(),p=r?.querySelector("#zai-panel");if(!r||!p||!report)return;
 r.querySelectorAll("[data-zai-tab]").forEach(b=>{b.setAttribute("aria-selected",String(active===b.dataset.zaiTab));b.tabIndex=active===b.dataset.zaiTab?0:-1;});
 p.innerHTML=active==="pulse"?pulse(report):active==="priorities"?priorities(report):active==="assistant"?assistant(report):readiness(report);
 p.querySelectorAll("#zai-see-all,#zai-view-priorities").forEach(b=>b.addEventListener("click",()=>switchTab("priorities")));
 p.querySelector("#zai-question-form")?.addEventListener("submit",e=>{e.preventDefault();submitQuestion(new FormData(e.target).get("question"));});
 p.querySelectorAll("[data-zai-question]").forEach(b=>b.addEventListener("click",()=>submitQuestion(questions[Number(b.dataset.zaiQuestion)])));
 window.ZimbaPrivacy?.refresh();
}
function submitQuestion(question){
 if(!report)return;
 const q=String(question||"").trim().slice(0,240);
 reply={question:q,...evaluateQuestion(q,report)};render();
}
function switchTab(t){
 active=t;reply=null;render();
 if(active==="assistant")root()?.querySelector("#zai-question")?.focus();
}
async function load(){
 const seq=++request,r=root(),host=r?.querySelector("#zai-panel");if(!host)return;
 if(!report)host.innerHTML='<p class="zai-loading" role="status">Calculating protected property indicators…</p>';
 status("");
 try{
  let result;
  for(let attempt=0;attempt<4;attempt++){
   if(seq!==request||!r.isConnected)return;
   try{result=await api().intelligenceSnapshot(scope||null);break;}
   catch(e){if(e?.code!=="PGRST202"||attempt===3)throw e;
    status("Connecting to the intelligence reporting function…");
    await new Promise(ok=>setTimeout(ok,[550,1300,2600][attempt]));}
  }
  if(seq!==request||!r.isConnected)return;
  if(result?.currency!=="UGX"||result?.readOnly!==true||result?.verifiedPaymentsOnly!==true||result?.method!=="transparent_rules_v1")
   throw new Error("The intelligence response did not pass source validation.");
  if((result.propertyId||"")!==(scope||""))throw new Error("The property scope was not confirmed.");
  report=result;reply=null;status("");render();
 }catch(e){
  if(seq!==request||!r.isConnected)return;
  if(report){status("Unable to refresh this view. Previous results may be outdated: "+e.message,true);return;}
  host.innerHTML='<div class="zai-error" role="alert"><h2>Intelligence temporarily unavailable</h2><p>'+esc(e?.code==="PGRST202"?"The secure reporting function is still updating. Your session remains active.":e.message)+'</p><button class="zai-btn" type="button" id="zai-retry">Retry analysis</button></div>';
  host.querySelector("#zai-retry")?.addEventListener("click",load);
 }
}
function bind(){
 const r=root();if(!r)return;
 r.querySelector("#zai-refresh")?.addEventListener("click",load);
 r.querySelector("#zai-property")?.addEventListener("change",e=>{
  scope=e.target.value;active="pulse";report=null;reply=null;load();
 });
 r.querySelectorAll("[data-zai-tab]").forEach(b=>{
  b.addEventListener("click",()=>switchTab(b.dataset.zaiTab));
  b.addEventListener("keydown",e=>{
   if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
   e.preventDefault();const idx=tabs.findIndex(x=>x[0]===active);
   const next=e.key==="Home"?0:e.key==="End"?tabs.length-1:(idx+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
   switchTab(tabs[next][0]);r.querySelector('[data-zai-tab="'+active+'"]')?.focus();
  });
 });
 load();
}
window.ZimbaIntelligence={page,bind,evaluateQuestion,recommendations};
})();