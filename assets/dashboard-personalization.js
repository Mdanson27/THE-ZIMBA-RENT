/* ZIMBA dashboard personalization: local preferences, not server financial mutation. */
(()=>{
"use strict";
const definitions=[{id:"properties",label:"Properties"},{id:"maintenance",label:"Open maintenance"},{id:"residents",label:"Connected residents"},{id:"receivables",label:"Rent receivables"},{id:"priorities",label:"Operational priorities"},{id:"recent",label:"Recent maintenance"}];
const key=()=>"zimba:dashboard:"+String(window.ZimbaAuth?.state?.user?.id||"local");
const defaults=()=>definitions.map(x=>x.id);
function stored(){try{
 const val=JSON.parse(localStorage.getItem(key())||"null");
 if(!val||!Array.isArray(val.order)||!Array.isArray(val.visible))return {order:defaults(),visible:defaults()};
 const valid=new Set(defaults());
 const order=[...new Set(val.order.filter(x=>valid.has(x))),...defaults().filter(x=>!val.order.includes(x))];
 const visible=[...new Set(val.visible.filter(x=>valid.has(x)))];
 return {order,visible:visible.length?visible:defaults()};
}catch{return {order:defaults(),visible:defaults()}}}
function save(pref){try{localStorage.setItem(key(),JSON.stringify(pref))}catch{}}
function apply(){
 const host=document.getElementById("zo-body");if(!host||!host.querySelector("[data-z-widget]"))return;
 const pref=stored();
 definitions.forEach(item=>{
  const node=host.querySelector('[data-z-widget="'+item.id+'"]');
  if(node){node.hidden=!pref.visible.includes(item.id);node.style.order=String(pref.order.indexOf(item.id))}
 });
}
function close(){const dialog=document.getElementById("z-dashboard-dialog");if(dialog){dialog.close();dialog.remove()}}
function edit(){
 close();const pref=stored();
 const dialog=document.createElement("dialog");
 dialog.id="z-dashboard-dialog";dialog.className="z-dashboard-dialog";dialog.setAttribute("aria-labelledby","z-dashboard-title");
 const refresh=()=>{
  dialog.innerHTML='<header><div><span class="z-dashboard-kicker">YOUR DASHBOARD</span><h2 id="z-dashboard-title">Personalise your overview</h2><p>Choose which information matters most and arrange its order.</p></div><button type="button" data-z-action="close" aria-label="Close dashboard preferences">×</button></header><div class="z-dashboard-choices">'+pref.order.map((id,i)=>{
   const def=definitions.find(x=>x.id===id);
   return '<div class="z-dashboard-choice"><label><input data-z-visible="'+id+'" type="checkbox" '+(pref.visible.includes(id)?"checked":"")+'><span>'+def.label+'</span></label><div class="z-dashboard-move"><button type="button" data-z-up="'+id+'" aria-label="Move '+def.label+' up" '+(i===0?"disabled":"")+'>↑</button><button type="button" data-z-down="'+id+'" aria-label="Move '+def.label+' down" '+(i===pref.order.length-1?"disabled":"")+'>↓</button></div></div>'
  }).join("")+'</div><p class="z-dashboard-note">Saved in this browser for your account. Your underlying records are not changed.</p><footer><button type="button" data-z-action="reset">Restore defaults</button><button type="button" class="z-dashboard-primary" data-z-action="done">Done</button></footer><p id="z-dashboard-error" role="status" aria-live="polite"></p>';
  dialog.querySelectorAll("[data-z-visible]").forEach(box=>box.onchange=()=>{
   const id=box.dataset.zVisible,next=box.checked?pref.visible.concat(id):pref.visible.filter(x=>x!==id);
   if(!next.length){box.checked=true;dialog.querySelector("#z-dashboard-error").textContent="Keep at least one widget visible.";return}
   pref.visible=[...new Set(next)];save(pref);apply();
  });
  dialog.querySelectorAll("[data-z-up],[data-z-down]").forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.zUp||btn.dataset.zDown,i=pref.order.indexOf(id),target=i+(btn.dataset.zUp?-1:1);
   if(target<0||target>=pref.order.length)return;
   [pref.order[i],pref.order[target]]=[pref.order[target],pref.order[i]];
   save(pref);apply();refresh();
  });
  dialog.querySelector('[data-z-action="close"]').onclick=close;
  dialog.querySelector('[data-z-action="done"]').onclick=close;
  dialog.querySelector('[data-z-action="reset"]').onclick=()=>{pref.order=defaults();pref.visible=defaults();save(pref);apply();refresh()};
 };
 refresh();document.body.appendChild(dialog);
 dialog.addEventListener("close",()=>dialog.remove(),{once:true});
 dialog.showModal();
}
function activate(){
 close();apply();
 const toolbar=document.querySelector(".zo-head");if(!toolbar||toolbar.querySelector("#z-dashboard-customize"))return;
 const btn=document.createElement("button");btn.id="z-dashboard-customize";btn.className="zo-btn secondary z-dashboard-customize";btn.type="button";
 btn.innerHTML='<span aria-hidden="true">⚙</span> Customise dashboard';
 btn.addEventListener("click",edit);toolbar.appendChild(btn);
}
window.ZimbaDashboard={activate,apply};
})();
