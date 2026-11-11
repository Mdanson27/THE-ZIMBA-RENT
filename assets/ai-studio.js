/* Phase 5B AI Studio — optional authenticated model backend + functional local review.
 * No AI key, bearer token, document bytes or model output enters localStorage.
 */
(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG");
const cats=["agreement","compliance","inspection","insurance","maintenance","finance","other"];
const root=()=>document.querySelector("#zai-studio");
const endpoint=()=>String(window.ZIMBA_AI_API_BASE_URL||"").trim().replace(/\/+$/,"");
let tab="assistant",connected=false,snapshot=null,scopeId="",propertyId="",documentDraft=null,
    assistantAnswer=null,assistantBusy=false,docBusy=false,connectChecked=false,errorMessage="";
function props(){return (snapshot?.properties||[]).filter(p=>p.id);}
function status(text,bad=false){const x=root()?.querySelector("#zai-studio-status");if(x){x.textContent=text||"";x.className=bad?"zai-studio-status bad":"zai-studio-status";}}
function remoteNotice(){
 return !endpoint()?'<p class="zai-studio-note"><b>Private AI server not connected.</b> Model-backed questions and scanned-file extraction are unavailable until the API is deployed with server-side secrets. Local metadata review and reminder drafting remain available.</p>':
 connected?'<p class="zai-studio-note">Secure AI processing is available. Files and scoped indicators are sent only after you consent. AI outputs are suggestions, never automatic updates.</p>':
 '<p class="zai-studio-note">The private AI service could not be verified. No document or property details will be sent. You can continue using local tools.</p>';
}
function page(report,scope){
 snapshot=report;scopeId=scope||"";
 if(!props().some(p=>p.id===propertyId))propertyId=props()[0]?.id||"";
 return '<section class="zai-card zai-studio" id="zai-studio"><div class="zai-studio-heading"><div><span class="zai-kicker">PHASE 5B / REVIEW-FIRST AUTOMATION</span><h2>AI Studio</h2><p>Model-assisted answers when a secure server is connected, plus offline document-review tools and reminders.</p></div><span class="zai-readonly">Human approval required</span></div>'+
 '<div class="zai-studio-tabs" role="tablist" aria-label="AI Studio sections">'+[
 ["assistant","Model assistant"],["document","Document review"],["reminders","Reminder drafts"]
 ].map(([key,label])=>'<button type="button" role="tab" data-zai-studio="'+key+'" aria-selected="'+(tab===key)+'">'+esc(label)+'</button>').join("")+'</div>'+
 '<div id="zai-studio-status" aria-live="polite"></div><div id="zai-studio-content"></div></section>';
}
function helperMessage(){return '<p class="zai-studio-explainer">No external AI is required for the local tools. Drafts are never automatically sent or saved.</p>';}
function assistantUI(){
 return remoteNotice()+'<div class="zai-studio-panel"><h3>Ask about this portfolio</h3><p>The model receives a minimal authorised reporting summary, not tenant profiles, private messages or financial account credentials.</p>'+
 '<form id="zai-ai-ask"><label for="zai-ai-question">Your question</label><textarea id="zai-ai-question" name="question" rows="3" minlength="4" maxlength="700" required placeholder="Which operational risks deserve attention this week?"></textarea>'+
 '<label class="zai-studio-consent"><input type="checkbox" id="zai-ai-consent" required> I consent to sending the scoped summary and my question to the external AI service for this answer.</label>'+
 '<button class="zai-primary" type="submit" '+(!connected||assistantBusy?"disabled":"")+'>'+(assistantBusy?"Analysing…":"Ask secure AI")+'</button></form>'+
 (assistantAnswer?'<section class="zai-studio-answer"><h4>Model-assisted answer — verify before acting</h4><p>'+esc(assistantAnswer.answer)+'</p><small>Based on organisation-authorised snapshot as of '+esc(String(assistantAnswer.asOf||"").slice(0,19))+'. No records modified.</small></section>':"")+
 '</div><p class="zai-disclaimer">For guaranteed on-screen access without a configured AI provider, use the adjacent “Ask ZIMBA” guided intelligence tab.</p>';
}
function propPicker(){return '<label>Property<select name="property" id="zai-studio-property" required>'+props().map(p=>'<option value="'+esc(p.id)+'" '+(p.id===propertyId?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></label>';}
function documentUI(){
 const d=documentDraft;
 return remoteNotice()+'<div class="zai-studio-grid"><section class="zai-studio-panel"><h3>Review a document</h3><p>Paste text for local extraction, or choose a PDF, JPG or PNG for consent-based model extraction when the private server is enabled.</p>'+
 '<form id="zai-document-input">'+propPicker()+
 '<label>Paste document text<textarea name="text" rows="7" maxlength="12000" placeholder="Paste selected non-sensitive text from a policy, agreement or inspection document. Local review never transmits the text."></textarea></label>'+
 '<button type="button" class="zai-btn" id="zai-local-extract">Analyse pasted text on this device</button>'+
 '<label>Optional scanned document (max 3 MB)<input type="file" id="zai-doc-file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" '+(!connected?"disabled":"")+'></label>'+
 '<label class="zai-studio-consent"><input type="checkbox" id="zai-doc-consent" '+(!connected?"disabled":"")+'> I authorise sending this selected file to the external AI provider to extract draft metadata.</label>'+
 '<button type="button" id="zai-remote-extract" class="zai-btn" '+(!connected||docBusy?"disabled":"")+'>'+(docBusy?"Extracting…":"Extract metadata from file")+'</button>'+
 '</form></section><section class="zai-studio-panel"><h3>Review before registering</h3><p>All extracted fields are editable. ZIMBA will store only this reference metadata, not the underlying PDF or image.</p>'+
 (d?'<form id="zai-draft-review"><label>Title<input name="title" minlength="3" maxlength="180" required value="'+esc(d.title||"")+'"></label>'+
 '<label>Category<select name="category">'+cats.map(c=>'<option value="'+c+'" '+(c===d.category?"selected":"")+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>').join("")+'</select></label>'+
 '<label>Reference<input name="reference" maxlength="120" value="'+esc(d.reference||"")+'"></label>'+
 '<label>Expiry date<input name="expires" type="date" value="'+esc(d.expiresOn||"")+'"></label>'+
 '<label>Notes for your register<textarea name="notes" maxlength="1000" rows="4">'+esc(d.summary||"")+'</textarea></label>'+
 '<div class="zai-studio-note"><b>Extraction confidence:</b> '+esc(d.confidence||"low")+' · '+esc((d.uncertainties||[]).slice(0,3).join("; ")||"Verify against the original document.")+'</div>'+
 '<label class="zai-studio-consent"><input type="checkbox" name="reviewed" required> I reviewed these fields against the original document and approve registering this metadata.</label>'+
 '<button type="submit" class="zai-primary">Register verified metadata</button></form>':
 '<p class="zai-studio-empty">Start with a local text analysis or a consented file extraction. Nothing has been saved.</p>')+
 '</section></div>'+helperMessage();
}
function reminderText(invoice){
 const d=String(invoice.due||"").slice(0,10);
 return "Subject: Rent invoice follow-up — "+String(invoice.reference||"")+"\n\nHello,\n\nThis is a reminder to review rent invoice "+String(invoice.reference||"")+
 " for "+String(invoice.property||"the property")+". Our records show "+money(invoice.remaining)+
 " outstanding, with a due date of "+d+".\n\nIf payment has already been made, please share the payment reference so the property team can verify and reconcile the account.\n\nThank you,\nProperty Management";
}
function reminderUI(){
 const overdue=(snapshot?.overdueInvoices||[]),due=Number(snapshot?.summary?.dueNext7Days||0);
 return '<div class="zai-studio-panel"><h3>Human-reviewed rent reminders</h3><p>Draft notices only. Nothing is sent to tenants or recorded as a payment. Check the actual invoice and recipient in the billing centre before sending.</p>'+
 '<div class="zai-studio-note">'+overdue.length+' overdue invoice(s) available for drafting · '+due+' invoice(s) with remaining balances due within seven days.</div>'+
 (overdue.length?overdue.slice(0,20).map((i,k)=>'<article class="zai-studio-reminder"><div><b>'+esc(i.reference)+'</b><small>'+esc(i.property||"Property")+' · '+money(i.remaining)+' outstanding · Due '+esc(i.due)+'</small></div>'+
 '<button class="zai-btn" type="button" data-zai-draft="'+k+'">Review draft</button></article>').join(""):'<p class="zai-studio-empty">No overdue invoice references appear in this report.</p>')+
 '<section id="zai-reminder-preview" aria-live="polite"></section>'+
 '<p class="zai-disclaimer">The live invoice section remains the system of record. A suggested reminder must not be taken as proof that money is owed without checking any recent unrecorded payments.</p>'+
 '<a href="#/workspace/invoices" class="zai-btn">Open rent invoices</a></div>';
}
function paint(){
 const r=root(),host=r?.querySelector("#zai-studio-content");if(!host)return;
 r.querySelectorAll("[data-zai-studio]").forEach(b=>{b.setAttribute("aria-selected",String(b.dataset.zaiStudio===tab));b.tabIndex=tab===b.dataset.zaiStudio?0:-1;});
 host.innerHTML=tab==="assistant"?assistantUI():tab==="document"?documentUI():reminderUI();
 bindContent();
 window.ZimbaPrivacy?.refresh();
}
function parseLocal(text){
 const src=String(text||"").slice(0,12000),clean=src.replace(/\r/g,"").trim();
 if(clean.length<25)throw Error("Paste at least 25 characters of document text to analyse locally.");
 const lines=clean.split(/\n+/).map(s=>s.trim()).filter(Boolean);
 const first=(lines.find(l=>l.length>5&&!/^(ref|date|page|no\.?\s*:)/i.test(l))||"Document reference").slice(0,160);
 const full=clean.toLowerCase();
 const category=/insur|policy cover/.test(full)?"insurance":/inspection|assessment/.test(full)?"inspection":
 /certificate|compliance|permit|licen[sc]e/.test(full)?"compliance":/maintenance|repair/.test(full)?"maintenance":
 /invoice|statement|receipt|payment/.test(full)?"finance":/lease|rental agreement|tenancy|contract/.test(full)?"agreement":"other";
 const ref=clean.match(/(?:reference|policy number|certificate number|contract number|invoice number|ref\.?\s*(?:no\.?)?)\s*[:#-]?\s*([A-Z0-9/._-]{4,45})/i)?.[1]||"";
 const expiry=clean.match(/(?:expiry|expires? on|valid until|expiry date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i)?.[1]||"";
 return {title:first,category,reference:ref,expiresOn:expiry,summary:"Local draft: "+lines.slice(0,3).join(" ").slice(0,480),
  confidence:"low",uncertainties:["Text patterns are heuristic; the actual document has not been authenticated or validated.","Review the date, category and reference manually."]};
}
function handleLocal(){
 const textarea=root()?.querySelector('#zai-document-input textarea[name="text"]');
 try{documentDraft=parseLocal(textarea?.value||"");errorMessage="";paint();status("Local draft prepared. Review every field before registration.");}
 catch(e){status(e.message,true);}
}
async function remote(endpointPath,body){
 const base=endpoint();if(!base)throw Error("Private AI server not configured.");
 const token=await window.ZimbaAuth.token();
 const response=await fetch(base+endpointPath,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
  body:JSON.stringify(body),cache:"no-store"});
 const data=await response.json().catch(()=>({error:"Unexpected response"}));
 if(!response.ok)throw Error(data.error||"AI service request failed");
 return data;
}
async function checkConnection(){
 const base=endpoint();
 if(!base){connected=false;connectChecked=true;paint();return;}
 try{
  const url=new URL(base);
  if(url.protocol!=="https:"&&url.hostname!=="localhost"&&url.hostname!=="127.0.0.1")throw Error("A secure HTTPS AI endpoint is required.");
  const res=await fetch(base+"/api/v1/intelligence/status",{cache:"no-store"});
  const data=await res.json();
  connected=!!(res.ok&&data.enabled&&data.version==="5b");
 }catch{connected=false;}
 connectChecked=true;paint();
}
async function submitQuestion(e){
 e.preventDefault();if(!connected)return;
 const form=e.currentTarget;
 const question=String(new FormData(form).get("question")||"").trim();
 if(!form.querySelector("#zai-ai-consent")?.checked){status("Explicit consent is required.",true);return;}
 assistantBusy=true;paint();status("Analysing your authorised property summary…");
 try{assistantAnswer=await remote("/api/v1/intelligence/ask",{question,propertyId:scopeId||null,consent:true});status("Model-assisted analysis ready. Review before acting.");}
 catch(e){status("AI analysis unavailable: "+e.message,true);}
 finally{assistantBusy=false;paint();}
}
function fileAsBase64(file){
 return new Promise((resolve,reject)=>{
  if(file.size<16||file.size>3000000){reject(Error("File must be between 16 bytes and 3 MB."));return;}
  const reader=new FileReader();reader.onerror=()=>reject(Error("File could not be read."));
  reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
  reader.readAsDataURL(file);
 });
}
async function extractFile(){
 const form=root()?.querySelector("#zai-document-input"),file=form?.querySelector("#zai-doc-file")?.files?.[0];
 if(!connected){status("The private AI processor is not connected.",true);return;}
 if(!file){status("Choose a PDF, PNG or JPEG first.",true);return;}
 if(!form.querySelector("#zai-doc-consent")?.checked){status("You must consent before uploading this file for extraction.",true);return;}
 if(!propertyId){status("Choose a managed property first.",true);return;}
 docBusy=true;paint();status("Extracting draft metadata. No file is being saved to ZIMBA…");
 try{
  const base64=await fileAsBase64(file);
  const res=await remote("/api/v1/intelligence/extract",{propertyId,filename:file.name,mime:file.type,base64,consent:true});
  if(!res?.draft)throw Error("No draft was returned.");
  documentDraft=res.draft;status("Draft extraction complete. Review it against the original before registration.");
 }catch(e){status("Unable to extract document: "+e.message,true);}
 finally{docBusy=false;paint();}
}
async function saveDraft(e){
 e.preventDefault();if(!documentDraft)return;
 const form=e.currentTarget,data=new FormData(form);
 if(!data.get("reviewed")){status("Review and approve the extracted fields first.",true);return;}
 const payload={property:propertyId,title:String(data.get("title")||"").trim(),category:data.get("category"),
  reference:String(data.get("reference")||"").trim(),expires:data.get("expires")||null,notes:String(data.get("notes")||"").trim()};
 if(!window.confirm("Register these reviewed metadata fields for the selected property? The file itself will not be uploaded or saved."))return;
 const btn=form.querySelector('[type="submit"]');btn.disabled=true;
 try{await window.ZimbaAuth.enterpriseDocumentRegister(payload);
  documentDraft=null;status("Reviewed document metadata registered securely. No file was stored.");paint();
 }catch(err){status("Could not save document metadata: "+err.message,true);btn.disabled=false;}
}
function selectReminder(index){
 const invoice=(snapshot?.overdueInvoices||[])[index],target=root()?.querySelector("#zai-reminder-preview");if(!invoice||!target)return;
 const content=reminderText(invoice);
 target.innerHTML='<section class="zai-studio-preview"><h4>Draft — check recipient and payment status</h4><textarea id="zai-reminder-text" aria-label="Editable rent reminder draft" rows="10" maxlength="2300">'+esc(content)+'</textarea><div class="zai-studio-reminder-actions"><button type="button" class="zai-primary" id="zai-copy-reminder">Copy reviewed draft</button><small>This action copies text only; it does not send a message.</small></div></section>';
 target.querySelector("#zai-copy-reminder")?.addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(target.querySelector("#zai-reminder-text").value);status("Reminder text copied. Review the actual invoice before sharing.");}
  catch{target.querySelector("#zai-reminder-text").focus();target.querySelector("#zai-reminder-text").select();status("Copy is unavailable here; select the draft and copy manually.",true);}
 });
}
function bindContent(){
 const r=root();if(!r)return;
 r.querySelector("#zai-ai-ask")?.addEventListener("submit",submitQuestion);
 r.querySelector("#zai-studio-property")?.addEventListener("change",e=>{propertyId=e.target.value;documentDraft=null;paint();});
 r.querySelector("#zai-local-extract")?.addEventListener("click",handleLocal);
 r.querySelector("#zai-remote-extract")?.addEventListener("click",extractFile);
 r.querySelector("#zai-draft-review")?.addEventListener("submit",saveDraft);
 r.querySelectorAll("[data-zai-draft]").forEach(btn=>btn.addEventListener("click",()=>selectReminder(Number(btn.dataset.zaiDraft))));
}
function bind(report,scope){
 snapshot=report;scopeId=scope||"";assistantAnswer=null;documentDraft=null;assistantBusy=false;docBusy=false;
 const r=root();if(!r)return;tab="assistant";
 r.querySelectorAll("[data-zai-studio]").forEach(btn=>btn.addEventListener("click",()=>{
  tab=btn.dataset.zaiStudio;status("");paint();
 }));
 paint();checkConnection();
}
window.ZimbaAIStudio={page,bind,parseLocal,reminderText};
})();