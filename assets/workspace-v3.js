(()=>{
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roles={landlord:["Landlord","Manage properties and residents"],manager:["Property manager","Organise your portfolio"],tenant:["Tenant","Your home and resident services"],renter:["Looking to rent","Find somewhere to belong"],buyer:["Looking to buy","Find your next home or investment"]};
const caps={free:1,starter:5,growth:50,business:250,enterprise:999999};
const plans=[["free","Free","One property • Simple management"],["starter","Starter","Five properties • Essential operations"],["growth","Growth","Fifty properties • Growing teams"],["business","Business","250 properties • Professional operations"],["enterprise","Enterprise","Custom capacity • Advanced operations"]];
const me=()=>window.ZimbaAuth?.state?.user||null;
const storeKey=()=>("zimba-workspace-v3:"+me()?.id);
const first=()=>String(me()?.name||me()?.email?.split("@")[0]||"Member").trim().split(/\s+/)[0];
let step=0,draft={},record=null,serverTier=null,tierLookupStarted=false,accountStatus='idle',propertyStatus='idle',syncError='';
const read=()=>{try{return JSON.parse(localStorage.getItem(storeKey())||"null")}catch{return null}};
const save=()=>localStorage.setItem(storeKey(),JSON.stringify(record));

function syncProfile(p){
 const mapped={version:3,role:p.role,area:p.area||"",preference:p.budget||"",plan:p.role==="landlord"||p.role==="manager"?"free":null,properties:[],completedAt:p.completedAt,localDraft:false,tenantRef:p.tenantRef||null};
 record=mapped;save();
}
function loadScreen(text){
 paint('<main class="zv-gate"><div class="zv-gate-copy"><a class="zv-logo" href="#/">zimba<span>.</span></a><span class="zv-overline">SECURE SYNC</span><h1>Your Zimba space is <em>coming together.</em></h1><p>'+esc(text)+'</p></div><div class="zv-gate-image"><span>ZIMBA · PROPERTY CONNECTED</span></div></main>');
}
function syncBlocked(){
 paint('<main class="zv-gate"><div class="zv-gate-copy"><a class="zv-logo" href="#/">zimba<span>.</span></a><span class="zv-overline">CONNECTION REQUIRED</span><h1>We couldn’t load your <em>secure account.</em></h1><p>'+esc(syncError||"The Neon data connection is temporarily unavailable.")+'</p><button id="zv-retry-sync" class="zv-button">Retry connection ↗</button><a href="#/" class="zv-text-link">← Public marketplace</a></div><div class="zv-gate-image"><span>YOUR DATA STAYS PRIVATE</span></div></main>');
 $("#zv-retry-sync").onclick=()=>{accountStatus="idle";propertyStatus="idle";render("home")};
}

const managed=()=>["landlord","manager"].includes(record?.role);
const adminCandidate=()=>String(me()?.email||"").toLowerCase()==="automindsafrica@gmail.com";
const copy=(label,value)=>'<div class="zv-detail"><span>'+label+'</span><strong>'+esc(value||"Not yet set")+'</strong></div>';
const note=message=>'<div class="zv-note">ⓘ '+message+'</div>';
function paint(html){document.body.classList.add("zv-workspace-on");$("#app").innerHTML=html;window.scrollTo(0,0)}
function failClosed(){
 const a=window.ZimbaAuth;
 if(!a||!a.state.ready){paint('<main class="zv-gate"><div class="zv-gate-copy"><a class="zv-logo" href="#/">zimba<span>.</span></a><h1>Preparing your<br><em>private space.</em></h1><p>Checking your account securely…</p></div></main>');return true}
 if(!a.state.user||!a.state.user.emailVerified){
 paint('<main class="zv-gate"><div class="zv-gate-copy"><a class="zv-logo" href="#/">zimba<span>.</span></a><span class="zv-overline">PRIVATE PROPERTY WORKSPACE</span><h1>Everything about home.<br><em>In one place.</em></h1><p>Your dashboard is a private experience. Please sign in with a verified Zimba account.</p><div class="zv-gate-buttons"><a class="zv-button" href="#/auth">Sign in securely ↗</a><a class="zv-button secondary" href="#/signup">Create account</a></div><a class="zv-text-link" href="#/">← Back to Zimba</a></div><div class="zv-gate-image"><span>YOUR WORLD. YOUR SPACE.</span></div></main>');return true}
 return false
}
function onboard(){
 if(failClosed())return;
 const title=step===0?"How will you use Zimba?":step===1?"Make it yours.":step===2?"A better way to begin.":"Your space is ready.";
 let fields="";
 if(step===0)fields='<div class="zv-choices">'+Object.entries(roles).map(([k,v])=>'<label class="zv-choice"><input type="radio" name="role" value="'+k+'" '+(draft.role===k?"checked":"")+' required><span class="zv-choice-icon">'+({landlord:"⌂",manager:"▦",tenant:"♙",renter:"⌕",buyer:"◇"}[k])+'</span><span><strong>'+v[0]+'</strong><small>'+v[1]+'</small></span><b>↗</b></label>').join("")+'</div>';
 else if(step===1){let m=["landlord","manager"].includes(draft.role);fields='<div class="zv-inputs">'+(m?'<label>What should we call your first property?<input name="property" maxlength="90" placeholder="e.g. Pearl Apartments" value="'+esc(draft.property||"")+'"></label>':'')+'<label>'+(m?"Where is it located?":"Which area interests you?")+'<input name="area" maxlength="100" placeholder="e.g. Ntinda, Kampala" value="'+esc(draft.area||"")+'"></label>'+(!m?'<label>'+(draft.role==="tenant"?"Landlord invitation reference (optional)":"Your approximate budget (optional)")+'<input name="preference" maxlength="100" placeholder="'+(draft.role==="tenant"?"Invitation reference":"e.g. UGX 2,500,000")+'" value="'+esc(draft.preference||"")+'"></label>':'')+'</div>';}
 else if(step===2)fields='<div class="zv-onboard-preview"><div class="zv-preview-symbol">⌂</div><div><small>YOUR ZIMBA SPACE</small><h2>'+esc(roles[draft.role]?.[0]||"Zimba member")+'</h2><p>'+esc(roles[draft.role]?.[1]||"")+'</p></div><span class="zv-pill">'+(["landlord","manager"].includes(draft.role)?"FREE · 1 PROPERTY":"PERSONAL · FREE")+'</span></div><div class="zv-ticks">✓ A dashboard built around you<br>✓ Only the features you actually need<br>✓ Set up the essentials first, add details later</div>';
 else fields='<div class="zv-onboard-preview"><div class="zv-preview-symbol">✧</div><div><small>READY FOR YOU</small><h2>'+esc(roles[draft.role]?.[0]||"Zimba")+'</h2><p>Simple to start. Ready to grow.</p></div></div><label class="zv-agree"><input type="checkbox" name="agree" required> I have read the <a href="#/legal/terms">draft Terms of Use</a> and <a href="#/legal/privacy">draft Privacy Policy</a>, and understand this is a development preview.</label>';
 paint('<main class="zv-onboarding"><aside class="zv-onboard-art"><a class="zv-logo" href="#/">zimba<span>.</span></a><div class="zv-art-house">⌂</div><div><span>THE HOME OF BETTER PROPERTY MANAGEMENT</span><h2>A new way to feel at home.</h2><p>Designed around the way you live, invest and manage.</p></div><small>ZIMBA RENT · UGANDA</small></aside><section class="zv-onboard-content"><header><span>YOUR PERSONAL SETUP</span><span>STEP '+(step+1)+' OF 4</span></header><div class="zv-progress">'+[0,1,2,3].map(i=>'<i class="'+(i<=step?"active":"")+'"></i>').join("")+'</div><form id="zv-onboard"><div class="zv-overline">LET US GET TO KNOW YOU</div><h1>'+title+'</h1><p class="zv-lede">'+(step===0?"Just choose what sounds like you. We'll handle the rest.":step===1?"Only a couple of questions. Nothing complicated.":step===2?"A thoughtful experience, from your first login.":"Everything is organised for your next chapter.")+'</p>'+fields+'<footer>'+(step?'<button type="button" class="zv-button secondary" id="zv-back">← Back</button>':'')+'<button class="zv-button" type="submit">'+(step===3?"Enter my Zimba space ↗":"Continue ↗")+'</button></footer></form><small class="zv-footnote">Thoughtful technology. Made for real people.</small></section></main>');
 $("#zv-back")?.addEventListener("click",()=>{step--;onboard()});
 $("#zv-onboard").onsubmit=e=>{
 e.preventDefault();const f=new FormData(e.target);
 if(step===0){if(!roles[f.get("role")])return;draft.role=f.get("role")}
 if(step===1){draft.area=String(f.get("area")||"").trim();draft.property=String(f.get("property")||"").trim();draft.preference=String(f.get("preference")||"").trim()}
 if(step===3){if(!f.get("agree"))return;
  const btn=e.target.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Creating your secure space…';
  window.ZimbaAuth.completeOnboarding({role:draft.role,area:draft.area||"",budget:draft.preference||"",property:draft.property||""})
   .then(result=>{if(!result?.role)throw new Error("Incomplete server response");syncProfile(result);propertyStatus='idle';location.hash="#/workspace/home";render("home")})
   .catch(err=>{btn.disabled=false;btn.textContent='Try again ↗';alert("Account setup could not be saved securely: "+err.message)});
  return;
 }
 step++;onboard();
 };
}
function shell(section,body){
 let nav=managed()?[["home","Overview","◫"],["properties","Properties","⌂"],["residents","Residents","♙"],["maintenance","Maintenance","⚒"],["finance","Financials","▤"],["plans","Plans & billing","✧"],["settings","Settings","⚙"]]:record.role==="tenant"?[["home","My home","⌂"],["connection","Connect to a home","♧"],["maintenance","Requests","⚒"],["payments","Payments","▤"],["settings","Settings","⚙"]]:[["home","Discover","⌕"],["preferences","My preferences","◈"],["settings","Settings","⚙"]];
 if(adminCandidate())nav=[...nav,["admin","Platform administration","✧"]];
 paint('<div class="zv-layout zv-plan-'+esc(record.plan||"personal")+'"><aside class="zv-sidebar"><div class="zv-brand-section"><a href="#/workspace/home" class="zv-logo">zimba<span>.</span></a><small>YOUR PRIVATE SPACE</small></div><div class="zv-user"><div class="zv-avatar">'+esc(first().charAt(0).toUpperCase())+'</div><div><b>'+esc(first())+'</b><small>'+esc(roles[record.role]?.[0])+'</small></div><i title="Signed in"></i></div><nav>'+nav.map(([k,v,icon])=>'<a href="#/workspace/'+k+'" class="'+(k===section?"selected":"")+'"><span>'+icon+'</span>'+v+'</a>').join("")+'</nav><div class="zv-sidebar-bottom">'+(managed()?'<a href="#/workspace/plans" class="zv-tier"><b>✧ '+esc((record.plan||"free").toUpperCase())+' WORKSPACE</b><small>'+(caps[record.plan||"free"]===999999?"Custom capacity":caps[record.plan||"free"]+" properties included")+' ↗</small></a>':"")+'<a href="#/">↗ Public marketplace</a><button id="zv-logout">⇥ Sign out</button></div></aside><section class="zv-stage"><header class="zv-topbar"><button id="zv-toggle" aria-label="Open navigation">☰</button><div class="zv-breadcrumb"><span>YOUR SPACE</span> / <b>'+esc(nav.find(n=>n[0]===section)?.[1]||"Overview")+'</b></div><div class="zv-topright"><span class="zv-live"><i></i> Signed in</span><span class="zv-userdot">'+esc(first().charAt(0).toUpperCase())+'</span></div></header><main class="zv-content">'+body+'</main></section></div><div id="zv-dialog"></div>');
 $("#zv-logout").onclick=()=>window.ZimbaAuth.logout();
 $("#zv-toggle").onclick=()=>$(".zv-layout").classList.toggle("nav-open");
}
const head=(title,sub)=>'<header class="zv-page-title"><span class="zv-overline">ZIMBA · YOUR SPACE</span><h1>'+title+'</h1><p>'+sub+'</p></header>';
const warning=text=>'<div class="zv-disclaimer">ⓘ '+text+'</div>';
const stats=(icon,label,value,foot)=>'<div class="zv-stat"><span>'+icon+'</span><strong>'+value+'</strong><b>'+label+'</b><small>'+foot+'</small></div>';
function home(){
 const h=new Date().getHours(),g=h<12?"Good morning":h<17?"Good afternoon":"Good evening",n=esc(first());
 if(managed()){
  const used=(record.properties||[]).length;return '<div class="zv-hero"><div><span class="zv-overline">YOUR PROPERTY WORLD</span><h1>'+g+', '+n+'.</h1><p>A quieter, smarter way to manage what matters.</p><a class="zv-button light" href="#/workspace/properties">Manage my properties ↗</a></div><span class="zv-hero-symbol">⌂</span></div><div class="zv-stats">'+stats("⌂","Properties",used+" / "+(caps[record.plan||"free"]===999999?"∞":caps[record.plan||"free"]),"On your "+record.plan+" plan")+stats("♙","Residents","—","Secure linking pending")+stats("⚒","Open requests","—","Sync pending")+stats("▤","Rent collection","—","Ledger pending")+'</div><div class="zv-panels"><section class="zv-panel"><h2>A better start, one step at a time.</h2><a href="#/workspace/properties" class="zv-task"><b>01</b><div><strong>Add your property</strong><small>Build your personal portfolio</small></div>↗</a><a href="#/workspace/residents" class="zv-task"><b>02</b><div><strong>Prepare your resident connections</strong><small>Secure invitations are being developed</small></div>↗</a><a href="#/workspace/settings" class="zv-task"><b>03</b><div><strong>Set up your preferences</strong><small>Make your workspace yours</small></div>↗</a></section><section class="zv-panel zv-advice"><span>✧</span><h2>Your space is growing with you.</h2><p>Property operations, communications and meaningful insights—all in one place.</p><a href="#/workspace/plans">See subscription features ↗</a></section></div>'+warning("Your account and property drafts are stored in Neon. Tenant, payment and maintenance functionality requires further protected backend work.")
 }
 if(record.role==="tenant")return '<div class="zv-hero"><div><span class="zv-overline">YOUR RESIDENT SPACE</span><h1>'+g+', '+n+'.</h1><p>Everything you need for a more comfortable place to call home.</p><a class="zv-button light" href="#/workspace/connection">Connect to a property ↗</a></div><span class="zv-hero-symbol">⌂</span></div><div class="zv-panels"><section class="zv-panel"><h2>Welcome to your home space.</h2><p>Share your display reference with your landlord once verified invitation syncing is available.</p><div class="zv-reference">'+esc(record.tenantRef)+'</div><small>Reference preview only—not an access credential.</small></section><section class="zv-panel"><h2>Everything in one place.</h2><p>Lease information, requests, receipts and resident communications will appear here when your home is securely connected.</p></section></div>'+warning("Tenant linking requires a server-verified invitation; a reference alone cannot grant property access.");
 return '<div class="zv-hero"><div><span class="zv-overline">YOUR PROPERTY JOURNEY</span><h1>'+g+', '+n+'.</h1><p>Find the space for your next chapter, with less noise and more clarity.</p><a class="zv-button light" href="#/properties?intent='+(record.role==="buyer"?"buy":"rent")+'">Explore properties ↗</a></div><span class="zv-hero-symbol">⌕</span></div><div class="zv-panels"><section class="zv-panel"><h2>Your search, your preferences.</h2>'+copy("Preferred area",record.area||"Uganda")+copy("Budget",record.preference||"Flexible")+'<a class="zv-inline-link" href="#/workspace/settings">Review preferences ↗</a></section><section class="zv-panel"><h2>Discover thoughtfully.</h2><p>Property discovery is tailored to your interest in '+(record.role==="buyer"?"buying":"renting")+'.</p><a class="zv-inline-link" href="#/properties">Browse marketplace ↗</a></section></div>'
}
function properties(){
 let count=record.properties?.length||0,limit=caps[record.plan||"free"],canAdd=count<limit;
 return head("Your property portfolio","All the spaces you manage, beautifully organised.")+'<div class="zv-toolbar"><strong>'+count+' of '+(limit===999999?"unlimited":limit)+' properties</strong><button class="zv-button" id="zv-add" '+(!canAdd?"disabled":"")+'>＋ Add a property</button></div>'+(count?'<div class="zv-property-list">'+record.properties.map((p,i)=>'<article><span class="zv-property-icon">⌂</span><div><small>PROPERTY '+String(i+1).padStart(2,"0")+'</small><h3>'+esc(p.name)+'</h3><p>'+esc(p.area||"Location not set")+'</p></div><span class="zv-pill">Private draft</span></article>').join("")+'</div>':'<div class="zv-empty"><span>⌂</span><h2>Every great portfolio starts with one.</h2><p>Add your first property without filling in endless forms.</p><button class="zv-button" id="zv-first">Add your first property ↗</button></div>')+(!canAdd?'<div class="zv-upgrade"><div><h3>Ready to grow?</h3><p>Your '+esc(record.plan)+' plan currently includes '+limit+' property. You can explore a higher tier.</p></div><a href="#/workspace/plans" class="zv-button light">See plans ↗</a></div>':"")+warning("Property creation is saved in Neon and the property limit is enforced in the database. Property publishing and leases remain under development.")
}
function openProperty(){
 const modal=$("#zv-dialog");modal.innerHTML='<div class="zv-modal-bg"><section class="zv-modal" role="dialog" aria-modal="true" aria-label="Add a property"><button id="zv-close" aria-label="Close">×</button><span class="zv-overline">YOUR NEXT PROPERTY</span><h2>Let’s start with the essentials.</h2><p>We can add the finer details later.</p><form id="zv-property"><label>Property name<input name="name" maxlength="100" required placeholder="e.g. Garden Court"></label><label>Location<input name="area" maxlength="100" required placeholder="e.g. Kololo, Kampala"></label><button class="zv-button" type="submit">Save property securely ↗</button></form><small>Your property will be saved as a private draft in Neon.</small></section></div>';
 $("#zv-close").onclick=()=>modal.innerHTML="";
 $("#zv-property").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);if(record.properties.length>=caps[record.plan||"free"])return;
  const submit=e.target.querySelector('[type=submit]');submit.disabled=true;submit.textContent='Saving to Neon…';
  window.ZimbaAuth.createProperty(String(f.get("name")).trim(),String(f.get("area")).trim(),"mixed")
   .then(()=>{modal.innerHTML="";propertyStatus='idle';render("properties")})
   .catch(err=>{submit.disabled=false;submit.textContent='Try saving again ↗';alert("Property could not be saved: "+err.message)});
 };
}
function plansPage(){
 return head("Choose your space","Every plan feels like Zimba. As you grow, the tools grow with you.")+'<div class="zv-plans">'+plans.map(([id,name,desc])=>'<article class="zv-plan-card zv-'+id+' '+(record.plan===id?"current":"")+'"><div class="zv-plan-visual">'+(id==="enterprise"?"✧":id==="business"?"✦":"⌂")+'</div><span class="zv-overline">'+id.toUpperCase()+'</span><h2>'+name+'</h2><p>'+desc+'</p><strong>'+(id==="free"?"UGX 0":"Pricing pending")+'</strong><div class="zv-ticks">✓ '+(caps[id]===999999?"Custom capacity":caps[id]+" properties")+'<br>✓ '+({free:"Basic workspace",starter:"Essential operations",growth:"Team collaboration",business:"Advanced reporting",enterprise:"Custom integrations"}[id])+'<br>✓ Zimba property experience</div><span class="zv-button '+(record.plan===id?"light":"secondary")+'">'+(record.plan===id?"Current plan":"Admin-assigned tier")+'</span></article>').join("")+'</div>'+warning("Plans are provisional. Only the authenticated AutoMinds administrator can assign paid tiers; payments and server-enforced quotas are not active yet.")
}
function other(section){
 if(section==="settings")return head("Your account","Personalised for how you use property.")+'<section class="zv-panel"><h2>'+esc(me()?.name||first())+'</h2>'+copy("Email",me()?.email)+copy("Using Zimba as",roles[record.role]?.[0])+copy("Area",record.area)+copy("Membership",managed()?record.plan:"Free personal account")+'<div class="zv-toolbar"><button class="zv-button secondary" id="zv-restart">Review first-time setup</button></div></section>'+warning("Your onboarding record is stored in Neon. Role changes require verification.");
 let labels={residents:["Residents","A better way to keep everyone connected.","Verified invitations and resident records will be connected through Neon."],maintenance:["Maintenance","Resolve issues without the endless messages.","Create requests, assign work and follow progress when secure synchronization is ready."],finance:["Financials","A clearer view of your portfolio.","Live statements, bills and reconciliations will appear once the secure ledger is activated."],payments:["My payments","Your payments in one trusted place.","Real transactions and receipts require the approved payment backend."],connection:["Connect to a home","Your landlord, your home, one simple connection.","A server-generated invitation will link your verified account with your property and unit."],preferences:["My preferences","A home for everything you're looking for.","Preferences will synchronize between devices after backend activation."]};
 let a=labels[section]||labels.preferences;
 return head(a[0],a[1])+'<section class="zv-panel"><h2>Built around your needs.</h2><p>'+a[2]+'</p>'+(section==="connection"?'<div class="zv-reference">'+esc(record.tenantRef||"Pending")+'</div><small>Display reference, not a secure invitation token.</small>':"")+'</section>'+warning("Secure Neon backend integration is required before real resident, lease or financial operations can be enabled.")
}
function adminPage(){
 if(!adminCandidate())return head("Access restricted","Platform administration requires a verified AutoMinds account.");
 return head("Subscription administration","Manage every member's tier with full audit accountability.")+
 '<div class="zv-panel"><div class="zv-toolbar"><div><strong>Registered Zimba accounts</strong><p class="zv-muted">Only the verified AutoMinds Google administrator can approve tier assignments.</p></div><button class="zv-button" id="zv-load-users">Load users ↗</button></div><div id="zv-admin-users"><p>Load verified accounts to assign Starter, Growth, Business or Enterprise access.</p></div></div>'+
 warning("Tier changes are executed in Neon through a role-checked, audited function. Changing this screen or local storage cannot grant a subscription.");
}
function showAdminUsers(rows){
 const target=$("#zv-admin-users");if(!target)return;
 if(!Array.isArray(rows)||!rows.length){target.innerHTML='<p>No registered accounts yet.</p>';return}
 target.innerHTML='<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Account</th><th>Current plan</th><th>New tier</th><th>Reason</th><th>Action</th></tr></thead><tbody>'+
 rows.map(u=>'<tr><td><strong>'+esc(u.display_name||"Member")+'</strong><div>'+esc(u.email)+'</div></td><td>'+esc(u.plan_code||"Unassigned")+'</td><td><select data-zv-plan="'+esc(u.user_id)+'">'+["free","starter","growth","business","enterprise"].map(k=>'<option value="'+k+'" '+(k===u.plan_code?"selected":"")+'>'+k+'</option>').join("")+'</select></td><td><input data-zv-reason="'+esc(u.user_id)+'" maxlength="300" placeholder="Why is the tier changing?"></td><td><button class="zv-button" data-zv-save="'+esc(u.user_id)+'">Assign</button></td></tr>').join("")+'</tbody></table></div>';
 target.querySelectorAll("[data-zv-save]").forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.zvSave,plan=target.querySelector('[data-zv-plan="'+id+'"]').value,reason=target.querySelector('[data-zv-reason="'+id+'"]').value.trim();
  if(reason.length<5){alert("Enter an audit reason of at least five characters.");return}
  btn.disabled=true;btn.textContent="Saving…";
  window.ZimbaAuth.assignPlan(id,plan,reason).then(()=>window.ZimbaAuth.listUsers()).then(data=>showAdminUsers(data))
   .catch(err=>{alert("Assignment denied: "+err.message);btn.disabled=false;btn.textContent="Assign"});
 });
}
function render(section){
 if(failClosed())return;
 if(accountStatus==='idle'){
  accountStatus='loading';loadScreen("Loading your account and first-time setup…");
  window.ZimbaAuth.myOnboarding().then(data=>{
   accountStatus='ready';
   if(data?.role)syncProfile(data);else{record=null;localStorage.removeItem(storeKey())}
   render(section);
  }).catch(err=>{syncError=err.message;accountStatus='error';render(section)});
  return;
 }
 if(accountStatus==='loading')return;
 if(accountStatus==='error'){syncBlocked();return}
 record=read();
 if(!record||record.version!==3){step=0;draft={};onboard();return}
 if(["landlord","manager"].includes(record.role)){
  record.plan=serverTier||"free";
  if(!tierLookupStarted && window.ZimbaAuth?.myPlan){
   tierLookupStarted=true;
   window.ZimbaAuth.myPlan().then(result=>{
    const tier=String(result?.code||"free").toLowerCase();
    serverTier=Object.prototype.hasOwnProperty.call(caps,tier)?tier:"free";
    if(location.hash.startsWith("#/workspace/"))render(String(location.hash.slice(2)).split("/").slice(1).join("/")||"home");
   }).catch(()=>{serverTier="free"});
  }
  if(propertyStatus==='idle'){
   propertyStatus='loading';loadScreen("Loading your private property records…");
   window.ZimbaAuth.myProperties().then(rows=>{
    record=read();
    record.properties=Array.isArray(rows)?rows.map(x=>({id:x.id,name:x.title,area:x.city||"",category:x.category,status:x.visibility})):[];
    save();propertyStatus='ready';render(section);
   }).catch(err=>{syncError=err.message;propertyStatus='error';render(section)});
   return;
  }
  if(propertyStatus==='loading')return;
  if(propertyStatus==='error'){syncBlocked();return}
 }
 if(section==="overview")section="home";
 if(["properties","residents","finance","plans"].includes(section)&&!managed())section="home";
 if(["connection","payments"].includes(section)&&record.role!=="tenant")section="home";
 if(section==="admin"&&!adminCandidate())section="home";
 if(!["home","properties","plans","settings","residents","maintenance","finance","payments","connection","preferences","admin"].includes(section))section="home";
 shell(section,section==="home"?home():section==="properties"?properties():section==="plans"?plansPage():section==="admin"?adminPage():other(section));
 $("#zv-add")?.addEventListener("click",openProperty);
 $("#zv-first")?.addEventListener("click",openProperty);
 $("#zv-load-users")?.addEventListener("click",()=>{const t=$("#zv-admin-users");t.textContent="Verifying your administrator identity…";window.ZimbaAuth.listUsers().then(showAdminUsers).catch(err=>{t.textContent="Access unavailable: "+err.message})});
 $("#zv-restart")?.addEventListener("click",()=>{step=0;draft={role:record.role};onboard()});
}
window.ZimbaWorkspace={render:function(path){render(String(path||"workspace/home").split("/").slice(1).join("/")||"home")},clear:function(){document.body.classList.remove("zv-workspace-on")}};
window.addEventListener("zimba-auth-change",()=>{
 serverTier=null;tierLookupStarted=false;accountStatus="idle";propertyStatus="idle";syncError="";
 if(location.hash.startsWith("#/workspace/"))window.ZimbaWorkspace.render(location.hash.slice(2))
});
})();
