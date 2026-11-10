(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const api=()=>window.ZimbaAuth;
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG");
const box=(title,html)=>'<section class="zf-card"><h2>'+title+'</h2>'+html+'</section>';
const line=(title,detail)=>'<article class="zf-line"><strong>'+esc(title)+'</strong><p>'+detail+'</p></article>';
function page(kind,manager){return '<div class="zf-page"><span>ZIMBA / '+(manager?"MANAGEMENT":"RESIDENT")+'</span><h1>'+({lease:"Lease agreements",invoices:"Rent invoices",deposits:"Security deposits"}[kind])+'</h1><div id="zf-body">Loading your records…</div></div>'}
async function load(kind,manager){
 const root=document.querySelector("#zf-body");if(!root)return;
 try{
 let html="";
 if(kind==="lease"&&manager){
  const [people,leases]=await Promise.all([api().managerThreads(),api().managerLeases()]);
  const options=people.map(p=>'<option value="'+esc(p.connection_id)+'">'+esc(p.resident_name)+' · '+esc(p.property_title)+'</option>').join("");
  html=box("Prepare lease",'<form class="zf-form" id="zf-lease"><label>Connected resident<select name="connection">'+options+'</select></label><label>Start date<input name="start" type="date" required></label><label>End date (optional)<input name="end" type="date"></label><label>Monthly rent (UGX)<input name="rent" type="number" min="1" required></label><label>Security deposit (maximum one month)<input name="deposit" type="number" min="0" required></label><label>Tenancy conditions<textarea name="terms" minlength="50" maxlength="10000" rows="6" required></textarea></label><label>Written deposit withholding and refund conditions<textarea name="depositTerms" minlength="20" maxlength="3000" rows="4" required></textarea></label><label><input name="issue" type="checkbox"> Issue to tenant after saving</label><button type="submit">Save lease</button><p class="zf-error"></p></form>')+box("Lease register",leases.map(l=>line(l.tenant+" · "+l.property,money(l.rent)+" / month · "+l.status)).join("")||"No leases yet.");
 }else if(kind==="lease"){
  const leases=await api().tenantLeases();
  html=box("My lease agreements",leases.map(l=>line(l.property+" · "+l.room,money(l.rent)+" monthly · Security deposit "+money(l.deposit)+" · "+l.status+'<details><summary>Read agreement</summary><p class="zf-terms">'+esc(l.terms)+'</p><h3>Deposit terms</h3><p class="zf-terms">'+esc(l.depositTerms)+'</p></details>'+(l.status==="issued"?'<button type="button" data-zf-ack="'+esc(l.id)+'">Acknowledge terms reviewed</button>':""))).join("")||"Your landlord has not issued a lease.")+'<p class="zf-caution">Account acknowledgement is not a legally verified signature. The prescribed Uganda lease form and properly executed agreement remain necessary.</p>';
 }else if(kind==="invoices"&&manager){
  const [leases,invoices]=await Promise.all([api().managerLeases(),api().managerInvoices()]);
  const options=leases.filter(l=>l.status==="acknowledged").map(l=>'<option value="'+esc(l.id)+'">'+esc(l.tenant)+' · '+esc(l.property)+'</option>').join("");
  html=box("Generate month-end rent invoice",'<form class="zf-form" id="zf-invoice"><label>Approved lease<select name="lease">'+options+'</select></label><label>Billing month<input type="month" name="period" required></label><button type="submit">Issue invoice</button><p class="zf-error"></p></form>')+box("Invoices",invoices.map(i=>line(i.reference+" · "+i.tenant,money(i.amount)+" · "+i.status+" · Due "+i.due+(i.status==="unpaid"?'<button type="button" data-zf-remind="'+esc(i.id)+'">Send reminder</button>':""))).join("")||"No invoices yet.");
 }else if(kind==="invoices"){
  const invoices=await api().tenantInvoices();
  html=box("My invoices and payment records",invoices.map(i=>line(i.invoiceRef,money(i.amount)+" · Due "+i.due+" · "+i.status+'<button type="button" class="zf-print">Print invoice</button>'+(i.receipts||[]).map(r=>'<p>Verified payment record: '+esc(r.reference)+" · "+money(r.amount)+'</p>').join(""))).join("")||"No invoices yet.")+'<p class="zf-caution">A ZIMBA acknowledgment is not an EFRIS tax receipt. Only reconciled payments can produce verified payment records.</p>';
 }else if(kind==="deposits"&&manager){
  const deposits=await api().managerDeposits();
  html=box("Deposit register",deposits.map(d=>line(d.tenant+" · "+d.property,"Required "+money(d.required)+" · Verified held "+money(d.verifiedHeld)+" · "+d.leaseStatus)).join("")||"No deposits yet.");
 }else if(kind==="deposits"){
  const deposits=await api().tenantDeposits();
  html=box("Protected security deposits",deposits.map(d=>line(d.property,"Agreed "+money(d.required)+" · Verified held "+money(d.verifiedHeld)+" · "+d.leaseStatus+(d.leaseStatus==="ended"&&Number(d.verifiedHeld)>0?'<form class="zf-form" data-zf-refund="'+esc(d.leaseId)+'"><label>Refund amount<input type="number" name="amount" min="1" max="'+Number(d.verifiedHeld)+'" required></label><label>Reason<textarea name="reason" minlength="10" required></textarea></label><button>Request refund review</button><p class="zf-error"></p></form>':""))).join("")||"No recorded deposits.")+'<p class="zf-caution">Security-deposit refunds are the only withdrawal requests. Transfers are disabled until a verified regulated provider is connected.</p>';
 }
 root.innerHTML=html;
 const lease=root.querySelector("#zf-lease");
 if(lease)lease.onsubmit=async e=>{e.preventDefault();const f=new FormData(lease),btn=lease.querySelector("button");btn.disabled=true;try{await api().prepareLease(f.get("connection"),f.get("start"),f.get("end")||null,Number(f.get("rent")),Number(f.get("deposit")),f.get("terms"),f.get("depositTerms"),f.has("issue"));await load(kind,manager)}catch(err){lease.querySelector(".zf-error").textContent=err.message;btn.disabled=false}};
 const invoice=root.querySelector("#zf-invoice");
 if(invoice)invoice.onsubmit=async e=>{e.preventDefault();const f=new FormData(invoice),btn=invoice.querySelector("button");btn.disabled=true;try{await api().issueRentInvoice(f.get("lease"),f.get("period")+"-01");await load(kind,manager)}catch(err){invoice.querySelector(".zf-error").textContent=err.message;btn.disabled=false}};
 root.querySelectorAll("[data-zf-remind]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{await api().remindRentInvoice(btn.dataset.zfRemind);btn.textContent="Reminder sent"}catch(e){btn.textContent=e.message}});
 root.querySelectorAll("[data-zf-ack]").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{await api().acknowledgeLease(btn.dataset.zfAck);await load(kind,manager)}catch(e){btn.textContent=e.message;btn.disabled=false}});
 root.querySelectorAll("[data-zf-refund]").forEach(form=>form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);try{await api().requestDepositRefund(form.dataset.zfRefund,Number(f.get("amount")),f.get("reason"));await load(kind,manager)}catch(err){form.querySelector(".zf-error").textContent=err.message}});
 root.querySelectorAll(".zf-print").forEach(btn=>btn.onclick=()=>window.print());
 }catch(e){root.innerHTML=box("Unable to load this section",'<p>'+esc(e.message)+'</p><p>Your login remains active.</p>')}
}
window.ZimbaLeaseFinance={page,load};
})();