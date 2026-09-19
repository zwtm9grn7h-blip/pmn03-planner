const BASE=window.PMN03_BASE||[];
const DAYS=['週一','週二','週三','週四','週五'];
const areaOrder=['新屋區','楊梅區','平鎮區','中壢區','八德區','桃園區','蘆竹區','龜山區','大園區','觀音區','新豐鄉','湖口鄉','竹北市','新竹市北區','新竹市東區','新竹市香山區','竹東鎮','芎林鄉','新埔鎮'];
const STORE_KEY='pmn03_customer_overrides_v3';
function loadOverrides(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')}catch(e){return {}}}
function customerKey(c){return c.id||((c.hco||'')+'|'+(c.hcp||''))}
let overrides=loadOverrides();
function applyOverride(x){const o=overrides[customerKey(x)]||{};return {...x,address:'',hours:{0:'',1:'',2:'',3:'',4:''},visitNote:'',clinicSourceUrl:'',...o,hours:{0:'',1:'',2:'',3:'',4:'',...(o.hours||{})}}}
let customers=BASE.map((x,i)=>({...applyOverride(x),_idx:i,locked:false,objective:''}));
let schedule=[[],[],[],[],[]], editing=null, replaceTarget=null, editingCustomer=null;
const $=s=>document.querySelector(s);
function dateObj(s){if(!s)return null;const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));}
function addDays(s,n){const d=dateObj(s);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function daysSince(last,ref){if(!last)return 999; return Math.floor((dateObj(ref)-dateObj(last))/86400000)}
function shortArea(a){return (a||'').replace('桃園市','').replace('新竹縣','').replace('新竹市新竹市','新竹市').trim()||'未分類'}
function isHsinchu(a){return /新竹|竹北|竹東|新豐|湖口|芎林|新埔/.test(a||'')}
function areaRank(a){a=shortArea(a);let i=areaOrder.findIndex(x=>a.includes(x)||x.includes(a));return i<0?99:i}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function hasHoursData(c){return c.hours&&Object.values(c.hours).some(v=>String(v||'').trim())}
function availableOn(c,d){return !hasHoursData(c)||!!String(c.hours?.[d]||'').trim()}
function hoursText(c,d){return String(c.hours?.[d]||'').trim()}
function saveOverride(c){overrides[customerKey(c)]={hcp:c.hcp,hco:c.hco,area:c.area,address:c.address||'',product:c.product,grade:c.grade,target:c.target,hours:c.hours||{},visitNote:c.visitNote||'',clinicSourceUrl:c.clinicSourceUrl||''};localStorage.setItem(STORE_KEY,JSON.stringify(overrides))}
function allHoursSummary(c){if(!hasHoursData(c))return '尚未設定';return DAYS.map((x,i)=>hoursText(c,i)?`${x.replace('週','')}:${hoursText(c,i)}`:'').filter(Boolean).join(' ｜ ')}
function objective(c){
 if(c.objective)return c.objective;
 if(c.savedNext) return c.savedNext;
 const f=c.lastFeedback||'';
 if(/核刪|健保/.test(f)) return '延續上次健保／核刪議題，確認醫師目前處方障礙，補充可降低核刪疑慮的臨床使用重點。';
 if(/活動|seminar|會議|演講/i.test(f)) return '追蹤上次活動／會議後的回饋，確認內容是否改變臨床使用想法，並找出可實際切入的病人情境。';
 if(/採購|叫藥|訂購|藥局/.test(f)) return '追蹤採購與目前庫存／用量，確認處方是否已實際啟動，並釐清下一個可推進的決策點。';
 if(/痔瘡|靜脈|水腫|下肢/.test(f) || c.product==='Daflon') return '延續上次痔瘡／慢性靜脈疾病病人討論，確認近期病例與處方情形，聚焦可實際導入 Daflon 的病人。';
 if(/睡|失眠|體重|SSRI|SNRI|焦慮|憂鬱/.test(f) || c.product==='Valdoxan') return '延續上次病人與處方回饋，確認近期 Valdoxan 使用情形，聚焦睡眠、體重或 SSRI／SNRI 不耐受的適合病人。';
 return c.lastVisit ? '追蹤上次拜訪後的處方與病人回饋，確認目前最需要協助的臨床情境並延續推進。' : '首次建立關係，了解診間病人組成與目前用藥習慣，找出適合產品的切入情境。';
}
function priority(c,ref,cool){
 const ds=daysSince(c.lastVisit,ref); const grade={A:55,B:35,C:20}[c.grade]||0;
 const overdue=Math.min(55,ds/4); const follow=c.savedNext?18:0; const never=c.lastVisit?0:20; const recent=ds<cool?-80:0;
 return grade+overdue+follow+never+recent;
}
function chooseClusters(list,dayCount,hsDay){
 let out=Array.from({length:5},()=>[]), remain=[...list];
 for(let d=0;d<5;d++){
   const targetDay=d;
   let eligible=remain.filter(c=>availableOn(c,targetDay));
   if(hsDay>=0){
     if(d===hsDay){const h=eligible.filter(c=>isHsinchu(c.area)); if(h.length) eligible=h.concat(eligible.filter(c=>!isHsinchu(c.area)));}
     else {const non=eligible.filter(c=>!isHsinchu(c.area)); if(non.length>=Math.min(dayCount,eligible.length)) eligible=non.concat(eligible.filter(c=>isHsinchu(c.area)));}
   }
   out[d]=pickDay(eligible,dayCount);
   const used=new Set(out[d].map(x=>x._idx)); remain=remain.filter(x=>!used.has(x._idx));
 }
 return out;
}
function pickDay(remain,n){
 if(!remain.length)return[]; const best=remain[0]; const base=shortArea(best.area); let arr=remain.map(c=>({c,dist:Math.abs(areaRank(c.area)-areaRank(base))}));
 arr.sort((x,y)=>(x.dist-y.dist)||(y.c._score-x.c._score)); return arr.slice(0,n).map(x=>x.c);
}
function routeDay(arr){return [...arr].sort((a,b)=>areaRank(a.area)-areaRank(b.area));}
function generate(){
 try {
  const btn=document.getElementById('generate');
  const st=document.getElementById('generateStatus');
  if(btn){btn.disabled=true;btn.textContent='排程中…';}
  if(st) st.textContent='正在依 MCCP、門診時間與區域重新產生本週行程…';
  const ref=document.getElementById('weekStart').value || new Date().toISOString().slice(0,10);
  const per=Number(document.getElementById('perDay').value)||7;
  const cool=Number(document.getElementById('cooldown').value)||14;
  const hs=Number(document.getElementById('hsinchuDay').value);
  customers.forEach(c=>{c.locked=false;c._score=priority(c,ref,cool)});
  const pool=[...customers].sort((a,b)=>b._score-a._score);
  const fresh=chooseClusters(pool,per,hs);
  schedule=fresh.map(day=>routeDay(day));
  render();
  if(st) st.textContent='已完成：'+schedule.flat().length+' 位醫師（每次按下都會重新依最新資料排，不固定上週醫師）';
 } catch(err){
  console.error(err);
  const st=document.getElementById('generateStatus');
  if(st) st.textContent='排程錯誤：'+(err&&err.message?err.message:String(err));
 } finally {
  const btn=document.getElementById('generate');
  if(btn){btn.disabled=false;btn.textContent='✨ 自動排本週';}
 }
}
window.runWeeklyPlanner=generate;
function routePreserveLocks(arr){return routeDay(arr);}

function render(){
 const start=$('#weekStart').value; $('#schedule').innerHTML=schedule.map((day,di)=>`<div class="day" data-day="${di}"><div class="dayhead"><b>${DAYS[di]}</b><span>${start?addDays(start,di):''}</span></div>${day.map((c,si)=>slotHtml(c,di,si)).join('')||'<div class="empty">尚未排程</div>'}</div>`).join('');
 document.querySelectorAll('.slot').forEach(el=>{el.addEventListener('dragstart',dragStart);el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',dropSlot);});
 document.querySelectorAll('[data-action="detail"]').forEach(b=>b.onclick=()=>openDetail(+b.dataset.day,+b.dataset.slot));
 document.querySelectorAll('[data-action="replace"]').forEach(b=>b.onclick=()=>{replaceTarget=[+b.dataset.day,+b.dataset.slot];$('#search').focus();window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});renderPool()});
 renderPool(); renderStats(); renderMaster();
}
function slotHtml(c,d,s){let last=c.lastVisit?`上次 ${c.lastVisit}`:'尚無拜訪紀錄'; const ht=hoursText(c,d);const warn=hasHoursData(c)&&!availableOn(c,d);return `<div class="slot" draggable="true" data-day="${d}" data-slot="${s}"><div class="slotnum">${s+1} ${warn?' <span class="warn">⚠ 此日未設定門診</span>':''}</div><div class="clinic">${esc(c.hco)}</div><div class="doctor">${esc(c.hcp)}</div><div class="meta"><span class="pill grade${c.grade}">${c.grade} 級</span><span class="pill">${esc(c.product)}</span><span class="pill">${esc(shortArea(c.area))}</span><span class="pill">目標 ${c.target}/季</span>${ht?`<span class="pill">⏰ ${esc(ht)}</span>`:''}</div>${c.address?`<div class="last">📍 ${esc(c.address)}</div>`:''}${c.visitNote?`<div class="last">📝 ${esc(c.visitNote)}</div>`:''}<div class="objective">${esc(objective(c))}</div><div class="last">${last}${c.lastFeedback?' · '+esc(c.lastFeedback.slice(0,70))+(c.lastFeedback.length>70?'…':''):''}</div><div class="actions"><button class="mini" data-action="detail" data-day="${d}" data-slot="${s}">紀錄／Objective</button><button class="mini" data-action="replace" data-day="${d}" data-slot="${s}">替換</button></div></div>`}
function renderStats(){const flat=schedule.flat();['A','B','C'].forEach(g=>$('#s'+g).textContent=flat.filter(x=>x.grade===g).length);$('#sFollow').textContent=flat.filter(x=>x.savedNext).length;$('#sUnknown').textContent=flat.filter(x=>!x.area).length;}
function renderPool(){const q=$('#search').value.toLowerCase().trim(),g=$('#gradeFilter').value,used=new Set(schedule.flat().map(x=>x._idx));const list=customers.filter(c=>!used.has(c._idx)&&(!g||c.grade===g)&&(!q||[c.hcp,c.hco,c.area,c.product].join(' ').toLowerCase().includes(q))).sort((a,b)=>(b._score||0)-(a._score||0)).slice(0,60);$('#pool').innerHTML=list.map(c=>`<div class="poolitem"><div><b>${esc(c.hco)}</b> · ${esc(c.hcp)} <span class="pill grade${c.grade}">${c.grade}</span><div class="small">${esc(shortArea(c.area))} · ${esc(c.product)} · ${c.lastVisit?'上次 '+c.lastVisit:'無紀錄'}</div></div><button class="mini" data-pick="${c._idx}">${replaceTarget?'放入指定時段':'查看'}</button></div>`).join('')||'<div class="empty">沒有符合的候補客戶</div>';document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>pickPool(+b.dataset.pick));}
function pickPool(idx){const c=customers[idx];if(replaceTarget){const[d,s]=replaceTarget;schedule[d][s]=c;replaceTarget=null;render();}else{editing=c;$('#modalTitle').textContent=c.hco+'｜'+c.hcp;$('#lastFeedback').value=c.lastFeedback||'尚無拜訪紀錄';$('#objectiveEdit').value=objective(c);$('#modal').classList.add('open')}}
function toggleLock(d,s){schedule[d][s].locked=!schedule[d][s].locked;render()}
function openDetail(d,s){editing=schedule[d][s];$('#modalTitle').textContent=editing.hco+'｜'+editing.hcp;$('#lastFeedback').value=editing.lastFeedback||'尚無拜訪紀錄';$('#objectiveEdit').value=objective(editing);$('#modal').classList.add('open')}
function dragStart(e){e.dataTransfer.setData('text/plain',e.currentTarget.dataset.day+','+e.currentTarget.dataset.slot)}
function dropSlot(e){const[a,b]=e.dataTransfer.getData('text/plain').split(',').map(Number),d=+e.currentTarget.dataset.day,s=+e.currentTarget.dataset.slot;if(schedule[a][b].locked||schedule[d][s].locked)return;const tmp=schedule[a][b];schedule[a][b]=schedule[d][s];schedule[d][s]=tmp;render()}
function openMaps(day){const arr=schedule[day];if(!arr.length)return;const places=arr.map(c=>encodeURIComponent(c.address||((c.hco||'')+' '+(c.area||'')))); const url='https://www.google.com/maps/dir/'+places.join('/'); window.open(url,'_blank')}
function exportXlsx(){
 const rows=[['日期','星期','順序','行政區','診所地址','診所','醫師','產品','分級','當日門診／可拜訪時間','拜訪時段備註','上次拜訪','Pre-call Objective']];const st=$('#weekStart').value;
 schedule.forEach((day,d)=>day.forEach((c,i)=>rows.push([addDays(st,d),DAYS[d],i+1,shortArea(c.area),c.address||'',c.hco,c.hcp,c.product,c.grade,hoursText(c,d),c.visitNote||'',c.lastVisit,objective(c)])));
 if(window.XLSX){const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:12},{wch:8},{wch:7},{wch:14},{wch:36},{wch:28},{wch:16},{wch:12},{wch:8},{wch:24},{wch:26},{wch:12},{wch:58}];XLSX.utils.book_append_sheet(wb,ws,'Weekly Itinerary');XLSX.writeFile(wb,'PMN03_weekly_itinerary_'+st+'.xlsx');return;}
 const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='PMN03_weekly_itinerary_'+st+'.csv';a.click();URL.revokeObjectURL(a.href);
}
function normClinic(s){return String(s||'').trim().replace(/[\s　（）()\-_/、,.，。．:：]+/g,'').replace(/股份有限公司|醫療財團法人|診所附設藥局/g,'').toLowerCase()}
function excelDateJS(v){if(!v)return'';if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==='number'&&v>20000){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10)}const m=String(v).match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/);return m?`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:''}
function rowsToObjects(ws){const a=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});if(!a.length)return[];const h=a[0].map(x=>String(x).trim());return a.slice(1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
function findKey(obj,parts){const keys=Object.keys(obj);for(const p of parts){const k=keys.find(x=>x.replace(/\s/g,'').includes(p.replace(/\s/g,'')));if(k)return k}return''}
async function loadNewFiles(){
 const mf=$('#mccpFile').files[0], cf=$('#callFile').files[0]; if(!mf||!cf){$('#loadStatus').textContent='請同時選擇 MCCP 與 Call Report Excel。';return} if(!window.XLSX){$('#loadStatus').textContent='Excel 讀取模組尚未載入，請確認網路後重新開啟頁面。';return}
 try{ $('#loadStatus').textContent='讀取中…'; const [mb,cb]=await Promise.all([mf.arrayBuffer(),cf.arrayBuffer()]); const mw=XLSX.read(mb,{type:'array',cellDates:false}), cw=XLSX.read(cb,{type:'array',cellDates:false});
 const ms=mw.Sheets['PMN03']; const cs=cw.Sheets['call report']; if(!ms||!cs)throw new Error('找不到 PMN03 或 call report 工作表'); const mr=rowsToObjects(ms), cr=rowsToObjects(cs);
 const callList=cr.map(r=>{const clinic=r[findKey(r,['診所名稱'])]||'';return{area:r[findKey(r,['行政區'])]||'',clinic,doctor:r[findKey(r,['醫師'])]||'',date:excelDateJS(r[findKey(r,['日期'])]),feedback:r[findKey(r,['醫師反饋','互動內容'])]||'',next:r[findKey(r,['下次拜訪目的'])]||'',notes:r[findKey(r,['備註'])]||'',norm:normClinic(clinic)}}).filter(x=>x.clinic).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 function normDoctor(s){return String(s||'').replace(/醫師/g,'').replace(/[\s　]/g,'').toLowerCase()}
 function doctorVariants(s){const p=String(s||'').replace(/醫師/g,'').trim().split(/[\s　]+/).filter(Boolean),v=[normDoctor(s)];if(p.length===2)v.push(normDoctor(p[1]+p[0]));return [...new Set(v)]}
 function latest(hco,hcp){const n=normClinic(hco),dv=doctorVariants(hcp);return callList.find(c=>dv.includes(normDoctor(c.doctor))&&(c.norm===n||(n.length>=4&&(c.norm.includes(n)||n.includes(c.norm)))))||callList.find(c=>dv.includes(normDoctor(c.doctor)))||callList.find(c=>c.norm===n)||callList.find(c=>n.length>=4&&(c.norm.includes(n)||n.includes(c.norm)))||null}
 const next=[];mr.forEach((r,i)=>{const terr=r[findKey(r,['Territory'])]||'';if(terr!=='TW_PMN03')return;const hcp=r[findKey(r,['HCP Name'])]||'',hco=r[findKey(r,['HCO ' ,'HCO'])]||'';let grade=String(r[findKey(r,['客戶分級'])]||'').trim();let t=Number(r[findKey(r,['產品目標拜訪次數','一季總拜訪次數'])])||0;if(!['A','B','C'].includes(grade)){const shifted=Number(grade)||t;grade=shifted===6?'A':shifted===3?'B':shifted===2?'C':'';t=shifted||t}if(!hcp||!hco||!['A','B','C'].includes(grade))return;if(!t)t={A:6,B:3,C:2}[grade];const la=latest(hco,hcp);next.push(applyOverride({id:r[findKey(r,['Target 18碼ID'])]||'u'+i,hcp:String(hcp),hco:String(hco),specialty:String(r[findKey(r,['Specialty'])]||''),product:String(r[findKey(r,['Product'])]||'').replace('_KT',''),adoption:String(r[findKey(r,['Standard Adoption'])]||''),grade,target:t,area:la?.area||'',lastVisit:la?.date||'',lastFeedback:la?.feedback||'',savedNext:la?.next||'',notes:la?.notes||''}))});
 customers=next.map((x,i)=>({...x,_idx:i}));schedule=[[],[],[],[],[]];$('#loadStatus').textContent=`已更新：${customers.length} 位 PMN03 HCP；系統會依新版 Call Report 延續拜訪。`;generate();
 }catch(e){console.error(e);$('#loadStatus').textContent='讀取失敗：'+e.message}
}
function renderMaster(){
 const box=$('#masterTable');if(!box)return;const q=($('#masterSearch')?.value||'').trim().toLowerCase();
 const list=customers.filter(c=>!q||[c.hcp,c.hco,c.area,c.address,c.product].join(' ').toLowerCase().includes(q)).slice(0,160);
 box.innerHTML=`<div class="masterrow head"><span>醫師</span><span>診所</span><span>地址／行政區</span><span>分級</span><span>門診／可拜訪時間</span><span></span></div>`+list.map(c=>`<div class="masterrow"><span><b>${esc(c.hcp)}</b><br><span class="small">${esc(c.product)}</span></span><span>${esc(c.hco)}</span><span>${esc(c.address||'尚未設定地址')}<br><span class="small">${esc(shortArea(c.area))}</span></span><span><span class="pill grade${c.grade}">${c.grade}</span> · ${c.target}/季</span><span class="hours">${esc(allHoursSummary(c))}</span><span><button class="mini" data-editcustomer="${c._idx}">編輯</button></span></div>`).join('');
 document.querySelectorAll('[data-editcustomer]').forEach(b=>b.onclick=()=>openCustomerEdit(+b.dataset.editcustomer));
}
function openCustomerEdit(idx){editingCustomer=customers[idx];const c=editingCustomer;$('#customerModalTitle').textContent='編輯｜'+c.hcp+'・'+c.hco;$('#editHcp').value=c.hcp||'';$('#editHco').value=c.hco||'';$('#editArea').value=c.area||'';$('#editAddress').value=c.address||'';$('#editProduct').value=c.product||'Valdoxan';$('#editGrade').value=c.grade||'C';for(let d=0;d<5;d++)$('#h'+d).value=hoursText(c,d);$('#editVisitNote').value=c.visitNote||'';$('#customerModal').classList.add('open')}
function saveCustomerEdit(){if(!editingCustomer)return;const c=editingCustomer;c.hcp=$('#editHcp').value.trim();c.hco=$('#editHco').value.trim();c.area=$('#editArea').value.trim();c.address=$('#editAddress').value.trim();c.product=$('#editProduct').value;c.grade=$('#editGrade').value;c.target={A:6,B:3,C:2}[c.grade]||c.target||2;c.hours={};for(let d=0;d<5;d++)c.hours[d]=$('#h'+d).value.trim();c.visitNote=$('#editVisitNote').value.trim();saveOverride(c);$('#customerModal').classList.remove('open');render()}
function addLocalCustomer(){const id='local_'+Date.now();const c=applyOverride({id,hcp:'新醫師',hco:'新診所',specialty:'',product:'Valdoxan',adoption:'',grade:'C',target:2,area:'',lastVisit:'',lastFeedback:'',savedNext:'',notes:'',localOnly:true});c._idx=customers.length;c.locked=false;c.objective='';customers.push(c);editingCustomer=c;openCustomerEdit(c._idx)}
function exportMaster(){const rows=[['醫師','診所','行政區','診所地址','產品','分級','每季目標','週一','週二','週三','週四','週五','拜訪時段備註']];customers.forEach(c=>rows.push([c.hcp,c.hco,c.area,c.address||'',c.product,c.grade,c.target,hoursText(c,0),hoursText(c,1),hoursText(c,2),hoursText(c,3),hoursText(c,4),c.visitNote||'']));if(window.XLSX){const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:16},{wch:28},{wch:18},{wch:38},{wch:12},{wch:8},{wch:10},{wch:18},{wch:18},{wch:18},{wch:18},{wch:18},{wch:28}];XLSX.utils.book_append_sheet(wb,ws,'客戶主檔');XLSX.writeFile(wb,'PMN03_客戶診所門診主檔.xlsx')}}

// Add Maps button to each day header after render

let selectedClinicCustomerIdx=null;
function clinicSearchHay(c){return [c.hcp,c.hco,c.area,c.address,c.product,c.grade,c.adoption].join(' ').toLowerCase()}
function selectClinicCustomer(idx){
 const c=customers[idx]; if(!c)return;
 selectedClinicCustomerIdx=idx;
 $('#clinicSelectedIdx').value=idx;
 $('#clinicDoctorSearch').value=`${c.hcp}｜${c.hco}`;
 $('#clinicDoctorResults').classList.remove('open');
 for(let i=0;i<5;i++) $('#ocrH'+i).value=hoursText(c,i);
 if($('#manualVisitNote')) $('#manualVisitNote').value=c.visitNote||'';
 $('#ocrStatus').textContent=`已選擇：${c.hcp}｜${c.hco}。請直接輸入週一～週五門診時間後儲存。`;
}
function renderClinicDoctorResults(){
 const box=$('#clinicDoctorResults'), input=$('#clinicDoctorSearch'); if(!box||!input)return; const q=input.value.trim().toLowerCase();
 if(!q){box.classList.remove('open');box.innerHTML='';return}
 const hits=customers.filter(c=>clinicSearchHay(c).includes(q)).slice(0,16);
 box.innerHTML=hits.length?hits.map(c=>`<div class="doctoroption" data-clinicdoctor="${c._idx}"><b>${esc(c.hcp)}｜${esc(c.hco)}</b><span class="small">${esc(shortArea(c.area))} · ${esc(c.product)} · ${esc(c.grade)}級</span></div>`).join(''):'<div class="empty">找不到符合的醫師</div>';
 box.classList.add('open'); box.querySelectorAll('[data-clinicdoctor]').forEach(el=>el.addEventListener('click',()=>selectClinicCustomer(+el.dataset.clinicdoctor)));
}
function getSelectedClinicCustomer(){const idx=Number($('#clinicSelectedIdx')?.value);return Number.isInteger(idx)&&idx>=0?customers[idx]:null}
function stripHtmlToText(html){try{const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,style,noscript,svg').forEach(n=>n.remove());return (doc.body?.innerText||'').replace(/\n{3,}/g,'\n\n')}catch(e){return String(html||'').replace(/<[^>]+>/g,' ')}}
function applyParsedText(text,successMsg){$('#ocrText').value=text||'';const h=parseClinicHours(text||'');for(let i=0;i<5;i++)$('#ocrH'+i).value=h[i]||'';$('#ocrStatus').textContent=successMsg||'已擷取資料，請核對週一～週五後再確認寫入。'}
async function readClinicUrl(){
 const c=getSelectedClinicCustomer(), st=$('#ocrStatus'), url=($('#clinicSourceUrl')?.value||'').trim(); if(!c){st.textContent='請先搜尋並選擇醫師。';return} if(!url){st.textContent='請先貼上門診網址。';return}
 try{new URL(url)}catch(e){st.textContent='網址格式不正確，請貼上完整的 https:// 網址。';return}
 c.clinicSourceUrl=url; saveOverride(c); $('#readClinicUrl').disabled=true; st.textContent='正在讀取門診網址…';
 try{
   const r=await fetch(url,{method:'GET',mode:'cors'}); if(!r.ok)throw new Error('HTTP '+r.status); const ct=(r.headers.get('content-type')||'').toLowerCase();
   if(ct.startsWith('image/')){if(!window.Tesseract)throw new Error('圖片辨識模組尚未載入');const blob=await r.blob();const result=await Tesseract.recognize(blob,'chi_tra+eng',{logger:m=>{if(m.status==='recognizing text')st.textContent='正在辨識網址中的圖片… '+Math.round((m.progress||0)*100)+'%';}});applyParsedText(result?.data?.text||'','網址圖片辨識完成，請核對後再寫入。');}
   else{const html=await r.text(); const text=stripHtmlToText(html); applyParsedText(text,'網址讀取完成，請核對辨識後門診時間。');}
 }catch(e){console.error(e);st.textContent='這個網站阻擋本機網頁直接讀取（常見於 Google Maps、Facebook 或部分診所網站）。網址已替你保存；可按「開啟來源」查看，或用圖片備用。若要所有網址都能自動讀取，需要把排程器部署成有後端的 Web App。';}
 finally{$('#readClinicUrl').disabled=false}
}
function openClinicUrl(){const url=($('#clinicSourceUrl')?.value||'').trim();if(!url){$('#ocrStatus').textContent='請先貼上網址。';return}try{window.open(new URL(url).href,'_blank','noopener')}catch(e){$('#ocrStatus').textContent='網址格式不正確。'}}
function normalizeOcrText(t){return String(t||'').replace(/星期/g,'週').replace(/禮拜/g,'週').replace(/周([一二三四五六日])/g,'週$1').replace(/\r/g,'');}
function extractTimes(line){
 const vals=[]; let m;
 const re=/(?:上午|下午|晚上|早上|早診|午診|晚診)|(?:[0-2]?\d[:：][0-5]\d\s*[-~～至]\s*[0-2]?\d[:：][0-5]\d)/g;
 while((m=re.exec(line))!==null) vals.push(m[0].replace(/：/g,':').replace(/[~～]/g,'-').replace('至','-'));
 return [...new Set(vals)].join(', ');
}
function parseClinicHours(text){
 const t=normalizeOcrText(text); const out={0:'',1:'',2:'',3:'',4:''};
 const map={'一':0,'二':1,'三':2,'四':3,'五':4}; const lines=t.split(/\n+/).map(x=>x.trim()).filter(Boolean);
 for(const line of lines){
   const days=[...line.matchAll(/週\s*([一二三四五])/g)].map(m=>map[m[1]]);
   if(!days.length)continue;
   let val=extractTimes(line);
   if(!val){
     if(/看診|門診|診/.test(line)) val='有門診';
     else continue;
   }
   days.forEach(d=>out[d]=out[d]?[out[d],val].filter((v,i,a)=>a.indexOf(v)===i).join(', '):val);
 }
 // table OCR often separates weekday header and session rows; detect explicit day + session marks
 ['一','二','三','四','五'].forEach((ch,i)=>{
   if(out[i])return;
   const re=new RegExp('週\\s*'+ch+'[^\\n]{0,28}(上午|下午|晚上|早診|午診|晚診)','g');
   const vals=[...t.matchAll(re)].map(m=>m[1]); if(vals.length)out[i]=[...new Set(vals)].join(', ');
 });
 return out;
}
async function runClinicOcr(){
 const f=$('#clinicImage')?.files?.[0], st=$('#ocrStatus');
 if(!f){st.textContent='請先選擇一張門診表圖片。';return}
 if(!window.Tesseract){st.textContent='圖片辨識模組尚未載入。第一次使用請保持網路連線後重新開啟頁面。';return}
 try{
  $('#runOcr').disabled=true; st.textContent='正在辨識圖片…第一次使用可能需要一些時間。';
  const result=await Tesseract.recognize(f,'chi_tra+eng',{logger:m=>{if(m.status==='recognizing text')st.textContent='正在辨識… '+Math.round((m.progress||0)*100)+'%';}});
  const text=result?.data?.text||''; $('#ocrText').value=text;
  const h=parseClinicHours(text); for(let i=0;i<5;i++)$('#ocrH'+i).value=h[i]||'';
  st.textContent='辨識完成。請核對週一～週五結果；確認無誤後再按「確認並寫入」。';
 }catch(e){console.error(e);st.textContent='辨識失敗：'+(e.message||e)}finally{$('#runOcr').disabled=false}
}
function applyClinicOcr(){
 const c=getSelectedClinicCustomer(), st=$('#ocrStatus');
 if(!c){st.textContent='請先搜尋並選擇醫師。';return}
 const h={}; for(let i=0;i<5;i++) h[i]=$('#ocrH'+i).value.trim();
 c.hours=h;
 if($('#manualVisitNote')) c.visitNote=$('#manualVisitNote').value.trim();
 saveOverride(c);
 renderMaster();
 render();
 st.textContent=Object.values(h).some(Boolean)
   ? '已儲存：'+c.hcp+'｜'+c.hco+'。下次自動排程會依你手動輸入的門診時間安排。'
   : '已儲存並清除門診時間限制：'+c.hcp+'｜'+c.hco+'。';
}

const _render=render; render=function(){_render();document.querySelectorAll('.dayhead').forEach((h,i)=>{const b=document.createElement('button');b.type='button';b.className='mini';b.textContent='Google Maps';b.onclick=()=>openMaps(i);h.appendChild(b)})}
function initApp(){
 const wd=document.getElementById('weekStart'); if(wd){const now=new Date(); const day=(now.getDay()+6)%7; const mon=new Date(now); mon.setDate(now.getDate()-day); wd.value=mon.toISOString().slice(0,10);}
 $('#reroute').addEventListener('click',()=>{schedule=schedule.map(routePreserveLocks);render()});
 $('#clinicDoctorSearch')?.addEventListener('input',renderClinicDoctorResults); $('#clinicDoctorSearch')?.addEventListener('focus',renderClinicDoctorResults);
 document.addEventListener('click',e=>{if(!e.target.closest('.doctorsearch'))$('#clinicDoctorResults')?.classList.remove('open')});
 $('#applyOcr')?.addEventListener('click',applyClinicOcr);
 $('#exportXlsx').addEventListener('click',exportXlsx); $('#loadFiles').addEventListener('click',loadNewFiles);
 $('#search').addEventListener('input',renderPool); $('#masterSearch').addEventListener('input',renderMaster);
 $('#addCustomer').addEventListener('click',addLocalCustomer); $('#exportMaster').addEventListener('click',exportMaster);
 $('#saveCustomer').addEventListener('click',saveCustomerEdit); $('#closeCustomerModal').addEventListener('click',()=>$('#customerModal').classList.remove('open'));
 $('#gradeFilter').addEventListener('change',renderPool); $('#closeModal').addEventListener('click',()=>$('#modal').classList.remove('open'));
 $('#saveObjective').addEventListener('click',()=>{if(editing){editing.objective=$('#objectiveEdit').value.trim();}$('#modal').classList.remove('open');render()});
 generate();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initApp); else initApp();
