/* ZIMBA Overview Calendar V1.
 * Live, organisation-scoped calendar. No synthetic billing periods, receipts or ETA dates.
 * Separates actual calendar events from portfolio-wide overdue summaries.
 */
(()=>{
"use strict";
const api=()=>window.ZimbaAuth;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>"UGX "+Number(v||0).toLocaleString("en-UG",{maximumFractionDigits:0});
const kinds={rent:["Rent & invoices","receipt-text"],maintenance:["Maintenance","wrench"],lease:["Tenancies","file-text"],land:["Land leases","map-pinned"],deposit:["Deposit refunds","hand-coins"],expense:["Expenses","wallet"]};
const paths=new Set(["#/workspace/invoices","#/workspace/maintenance","#/workspace/lease","#/workspace/land-leases","#/workspace/deposits","#/workspace/finance"]);
const safeHref=v=>paths.has(v)?v:"#/workspace/home";
const two=n=>String(n).padStart(2,"0");
const toISO=d=>d.getUTCFullYear()+"-"+two(d.getUTCMonth()+1)+"-"+two(d.getUTCDate());
const dateUTC=(y,m,d=1)=>new Date(Date.UTC(y,m,d,12));
function todayKampala(){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Kampala",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const a=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return a.year+"-"+a.month+"-"+a.day;
}
const monthName=(y,m)=>dateUTC(y,m).toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"});
const longDay=v=>new Date(v+"T12:00:00Z").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
const dateMonth=v=>v?.slice(0,7);
const stamp=(v)=>String(v||"").slice(0,10);
const kindClass=k=>kinds[k]?k:"other";
let state={year:0,month:0,selected:"",filter:"all",events:[],metrics:null,loading:false,error:null,req:0};
function resetToToday(){
 const t=todayKampala();state.year=Number(t.slice(0,4));state.month=Number(t.slice(5,7))-1;state.selected=t;
}
function gridRange(y,m){
 const first=dateUTC(y,m,1),offset=(first.getUTCDay()+6)%7;
 const start=dateUTC(y,m,1-offset);
 const daysInMonth=dateUTC(y,m+1,0).getUTCDate();
 const totalCells=Math.ceil((offset+daysInMonth)/7)*7;
 const end=dateUTC(y,m,1-offset+totalCells-1);
 return {start:toISO(start),end:toISO(end),offset,totalCells};
}
function page(){
 return '<section class="zoc-shell" id="zoc-shell" aria-label="Portfolio activity calendar">'+
 '<div class="zoc-loading" role="status">Loading your live portfolio calendar…</div></section>';
}
const visible=e=>state.filter==="all"||e.kind===state.filter;
function chip(e){
 return '<span class="zoc-kind zoc-kind-'+kindClass(e.kind)+'">'+esc(kinds[e.kind]?.[0]||"Activity")+'</span>';
}
function eventCard(e){
 return '<article class="zoc-event"><div class="zoc-event-icon zoc-kind-'+kindClass(e.kind)+'" aria-hidden="true"></div>'+
 '<div class="zoc-event-info"><div class="zoc-event-meta">'+chip(e)+
 (e.status==="overdue"?'<span class="zoc-status overdue">Overdue</span>':
 e.status==="paid"?'<span class="zoc-status done">Verified paid</span>':
 e.status==="completed"?'<span class="zoc-status done">Completed</span>':"")+'</div>'+
 '<strong>'+esc(e.title)+'</strong><p>'+esc(e.property||"Organisation")+'</p>'+
 (e.detail?'<small>'+esc(e.detail)+'</small>':"")+
 (e.amount!=null?'<span class="zoc-event-amount">'+money(e.amount)+(e.kind==="rent"?" outstanding":" recorded")+'</span>':"")+
 '</div><a href="'+safeHref(e.link)+'" class="zoc-event-link" aria-label="Open '+esc(kinds[e.kind]?.[0]||"related section")+' for '+esc(e.title)+'">Open ↗</a></article>';
}
function agenda(){
 const day=state.selected||todayKampala();
 const entries=state.events.filter(e=>e.date===day&&visible(e));
 return '<section class="zoc-agenda" aria-label="Selected day agenda">'+
 '<div class="zoc-agenda-head"><div><span class="zoc-overline">SELECTED DAY</span><h3>'+esc(longDay(day))+'</h3></div><span class="zoc-agenda-total">'+entries.length+' event'+(entries.length===1?"":"s")+'</span></div>'+
 (entries.length?'<div class="zoc-day-events">'+entries.map(eventCard).join("")+'</div>':
 '<div class="zoc-agenda-empty"><b>No recorded events on this day.</b><p>Choose another highlighted date or adjust the filters.</p></div>')+
 '</section>';
}
function header(){
 const m=state.metrics||{};
 const count=n=>Number(n||0).toLocaleString("en-UG");
 return '<div class="zoc-overview-row">'+
 '<div class="zoc-overview-hero"><div><span class="zoc-overline">YOUR PORTFOLIO SCHEDULE</span><h2>Calendar & priorities</h2><p>Every date is linked to a real agreement, invoice, repair or financial record.</p></div>'+
 '<span class="zoc-live-dot">Live records</span></div>'+
 '<div class="zoc-alerts">'+
 '<a href="#/workspace/invoices" class="zoc-alert zoc-alert-overdue"><span>Overdue invoices</span><b>'+count(m.overdueCount)+'</b><small>'+money(m.overdueAmount)+'</small></a>'+
 '<a href="#/workspace/invoices" class="zoc-alert"><span>Due within 7 days</span><b>'+count(m.dueSoonCount)+'</b><small>Unpaid or partly paid</small></a>'+
 '<a href="#/workspace/maintenance" class="zoc-alert"><span>Open repairs</span><b>'+count(m.openMaintenance)+'</b><small>'+count(m.urgentMaintenance)+' urgent</small></a>'+
 '<a href="#/workspace/deposits" class="zoc-alert"><span>Refund requests</span><b>'+count(m.pendingDepositRequests)+'</b><small>Pending review</small></a>'+
 '</div></div>';
}
function calendar(){
 const {year:y,month:m}=state,range=gridRange(y,m),current=todayKampala();
 const grouped=new Map();
 for(const e of state.events.filter(visible)){if(!grouped.has(e.date))grouped.set(e.date,[]);grouped.get(e.date).push(e);}
 const mon=monthName(y,m);
 const days=Array.from({length:range.totalCells},(_,j)=>{
  const date=toISO(dateUTC(y,m,1-range.offset+j)),events=grouped.get(date)||[],inMonth=dateMonth(date)===y+"-"+two(m+1);
  const statuses=events.some(x=>x.status==="overdue")?"zoc-overdue-day":"";
  const selected=date===state.selected?"selected":"";
  const isToday=date===current?"today":"";
  return '<button type="button" class="zoc-day '+(inMonth?"":"outside")+" "+statuses+" "+selected+" "+isToday+
  '" data-zoc-date="'+date+'" aria-pressed="'+String(selected!=="")+'" aria-label="'+esc(longDay(date))+', '+events.length+' calendar events">'+
  '<span class="zoc-day-number">'+Number(date.slice(-2))+'</span>'+
  (events.length?'<span class="zoc-dots">'+events.slice(0,3).map(e=>'<i class="zoc-dot zoc-dot-'+kindClass(e.kind)+'"></i>').join("")+
  (events.length>3?'<em>+'+(events.length-3)+'</em>':"")+'</span>':"")+
  '</button>';
 });
 const controls=['all',...Object.keys(kinds)].map(v=>'<button type="button" class="zoc-filter '+(state.filter===v?"active":"")+'" data-zoc-filter="'+v+
  '" aria-pressed="'+(state.filter===v)+'">'+esc(v==="all"?"All events":kinds[v][0])+'</button>').join("");
 return '<div class="zoc-main"><section class="zoc-month" aria-label="'+esc(mon)+' calendar">'+
 '<div class="zoc-controls"><div><span class="zoc-overline">MONTH VIEW</span><h3>'+esc(mon)+'</h3></div>'+
 '<div class="zoc-step"><button type="button" data-zoc-shift="-1" aria-label="Previous month">‹</button>'+
 '<button type="button" data-zoc-today="1" class="zoc-today-btn">Today</button>'+
 '<button type="button" data-zoc-shift="1" aria-label="Next month">›</button></div></div>'+
 '<div class="zoc-filters" aria-label="Event types">'+controls+'</div>'+
 '<div class="zoc-weekdays" aria-hidden="true">'+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>'<span>'+d+'</span>').join("")+'</div>'+
 '<div class="zoc-grid">'+days.join("")+'</div>'+
 '<div class="zoc-legend">'+Object.entries(kinds).map(([k,v])=>'<span><i class="zoc-dot zoc-dot-'+k+'"></i>'+esc(v[0])+'</span>').join("")+'</div>'+
 '</section>'+agenda()+'</div>';
}
function statusArea(){
 if(state.error)return '<div class="zoc-error" role="alert"><b>Calendar temporarily unavailable</b>'+
 '<p>'+esc(state.error)+' Your other dashboard records remain accessible.</p>'+
 '<button type="button" id="zoc-retry">Retry calendar</button></div>';
 return '';
}
function paint(){
 const target=document.querySelector("#zoc-shell");if(!target)return;
 target.innerHTML=header()+calendar()+statusArea()+
 '<p class="zoc-disclaimer">Dates are based on saved ZIMBA records. Overdue status follows Kampala calendar dates. An invoice balance uses only verified reconciled payments; draft bills and unrecorded future rent are not invented.</p>';
 bind();
 const value=document.querySelector("#zo-invoice-outstanding");
 if(value){value.textContent=state.metrics?money(state.metrics.outstanding):"Unavailable";}
 const hint=document.querySelector("#zo-invoice-outstanding-help");
 if(hint&&state.metrics)hint.textContent=Number(state.metrics.overdueCount||0)+" overdue · invoiced rent less verified payments";
}
function bind(){
 const host=document.querySelector("#zoc-shell");if(!host)return;
 host.querySelectorAll("[data-zoc-shift]").forEach(b=>b.addEventListener("click",()=>{
  const delta=Number(b.dataset.zocShift),d=dateUTC(state.year,state.month+delta,1);
  state.year=d.getUTCFullYear();state.month=d.getUTCMonth();
  state.selected=toISO(d);fetchMonth();
 }));
 host.querySelector("[data-zoc-today]")?.addEventListener("click",()=>{
  resetToToday();fetchMonth();
 });
 host.querySelectorAll("[data-zoc-date]").forEach(b=>b.addEventListener("click",()=>{
  const value=b.dataset.zocDate;
  if(dateMonth(value)!==state.year+"-"+two(state.month+1)){
   const d=new Date(value+"T12:00:00Z");state.year=d.getUTCFullYear();state.month=d.getUTCMonth();
   state.selected=value;fetchMonth();return;
  }
  state.selected=value;paint();
 }));
 host.querySelectorAll("[data-zoc-filter]").forEach(b=>b.addEventListener("click",()=>{
  state.filter=b.dataset.zocFilter;paint();
 }));
 host.querySelector("#zoc-retry")?.addEventListener("click",fetchMonth);
}
async function fetchMonth(){
 const root=document.querySelector("#zoc-shell");if(!root)return;
 const seq=++state.req,range=gridRange(state.year,state.month);
 const old=state.events;state.loading=true;state.error=null;
 if(!old.length)root.innerHTML='<div class="zoc-loading">Loading calendar records…</div>';
 try{
  const data=await api().managerOverviewCalendar(range.start,range.end);
  if(seq!==state.req||!root.isConnected)return;
  state.events=Array.isArray(data?.events)?data.events.filter(x=>kinds[x.kind]&&/^\d{4}-\d\d-\d\d$/.test(x.date)):[];
  state.metrics=data?.metrics||{};
  state.loading=false;state.error=null;
  paint();
 }catch(e){
  if(seq!==state.req||!root.isConnected)return;
  state.events=[];state.metrics=null;state.loading=false;
  state.error=e.message||"Unknown connection problem";
  paint();
 }
}
function mount(){
 const target=document.querySelector("#zo-overview-calendar");if(!target)return;
 resetToToday();state.filter="all";state.events=[];state.metrics=null;state.error=null;
 target.innerHTML=page();fetchMonth();
}
window.ZimbaOverviewCalendar={mount,gridRange,todayKampala,page,money,kinds};
})();