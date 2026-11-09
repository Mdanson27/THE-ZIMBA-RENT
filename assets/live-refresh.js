/* ZIMBA scoped live updates: pause when offline/hidden/editing, one request cycle */
(()=>{
"use strict";
let busy=false,last=0;
function editableActive(){
 const a=document.activeElement;
 if(!a)return false;
 return a.matches?.("input,textarea,select,[contenteditable=true]")||!!document.querySelector(".zb-modal-mask,.zv-rent-overlay,[role=dialog]");
}
async function refresh(){
 if(busy||document.visibilityState!=="visible"||!navigator.onLine||!window.ZimbaAuth?.state?.user||editableActive())return;
 if(Date.now()-last<30000)return;
 busy=true;last=Date.now();
 try{
  const path=location.hash.split("?")[0];
  if(path.startsWith("#/workspace/")){
   const section=path.split("/").pop();
   if(section==="residents")await window.ZimbaWorkspace?.refreshResidents?.();
   else if(section==="building"&&document.querySelector("#zb-display"))await window.ZimbaBuilding?.refresh?.();
   else if(section==="security")document.querySelector("#zv-security-refresh")?.click();
   else if(["home","maintenance","finance","settings"].includes(section)&&document.querySelector("#zo-reload"))document.querySelector("#zo-reload").click();
   else if(["home","maintenance","payments"].includes(section)&&document.querySelector("#zt-content")&&!document.querySelector(".zt-panel:has(#zt-retry)"))await window.ZimbaTenantPortal?.load?.(section);
  }else if(path.startsWith("#/console/")&&["overview","activity"].includes(path.split("/").pop()))document.querySelector("#zc-refresh")?.click();
 }catch(_){/* scoped loaders surface their own errors; never clear the session */}
 finally{busy=false}
}
setInterval(refresh,90000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-last>90000)refresh()});
window.addEventListener("online",()=>{if(Date.now()-last>90000)refresh()});
window.ZimbaLive={refresh};
})();
