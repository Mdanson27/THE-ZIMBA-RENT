/* ZIMBA Navigation V4 — explicit sections, persistent compact rail and accessible mobile drawer. */
(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
 property:["Property management","⌂"],
 care:["Communication & care","✉"],
 finances:["Rent & finances","▤"],
 intelligence:["Intelligence & insights","✧"],
 enterprise:["Enterprise operations","▦"],
 account:["Account & security","⚙"]
};
const stateKey=()=>{const id=window.ZimbaAuth?.state?.user?.id;return id?"zimba-nav-v4:"+id:null;};
function saved(){
 const key=stateKey();if(!key)return {};
 try{const value=JSON.parse(localStorage.getItem(key)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return {};}
}
function persist(settings){
 const key=stateKey();if(!key)return;
 try{localStorage.setItem(key,JSON.stringify({collapsed:!!settings.collapsed,groups:settings.groups||{}}));}catch{}
}
function initialGroupStates(nav,section){
 const stored=saved().groups||{},active=groupFor(section),groups={};
 for(const [key] of nav)if(key!=="home"){
  const group=groupFor(key);
  if(!(group in groups))groups[group]=typeof stored[group]==="boolean"?stored[group]:group===active||group==="property";
 }
 if(active!=="overview"&&Object.prototype.hasOwnProperty.call(groups,active))groups[active]=true;
 return groups;
}
function initialCollapsed(){
 if(window.matchMedia?.("(max-width: 800px)")?.matches)return false;
 return saved().collapsed===true;
}
function link(item,section){
 const [key,title,icon]=item,selected=key===section;
 return '<a href="#/workspace/'+encodeURIComponent(key)+'" class="zv-nav-link'+(selected?' selected':'')+'"'+(selected?' aria-current="page"':'')+' title="'+esc(title)+'" aria-label="'+esc(title)+'"><span class="zv-nav-symbol" aria-hidden="true">'+esc(icon)+'</span><span class="zv-nav-label">'+esc(title)+'</span></a>';
}
function build(nav,section){
 const groups=initialGroupStates(nav,section);
 let html="",last=null;
 for(const item of nav){
  const group=groupFor(item[0]);
  if(group==="overview"){
   if(last&&last!=="overview")html+='</div></section>';
   html+='<div class="zv-nav-standalone">'+link(item,section)+'</div>';
   last="overview";continue;
  }
  if(group!==last){
   if(last&&last!=="overview")html+='</div></section>';
   const [label,symbol]=meta[group]||[group,"•"],open=groups[group]!==false;
   html+='<section class="zv-nav-section" data-zv-group="'+group+'" data-expanded="'+open+'">'+
   '<button type="button" class="zv-section-toggle" data-zv-section="'+group+'" aria-expanded="'+open+'" aria-controls="zv-links-'+group+'" title="'+esc(label)+'">'+
   '<span class="zv-section-symbol" aria-hidden="true">'+esc(symbol)+'</span>'+
   '<span class="zv-section-title">'+esc(label)+'</span><span class="zv-section-chevron" aria-hidden="true">⌄</span></button>'+
   '<div class="zv-section-links" id="zv-links-'+group+'"'+(open?"":" hidden")+'>';
  }
  html+=link(item,section);last=group;
 }
 if(last&&last!=="overview")html+='</div></section>';
 return html;
}
function changeSection(button,expand){
 const section=button.closest(".zv-nav-section"),links=section?.querySelector(".zv-section-links");
 if(!section||!links)return;
 section.dataset.expanded=String(expand);button.setAttribute("aria-expanded",String(expand));links.hidden=!expand;
 const data=saved(),groups={...(data.groups||{})};groups[section.dataset.zvGroup]=expand;
 persist({collapsed:data.collapsed,groups});
}
function setCollapsed(collapsed){
 const layout=document.querySelector(".zv-layout");if(!layout)return;
 const mobile=window.matchMedia?.("(max-width: 800px)")?.matches;
 if(mobile){
  layout.classList.toggle("nav-open",!collapsed);
  const open=layout.classList.contains("nav-open");
  const top=document.querySelector("#zv-toggle");if(top){top.setAttribute("aria-expanded",String(open));top.setAttribute("aria-label",open?"Close navigation":"Open navigation");}
  document.querySelector("#zv-sidebar-backdrop")?.toggleAttribute("hidden",!open);
  if(open)document.querySelector(".zv-sidebar .zv-section-toggle, .zv-sidebar .zv-nav-link")?.focus();
 }else{
  layout.classList.toggle("zv-sidebar-collapsed",!!collapsed);
  layout.classList.remove("nav-open");
  const top=document.querySelector("#zv-toggle");if(top){top.setAttribute("aria-expanded",String(!collapsed));top.setAttribute("aria-label",collapsed?"Expand sidebar":"Collapse sidebar");}
  const side=document.querySelector("#zv-sidebar-pin");if(side){side.setAttribute("aria-label",collapsed?"Expand sidebar":"Collapse sidebar");side.setAttribute("title",collapsed?"Expand sidebar":"Collapse sidebar");}
  const data=saved();persist({collapsed:!!collapsed,groups:data.groups||{}});
 }
}
function toggle(){
 const layout=document.querySelector(".zv-layout");if(!layout)return;
 const mobile=window.matchMedia?.("(max-width: 800px)")?.matches;
 setCollapsed(mobile?layout.classList.contains("nav-open"):!layout.classList.contains("zv-sidebar-collapsed"));
}
function bind(section){
 const layout=document.querySelector(".zv-layout");if(!layout)return;
 document.querySelectorAll("[data-zv-section]").forEach(button=>button.addEventListener("click",()=>{
  const isExpanded=button.getAttribute("aria-expanded")==="true";
  const collapsed=layout.classList.contains("zv-sidebar-collapsed");
  if(collapsed&&!window.matchMedia?.("(max-width: 800px)")?.matches)setCollapsed(false);
  changeSection(button,!isExpanded);
 }));
 document.querySelector("#zv-toggle")?.addEventListener("click",toggle);
 document.querySelector("#zv-sidebar-pin")?.addEventListener("click",toggle);
 document.querySelector("#zv-sidebar-backdrop")?.addEventListener("click",()=>setCollapsed(true));
 document.querySelector(".zv-sidebar nav")?.addEventListener("click",e=>{
  if(window.matchMedia?.("(max-width: 800px)")?.matches&&e.target.closest("a"))setCollapsed(true);
 });
 layout.addEventListener("keydown",e=>{
  if(e.key!=="Escape"||!layout.classList.contains("nav-open"))return;
  e.preventDefault();setCollapsed(true);document.querySelector("#zv-toggle")?.focus();
 });
 const top=document.querySelector("#zv-toggle");
 if(top){top.setAttribute("aria-controls","zv-main-sidebar");top.setAttribute("aria-expanded",String(!layout.classList.contains("zv-sidebar-collapsed")));top.setAttribute("aria-label",layout.classList.contains("zv-sidebar-collapsed")?"Expand sidebar":"Collapse sidebar");}
 const side=document.querySelector("#zv-sidebar-pin");
 if(side){const collapsed=layout.classList.contains("zv-sidebar-collapsed");side.setAttribute("aria-label",collapsed?"Expand sidebar":"Collapse sidebar");}
 if(window.matchMedia?.("(max-width: 800px)")?.matches){layout.classList.remove("zv-sidebar-collapsed");if(top)top.setAttribute("aria-expanded","false");}
}
window.ZimbaNavigation={build,bind,toggle,setCollapsed,initialCollapsed,groupFor};
})();