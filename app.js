/* ─────────────────────────────────────────────
   LARAS — app.js
   Frontend logic. Backend tetap di GAS.
───────────────────────────────────────────── */

const GAS    = 'https://script.google.com/macros/s/AKfycbxruxLx-C3foXvpiqfPhblyk-93TqHfL7m0ZAG63ZCvgA5m0T8f5zNf7GeBJTGzUfJ7/exec';
const FOLDER = '1Mdu5NzYBl4-qox9AsMjjdmrYHAZiYcDu';
const COLORS = ['#b5294e','#c9706a','#6b3fa0','#9b6dd4','#1e4fa0','#3a8fd4','#1a9080','#2a8c4a','#7a9e7e','#c48a10','#d4601a','#8c5230','#4a6080','#1090b0','#c030a0','#607060','#906030','#308090'];
const BAGS   = ['umum','kesra','adbang','tapem','ekonomi','hukum','prokopim','organisasi','pbj'];
const BAG_LBL = {
  umum:'Bagian Umum',kesra:'Bagian Kesejahteraan Rakyat',
  adbang:'Bagian Administrasi Pembangunan',tapem:'Bagian Tata Pemerintahan',
  ekonomi:'Bagian Perekonomian',hukum:'Bagian Hukum',
  prokopim:'Bagian Protokol & Komunikasi Pimpinan',
  organisasi:'Bagian Organisasi',pbj:'Bagian Pengadaan Barang & Jasa'
};
const SEP = ' ; ';

let events=[], stafU=[], stafB=[], tab='nama', filt=null, editId=null, calY, calM;
let curUser='', curRole='', curBag='', curNama='';
let selStaf=[], selDisp=[], dd1Open=false, dd2Open=false, pendFiles=[];
let mode='viewonly';
let renderPending=false;

// ── SESSION KEY ──
const SESSION_KEY = 'lr_session';

// ── DARK MODE ──
function initTheme() {
  const saved = localStorage.getItem('lr_theme');
  applyDark(saved === 'dark');
}
function applyDark(on) {
  document.body.classList.toggle('dark', on);
  ['btn-theme-vo','btn-theme-app'].forEach(id => {
    const el = G(id); if (el) el.textContent = on ? '☀️' : '🌙';
  });
}
function toggleTheme() {
  const isDark = document.body.classList.contains('dark');
  applyDark(!isDark);
  localStorage.setItem('lr_theme', isDark ? 'light' : 'dark');
}

// ── UTILS ──
const G    = id => document.getElementById(id);
const toDS = d  => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
const p2   = n  => String(n).padStart(2,'0');
const today    = () => toDS(new Date());
const tomorrow = () => { const t=new Date(); t.setDate(t.getDate()+1); return toDS(t); };
const MONTHS    = 'Januari Februari Maret April Mei Juni Juli Agustus September Oktober November Desember'.split(' ');
const MONTHS_SH = 'Jan Feb Mar Apr Mei Jun Jul Ags Sep Okt Nov Des'.split(' ');

function fmtDate(ds) {
  if (!ds || ds.includes('NaN')) return '-';
  const [y,m,d] = ds.split('-');
  return `${+d} ${MONTHS_SH[+m-1]} ${y}`;
}
function fmtRange(s,e) { return (!e||e===s) ? fmtDate(s) : `${fmtDate(s)} – ${fmtDate(e)}`; }
function fmtTime(t) {
  if (!t) return '';
  const c = String(t).trim();
  return (c.length<=5 && c.includes(':')) ? c.replace(':','.') : '';
}
const esc      = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const initials = n => n.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const fmtSz    = b => b<1024 ? b+'B' : b<1048576 ? (b/1024).toFixed(1)+'KB' : (b/1048576).toFixed(1)+'MB';
const fIco     = t => t.includes('pdf')?'📄':t.includes('word')||t.includes('doc')?'📝':t.includes('sheet')||t.includes('excel')?'📊':t.includes('image')?'🖼️':'📎';

function colorFor(n) {
  let h=0;
  for (let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0;
  return h % COLORS.length;
}
function allStaf()   { return [...stafU, ...stafB]; }
function upcoming(e) {
  const td=today(), ds=e.dateStart||e.date||'', de=e.dateEnd&&e.dateEnd!==ds?e.dateEnd:ds;
  return de >= td;
}

// ── UTILS: normalisasi nama untuk matching ──
function normName(n) {
  return (n||'').toUpperCase().replace(/\s+/g,' ').replace(/\.\s*/g,'.').trim();
}

// ── LOADER ──
function showLdr(msg='Memuat...') { G('ldr-txt').textContent=msg; G('ldr').classList.add('on'); }
function hideLdr()                { G('ldr').classList.remove('on'); }

// ── TOAST ──
function toast(msg) {
  const w=G('toasts'), t=document.createElement('div');
  t.className='toast'; t.textContent=msg; w.appendChild(t);
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),300); }, 2700);
}

// ── CONFIRM ──
let cfmCb = null;
function showCfm(ico,title,msg,ok,cb) {
  G('cfm-ico').textContent=ico; G('cfm-ttl').textContent=title;
  G('cfm-msg').textContent=msg; G('cfm-ok').textContent=ok;
  cfmCb=cb; G('cfm').classList.add('on');
}
function closeCfm() { G('cfm').classList.remove('on'); }

// ── DEBOUNCED RENDER ──
function debouncedRender() {
  if (renderPending) return;
  renderPending=true;
  requestAnimationFrame(()=>{ render(); renderPending=false; });
}

// ── GAS ──
async function gas(payload) {
  try {
    const r = await fetch(GAS, {
      method: 'POST',
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain' }
    });
    return await r.json();
  } catch(e) { return { success:false }; }
}
function saveCache() {
  try {
    localStorage.setItem('lr_ev', JSON.stringify(events));
    localStorage.setItem('lr_su', JSON.stringify(stafU));
    localStorage.setItem('lr_sb', JSON.stringify(stafB));
  } catch(e) {}
}

// ── FILE UPLOAD ──
function onFiles(files) {
  for (const f of files) {
    if (!pendFiles.find(p=>p.name===f.name))
      pendFiles.push({ file:f, name:f.name, size:f.size, type:f.type, driveId:null });
  }
  renderFileList();
  G('f-files').value='';
}
function renderFileList() {
  const el = G('upl-list');
  if (!pendFiles.length) { el.innerHTML=''; return; }
  const frag = document.createDocumentFragment();
  pendFiles.forEach((f,i) => {
    const d = document.createElement('div'); d.className='upl-item';
    d.innerHTML=`<span class="upl-ico">${fIco(f.type)}</span><span class="upl-name">${esc(f.name)}</span><span class="upl-sz">${fmtSz(f.size)}</span><button class="upl-del" data-i="${i}">✕</button>`;
    frag.appendChild(d);
  });
  el.innerHTML=''; el.appendChild(frag);
  el.querySelectorAll('.upl-del').forEach(b => b.onclick=()=>{ pendFiles.splice(+b.dataset.i,1); renderFileList(); });
}
async function uploadFiles() {
  const up = [];
  for (const pf of pendFiles) {
    if (pf.driveId) { up.push({ name:pf.name, driveId:pf.driveId, type:pf.type, size:pf.size }); continue; }
    try {
      const b64 = await new Promise((res,rej) => {
        const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(pf.file);
      });
      const res = await gas({ action:'uploadFile', fileName:pf.name, mimeType:pf.type, base64:b64, folderId:FOLDER });
      if (res.success) { pf.driveId=res.driveId; up.push({ name:pf.name, driveId:res.driveId, type:pf.type, size:pf.size }); }
    } catch(e) { console.error(e); }
  }
  return up;
}

// ── DRAG-DROP ──
function setupDD() {
  const a = G('upload-area');
  a.addEventListener('dragover', e=>{ e.preventDefault(); a.classList.add('drag'); });
  a.addEventListener('dragleave', ()=>a.classList.remove('drag'));
  a.addEventListener('drop', e=>{ e.preventDefault(); a.classList.remove('drag'); onFiles(e.dataTransfer.files); });
}

// ── AUTH ──
function showLogin() { G('vo').style.display='none'; G('login').style.display='flex'; }
function hideLogin() { G('login').style.display='none'; G('vo').style.display='flex'; }

async function doLogin() {
  const user=G('l-user').value.trim(), pass=G('l-pass').value.trim();
  const err=G('l-err'), btn=G('l-btn');
  err.style.display='none';
  if (!user||!pass) { err.textContent='Isi username dan password.'; err.style.display='block'; return; }
  btn.textContent='Memuat...'; btn.disabled=true;
  const res = await gas({ action:'login', username:user, password:pass });
  btn.textContent='Masuk'; btn.disabled=false;
  if (res.success) {
    // ── REVISI: normalisasi role saat login ──
    curUser=res.nama; curRole=(res.role||'viewonly').trim().toLowerCase(); curBag=res.bagian||''; curNama=res.nama||'';
    const sessData = JSON.stringify({ nama:curUser, role:curRole, bagian:curBag, nama_lengkap:curNama });
    try { localStorage.setItem(SESSION_KEY, sessData); } catch(e) {}
    try {
      const exp = new Date(Date.now()+30*24*60*60*1000).toUTCString();
      document.cookie=`${SESSION_KEY}=${encodeURIComponent(sessData)};expires=${exp};path=/;SameSite=Lax`;
    } catch(e) {}
    applyRole();
    G('login').style.display='none'; G('vo').style.display='none'; G('app').style.display='flex';
    mode='loggedin'; tab='nama';
    initApp();
  } else {
    err.textContent=res.message||'Username atau password salah.'; err.style.display='block';
  }
}

function applyRole() {
  // ── REVISI: normalisasi role, hilangkan badge untuk staff ──
  const roleNorm = (curRole||'').trim().toLowerCase();
  const lbl = { owner:'Owner', admin:'Admin', viewonly:'View Only' };
  const badge = (roleNorm==='staff'||!lbl[roleNorm])
    ? '' : `&nbsp;<span class="role-badge ${roleNorm}">${lbl[roleNorm]}</span>`;
  G('user-welcome').innerHTML=`${esc(curUser)}${badge}`;
  if (roleNorm==='owner'||roleNorm==='admin') {
    G('btn-add').classList.remove('hidden');
    G('dtl-edit').classList.remove('hidden');
  }
  if (roleNorm==='owner'||roleNorm==='admin') G('btn-notif').style.display='flex';
  if (roleNorm==='staff'||roleNorm==='viewonly') {
    const stgTab = G('t-stg'); if (stgTab) stgTab.style.display='none';
  }
}

function doLogout() {
  curUser=''; curRole=''; curBag=''; curNama=''; stafU=[]; stafB=[];
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('lr_su');
    localStorage.removeItem('lr_sb');
  } catch(e) {}
  try {
    document.cookie=`${SESSION_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  } catch(e) {}
  G('app').style.display='none';
  G('btn-add').classList.add('hidden');
  G('dtl-edit').classList.add('hidden');
  G('btn-notif').style.display='none';
  const stgTab = G('t-stg'); if (stgTab) stgTab.style.display='';
  mode='viewonly'; tab='nama'; filt=null;
  G('vo').style.display='flex';
  G('l-user').value=''; G('l-pass').value=''; G('l-err').style.display='none';
  ['vo-t-nama','vo-t-kal'].forEach((id,i)=>G(id)&&G(id).classList.toggle('active',i===0));
  render();
}

// ── INIT ──
async function initVO() {
  const n=new Date(); calY=n.getFullYear(); calM=n.getMonth();

  try {
    let saved = localStorage.getItem(SESSION_KEY);
    if (!saved) {
      const match = document.cookie.split(';').map(c=>c.trim())
        .find(c=>c.startsWith(SESSION_KEY+'='));
      if (match) {
        saved = decodeURIComponent(match.split('=').slice(1).join('='));
        try { localStorage.setItem(SESSION_KEY, saved); } catch(e) {}
      }
    }
    if (saved) {
      const sess = JSON.parse(saved);
      curUser=sess.nama||'';
      // ── REVISI: normalisasi role saat restore session ──
      curRole=(sess.role||'viewonly').trim().toLowerCase();
      curBag=sess.bagian||''; curNama=sess.nama_lengkap||sess.nama||'';
      G('login').style.display='none'; G('vo').style.display='none'; G('app').style.display='flex';
      mode='loggedin'; tab='nama';
      applyRole();
      initApp();
      return;
    }
  } catch(e) {}

  mode='viewonly';
  G('login').style.display='none'; G('vo').style.display='flex'; G('app').style.display='none';
  try { const c=localStorage.getItem('lr_ev'); if(c) events=JSON.parse(c); } catch(e) {}
  if (events.length) render(); else showLdr('Memuat agenda...');
  const res = await gas({ action:'getEvents' });
  if (res.success && res.data) events=res.data;
  try { localStorage.setItem('lr_ev', JSON.stringify(events)); } catch(e) {}
  hideLdr(); render();
}

async function initApp() {
  const n=new Date(); calY=n.getFullYear(); calM=n.getMonth();
  try {
    const cE=localStorage.getItem('lr_ev'), cSU=localStorage.getItem('lr_su'), cSB=localStorage.getItem('lr_sb');
    if (cE)  events=JSON.parse(cE);
    if (cSU) stafU=JSON.parse(cSU);
    if (cSB) stafB=JSON.parse(cSB);
  } catch(e) {}
  if (events.length||stafU.length) { render(); toast('Menyinkronkan data...'); }
  else showLdr('Mengambil data...');
  const bags = curRole==='owner' ? BAGS : (curBag?[curBag]:[]);
  const requests = [gas({ action:'getEvents' })];
  if (curRole!=='staff') {
    requests.push(gas({ action:'getStaf', sheet:'staf' }));
    bags.forEach(b=>requests.push(gas({ action:'getStaf', sheet:b })));
  }
  const [evRes, suRes, ...bagRes] = await Promise.all(requests);
  if (evRes.success && evRes.data) events=evRes.data;
  if (suRes && suRes.success && suRes.data) stafU=suRes.data;
  stafB=[];
  bagRes.forEach((r,i)=>{ if(r&&r.success&&r.data) r.data.forEach(x=>{ x._bag=bags[i]; stafB.push(x); }); });
  saveCache(); hideLdr(); render();
  cleanNotifKeys();
  setTimeout(checkNotifs,800);
  setInterval(checkNotifs,120000);
}

// ── TAB ──
function mainEl() { return mode==='loggedin' ? G('app-main') : G('vo-main'); }
function setTab(t) {
  tab=t; filt=null;
  if (mode==='loggedin') {
    ['nama','kalender','settings'].forEach(x=>{
      const el=G('t-'+{nama:'nama',kalender:'kal',settings:'stg'}[x]||'');
      if (el) el.classList.toggle('active',x===t);
    });
  } else {
    ['nama','kalender'].forEach(x=>{
      const el=G('vo-t-'+{nama:'nama',kalender:'kal'}[x]);
      if (el) el.classList.toggle('active',x===t);
    });
  }
  render();
}

function getQ() {
  return ((G('srch')||{}).value||(G('vo-srch')||{}).value||(G('mob-s')||{}).value||'').toLowerCase();
}

function getFiltered(forCal) {
  const q=getQ();
  return events.filter(e=>{
    if (!forCal && !upcoming(e)) return false;
    if (curRole==='staff' && curNama) {
      const names = e.name.split(SEP).map(x=>normName(x));
      if (!names.includes(normName(curNama))) return false;
    }
    const mQ=!q||(e.title+(e.body||'')+(e.name||'')+(e.catatan||'')+(e.disposisi||'')).toLowerCase().includes(q);
    const mF=!filt||e.name.split(SEP).map(x=>x.trim()).includes(filt);
    return mQ && mF;
  }).sort((a,b)=>{
    const da=a.dateStart||a.date||'', db=b.dateStart||b.date||'';
    return da!==db ? (da>db?1:-1) : (a.timeStart||'')>(b.timeStart||'')?1:-1;
  });
}

// ── RENDER MAIN ──
function render() {
  const m=mainEl(); if (!m) return;
  if (tab==='nama') renderNama(m);
  else if (tab==='kalender') renderKal(m);
  else if (tab==='settings' && mode==='loggedin') renderSettings(m);
  if (mode==='loggedin') updateBell();
}

// ── RENDER AGENDA ──
function renderNama(el) {
  const f=getFiltered(false);
  const nameSet=new Set();

  // ── REVISI: untuk staff, nameSet cukup isi nama sendiri saja ──
  if (curRole==='staff' && curNama) {
    nameSet.add(curNama);
  } else {
    events.filter(upcoming).forEach(e=>{
      e.name.split(SEP).map(x=>x.trim()).forEach(n=>nameSet.add(n));
    });
  }

  let html=`<div class="mob-srch"><input type="text" id="mob-s" placeholder="🔍  Cari agenda..." oninput="debouncedRender()"></div>`;
  html+=`<div class="fbar"><span class="fbar-lbl">Filter</span>`;
  nameSet.forEach(n=>{ html+=`<span class="chip${filt===n?' active':''}" data-fn="${esc(n)}">${esc(n)}</span>`; });
  html+=`</div>`;

  if (!f.length) {
    el.innerHTML=html+`<div style="flex:1;overflow-y:auto;padding:16px 14px"><div class="empty"><div class="empty-ico">🌸</div><div class="empty-t">Tidak ada agenda mendatang</div><div class="empty-s">Semua jadwal sudah selesai. Lihat di Kalender untuk riwayat penjadwalan.</div></div></div>`;
    el.querySelector('.fbar').addEventListener('click',e=>{ const n=e.target.dataset.fn; if(n) toggleFilter(n); });
    return;
  }

  const g={};
  f.forEach(e=>e.name.split(SEP).map(n=>n.trim()).forEach(n=>{ (g[n]=g[n]||[]).push(e); }));

  const frag=document.createDocumentFragment();
  const board=document.createElement('div'); board.className='board';

  Object.keys(g).sort().forEach(n=>{
    const ghdr=document.createElement('div'); ghdr.className='g-hdr';
    ghdr.innerHTML=`<div class="g-hdr-line"></div><div class="g-hdr-name">${esc(n)}</div><span class="g-hdr-cnt">${g[n].length} agenda</span>`;
    board.appendChild(ghdr);
    const cards=document.createElement('div'); cards.className='g-cards';
    g[n].forEach(e=>{ const card=document.createElement('div'); card.innerHTML=noteCardHTML(e); cards.appendChild(card.firstElementChild); });
    board.appendChild(cards);
  });
  frag.appendChild(board);
  el.innerHTML=html; el.appendChild(frag);

  board.addEventListener('click',e=>{
    const note=e.target.closest('.note[data-id]'); if (!note) return;
    const id=note.dataset.id;
    const editBtn=e.target.closest('[data-act="edit"]');
    const delBtn =e.target.closest('[data-act="del"]');
    if (editBtn) { e.stopPropagation(); openModal(id); return; }
    if (delBtn)  { e.stopPropagation(); confirmDelEv(id); return; }
    openDetail(id);
  });
  let taps=0, tapT=null;
  board.addEventListener('touchstart',e=>{
    const note=e.target.closest('.note[data-id]'); if (!note) return;
    taps++; if (taps===1) tapT=setTimeout(()=>taps=0,300);
    if (taps===2) { clearTimeout(tapT); taps=0; openDetail(note.dataset.id); }
  });
  el.querySelector('.fbar').addEventListener('click',e=>{ const n=e.target.dataset.fn; if(n) toggleFilter(n); });
}

// ── NOTE CARD HTML ──
function noteCardHTML(e) {
  const names=e.name.split(SEP).map(n=>n.trim()), fp=names[0], ci=colorFor(fp);
  const td=today(), tm=tomorrow(), ds=e.dateStart||e.date||'', de=e.dateEnd&&e.dateEnd!==ds?e.dateEnd:'';
  const rb=ds===td?`<span class="note-rib today">Hari ini</span>`:ds===tm?`<span class="note-rib tmrw">Besok</span>`:'';
  const kh=e.kehadiran||'';
  const khBadge=kh==='Hadir'?`<div class="note-kh hadir">✅ Hadir</div>`:kh==='Menugaskan'?`<div class="note-kh menugaskan">📋 Menugaskan</div>`:kh==='Mewakili'?`<div class="note-kh mewakili">🔁 Mewakili</div>`:'';
  let disp='';
  if ((kh==='Menugaskan'||kh==='Mewakili') && e.disposisi) {
    const dn=e.disposisi.split(SEP).map(x=>x.trim()).filter(Boolean);
    if (dn.length) disp=`<div class="note-disp"><div class="note-disp-lbl">${kh==='Menugaskan'?'Ditugaskan kepada:':'Diwakili oleh:'}</div><div class="note-disp-names">${dn.map(n=>`<span class="note-disp-chip">${esc(n)}</span>`).join('')}</div></div>`;
  }
  const cat=e.catatan?`<div class="note-cat">💬 ${esc(e.catatan)}</div>`:'';
  const atts=e.attachments ? tryParse(e.attachments) : [];
  const attLine=atts.length?`<div class="note-att">📎 ${atts.length} lampiran</div>`:'';
  const jam=e.timeStart?`<div class="note-time">🕐 ${fmtTime(e.timeStart)}${e.timeEnd?' – '+fmtTime(e.timeEnd):' s.d. selesai'}</div>`:'';
  const body=e.body?`<div class="note-body">${esc(e.body)}</div>`:'';
  const canEdit=(curRole==='owner'||curRole==='admin') && mode==='loggedin';
  const foot=canEdit?`<div class="note-foot"><div class="note-acts"><button data-act="edit">✏️</button><button data-act="del">🗑️</button></div></div>`:'';
  return `<div class="note" data-c="${ci}" data-id="${e.id}">${rb}<div class="note-staf">${esc(names.join(' · '))}</div><div class="note-title">${esc(e.title)}</div><div class="note-date">📅 ${fmtRange(ds,de)}</div>${jam}${khBadge}${disp}${body}${cat}${attLine}${foot}</div>`;
}

function tryParse(s) { try { return JSON.parse(s); } catch(e) { return []; } }
function toggleFilter(n) { filt=filt===n?null:n; render(); }

// ── CALENDAR ──
function renderKal(el) {
  const f=getFiltered(true);
  const td=today();
  let js=new Date(calY,calM,1).getDay(), fd=js===0?6:js-1;
  const dim=new Date(calY,calM+1,0).getDate(), dipm=new Date(calY,calM,0).getDate();
  const total=Math.ceil((fd+dim)/7)*7;
  const isMob=window.innerWidth<768;

  const dayMap={};
  f.forEach(e=>{
    const s=e.dateStart||e.date||'', en=e.dateEnd&&e.dateEnd!==s?e.dateEnd:s;
    let cur=new Date(s+'T00:00:00'); const end=new Date(en+'T00:00:00');
    while (cur<=end) { const key=toDS(cur); (dayMap[key]=dayMap[key]||[]).push(e); cur.setDate(cur.getDate()+1); }
  });

  const frag=document.createDocumentFragment();
  const wrap=document.createElement('div'); wrap.className='cal-wrap';

  const hdr=document.createElement('div'); hdr.className='cal-hdr';
  hdr.innerHTML=`<button class="cal-nav" id="cal-p">‹</button><h2>${MONTHS[calM]} ${calY}</h2><button class="cal-nav" id="cal-n">›</button>`;
  wrap.appendChild(hdr);

  const grid=document.createElement('div'); grid.className='cal-grid';
  'Sen Sel Rab Kam Jum Sab Min'.split(' ').forEach(d=>{
    const lbl=document.createElement('div'); lbl.className='cal-dlbl'; lbl.textContent=d; grid.appendChild(lbl);
  });

  for (let i=0;i<total;i++) {
    let ds='', num='', oth=false;
    if (i<fd) { const d=dipm-fd+i+1, m=calM===0?12:calM, y=calM===0?calY-1:calY; ds=`${y}-${p2(m)}-${p2(d)}`; num=d; oth=true; }
    else if (i<fd+dim) { const d=i-fd+1; ds=`${calY}-${p2(calM+1)}-${p2(d)}`; num=d; }
    else { const d=i-(fd+dim)+1, m=calM===11?1:calM+2, y=calM===11?calY+1:calY; ds=`${y}-${p2(m)}-${p2(d)}`; num=d; oth=true; }

    const cell=document.createElement('div');
    cell.className='cal-cell'+(oth?' other':'')+(ds===td?' today-c':'')+((!oth&&ds<td)?' past':'');
    const dnum=document.createElement('div'); dnum.className='cal-dnum'; dnum.textContent=num; cell.appendChild(dnum);

    (dayMap[ds]||[]).forEach(e=>{
      const names=e.name.split(SEP).map(n=>n.trim()), fp=names[0], ci=colorFor(fp);
      const ex=names.length>1?` +${names.length-1}`:'';
      const dn=isMob&&fp.length>8?fp.substring(0,8)+'…':fp;
      const ev=document.createElement('div'); ev.className='cal-ev'; ev.dataset.c=ci; ev.dataset.id=e.id; ev.title=fp; ev.textContent=dn+ex;
      cell.appendChild(ev);
    });
    grid.appendChild(cell);
  }
  wrap.appendChild(grid); frag.appendChild(wrap);
  el.innerHTML=''; el.appendChild(frag);

  G('cal-p').onclick=()=>navCal(-1);
  G('cal-n').onclick=()=>navCal(1);
  grid.addEventListener('click',e=>{ const ev=e.target.closest('.cal-ev[data-id]'); if(ev) openDetail(ev.dataset.id); });
}

function navCal(d) { calM+=d; if(calM<0){calM=11;calY--;} if(calM>11){calM=0;calY++;} render(); }

// ── SETTINGS ──
function renderSettings(el) {
  const frag=document.createDocumentFragment();
  const wrap=document.createElement('div'); wrap.className='stg-wrap';

  let h=`<div class="stg-sec-title">Staf &amp; Pejabat (Universal)</div><div class="staf-list">`;
  if (!stafU.length) h+=`<div style="font-size:var(--fs-sm);color:var(--text-soft);padding:10px 0">Belum ada data.</div>`;
  stafU.forEach(s=>{ h+=stafRow(s,COLORS[colorFor(s.nama)],curRole!=='viewonly'); });
  h+=`</div>`;

  if (curRole==='owner') {
    const grp={};
    stafB.forEach(s=>{ (grp[s._bag]=grp[s._bag]||[]).push(s); });
    BAGS.forEach(sheet=>{ if(grp[sheet]?.length){ h+=`<div class="stg-bag-title">🏛 ${BAG_LBL[sheet]||sheet}</div><div class="staf-list">`; grp[sheet].forEach(s=>{ h+=stafRow(s,COLORS[colorFor(s.nama)],true); }); h+=`</div>`; } });
  } else if (curBag && stafB.length) {
    h+=`<div class="stg-bag-title">🏛 ${BAG_LBL[curBag]||curBag}</div><div class="staf-list">`;
    stafB.forEach(s=>{ h+=stafRow(s,COLORS[colorFor(s.nama)],curRole==='admin'); }); h+=`</div>`;
  }

  if (curRole!=='viewonly') {
    h+=`<div class="stg-sec-title" style="margin-top:8px">Tambah Staf / Pejabat</div>`;
    if (curRole==='owner') h+=`<div style="margin-bottom:10px"><select id="ns-sheet" style="width:100%;background:var(--cream);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:11px 14px;font-size:var(--fs-base);font-family:'Inter',sans-serif;color:var(--text);outline:none"><option value="staf">Staf Universal</option>${BAGS.map(b=>`<option value="${b}">${BAG_LBL[b]}</option>`).join('')}</select></div>`;
    h+=`<div class="add-staf-row"><input type="text" id="ns-nm" placeholder="Nama lengkap"><input type="text" id="ns-jbt" placeholder="Jabatan"><button id="btn-add-staf">＋ Tambah</button></div>`;
  }

  wrap.innerHTML=h; frag.appendChild(wrap);
  el.innerHTML=''; el.appendChild(frag);

  el.querySelectorAll('.staf-del').forEach(btn=>{ btn.onclick=()=>confirmDelStaf(btn.dataset.id,btn.dataset.nm,btn.dataset.sh); });
  const addBtn=G('btn-add-staf'); if(addBtn) addBtn.onclick=addStaf;
}

function stafRow(s,hex,canDel) {
  return `<div class="staf-item"><div class="staf-av" style="background:${hex}">${initials(s.nama)}</div><div style="flex:1;min-width:0"><div class="staf-nm">${esc(s.nama)}</div><div class="staf-jbt">${esc(s.jabatan||'')}</div></div>${canDel?`<button class="staf-del" data-id="${esc(s.id)}" data-nm="${esc(s.nama)}" data-sh="${esc(s._sheet||s._bag||'staf')}">✕</button>`:''}</div>`;
}

// ── DETAIL POPUP ──
function openDetail(id) {
  const e=events.find(x=>x.id===id); if (!e) return;
  const names=e.name.split(SEP).map(n=>n.trim()), fp=names[0], ci=colorFor(fp), kh=e.kehadiran||'';
  const ds=e.dateStart||e.date||'', de=e.dateEnd&&e.dateEnd!==ds?e.dateEnd:'';
  G('dtl-bar').style.background=COLORS[ci];
  G('dtl-staf').textContent=names.join(' · ');
  G('dtl-name').textContent=e.title;
  G('dtl-tgl').textContent=fmtRange(ds,de);
  if (e.timeStart) { G('dtl-jam-row').style.display='flex'; G('dtl-jam').textContent=fmtTime(e.timeStart)+(e.timeEnd?' – '+fmtTime(e.timeEnd):' s.d. selesai'); }
  else G('dtl-jam-row').style.display='none';
  if (e.body) { G('dtl-ket-row').style.display='flex'; G('dtl-ket').textContent=e.body; }
  else G('dtl-ket-row').style.display='none';
  G('dtl-kh-row').innerHTML=kh==='Hadir'?`<span class="kh-badge hadir">✅ Hadir</span>`:kh==='Menugaskan'?`<span class="kh-badge menugaskan">📋 Menugaskan</span>`:kh==='Mewakili'?`<span class="kh-badge mewakili">🔁 Mewakili</span>`:'';
  if (e.catatan) { G('dtl-cat-row').style.display='block'; G('dtl-cat').textContent=e.catatan; }
  else G('dtl-cat-row').style.display='none';
  if ((kh==='Menugaskan'||kh==='Mewakili') && e.disposisi) {
    const dn=e.disposisi.split(SEP).map(x=>x.trim()).filter(Boolean);
    G('dtl-disp-row').style.display='block';
    G('dtl-disp-lbl').textContent=kh==='Menugaskan'?'Ditugaskan kepada:':'Diwakili oleh:';
    G('dtl-disp-names').innerHTML=dn.map(n=>`<span class="disp-chip">${esc(n)}</span>`).join('');
  } else G('dtl-disp-row').style.display='none';
  const atts=e.attachments ? tryParse(e.attachments) : [];
  if (atts.length) {
    G('dtl-att-sec').style.display='block';
    G('dtl-att-list').innerHTML=atts.map(a=>`<a class="dtl-att" href="https://drive.google.com/file/d/${a.driveId}/view" target="_blank" rel="noopener"><span style="font-size:16px">${fIco(a.type||'')}</span><span class="dtl-att-name">${esc(a.name)}</span><span class="dtl-att-sz">${a.size?fmtSz(a.size):''}</span></a>`).join('');
  } else G('dtl-att-sec').style.display='none';
  if (mode==='loggedin' && (curRole==='owner'||curRole==='admin')) {
    G('dtl-edit').classList.remove('hidden');
    G('dtl-edit').onclick=()=>{ closeDtl(); openModal(id); };
  } else G('dtl-edit').classList.add('hidden');
  G('dtl').classList.add('on');
}
function closeDtl() { G('dtl').classList.remove('on'); }

// ── DROPDOWN ──
function buildDDList(listEl,srchEl,sel,onToggle) {
  const q=(srchEl.value||'').toLowerCase();
  const frag=document.createDocumentFragment();
  let hasItems=false;
  allStaf().filter(s=>s.nama.toLowerCase().includes(q)||s.jabatan.toLowerCase().includes(q)).forEach(s=>{
    hasItems=true;
    const d=document.createElement('div'); d.className='dd-item'+(sel.includes(s.nama)?' sel':''); d.dataset.nama=s.nama;
    d.innerHTML=`<div class="dd-chk">${sel.includes(s.nama)?'✓':''}</div><div><div class="dd-item-nm">${esc(s.nama)}</div><div class="dd-item-jbt">${esc(s.jabatan||'')}</div></div>`;
    d.onclick=ev=>{ ev.stopPropagation(); onToggle(s.nama); buildDDList(listEl,srchEl,sel,onToggle); };
    frag.appendChild(d);
  });
  if (!hasItems) { const d=document.createElement('div'); d.className='dd-empty'; d.textContent='Tidak ditemukan'; frag.appendChild(d); }
  listEl.innerHTML=''; listEl.appendChild(frag);
}
function updateDDTxt(txtEl,sel) {
  if (sel.length) { txtEl.textContent=sel.join(',\n'); txtEl.classList.remove('ph'); }
  else { txtEl.textContent='Pilih nama...'; txtEl.classList.add('ph'); }
}
function openDD(panelEl,trigEl,srchEl,listEl,sel,onToggle) {
  panelEl.classList.add('open'); trigEl.classList.add('open');
  srchEl.value=''; buildDDList(listEl,srchEl,sel,onToggle); setTimeout(()=>srchEl.focus(),50);
}
function closeDD(panelEl,trigEl) { panelEl.classList.remove('open'); trigEl.classList.remove('open'); }
function ddToggle(arr,nm,txtEl) { const i=arr.indexOf(nm); i>=0?arr.splice(i,1):arr.push(nm); updateDDTxt(txtEl,arr); }

// ── MODAL ──
function openModal(id) {
  if (curRole==='viewonly'||mode!=='loggedin') return;
  editId=id||null; const e=id?events.find(x=>x.id===id):null;
  selStaf=e?e.name.split(SEP).map(n=>n.trim()):[];
  selDisp=e&&e.disposisi?e.disposisi.split(SEP).map(n=>n.trim()):[];
  pendFiles=e&&e.attachments?tryParse(e.attachments).map(a=>({name:a.name,size:a.size,type:a.type||'',driveId:a.driveId,file:null})):[];
  updateDDTxt(G('dd1-txt'),selStaf); updateDDTxt(G('dd2-txt'),selDisp);
  closeDD(G('dd1-panel'),G('dd1-trig')); closeDD(G('dd2-panel'),G('dd2-trig'));
  dd1Open=false; dd2Open=false; renderFileList();
  if (e) {
    G('f-title').value=e.title||''; G('f-body').value=e.body||'';
    G('f-ds').value=e.dateStart||e.date||today(); G('f-de').value=(e.dateEnd&&e.dateEnd!==e.dateStart)?e.dateEnd:'';
    G('f-ts').value=e.timeStart||''; G('f-te').value=e.timeEnd||'';
    G('f-cat').value=e.catatan||'';
    const kh=e.kehadiran||'Hadir'; document.querySelectorAll('input[name="kh"]').forEach(r=>{ r.checked=r.value===kh; });
    toggleExtra(kh); G('modal-title').textContent='Edit Agenda';
  } else {
    G('f-title').value=''; G('f-body').value=''; G('f-ds').value=today(); G('f-de').value='';
    G('f-ts').value=''; G('f-te').value=''; G('f-cat').value='';
    G('r-hadir').checked=true; toggleExtra('Hadir'); G('modal-title').textContent='Tambah Agenda';
  }
  G('modal').classList.add('on');
}
function closeModal() {
  G('modal').classList.remove('on');
  closeDD(G('dd1-panel'),G('dd1-trig')); closeDD(G('dd2-panel'),G('dd2-trig'));
  dd1Open=false; dd2Open=false; pendFiles=[]; renderFileList();
}
function toggleExtra(v) { G('extra-flds').classList.toggle('show',v==='Menugaskan'||v==='Mewakili'); }
function getKH() { const r=document.querySelector('input[name="kh"]:checked'); return r?r.value:'Hadir'; }

async function saveEvent() {
  if (curRole==='viewonly'||mode!=='loggedin') return;
  const name=selStaf.join(SEP), title=G('f-title').value.trim();
  if (!selStaf.length) { showCfm('⚠️','Perhatian','Pilih minimal satu nama staf.','Oke',null); return; }
  if (!title) { showCfm('⚠️','Perhatian','Judul agenda wajib diisi.','Oke',null); return; }
  const kh=getKH(), ds=G('f-ds').value||today(), de=G('f-de').value||ds;
  showLdr('Menyimpan...');
  let attachments=[];
  if (pendFiles.length) { showLdr('Mengunggah lampiran...'); attachments=await uploadFiles(); }
  hideLdr();
  const ev={id:editId||'EVT'+Date.now(),name,title,body:G('f-body').value.trim(),dateStart:ds,dateEnd:de,date:ds,timeStart:G('f-ts').value,timeEnd:G('f-te').value,colorIdx:colorFor(selStaf[0]),kehadiran:kh,catatan:kh!=='Hadir'?G('f-cat').value.trim():'',disposisi:kh!=='Hadir'?selDisp.join(SEP):'',attachments:JSON.stringify(attachments)};
  closeModal();
  if (editId) { const i=events.findIndex(x=>x.id===editId); if(i>=0) events[i]=ev; }
  else events.push(ev);
  saveCache(); render(); checkNotifs(); toast('Menyimpan agenda...');
  gas({ action:editId?'editEvent':'addEvent', event:ev }).then(res=>toast(res.success?'Agenda berhasil disimpan!':'Gagal menyimpan ke server.'));
}

function confirmDelEv(id) { showCfm('🗑️','Hapus Agenda','Yakin ingin menghapus agenda ini?','Ya, Hapus',()=>deleteEvent(id)); }
function deleteEvent(id) {
  events=events.filter(e=>e.id!==id); saveCache(); render(); checkNotifs();
  gas({ action:'deleteEvent', id }).then(res=>toast(res.success?'Agenda dihapus.':'Gagal menghapus.'));
}

function addStaf() {
  const nm=(G('ns-nm').value||'').trim(), jbt=(G('ns-jbt').value||'').trim();
  if (!nm) { showCfm('⚠️','Perhatian','Nama staf wajib diisi.','Oke',null); return; }
  const sheet=G('ns-sheet')?G('ns-sheet').value:(curBag||'staf');
  const s={id:'S'+Date.now(),nama:nm,jabatan:jbt,_bag:sheet==='staf'?undefined:sheet,_sheet:sheet};
  if (sheet==='staf') stafU.push(s); else stafB.push(s);
  G('ns-nm').value=''; G('ns-jbt').value='';
  saveCache(); render(); toast('Menambahkan staf...');
  gas({ action:'addStaf', staf:{id:s.id,nama:nm,jabatan:jbt}, sheet }).then(res=>toast(res.success?'Staf ditambahkan!':'Gagal menyimpan staf.'));
}
function confirmDelStaf(id,nm,sheet) { showCfm('⚠️','Hapus Staf',`Hapus "${nm}" dari daftar?`,'Ya, Hapus',()=>deleteStaf(id,sheet)); }
function deleteStaf(id,sheet) {
  if (!sheet||sheet==='staf') stafU=stafU.filter(s=>s.id!==id); else stafB=stafB.filter(s=>s.id!==id);
  saveCache(); render();
  gas({ action:'deleteStaf', id, sheet:sheet||'staf' }).then(res=>toast(res.success?'Staf dihapus.':'Gagal menghapus staf.'));
}

// ── NOTIF H-1 ──
function nKey() { return 'lr_notif_'+today(); }
function getShown() { try { return new Set(JSON.parse(localStorage.getItem(nKey())||'[]')); } catch(e) { return new Set(); } }
function markShown(cid) { try { const s=getShown(); s.add(cid); localStorage.setItem(nKey(),JSON.stringify([...s])); } catch(e) {} }
function cleanNotifKeys() {
  const td=today(), yd=tomorrow();
  Object.keys(localStorage).filter(k=>k.startsWith('lr_notif_')).forEach(k=>{ const d=k.replace('lr_notif_',''); if(d!==td&&d!==yd) localStorage.removeItem(k); });
}

function checkNotifs() {
  if (mode!=='loggedin') return;
  if (curRole!=='owner'&&curRole!=='admin') return;
  const tm=tomorrow(), wrap=G('notif-wrap');
  wrap.innerHTML='';
  const shown=getShown(); let count=0;
  const g={};
  events.filter(e=>{ const s=e.dateStart||e.date||'', en=e.dateEnd&&e.dateEnd!==s?e.dateEnd:s; return tm>=s&&tm<=en; })
    .sort((a,b)=>(a.timeStart||'').localeCompare(b.timeStart||''))
    .forEach(e=>e.name.split(SEP).map(n=>n.trim()).forEach(n=>{ (g[n]=g[n]||[]).push(e); }));

  const frag=document.createDocumentFragment();
  Object.keys(g).forEach(nm=>{
    g[nm].forEach(ev=>{
      const cid='tmr_'+ev.id; if (shown.has(cid)) return;
      count++;
      const div=document.createElement('div'); div.className='notif tmrw';
      div.innerHTML=`<div class="notif-top"><span class="notif-lbl tmrw">BESOK — H-1</span><button class="notif-close" data-cid="${cid}">✕</button></div><div class="notif-title">👤 ${esc(nm)}</div><div class="notif-item"><div class="notif-it-t">${esc(ev.title)}</div><div class="notif-it-tm">🕐 ${fmtTime(ev.timeStart)||'Sepanjang hari'}${ev.timeEnd?' – '+fmtTime(ev.timeEnd):''}</div></div>`;
      frag.appendChild(div);
    });
  });
  wrap.appendChild(frag);
  wrap.querySelectorAll('.notif-close').forEach(btn=>{
    btn.onclick=()=>{ markShown(btn.dataset.cid); btn.closest('.notif').remove(); updateBell(wrap.querySelectorAll('.notif').length); };
  });
  updateBell(count);
}

function updateBell(n) {
  const bc=G('bell-cnt');
  if (bc) bc.innerHTML=n>0?`<span class="bell-badge">${n}</span>`:'';
}

// ── BOOT ──
document.addEventListener('DOMContentLoaded',()=>{
  G('cfm-ok').onclick=()=>{ const cb=cfmCb; closeCfm(); if(cb) cb(); };
  G('cfm-cancel').onclick=closeCfm;

  G('l-btn').onclick=doLogin;
  ['l-user','l-pass'].forEach(id=>G(id).addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); }));
  G('l-back').onclick=hideLogin;
  G('btn-show-login').onclick=showLogin;
  G('btn-logout').onclick=()=>showCfm('🚪','Keluar dari LARAS','Yakin ingin logout?','Ya, Keluar',doLogout);
  G('btn-notif').onclick=checkNotifs;
  G('btn-add').onclick=()=>openModal();
  G('modal-cancel').onclick=closeModal;
  G('modal-save').onclick=saveEvent;
  G('modal').onclick=e=>{ if(e.target===G('modal')) closeModal(); };
  G('dtl').onclick=e=>{ if(e.target===G('dtl')) closeDtl(); };
  G('dtl-close').onclick=closeDtl;
  document.querySelectorAll('input[name="kh"]').forEach(r=>{ r.onchange=()=>toggleExtra(r.value); });

  G('dd1-trig').onclick=e=>{ e.stopPropagation(); if(dd1Open){closeDD(G('dd1-panel'),G('dd1-trig'));dd1Open=false;}else{openDD(G('dd1-panel'),G('dd1-trig'),G('dd1-srch'),G('dd1-list'),selStaf,nm=>ddToggle(selStaf,nm,G('dd1-txt')));dd1Open=true;} };
  G('dd1-srch').oninput=()=>buildDDList(G('dd1-list'),G('dd1-srch'),selStaf,nm=>ddToggle(selStaf,nm,G('dd1-txt')));
  G('dd1-srch').onclick=e=>e.stopPropagation();

  G('dd2-trig').onclick=e=>{ e.stopPropagation(); if(dd2Open){closeDD(G('dd2-panel'),G('dd2-trig'));dd2Open=false;}else{openDD(G('dd2-panel'),G('dd2-trig'),G('dd2-srch'),G('dd2-list'),selDisp,nm=>ddToggle(selDisp,nm,G('dd2-txt')));dd2Open=true;} };
  G('dd2-srch').oninput=()=>buildDDList(G('dd2-list'),G('dd2-srch'),selDisp,nm=>ddToggle(selDisp,nm,G('dd2-txt')));
  G('dd2-srch').onclick=e=>e.stopPropagation();

  document.onclick=e=>{
    if (dd1Open&&!G('dd1-wrap').contains(e.target)) { closeDD(G('dd1-panel'),G('dd1-trig')); dd1Open=false; }
    if (dd2Open&&!G('dd2-wrap').contains(e.target)) { closeDD(G('dd2-panel'),G('dd2-trig')); dd2Open=false; }
  };

  G('f-ds').addEventListener('change',()=>{
    const s=G('f-ds').value; G('f-de').min=s;
    if (G('f-de').value&&G('f-de').value<s) G('f-de').value=s;
  });

  setupDD();

  let resizeTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    if (tab==='kalender') resizeTimer=setTimeout(()=>render(),200);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update();
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            newSW.postMessage('skipWaiting');
          }
        });
      });
    }).catch(err => console.warn('SW registration failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) { refreshing = true; window.location.reload(); }
    });
  }

  initTheme();
  ['btn-theme-vo','btn-theme-app'].forEach(id => {
    const el = G(id); if (el) el.onclick = toggleTheme;
  });

  initVO();
});
