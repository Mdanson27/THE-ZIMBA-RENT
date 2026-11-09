/* Zimba Building Studio — interactive 1D/2D inventory layout driven by Neon */
(()=>{
"use strict";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>n==null?"Price not set":"UGX "+Number(n).toLocaleString("en-UG");
const auth=()=>window.ZimbaAuth;
let request=0,selectedProperty=null,units=[],detail=null,mode="2d",properties=[];
function page(record){
 properties=(record?.properties||[]).filter(p=>p.id);
 const query=new URLSearchParams((location.hash.split("?")[1]||""));
 selectedProperty=properties.some(p=>p.id===query.get("property"))?query.get("property"):(selectedProperty&&properties.some(p=>p.id===selectedProperty)?selectedProperty:properties[0]?.id||null);
 return '<div class="zb-page"><div class="zb-title"><div><span class="zb-eyebrow">ZIMBA / PROPERTY INTELLIGENCE</span><h1>Building studio</h1><p>Shape every floor, set prices and see availability at a glance.</p></div><div class="zb-layout-switch"><button class="'+(mode==="2d"?"active":"")+'" data-zb-mode="2d">▦ 2D layout</button><button class="'+(mode==="1d"?"active":"")+'" data-zb-mode="1d">☰ 1D list</button></div></div>'+
 '<div class="zb-toolbar"><label>Property <select id="zb-property">'+properties.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selectedProperty?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></label><div class="zb-toolbar-actions"><button id="zb-bulk-units" class="zb-btn secondary" '+(!selectedProperty?"disabled":"")+' >▦ Generate floor</button><button id="zb-new-unit" class="zb-btn" '+(!selectedProperty?"disabled":"")+'>＋ Add room / unit</button></div></div>'+
 '<div id="zb-display"><div class="zb-loading">Loading verified property details…</div></div><div id="zb-modal"></div></div>';
}
function layout(){
 const total=units.length,vacant=units.filter(u=>u.status==="vacant"&&!Number(u.pending_count)).length,
 occupied=units.filter(u=>u.status==="occupied").length,
 pending=units.filter(u=>Number(u.pending_count)>0).length;
 const floors=[...new Set(units.map(u=>u.floor_label||"Ground floor"))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const block=u=>{
  const pendingCount=Number(u.pending_count||0),s=pendingCount?"pending":u.status;
  return '<button class="zb-unit zb-'+esc(s)+'" data-zb-unit="'+esc(u.id)+'" type="button"><span class="zb-unit-number">'+esc(u.unit_number)+'</span><span class="zb-unit-state">'+(s==="pending"?"Pending approval":s.charAt(0).toUpperCase()+s.slice(1))+'</span><strong>'+money(u.monthly_rent_ugx)+'</strong></button>';
 };
 return '<div class="zb-metrics"><article><strong>'+total+'</strong><span>Total units</span></article><article><strong>'+vacant+'</strong><span>Available</span></article><article><strong>'+occupied+'</strong><span>Occupied</span></article><article><strong>'+pending+'</strong><span>Awaiting approval</span></article></div>'+
 '<section class="zb-property-card"><div><span class="zb-eyebrow">BUILDING CONFIGURATION</span><h2>'+esc(detail?.name||"Property")+'</h2><p>'+esc(detail?.city||"Uganda")+' · '+(detail?.description?esc(detail.description):"Configure your property's layout and pricing")+'</p><strong>Property asking price: '+money(detail?.askingPrice)+'</strong></div><button class="zb-btn secondary" id="zb-edit-property">Edit property details ↗</button></section>'+
 '<div class="zb-legend"><span><i class="zb-dot vacant"></i> Available</span><span><i class="zb-dot occupied"></i> Occupied</span><span><i class="zb-dot pending"></i> Pending tenant approval</span><span><i class="zb-dot reserved"></i> Reserved</span><span><i class="zb-dot maintenance"></i> Maintenance</span></div>'+
 (units.length?(mode==="2d"?'<div class="zb-floors">'+floors.map(f=>'<section class="zb-floor"><header><span>⌂</span><strong>'+esc(f)+'</strong><small>'+units.filter(u=>(u.floor_label||"Ground floor")===f).length+' units</small></header><div class="zb-room-grid">'+units.filter(u=>(u.floor_label||"Ground floor")===f).map(block).join("")+'</div></section>').join("")+'</div>':'<div class="zb-list">'+units.map(u=>'<div class="zb-list-row"><div><strong>'+esc(u.unit_number)+'</strong><small>'+esc(u.floor_label||"Ground floor")+'</small></div><span class="zb-list-status zb-'+(u.pending_count?"pending":esc(u.status))+'">'+(u.pending_count?"Pending approval":esc(u.status))+'</span><strong>'+money(u.monthly_rent_ugx)+'</strong><button class="zb-btn secondary" data-zb-edit="'+esc(u.id)+'">Configure ↗</button></div>').join("")+'</div>'):'<div class="zb-empty"><span>⌂</span><h2>Start with your first room.</h2><p>Add a unit, its floor and monthly price. Zimba will build the availability diagram as you go.</p><button class="zb-btn" id="zb-first-room">＋ Add first room</button></div>')+
 '<p class="zb-clarifier">This diagram represents your building inventory and availability, not a measured architectural floor plan. Availability updates from room records and confirmed resident connections.</p>';
}
function modal(title,fields,onSave){
 const host=$("#zb-modal");host.innerHTML='<div class="zb-modal-mask"><section class="zb-modal" role="dialog" aria-modal="true"><button id="zb-close" type="button" aria-label="Close" class="zb-close">×</button><span class="zb-eyebrow">PROPERTY CONFIGURATION</span><h2>'+title+'</h2><form id="zb-form">'+fields+'<div id="zb-error" role="alert"></div><button class="zb-btn" type="submit">Save to Zimba ↗</button></form></section></div>';
 $("#zb-close").onclick=()=>host.innerHTML="";
 $("#zb-form").onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;button.textContent="Saving securely…";try{await onSave(new FormData(e.target));host.innerHTML="";await refresh()}catch(err){$("#zb-error").textContent=err.message;button.disabled=false;button.textContent="Try again ↗"}};
}
function unitEditor(unit){
 modal(unit?"Edit room details":"Add a new room",'<label>Room / unit number<input name="number" required maxlength="30" placeholder="e.g. A-101" value="'+esc(unit?.unit_number||"")+'"></label><label>Floor name<input name="floor" maxlength="50" placeholder="Ground floor, Level 1…" value="'+esc(unit?.floor_label||"Ground floor")+'"></label><label>Monthly rent (UGX)<input name="rent" type="number" required min="0" max="100000000000" step="1" value="'+esc(unit?.monthly_rent_ugx??0)+'"></label><label>Availability<select name="status">'+["vacant","occupied","reserved","maintenance"].map(s=>'<option value="'+s+'" '+(s===(unit?.status||"vacant")?"selected":"")+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>').join("")+'</select></label>',
 f=>auth().saveUnit(selectedProperty,unit?.id||null,String(f.get("number")).trim(),String(f.get("floor")).trim(),Number(f.get("rent")),String(f.get("status"))));
}
function bulkEditor(){
 modal("Generate a floor of rooms",'<p class="zb-modal-help">Add several rooms at once, with sequential room numbers and a shared starting rent. You can customise each room afterwards.</p><label>Floor label<input name="floor" maxlength="50" required placeholder="Level 1" value="Ground floor"></label><label>Room number prefix<input name="prefix" maxlength="15" placeholder="A-" value="A-"></label><label>Starting number<input type="number" name="start" min="0" max="9999" value="1" required></label><label>How many rooms? (maximum 100)<input type="number" name="count" min="1" max="100" value="6" required></label><label>Monthly rent per room (UGX)<input type="number" name="rent" min="0" max="100000000000" value="0" required></label>',
 f=>auth().generateUnits(selectedProperty,String(f.get("floor")),String(f.get("prefix")),Number(f.get("start")),Number(f.get("count")),Number(f.get("rent"))));
}
function editProperty(){
 modal("Property information",'<label>Property name<input name="title" required maxlength="100" value="'+esc(detail?.name||"")+'"></label><label>Address<input name="address" maxlength="240" placeholder="Building address" value="'+esc(detail?.address||"")+'"></label><label>Description<textarea name="description" rows="4" maxlength="5000" placeholder="Describe your building">'+esc(detail?.description||"")+'</textarea></label><label>Asking price (UGX; optional)<input name="price" type="number" min="0" max="100000000000000" value="'+esc(detail?.askingPrice??"")+'"></label>',
 f=>auth().updateProperty(selectedProperty,String(f.get("title")).trim(),String(f.get("description")),String(f.get("address")),f.get("price")===""?null:Number(f.get("price"))));
}
function wireUnits(){
 document.querySelectorAll("[data-zb-unit],[data-zb-edit]").forEach(x=>x.onclick=()=>unitEditor(units.find(u=>u.id===(x.dataset.zbUnit||x.dataset.zbEdit))));
 $("#zb-edit-property")?.addEventListener("click",editProperty);
 $("#zb-first-room")?.addEventListener("click",()=>unitEditor(null));
}
async function refresh(){
 const counter=++request,host=$("#zb-display");if(!host||!selectedProperty)return;
 host.innerHTML='<div class="zb-loading">Loading the property and its rooms…</div>';
 try{
  const [d,u]=await Promise.all([auth().propertyDetails(selectedProperty),auth().managerUnits(selectedProperty)]);
  if(counter!==request||!host.isConnected)return;detail=d;units=Array.isArray(u)?u:[];host.innerHTML=layout();wireUnits();
 }catch(e){if(counter!==request)return;if(await auth().recover?.(e))return;host.innerHTML='<div class="zb-error"><h2>Could not load the building</h2><p>'+esc(e.message)+'</p><button class="zb-btn" id="zb-relogin">Sign in again ↗</button></div>';$("#zb-relogin").onclick=()=>auth().relogin("Please sign in again to open your building.")}
}
function bind(record){
 $("#zb-property")?.addEventListener("change",e=>{selectedProperty=e.target.value;refresh()});
 document.querySelectorAll("[data-zb-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.zbMode;document.querySelectorAll("[data-zb-mode]").forEach(x=>x.classList.toggle("active",x.dataset.zbMode===mode));if($("#zb-display")){$("#zb-display").innerHTML=layout();wireUnits()}});
 $("#zb-new-unit")?.addEventListener("click",()=>unitEditor(null));
 $("#zb-bulk-units")?.addEventListener("click",bulkEditor);
 if(selectedProperty)refresh();
 else $("#zb-display").innerHTML='<div class="zb-empty"><h2>No property selected</h2><p>Create your first property to set up a floor-by-floor layout.</p><a class="zb-btn" href="#/workspace/properties">Add a property ↗</a></div>';
}
window.ZimbaBuilding={page,bind};
})();