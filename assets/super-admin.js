/* ZIMBA CONTROL — verified platform administration.
   All data originates from Neon RPC functions guarded by verified identity. */
(()=>{
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>v==null?"Custom pricing":"UGX "+Number(v).toLocaleString("en-UG");
const number=v=>Number(v||0).toLocaleString("en-UG");
const date=v=>v?new Date(v).toLocaleDateString("en-UG",{day:"numeric",month:"short",year:"numeric"}):"—";
const categories=["overview","accounts","organizations","properties","subscriptions","activity","system"];
const nav=[["overview","Command centre","◈"],["accounts","User accounts","♙"],["organizations","Organisations","▤"],["properties","Property inventory","⌂"],["subscriptions","Subscriptions","◇"],["activity","Audit activity","⇄"],["system","Platform health","⚙"]];
let verifyState="idle",verified=false,currentUser=null,cache={},activeSection="overview",loadingVersion=0;
const auth=()=>window.ZimbaAuth;
function paint(html){document.body.classList.add("zimba-control-mode");document.body.classList.remove("zv-workspace-on");$("#app").innerHTML=html;window.scrollTo(0,0)}
function clear(){document.body.classList.remove("zimba-control-mode")}
function status(text,kind=""){const msg=$("#zc-notify");if(!msg)return;msg.textContent=text;msg.className="zc-notify "+kind;msg.hidden=false;clearTimeout(window._zcn);window._zcn=setTimeout(()=>msg.hidden=true,5500)}
function loading(message){paint('<main class="zc-gate"><div><span class="zc-monogram">Z.</span><span class="zc-eyebrow">ZIMBA PLATFORM OPERATIONS</span><h1>Opening your control centre.</h1><p>'+esc(message||"Verifying administrative access…")+'</p><div class="zc-loader"></div></div></main>')}
function connectionError(message){
 paint('<main class="zc-gate"><div><span class="zc-monogram">Z.</span><span class="zc-eyebrow">SECURE CONNECTION</span><h1>We couldn’t connect to Zimba Auth.</h1><p>'+esc(message||"The service could not verify your current session.")+'</p><button id="zc-retry-connection" class="zc-btn">Retry secure connection ↗</button><a class="zc-btn secondary" href="#/auth">Sign in again</a></div></main>');
 $("#zc-retry-connection").onclick=()=>{verifyState="idle";render(activeSection)};
}
function forbidden(message){
 paint('<main class="zc-gate"><div><span class="zc-monogram">Z.</span><span class="zc-eyebrow">PRIVATE ADMINISTRATION</span><h1>Restricted access.</h1><p>'+esc(message||"Only the verified Zimba platform administrator can access this console.")+'</p><a class="zc-btn" href="#/workspace/home">Return to my space ↗</a><button id="zc-retry" class="zc-btn secondary">Check again</button></div></main>');
 $("#zc-retry").onclick=()=>{verifyState="idle";render(activeSection)};
}
function name(){return String(auth()?.state?.user?.name||"AutoMinds").split(" ")[0]}
function shell(section){
 const item=nav.find(n=>n[0]===section)||nav[0];
 paint('<div class="zc-app"><aside class="zc-side"><div class="zc-side-top"><a href="#/console/overview" class="zc-brand">zimba<span>.</span><small>CONTROL</small></a><div class="zc-instance">PLATFORM ADMINISTRATION<span>◉ OPERATIONAL CONSOLE</span></div></div><div class="zc-admin-identity"><div class="zc-admin-icon">A</div><div><strong>AUTOMINDS AFRICA</strong><small>Verified Super Administrator</small></div><span class="zc-verified">✓</span></div><nav class="zc-nav">'+nav.map(([id,title,icon])=>'<a class="'+(id===section?"current":"")+'" href="#/console/'+id+'"><b>'+icon+'</b><span>'+title+'</span></a>').join("")+'</nav><div class="zc-side-foot"><div class="zc-security"><span>✧</span><div><strong>Administrator verified</strong><small>Neon identity & Google OAuth</small></div></div><a href="#/">↗ Open public website</a><button id="zc-signout">⇥ Sign out</button></div></aside><section class="zc-stage"><header class="zc-topbar"><div class="zc-top-left"><button id="zc-menu" aria-label="Toggle navigation">☰</button><span class="zc-breadcrumb">PLATFORM / <strong>'+esc(item[1])+'</strong></span></div><div class="zc-top-right"><span class="zc-env"><i></i> Production preparation</span><span class="zc-admin-tag">SUPER ADMIN</span><span class="zc-avatar">A</span></div></header><main class="zc-main"><div id="zc-body"></div></main></section></div><div id="zc-notify" hidden></div>');
 $("#zc-menu").onclick=()=>$(".zc-app").classList.toggle("zc-menu-open");
 $("#zc-signout").onclick=()=>auth().logout().catch(e=>status(e.message,"error"));
}
function heading(kicker,title,desc,action=""){return '<div class="zc-heading"><div><span class="zc-eyebrow">'+esc(kicker)+'</span><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p></div>'+action+'</div>'}
function card(ico,label,value,desc){return '<article class="zc-metric"><div class="zc-metric-top"><span>'+ico+'</span><small>LIVE DATABASE</small></div><strong>'+esc(number(value))+'</strong><b>'+esc(label)+'</b><small>'+esc(desc)+'</small></article>'}
function panel(title,body,meta=""){return '<section class="zc-panel"><div class="zc-panel-head"><h2>'+esc(title)+'</h2><span>'+esc(meta)+'</span></div>'+body+'</section>'}
function empty(text){return '<div class="zc-empty"><span>◈</span><p>'+esc(text)+'</p></div>'}
function notice(text){return '<div class="zc-information"><span>ⓘ</span><p>'+esc(text)+'</p></div>'}
function table(cols,rows){return '<div class="zc-table-scroll"><table class="zc-table"><thead><tr>'+cols.map(x=>'<th>'+esc(x)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>'}
function row(cells){return '<tr>'+cells.map(x=>'<td>'+x+'</td>').join("")+'</tr>'}
function badge(v){const s=String(v||"Unknown");return '<span class="zc-badge '+(s.toLowerCase()==="verified"||s.toLowerCase()==="active"||s.toLowerCase()==="published"?"positive":"")+'">'+esc(s)+'</span>'}
const icons=["◈","♙","▤","⌂","◇","⇄","⚙"];
async function fetchSection(section){
 const a=auth();
 if(section==="overview")return a.superAdminOverview();
 if(section==="accounts")return a.listUsers();
 if(section==="organizations")return a.superAdminOrganizations();
 if(section==="properties")return a.superAdminProperties();
 if(section==="subscriptions")return a.superAdminPlans();
 if(section==="activity")return a.superAdminActivity();
 if(section==="system"){const [overview,plans]=await Promise.all([a.superAdminOverview(),a.superAdminPlans()]);return {overview,plans}};
 return {};
}
function renderData(section,data){
 const el=$("#zc-body");if(!el)return;
 if(section==="overview"){
  const roles=Object.entries(data.onboarding||{});
  const subs=Object.entries(data.subscriptions||{});
  el.innerHTML=heading("REAL-TIME PLATFORM INTELLIGENCE","Platform overview","A clear, connected view of Zimba's people, portfolios and growth.",'<button class="zc-btn" id="zc-refresh">↻ Refresh metrics</button>')+
   '<div class="zc-metrics">'+card("♙","Registered accounts",data.users,"Neon Auth identities")+card("▤","Organisations",data.organizations,"Managed property groups")+card("⌂","Registered properties",data.properties,"Excluding archived records")+card("♧","Resident connections",data.residentConnections,"Active verified connections")+'</div>'+
   '<div class="zc-two-col">'+panel("Account composition",roles.length?'<div class="zc-bars">'+roles.map(([name,count])=>'<div class="zc-bar"><div><span>'+esc(name)+'</span><strong>'+number(count)+'</strong></div><div class="zc-bar-track"><span style="width:'+Math.min(100,100*count/Math.max(1,data.users))+'%"></span></div></div>').join("")+'</div>':empty("Account roles will appear as members complete onboarding."),"BY ACCOUNT TYPE")+
   panel("Subscriptions",subs.length?'<div class="zc-distribution">'+subs.map(([name,count])=>'<div><span>'+esc(name.toUpperCase())+'</span><strong>'+number(count)+'</strong></div>').join("")+'</div>':empty("No assigned subscriptions."),"USER TIERS")+'</div>'+
   panel("Platform operations",'<div class="zc-ops">'+[['Email-verified users',number(data.verifiedUsers)],['Pending resident invitations',number(data.activeInvitations)],['Database connection',badge("Active")],['Data observed',date(data.observedAt)]].map(([l,v])=>'<div><span>'+l+'</span><strong>'+v+'</strong></div>').join("")+'</div>',"BACKEND DATA")+
   notice("Figures are read directly from Neon. No fabricated revenue, payment totals or occupancy statistics are presented.");
 }
 else if(section==="accounts"){
  cache.accounts=Array.isArray(data)?data:[];
  el.innerHTML=heading("IDENTITY & ACCESS","User accounts","Find members, review their account status and assign the right subscription tier.",'<button class="zc-btn" id="zc-refresh">↻ Refresh directory</button>')+
    '<div class="zc-panel"><div class="zc-toolbar"><input id="zc-search" type="search" placeholder="Search names or email addresses" aria-label="Search accounts"><span>'+number(cache.accounts.length)+' registered accounts (up to 200)</span></div><div id="zc-user-table"></div></div>'+
    notice("Tier changes require a reason and are validated and audited in PostgreSQL. This screen does not collect payments.");
  paintUsers(cache.accounts);
  $("#zc-search")?.addEventListener("input",e=>{const needle=e.target.value.toLowerCase();paintUsers(cache.accounts.filter(u=>(u.email||"").toLowerCase().includes(needle)||(u.display_name||"").toLowerCase().includes(needle)))});
 }
 else if(section==="organizations"){
  const list=Array.isArray(data)?data:[];
  el.innerHTML=heading("ORGANISATION MANAGEMENT","Property organisations","Visibility into the entities operating on the Zimba platform.",'<button class="zc-btn" id="zc-refresh">↻ Reload</button>')+
    panel("Registered organisations",list.length?table(["Organisation","Identifier","Properties","Tier","Created"],list.map(o=>row(['<strong>'+esc(o.name)+'</strong>','<code>'+esc(o.slug)+'</code>',number(o.property_count),badge(o.subscription_tier||"Free"),date(o.created_at)]))):empty("No organisations have been created yet."),number(list.length)+" ORGANISATIONS");
 }
 else if(section==="properties"){
  const list=Array.isArray(data)?data:[];
  el.innerHTML=heading("ASSET REGISTER","Property inventory","Every enrolled property and the organisation responsible for it.",'<button class="zc-btn" id="zc-refresh">↻ Reload</button>')+
    panel("Managed property records",list.length?table(["Property","Organisation","City","Visibility","Created"],list.map(o=>row(['<strong>'+esc(o.title)+'</strong>',''+esc(o.organization_name),esc(o.city||"—"),badge(o.visibility),date(o.created_at)]))):empty("No live database property records to display."),number(list.length)+" PROPERTIES");
 }
 else if(section==="subscriptions"){
  const list=Array.isArray(data)?data:[];
  el.innerHTML=heading("COMMERCIAL OPERATIONS","Subscription management","A consistent Zimba platform with clearly differentiated capacity and access.",'<a class="zc-btn" href="#/console/accounts">Manage user tiers ↗</a>')+
  '<div class="zc-pricing">'+list.map(plan=>'<article class="zc-price-card"><span class="zc-eyebrow">'+esc(plan.code.toUpperCase())+'</span><h2>'+esc(plan.name)+'</h2><strong>'+esc(money(plan.price))+'</strong><small>'+esc(plan.status==="approved"?"Included plan":"Proposed launch price")+'</small><div class="zc-price-rule"></div><div class="zc-price-line"><span>Property capacity</span><b>'+esc(plan.cap==null?"Custom":number(plan.cap))+'</b></div><div class="zc-price-line"><span>Assigned accounts</span><b>'+number(plan.users)+'</b></div></article>').join("")+'</div>'+
  notice("Paid prices are research-based proposals and not approved invoices. Charging and automatic subscription renewals remain disabled.");
 }
 else if(section==="activity"){
  const changes=Array.isArray(data.tierChanges)?data.tierChanges:[];
  const users=Array.isArray(data.recentAccounts)?data.recentAccounts:[];
  el.innerHTML=heading("ACCOUNTABILITY","Platform activity","Transparent administrative decisions and recent account registrations.",'<button class="zc-btn" id="zc-refresh">↻ Refresh activity</button>')+
   '<div class="zc-two-col">'+panel("Tier assignment history",changes.length?'<div class="zc-timeline">'+changes.map(x=>'<div><span class="zc-dot"></span><div><strong>'+esc(x.email)+'</strong><p>'+esc(x.from||"None")+' → '+esc(x.to)+'</p><small>'+esc(x.reason||"No reason supplied")+' · '+date(x.at)+'</small></div></div>').join("")+'</div>':empty("No plan changes yet."),"AUDIT LOG")+
   panel("Recent accounts",users.length?'<div class="zc-timeline">'+users.map(x=>'<div><span class="zc-dot"></span><div><strong>'+esc(x.email)+'</strong><p>'+date(x.createdAt)+'</p><small>'+esc(x.verified?"Verified":"Unverified")+'</small></div></div>').join("")+'</div>':empty("No recent account registrations."),"NEON AUTH")+'</div>';
 }
 else if(section==="system"){
  const d=data.overview||{},p=data.plans||[];
  el.innerHTML=heading("PLATFORM OVERSIGHT","System health","Architecture, access controls and deployment readiness at a glance.")+
  '<div class="zc-metrics">'+card("◉","Database records",d.properties,"Properties in the database")+card("♙","Verified accounts",d.verifiedUsers,"Verified through Neon Auth")+card("◇","Subscription tiers",p.length,"Plan definitions configured")+card("♧","Active invitations",d.activeInvitations,"Awaiting acceptance")+'</div>'+
  panel("Architecture & access",'<div class="zc-ops"><div><span>Identity provider</span><strong>Neon Managed Auth</strong></div><div><span>Primary data store</span><strong>Neon PostgreSQL</strong></div><div><span>Frontend hosting</span><strong>GitHub Pages</strong></div><div><span>Super Admin identity</span><strong>Verified Google account</strong></div><div><span>Tenant isolation</span><strong>Database-scoped functions</strong></div><div><span>Payment processing</span><strong>Not activated</strong></div></div>',"SERVICE STATUS")+
  notice("The platform is undergoing production hardening. Browser authentication, onboarding, role isolation, payment integrations, policy approvals and backup restoration must pass end-to-end testing before a production go-live.");
 }
 $("#zc-refresh")?.addEventListener("click",()=>load(section,true));
}
function paintUsers(users){
 const el=$("#zc-user-table");if(!el)return;
 if(!users.length){el.innerHTML=empty("No accounts match your search.");return}
 const plans=["free","starter","growth","business","enterprise"];
 el.innerHTML=table(["Member","Identity","Role","Current plan","New tier","Reason","Action"],users.map(u=>row([
 '<strong>'+esc(u.display_name||"Member")+'</strong><small>'+esc(u.email)+'</small>',
 badge(u.email_verified?"Verified":"Pending"),
 badge(u.account_role||"Not onboarded"),
 badge(u.plan_code||"Unassigned"),
 '<select data-tier="'+esc(u.user_id)+'">'+plans.map(p=>'<option value="'+p+'" '+(p===u.plan_code?"selected":"")+'>'+p.toUpperCase()+'</option>').join("")+'</select>',
 '<input data-reason="'+esc(u.user_id)+'" placeholder="Audit reason" maxlength="300">',
 (['landlord','manager'].includes(u.account_role)?'<button class="zc-mini-btn" data-assign="'+esc(u.user_id)+'">Assign ↗</button>':'<span class="zc-badge">No management subscription</span>')
 ])));
 el.querySelectorAll("[data-assign]").forEach(btn=>btn.addEventListener("click",async()=>{
  const id=btn.dataset.assign,plan=el.querySelector('[data-tier="'+id+'"]').value,reason=el.querySelector('[data-reason="'+id+'"]').value.trim();
  if(reason.length<5){status("Give a clear audit reason of at least five characters.","error");return}
  btn.disabled=true;btn.textContent="Saving…";
  try{await auth().assignPlan(id,plan,reason);status("Tier assigned and recorded in Neon.","success");await load("accounts",true)}
  catch(e){status("Tier assignment was rejected: "+e.message,"error");btn.disabled=false;btn.textContent="Assign ↗"}
 }));
}
async function load(section,force=false){
 const token=++loadingVersion;
 if(!force&&cache[section]){renderData(section,cache[section]);return}
 const body=$("#zc-body");if(!body)return;
 body.innerHTML=heading("PLATFORM INTELLIGENCE",nav.find(x=>x[0]===section)?.[1]||"Control centre","Retrieving verified information from Neon…")+'<div class="zc-skeleton"><span></span><span></span><span></span></div>';
 try{const response=await fetchSection(section);if(token!==loadingVersion||activeSection!==section)return;cache[section]=response;renderData(section,response)}
 catch(err){if(token!==loadingVersion)return;body.innerHTML=heading("SERVICE CONNECTION","Unable to load this section","The requested information could not be loaded securely.")+'<div class="zc-error"><p>'+esc(err.message)+'</p><button class="zc-btn" id="zc-retry-section">Retry secure connection</button></div>';$("#zc-retry-section").onclick=()=>load(section,true)}
}
function render(section="overview"){
 activeSection=categories.includes(section)?section:"overview";
 const a=auth();
 if(!a||!a.state.ready){loading("Checking the Neon Auth session…");return}
 const user=a.state.user;
 if(!user||!user.emailVerified){forbidden("Sign in with the verified AutoMinds administrator account to continue.");return}
 if(String(user.email||"").toLowerCase()!=="automindsafrica@gmail.com"){forbidden("Your account is not registered as Zimba's Super Administrator.");return}
 if(verifyState==="idle"){
  verifyState="checking";loading("Verifying Google-linked Super Administrator permissions…");
  a.isSuperAdmin().then(isAdmin=>{
   verified=isAdmin===true;verifyState=verified?"ready":"denied";
   render(activeSection);
  }).catch(err=>{verifyState="error";currentUser=err.message;render(activeSection)});
  return
 }
 if(verifyState==="checking"){loading("Completing administrator verification…");return}
 if(verifyState==="error"){connectionError(currentUser||"Administrator verification is temporarily unavailable.");return}
 if(verifyState!=="ready"||!verified){forbidden("This account does not have active Super Administrator privileges.");return}
 shell(activeSection);load(activeSection);
}
window.ZimbaConsole={render:path=>render(String(path||"console/overview").split("/").slice(1).join("/")||"overview"),clear};
window.addEventListener("zimba-auth-change",()=>{verifyState="idle";verified=false;cache={};if(location.hash.startsWith("#/console/"))window.ZimbaConsole.render(location.hash.slice(2))});
})();
