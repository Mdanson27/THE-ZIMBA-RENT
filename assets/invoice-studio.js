/* ZIMBA Rent Invoice Studio V3
 * This frontend prints real invoice data from authorised Neon RPCs.
 * In-app notifications are actually delivered by the DB RPC; email and WhatsApp
 * open user-owned composers, never represented as automatically sent.
 */
(()=>{
"use strict";
const auth=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG",{maximumFractionDigits:0});
const shortDate=v=>String(v||"").slice(0,10)||"Not specified";
const niceDate=v=>{const d=String(v||"").slice(0,10);if(!/^\d{4}-\d\d-\d\d$/.test(d))return shortDate(v);return new Date(d+"T12:00:00Z").toLocaleDateString("en-UG",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});};
const month=v=>{const d=String(v||"").slice(0,7);if(!/^\d{4}-\d\d$/.test(d))return d;return new Date(d+"-01T12:00:00Z").toLocaleDateString("en-UG",{month:"long",year:"numeric",timeZone:"UTC"});};
const safePhone=v=>String(v||"").replace(/[^\d]/g,"");
const root=()=>document.querySelector("#ziv-root");
const statusMap={
 paid:["Paid · verified","paid"],partial:["Partially paid","partial"],
 overdue:["Overdue","overdue"],unpaid:["Unpaid","unpaid"],void:["Void","void"]
};
const state={manager:false,invoices:[],leases:[],filter:"all",search:"",compose:null,requestId:0};
const find=id=>state.invoices.find(v=>v.id===id);
const statusLabel=x=>statusMap[x.status]||statusMap.unpaid;
const pill=x=>{const [label,tone]=statusLabel(x);return '<span class="ziv-pill '+tone+'">'+esc(label)+'</span>';};
function page(manager){
 return '<section class="ziv-page" id="ziv-root"><div class="ziv-head"><div><span class="ziv-overline">ZIMBA / RENT & FINANCES</span><h1>'+ (manager?"Rent invoices":"My rent invoices")+'</h1><p>'+
 (manager?"Issue property-specific rent invoices, print professional documents and choose how to share them with tenants.":"Review authentic rent invoices from your property manager, print them and view verified payment records.")+
 '</p></div><span class="ziv-head-tag">Secure billing · UGX</span></div>'+
 '<div class="ziv-notice" id="ziv-notice" role="status" aria-live="polite"></div>'+
 '<div id="ziv-content"><div class="ziv-loading">Loading verified invoice records…</div></div></section>';
}
function notice(message,bad=false){
 const box=root()?.querySelector("#ziv-notice");if(!box)return;
 box.textContent=message||"";box.className="ziv-notice"+(bad?" error":"");
}
function totals(){
 const invoices=state.invoices.filter(i=>i.status!=="void");
 const billed=invoices.reduce((a,i)=>a+Number(i.amount||0),0);
 const verified=invoices.reduce((a,i)=>a+Math.min(Number(i.amount||0),Number(i.verifiedPaid||0)),0);
 const due=invoices.reduce((a,i)=>a+Math.max(Number(i.balance||0),0),0);
 const late=invoices.filter(i=>i.status==="overdue").length;
 return '<div class="ziv-kpis">'+[
  ["Total invoiced",money(billed),"Excludes void invoices"],
  ["Verified payments",money(verified),"Only reconciled payment evidence"],
  ["Outstanding balance",money(due),late?late+" overdue invoice"+(late===1?"":"s"):"Across active invoices"]
 ].map(([label,value,caption])=>'<article class="ziv-kpi"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(caption)+'</span></article>').join("")+'</div>';
}
function approvedLeases(){
 return state.leases.filter(l=>l.status==="acknowledged");
}
function issuePanel(){
 const leases=approvedLeases();
 const monthValue=new Date().toISOString().slice(0,7);
 return '<section class="ziv-card ziv-create"><div class="ziv-card-title"><span class="ziv-section-icon">01</span><div><h2>Issue rent invoice</h2><p>A real invoice is saved to Neon and appears in the tenant portal.</p></div></div>'+
 (!leases.length?'<p class="ziv-empty">No acknowledged rental agreements are currently eligible for invoicing. Prepare and acknowledge a rental agreement first.</p>':
 '<form id="ziv-issue-form"><div class="ziv-form-grid">'+
 '<label>Approved rental agreement<select name="lease" required>'+leases.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.tenant)+' · '+esc(l.property)+'</option>').join("")+'</select></label>'+
 '<label>Billing month<input name="period" type="month" required value="'+esc(monthValue)+'"></label></div>'+
 '<p class="ziv-explainer">The rent amount, billable days and due date come from the saved agreement. Duplicate invoices for the same billing period are blocked. Issuing an invoice automatically notifies the tenant in ZIMBA.</p>'+
 '<button class="ziv-button primary" type="submit">Issue invoice</button></form>')+
 '</section>';
}
function invoiceCard(i){
 const isVoid=i.status==="void";
 return '<article class="ziv-invoice"><div class="ziv-invoice-main"><div class="ziv-invoice-ref"><span>'+esc(i.reference)+'</span>'+pill(i)+'</div>'+
 '<h3>'+esc(i.tenant||"Tenant")+'</h3>'+
 '<p>'+esc(i.property||"Property")+(i.unit?' · Unit '+esc(i.unit):"")+' · '+esc(month(i.periodStart))+'</p>'+
 '<div class="ziv-facts"><span><small>Invoice amount</small><b>'+money(i.amount)+'</b></span>'+
 '<span><small>Verified paid</small><b>'+money(i.verifiedPaid)+'</b></span>'+
 '<span><small>Balance due</small><b class="ziv-balance">'+money(i.balance)+'</b></span>'+
 '<span><small>Due date</small><b>'+niceDate(i.due)+'</b></span></div>'+
 (i.lastInAppAt?'<small class="ziv-delivered">Last in-app '+esc(i.lastInAppKind||"invoice")+' · '+niceDate(i.lastInAppAt)+'</small>':"")+
 '</div><div class="ziv-invoice-actions"><button type="button" class="ziv-button subtle" data-ziv-print="'+esc(i.id)+'">View / Print invoice</button>'+
 (state.manager&&!isVoid?'<button type="button" class="ziv-button primary" data-ziv-share="'+esc(i.id)+'">Share invoice</button>':"")+
 '</div></article>';
}
function records(){
 const list=state.invoices.filter(i=>{
  const needle=(i.reference+" "+i.tenant+" "+i.property+" "+i.unit).toLowerCase();
  return (state.filter==="all"||i.status===state.filter)&&needle.includes(state.search.toLowerCase().trim());
 });
 return '<section class="ziv-card ziv-records"><div class="ziv-record-title"><div><h2>'+ (state.manager?"Invoice register":"Your invoices")+'</h2><p>Every document uses saved billing records. Verified payments are listed separately from amounts still owed.</p></div><span class="ziv-result">'+list.length+' invoices</span></div>'+
 '<div class="ziv-filters"><label class="ziv-search"><span>Find invoice</span><input id="ziv-search" type="search" placeholder="Search reference, tenant or property" value="'+esc(state.search)+'"></label>'+
 '<label class="ziv-filter"><span>Status</span><select id="ziv-filter">'+[
 ["all","All statuses"],["unpaid","Unpaid"],["overdue","Overdue"],["partial","Partially paid"],["paid","Paid"],["void","Void"]
 ].map(([v,k])=>'<option value="'+v+'"'+(state.filter===v?" selected":"")+'>'+k+'</option>').join("")+'</select></label></div>'+
 '<div class="ziv-list">'+(list.length?list.map(invoiceCard).join(""):'<div class="ziv-empty">No invoices match these filters.</div>')+'</div></section>';
}
function shareText(i,intent){
 const payment=Number(i.balance||0),total=money(i.amount);
 const link="https://mdanson27.github.io/THE-ZIMBA-RENT/#/workspace/invoices";
 const opening="Hello "+String(i.tenant||"Tenant").trim()+",";
 const intro=intent==="reminder"?"This is a reminder about your outstanding rent invoice.":"Your rent invoice is available in ZIMBA RENT.";
 return [opening,"",intro,
  "Property: "+i.property+(i.unit?" · Unit "+i.unit:""),
  "Invoice: "+i.reference,
  "Billing period: "+month(i.periodStart)+" ("+niceDate(i.periodStart)+"–"+niceDate(i.periodEnd)+")",
  "Invoice amount: "+total,
  "Verified payments: "+money(i.verifiedPaid),
  "Balance: "+money(payment),
  "Due date: "+niceDate(i.due),"",
  "Sign in to view or print your invoice: "+link,
  "Please verify payment instructions directly with the property manager. This message is not a receipt.",
  "", "Issued by "+(i.landlord||"Property management")+" through ZIMBA RENT."
 ].join("\n");
}
function sharePanel(){
 if(!state.manager||!state.compose)return"";
 const i=find(state.compose.id);if(!i)return"";
 const kind=state.compose.intent,channel=state.compose.channel;
 const email=i.tenantEmail||"",phone=state.compose.phone;
 return '<section class="ziv-card ziv-share" id="ziv-share-panel"><div class="ziv-record-title"><div><span class="ziv-overline">DELIVER & COMMUNICATE</span><h2>Share '+esc(i.reference)+'</h2><p>'+esc(i.tenant)+' · '+esc(i.property)+'</p></div>'+
 '<button class="ziv-close" id="ziv-close-share" type="button" aria-label="Close sharing panel">×</button></div>'+
 '<div class="ziv-form-grid"><label>Channel<select id="ziv-channel">'+[
 ["in_app","ZIMBA in-app notification"],["email","Email — open message draft"],["whatsapp","WhatsApp — open chat draft"]
 ].map(([value,label])=>'<option value="'+value+'"'+(channel===value?" selected":"")+'>'+label+'</option>').join("")+'</select></label>'+
 '<label>Purpose<select id="ziv-intent">'+[
 ["invoice","Send invoice"],["reminder","Payment reminder"]
 ].filter(([value])=>value!=="reminder"||Number(i.balance)>0).map(([value,label])=>'<option value="'+value+'"'+(kind===value?" selected":"")+'>'+label+'</option>').join("")+'</select></label></div>'+
 (channel==="email"?'<div class="ziv-channel-note"><b>To:</b> '+esc(email||"No tenant email on file")+
 (i.tenantEmailVerified===false?' <span>(account email not verified)</span>':"")+
 '<p>Email opens your device’s mail application. ZIMBA does not send the email or attach a PDF automatically. Print / Save PDF first if you want to attach it manually.</p></div>':
 channel==="whatsapp"?'<div class="ziv-channel-note"><label>Recipient WhatsApp number (international format)<input id="ziv-whatsapp-number" type="tel" inputmode="tel" placeholder="2567XXXXXXXX" value="'+esc(phone||"")+'"></label>'+
 '<p>WhatsApp opens a prefilled chat for you to review and press Send. The actual invoice PDF must be attached manually if needed. ZIMBA does not verify WhatsApp delivery.</p></div>':
 '<div class="ziv-channel-note"><b>In-app delivery</b><p>A new notification is saved in the tenant’s authenticated ZIMBA account. For each invoice and message type, repeated in-app sends are limited to once every 24 hours. A notification was already sent when this invoice was first issued.</p></div>')+
 '<label class="ziv-message-label">Message to tenant<textarea id="ziv-message" rows="10" minlength="10" maxlength="700">'+esc(state.compose.message)+'</textarea></label>'+
 '<div class="ziv-share-bottom"><button class="ziv-button primary" id="ziv-send-share" type="button">'+
 (channel==="in_app"?"Send in ZIMBA":channel==="email"?"Open email draft":"Open WhatsApp chat")+
 '</button><button class="ziv-button subtle" id="ziv-copy-message" type="button">Copy message</button>'+
 '<button class="ziv-button subtle" data-ziv-print="'+esc(i.id)+'" type="button">Print / Save PDF</button></div>'+
 '<p class="ziv-privacy">External channels disclose the prepared invoice details to your chosen email or messaging provider only when you open that composer. Never report an external message as delivered until you independently verify it.</p></section>';
}
function draw(){
 const dest=root()?.querySelector("#ziv-content");if(!dest)return;
 dest.innerHTML=totals()+(state.manager?issuePanel():"")+records()+sharePanel()+
 '<p class="ziv-disclaimer"><b>Billing document, not proof of payment.</b> Invoices are generated for the landlord or authorised property manager through ZIMBA RENT. Verified receipts only appear after reconciled payment evidence is recorded. This is not a URA EFRIS fiscal receipt.</p>';
 bind();window.ZimbaPrivacy?.refresh();
}
async function load(manager){
 const host=root();if(!host)return;
 const run=++state.requestId;state.manager=!!manager;
 try{
  const [items,leases]=await Promise.all([
   manager?auth().managerInvoiceDocuments():auth().tenantInvoiceDocuments(),
   manager?auth().managerLeases():Promise.resolve([])
  ]);
  if(run!==state.requestId||!host.isConnected)return;
  state.invoices=Array.isArray(items)?items:[];
  state.leases=Array.isArray(leases)?leases:[];
  if(state.compose&&!find(state.compose.id))state.compose=null;
  draw();
 }catch(err){
  if(run!==state.requestId||!host.isConnected)return;
  host.querySelector("#ziv-content").innerHTML='<div class="ziv-card ziv-empty"><h2>Unable to load invoices</h2><p>'+esc(err.message)+'</p><button type="button" id="ziv-retry" class="ziv-button subtle">Retry secure connection</button></div>';
  host.querySelector("#ziv-retry")?.addEventListener("click",()=>load(manager));
 }
}
function printHTML(i){
 const sum=money(i.amount),paid=money(i.verifiedPaid),balance=money(i.balance);
 const receiptList=Array.isArray(i.receipts)?i.receipts:[];
 const address=[i.propertyAddress,i.city,i.country||"Uganda"].filter(Boolean).join(", ");
 const label=statusLabel(i)[0];
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(i.reference)+' | ZIMBA Rent Invoice</title>'+
 '<style>@page{size:A4;margin:14mm 16mm}*{box-sizing:border-box}body{margin:0;font:10.5pt/1.55 Arial,Helvetica,sans-serif;color:#20342a;background:white}.page{max-width:850px;margin:auto}.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;margin-bottom:18px;background:#eef5ef}.topbar button{background:#1d5438;border:0;border-radius:7px;color:white;padding:9px 18px;cursor:pointer}.doc-top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #205c3d;padding-bottom:18px}.brand{font-size:22pt;color:#1e573e;font-weight:800;letter-spacing:-1.8px}.brand span{color:#81aa8a}.eyebrow{letter-spacing:.18em;color:#789783;font-size:8pt;font-weight:700;text-transform:uppercase}.doc-title{text-align:right}.doc-title h1{font-size:19pt;margin:6px 0 2px;color:#173f2b}.doc-title span{display:block;font-size:9pt;color:#52735d}.parties{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin:30px 0}.parties section{min-width:0}.parties h2,.meta th{text-transform:uppercase;color:#64836e;font-size:8pt;letter-spacing:.08em;margin:0 0 8px}.parties strong{font-size:12pt;color:#173f2b}.parties p{margin:4px 0;overflow-wrap:anywhere}.meta{border:1px solid #d4e4d7;border-collapse:collapse;width:100%;margin-bottom:30px}.meta td{padding:12px;border-right:1px solid #d4e4d7;width:25%;vertical-align:top}.meta td:last-child{border-right:0}.meta small{display:block;font-size:8pt;color:#739280}.meta strong{font-size:9.5pt}.status{margin-top:10px;display:inline-block;padding:5px 9px;border:1px solid #bcd4c3;background:#ebf5ee;color:#285c3f;border-radius:5px;font-size:8pt;font-weight:800}.items{border-collapse:collapse;width:100%;margin-top:10px}.items th{text-align:left;padding:12px 10px;color:white;background:#22563c;font-size:9pt}.items td{border-bottom:1px solid #dbe7dd;padding:15px 10px;vertical-align:top}.items th:last-child,.items td:last-child{text-align:right}.sub{display:block;color:#6f8876;font-size:8.5pt;margin-top:5px}.summary{width:47%;margin:24px 0 24px auto;border:1px solid #d4e4d8;border-radius:9px;padding:14px 17px}.summary div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;font-size:9pt}.summary div.total{border-top:2px solid #22583d;margin-top:7px;padding-top:13px;font-size:13pt;color:#15442e;font-weight:800}.paid{color:#357452}.payment{background:#f3f8f3;border:1px solid #deeadf;border-radius:8px;padding:16px 19px;margin:24px 0}.payment h2{font-size:10.5pt;color:#214e34;margin:0 0 7px}.payment p{font-size:9pt;margin:6px 0}.receipt{font-size:9pt;border-top:1px solid #dbe7df;padding:7px 0}.legal{font-size:8pt;color:#627e69;line-height:1.65;border-top:1px solid #dce9df;padding-top:13px}.foot{margin-top:27px;font-size:8pt;color:#708d78;display:flex;align-items:center;justify-content:space-between}@media print{.topbar{display:none}.page{max-width:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.parties,.meta,.payment,.summary{break-inside:avoid}}</style></head><body>'+
 '<div class="topbar"><strong>Invoice '+esc(i.reference)+'</strong><button onclick="window.print()">Print / Save as PDF</button></div>'+
 '<main class="page"><header class="doc-top"><div><div class="brand">zimba<span>.</span></div><div class="eyebrow">Property management · Billing</div><p style="margin:7px 0 0;font-size:9pt;color:#617e6a">Prepared through ZIMBA RENT</p></div>'+
 '<div class="doc-title"><h1>RENT INVOICE</h1><span>Invoice No. '+esc(i.reference)+'</span><div class="status">'+esc(label)+'</div></div></header>'+
 '<div class="parties"><section><h2>Issued by</h2><strong>'+esc(i.landlord||"Landlord / Property management")+'</strong><p>'+esc(i.property)+'</p><p>'+esc(address||"Uganda")+'</p></section>'+
 '<section><h2>Billed to</h2><strong>'+esc(i.tenant||"Tenant")+'</strong><p>'+esc(i.tenantEmail||"")+'</p><p>'+esc(i.unit?"Unit "+i.unit+" · ":"")+esc(i.property)+'</p></section></div>'+
 '<table class="meta"><tr><td><small>Issue date</small><strong>'+niceDate(i.issuedAt)+'</strong></td><td><small>Billing period</small><strong>'+esc(month(i.periodStart))+'</strong></td>'+
 '<td><small>Period covered</small><strong>'+niceDate(i.periodStart)+' – '+niceDate(i.periodEnd)+'</strong></td><td><small>Payment due</small><strong>'+niceDate(i.due)+'</strong></td></tr></table>'+
 '<table class="items"><thead><tr><th>Description</th><th>Quantity</th><th>Unit amount (UGX)</th><th>Amount (UGX)</th></tr></thead><tbody>'+
 '<tr><td><strong>Rent — '+esc(i.property)+'</strong><span class="sub">'+(i.unit?'Unit '+esc(i.unit)+' · ':'')+esc(month(i.periodStart))+' · '+niceDate(i.periodStart)+' to '+niceDate(i.periodEnd)+'</span></td>'+
 '<td>1</td><td>'+Number(i.amount).toLocaleString("en-UG")+'</td><td>'+Number(i.amount).toLocaleString("en-UG")+'</td></tr></tbody></table>'+
 '<div class="summary"><div><span>Total rent invoiced</span><b>'+sum+'</b></div><div class="paid"><span>Less verified payments</span><b>− '+paid+'</b></div>'+
 '<div class="total"><span>Balance due</span><strong>'+balance+'</strong></div></div>'+
 '<section class="payment"><h2>Payment instructions</h2><p>Use the payment method already agreed with your landlord or authorised property manager. Always confirm recipient details through a trusted channel before transferring funds.</p>'+
 '<p><b>Payment reference:</b> '+esc(i.reference)+'</p><p>View your up-to-date billing record by signing into ZIMBA RENT. This invoice is not a receipt.</p></section>'+
 (receiptList.length?'<section class="payment"><h2>Verified payment records</h2>'+receiptList.map(r=>'<div class="receipt">'+esc(r.reference)+' · '+money(r.amount)+' · verified '+niceDate(r.verifiedAt)+'</div>').join("")+'</section>':"")+
 '<div class="legal">This invoice was generated for the named property-management organisation through ZIMBA RENT using the saved tenancy and billing records. It is a request for rent payment, not confirmation of receipt, proof of ownership, or a URA EFRIS fiscal tax invoice. The refundable security deposit is not included in the rental charge. Only verified and reconciled payment records are reflected above.</div>'+
 '<footer class="foot"><span>zimba. · Your private space</span><span>'+esc(i.reference)+' · End of invoice</span></footer></main></body></html>';
}
function print(id){
 const i=find(id);if(!i)return;
 const w=window.open("","_blank","width=1000,height=920");
 if(!w){notice("Enable pop-ups to preview and print this invoice.",true);return;}
 w.document.open();w.document.write(printHTML(i));w.document.close();w.focus();
}
function showShare(id){
 const inv=find(id);if(!inv||inv.status==="void")return;
 state.compose={id,channel:"in_app",intent:"invoice",phone:inv.tenantPhone||"",
  message:shareText(inv,"invoice")};
 draw();
 root()?.querySelector("#ziv-share-panel")?.scrollIntoView({block:"nearest",behavior:"smooth"});
}
function saveDraft(){
 const comp=state.compose;if(!comp)return;
 const textarea=root()?.querySelector("#ziv-message");
 if(textarea)comp.message=textarea.value;
 const phone=root()?.querySelector("#ziv-whatsapp-number");
 if(phone)comp.phone=phone.value;
}
function changeChannel(value){
 saveDraft();if(!state.compose)return;
 state.compose.channel=value;draw();
 root()?.querySelector("#ziv-share-panel")?.scrollIntoView({block:"nearest"});
}
function changeIntent(value){
 if(!state.compose)return;
 const inv=find(state.compose.id);if(!inv)return;
 state.compose.intent=value;state.compose.message=shareText(inv,value);draw();
 root()?.querySelector("#ziv-share-panel")?.scrollIntoView({block:"nearest"});
}
async function share(){
 const c=state.compose;if(!c)return;
 saveDraft();const i=find(c.id),msg=c.message.trim();
 if(!i){notice("The invoice could not be found. Refresh the register.",true);return;}
 if(msg.length<10||msg.length>700){notice("Keep the message between 10 and 700 characters.",true);return;}
 if(c.intent==="reminder"&&Number(i.balance)<=0){notice("You cannot send a payment reminder for an invoice with no balance due.",true);return;}
 if(c.channel==="in_app"){
  const btn=root()?.querySelector("#ziv-send-share");if(btn)btn.disabled=true;
  notice("Delivering an authenticated in-app notification…");
  try{
   await auth().deliverInvoiceInApp(i.id,c.intent,msg);
   state.compose=null;await load(true);
   notice("In-app notification delivered to the tenant's ZIMBA account.");
  }catch(e){notice("In-app delivery failed: "+e.message,true);if(btn)btn.disabled=false;}
  return;
 }
 if(c.channel==="email"){
  if(!i.tenantEmail){notice("The connected tenant has no email address available in their account.",true);return;}
  const subject=(c.intent==="reminder"?"Rent payment reminder":"Rent invoice")+" "+i.reference+" — "+i.property;
  const uri="mailto:"+encodeURIComponent(i.tenantEmail)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(msg);
  window.location.href=uri;
  notice("Email draft opened in your mail application. Review, attach the printed PDF if required, and press Send yourself. ZIMBA has not sent or verified this email.");
  return;
 }
 if(c.channel==="whatsapp"){
  const phone=safePhone(c.phone);
  if(phone.length<8||phone.length>15||/^0/.test(phone)){notice("Enter a valid international WhatsApp number, including country code (for example 2567XXXXXXXX).",true);return;}
  window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(msg),"_blank","noopener,noreferrer");
  notice("WhatsApp chat opened with a prepared message. Review the recipient and press Send yourself. ZIMBA has not sent or verified a WhatsApp message.");
 }
}
async function issue(e){
 e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');
 const v=new FormData(form),lease=v.get("lease"),period=v.get("period");
 if(!lease||!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period||""))){notice("Select an approved rental agreement and a valid billing month.",true);return;}
 btn.disabled=true;notice("Issuing your invoice and notifying the tenant in ZIMBA…");
 try{
  const result=await auth().issueRentInvoice(lease,period+"-01");
  await load(true);
  notice("Invoice issued. The tenant received a ZIMBA in-app notification. Select Share invoice for email or WhatsApp.");
  const created=find(result.id);
  if(created){const card=root()?.querySelector('[data-ziv-share="'+result.id+'"]');card?.focus();}
 }catch(err){notice("Could not issue invoice: "+err.message,true);btn.disabled=false;}
}
function bind(){
 const r=root();if(!r)return;
 r.querySelector("#ziv-issue-form")?.addEventListener("submit",issue);
 r.querySelector("#ziv-search")?.addEventListener("input",e=>{state.search=e.target.value;const focus=e.target.selectionStart;draw();const input=root()?.querySelector("#ziv-search");input?.focus();if(typeof focus==="number")input?.setSelectionRange(focus,focus);});
 r.querySelector("#ziv-filter")?.addEventListener("change",e=>{state.filter=e.target.value;draw();});
 r.querySelectorAll("[data-ziv-print]").forEach(b=>b.addEventListener("click",()=>print(b.dataset.zivPrint)));
 r.querySelectorAll("[data-ziv-share]").forEach(b=>b.addEventListener("click",()=>showShare(b.dataset.zivShare)));
 r.querySelector("#ziv-close-share")?.addEventListener("click",()=>{state.compose=null;draw();});
 r.querySelector("#ziv-channel")?.addEventListener("change",e=>changeChannel(e.target.value));
 r.querySelector("#ziv-intent")?.addEventListener("change",e=>changeIntent(e.target.value));
 r.querySelector("#ziv-message")?.addEventListener("input",e=>{if(state.compose)state.compose.message=e.target.value;});
 r.querySelector("#ziv-whatsapp-number")?.addEventListener("input",e=>{if(state.compose)state.compose.phone=e.target.value;});
 r.querySelector("#ziv-send-share")?.addEventListener("click",share);
 r.querySelector("#ziv-copy-message")?.addEventListener("click",async()=>{
  saveDraft();try{await navigator.clipboard.writeText(state.compose?.message||"");notice("Invoice message copied. No message was sent.");}catch{notice("Clipboard unavailable. Select and copy the message manually.",true);}
 });
}
window.ZimbaInvoiceStudio={page,load,printHTML,shareText,statusLabel,safePhone,money};
})();