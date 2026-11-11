/* ZIMBA Phase 2: authenticated property-scoped workspace, read-only hub. */
(()=>{
"use strict";
const api=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>v==null?"Not set":"UGX "+Number(v).toLocaleString("en-UG");
const dt=v=>v?new Date(String(v).length===10?v+"T12:00:00":v).toLocaleDateString("en-UG",{day:"numeric",month:"short",year:"numeric"}):"Not set";
const tabs=[["overview","Overview"],["units","Rooms & floors"],["residents","Residents"],["maintenance","Maintenance"],["agreements","Agreements"],["billing","Rent & invoices"],["financials","Financial intelligence"]];
let token=0;
let activeTab="overview";
const urlProperty=()=>new URLSearchParams((location.hash.split("?")[1]||"")).get("property");
function selected(record){
 const all=(record.properties||[]).filter(p=>p.id);
 const requested=urlProperty();
 return all.find(p=>p.id===requested)||all[0]||null;
}
function urlFor(id){return "#/workspace/property?property="+encodeURIComponent(id)}
function navLink(path,id){return '#/workspace/'+path+(id?"?property="+encodeURIComponent(id):"")}
function page(record){
 const p=selected(record);
 return '<section class="zh-page"><div class="zh-head"><div><a href="#/workspace/properties" class="zh-back">← All properties</a><div class="zh-eyebrow">ZIMBA / PROPERTY WORKSPACE</div><h1>Property management</h1><p>Rooms, residents, repairs and rent, connected to one property.</p></div></div>'+
 (p?'<div class="zh-picker"><label for="zh-property-choice">Current property</label><select id="zh-property-choice">'+record.properties.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===p.id?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select><button id="zh-reload" type="button">Refresh property data</button></div><div id="zh-content" aria-live="polite"><div class="zh-loading">Loading your property securely…</div></div>':
 '<section class="zh-panel zh-empty"><h2>No properties yet</h2><p>Add a property to start organising rooms, tenants and rent.</p><a class="zh-action" href="#/workspace/properties">Create a property</a></section>')+'</section>';
}
const pill=v=>'<span class="zh-pill zh-'+esc(String(v||"unknown").toLowerCase().replace(/[^a-z]/g,""))+'">'+esc(String(v||"Not set").replaceAll("_"," "))+'</span>';
function metric(v,label,foot){return '<div class="zh-metric"><strong>'+esc(String(v))+'</strong><span>'+esc(label)+'</span><small>'+esc(foot)+'</small></div>'}
function action(path,id,label){return '<a href="'+navLink(path,id)+'" class="zh-action">'+esc(label)+' <span aria-hidden="true">↗</span></a>'}
function empty(name){return '<div class="zh-empty-inline">No '+esc(name)+' recorded for this property yet.</div>'}
function list(items,render,none){return items.length?items.map(render).join(""):empty(none)}
function overview(data,id){
 const s=data.stats||{},p=data.property||{},all=data.units||[];
 const count=Number(s.units||0),occupied=Number(s.occupiedUnits||0);
 const percentage=count?Math.round(100*occupied/count):0;
 return '<div class="zh-hero"><div><span>YOUR PROPERTY</span><h2>'+esc(p.name||"Property")+'</h2><p>'+esc([p.city,p.address].filter(Boolean).join(" · ")||"Location not specified")+'</p></div>'+pill(p.visibility)+'</div>'+
 '<div class="zh-metrics">'+metric(count,"Total rooms / units","Configured in Building Studio")+metric(occupied,"Occupied units",percentage+"% occupancy of recorded units")+metric(s.activeResidents||0,"Connected residents","Approved active accounts")+metric(s.openMaintenance||0,"Open repairs","Requires attention")+metric(s.outstandingInvoices||0,"Unpaid invoices","Outstanding charges")+metric(money(s.outstandingRent||0),"Rent receivables","Invoiced, not verified cash")+'</div>'+
 '<div class="zh-panels"><section class="zh-panel"><h3>Next actions</h3><p>Manage this property without searching through separate accounts.</p><div class="zh-actions">'+action("building",id,"Configure rooms")+action("residents",id,"Manage residents")+action("lease",null,"Rental agreements")+action("invoices",null,"Rent invoices")+action("maintenance",null,"Manage repairs")+action("finance",null,"Financial reporting")+'</div></section>'+
 '<section class="zh-panel"><h3>Property health</h3><div class="zh-health"><div><span>Occupancy</span><strong>'+percentage+'%</strong></div><div class="zh-progress"><span style="width:'+percentage+'%"></span></div><p>'+occupied+' occupied out of '+count+' configured units</p><div class="zh-health-details"><span>Pending repairs</span><strong>'+Number(s.openMaintenance||0)+'</strong></div></div></section></div>'+
 '<p class="zh-footnote">Figures are computed from organisation-authorised Neon records. Rent receivables are unpaid invoice amounts, not proof of money received.</p>';
}
function units(data,id){
 const all=data.units||[];
 const floors=[...new Set(all.map(x=>x.floor||"Ground floor"))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 return '<section class="zh-panel"><div class="zh-panel-heading"><div><h3>Rooms and floors</h3><p>View occupancy and configured monthly rent for this property.</p></div>'+action("building",id,"Edit building layout")+'</div>'+
 (all.length?floors.map(f=>'<details class="zh-floor" open><summary>'+esc(f)+' <small>'+all.filter(x=>(x.floor||"Ground floor")===f).length+' rooms</small></summary><div class="zh-room-grid">'+all.filter(x=>(x.floor||"Ground floor")===f).map(x=>'<article class="zh-room"><strong>'+esc(x.number)+'</strong>'+pill(x.status)+'<small>'+money(x.rent)+'/month</small></article>').join("")+'</div></details>').join(""):empty("rooms"))+'</section>';
}
function residents(data){
 return '<section class="zh-panel"><div class="zh-panel-heading"><div><h3>Connected residents</h3><p>Only residents linked to this property are shown.</p></div>'+action("residents",data.property.id,"Manage invitations")+'</div>'+
 '<div class="zh-list">'+list(data.residents||[],x=>'<article><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.unit||"Unit not assigned")+' · Rent starts '+dt(x.rentStart)+'</small></div>'+pill(x.status)+'</article>',"connected residents")+'</div></section>';
}
function maintenance(data){
 return '<section class="zh-panel"><div class="zh-panel-heading"><div><h3>Maintenance requests</h3><p>Track reported issues and repair progress.</p></div>'+action("maintenance",null,"Manage repairs")+'</div>'+
 '<div class="zh-list">'+list(data.maintenance||[],x=>'<article><div><strong>'+esc(x.issue)+'</strong><small>'+esc(x.unit||"Property-wide")+' · '+esc(x.priority||"Normal")+' priority · '+dt(x.createdAt)+'</small><div class="zh-progress"><span style="width:'+Math.min(100,Math.max(0,Number(x.progress||0)))+'%"></span></div></div>'+pill(x.status)+'</article>',"maintenance requests")+'</div></section>';
}
function agreements(data){
 return '<section class="zh-panel"><div class="zh-panel-heading"><div><h3>Rental agreements</h3><p>Agreements linked only to this property.</p></div>'+action("lease",null,"Manage agreements")+'</div>'+
 '<div class="zh-list">'+list(data.agreements||[],x=>'<article><div><strong>'+esc(x.resident)+'</strong><small>'+esc(x.room||"Room not assigned")+' · '+money(x.monthlyRent)+'/month · '+dt(x.start)+' – '+dt(x.end)+'</small></div>'+pill(x.status)+'</article>',"rental agreements")+'</div></section>';
}
function billing(data){
 return '<section class="zh-panel"><div class="zh-panel-heading"><div><h3>Rent and invoices</h3><p>Review invoices for this property. Amounts are receivables until independently verified.</p></div>'+action("invoices",null,"Open billing")+'</div>'+
 '<div class="zh-list">'+list(data.invoices||[],x=>'<article><div><strong>'+esc(x.reference)+'</strong><small>'+money(x.amount)+' · Due '+dt(x.due)+' · Period '+dt(x.period)+'</small></div>'+pill(x.status)+'</article>',"rent invoices")+'</div></section>';
}
function show(data,id){
 const host=document.querySelector("#zh-content");if(!host)return;
 const p=data?.property;
 if(!p||String(p.id)!==String(id))throw new Error("Property response identity mismatch.");
 host.innerHTML='<div class="zh-tabs" role="tablist" aria-label="Property workspace sections">'+tabs.map(([key,label])=>'<button type="button" role="tab" aria-selected="'+(key===activeTab)+'" tabindex="'+(key===activeTab?0:-1)+'" data-zh-tab="'+key+'">'+label+'</button>').join("")+'</div><div id="zh-tab-panel" role="tabpanel" tabindex="0"></div>';
 const content=host.querySelector("#zh-tab-panel");
 const renderTab=()=>{
   if(activeTab==="financials"){
    content.innerHTML='<div class="zfi-loading" role="status">Loading financial intelligence…</div>';
    window.ZimbaFinancialIntelligence?.mount(id);
   }else{
    content.innerHTML=activeTab==="overview"?overview(data,id):activeTab==="units"?units(data,id):activeTab==="residents"?residents(data):activeTab==="maintenance"?maintenance(data):activeTab==="agreements"?agreements(data):billing(data);
   }
   host.querySelectorAll("[data-zh-tab]").forEach(b=>{b.setAttribute("aria-selected",String(b.dataset.zhTab===activeTab));b.tabIndex=b.dataset.zhTab===activeTab?0:-1});
   window.ZimbaPrivacy?.refresh();
 };
 host.querySelectorAll("[data-zh-tab]").forEach(b=>{
  b.addEventListener("click",()=>{activeTab=b.dataset.zhTab;renderTab()});
  b.addEventListener("keydown",event=>{
   if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
   event.preventDefault();const idx=tabs.findIndex(t=>t[0]===activeTab);
   const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(idx+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
   activeTab=tabs[next][0];renderTab();host.querySelector('[data-zh-tab="'+activeTab+'"]').focus();
  });
 });
 renderTab();
}
async function load(record){
 const host=document.querySelector("#zh-content"),property=selected(record),seq=++token;
 if(!host||!property)return;
 host.innerHTML='<div class="zh-loading">Loading your verified property records…</div>';
 try{
  // During Neon Data API schema propagation a newly published RPC may
  // temporarily return PGRST202. Retry a few times without disturbing auth.
  let data,lastError;
  for(let attempt=0;attempt<4;attempt++){
    if(seq!==token||!host.isConnected)return;
    try{data=await api().propertyHub(property.id);lastError=null;break}
    catch(err){
      lastError=err;
      if(err?.code!=="PGRST202"||attempt===3)throw err;
      host.innerHTML='<div class="zh-loading" role="status">Finishing the secure property connection…</div>';
      await new Promise(resolve=>setTimeout(resolve,[600,1400,3000][attempt]));
    }
  }
  if(lastError)throw lastError;
  if(seq!==token||!host.isConnected)return;
  show(data,property.id);
 }catch(err){
  if(seq!==token||!host.isConnected)return;
  host.innerHTML='<div class="zh-error" role="alert"><h3>Property records temporarily unavailable</h3><p>'+esc(err?.code==="PGRST202"?"The secure property service is still updating. Your information is safe and your login remains active.":err.message)+'</p><p>Other ZIMBA sections remain available.</p><button type="button" id="zh-retry">Reconnect to property</button></div>';
  host.querySelector("#zh-retry").onclick=()=>load(record);
 }
}
function bind(record){
 document.querySelector("#zh-property-choice")?.addEventListener("change",e=>{activeTab="overview";location.hash=urlFor(e.target.value)});
 document.querySelector("#zh-reload")?.addEventListener("click",()=>load(record));
 if(selected(record))load(record);
}
window.ZimbaPropertyHub={page,bind};
})();