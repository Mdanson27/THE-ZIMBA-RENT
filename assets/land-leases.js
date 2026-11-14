/* ZIMBA Land Agreement Workspace V2 — separate long-term land lease instrument.
 * Manager drafts are editable until issue; scanned signed PDFs are immutable when
 * confirmed by the second, verified ZIMBA account. No land-title verification.
 */
(()=>{
"use strict";
const auth=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ugx=v=>"UGX "+Number(v||0).toLocaleString("en-UG",{maximumFractionDigits:0});
const date=v=>v?String(v).slice(0,10):"Not specified";
const ref=v=>"ZL-"+String(v||"").slice(0,8).toUpperCase();
const root=()=>document.querySelector("#zl-root");
const baseConditions="The land shall be used only for the use permitted in this agreement and in compliance with applicable law. The parties must verify title and any required consents. The lessee shall pay the agreed amounts when due, use and maintain the land reasonably, and obtain written consent for material alterations, subleasing and other activities where required. Notices, breaches, dispute resolution, surrender, improvements and obligations on termination must be interpreted with the applicable laws of Uganda. No right of ownership or registered interest is represented as established by this system draft.";
const baseRenewal="Renewal is by written agreement between the parties before the lease expires, subject to the applicable law, required consents, approvals and registration. No automatic renewal is presumed.";
const basePayment="The premium, if applicable, is payable only according to the parties' signed payment schedule. Recurring ground rent is paid at the frequency recorded above, with a separate receipt for every verified payment. No payment is acknowledged by this draft.";
const state={manager:true,items:[],properties:[],selected:"",reviewed:null,busy:false,nonce:0};
const statuses={draft:["Draft · editable","draft"],issued:["Issued · not signed","not-signed"],pending_counterparty:["Signed PDF uploaded · awaiting other party","pending"],signed:["Signed PDF · both confirmed","signed"]};
const docStatus=l=>statuses[l.docStatus]||statuses.draft;
function page(manager=true){
 return '<section class="zrl-page zl-page" id="zl-root"><header class="zrl-head"><div><span class="zrl-overline">ZIMBA / LAND AGREEMENTS</span><h1>Land & long-term leases</h1><p>'+
 (manager?"Prepare, print and archive a property-specific land agreement. Land titles, consents and registration require independent verification.":"Review land agreements addressed to your verified account and confirm only the exact signed PDF after checking it.")+
 '</p></div><span class="zrl-head-label">Land instrument · Uganda</span></header><div id="zl-status" class="zrl-status" role="status" aria-live="polite"></div><div id="zl-body" class="zl-body">Loading secure land records…</div></section>';
}
function notice(msg,bad=false){
 const el=root()?.querySelector("#zl-status");
 if(el){el.textContent=msg||"";el.className="zrl-status"+(bad?" zrl-danger":"");}
}
const statusBadge=l=>{const [label,tone]=docStatus(l);return '<span class="zrl-pill '+tone+'">'+esc(label)+'</span>';};
const options=(items,current)=>items.map(([v,label])=>'<option value="'+esc(v)+'"'+(v===current?' selected':'')+'>'+esc(label)+'</option>').join("");
const current=()=>state.items.find(x=>x.id===state.selected)||null;
function fields(){
 const v=current()||{},draft=v.status!=="issued",isNew=!v.id;
 const priceField=(key,label,val)=>'<label>'+esc(label)+'<input name="'+key+'" type="number" min="0" step="1" required value="'+esc(val)+'"'+(draft?"":" disabled")+'></label>';
 const txt=(name,label,val,req=false,max=400)=>'<label>'+esc(label)+'<input name="'+name+'" maxlength="'+max+'" value="'+esc(val||"")+'"'+(req?' required':'')+(draft?"":" disabled")+'></label>';
 const textarea=(name,label,val,min,max,rows=4)=>'<label>'+esc(label)+'<textarea name="'+name+'" minlength="'+min+'" maxlength="'+max+'" rows="'+rows+'" required'+(draft?"":" disabled")+'>'+esc(val||"")+'</textarea></label>';
 const propertyList=[["","Not linked to an existing property"],...state.properties.filter(p=>p.id).map(p=>[p.id,p.name||p.title||"Property"])];
 const freq=v.rent!=null&&Number(v.rent)===0?"none":v.rentFrequency||"annual";
 return '<section class="zrl-panel zl-builder"><div class="zrl-panel-header"><div><span class="zrl-eyebrow">LAND INSTRUMENT BUILDER</span><h2>'+ (isNew?"Create a land lease":"Land lease "+ref(v.id)) +'</h2><p>Save a draft, review every provision, then issue it before printing and signing.</p></div>'+ (v.id?statusBadge(v):'<span class="zrl-subtle">New draft</span>')+'</div>'+
 '<form id="zl-form" class="zrl-form">'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>01</b><div><h3>Parcel and title particulars</h3><p>Identify the exact land being leased. Supplied title particulars are not independently verified by ZIMBA.</p></div></div>'+
 txt("parcel","Plot, block or parcel reference",v.parcel,true,150)+
 '<label>Existing property (optional)<select name="propertyId"'+(draft?"":" disabled")+'>'+options(propertyList,v.propertyId||"")+'</select></label>'+
 txt("titleReference","Title / certificate reference (verify independently)",v.titleReference,false,180)+
 '<div class="zl-two"><label>Recorded tenure (not verified)<select name="tenureType"'+(draft?"":" disabled")+'>'+
 options([["unverified","Not verified"],["mailo","Mailo"],["freehold","Freehold"],["leasehold","Leasehold"],["customary","Customary"],["other","Other"]],v.tenureType||"unverified")+'</select></label>'+
 txt("sizeDescription","Approximate area / boundaries",v.sizeDescription,false,220)+'</div>'+
 textarea("location","Location and full land description",v.location||"",8,500,3)+'</div>'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>02</b><div><h3>Lessor and lessee</h3><p>Identify both parties, their capacities and the account that will verify the signed copy.</p></div></div>'+
 '<div class="zl-two">'+txt("lessorName","Lessor (landowner / granting party)",v.lessorName,false,160)+txt("lesseeName","Lessee (receiving the lease)",v.lesseeName,false,160)+'</div>'+
 '<div class="zl-two"><label>Your organisation represents<select name="managedCapacity"'+(draft?"":" disabled")+'>'+options([["lessor","The lessor"],["lessee","The lessee"]],v.managedCapacity||"lessor")+'</select></label>'+
 '<label>Other party’s verified ZIMBA account email<input name="counterpartyEmail" type="email" autocomplete="email" maxlength="254" value="'+esc(v.counterpartyEmail||"")+'" placeholder="counterparty@example.com"'+(draft?"":" disabled")+'></label></div>'+
 '<p class="zrl-footnote">The other party must have a separate email-verified ZIMBA account. ZIMBA only creates an in-app alert if that account already exists; it does not send an email invitation automatically.</p></div>'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>03</b><div><h3>Term and financial arrangements</h3><p>Separate the upfront lease premium from recurring ground rent. Neither amount is shown as paid until separately verified.</p></div></div>'+
 '<div class="zl-two"><label>Term begins<input name="start" type="date" value="'+esc(date(v.start)==="Not specified"?"":v.start)+'" required'+(draft?"":" disabled")+'></label>'+
 '<label>Term expires<input name="end" type="date" value="'+esc(date(v.end)==="Not specified"?"":v.end)+'" required'+(draft?"":" disabled")+'></label></div>'+
 '<div class="zl-two">'+priceField("premium","Agreed premium (UGX)",v.premium??0)+priceField("rent","Recurring ground rent (UGX)",v.rent??0)+'</div>'+
 '<label>Ground rent frequency<select name="rentFrequency"'+(draft?"":" disabled")+'>'+options([["none","No recurring rent"],["monthly","Monthly"],["quarterly","Quarterly"],["half_yearly","Every six months"],["annual","Annually"]],freq)+'</select></label>'+
 textarea("paymentTerms","Payment timetable and method",v.paymentTerms||basePayment,8,2000,3)+
 textarea("renewalTerms","Renewal, expiry and notice provisions",v.renewalTerms||baseRenewal,10,2000,3)+'</div>'+
 '<div class="zrl-step"><div class="zrl-step-head"><b>04</b><div><h3>Use, covenants and legal review</h3><p>Customise the land-specific clauses before printing. Seek independent title and legal checks.</p></div></div>'+
 txt("permittedUse","Permitted purpose / land use",v.permittedUse,false,400)+
 textarea("conditions","Special covenants, restrictions and obligations",v.conditions||baseConditions,30,10000,6)+
 '<label>Review notes (internal, not printed as an agreed clause)<textarea name="legalReviewNote" maxlength="2000" rows="3"'+(draft?"":" disabled")+'>'+esc(v.legalReviewNote||"")+'</textarea></label></div>'+
 (draft?'<div class="zrl-actions">'+
 '<button type="submit" class="zrl-button primary">Save editable draft</button>'+
 (v.id?'<button type="button" class="zrl-button secondary" id="zl-issue">Issue this agreement</button>':"")+
 '<button type="button" class="zrl-button secondary" id="zl-reset">New agreement</button></div>':
 '<div class="zrl-notice"><b>Issued document — edits locked.</b> A formal amendment must be used for changes to issued terms.</div>')+
 '<p class="zrl-footnote">A saved draft is not registered title, proof of ownership, receipt for a premium, or a completed signed lease.</p></form></section>';
}
function register(){
 const list=state.items,signed=list.filter(x=>x.docStatus==="signed").length;
 return '<section class="zrl-panel zl-register"><div class="zrl-panel-header"><div><span class="zrl-eyebrow">LAND LEASE REGISTER</span><h2>Documents & execution</h2><p>Preserve the proposed terms and each uploaded signed revision.</p></div><span class="zrl-subtle">'+list.length+' records · '+signed+' confirmed</span></div>'+
 (list.length?'<div class="zrl-record-list">'+list.map(l=>'<article class="zrl-record"><div class="zrl-record-top"><span>'+ref(l.id)+'</span>'+statusBadge(l)+'</div>'+
 '<h3>'+esc(l.parcel)+'</h3><p>'+esc(l.location)+'</p>'+
 '<div class="zrl-small-facts"><span>'+date(l.start)+' — '+date(l.end)+'</span><span>Premium '+ugx(l.premium)+'</span><span>Rent '+ugx(l.rent)+'</span></div>'+
 '<p class="zl-parties">'+esc(l.lessorName||"Lessor not entered")+' / '+esc(l.lesseeName||"Lessee not entered")+'</p>'+
 (l.scanHash?'<small class="zrl-hash">Saved PDF v'+Number(l.scanRevision)+' · SHA-256 '+esc(l.scanHash.slice(0,16))+'…</small>':'')+
 '<div class="zrl-record-actions">'+
 (l.status==="draft"?'<button type="button" class="zrl-button secondary" data-zl-edit="'+esc(l.id)+'">Edit draft</button><button type="button" class="zrl-button primary" data-zl-issue="'+esc(l.id)+'">Issue</button>':'')+
 '<button type="button" class="zrl-button secondary" data-zl-print="'+esc(l.id)+'">Print / Save PDF</button>'+
 (l.scanId?'<button type="button" class="zrl-button secondary" data-zl-view="'+esc(l.scanId)+'">Download signed PDF</button>':'')+
 (l.status==="issued"&&l.docStatus!=="signed"?'<button type="button" class="zrl-button primary" data-zl-upload="'+esc(l.id)+'">Upload signed PDF</button>':'')+
 '</div></article>').join("")+'</div>':'<p class="zrl-empty">No land lease drafts yet. Create and save your first agreement using the builder.</p>')+
 '</section>';
}
function managerContent(){
 return '<div class="zrl-workflow">'+[
 ["01","Save and edit"],["02","Issue and print"],["03","Both parties sign"],["04","Upload signed PDF"],["05","Other party confirms"]
 ].map(([n,t])=>'<span><b>'+n+'</b> '+esc(t)+'</span>').join("")+'</div>'+
 '<div class="zrl-workspace zl-workspace">'+fields()+register()+'</div><div id="zl-upload-slot"></div>'+
 '<p class="zrl-disclosure">Land-title searches, mortgagee consent, statutory registration, stamping and the legally prescribed instrument must be independently checked. A ZIMBA-generated document is not itself a registered leasehold interest.</p>';
}
function signingsContent(){
 return '<section class="zrl-panel"><div class="zrl-panel-header"><div><span class="zrl-eyebrow">INCOMING LAND DOCUMENTS</span><h2>Agreements requiring your review</h2><p>Only agreements addressed to your verified email appear here. Confirmation requires reviewing the exact PDF.</p></div></div>'+
 (state.items.length?'<div class="zrl-record-list">'+state.items.map(l=>{
 const reviewed=state.reviewed===l.scanId+":"+l.scanHash;
 return '<article class="zrl-record"><div class="zrl-record-top"><span>'+ref(l.id)+'</span>'+statusBadge(l)+'</div>'+
 '<h3>'+esc(l.parcel)+'</h3><p>'+esc(l.location)+'</p>'+
 '<div class="zrl-small-facts"><span>'+esc(l.lessorName)+'</span><span>'+esc(l.lesseeName)+'</span><span>'+date(l.start)+' to '+date(l.end)+'</span></div>'+
 '<details><summary>Review issued land terms</summary><p class="zrl-term-text">'+esc(l.conditions)+'</p><h4>Renewal</h4><p class="zrl-term-text">'+esc(l.renewalTerms)+'</p><h4>Payment schedule</h4><p class="zrl-term-text">'+esc(l.paymentTerms)+'</p></details>'+
 '<div class="zrl-record-actions"><button type="button" class="zrl-button secondary" data-zl-print="'+esc(l.id)+'">Print / Save agreement</button>'+
 (l.scanId?'<button type="button" class="zrl-button primary" data-zl-view="'+esc(l.scanId)+'">Review saved signed PDF</button>':'')+'</div>'+
 (l.docStatus==="pending_counterparty"?'<section class="zrl-confirm"><h3>Confirm the signed document</h3>'+
 '<p>Open the uploaded PDF and compare every page, both parties’ signatures, dates and terms. This confirmation is recorded against the exact PDF checksum.</p>'+
 '<small class="zrl-hash">SHA-256: '+esc(l.scanHash)+'</small>'+
 '<label class="zrl-check"><input type="checkbox" data-zl-check="'+esc(l.id)+'"'+(reviewed?"":" disabled")+'><span>I have reviewed this exact PDF and confirm that it includes the signatures of both parties and the agreement we signed.</span></label>'+
 '<button type="button" class="zrl-button primary" data-zl-confirm="'+esc(l.id)+'"'+(reviewed?"":" disabled")+'>Confirm this signed copy</button>'+
 '<p class="zrl-footnote">This is an attestation, not a biometric handwriting check or proof of title registration.</p></section>':'')+
 (l.docStatus==="signed"?'<p class="zl-success">The exact signed PDF has been counter-confirmed. This does not verify government registration.</p>':'')+
 '</article>';
 }).join(""):'<p class="zrl-empty">No land signing requests are linked to your verified email. The managing party must issue the agreement to that same email.</p>')+
 '</div></section>';
}
function render(){
 const host=root()?.querySelector("#zl-body");if(!host)return;
 host.innerHTML=state.manager?managerContent():signingsContent();
 bind();
 window.ZimbaPrivacy?.refresh();
}
async function load(manager=true){
 const host=root();if(!host)return;
 const token=++state.nonce;state.manager=!!manager;
 try{
  const [rows,properties]=await Promise.all([
   manager?auth().managerLandLeaseContracts():auth().myLandSigningRequests(),
   manager?auth().myProperties().catch(()=>[]):Promise.resolve([])
  ]);
  if(token!==state.nonce||!host.isConnected)return;
  state.items=Array.isArray(rows)?rows:[];
  state.properties=Array.isArray(properties)?properties:[];
  if(state.selected&&!state.items.some(x=>x.id===state.selected))state.selected="";
  render();
 }catch(e){
  if(token!==state.nonce||!host.isConnected)return;
  host.querySelector("#zl-body").innerHTML='<section class="zrl-panel zrl-error"><h2>Unable to load agreements</h2><p>'+esc(e.message)+'</p><button type="button" class="zrl-button secondary" id="zl-retry">Retry connection</button></section>';
  host.querySelector("#zl-retry")?.addEventListener("click",()=>load(manager));
 }
}
function formData(form){
 const f=new FormData(form),data=Object.fromEntries(f.entries());
 data.id=state.selected||null;
 data.propertyId=data.propertyId||null;
 data.premium=Number(data.premium);data.rent=Number(data.rent);
 return data;
}
async function save(e){
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]'),d=formData(form);
 if(!Number.isSafeInteger(d.premium)||d.premium<0||!Number.isSafeInteger(d.rent)||d.rent<0){notice("Use valid non-negative whole-UGX amounts.",true);return;}
 if((d.rent===0)!==(d.rentFrequency==="none")){notice("Select 'No recurring rent' for UGX 0, or specify the ground-rent amount and frequency.",true);return;}
 if(!d.start||!d.end||d.end<=d.start){notice("The expiry date must be after the start date.",true);return;}
 button.disabled=true;notice("Saving the editable land lease draft…");
 try{
  const result=await auth().saveLandLease(d);state.selected=result.id;await load(true);
  notice("Draft saved securely. You may reopen and edit it until it is issued.");
 }catch(err){notice("Unable to save draft: "+err.message,true);button.disabled=false;}
}
async function issue(id){
 const lease=state.items.find(x=>x.id===id);if(!lease)return;
 if(!window.confirm("Issue this agreement to the counterparty email shown? Issued terms will be locked. The system does not send an external email."))return;
 notice("Issuing the saved land lease…");
 try{
  const result=await auth().issueLandLease(id);await load(true);
  notice(result.notificationCreated?"Issued. The existing verified counterparty account received an in-app notification. Print and obtain both signatures.":"Issued. Share the ZIMBA Land signing requests page with the counterparty; no email notification was sent. Print and obtain both signatures.");
 }catch(err){notice("Unable to issue agreement: "+err.message,true);}
}
function frequency(v){return {none:"No recurring ground rent",monthly:"monthly",quarterly:"quarterly",half_yearly:"every six months",annual:"annually"}[v]||v;}
function printable(l){
 const legalNote="This ZIMBA-generated agreement is a draft record of the parties' proposed terms. It is not a verified land title, registered lease, government-approved instrument or evidence of stamp duty, consent or registration. Obtain independent legal and title verification, and use the prescribed registrable form where required.";
 const block=(v)=>esc(v||"Not specified").replace(/\n/g,"<br>");
 const signed=l.docStatus==="signed";
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(ref(l.id))+' · Land lease</title>'+
 '<style>@page{size:A4;margin:16mm 17mm}*{box-sizing:border-box}body{font:10.7pt/1.55 Arial,Helvetica,sans-serif;color:#16291f;margin:0;background:#fff}.page{max-width:850px;margin:auto}.printbar{background:#edf5ee;padding:12px 16px;margin-bottom:22px;display:flex;align-items:center;justify-content:space-between}.printbar button{background:#1e5b40;color:#fff;padding:9px 17px;border:0;border-radius:6px;cursor:pointer}.brand{font-size:19pt;font-weight:800;color:#15513a}.brand span{color:#79ae7f}.eyebrow{font-size:8pt;color:#628471;letter-spacing:.14em;text-transform:uppercase}.dochead{border-bottom:2px solid #1a5038;padding-bottom:14px;margin-bottom:20px}h1{font-size:18pt;line-height:1.2;margin:12px 0 5px}h2{font-size:10.5pt;text-transform:uppercase;letter-spacing:.04em;color:#205038;margin:22px 0 7px}.summary{border-collapse:collapse;width:100%;margin:12px 0}.summary td{width:50%;border:1px solid #d4e0d7;padding:10px 12px;vertical-align:top}.summary span{display:block;font-size:8pt;color:#6d8272}.summary strong{display:block;margin-top:3px}.bodytext{border-left:2px solid #d3e2d5;padding:3px 12px;overflow-wrap:anywhere;white-space:normal}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}.signature{border:1px solid #d5e1d8;padding:16px;break-inside:avoid}.signature b{display:block;margin-bottom:28px}.rule{height:18px;border-bottom:1px solid #20392b}.signature small{display:block;font-size:8pt;margin:3px 0 14px;color:#647e6d}.notice{border-top:1px solid #d4e2d7;padding-top:10px;margin:28px 0 0;font-size:8.5pt;color:#64796c}.state{font-size:9pt;color:#715a26;border:1px solid #e7d4a9;padding:6px 10px;display:inline-block}.footer{display:flex;justify-content:space-between;border-top:1px solid #e1e8df;padding-top:13px;margin-top:24px;font-size:8pt;color:#65806c}@media print{.printbar{display:none}.page{max-width:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>'+
 '<div class="printbar"><strong>Land lease document · '+esc(ref(l.id))+'</strong><button onclick="window.print()">Print / Save as PDF</button></div>'+
 '<main class="page"><header class="dochead"><div class="brand">zimba<span>.</span></div><div class="eyebrow">LAND LEASE DOCUMENT · UGANDA</div><h1>LAND & LONG-TERM LEASE AGREEMENT</h1>'+
 '<p>'+esc(ref(l.id))+' · '+(l.status==="draft"?"DRAFT":signed?"SIGNED COPY HELD SEPARATELY":"ISSUED DOCUMENT")+'</p>'+
 '<span class="state">'+(signed?"The executed PDF is archived separately. This printout is not the signed original.":l.status==="draft"?"DRAFT · NOT EXECUTED":"SIGNATURES REQUIRED · NOT YET EXECUTED")+'</span></header>'+
 '<p>This proposed land lease records the agreed particulars of the land, the granting party (lessor) and the receiving party (lessee). Full particulars must be independently confirmed before signing and submission for any required registration.</p>'+
 '<h2>1. Parties and capacity</h2><table class="summary"><tr><td><span>Lessor / granting party</span><strong>'+esc(l.lessorName||"To be completed")+'</strong></td><td><span>Lessee / receiving party</span><strong>'+esc(l.lesseeName||"To be completed")+'</strong></td></tr><tr><td colspan="2"><span>Organisation capacity</span><strong>'+esc(l.managedCapacity==="lessee"?"Representing lessee":"Representing lessor")+'</strong></td></tr></table>'+
 '<h2>2. Land description and title particulars (unverified)</h2><table class="summary"><tr><td><span>Plot / parcel</span><strong>'+esc(l.parcel)+'</strong></td><td><span>Title / certificate reference</span><strong>'+esc(l.titleReference||"Not verified")+'</strong></td></tr><tr><td><span>Reported tenure</span><strong>'+esc(l.tenureType||"Not verified")+'</strong></td><td><span>Land area / boundaries</span><strong>'+esc(l.sizeDescription||"To be specified")+'</strong></td></tr><tr><td colspan="2"><span>Land location and particulars</span><strong>'+esc(l.location)+'</strong></td></tr></table>'+
 '<h2>3. Lease term and consideration</h2><table class="summary"><tr><td><span>Commencement</span><strong>'+esc(date(l.start))+'</strong></td><td><span>Expiration</span><strong>'+esc(date(l.end))+'</strong></td></tr><tr><td><span>Agreed upfront premium</span><strong>'+ugx(l.premium)+'</strong></td><td><span>Recurring ground rent</span><strong>'+ugx(l.rent)+' · '+esc(frequency(l.rentFrequency))+'</strong></td></tr></table>'+
 '<h2>4. Permitted use</h2><div class="bodytext">'+block(l.permittedUse)+'</div>'+
 '<h2>5. Payment and performance terms</h2><div class="bodytext">'+block(l.paymentTerms)+'</div>'+
 '<h2>6. Special conditions and covenants</h2><div class="bodytext">'+block(l.conditions)+'</div>'+
 '<h2>7. Renewal, notices and expiry</h2><div class="bodytext">'+block(l.renewalTerms)+'</div>'+
 '<h2>8. Execution by both parties</h2><p>Each signatory should verify legal capacity, identity, all pages and any required statutory consents before signing the correct complete instrument. Each party should retain a complete signed copy.</p>'+
 '<div class="signatures"><section class="signature"><b>LESSOR / AUTHORISED REPRESENTATIVE</b><div class="rule"></div><small>Signature</small><div class="rule"></div><small>Printed name and capacity</small><div class="rule"></div><small>Date signed</small></section>'+
 '<section class="signature"><b>LESSEE / AUTHORISED REPRESENTATIVE</b><div class="rule"></div><small>Signature</small><div class="rule"></div><small>Printed name and capacity</small><div class="rule"></div><small>Date signed</small></section></div>'+
 '<h2>9. Witnesses (where required)</h2><div class="signatures"><section class="signature"><b>LESSOR-SIDE WITNESS</b><div class="rule"></div><small>Name, signature and date</small><div class="rule"></div><small>Address / contact</small></section>'+
 '<section class="signature"><b>LESSEE-SIDE WITNESS</b><div class="rule"></div><small>Name, signature and date</small><div class="rule"></div><small>Address / contact</small></section></div>'+
 '<h2>10. Registration and statutory particulars</h2><p>Registration application or instrument number: ____________________________________</p><p>Applicable consents / official endorsements: ____________________________________</p><p class="notice"><b>Legal review required.</b> '+esc(legalNote)+'</p>'+
 '<footer class="footer"><span>ZIMBA RENT · Land lease private document</span><span>'+esc(ref(l.id))+' · All pages are part of this document</span></footer></main></body></html>';
}
function print(id){
 const l=state.items.find(x=>x.id===id);if(!l)return;
 const w=window.open("","_blank","width=980,height=920");
 if(!w){notice("Allow pop-ups for printing and try again.",true);return;}
 w.document.open();w.document.write(printable(l));w.document.close();w.focus();
}
function uploadUI(id){
 const l=state.items.find(x=>x.id===id);if(!l)return"";
 return '<section class="zrl-upload" id="zl-upload-panel"><div class="zrl-upload-head"><div><span class="zrl-eyebrow">SECURE EXECUTED COPY</span><h3>Upload the signed PDF for '+esc(l.parcel)+'</h3></div><button type="button" class="zrl-close" id="zl-close" aria-label="Close upload">×</button></div>'+
 '<p>Print the agreed land lease and obtain physical signatures from both lessor and lessee. Scan all signed pages as one PDF, maximum 3 MB. The other party must independently confirm this exact file.</p>'+
 '<form id="zl-upload-form"><label>Complete signed agreement (PDF only)<input name="pdf" type="file" accept=".pdf,application/pdf" required></label>'+
 '<label class="zrl-check"><input name="attest" type="checkbox" required><span>I personally checked the PDF and confirm that the <b>lessor and lessee signatures</b> appear in the complete document. I understand that this does not prove registered title or legal validity.</span></label>'+
 '<div class="zrl-actions"><button class="zrl-button primary" type="submit">Save signed PDF for counterparty review</button><button type="button" class="zrl-button secondary" id="zl-cancel">Cancel</button></div></form><p class="zrl-footnote">The original PDF is privately stored with its SHA-256 checksum. Earlier revisions cannot be edited; the confirmed version cannot be replaced.</p></section>';
}
function showUpload(id){
 const slot=root()?.querySelector("#zl-upload-slot");if(!slot)return;
 slot.innerHTML=uploadUI(id);
 slot.querySelector("#zl-close").onclick=()=>slot.replaceChildren();
 slot.querySelector("#zl-cancel").onclick=()=>slot.replaceChildren();
 slot.querySelector("#zl-upload-form").onsubmit=e=>upload(e,id);
 slot.scrollIntoView({block:"nearest",behavior:"smooth"});
}
async function upload(e,id){
 e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');
 if(!form.querySelector('[name=attest]')?.checked){notice("You must attest that both signatures appear.",true);return;}
 button.disabled=true;notice("Checking the signed PDF and its SHA-256 fingerprint…");
 try{
  const pdf=form.querySelector('[name=pdf]').files[0];
  const {base64,hash}=await window.ZimbaRentalContracts.pdfData(pdf);
  const answer=await auth().uploadLandLeasePdf(id,base64,hash,pdf.name,true);
  state.reviewed=null;await load(true);
  notice("Signed PDF archived as version "+answer.revision+". It remains pending until the designated other party confirms the exact file.");
 }catch(err){notice("Unable to save signed PDF: "+err.message,true);button.disabled=false;}
}
async function download(scanId){
 const l=state.items.find(x=>x.scanId===scanId);if(!l)return;
 const isCounterparty=!state.manager&&l.docStatus==="pending_counterparty";
 const opened=isCounterparty?window.open("about:blank","_blank"):null;
 try{
  notice("Retrieving the protected signed PDF…");
  const result=await auth().privateLandLeasePdf(scanId);
  if(result.scanId!==scanId||result.sha256!==l.scanHash)throw Error("The signed file revision changed. Refresh and reopen.");
  const text=atob(result.base64),bytes=new Uint8Array(text.length);
  for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  const actual=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
  if(actual!==l.scanHash)throw Error("Signed PDF fingerprint does not match the archived record.");
  const blob=new Blob([bytes],{type:"application/pdf"}),url=URL.createObjectURL(blob);
  if(isCounterparty&&opened){opened.location.href=url;state.reviewed=scanId+":"+l.scanHash;}
  else{
   opened?.close();
   const a=document.createElement("a");a.href=url;a.download=ref(l.id)+"-signed-v"+result.revision+".pdf";
   document.body.append(a);a.click();a.remove();
   if(isCounterparty)state.reviewed=scanId+":"+l.scanHash;
  }
  setTimeout(()=>URL.revokeObjectURL(url),90000);
  notice("PDF retrieved successfully. Review the actual signed copy before confirming.");
  if(isCounterparty)render();
 }catch(err){opened?.close();notice("Unable to download signed PDF: "+err.message,true);}
}
async function confirm(id){
 const l=state.items.find(x=>x.id===id),check=root()?.querySelector('[data-zl-check="'+id+'"]'),button=root()?.querySelector('[data-zl-confirm="'+id+'"]');
 if(!l||!check?.checked||state.reviewed!==l.scanId+":"+l.scanHash){notice("Review the exact signed PDF and confirm both signatures first.",true);return;}
 if(!window.confirm("Confirm this exact PDF contains both signed parties and the agreed document? This action will create a permanent confirmation record."))return;
 button.disabled=true;notice("Saving your confirmation of the exact signed PDF…");
 try{await auth().confirmLandLeasePdf(id,l.scanId,l.scanHash,true);state.reviewed=null;await load(false);notice("Signed PDF confirmed and archived. Land title/registration must still be verified independently.");}
 catch(err){notice("Could not confirm signed document: "+err.message,true);button.disabled=false;}
}
function bind(){
 const r=root();if(!r)return;
 r.querySelector("#zl-form")?.addEventListener("submit",save);
 r.querySelector("#zl-reset")?.addEventListener("click",()=>{state.selected="";render();});
 r.querySelector("#zl-issue")?.addEventListener("click",()=>{if(state.selected)issue(state.selected);});
 r.querySelectorAll("[data-zl-issue]").forEach(b=>b.addEventListener("click",()=>issue(b.dataset.zlIssue)));
 r.querySelectorAll("[data-zl-edit]").forEach(b=>b.addEventListener("click",()=>{
  state.selected=b.dataset.zlEdit;render();r.querySelector("#zl-form")?.scrollIntoView({block:"start",behavior:"smooth"});
 }));
 r.querySelectorAll("[data-zl-print]").forEach(b=>b.addEventListener("click",()=>print(b.dataset.zlPrint)));
 r.querySelectorAll("[data-zl-upload]").forEach(b=>b.addEventListener("click",()=>showUpload(b.dataset.zlUpload)));
 r.querySelectorAll("[data-zl-view]").forEach(b=>b.addEventListener("click",()=>download(b.dataset.zlView)));
 r.querySelectorAll("[data-zl-check]").forEach(b=>b.addEventListener("change",()=>{
  const button=r.querySelector('[data-zl-confirm="'+b.dataset.zlCheck+'"]');if(button)button.disabled=!b.checked;
 }));
 r.querySelectorAll("[data-zl-confirm]").forEach(b=>b.addEventListener("click",()=>confirm(b.dataset.zlConfirm)));
}
window.ZimbaLandLeases={page,load,printable,docStatus,frequency,baseConditions,baseRenewal};
})();
