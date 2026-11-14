/* ZIMBA Deposit Studio V2.
 * Separate agreed deposits, reported receipts, verified ledger, deductions,
 * external payout claims, and tenant-confirmed returns.
 * Do NOT treat a manager assertion as a bank-verification event.
 */
(()=>{
"use strict";
const api=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG",{maximumFractionDigits:0});
const dat=v=>String(v||"").slice(0,10)||"Not specified";
const safeInt=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const today=()=>new Date().toISOString().slice(0,10);
const root=()=>document.querySelector("#zds-root");
const statuses={
 reported:["Manager reported receipt","reported"],
 tenant_acknowledged:["Tenant acknowledged receipt","acknowledged"],
 disputed:["Disputed","disputed"],
 requested:["Refund requested","requested"],
 approved_pending_payout:["Approval recorded · payout not verified","pending"],
 rejected:["Declined","disputed"],settled:["Tenant-confirmed settlement","completed"],
 proposed:["Proposed deductions · awaiting tenant","pending"],
 accepted:["Proposal accepted · no transfer yet","accepted"],
 superseded:["Superseded proposal","muted"],
 awaiting_confirmation:["Manager reported settlement · awaiting tenant","pending"],
 confirmed:["Tenant confirmed settlement","completed"],
 payout_disputed:["Payout disputed","disputed"]
};
const badge=k=>{const [label,tone]=statuses[k]||[k||"Not recorded","muted"];return '<span class="zds-badge '+tone+'">'+esc(label)+'</span>';};
let state={manager:false,items:[],active:"",openForm:null,seq:0};
const find=id=>state.items.find(i=>i.leaseId===id);
function page(manager){
 return '<section id="zds-root" class="zds-page">'+
 '<header class="zds-head"><div><span class="zds-kicker">ZIMBA / RENT & FINANCES</span>'+
 '<h1>Security deposits</h1><p>'+(manager
 ?'Track agreed deposits, receipt evidence, tenant requests, justified deductions and confirmed refunds in one private register.'
 :'Track what was agreed and actually recorded, acknowledge deposit receipts, request a refund and review every deduction before confirming repayment.')+
 '</p></div><span class="zds-privacy-tag">Private deposit records</span></header>'+
 '<div id="zds-notice" class="zds-notice" role="status" aria-live="polite"></div>'+
 '<div id="zds-content"><div class="zds-loading">Loading secure deposit records…</div></div></section>';
}
function message(v,error=false){
 const el=root()?.querySelector("#zds-notice");if(!el)return;
 el.textContent=v||"";el.className="zds-notice"+(error?" error":"");
}
function sums(){
 const items=state.items;
 return [
 ["Agreed deposits",items.reduce((a,i)=>a+safeInt(i.required),0),"Set in the tenancy agreements"],
 ["Verified held",items.reduce((a,i)=>a+safeInt(i.verifiedHeld),0),"Reconciled ledger only"],
 ["Tenant-acknowledged receipts",items.reduce((a,i)=>a+safeInt(i.acknowledgedReceived),0),"Separate from bank verification"],
 ["Confirmed returned",items.reduce((a,i)=>a+safeInt(i.confirmedRefunds),0),"Tenant confirmed a reported payout"]
 ];
}
function overview(){
 return '<div class="zds-metrics">'+sums().map(([title,value,help])=>'<article class="zds-metric">'+
 '<span>'+esc(title)+'</span><strong>'+money(value)+'</strong><small>'+esc(help)+'</small></article>').join("")+'</div>'+
 '<div class="zds-guide"><span class="zds-guide-icon" aria-hidden="true">i</span><p><b>Different financial states matter.</b> An agreed deposit is not money received. A manager-recorded receipt needs tenant acknowledgement and remains distinct from independent bank reconciliation. An approved refund is not a completed payout, and deductions must have documented reasons.</p></div>';
}
function phases(i){
 const agreed=safeInt(i.required)>0;
 const acknowledged=safeInt(i.acknowledgedReceived)>0;
 const verified=safeInt(i.verifiedHeld)>0;
 const final=(i.requests||[]).some(r=>(r.proposals||[]).some(p=>p.status==="confirmed"));
 return '<div class="zds-phases">'+[
 ["01","Agreed",agreed],["02","Receipt recorded",i.receipts?.length>0],
 ["03","Tenant acknowledged",acknowledged],["04","Financially verified",verified],
 ["05","Refund settled",final]
 ].map(([n,label,done])=>'<span class="'+(done?"complete":"waiting")+'"><b>'+n+'</b>'+esc(label)+'</span>').join("")+'</div>';
}
function receiptList(i){
 const receipts=Array.isArray(i.receipts)?i.receipts:[];
 return '<section class="zds-subsection"><div class="zds-subhead"><h3>Deposit receipts & verification</h3><small>'+receipts.length+' recorded</small></div>'+
 (receipts.length?'<div class="zds-entries">'+receipts.map(r=>
 '<article class="zds-entry"><div class="zds-entry-top"><strong>'+money(r.amount)+'</strong>'+badge(r.status)+'</div>'+
 '<p><b>Receipt reference:</b> '+esc(r.reference)+' · <b>Date:</b> '+dat(r.receivedOn)+'</p>'+
 '<p class="zds-evidence">'+esc(r.note)+'</p>'+
 (r.tenantNote?'<p class="zds-evidence"><b>Tenant response:</b> '+esc(r.tenantNote)+'</p>':"")+
 (!state.manager&&r.status==="reported"?'<form class="zds-smallform" data-zds-receipt="'+esc(r.id)+'">'+
 '<label>Your response / reason if disputing<textarea name="note" rows="2" maxlength="1000" placeholder="Explain any discrepancy"></textarea></label>'+
 '<div class="zds-actions"><button type="submit" name="decision" value="accept" class="zds-button primary">Acknowledge receipt</button>'+
 '<button type="submit" name="decision" value="dispute" class="zds-button ghost">Dispute receipt</button></div></form>':"")+
 '</article>').join("")+'</div>':'<p class="zds-empty">No security deposit receipt has been recorded. The agreed amount is not proof of payment.</p>')+
 (state.manager?'<button class="zds-button ghost" type="button" data-zds-toggle="receipt:'+esc(i.leaseId)+'">Record receipt / evidence</button>':"")+
 (state.manager&&state.openForm==="receipt:"+i.leaseId?receiptForm(i):"")+'</section>';
}
function receiptForm(i){
 return '<form class="zds-action-form" data-zds-attest="'+esc(i.leaseId)+'">'+
 '<h4>Record receipt attestation</h4>'+
 '<p>Record what you received and the evidence reference. The tenant will be notified to acknowledge or dispute it. This does not mark money bank-verified.</p>'+
 '<div class="zds-two"><label>Amount actually reported received · UGX<input type="number" name="amount" min="1" step="1" max="'+safeInt(i.required)+'" required></label>'+
 '<label>Date received<input type="date" name="received" max="'+today()+'" value="'+today()+'" required></label></div>'+
 '<label>Receipt / bank / cash-book reference<input name="reference" minlength="5" maxlength="150" placeholder="e.g. BANK-TRX-2026-…" required></label>'+
 '<label>Evidence and circumstances<textarea name="note" rows="3" minlength="15" maxlength="1000" placeholder="Payment channel, name of payer and evidence location" required></textarea></label>'+
 '<div class="zds-actions"><button type="submit" class="zds-button primary">Save attestation and notify tenant</button>'+
 '<button type="button" class="zds-button ghost" data-zds-close-form>Cancel</button></div></form>';
}
function latest(r){return Array.isArray(r.proposals)?r.proposals[0]||null:null;}
function deductionList(p){
 const lines=Array.isArray(p.deductions)?p.deductions:[];
 return lines.length?'<div class="zds-deductions"><strong>Itemised deductions</strong>'+
 lines.map((d,n)=>'<div class="zds-deduction"><span>'+String(n+1)+'. '+esc(d.reason)+'</span>'+
 '<b>'+money(d.amount)+'</b><small>Evidence: '+esc(d.evidence)+'</small></div>').join("")+'</div>':
 '<p class="zds-zero">No deductions proposed.</p>';
}
function proposalBox(i,r,p){
 return '<article class="zds-proposal"><div class="zds-entry-top"><strong>Settlement proposal v'+Number(p.revision)+'</strong>'+badge(p.status)+'</div>'+
 '<div class="zds-calc"><div><span>Refund requested</span><strong>'+money(p.gross)+'</strong></div>'+
 '<div><span>Proposed deductions</span><strong>− '+money(p.deducted)+'</strong></div>'+
 '<div class="zds-return"><span>Amount to return</span><strong>'+money(p.refund)+'</strong></div></div>'+
 deductionList(p)+'<p class="zds-evidence"><b>Review decision:</b> '+esc(p.decision)+'</p>'+
 (p.tenantResponse?'<p class="zds-evidence"><b>Tenant response:</b> '+esc(p.tenantResponse)+'</p>':"")+
 (p.transferReference?'<p class="zds-evidence"><b>Manager payout / settlement reference:</b> '+esc(p.transferReference)+
 ' · Recorded '+dat(p.transferReportedAt)+'</p>':"")+
 (p.status==="proposed"&&!state.manager?'<form class="zds-smallform" data-zds-answer="'+esc(p.id)+'">'+
 '<label>Response / reason if disputing<textarea name="note" rows="2" maxlength="1000" placeholder="Explain what you disagree with"></textarea></label>'+
 '<div class="zds-actions"><button type="submit" name="decision" value="accept" class="zds-button primary">Accept this settlement</button>'+
 '<button type="submit" name="decision" value="dispute" class="zds-button ghost">Dispute deductions</button></div></form>':"")+
 (p.status==="accepted"&&state.manager?'<form class="zds-smallform" data-zds-payout="'+esc(p.id)+'">'+
 '<p>Record a real external refund or zero-refund settlement. Enter the transaction or signed settlement reference. The tenant will confirm separately.</p>'+
 '<div class="zds-two"><label>Transfer / settlement reference<input name="reference" minlength="8" maxlength="160" required placeholder="External bank or written settlement reference"></label>'+
 '<label>Settlement date<input type="date" name="date" value="'+today()+'" max="'+today()+'" required></label></div>'+
 '<button class="zds-button primary" type="submit">Record payout and notify tenant</button></form>':"")+
 (p.status==="awaiting_confirmation"&&!state.manager?'<form class="zds-smallform" data-zds-confirm="'+esc(p.id)+'">'+
 '<p><b>Confirm only if you actually received '+money(p.refund)+'</b> (or agreed to a documented zero-refund settlement). A manager statement alone is not evidence of money in your account.</p>'+
 '<label>Confirmation / explanation<textarea name="note" rows="2" maxlength="1000" placeholder="Optional confirmation note, or explain missing payment"></textarea></label>'+
 '<div class="zds-actions"><button type="submit" name="decision" value="confirm" class="zds-button primary">Confirm settlement received</button>'+
 '<button type="submit" name="decision" value="dispute" class="zds-button ghost">I did not receive this / amount incorrect</button></div></form>':"")+
 (p.status==="confirmed"?'<p class="zds-completed"><b>Tenant-confirmed settlement.</b> This confirms the tenant's report of receipt, not independent bank verification.</p>':"")+
 (p.status==="payout_disputed"?'<p class="zds-warning">Payout disputed. The property team must resolve this with payment evidence. The disputed transfer cannot automatically be reported again.</p>':"")+
 '</article>';
}
function proposalForm(i,r){
 const key="proposal:"+r.id;
 if(state.openForm!==key)return"";
 return '<form class="zds-action-form" data-zds-propose="'+esc(r.id)+'">'+
 '<h4>Propose a documented settlement</h4><p>The amount requested is '+money(r.amount)+'. Add only deductions supported by a written reason and an evidence reference. Ordinary wear and tear should not be represented as chargeable damage.</p>'+
 '<div id="zds-deduction-lines"><div class="zds-deduction-input"><div class="zds-two"><label>Deduction amount · UGX<input name="deductAmount" type="number" step="1" min="1" placeholder="Leave blank for no deductions"></label>'+
 '<label>Evidence / inspection reference<input name="deductEvidence" maxlength="250" placeholder="Inspection report or photo reference"></label></div>'+
 '<label>Clear deduction explanation<textarea name="deductReason" maxlength="500" rows="2" placeholder="Describe actual damage, outstanding obligation and how the cost was calculated"></textarea></label></div></div>'+
 '<button type="button" class="zds-button ghost" id="zds-add-deduction">Add another deduction</button>'+
 '<label>Written settlement decision<textarea name="note" minlength="20" maxlength="1000" rows="3" placeholder="Summarise the proposed refund, documented deductions and review basis" required></textarea></label>'+
 '<div class="zds-actions"><button type="submit" class="zds-button primary">Propose settlement for tenant review</button>'+
 '<button type="button" class="zds-button ghost" data-zds-close-form>Cancel</button></div></form>';
}
function refundRequests(i){
 const list=Array.isArray(i.requests)?i.requests:[];
 return '<section class="zds-subsection"><div class="zds-subhead"><h3>Refund requests & deductions</h3><small>'+list.length+' request'+(list.length===1?"":"s")+'</small></div>'+
 (list.length?'<div class="zds-entries">'+list.map(r=>{
 const p=latest(r);const canPropose=state.manager&&r.status==="requested"&&(!p||p.status==="disputed");
 return '<article class="zds-entry"><div class="zds-entry-top"><strong>Requested '+money(r.amount)+'</strong>'+badge(r.status)+'</div>'+
 '<p class="zds-evidence"><b>Tenant reason:</b> '+esc(r.reason)+'</p><small>Requested '+dat(r.requestedAt)+'</small>'+
 (p?proposalBox(i,r,p):"")+
 (canPropose?'<button type="button" class="zds-button ghost" data-zds-toggle="proposal:'+esc(r.id)+'">'+(p?"Submit revised proposal":"Review and propose deductions")+'</button>':"")+
 (canPropose?proposalForm(i,r):"")+
 (!p&&r.status==="approved_pending_payout"?'<p class="zds-warning">Legacy approval is pending external payout verification; contact management for the recorded decision.</p>':"")+
 '</article>';
 }).join("")+'</div>':'<p class="zds-empty">No refund requests recorded for this tenancy.</p>')+
 (!state.manager&&i.leaseStatus==="ended"&&!list.some(r=>["requested","approved_pending_payout"].includes(r.status))?
 '<form class="zds-action-form" data-zds-request="'+esc(i.leaseId)+'">'+
 '<h4>Request return of your deposit</h4><p>Your tenancy is marked ended. Submit the requested amount and explanation. This is a review request, not an automatic money transfer.</p>'+
 '<label>Refund requested · UGX<input name="amount" type="number" min="1" max="'+safeInt(i.required)+'" step="1" required value="'+safeInt(i.required)+'"></label>'+
 '<label>Reason for refund request<textarea name="reason" minlength="15" maxlength="1000" rows="3" required placeholder="Explain the tenancy end and deposit amount requested"></textarea></label>'+
 '<button type="submit" class="zds-button primary">Submit refund request to property manager</button></form>':"")+
 (!state.manager&&i.leaseStatus!=="ended"?'<p class="zds-advice">The refund request form becomes available after the tenancy is formally recorded as ended. Contact your landlord if the tenancy has already ended.</p>':"")+
 '</section>';
}
function record(i){
 return '<article class="zds-record"><div class="zds-record-top"><div><span class="zds-label">'+esc(i.property)+(i.unit?" · Unit "+esc(i.unit):"")+'</span>'+
 '<h2>'+esc(i.tenant)+'</h2><span class="zds-small">Lease status: '+esc(i.leaseStatus)+' · Deposit conditions recorded in rental agreement</span></div>'+
 '<div class="zds-agreed"><small>Agreed security deposit</small><strong>'+money(i.required)+'</strong></div></div>'+
 phases(i)+
 '<div class="zds-positions"><div><span>Manager-reported receipts</span><b>'+money(i.reportedReceived)+'</b></div>'+
 '<div><span>Tenant-acknowledged receipts</span><b>'+money(i.acknowledgedReceived)+'</b></div>'+
 '<div><span>Bank / provider verified held</span><b>'+money(i.verifiedHeld)+'</b></div>'+
 '<div><span>Tenant-confirmed return</span><b>'+money(i.confirmedRefunds)+'</b></div>'+
 '<div><span>Tenant-confirmed deductions</span><b>'+money(i.confirmedDeductions)+'</b></div></div>'+
 '<details class="zds-terms"><summary>Read agreed deposit and refund conditions</summary><p>'+esc(i.depositConditions||"No terms recorded")+'</p></details>'+
 '<div class="zds-record-sections">'+receiptList(i)+refundRequests(i)+'</div></article>';
}
function render(){
 const content=root()?.querySelector("#zds-content");if(!content)return;
 content.innerHTML=overview()+
 (state.items.length?'<div class="zds-register">'+state.items.map(record).join("")+'</div>':
 '<section class="zds-panel zds-empty">No deposit agreements were found for this '+(state.manager?"management organisation":"tenant account")+'.</section>')+
 '<p class="zds-disclaimer">ZIMBA records agreement, manager attestations, tenant responses, deductions and external settlement references. It does not move money. A tenant-confirmed refund is separately labelled from an independently reconciled bank transaction. Financial ledger entries can only be added by an authorised verification process.</p>';
 bind();
 window.ZimbaPrivacy?.refresh();
}
async function load(manager){
 const el=root();if(!el)return;
 const run=++state.seq;state.manager=!!manager;
 try{
  const data=await api().depositWorkspace(manager?"manager":"tenant");
  if(run!==state.seq||!el.isConnected)return;
  state.items=Array.isArray(data)?data:[];render();
 }catch(err){
  if(run!==state.seq||!el.isConnected)return;
  el.querySelector("#zds-content").innerHTML='<div class="zds-panel zds-error"><h2>Unable to load deposit records</h2><p>'+esc(err.message)+'</p><button class="zds-button primary" type="button" id="zds-retry">Retry secure connection</button></div>';
  el.querySelector("#zds-retry")?.addEventListener("click",()=>load(manager));
 }
}
async function perform(form,action){
 const btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=true;
 message("Saving your decision and notifying authorised parties…");
 try{
  const result=await action(new FormData(form));
  state.openForm=null;
  await load(state.manager);
  message("Your action was recorded securely. The connected tenant and authorised property management have been notified.");
  return result;
 }catch(err){message(err.message,true);if(btn)btn.disabled=false;return null;}
}
function deductionInput(){
 return '<div class="zds-deduction-input"><div class="zds-two"><label>Deduction amount · UGX<input name="deductAmount" type="number" min="1" step="1" placeholder="Amount"></label>'+
 '<label>Evidence / inspection reference<input name="deductEvidence" maxlength="250" placeholder="Document or inspection reference"></label></div>'+
 '<label>Clear deduction explanation<textarea name="deductReason" maxlength="500" rows="2" placeholder="What happened and how the cost was determined"></textarea></label></div>';
}
function bind(){
 const r=root();if(!r)return;
 r.querySelectorAll("[data-zds-toggle]").forEach(b=>b.onclick=()=>{state.openForm=state.openForm===b.dataset.zdsToggle?null:b.dataset.zdsToggle;render();});
 r.querySelectorAll("[data-zds-close-form]").forEach(b=>b.onclick=()=>{state.openForm=null;render();});
 r.querySelectorAll("[data-zds-attest]").forEach(f=>f.onsubmit=e=>{e.preventDefault();perform(f,d=>api().attestDepositReceipt(f.dataset.zdsAttest,Number(d.get("amount")),d.get("reference"),d.get("received"),d.get("note")));});
 r.querySelectorAll("[data-zds-receipt]").forEach(f=>f.addEventListener("submit",e=>{
  e.preventDefault();const accept=e.submitter?.value==="accept";
  const note=new FormData(f).get("note")||"";
  if(!accept&&note.trim().length<15){message("Explain the receipt discrepancy in at least 15 characters.",true);return;}
  perform(f,()=>api().respondDepositReceipt(f.dataset.zdsReceipt,accept,note));
 }));
 r.querySelectorAll("[data-zds-request]").forEach(f=>f.onsubmit=e=>{e.preventDefault();perform(f,d=>api().startDepositRefund(f.dataset.zdsRequest,Number(d.get("amount")),d.get("reason")));});
 r.querySelectorAll("[data-zds-propose]").forEach(f=>{
  f.querySelector("#zds-add-deduction")?.addEventListener("click",()=>{const box=f.querySelector("#zds-deduction-lines");if(box.children.length<12)box.insertAdjacentHTML("beforeend",deductionInput());});
  f.onsubmit=e=>{
   e.preventDefault();
   const deductions=[];
   for(const line of f.querySelectorAll(".zds-deduction-input")){
    const amount=line.querySelector('[name=deductAmount]').value.trim(),
    reason=line.querySelector('[name=deductReason]').value.trim(),
    evidence=line.querySelector('[name=deductEvidence]').value.trim();
    if(!amount&&!reason&&!evidence)continue;
    if(!Number.isSafeInteger(Number(amount))||Number(amount)<1||reason.length<20||evidence.length<8){
     message("Every deduction needs a positive amount, reason of at least 20 characters and an evidence reference of at least 8 characters.",true);return;
    }
    deductions.push({amount:Number(amount),reason,evidence});
   }
   perform(f,d=>api().proposeDepositRefund(f.dataset.zdsPropose,deductions,d.get("note")));
  };
 });
 r.querySelectorAll("[data-zds-answer]").forEach(f=>f.addEventListener("submit",e=>{
  e.preventDefault();const accept=e.submitter?.value==="accept",note=String(new FormData(f).get("note")||"").trim();
  if(!accept&&note.length<15){message("State your reason for disputing the proposal.",true);return;}
  perform(f,()=>api().answerDepositProposal(f.dataset.zdsAnswer,accept,note));
 }));
 r.querySelectorAll("[data-zds-payout]").forEach(f=>f.onsubmit=e=>{e.preventDefault();perform(f,d=>api().reportDepositPayout(f.dataset.zdsPayout,d.get("reference"),d.get("date")));});
 r.querySelectorAll("[data-zds-confirm]").forEach(f=>f.addEventListener("submit",e=>{
  e.preventDefault();const confirm=e.submitter?.value==="confirm",note=String(new FormData(f).get("note")||"").trim();
  if(!confirm&&note.length<15){message("Explain the missing or incorrect payout in at least 15 characters.",true);return;}
  if(confirm&&!window.confirm("Confirm that you actually received the amount shown, or explicitly agreed to a zero-refund settlement? This will permanently record your response."))return;
  perform(f,()=>api().confirmDepositPayout(f.dataset.zdsConfirm,confirm,note));
 }));
}
window.ZimbaDepositStudio={page,load,money,statuses,phases};
})();