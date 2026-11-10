(()=>{
"use strict";
const STORAGE="zimba:appearance";
const media=window.matchMedia("(prefers-color-scheme: dark)");
function chosen(){try{return localStorage.getItem(STORAGE)||"system"}catch{return "system"}}
function resolve(){const pref=chosen();return pref==="system"?(media.matches?"dark":"light"):pref}
function apply(){const mode=resolve();document.documentElement.dataset.zimbaTheme=mode;document.documentElement.style.colorScheme=mode;document.querySelector('meta[name="theme-color"]')?.setAttribute("content",mode==="dark"?"#101b18":"#173d34");document.querySelectorAll(".z-theme-control button[data-mode]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===chosen())))}
function change(mode){if(!["system","light","dark"].includes(mode))return;try{localStorage.setItem(STORAGE,mode)}catch{}apply()}
function insert(){
 const selectors=[".zv-topright",".zc-top-right"];
 for(const selector of selectors){
  const host=document.querySelector(selector);if(!host||host.querySelector(".z-theme-control"))continue;
  const wrap=document.createElement("div");wrap.className="z-theme-control";wrap.setAttribute("role","group");wrap.setAttribute("aria-label","Appearance");
  wrap.innerHTML='<span class="z-theme-label">Appearance</span><button type="button" data-mode="system" aria-label="Use device appearance">Auto</button><button type="button" data-mode="light" aria-label="Light appearance">Light</button><button type="button" data-mode="dark" aria-label="Dark appearance">Dark</button>';
  host.insertBefore(wrap,host.firstChild);
  wrap.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>change(button.dataset.mode)));
 }
 apply();
}
let scheduled=false;
const watcher=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;insert()})});
watcher.observe(document.documentElement,{childList:true,subtree:true});
if(media.addEventListener)media.addEventListener("change",()=>{if(chosen()==="system")apply()});
else media.addListener(()=>{if(chosen()==="system")apply()});
apply();if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",insert);else insert();
window.ZimbaAppearance={change,chosen,apply};
})();