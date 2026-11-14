/* ZIMBA Rental Contracts V2 — saved drafts, printable agreements and private dual-confirmed signed PDFs.
 * The scanned PDF is evidence provided by users, NOT forensic signature verification.
 */
(()=>{
"use strict";
const api=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG",{maximumFractionDigits:0});
const date=v=>v?String(v).slice(0,10):"Not specified";
const uuid=v=>String(v||"").slice(0,8).toUpperCase();
const templates={
 terms:"The landlord lets the residential premises identified in this agreement to the tenant for the agreed term. Rent is payable on the agreed date and in the agreed manner. The parties shall record meter readings and agree upon payment of applicable utilities, lawful access and inspection, care and maintenance obligations, permitted occupancy, notices and termination procedures. Changes to rent and any other material terms shall comply with applicable law and any written agreement between the parties. The premises must be fit for habitation at commencement.",
 deposit:"The security deposit is separate from rent and is refundable subject to lawful deductions. The deposit shall not exceed the permitted statutory limit. The landlord shall provide a written receipt for any deposit actually received. Any withholding must be explained in writing and supported by actual lawful obligations or damage beyond ordinary wear and tear. Any refundable balance shall be returned in accordance with applicable law and the agreed terms."
};
let state={manager:false,items:[],people:[],active:null,reviewed:null,busy:false,formChoice:"",requestId:0};
const root=()=>document.querySelector("#zrl-root");
const statusData=l=>l.docStatus==="signed"?["Signed · both confirmed","signed"]:
 l.docStatus==="pending_tenant_confirmation"?["Awaiting tenant confirmation","pending"]:
 l.status==="draft"?["Draft · editable","draft"]:
 l.status==="acknowledged"?["Terms acknowledged · not signed","not-signed"]:
 ["Issued · not signed","not-signed"];
function page(manager){
 return '<section class="zrl-page" id="zrl-root"><header class="zrl-head"><div><span class="zrl-overline">ZIMBA / AGREEMENTS & EXECUTION</span><h1>'+ (manager?"Rental agreements":"My rental agreements")+
 '</h1><p>'+(manager?"Prepare an agreement for a specific property, print it for signatures, and securely retain the executed copy.":"View your landlord’s agreement, review the uploaded signed PDF, and confirm only the exact document you have checked.")+
 '</p></div><span class="zrl-head-label">Private · organisation-scoped</span></header><div id="zrl-status" role="status" aria-live="polite"></div><div id="zrl-body" aria-live="off"><div class="zrl-loading">Loading saved agreements securely…</div></div></section>';
}
function message(msg,bad=false){const el=root()?.querySelector("#zrl-status");if(el){el.textContent=msg||"";el.className=bad?"zrl-status zrl-danger":"zrl-status";}}
const pill=l=>{const [label,tone]=statusData(l);return '<span class="zrl-pill '+tone+'">'+esc(label)+'</span>';};
const fmtNumber=v=>v!==null&&v!==undefined?Number(v):"";
const findLease=connection=>state.items.find(x=>x.connectionId===connection);
const findRecord=id=>state.items.find(x=>x.id===id);
const stageLabels=["1. Save draft","2. Issue & print","3. Sign on paper","4. Upload both signatures","5. Tenant confirms"];
function tracker(){return '<div class="zrl-workflow">'+stageLabels.map((t,i)=>'<span><b>'+String(i+1).padStart(2,"0")+'</b> '+esc(t.replace(/^\d\. /,""))+'</span>').join("")+'</div>';}
function selectEntries(){
 const people=state.people.filter(p=>p.connection_id).map(p=>({id:p.connection_id,name:p.resident_name||"Tenant",property:p.property_title||"Property"}));
 for(const lease of state.items)if(!people.some(x=>x.id===lease.connectionId))people.push({id:lease.connectionId,name:lease.tenant,property:lease.property});
 return people;
}
function editor(){
 const people=selectEntries();
 const selected=state.formChoice||people[0]?.id||"",lease=findLease(selected);
 const readonly=!!lease&&lease.status!=="draft";
 const source=lease||{};
 return '<section class="zrl-panel zrl-editor"><div class="zrl-panel-header"><div><span class="zrl-eyebrow">DOCUMENT BUILDER</span><h2>Create or edit a rental agreement</h2><p>Drafts are saved in Neon and remain editable until issued. The printable version includes signature lines.</p></div><span class="zrl-subtle">UGX · Uganda</span></div>'+
 (!people.length?'<div class="zrl-empty">No approved resident assigned to a unit. Connect and assign a resident from the Residents section first.</div>':
 '<form id="zrl-edit-form" class="zrl-form">'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>01</b><div><h3>Property & tenant</h3><p>Use an approved resident connected to the correct property and room.</p></div></div>'+
 '<label>Connected tenant / property<select name="connection" id="zrl-connection" required>'+people.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selected?"selected":"")+'>'+esc(p.name)+' · '+esc(p.property)+'</option>').join("")+'</select></label>'+
 (lease?'<p class="zrl-associated">Agreement reference: ZR-'+uuid(lease.id)+' · '+pill(lease)+'</p>':"")+
 '</div>'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>02</b><div><h3>Rent, term & deposit</h3><p>Record the agreed amounts. Security deposits are liabilities, not rent received.</p></div></div>'+
 '<div class="zrl-fields"><label>Start date<input name="start" type="date" value="'+esc(date(source.start)==="Not specified"?"":source.start)+'" required '+(readonly?"disabled":"")+'></label>'+
 '<label>End date (optional)<input name="end" type="date" value="'+esc(source.end||"")+'" '+(readonly?"disabled":"")+'></label>'+
 '<label>Monthly rent · UGX<input name="rent" type="number" min="1" step="1" value="'+esc(fmtNumber(source.rent))+'" required '+(readonly?"disabled":"")+'></label>'+
 '<label>Refundable security deposit · UGX<input name="deposit" type="number" min="1" step="1" value="'+esc(fmtNumber(source.deposit))+'" required '+(readonly?"disabled":"")+'></label></div></div>'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>03</b><div><h3>Editable agreement clauses</h3><p>These become part of the printable agreement. Review the clauses with both parties.</p></div></div>'+
 '<label>Terms and conditions<textarea name="terms" rows="7" minlength="50" maxlength="10000" required '+(readonly?"disabled":"")+'>'+esc(source.terms||templates.terms)+'</textarea></label>'+
 '<label>Deposit withholding and refund conditions<textarea name="depositTerms" rows="5" minlength="20" maxlength="3000" required '+(readonly?"disabled":"")+'>'+esc(source.depositTerms||templates.deposit)+'</textarea></label></div>'+
 (readonly?'<div class="zrl-notice"><b>Issued agreement — editing locked.</b> Once an agreement has been issued, its recorded terms cannot be silently rewritten. Print the issued version or use a new formal amendment process.</div>':
 '<div class="zrl-actions"><button class="zrl-button secondary" type="submit" name="action" value="draft">Save editable draft</button><button class="zrl-button primary" type="submit" name="action" value="issue">Issue to tenant</button></div>')+
 '<p class="zrl-footnote">The agreement is not signed when saved or issued. A separate copy signed by both parties must be uploaded and confirmed by the tenant.</p></form>')+
 '</section>';
}
function register(){
 const list=state.items;const drafts=list.filter(x=>x.status==="draft").length;
 const signed=list.filter(x=>x.docStatus==="signed").length;
 return '<section class="zrl-panel zrl-register"><div class="zrl-panel-header"><div><span class="zrl-eyebrow">SECURE AGREEMENT REGISTER</span><h2>Saved agreements</h2><p>Drafts, issued copies and confirmed signed PDFs remain separate.</p></div><span class="zrl-subtle">'+list.length+' total · '+drafts+' drafts · '+signed+' signed</span></div>'+
 (list.length?'<div class="zrl-record-list">'+list.map(l=>{
 const editable=l.status==="draft",signedDoc=l.docStatus==="signed";
 return '<article class="zrl-record"><div class="zrl-record-info"><div class="zrl-record-top"><span>ZR-'+uuid(l.id)+'</span>'+pill(l)+'</div>'+
 '<h3>'+esc(l.tenant)+'</h3><p>'+esc(l.property)+(l.room?' · Unit '+esc(l.room):"")+'</p>'+
 '<div class="zrl-small-facts"><span>'+money(l.rent)+' / month</span><span>From '+date(l.start)+'</span><span>Deposit '+money(l.deposit)+'</span></div>'+
 (l.scanHash?'<small class="zrl-hash">Stored signed copy: v'+Number(l.scanRevision)+' · SHA-256 '+esc(l.scanHash.slice(0,12))+'…</small>':'')+
 '</div><div class="zrl-record-actions">'+
 (editable?'<button class="zrl-button secondary" data-zrl-edit="'+esc(l.connectionId)+'" type="button">Edit draft</button>':"")+
 '<button class="zrl-button secondary" data-zrl-print="'+esc(l.id)+'" type="button">Print / Save PDF</button>'+
 (l.scanId?'<button class="zrl-button secondary" data-zrl-view="'+esc(l.scanId)+'" type="button">Download signed PDF</button>':"")+
 (!signedDoc&&!editable?'<button class="zrl-button primary" data-zrl-upload="'+esc(l.id)+'" type="button">Upload signed copy</button>':"")+
 '</div></article>';
 }).join("")+'</div>':'<p class="zrl-empty">No agreements saved yet. Save a draft from the agreement builder.</p>')+
 '</section>';
}
function uploadPanel(leaseId){
 const l=findRecord(leaseId);if(!l)return"";
 return '<section class="zrl-upload" id="zrl-upload"><div class="zrl-upload-head"><div><span class="zrl-eyebrow">SIGNED DOCUMENT ARCHIVE</span><h3>Upload signed PDF · '+esc(l.property)+'</h3></div><button type="button" class="zrl-close" id="zrl-close-upload" aria-label="Close upload form">×</button></div>'+
 '<p>Print the agreement and have the landlord/authorised representative and the tenant sign it. Scan the complete signed document as one PDF, then upload it. Maximum file size: 3 MB.</p>'+
 '<form id="zrl-upload-form"><label>Signed agreement (PDF only)<input name="pdf" type="file" accept=".pdf,application/pdf" required></label>'+
 '<label class="zrl-check"><input name="attest" type="checkbox" required><span>I have checked the complete PDF, can see <b>both parties’ signatures</b>, and confirm it is the same agreement issued for this property. I understand that uploading alone does not mark it signed.</span></label>'+
 '<div class="zrl-actions"><button type="submit" class="zrl-button primary">Upload & request tenant confirmation</button><button type="button" class="zrl-button secondary" id="zrl-cancel-upload">Cancel</button></div><p class="zrl-upload-error" role="alert"></p></form>'+
 '<p class="zrl-footnote">Uploaded copies are private, versioned and cannot be replaced after tenant confirmation. This process does not automatically detect forged handwritten signatures.</p></section>';
}
function managerHTML(){
 return tracker()+'<div class="zrl-workspace">'+editor()+register()+'</div><div id="zrl-upload-slot"></div>'+
 '<p class="zrl-disclosure">Written agreements should be reviewed against the applicable Uganda Landlord and Tenant Act and prescribed form. The parties must verify identities and exchange executed copies. A ZIMBA draft or acknowledgement is not itself a signature.</p>';
}
function tenantHTML(){
 return '<div class="zrl-tenant-intro"><h2>Your agreement documents</h2><p>Download the agreement, inspect the signed copy when uploaded, and confirm only after checking the signatures and terms.</p></div>'+
 (state.items.length?'<div class="zrl-tenant-list">'+state.items.map(l=>{
 const reviewed=state.reviewed===l.scanId+":"+l.scanHash;
 return '<article class="zrl-panel zrl-tenant-card"><div class="zrl-record-top"><span>ZR-'+uuid(l.id)+'</span>'+pill(l)+'</div>'+
 '<h2>'+esc(l.property)+'</h2><p>'+esc(l.room?"Unit "+l.room+" · ":"")+esc(l.landlord||"Property management")+'</p>'+
 '<div class="zrl-tenant-facts"><div><span>Monthly rent</span><strong>'+money(l.rent)+'</strong></div><div><span>Refundable deposit</span><strong>'+money(l.deposit)+'</strong></div><div><span>Start date</span><strong>'+date(l.start)+'</strong></div></div>'+
 '<details><summary>Read saved agreement terms</summary><h3>Tenancy terms</h3><p class="zrl-term-text">'+esc(l.terms)+'</p><h3>Deposit conditions</h3><p class="zrl-term-text">'+esc(l.depositTerms)+'</p></details>'+
 '<div class="zrl-actions"><button type="button" class="zrl-button secondary" data-zrl-print="'+esc(l.id)+'">Print / Save agreement as PDF</button>'+
 (l.scanId?'<button type="button" class="zrl-button primary" data-zrl-view="'+esc(l.scanId)+'">Review downloaded signed PDF</button>':"")+'</div>'+
 (l.docStatus==="pending_tenant_confirmation"?'<div class="zrl-confirm"><h3>Confirm the uploaded signed copy</h3>'+
 '<p>The property manager has attested that both parties signed the document. First open the actual PDF above, compare every page with the agreed terms, and check your signature.</p>'+
 '<small class="zrl-hash">PDF fingerprint: '+esc(l.scanHash||"")+'</small>'+
 '<label class="zrl-check"><input type="checkbox" data-zrl-confirm-check="'+esc(l.id)+'" '+(reviewed?"":"disabled")+'> I have reviewed this exact PDF and confirm that it contains both parties’ signatures and the agreement we signed.</label>'+
 '<button class="zrl-button primary" type="button" data-zrl-confirm="'+esc(l.id)+'" '+(reviewed?"":"disabled")+'>Confirm this signed copy</button>'+
 '<p class="zrl-footnote">This action records your authenticated confirmation and permanently marks this version as signed. It does not electronically draw or forge a signature.</p></div>':"")+
 (l.docStatus==="signed"?'<div class="zrl-signed-note"><b>Both parties confirmed this saved signed document.</b><p>Confirmed '+date(l.tenantConfirmedAt)+' · Copy v'+Number(l.scanRevision)+'. You can download the exact archived PDF above.</p></div>':"")+
 '</article>';
 }).join("")+'</div>':'<div class="zrl-panel"><p>No rental agreements have been issued to this account yet.</p></div>');
}
function sync(){
 const body=root()?.querySelector("#zrl-body");if(!body)return;
 body.innerHTML=state.manager?managerHTML():tenantHTML();
 wire();
 window.ZimbaPrivacy?.refresh();
}
async function load(manager){
 const host=root();if(!host)return;
 const seq=++state.requestId;state.manager=!!manager;message("");
 try{
  const [leases,people]=await Promise.all([
   manager?api().managerLeaseContracts():api().tenantLeaseContracts(),
   manager?api().managerThreads():Promise.resolve([])
  ]);
  if(seq!==state.requestId||!host.isConnected)return;
  state.items=Array.isArray(leases)?leases:[];state.people=Array.isArray(people)?people:[];
  if(!selectEntries().some(p=>p.id===state.formChoice))state.formChoice="";
  sync();
 }catch(e){
  if(seq!==state.requestId||!host.isConnected)return;
  host.querySelector("#zrl-body").innerHTML='<div class="zrl-panel zrl-error"><h2>Unable to load rental agreements</h2><p>'+esc(e.message)+'</p><button class="zrl-button secondary" id="zrl-retry">Retry secure connection</button></div>';
  host.querySelector("#zrl-retry")?.addEventListener("click",()=>load(manager));
 }
}
async function saveLease(e){
 e.preventDefault();const form=e.currentTarget,submit=e.submitter;
 const d=new FormData(form),issue=submit?.value==="issue";
 const rent=Number(d.get("rent")),deposit=Number(d.get("deposit")),start=d.get("start"),end=d.get("end");
 const terms=String(d.get("terms")||"").trim(),depositTerms=String(d.get("depositTerms")||"").trim();
 if(!Number.isSafeInteger(rent)||rent<1||!Number.isSafeInteger(deposit)||deposit<1||deposit>rent){
  message("Enter positive amounts; the refundable deposit cannot exceed one month's rent.",true);return;
 }
 if(!start||(end&&end<=start)){message("Check the tenancy start and end dates.",true);return;}
 if(terms.length<50||depositTerms.length<20){message("Complete the written agreement clauses before saving.",true);return;}
 submit.disabled=true;message(issue?"Issuing the saved agreement to the tenant…":"Saving an editable draft…");
 try{
  const result=await api().prepareLease(d.get("connection"),start,end||null,rent,deposit,terms,depositTerms,issue);
  message(issue?"Agreement issued to the connected tenant. Print it and obtain signatures.":"Draft saved securely. You can reopen and edit it until issuance.");
  state.formChoice=d.get("connection");await load(true);
  const row=root()?.querySelector('[data-zrl-print="'+result.id+'"]');
  if(row)row.focus();
 }catch(err){message("Unable to save agreement: "+err.message,true);submit.disabled=false;}
}
function legalDocument(lease){
 const title="RESIDENTIAL TENANCY AGREEMENT";
 const location=[lease.propertyAddress,lease.city,lease.country||"Uganda"].filter(Boolean).join(", ");
 const isSigned=lease.docStatus==="signed",ref="ZR-"+uuid(lease.id);
 const paragraph=v=>esc(v||"").replace(/\n/g,"<br>");
 const html='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(ref)+' · Rental agreement</title>'+
 '<style>@page{size:A4;margin:16mm 17mm}*{box-sizing:border-box}body{font:11pt/1.55 Arial,Helvetica,sans-serif;color:#1b2923;background:#fff;margin:0}.controls{display:flex;justify-content:space-between;gap:12px;align-items:center;background:#f2f7f3;padding:12px 15px;margin-bottom:18px;border:1px solid #dce8dd}.controls button{background:#20533d;color:#fff;border:0;border-radius:6px;padding:9px 18px;cursor:pointer}.page{max-width:850px;margin:0 auto}.lettermark{font-size:19pt;font-weight:800;color:#194d37}.lettermark span{color:#76aa73}.eyebrow{font-size:8pt;letter-spacing:.15em;color:#5f7667}.dochead{border-bottom:2px solid #20533d;padding-bottom:14px;margin:0 0 18px}h1{font-size:17pt;letter-spacing:.02em;color:#173d2b;margin:14px 0 6px}h2{font-size:10.5pt;color:#1c4934;margin:21px 0 7px;text-transform:uppercase;letter-spacing:.05em}.sub{font-size:9pt;color:#536a5b}.details{width:100%;border-collapse:collapse;margin:15px 0}.details td{padding:9px 12px;border:1px solid #ccd8d0;vertical-align:top;width:50%}.details span{display:block;font-size:8pt;color:#607668;text-transform:uppercase;letter-spacing:.03em}.details b{font-size:10pt}.clause{white-space:normal;border-left:2px solid #c6d8ca;padding-left:11px;overflow-wrap:break-word}.signs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:30px 0 15px}.sig{border:1px solid #d9e4dc;padding:16px;break-inside:avoid}.sig b{display:block;margin-bottom:26px}.rule{border-bottom:1px solid #25372e;height:17px}.sig small{display:block;font-size:8pt;color:#667f6f;margin:5px 0 14px}.notice{font-size:8.7pt;border-top:1px solid #d6e4d9;padding-top:11px;margin-top:23px;color:#667e6e}.stamp{font-size:8pt;padding:6px 9px;border:1px solid #ccd9cf;display:inline-block;color:#567a5f}.footer{margin-top:25px;font-size:8pt;color:#667c6c;display:flex;justify-content:space-between}.break{page-break-before:always}@media print{.controls{display:none}.page{max-width:none}.sig{break-inside:avoid}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'+
 '<div class="controls"><strong>Agreement preview · '+esc(ref)+'</strong><button onclick="window.print()">Print / Save as PDF</button></div><div class="page"><header class="dochead"><div class="lettermark">zimba<span>.</span></div><div class="eyebrow">PROPERTY MANAGEMENT · AGREEMENT DOCUMENT</div><h1>'+title+'</h1><div class="sub">Agreement reference '+esc(ref)+' · Uganda</div><p class="stamp">'+(isSigned?"SIGNED RECORD EXISTS — DOWNLOAD ARCHIVED PDF FOR SIGNATURES":lease.status==="draft"?"DRAFT · NOT EXECUTED":"ISSUED COPY · SIGNATURES REQUIRED")+'</p></header>'+
 '<p>This rental agreement records the terms proposed or agreed between the following landlord (or authorised representative) and tenant in respect of the property below. The printed copy is to be completed, dated and signed by both parties.</p>'+
 '<h2>1. Parties and premises</h2><table class="details"><tr><td><span>Landlord / Managing organisation</span><b>'+esc(lease.landlord||"To be confirmed")+'</b></td><td><span>Tenant</span><b>'+esc(lease.tenant||"To be confirmed")+'</b></td></tr>'+
 '<tr><td><span>Property</span><b>'+esc(lease.property||"")+'</b></td><td><span>Room / Unit</span><b>'+esc(lease.room||"Property-wide — verify")+'</b></td></tr>'+
 '<tr><td colspan="2"><span>Full premises address</span><b>'+esc(location||"To be completed before signing")+'</b></td></tr></table>'+
 '<h2>2. Duration, rent and deposit</h2><table class="details"><tr><td><span>Commencement</span><b>'+esc(date(lease.start))+'</b></td><td><span>End of fixed term (if any)</span><b>'+esc(date(lease.end))+'</b></td></tr>'+
 '<tr><td><span>Agreed monthly rent</span><b>'+money(lease.rent)+'</b></td><td><span>Security deposit required (not a receipt)</span><b>'+money(lease.deposit)+'</b></td></tr></table>'+
 '<p>Rent payment date, payment method, utilities, entry/access, maintenance duties, renewal, notices and lawful termination must be understood and agreed by both parties. Any rent or security-deposit payment must have a separate receipt based on actual verified payment.</p>'+
 '<h2>3. General tenancy conditions</h2><div class="clause">'+paragraph(lease.terms)+'</div>'+
 '<h2>4. Security deposit: holding, deductions and refund</h2><div class="clause">'+paragraph(lease.depositTerms)+'</div>'+
 '<h2>5. Confirmation and execution</h2><p>By signing below, each party confirms that they have read the complete agreement, understand the terms, and intend to be bound by the version signed. The landlord or representative signs in a duly authorised capacity. Each party should retain a complete signed copy.</p>'+
 '<div class="signs"><div class="sig"><b>LANDLORD / AUTHORISED REPRESENTATIVE</b><div class="rule"></div><small>Signature</small><div class="rule"></div><small>Printed name & capacity</small><div class="rule"></div><small>Date signed</small></div>'+
 '<div class="sig"><b>TENANT</b><div class="rule"></div><small>Signature</small><div class="rule"></div><small>Printed name</small><div class="rule"></div><small>Date signed</small></div></div>'+
 '<h2>Optional witness details</h2><div class="signs"><div class="sig"><b>LANDLORD-SIDE WITNESS (IF USED)</b><div class="rule"></div><small>Name / signature / date</small></div><div class="sig"><b>TENANT-SIDE WITNESS (IF USED)</b><div class="rule"></div><small>Name / signature / date</small></div></div>'+
 '<p class="notice"><b>Important:</b> This is a system-generated draft based on the recorded information and editable clauses. It should be checked against the applicable Uganda Landlord and Tenant Act and Schedule 2 prescribed form before execution. It is not a certificate of legal validity. To preserve the executed record in ZIMBA, scan/upload the complete physically signed PDF and obtain tenant confirmation of that exact version.</p>'+
 '<footer class="footer"><span>ZIMBA RENT · Private tenancy agreement</span><span>'+esc(ref)+' · Page 1+</span></footer></div></body></html>';
 return html;
}
function printAgreement(lease){
 if(!lease)return;
 // A dedicated print window is opened in the direct click handler so it does not
 // get blocked by async calls; no scripts from document input are rendered.
 const win=window.open("","_blank","width=980,height=900");
 if(!win){message("Allow the print window, then choose Print / Save as PDF.",true);return;}
 win.document.open();win.document.write(legalDocument(lease));win.document.close();
 win.focus();
}
function toBase64(bytes){
 const data=new Uint8Array(bytes);let out="";
 for(let i=0;i<data.length;i+=16384)out+=String.fromCharCode(...data.subarray(i,i+16384));
 return btoa(out);
}
async function pdfData(file){
 if(!file||file.size<150||file.size>3000000||!(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")))
  throw Error("Select a PDF file of up to 3 MB.");
 const bytes=await file.arrayBuffer(),u=new Uint8Array(bytes);
 if(String.fromCharCode(...u.slice(0,5))!=="%PDF-")throw Error("The selected file is not a valid PDF.");
 if(!window.crypto?.subtle)throw Error("Secure PDF checksum is unavailable in this browser. Use HTTPS.");
 const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
 return {base64:toBase64(bytes),hash};
}
function blobFromBase64(base64){
 const str=atob(base64),bytes=new Uint8Array(str.length);
 for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);
 return new Blob([bytes],{type:"application/pdf"});
}
async function downloadScan(scanId){
 const l=state.items.find(x=>x.scanId===scanId),isTenant=!state.manager;
 if(!l)return;
 const preview=isTenant&&l.docStatus==="pending_tenant_confirmation";
 const opened=preview?window.open("about:blank","_blank"):null;
 try{
  message("Retrieving protected PDF from Neon…");
  const d=await api().privateLeasePdf(scanId);
  if(d.scanId!==scanId||d.sha256!==l.scanHash)throw Error("The selected document version changed; refresh and try again.");
  const blob=blobFromBase64(d.base64),url=URL.createObjectURL(blob);
  if(preview&&opened){
   opened.location.href=url;
   state.reviewed=l.scanId+":"+l.scanHash;
   message("Signed PDF opened for your review. Compare all pages and signatures before confirming.");
  }else{
   opened?.close();
   const a=document.createElement("a");a.href=url;a.download=("ZIMBA-"+uuid(l.id)+"-signed-v"+d.revision+".pdf");
   document.body.appendChild(a);a.click();a.remove();
   if(preview){state.reviewed=l.scanId+":"+l.scanHash;message("PDF downloaded. Open and inspect it before confirming.");}
   else message("Signed PDF downloaded privately. This is the stored copy.");
  }
  setTimeout(()=>URL.revokeObjectURL(url),90000);
  if(preview)sync();
 }catch(e){opened?.close();message("Could not download signed PDF: "+e.message,true);}
}
function showUpload(id){
 const slot=root()?.querySelector("#zrl-upload-slot");if(!slot)return;
 slot.innerHTML=uploadPanel(id);slot.querySelector("#zrl-close-upload").onclick=()=>slot.innerHTML="";
 slot.querySelector("#zrl-cancel-upload").onclick=()=>slot.innerHTML="";
 slot.querySelector("#zrl-upload-form").onsubmit=e=>uploadSigned(e,id);
 slot.scrollIntoView({block:"nearest",behavior:"smooth"});
}
async function uploadSigned(e,id){
 e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type=submit]');
 if(!form.querySelector('[name=attest]').checked)return;
 const file=form.querySelector('[name=pdf]').files?.[0];
 submit.disabled=true;message("Checking PDF and saving the signed copy privately…");
 try{
  const data=await pdfData(file);
  const res=await api().uploadSignedLease(id,data.base64,data.hash,file.name,true);
  message("Signed PDF stored as version "+res.revision+". The linked tenant must confirm the exact copy before it will be marked signed.");
  state.reviewed=null;await load(true);
 }catch(err){message("Signed copy upload failed: "+err.message,true);submit.disabled=false;}
}
async function confirmSigned(id){
 const l=findRecord(id),check=root()?.querySelector('[data-zrl-confirm-check="'+id+'"]'),btn=root()?.querySelector('[data-zrl-confirm="'+id+'"]');
 if(!l||!check?.checked||state.reviewed!==l.scanId+":"+l.scanHash){message("Open, review and explicitly confirm this exact PDF first.",true);return;}
 if(!window.confirm("Confirm that the downloaded PDF contains both parties’ signatures and the correct agreement? This permanently records your confirmation."))return;
 btn.disabled=true;message("Recording your confirmation of the exact signed PDF…");
 try{
  await api().confirmSignedLease(l.id,l.scanId,l.scanHash,true);
  message("Confirmation saved. The signed copy is now securely archived.");
  await load(false);
 }catch(err){message("Confirmation failed: "+err.message,true);btn.disabled=false;}
}
function wire(){
 const r=root();if(!r)return;
 const choice=r.querySelector("#zrl-connection");
 choice?.addEventListener("change",e=>{state.formChoice=e.target.value;sync();});
 r.querySelector("#zrl-edit-form")?.addEventListener("submit",saveLease);
 r.querySelectorAll("[data-zrl-edit]").forEach(b=>b.onclick=()=>{
  state.formChoice=b.dataset.zrlEdit;sync();
  r.querySelector("#zrl-edit-form")?.scrollIntoView({block:"start",behavior:"smooth"});
 });
 r.querySelectorAll("[data-zrl-print]").forEach(b=>b.onclick=()=>printAgreement(findRecord(b.dataset.zrlPrint)));
 r.querySelectorAll("[data-zrl-view]").forEach(b=>b.onclick=()=>downloadScan(b.dataset.zrlView));
 r.querySelectorAll("[data-zrl-upload]").forEach(b=>b.onclick=()=>showUpload(b.dataset.zrlUpload));
 r.querySelectorAll("[data-zrl-confirm-check]").forEach(b=>b.onchange=()=>{
  const button=r.querySelector('[data-zrl-confirm="'+b.dataset.zrlConfirmCheck+'"]');if(button)button.disabled=!b.checked;
 });
 r.querySelectorAll("[data-zrl-confirm]").forEach(b=>b.onclick=()=>confirmSigned(b.dataset.zrlConfirm));
}
window.ZimbaRentalContracts={page,load,legalDocument,statusData,pdfData,templates};
})();