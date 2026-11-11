/* ZIMBA privacy mode: visual masking, not a permission or encryption boundary. */
(()=>{
"use strict";
const userKey=()=>"zimba:privacy:"+String(window.ZimbaAuth?.state?.user?.id||"local");
const originals=new Map();
const amountPattern=/\bUGX[\s\u00a0]*\d[\d,]*(?:\.\d+)?\b/g;
let scheduled=false;
function active(){try{return sessionStorage.getItem(userKey())==="true"}catch{return false}}
function restore(){
 for(const [node,value] of originals){if(node.isConnected)node.nodeValue=(node.nodeValue===value.masked?value.original:node.nodeValue);originals.delete(node)}
}
function scan(){
 scheduled=false;
 const scope=document.querySelector(".zv-layout,.zc-app");
 if(!scope||!active()){restore();updateButton();return}
 for(const [node] of originals){if(!node.isConnected)originals.delete(node)}
 const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
 let text;
 while((text=walker.nextNode())){
  const existing=originals.get(text);
  if(existing&&text.nodeValue===existing.masked)continue;
  if(existing)originals.delete(text);
  if(!amountPattern.test(text.nodeValue||"")){amountPattern.lastIndex=0;continue}
  amountPattern.lastIndex=0;
  const parent=text.parentElement;
  if(!parent||parent.closest("textarea,input,select,option,script,style,[contenteditable],.z-privacy-control,[aria-hidden='true']"))continue;
  const value=text.nodeValue;
  const masked=value.replace(amountPattern,"UGX •••••");
  if(masked!==value){originals.set(text,{original:value,masked});text.nodeValue=masked}
 }
 updateButton();
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(scan)}
function updateButton(){
 const btn=document.getElementById("z-privacy-toggle");if(!btn)return;
 const on=active();btn.setAttribute("aria-pressed",String(on));
 btn.setAttribute("aria-label",on?"Show financial amounts":"Hide financial amounts");
 btn.innerHTML=on?'<span aria-hidden="true">◉</span> Show amounts':'<span aria-hidden="true">◌</span> Hide amounts';
}
function set(on){try{sessionStorage.setItem(userKey(),String(!!on))}catch{}
 if(on)schedule();else{restore();updateButton()}
}
function mount(){
 const header=document.querySelector(".zv-topright");
 if(header&&!header.querySelector("#z-privacy-toggle")){
  const btn=document.createElement("button");
  btn.id="z-privacy-toggle";btn.type="button";btn.className="z-privacy-control";
  btn.setAttribute("title","Mask monetary figures when presenting or sharing your screen");
  btn.addEventListener("click",()=>set(!active()));
  header.insertBefore(btn,header.firstChild);
 }
 schedule();
}
const observer=new MutationObserver(()=>{
 if(!document.querySelector(".zv-layout")){if(originals.size)restore();return}
 mount();
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
document.addEventListener("DOMContentLoaded",mount);
window.addEventListener("zimba-auth-change",()=>{restore();schedule()});
if(document.readyState!=="loading")mount();
window.ZimbaPrivacy={active,set,refresh:schedule};
})();
