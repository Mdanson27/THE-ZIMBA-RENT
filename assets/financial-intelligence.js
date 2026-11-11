(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ugx=v=>"UGX "+Number(v||0).toLocaleString("en-UG");
const dt=v=>v?String(v).slice(0,10):"—";
let request=0;
function table(head,rows,get){
 if(!rows.length)return '<p class="zfi-empty">No records available.</p>';
 return '<div class="zfi-table" tabindex="0"><table><thead><tr>'+head.map(x=>'<th scope="col">'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+
 rows.map(x=>'<tr>'+get(x).map(y=>'<td>'+esc(y)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
}
function csvValue(v){let s=String(v??"");if(/^\s*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function exportCsv(name,head,rows){
 const csv=[head,...rows].map(r=>r.map(csvValue).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download="zimba-"+name+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function section(name,description,content,exportName){
 return '<section class="zfi-card"><div class="zfi-card-head"><div><h4>'+esc(name)+'</h4><p>'+esc(description)+'</p></div>'+
 (exportName?'<button type="button" class="zfi-button" data-zfi-export="'+exportName+'">Export CSV</button>':'')+'</div>'+content+'</section>';
}
function metric(name,value,detail){
 return '<article class="zfi-metric"><span>'+esc(name)+'</span><strong>'+ugx(value)+'</strong><small>'+esc(detail)+'</small></article>';
}
function render(data,host,propertyId){
 const s=data.summary||{},r=data.rentRoll||[],i=data.invoices||[],e=data.expenses||[],d=data.deposits||[],p=data.receipts||[];
 const columns={
  roll:{head:["Room","Floor","Status","Resident","Configured rent UGX","Agreement rent UGX","Rent start"],rows:r.map(x=>[x.room,x.floor,x.status,x.resident,x.configuredRent,x.agreementRent,x.rentStart])},
  invoices:{head:["Invoice","Resident","Invoiced UGX","Verified UGX","Remaining UGX","Due","Status"],rows:i.map(x=>[x.reference,x.resident,x.invoiced,x.verifiedPaid,x.remaining,x.due,x.status])},
  expenses:{head:["Date","Category","Description","Amount UGX"],rows:e.map(x=>[x.date,x.category,x.description,x.amount])},
  receipts:{head:["Receipt reference","Invoice","Verified UGX","Source","Date"],rows:p.map(x=>[x.receipt,x.invoice,x.amount,x.source,x.verifiedAt])}
 };
 const discrepancies=i.filter(x=>x.overpaymentFlag);
 host.innerHTML='<div class="zfi-page"><header class="zfi-heading"><div><span>PROPERTY / FINANCIAL INTELLIGENCE</span><h3>Rent, costs and deposits</h3><p>Verified records and financial obligations for this property.</p></div><button type="button" class="zfi-button" id="zfi-refresh">Refresh report</button></header>'+
 '<div class="zfi-metrics">'+
 metric("Outstanding rent",s.outstanding,"Invoiced less verified payments")+
 metric("Overdue rent",s.overdue,"Unpaid balances past due date")+
 metric("Verified rent",s.totalVerified,"Evidence capped to invoice amounts")+
 metric("Recorded expenses",s.recordedExpenses,"Recorded property expenditure")+
 metric("Refundable deposits held",s.depositHeld,"Separate tenant liability")+
 metric("Rent invoiced",s.totalInvoiced,"Excludes void invoices")+'</div>'+
 '<p class="zfi-note">These are recorded and verified figures, not an audited profit statement or bank balance. Refundable security deposits are not rental income.</p>'+
 (discrepancies.length?'<div class="zfi-warning" role="status">'+discrepancies.length+' invoice(s) have verified evidence exceeding the invoiced amount. Review reconciliation.</div>':'')+
 section("Rent roll","Current configured rooms and associated resident agreements.",table(columns.roll.head,r,x=>[x.room,x.floor,x.status,x.resident||"Not assigned",ugx(x.configuredRent),x.agreementRent==null?"—":ugx(x.agreementRent),dt(x.rentStart)]),"roll")+
 section("Invoice reconciliation","Partial payments are subtracted using verified payment evidence.",table(columns.invoices.head,i,x=>[x.reference,x.resident||"—",ugx(x.invoiced),ugx(x.verifiedPaid),ugx(x.remaining),dt(x.due),x.status]),"invoices")+
 section("Property expenses","Expenses recorded for this property.",table(columns.expenses.head,e,x=>[dt(x.date),x.category,x.description,ugx(x.amount)]),"expenses")+
 section("Security deposit obligations","Verified refundable deposit holdings, deductions and refunds.",table(["Resident","Required","Verified held","Refunded","Deducted","Status"],d,x=>[x.resident||"—",ugx(x.required),ugx(x.verifiedHeld),ugx(x.refunded),ugx(x.deducted),x.status]),null)+
 section("Verified payment references","No receipts are generated without verified payment evidence.",table(columns.receipts.head,p,x=>[x.receipt||"Not assigned",x.invoice,ugx(x.amount),x.source,dt(x.verifiedAt)]),"receipts")+
 '<p class="zfi-note">As of '+esc(dt(data.asOf))+'. This report cannot collect money, modify invoices or initiate withdrawals.</p></div>';
 host.querySelector("#zfi-refresh").onclick=()=>load(host,propertyId);
 host.querySelectorAll("[data-zfi-export]").forEach(btn=>btn.onclick=()=>{
  const key=btn.dataset.zfiExport,entry=columns[key];
  if(entry)exportCsv(key+"-"+dt(data.asOf),entry.head,entry.rows);
 });
 window.ZimbaPrivacy?.refresh();
}
async function load(host,propertyId){
 const seq=++request;host.innerHTML='<p class="zfi-loading" role="status">Loading financial records securely…</p>';
 try{
  const data=await window.ZimbaAuth.propertyFinancialReport(propertyId);
  if(seq!==request||!host.isConnected||!host.closest("#zh-tab-panel"))return;
  if(!data||data.currency!=="UGX"||data.verifiedPaymentsOnly!==true)throw Error("Invalid financial report response");
  render(data,host,propertyId);
 }catch(err){
  if(seq!==request||!host.isConnected)return;
  host.innerHTML='<div class="zfi-error" role="alert"><h4>Financial report unavailable</h4><p>'+esc(err.message)+'</p><button type="button" class="zfi-button">Try again</button></div>';
  host.querySelector("button").onclick=()=>load(host,propertyId);
 }
}
function mount(propertyId){
 const panel=document.querySelector("#zh-tab-panel");if(!panel||!propertyId)return;
 panel.innerHTML='<div id="zfi-content"></div>';
 load(panel.querySelector("#zfi-content"),propertyId);
}
window.ZimbaFinancialIntelligence={mount};
})();