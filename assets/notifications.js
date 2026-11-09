(()=>{
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let feed=null,loading=false,refreshClock=null;
function mount(){
 const root=document.querySelector(".zv-topright");if(!root)return;
 let slot=document.querySelector("#zn-holder");
 if(!slot){slot=document.createElement("div");slot.id="zn-holder";slot.className="zn-holder";root.insertBefore(slot,root.firstChild)}
 slot.innerHTML='<button id="zn-bell" type="button" class="zn-bell" aria-label="Notifications" aria-expanded="false" title="Notifications"><svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span id="zn-count" hidden></span></button><div id="zn-popover" class="zn-popover" hidden><div class="zn-head"><strong>Notifications</strong><a href="#/workspace/notifications" id="zn-view-all">View all</a></div><div id="zn-list" class="zn-items">Loading…</div></div>';
 slot.querySelector("#zn-bell").onclick=()=>{const p=slot.querySelector("#zn-popover");p.hidden=!p.hidden;slot.querySelector("#zn-bell").setAttribute("aria-expanded",String(!p.hidden));if(!p.hidden)refresh()};
 slot.querySelector("#zn-view-all").onclick=()=>{slot.querySelector("#zn-popover").hidden=true};
 refresh();
 if(!refreshClock)refreshClock=setInterval(()=>{if(document.visibilityState==='visible'&&window.ZimbaAuth?.state?.user)refresh()},45000);
}
async function refresh(){
 if(loading||!window.ZimbaAuth?.state?.user)return;
 loading=true;
 try{
  const data=await window.ZimbaAuth.notifications();feed=data;
  const count=document.querySelector("#zn-count");if(count){count.hidden=!data.unread;count.textContent=data.unread>99?"99+":String(data.unread)}
  const list=document.querySelector("#zn-list");if(list)renderList(list,data.items||[],true);
  const page=document.querySelector("#zn-page-list");if(page)renderList(page,data.items||[],false);
 }catch(e){const n=document.querySelector("#zn-list");if(n)n.textContent="Notifications are unavailable. Your account remains signed in.";const page=document.querySelector("#zn-page-list");if(page)page.textContent=e.message}
 finally{loading=false}
}
function renderList(container,items,compact){
 if(!items.length){container.innerHTML='<p class="zn-empty">You’re all caught up. New repair updates and messages will appear here.</p>';return}
 container.innerHTML=items.slice(0,compact?6:75).map(n=>'<button type="button" data-zn-id="'+esc(n.id)+'" data-zn-link="'+esc(n.link)+'" class="zn-item '+(!n.read?"unread":"")+'"><span class="zn-item-icon">'+(n.kind==="repair"?"⚒":n.kind==="message"?"✉":"◉")+'</span><span><strong>'+esc(n.title)+'</strong><small>'+esc(n.body)+'</small><em>'+new Date(n.createdAt).toLocaleString("en-UG",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"})+'</em></span>'+(n.read?"":'<i></i>')+'</button>').join("");
 container.querySelectorAll("[data-zn-id]").forEach(button=>button.onclick=async()=>{
  button.disabled=true;
  try{await window.ZimbaAuth.markNotification(button.dataset.znId)}catch(e){button.disabled=false;return}
  const link=button.dataset.znLink;
  if(link.startsWith("#/workspace/")&&!link.includes("://"))location.hash=link;
  await refresh();
 });
}
function page(){return '<div class="zn-page"><div class="zn-page-head"><span>ZIMBA / UPDATES</span><h1>Notifications</h1><p>Follow repairs, messages and important account events in one place.</p><button type="button" id="zn-refresh">↻ Refresh notifications</button></div><section id="zn-page-list" class="zn-page-list">Loading notifications…</section></div>'}
function activatePage(){document.querySelector("#zn-refresh")?.addEventListener("click",refresh);if(feed)renderList(document.querySelector("#zn-page-list"),feed.items||[],false);refresh()}
window.ZimbaNotify={mount,refresh,page,activatePage};
})();