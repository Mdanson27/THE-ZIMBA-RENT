(()=>{
"use strict";
const $=s=>document.querySelector(s),auth=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ugx=v=>"UGX "+Number(v||0).toLocaleString("en-UG");
const date=v=>v?new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("en-UG",{day:"numeric",month:"short",year:"numeric"}):"Not set";
const title=(name,sub)=>'<header class="zt-heading"><span>YOUR ZIMBA RESIDENT SPACE</span><h1>'+name+'</h1><p>'+sub+'</p></header>';
const panel=(heading,html)=>'<section class="zt-panel"><h2>'+heading+'</h2>'+html+'</section>';
const empty=()=>panel("Connect to your home",'<p>Your assigned property will appear once you approve your landlord’s invitation.</p><a class="zt-button" href="#/workspace/connection">View invitations ↗</a>');
const house=h=>'<article class="zt-house"><span class="zt-eyebrow">YOUR APPROVED HOME</span><h2>⌂ '+esc(h.property)+'</h2><p>'+esc(h.address||h.city||"Uganda")+'</p><div class="zt-facts">'+[['PROPERTY MANAGER',h.manager],['ROOM / UNIT',h.room||"Property-wide"],['MONTHLY RENT',h.monthlyRent==null?"Not set":ugx(h.monthlyRent)],['RENT START',date(h.rentStart)],['MONTH-END DUE',date(h.nextDue)]].map(([a,b])=>'<div><small>'+a+'</small><strong>'+esc(b)+'</strong></div>').join("")+'</div><a class="zt-button" href="#/workspace/messages">Message manager ↗</a> <a class="zt-button light" href="#/workspace/maintenance">Report issue</a></article>';
const selectHomes=list=>'<label>Connected home<select name="connection" id="zt-connection">'+list.map(h=>'<option value="'+esc(h.connectionId)+'">'+esc(h.property)+' · '+esc(h.room||"Property-wide")+'</option>').join("")+'</select></label>';
let seq=0;
function entry(section){
 const t={home:["Your home","Your property, manager and monthly rent together."],messages:["Resident messages","Talk directly to your connected property manager."],payments:["Rent & wallet","Your month-end rent schedule and verified balance."],maintenance:["Maintenance & requests","Report problems and follow their progress."]}[section]||["Resident space","Your private Zimba account"];
 return title(t[0],t[1])+'<div id="zt-content"><div class="zt-loading">Loading your secure information…</div></div>';
}
async function load(section){
 const token=++seq,root=$("#zt-content");if(!root)return;
 try{
  if(section==="payments"){const [homes,wallet]=await Promise.all([auth().tenantHome(),auth().tenantWallet()]);if(token===seq&&root.isConnected)payments(homes.homes||[],wallet);return}
  if(section==="maintenance"){const [homes,requests]=await Promise.all([auth().tenantHome(),auth().tenantServiceRequests()]);if(token===seq&&root.isConnected)maintenance(homes.homes||[],requests||[]);return}
  const d=await auth().tenantHome();if(token!==seq||!root.isConnected)return;
  if(section==="messages")messages(d.homes||[]);else home(d.homes||[]);
 }catch(e){if(token===seq&&root.isConnected)root.innerHTML=panel("Unable to load this section",'<p>'+esc(e.message)+'</p><p>Your login remains active.</p><button id="zt-retry" class="zt-button">Reload</button>');$("#zt-retry")?.addEventListener("click",()=>load(section))}
}
function home(list){
 $("#zt-content").innerHTML='<div class="zt-hero"><span>WELCOME HOME</span><h2>Hello, '+esc(String(auth().state.user?.name||"there").split(" ")[0])+'.</h2><p>Everything important about your home, together.</p></div>'+(list.length?list.map(house).join(""):empty())+
 panel("What would you like to do?",'<div class="zt-links"><a href="#/workspace/messages">✉ Contact your manager ↗</a><a href="#/workspace/maintenance">⚒ Maintenance requests ↗</a><a href="#/workspace/payments">▤ Rent & wallet ↗</a><a href="#/workspace/connection">⌂ Home connections ↗</a></div>');
}
function monthCard(h){return '<div class="zt-rent"><div><strong>'+esc(h.property)+'</strong><span>'+esc(h.room||"Property-wide")+'</span></div><div><strong>'+ (h.monthlyRent==null?"Rent not set":ugx(h.monthlyRent))+'</strong><span>Start '+date(h.rentStart)+' · Month-end '+date(h.nextDue)+'</span></div></div>'}
function payments(list,w){
 $("#zt-content").innerHTML='<div class="zt-wallet"><div class="zt-wallet-top"><span>ZIMBA WALLET</span><span>NO LIVE DEPOSITS</span></div><small>VERIFIED BALANCE</small><strong>'+ugx(w.verifiedBalance)+'</strong><div class="zt-wallet-ref"><div><small>PERSONAL WALLET REFERENCE</small><b>'+esc(w.reference)+'</b></div><button type="button" id="zt-copy">Copy</button></div></div>'+
 panel("Month-end rent schedule",list.length?list.map(monthCard).join(""):'<p>No assigned rooms yet.</p>')+
 panel("Deposit example · SAMPLE ONLY",'<div class="zt-demo"><span>Illustrative deposit</span><strong>+ UGX 250,000</strong><small>SAMPLE · NOT DEPOSITED · NOT SPENDABLE</small></div><p>This is a preview, not an actual transaction.</p>')+
 panel("Verified transaction history",(w.entries||[]).length?w.entries.map(e=>'<div class="zt-rent"><strong>'+ugx(e.amount)+'</strong><span>'+esc(e.reference)+' · '+date(e.date)+'</span></div>').join(""):'<p>There are no verified transactions.</p>')+
 '<div class="zt-note">ⓘ Your wallet reference is an internal identifier, not a bank or mobile money account. Funding and automated rent deductions are disabled until payment-provider verification and bank reconciliation are available.</div>';
 $("#zt-copy")?.addEventListener("click",()=>navigator.clipboard?.writeText(w.reference).then(()=>{$("#zt-copy").textContent="Copied ✓"}));
}
async function refreshThread(id){
 const root=$("#zt-thread");if(!root)return;root.textContent="Loading conversation…";
 try{const msgs=await auth().connectionMessages(id);if(!root.isConnected)return;root.innerHTML=msgs.length?msgs.map(m=>'<article class="zt-bubble '+(m.mine?"mine":"")+'"><b>'+esc(m.sender)+'</b><p>'+esc(m.body)+'</p><small>'+date(m.sent_at)+'</small></article>').join(""):'<p class="zt-muted">No messages yet. Say hello to your property manager.</p>';root.scrollTop=root.scrollHeight}catch(e){root.textContent=e.message}
}
function wireConversation(selector){
 const select=$(selector);select.onchange=()=>refreshThread(select.value);refreshThread(select.value);
 $("#zt-message-form").onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector("button");button.disabled=true;const d=new FormData(e.target);try{await auth().sendConnectionMessage(select.value,String(d.get("body")).trim());e.target.reset();await refreshThread(select.value);$("#zt-status").textContent="Message sent."}catch(err){$("#zt-status").textContent=err.message}finally{button.disabled=false}};
}
function messages(list){
 if(!list.length){$("#zt-content").innerHTML=empty();return}
 $("#zt-content").innerHTML=panel("Message the property management team",selectHomes(list)+'<div id="zt-thread" class="zt-thread"></div><form id="zt-message-form" class="zt-form"><label>Your message<textarea name="body" required maxlength="2000" rows="4" placeholder="Hello, I would like to ask about…"></textarea></label><button type="submit" class="zt-button">Send securely ↗</button><p id="zt-status" role="status"></p></form>')+'<div class="zt-note">ⓘ Only the approved tenant and authorised management members can access this conversation.</div>';
 wireConversation("#zt-connection");
}
function maintenance(list,items){
 $("#zt-content").innerHTML=(list.length?panel("Submit a service request",'<form id="zt-request-form" class="zt-form">'+selectHomes(list)+'<label>Problem description<textarea name="issue" minlength="8" maxlength="1200" rows="4" required placeholder="What needs attention?"></textarea></label><label>Priority<select name="priority"><option value="medium">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><button type="submit" class="zt-button">Submit request ↗</button><p id="zt-status" role="status"></p></form>'):empty())+
 panel("Your request history",items.length?items.map(x=>'<div class="zt-rent"><strong>'+esc(x.issue)+'</strong><span>'+esc(x.property)+' · '+esc(x.status)+' · '+date(x.date)+'</span></div>').join(""):'<p>No requests recorded.</p>')+
 '<div class="zt-note">ⓘ For urgent emergencies, contact the landlord or local emergency services directly. Online requests do not guarantee an immediate response.</div>';
 const form=$("#zt-request-form");if(form)form.onsubmit=async e=>{e.preventDefault();const d=new FormData(form),b=form.querySelector("button");b.disabled=true;try{await auth().tenantServiceRequest(d.get("connection"),String(d.get("issue")).trim(),d.get("priority"));load("maintenance")}catch(err){$("#zt-status").textContent=err.message;b.disabled=false}};
}
function managerEntry(){return title("Resident messages","Reply to verified tenants across your managed properties.")+'<div id="zt-content"><div class="zt-loading">Loading conversations…</div></div>'}
async function managerLoad(){
 try{
  const list=await auth().managerThreads();const root=$("#zt-content");if(!root)return;
  if(!list.length){root.innerHTML=panel("No conversations yet","<p>Approved resident connections will appear here.</p>");return}
  root.innerHTML=panel("Your resident conversations",'<label>Choose resident<select id="zt-manager-connection">'+list.map(x=>'<option value="'+esc(x.connection_id)+'">'+esc(x.resident_name)+' · '+esc(x.property_title)+'</option>').join("")+'</select></label><div id="zt-thread" class="zt-thread"></div><form id="zt-message-form" class="zt-form"><label>Reply<textarea name="body" rows="4" maxlength="2000" required></textarea></label><button type="submit" class="zt-button">Send reply ↗</button><p id="zt-status"></p></form>');
  wireConversation("#zt-manager-connection");
 }catch(e){const t=$("#zt-content");if(t)t.innerHTML=panel("Unable to load conversations",'<p>'+esc(e.message)+'</p>')}
}
window.ZimbaTenantPortal={entry,load,managerEntry,managerLoad};
})();