
(function(){

/* ================= STATE ================= */
let applications = [];   // {id, company, role, image(dataURL small), status, notes, dates:[{id,label,date,time}], createdAt}
let todos = [];          // {id, text, date('YYYY-MM-DD'|null), monthKey, done, source, appId}
let firedReminders = {}; // map key -> true
let viewMonth = new Date(); viewMonth.setDate(1);
let selectedDay = null; // 'YYYY-MM-DD'cd
let editingId = null;
let pendingImageFull = null;  // for AI (dataURL, larger)
let pendingImageThumb = null; // for storage (dataURL, small)
let activeTodoTab = 'today';

const STAGE_ICON = {seed:'🌱', sprout:'🌿', bloom:'🌸', bouquet:'💐', wilted:'🥀'};
const STAGE_LABEL = {seed:'Seed', sprout:'Sprout', bloom:'Bloom', bouquet:'Bouquet', wilted:'Wilted'};

const todayStr = () => fmtDate(new Date());
function fmtDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function monthKeyOf(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ================= STORAGE ================= */
async function loadAll(){
  try{
    const a = await window.storage.get('applications');
    applications = a ? JSON.parse(a.value) : [];
  }catch(e){ applications = []; }
  try{
    const t = await window.storage.get('todos');
    todos = t ? JSON.parse(t.value) : [];
  }catch(e){ todos = []; }
  try{
    const f = await window.storage.get('firedReminders');
    firedReminders = f ? JSON.parse(f.value) : {};
  }catch(e){ firedReminders = {}; }
}
async function saveApplications(){
  try{ await window.storage.set('applications', JSON.stringify(applications)); }
  catch(e){ toast('Oops', "Couldn't save to storage — try again."); }
}
async function saveTodos(){
  try{ await window.storage.set('todos', JSON.stringify(todos)); }
  catch(e){ toast('Oops', "Couldn't save your to‑dos."); }
}
async function saveFired(){
  try{ await window.storage.set('firedReminders', JSON.stringify(firedReminders)); }
  catch(e){ /* non critical */ }
}

/* ================= BEE / SPEECH ================= */
const beeEl = document.getElementById('bee');
const speechEl = document.getElementById('speech');
const beeLines = [
  "You planted another one! 🌱", "Every seed needs a little patience.",
  "Bzzz~ I'll keep watch for you.", "One step closer to bloom!",
  "Don't forget to water your to‑dos today.", "Look at this garden coming along!"
];
function moveBeeTo(x,y){ beeEl.style.left = x+'px'; beeEl.style.top = y+'px'; }
function beeSay(text, x, y){
  speechEl.textContent = text;
  speechEl.style.left = (x+40)+'px';
  speechEl.style.top = (y-46)+'px';
  speechEl.style.display = 'block';
  moveBeeTo(x,y);
  clearTimeout(beeSay._t);
  beeSay._t = setTimeout(()=>{ speechEl.style.display='none'; }, 3600);
}
function beeIdle(){
  const x = 40 + Math.random()*(window.innerWidth-140);
  const y = 60 + Math.random()*140;
  moveBeeTo(x,y);
}
beeIdle();
setInterval(()=>{ if(speechEl.style.display!=='block') beeIdle(); }, 9000);

/* ================= TOAST ================= */
function toast(title, msg){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className='toast';
  el.innerHTML = `<b>${escapeHtml(title)}</b>${escapeHtml(msg)}`;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .4s'; setTimeout(()=>el.remove(),400); }, 7000);
}

/* ================= IMAGE COMPRESSION ================= */
function readAndResize(file, maxWidth, quality){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const scale = Math.min(1, maxWidth/img.width);
        const w = Math.round(img.width*scale), h = Math.round(img.height*scale);
        const canvas = document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ================= AI EXTRACTION ================= */
async function analyzeScreenshot(dataUrl){
  const base64 = dataUrl.split(',')[1];
  const mediaType = dataUrl.substring(5, dataUrl.indexOf(';'));
  const today = todayStr();
  const prompt = `Today's date is ${today}. Look at this screenshot of a job application (could be a confirmation email, job portal, calendar invite, or interview email).
Extract:
- company: the company name (best guess, short)
- role: the job title/role (short)
- dates: an array of any relevant dates mentioned or implied — application deadline, interview date/time, follow-up date, start date, etc. For each: {"label": short label like "Interview" or "Application deadline", "date": "YYYY-MM-DD", "time": "HH:MM" in 24-hour time, using "09:00" if no time is given}. Resolve relative dates (e.g. "in 3 days", "next Monday") using today's date above. If no dates are found, return an empty array.
Respond with ONLY raw JSON, no markdown fences, no explanation, in this exact shape:
{"company":"...", "role":"...", "dates":[{"label":"...","date":"YYYY-MM-DD","time":"HH:MM"}]}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-6",
      max_tokens:1000,
      messages:[{
        role:"user",
        content:[
          {type:"image", source:{type:"base64", media_type: mediaType || "image/jpeg", data: base64}},
          {type:"text", text: prompt}
        ]
      }]
    })
  });
  const data = await response.json();
  const textBlocks = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
  const clean = textBlocks.replace(/```json|```/g,'').trim();
  return JSON.parse(clean);
}

/* ================= CALENDAR ================= */
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
function renderDow(){
  document.getElementById('calDow').innerHTML = DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
}
function eventsByDate(){
  const map = {};
  applications.forEach(app=>{
    (app.dates||[]).forEach(d=>{
      if(!d.date) return;
      map[d.date] = map[d.date] || [];
      map[d.date].push({app, dateEntry:d});
    });
  });
  return map;
}
function todosByDate(){
  const map = {};
  todos.forEach(t=>{ if(t.date){ map[t.date]=map[t.date]||[]; map[t.date].push(t);} });
  return map;
}
function renderCalendar(){
  renderDow();
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  document.getElementById('monthLabel').textContent = viewMonth.toLocaleString('default',{month:'long', year:'numeric'});
  const firstDow = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const evMap = eventsByDate();
  const tdMap = todosByDate();
  let html = '';
  for(let i=0;i<firstDow;i++) html += `<div class="cal-cell empty"></div>`;
  for(let day=1; day<=daysInMonth; day++){
    const dateStr = y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const isToday = dateStr === todayStr();
    const isSel = dateStr === selectedDay;
    const evs = evMap[dateStr]||[];
    const tds = tdMap[dateStr]||[];
    const flowers = evs.slice(0,4).map(e=>`<span>${STAGE_ICON[e.app.status]||'🌱'}</span>`).join('');
    html += `<div class="cal-cell ${isToday?'today':''} ${isSel?'selected':''}" data-date="${dateStr}">
      <div class="dnum">${day}</div>
      ${tds.length? '<div class="todo-dot"></div>' : ''}
      <div class="flowers">${flowers}</div>
    </div>`;
  }
  document.getElementById('calGrid').innerHTML = html;
  document.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      selectedDay = cell.dataset.date === selectedDay ? null : cell.dataset.date;
      renderCalendar();
      renderDayPanel();
    });
  });
}
function renderDayPanel(){
  const panel = document.getElementById('dayPanel');
  if(!selectedDay){ panel.style.display='none'; return; }
  panel.style.display='block';
  const d = new Date(selectedDay+'T00:00:00');
  document.getElementById('dayPanelTitle').textContent = d.toLocaleDateString('default',{weekday:'long', month:'long', day:'numeric'});
  const evMap = eventsByDate();
  const evs = evMap[selectedDay]||[];
  const tds = todos.filter(t=>t.date===selectedDay);
  let html='';
  evs.forEach(e=>{
    html += `<div class="day-event"><span class="flower">${STAGE_ICON[e.app.status]||'🌱'}</span>
      <div class="meta"><b>${escapeHtml(e.dateEntry.label)} — ${escapeHtml(e.app.company)}</b><small>${escapeHtml(e.app.role||'')} · ${e.dateEntry.time||''}</small></div></div>`;
  });
  if(tds.length){
    tds.forEach(t=>{
      html += `<div class="day-event"><span class="flower">📝</span><div class="meta"><b style="${t.done?'text-decoration:line-through;opacity:.6;':''}">${escapeHtml(t.text)}</b></div></div>`;
    });
  }
  if(!evs.length && !tds.length){
    html = `<div class="todo-empty">Nothing planted here yet 🌼</div>`;
  }
  document.getElementById('dayEvents').innerHTML = html;
}

/* ================= TODOS ================= */
function renderTodos(){
  const list = document.getElementById('todoList');
  const thisMonthKey = monthKeyOf(new Date());
  let items;
  if(activeTodoTab==='today'){
    items = todos.filter(t=>t.date===todayStr());
  } else {
    items = todos.filter(t=> (t.date && t.date.startsWith(thisMonthKey)) || (!t.date && t.monthKey===thisMonthKey) );
    items.sort((a,b)=> (a.date||'9999').localeCompare(b.date||'9999'));
  }
  const openCount = todos.filter(t=>!t.done).length;
  document.getElementById('todoBadge').textContent = `${openCount} open`;
  if(!items.length){
    list.innerHTML = `<div class="todo-empty">${activeTodoTab==='today' ? "Nothing due today — enjoy the sunshine ☀️" : "No tasks planted for this month yet 🌱"}</div>`;
    return;
  }
  list.innerHTML = items.map(t=>`
    <div class="todo-item ${t.done?'done':''}" data-id="${t.id}">
      <div class="check">${t.done?'✓':''}</div>
      <div class="txt">${escapeHtml(t.text)}</div>
      ${t.date ? `<div class="datechip">${t.date.slice(5)}</div>` : ''}
    </div>`).join('');
  list.querySelectorAll('.todo-item').forEach(el=>{
    el.querySelector('.check').addEventListener('click', ()=>toggleTodo(el.dataset.id));
  });
}
async function toggleTodo(id){
  const t = todos.find(t=>t.id===id);
  if(!t) return;
  t.done = !t.done;
  await saveTodos();
  renderTodos(); renderCalendar(); renderDayPanel(); renderUpcoming();
}
async function addManualTodo(){
  const input = document.getElementById('todoInput');
  const text = input.value.trim();
  if(!text) return;
  const t = {
    id: uid(), text,
    date: activeTodoTab==='today' ? todayStr() : null,
    monthKey: monthKeyOf(new Date()),
    done:false, source:'manual'
  };
  todos.push(t);
  input.value='';
  await saveTodos();
  renderTodos(); renderCalendar(); renderDayPanel(); renderUpcoming();
}

/* ================= UPCOMING / REMINDERS ================= */
function renderUpcoming(){
  const now = new Date();
  const items = [];
  applications.forEach(app=>{
    (app.dates||[]).forEach(d=>{
      if(!d.date) return;
      const dt = new Date(d.date+'T'+(d.time||'09:00')+':00');
      if(dt >= now){ items.push({dt, label:d.label, company:app.company, status:app.status}); }
    });
  });
  items.sort((a,b)=>a.dt-b.dt);
  const wrap = document.getElementById('upcomingList');
  if(!items.length){ wrap.innerHTML = `<div class="todo-empty">Nothing on the horizon yet 🌤️</div>`; return; }
  wrap.innerHTML = items.slice(0,8).map(it=>{
    const diffMs = it.dt - now;
    const diffH = diffMs/3600000;
    let when;
    if(diffH < 24) when = it.dt.toLocaleTimeString('default',{hour:'numeric',minute:'2-digit'})+' today-ish';
    else when = it.dt.toLocaleDateString('default',{month:'short', day:'numeric'})+' · '+it.dt.toLocaleTimeString('default',{hour:'numeric',minute:'2-digit'});
    return `<div class="todo-item"><div style="font-size:16px;">${STAGE_ICON[it.status]||'🌱'}</div>
      <div class="txt"><b style="font-family:'Fredoka',sans-serif; font-size:13px;">${escapeHtml(it.label)}</b><br><small style="color:var(--ink-soft);">${escapeHtml(it.company)} · ${when}</small></div>
    </div>`;
  }).join('');
}

function checkReminders(){
  const now = new Date();
  applications.forEach(app=>{
    (app.dates||[]).forEach(d=>{
      if(!d.date) return;
      const target = new Date(d.date+'T'+(d.time||'09:00')+':00');
      [['h1',60],['m10',10]].forEach(([tag,mins])=>{
        const remindAt = new Date(target.getTime() - mins*60000);
        const key = app.id+':'+d.id+':'+tag;
        if(!firedReminders[key] && now >= remindAt && now <= target){
          firedReminders[key] = true;
          const label = mins===60 ? 'in about 1 hour' : 'in about 10 minutes';
          toast('🔔 '+d.label+' '+label, `${app.company} — ${app.role||''}`);
          beeSay(`Psst! ${d.label} for ${app.company} is coming up ${label}!`, window.innerWidth-260, 100);
          if(window.Notification && Notification.permission==='granted'){
            try{ new Notification(`${d.label} ${label}`, {body:`${app.company} — ${app.role||''}`}); }catch(e){}
          }
          saveFired();
        }
      });
    });
  });
}
if(window.Notification && Notification.permission==='default'){
  try{ Notification.requestPermission(); }catch(e){}
}
setInterval(checkReminders, 20000);

/* ================= GARDEN (applications grid) ================= */
function renderGarden(){
  const grid = document.getElementById('gardenGrid');
  document.getElementById('gardenBadge').textContent = `${applications.length} planted`;
  if(!applications.length){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Your garden is empty — plant your first application! 🌱</div>`;
    return;
  }
  const sorted = [...applications].sort((a,b)=> b.createdAt.localeCompare(a.createdAt));
  grid.innerHTML = sorted.map((app,i)=>{
    const rot = (i%2===0? -2 : 2) + (i%5)*0.6;
    return `<div class="flower-card" style="--rot:${rot}deg" data-id="${app.id}">
      ${app.image? `<img src="${app.image}" alt="">` : `<div style="height:90px;border-radius:10px;background:linear-gradient(160deg,var(--mint),var(--lavender));display:flex;align-items:center;justify-content:center;font-size:30px;">${STAGE_ICON[app.status]||'🌱'}</div>`}
      <div class="co">${escapeHtml(app.company||'Untitled')}</div>
      <div class="ro">${escapeHtml(app.role||'')}</div>
      <div class="stagepill">${STAGE_ICON[app.status]||'🌱'} ${STAGE_LABEL[app.status]||'Seed'}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.flower-card').forEach(card=>{
    card.addEventListener('click', ()=> openEditModal(card.dataset.id));
  });
}

/* ================= STATS ================= */
function renderStats(){
  const total = applications.length;
  const interviews = applications.filter(a=>a.status==='bloom').length;
  const offers = applications.filter(a=>a.status==='bouquet').length;
  const openTodos = todos.filter(t=>!t.done).length;
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="lab">planted</div></div>
    <div class="stat-card"><div class="num">${interviews}</div><div class="lab">blooming</div></div>
    <div class="stat-card"><div class="num">${offers}</div><div class="lab">bouquets</div></div>
    <div class="stat-card"><div class="num">${openTodos}</div><div class="lab">to‑dos left</div></div>
  `;
}

/* ================= MODAL ================= */
const overlay = document.getElementById('modalOverlay');
function openAddModal(){
  editingId = null;
  pendingImageFull = null; pendingImageThumb = null;
  document.getElementById('modalTitle').textContent = 'Plant a new application';
  document.getElementById('fCompany').value='';
  document.getElementById('fRole').value='';
  document.getElementById('fStatus').value='seed';
  document.getElementById('fNotes').value='';
  document.getElementById('datesWrap').innerHTML='';
  document.getElementById('dropZoneContent').innerHTML = '📸 Click to choose a screenshot<br><small>(confirmation email, portal page, calendar invite…)</small>';
  document.getElementById('dropZone').classList.remove('hasimg');
  document.getElementById('deleteAppBtn').style.display='none';
  document.getElementById('aiStatus').style.display='none';
  overlay.classList.add('show');
}
function openEditModal(id){
  const app = applications.find(a=>a.id===id);
  if(!app) return;
  editingId = id;
  pendingImageFull=null; pendingImageThumb = app.image||null;
  document.getElementById('modalTitle').textContent = 'Tend this application';
  document.getElementById('fCompany').value = app.company||'';
  document.getElementById('fRole').value = app.role||'';
  document.getElementById('fStatus').value = app.status||'seed';
  document.getElementById('fNotes').value = app.notes||'';
  document.getElementById('datesWrap').innerHTML='';
  (app.dates||[]).forEach(d=>addDateRow(d));
  if(app.image){
    document.getElementById('dropZoneContent').innerHTML = `<img src="${app.image}">`;
    document.getElementById('dropZone').classList.add('hasimg');
  } else {
    document.getElementById('dropZoneContent').innerHTML = '📸 Click to choose a screenshot';
    document.getElementById('dropZone').classList.remove('hasimg');
  }
  document.getElementById('deleteAppBtn').style.display='inline-flex';
  document.getElementById('aiStatus').style.display='none';
  overlay.classList.add('show');
}
function closeModal(){ overlay.classList.remove('show'); }
document.getElementById('modalClose').addEventListener('click', closeModal);
overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeModal(); });
document.getElementById('openAddModal').addEventListener('click', openAddModal);

function addDateRow(existing){
  const wrap = document.getElementById('datesWrap');
  const rowId = existing?.id || uid();
  const row = document.createElement('div');
  row.className='datefield-row';
  row.dataset.rowid = rowId;
  row.innerHTML = `
    <div class="field"><label>Label</label><input type="text" class="dLabel" value="${existing? escapeHtml(existing.label):''}" placeholder="Interview"></div>
    <div class="field"><label>Date</label><input type="date" class="dDate" value="${existing?.date||''}"></div>
    <div class="field" style="max-width:100px;"><label>Time</label><input type="time" class="dTime" value="${existing?.time||'09:00'}"></div>
    <button class="rm" type="button" title="remove">✕</button>
  `;
  row.querySelector('.rm').addEventListener('click', ()=> row.remove());
  wrap.appendChild(row);
}
document.getElementById('addDateRow').addEventListener('click', ()=>addDateRow(null));

/* file handling */
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
dropZone.addEventListener('click', ()=>fileInput.click());
fileInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  document.getElementById('aiStatus').style.display='flex';
  document.getElementById('aiStatusText').textContent = 'Reading your screenshot…';
  try{
    const [thumb, full] = await Promise.all([
      readAndResize(file, 260, 0.55),
      readAndResize(file, 1000, 0.8)
    ]);
    pendingImageThumb = thumb;
    pendingImageFull = full;
    document.getElementById('dropZoneContent').innerHTML = `<img src="${thumb}">`;
    dropZone.classList.add('hasimg');
    document.getElementById('aiStatusText').textContent = 'The firefly is reading your screenshot…';
    const result = await analyzeScreenshot(full);
    if(result.company) document.getElementById('fCompany').value = result.company;
    if(result.role) document.getElementById('fRole').value = result.role;
    if(Array.isArray(result.dates) && result.dates.length){
      document.getElementById('datesWrap').innerHTML='';
      result.dates.forEach(d=>addDateRow(d));
    }
    beeSay("I read it! Check the details below ✨", window.innerWidth/2-100, 200);
    document.getElementById('aiStatus').style.display='none';
  }catch(err){
    document.getElementById('aiStatus').style.display='none';
    toast('Hmm', "Couldn't quite read that one — feel free to fill in the details by hand.");
  }
});

/* save / delete */
document.getElementById('saveAppBtn').addEventListener('click', async ()=>{
  const company = document.getElementById('fCompany').value.trim();
  const role = document.getElementById('fRole').value.trim();
  if(!company){ toast('Just a sec', 'Give this application a company name first 🌱'); return; }
  const status = document.getElementById('fStatus').value;
  const notes = document.getElementById('fNotes').value.trim();
  const dateRows = [...document.querySelectorAll('#datesWrap .datefield-row')];
  const dates = dateRows.map(row=>({
    id: row.dataset.rowid,
    label: row.querySelector('.dLabel').value.trim() || 'Reminder',
    date: row.querySelector('.dDate').value,
    time: row.querySelector('.dTime').value || '09:00'
  })).filter(d=>d.date);

  let app;
  if(editingId){
    app = applications.find(a=>a.id===editingId);
    app.company=company; app.role=role; app.status=status; app.notes=notes; app.dates=dates;
    if(pendingImageThumb) app.image = pendingImageThumb;
  } else {
    app = {
      id: uid(), company, role, status, notes, dates,
      image: pendingImageThumb || null,
      createdAt: new Date().toISOString()
    };
    applications.push(app);
  }
  await saveApplications();
  syncAutoTodos(app);
  await saveTodos();
  closeModal();
  renderAll();
  beeSay(beeLines[Math.floor(Math.random()*beeLines.length)], window.innerWidth/2, 140);
});

document.getElementById('deleteAppBtn').addEventListener('click', async ()=>{
  if(!editingId) return;
  applications = applications.filter(a=>a.id!==editingId);
  todos = todos.filter(t=>t.appId!==editingId);
  await saveApplications(); await saveTodos();
  closeModal(); renderAll();
});

function syncAutoTodos(app){
  todos = todos.filter(t=> !(t.source==='auto' && t.appId===app.id));
  (app.dates||[]).forEach(d=>{
    if(!d.date) return;
    todos.push({
      id: uid(), text: `${d.label} — ${app.company}`, date: d.date,
      monthKey: d.date.slice(0,7), done:false, source:'auto', appId:app.id
    });
  });
}

/* ================= TODO TABS ================= */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeTodoTab = btn.dataset.tab;
    renderTodos();
  });
});
document.getElementById('todoAddBtn').addEventListener('click', addManualTodo);
document.getElementById('todoInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') addManualTodo(); });

/* ================= MONTH NAV ================= */
document.getElementById('prevMonth').addEventListener('click', ()=>{
  viewMonth.setMonth(viewMonth.getMonth()-1); selectedDay=null; renderCalendar(); renderDayPanel();
});
document.getElementById('nextMonth').addEventListener('click', ()=>{
  viewMonth.setMonth(viewMonth.getMonth()+1); selectedDay=null; renderCalendar(); renderDayPanel();
});

/* ================= RENDER ALL ================= */
function renderAll(){
  renderStats();
  renderCalendar();
  renderDayPanel();
  renderTodos();
  renderUpcoming();
  renderGarden();
}

/* ================= INIT ================= */
(async function init(){
  await loadAll();
  renderAll();
  checkReminders();
})();

})();
