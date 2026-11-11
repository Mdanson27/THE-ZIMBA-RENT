/* ZIMBA Navigation V5 — accessible sidebar + genuine compact rail.
 * A single allow-listed SVG icon system; no icon fonts/CDNs; no sensitive data in tooltips.
 */
(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const icons={
 "layout-dashboard":'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
 "house":'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
 "panels-top-left":'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 9v12"/>',
 "building-2":'<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
 "users-round":'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
 "message-circle":'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 10h8M8 14h5"/>',
 "wrench":'<path d="M14.7 6.3a1 1 0 0 0 1.3 1.3l3.4-3.4a6 6 0 0 1-7.9 7.9l-7.7 7.7a2 2 0 0 1-2.8-2.8l7.7-7.7a6 6 0 0 1 7.9-7.9z"/>',
 "wallet":'<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M2 9V5a2 2 0 0 1 2-2h15"/><path d="M22 12h-6a2 2 0 0 0 0 4h6"/><path d="M17 14h.01"/>',
 "file-text":'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
 "map-pinned":'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 "receipt-text":'<path d="M4 2v20l4-2 4 2 4-2 4 2V2l-4 2-4-2-4 2-4-2Z"/><path d="M8 10h8M8 14h8"/>',
 "hand-coins":'<path d="M11 14h2a2 2 0 0 1 0 4H9a4 4 0 0 1-3-1.5L3 14v8h12a4 4 0 0 0 2.2-.7L22 18v-2a2 2 0 0 0-3-1.7l-3 1.7"/><circle cx="15" cy="6" r="4"/><path d="M15 4v4M13 6h4"/>',
 "brain-circuit":'<path d="M12 18V5a3 3 0 0 0-6 0A4 4 0 0 0 4 12a4 4 0 0 0 2 7 3 3 0 0 0 6-1ZM12 18V5a3 3 0 0 1 6 0 4 4 0 0 1 2 7 4 4 0 0 1-2 7 3 3 0 0 1-6-1Z"/><path d="M8 8v3l-2 1M16 8v3l2 1M8 16l-2-2M16 16l2-2"/>',
 "briefcase-business":'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M2 12a20 20 0 0 0 20 0M12 12v3"/>',
 "bell":'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 "credit-card":'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20M6 16h3"/>',
 "shield-check":'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
 "settings":'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .35 1.9l.1.1-2 2-.1-.1A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.6 1.6V21h-2.8v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-2.7-.5l-.1.1-2-2 .1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 13.4H3v-2.8h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.35-1.9l-.1-.1 2-2 .1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10.6 3H13.4A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 2.7.5l.1-.1 2 2-.1.1A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10.6h.1v2.8H21a1.7 1.7 0 0 0-1.6 1.6Z"/>',
 "panel-left-close":'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m7-13-4 4 4 4"/>',
 "panel-left-open":'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m3-13 4 4-4 4"/>',
 "chevron-down":'<path d="m6 9 6 6 6-6"/>',
 "log-out":'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
 "external-link":'<path d="M14 3h7v7M10 14 21 3M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
 "store":'<path d="m2 7 2-4h16l2 4M2 7v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 2-3M4 13v8h16v-8M9 21v-6h6v6"/>',
 "circle-user-round":'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6 20a6 6 0 0 1 12 0"/>',
 "circle-help":'<circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1.1-1.2 2.3M12 17h.01"/>'
};
const icon=(name,klass="")=>'<svg class="zv-icon'+(klass?' '+esc(klass):'')+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(icons[name]||icons["circle-help"])+'</svg>';
const groupFor=key=>{
 if(key==="home")return "overview";
 if(["properties","property","building","residents"].includes(key))return "property";
 if(["messages","maintenance","connection"].includes(key))return "care";
 if(["finance","payments","lease","land-leases","invoices","deposits"].includes(key))return "finances";
 if(key==="intelligence")return "intelligence";
 if(key==="enterprise")return "enterprise";
 return "account";
};
const meta={
 property:{label:"Property Management",icon:"building-2",description:"Buildings, spaces, residents and properties"},
 care:{label:"Communication & Care",icon:"message-circle",description:"Messages, requests and maintenance"},
 finances:{label:"Rent & Finances",icon:"wallet",description:"Agreements, rent, invoicing and deposits"},
 intelligence:{label:"Intelligence & Insights",icon:"brain-circuit",description:"Operational insights and recommendations"},
 enterprise:{label:"Enterprise Operations",icon:"briefcase-business",description:"Team, documents, statements and oversight"},
 account:{label:"Account & Security",icon:"settings",description:"Billing, security, notifications and settings"}
};
const description={
 home:"Your workspace at a glance",properties:"View and manage your portfolio",property:"Your connected property management hub",
 building:"Design floors and manage rooms",residents:"Resident invitations and profiles",connection:"Connect to your property",
 messages:"Communicate with your residents",maintenance:"Track issues, repairs and requests",
 finance:"Rent collection and financial records",payments:"View rental payments",
 lease:"Monthly rent and rental agreements","land-leases":"Land and multi-year lease records",
 invoices:"Issue and review rent invoices",deposits:"Refundable security deposits",
 intelligence:"Intelligent operational insights",enterprise:"Reports, team and document register",
 notifications:"Activity alerts and updates",plans:"Workspace subscription and billing",
 security:"Account security and audit history",settings:"Your account preferences",preferences:"Your property preferences",
 admin:"Platform administrator console"
};
let currentItems=[],currentSection="home",handlers=null,flyoutGroup=null,flyoutAnchor=null,tooltipAnchor=null,hideTimer=null;
const isMobile=()=>!!window.matchMedia?.("(max-width: 800px)")?.matches;
const stateKey=()=>{const id=window.ZimbaAuth?.state?.user?.id;return id?"zimba-nav-v6:"+id:null;};
function saved(){
 const key=stateKey();if(!key)return {};
 try{
  const current=localStorage.getItem(key);
  if(current){
   const v=JSON.parse(current);
   return v&&typeof v==="object"&&!Array.isArray(v)?v:{};
  }
  // Preserve the compact-rail preference from V5, but reset legacy multi-open groups.
  const legacy=JSON.parse(localStorage.getItem(key.replace("zimba-nav-v6:","zimba-nav-v4:"))||"{}");
  return {collapsed:legacy?.collapsed===true,groups:{}};
 }catch{return {};}
}
function persist(next){
 const key=stateKey();if(!key)return;
 try{localStorage.setItem(key,JSON.stringify({collapsed:!!next.collapsed,groups:next.groups||{}}));}catch{}
}
function initialGroupStates(nav,section){
 const active=groupFor(section),groups={},stored=saved().groups||{};
 for(const [key] of nav)if(key!=="home"){
  const group=groupFor(key);
  if(!(group in groups))groups[group]=false;
 }
 // One open section at a time. The current route always wins, preventing long menus.
 const savedOpen=Object.keys(stored).find(key=>stored[key]===true&&Object.prototype.hasOwnProperty.call(groups,key));
 const next=active!=="overview"?active:(savedOpen||"property");
 if(Object.prototype.hasOwnProperty.call(groups,next))groups[next]=true;
 return groups;
}
function initialCollapsed(){return !isMobile()&&saved().collapsed===true;}
function link(item,section,compact=false){
 const [key,title,iconName]=item,active=key===section,detail=description[key]||"Open this workspace section";
 return '<a href="#/workspace/'+encodeURIComponent(key)+'" class="zv-nav-link'+(active?' selected':'')+(compact?' zv-flyout-link':'')+'"'+(active?' aria-current="page"':'')+
  ' title="'+esc(title)+' — '+esc(detail)+'" aria-label="'+esc(title)+'" data-zv-tooltip="'+esc(title)+'" data-zv-subtitle="'+esc(detail)+'">'+
  '<span class="zv-nav-symbol" aria-hidden="true">'+icon(iconName)+'</span><span class="zv-nav-label">'+esc(title)+'</span></a>';
}
function build(nav,section){
 currentItems=nav.map(x=>[x[0],x[1],x[2]]);currentSection=section;
 const groups=initialGroupStates(nav,section);
 let html='',last=null;
 for(const item of nav){
  const group=groupFor(item[0]);
  if(group==="overview"){
   if(last&&last!=="overview")html+='</div></section>';
   html+='<div class="zv-nav-standalone">'+link(item,section)+'</div>';
   last="overview";continue;
  }
  if(group!==last){
   if(last&&last!=="overview")html+='</div></section>';
   const m=meta[group]||meta.account,open=groups[group]!==false,hasActive=group===groupFor(section);
   html+='<section class="zv-nav-section'+(hasActive?' zv-group-active':'')+'" data-zv-group="'+group+'" data-expanded="'+open+'">'+
    '<button type="button" class="zv-section-toggle" data-zv-section="'+group+'" aria-expanded="'+open+
    '" aria-controls="zv-links-'+group+'" data-zv-tooltip="'+esc(m.label)+'" data-zv-subtitle="'+esc(m.description)+'" title="'+esc(m.label)+' — '+esc(m.description)+'" >'+
    '<span class="zv-section-symbol" aria-hidden="true">'+icon(m.icon)+'</span><span class="zv-section-title">'+esc(m.label)+'</span>'+
    '<span class="zv-section-chevron" aria-hidden="true">'+icon("chevron-down")+'</span></button>'+
    '<div class="zv-section-links" id="zv-links-'+group+'"'+(open?"":" hidden")+'>';
  }
  html+=link(item,section);last=group;
 }
 if(last&&last!=="overview")html+='</div></section>';
 return html;
}
function overlayMarkup(){
 return '<div id="zv-rail-flyout" class="zv-rail-flyout" role="region" aria-label="Navigation section" hidden></div>'+
 '<div id="zv-rail-tooltip" class="zv-rail-tooltip" role="tooltip" hidden><strong></strong><small></small></div>';
}
const layout=()=>document.querySelector(".zv-layout");
const railMode=()=>!isMobile()&&!!layout()?.classList.contains("zv-sidebar-collapsed");
function clearHide(){if(hideTimer){clearTimeout(hideTimer);hideTimer=null;}}
function positionOverlay(node,anchor,offset=8){
 const bar=document.querySelector("#zv-main-sidebar");
 if(!node||!anchor||!bar)return;
 const barRect=bar.getBoundingClientRect(),anchorRect=anchor.getBoundingClientRect();
 const width=node.offsetWidth||280,height=node.offsetHeight||100;
 const rightEdge=window.innerWidth||1200;
 node.style.left=Math.max(12,Math.min(Math.round(barRect.right+offset),rightEdge-width-12))+"px";
 node.style.top=Math.max(12,Math.min(Math.round(anchorRect.top-6),Math.max(12,(window.innerHeight||900)-height-12)))+"px";
}
function hideTooltip(){
 const node=document.querySelector("#zv-rail-tooltip");if(node)node.hidden=true;
 tooltipAnchor=null;
}
function hideFlyout(refocus=false){
 clearHide();const node=document.querySelector("#zv-rail-flyout");
 if(node)node.hidden=true;
 if(flyoutAnchor){flyoutAnchor.setAttribute("aria-expanded","false");if(refocus)flyoutAnchor.focus();}
 flyoutGroup=null;flyoutAnchor=null;
}
function showTooltip(anchor){
 if(!railMode())return;
 hideFlyout();const node=document.querySelector("#zv-rail-tooltip");if(!node)return;
 const text=anchor.getAttribute("data-zv-tooltip")||anchor.getAttribute("aria-label")||anchor.title;
 if(!text)return;
 node.querySelector("strong").textContent=text;
 node.querySelector("small").textContent=anchor.getAttribute("data-zv-subtitle")||"";
 node.hidden=false;positionOverlay(node,anchor,10);tooltipAnchor=anchor;
}
function showFlyout(button,focusFirst=false){
 if(!railMode())return;
 clearHide();hideTooltip();
 const group=button.dataset.zvSection,m=meta[group];if(!m)return;
 const node=document.querySelector("#zv-rail-flyout");if(!node)return;
 const entries=currentItems.filter(x=>groupFor(x[0])===group);
 if(!entries.length)return;
 if(flyoutAnchor&&flyoutAnchor!==button)flyoutAnchor.setAttribute("aria-expanded","false");
 node.innerHTML='<header class="zv-flyout-head"><div><strong>'+esc(m.label)+'</strong><small>'+esc(m.description)+'</small></div></header>'+
  '<div class="zv-flyout-items">'+entries.map(x=>link(x,currentSection,true)).join("")+'</div>';
 node.setAttribute("aria-label",m.label);
 node.hidden=false;positionOverlay(node,button,10);
 flyoutAnchor=button;flyoutGroup=group;button.setAttribute("aria-expanded","true");
 if(focusFirst)node.querySelector("a")?.focus();
}
function changeSection(button,expand){
 const section=button.closest(".zv-nav-section"),links=section?.querySelector(".zv-section-links");
 if(!section||!links)return;
 const sections=document.querySelectorAll(".zv-sidebar .zv-nav-section");
 const groups={};
 sections.forEach(item=>{
  const open=item===section&&expand,control=item.querySelector(".zv-section-toggle"),panel=item.querySelector(".zv-section-links");
  item.dataset.expanded=String(open);
  control?.setAttribute("aria-expanded",String(open));
  if(panel)panel.hidden=!open;
  groups[item.dataset.zvGroup]=open;
 });
 const data=saved();
 persist({collapsed:data.collapsed,groups});
}
function updateAria(){
 const compact=railMode();
 document.querySelectorAll("[data-zv-section]").forEach(button=>{
  const group=button.dataset.zvSection;
  button.setAttribute("aria-controls",compact?"zv-rail-flyout":"zv-links-"+group);
  button.setAttribute("aria-expanded",String(compact?flyoutGroup===group:button.closest(".zv-nav-section")?.dataset.expanded!=="false"));
 });
 const top=document.querySelector("#zv-toggle"),pin=document.querySelector("#zv-sidebar-pin");
 if(top){
  const open=isMobile()?!!layout()?.classList.contains("nav-open"):!compact;
  top.setAttribute("aria-expanded",String(open));
  top.setAttribute("aria-label",isMobile()?(open?"Close navigation":"Open navigation"):(compact?"Expand sidebar":"Collapse sidebar"));
  top.setAttribute("title",top.getAttribute("aria-label"));
 }
 if(pin){
  pin.setAttribute("aria-label",compact?"Expand sidebar":"Collapse sidebar");
  pin.setAttribute("title",pin.getAttribute("aria-label"));
  pin.innerHTML=icon(compact?"panel-left-open":"panel-left-close");
  pin.setAttribute("data-zv-tooltip",compact?"Expand sidebar":"Collapse sidebar");
  pin.setAttribute("data-zv-subtitle","Show or hide the navigation panel");
 }
}
function setCollapsed(collapsed){
 const container=layout();if(!container)return;
 hideTooltip();hideFlyout();
 if(isMobile()){
  const open=!collapsed;container.classList.toggle("nav-open",open);
  document.querySelector("#zv-sidebar-backdrop")?.toggleAttribute("hidden",!open);
  document.body.classList.toggle("zv-nav-mobile-open",open);
  if(open)document.querySelector("#zv-sidebar-pin")?.focus();
 }else{
  container.classList.toggle("zv-sidebar-collapsed",!!collapsed);
  container.classList.remove("nav-open");document.body.classList.remove("zv-nav-mobile-open");
  persist({collapsed:!!collapsed,groups:saved().groups||{}});
 }
 updateAria();
}
function toggle(){
 const container=layout();if(!container)return;
 setCollapsed(isMobile()?container.classList.contains("nav-open"):!container.classList.contains("zv-sidebar-collapsed"));
}
function delayedHide(){
 clearHide();hideTimer=setTimeout(()=>{
  const flyout=document.querySelector("#zv-rail-flyout");
  if(flyout?.matches(":hover")||flyout?.contains(document.activeElement)||flyoutAnchor?.matches(":hover")||flyoutAnchor===document.activeElement)return;
  hideFlyout();
 },160);
}
function bind(){
 handlers?.abort();handlers=new AbortController();const signal=handlers.signal;
 const container=layout();if(!container)return;
 document.querySelector("#zv-toggle")?.addEventListener("click",toggle,{signal});
 document.querySelector("#zv-sidebar-pin")?.addEventListener("click",toggle,{signal});
 document.querySelector("#zv-sidebar-backdrop")?.addEventListener("click",()=>setCollapsed(true),{signal});
 const flyout=document.querySelector("#zv-rail-flyout");
 flyout?.addEventListener("mouseenter",clearHide,{signal});
 flyout?.addEventListener("mouseleave",delayedHide,{signal});
 flyout?.addEventListener("focusout",e=>{
  if(!e.relatedTarget||!flyout.contains(e.relatedTarget))delayedHide();
 },{signal});
 flyout?.addEventListener("click",e=>{if(e.target.closest("a"))hideFlyout();},{signal});
 document.querySelectorAll("[data-zv-section]").forEach(button=>{
  button.addEventListener("click",()=>{
   if(railMode()){
    showFlyout(button,true);return;
   }
   changeSection(button,button.getAttribute("aria-expanded")!=="true");
  },{signal});
  button.addEventListener("mouseenter",()=>{if(railMode())showFlyout(button);},{signal});
  button.addEventListener("mouseleave",()=>{if(railMode())delayedHide();},{signal});
  button.addEventListener("focus",()=>{if(railMode())showFlyout(button);},{signal});
 });
 document.querySelectorAll("[data-zv-tooltip]:not([data-zv-section])").forEach(el=>{
  el.addEventListener("mouseenter",()=>showTooltip(el),{signal});
  el.addEventListener("mouseleave",hideTooltip,{signal});
  el.addEventListener("focus",()=>showTooltip(el),{signal});
  el.addEventListener("blur",hideTooltip,{signal});
 });
 const nav=document.querySelector(".zv-sidebar nav");
 nav?.addEventListener("click",e=>{if(isMobile()&&e.target.closest("a"))setCollapsed(true);},{signal});
 document.querySelector(".zv-sidebar-bottom")?.addEventListener("click",e=>{
  if(isMobile()&&e.target.closest("a,button"))setCollapsed(true);
 },{signal});
 nav?.addEventListener("scroll",()=>{hideTooltip();if(flyoutGroup)hideFlyout();},{signal,passive:true});
 container.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
   if(flyoutGroup){e.preventDefault();hideFlyout(true);return;}
   if(container.classList.contains("nav-open")){e.preventDefault();setCollapsed(true);document.querySelector("#zv-toggle")?.focus();}
  }
 },{signal});
 document.addEventListener("pointerdown",e=>{
  if(!flyoutGroup)return;
  if(e.target.closest("#zv-rail-flyout")||e.target.closest("[data-zv-section]"))return;
  hideFlyout();
 },{signal});
 window.addEventListener("resize",()=>{
  hideTooltip();hideFlyout();
  if(!isMobile()){container.classList.remove("nav-open");document.body.classList.remove("zv-nav-mobile-open");container.classList.toggle("zv-sidebar-collapsed",saved().collapsed===true);}
  else{container.classList.remove("zv-sidebar-collapsed");}
  updateAria();
 },{signal});
 if(isMobile()){container.classList.remove("zv-sidebar-collapsed");container.classList.remove("nav-open");document.body.classList.remove("zv-nav-mobile-open");}
 updateAria();
 const selected=nav?.querySelector(".zv-nav-link.selected");if(selected)requestAnimationFrame(()=>{if(selected.isConnected)selected.scrollIntoView({block:"nearest",inline:"nearest"});});
}
window.ZimbaNavigation={build,bind,toggle,setCollapsed,initialCollapsed,groupFor,icon,overlayMarkup,meta,description};
})();
