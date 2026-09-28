// Fase 3 · Dashboard del entrenador (protegido por Firebase Auth + rol).
import { FIREBASE_ENABLED, fb } from './firebase.js?v=51';
import { EQUIPMENT_DETAIL } from './exercises.js?v=51';

const $ = s => document.querySelector(s);
let M = null, meUid = null, currentClient = null;

const show = (id, on=true) => { const el = $(id); if(el) el.hidden = !on; };
const hideAll = () => ['#td-auth','#td-gate','#td-dash'].forEach(i => show(i, false));
const todayKey = () => new Date().toLocaleDateString('sv-SE');

async function boot(){
  if(!FIREBASE_ENABLED){ hideAll(); show('#td-disabled'); return; }
  M = await fb();
  M.onAuthStateChanged(M.auth, async user => {
    hideAll();
    if(!user){ show('#td-auth'); return; }
    meUid = user.uid;
    $('#td-me').textContent = user.email || '';
    let prof = null;
    try{ const s = await M.getDoc(M.doc(M.db, 'users', user.uid)); prof = s.exists() ? s.data() : null; }catch{}
    const isAdmin = prof && prof.role === 'admin';
    if(!prof || (prof.role !== 'trainer' && !isAdmin)){
      $('#td-gate-title').textContent = 'Acceso solo para entrenadores';
      $('#td-gate-msg').textContent = 'Esta cuenta no tiene rol de entrenador.';
      show('#td-gate'); $('#td-logout').hidden = false; return;
    }
    if(!isAdmin && prof.isApproved !== true){
      $('#td-gate-title').textContent = 'Cuenta pendiente de aprobación';
      $('#td-gate-msg').textContent = 'Un administrador debe autorizar tu cuenta de entrenador antes de acceder.';
      show('#td-gate'); $('#td-logout').hidden = false; return;
    }
    if(isAdmin){ const a=$('#td-admin-link'); if(a) a.hidden=false; }
    show('#td-dash'); $('#td-logout').hidden = false;
    loadClients();
  });
}

async function loadClients(){
  const box = $('#td-list');
  try{
    const q = M.query(M.collection(M.db, 'users'),
      M.where('role', '==', 'client'), M.where('trainerId', '==', meUid));
    const snap = await M.getDocs(q);
    if(snap.empty){ box.innerHTML = '<p class="muted small">Aún no tienes clientes asignados.</p>'; return; }
    box.innerHTML = '';
    snap.forEach(d => {
      const u = d.data();
      const b = document.createElement('button');
      b.className = 'td-client'; b.dataset.id = d.id;
      b.innerHTML = `<b>${u.name || '(sin nombre)'}</b><br><span class="muted small">${u.email||''}</span>`;
      b.onclick = () => { document.querySelectorAll('.td-client').forEach(x=>x.classList.remove('on')); b.classList.add('on'); openClient(d.id, u); };
      box.appendChild(b);
    });
  }catch(err){ box.innerHTML = `<p class="muted small">${err.message}</p>`; }
}

function tags(arr){ return (arr&&arr.length) ? `<div class="td-tags">${arr.map(x=>`<span>${x}</span>`).join('')}</div>` : '<span class="muted small">—</span>'; }

async function openClient(clientId, u){
  currentClient = clientId;
  const box = $('#td-dossier');
  box.innerHTML = '<p class="muted">Cargando expediente…</p>';
  show('#td-builder'); $('#td-plan-date').value = todayKey();
  try{
    const s = await M.getDoc(M.doc(M.db, 'clients_dossier', clientId));
    if(!s.exists()){ box.innerHTML = `<h2>${u.name||''}</h2><p class="muted">El cliente aún no ha completado su cuestionario.</p>`; return; }
    const d = s.data(), f = d.fisico||{}, h = d.habitos||{}, e = d.estiloVida||{}, p = d.psicologia||{};
    const w = Object.entries(f.weights||{}).map(([k,v])=>`${k}: ${v}`).join(' · ') || '—';
    box.innerHTML = `
      <h2>${u.name||''} <span class="muted small">${u.email||''}</span></h2>
      <h3>Físico y deportivo</h3>
      <p class="td-field"><b>Equipo:</b></p>${tags(f.equipment)}
      <p class="td-field"><b>Pesos:</b> ${w}</p>
      <p class="td-field"><b>Deportes:</b></p>${tags(f.sports)}
      <p class="td-field"><b>Lesiones:</b></p>${tags(f.injuries)}
      <h3>Hábitos</h3>
      <p class="td-field"><b>Alimentación:</b> ${h.diet||'—'}</p>
      <p class="td-field"><b>Sueño:</b> ${h.sleepHours??'—'} h · <b>Estrés:</b> ${h.stress||'—'}</p>
      <h3>Estilo de vida</h3>
      <p class="td-field"><b>Trabajo:</b> ${e.workRoutine||'—'} · <b>Horas/sem:</b> ${e.hoursAvailable??'—'}</p>
      <h3>Psicología</h3>
      <p class="td-field"><b>Motivación:</b> ${p.motivation||'—'}${p.motivationText?` — ${p.motivationText}`:''}</p>
      <p class="td-field"><b>Barreras:</b> ${p.barriers||'—'}</p>`;
  }catch(err){ box.innerHTML = `<p class="muted small">${err.message}</p>`; }
}

// ---- Constructor / envío de plan ----
$('#td-plan-upload').onclick = () => $('#td-plan-file').click();
$('#td-plan-file').onchange = async ev => {
  const file = ev.target.files[0]; if(!file) return;
  $('#td-plan-json').value = await file.text();
};
$('#td-plan-send').onclick = async () => {
  const msg = $('#td-plan-msg');
  if(!currentClient){ msg.textContent = 'Selecciona un cliente primero.'; return; }
  let steps;
  try{ steps = JSON.parse($('#td-plan-json').value); if(!Array.isArray(steps)) throw new Error('El JSON debe ser un array de pasos.'); }
  catch(err){ msg.textContent = 'JSON inválido: ' + err.message; return; }
  const date = $('#td-plan-date').value || todayKey();
  const plan = {
    planId: date, date, trainerId: meUid, clientId: currentClient,
    title: $('#td-plan-title').value.trim() || 'Plan del entrenador',
    goal: 'fuerza', steps, createdAt: Date.now(),
  };
  msg.textContent = 'Enviando…';
  try{
    await M.setDoc(M.doc(M.db, 'clients_dossier', currentClient, 'assigned_plans', date), plan);
    msg.textContent = `✅ Plan enviado para ${date}.`;
  }catch(err){ msg.textContent = err.message; }
};

$('#td-login').onclick = async () => {
  const msg = $('#td-auth-msg'); msg.textContent = 'Entrando…';
  try{ await M.signInWithEmailAndPassword(M.auth, $('#td-email').value.trim(), $('#td-pass').value); msg.textContent=''; }
  catch(err){ msg.textContent = err.message; }
};
const logout = () => M.signOut(M.auth);
$('#td-logout').onclick = logout; $('#td-gate-logout').onclick = logout;

// ---- Alta de cliente (cuenta + anamnesis) sin perder la sesión del coach ----
const NC_EQUIP = () => EQUIPMENT_DETAIL.filter(e => e.id!=='bodyweight' && e.id!=='yoga_mat');
function renderNcEquip(){
  const box = $('#nc-equip'); if(!box) return;
  box.innerHTML = NC_EQUIP().map(it=>{
    const w = it.weight ? `<input class="pf-w" data-w="${it.id}" type="text" placeholder="${it.wl||'peso'}" hidden />` : '';
    return `<div class="equip-row"><button type="button" class="chip-check" data-k="${it.id}"><span>${it.ic}</span>${it.label}</button>${w}</div>`;
  }).join('');
  box.querySelectorAll('.chip-check').forEach(b=>b.onclick=()=>{ b.classList.toggle('on');
    const wi=box.querySelector(`[data-w="${b.dataset.k}"]`); if(wi) wi.hidden=!b.classList.contains('on'); });
}
function ncCollectEquip(){
  const box=$('#nc-equip'), equipment=[], weights={};
  box.querySelectorAll('.chip-check.on').forEach(b=>{ equipment.push(b.dataset.k);
    const wi=box.querySelector(`[data-w="${b.dataset.k}"]`); if(wi&&wi.value.trim()) weights[b.dataset.k]=wi.value.trim(); });
  return { equipment, weights };
}
const ncOpen  = () => { renderNcEquip(); $('#nc-msg').textContent=''; $('#nc-modal').classList.remove('hidden'); };
const ncClose = () => $('#nc-modal').classList.add('hidden');
$('#td-add-client')?.addEventListener('click', ncOpen);
$('#nc-close')?.addEventListener('click', ncClose);
$('#nc-cancel')?.addEventListener('click', ncClose);
$('#nc-modal')?.addEventListener('click', e=>{ if(e.target.id==='nc-modal') ncClose(); });

$('#nc-save')?.addEventListener('click', async ()=>{
  const msg=$('#nc-msg');
  const email=$('#nc-email').value.trim(), pass=$('#nc-pass').value, name=$('#nc-name').value.trim();
  if(!email || pass.length<6){ msg.textContent='Email válido y contraseña de mínimo 6 caracteres.'; return; }
  msg.textContent='Creando cliente…';
  // App secundaria: crea la cuenta sin cerrar la sesión del entrenador.
  const sec = M.initializeApp(M.CONFIG, 'client-alta-'+Date.now());
  const secAuth = M.getAuth(sec), secDb = M.getFirestore(sec);
  try{
    const cred = await M.createUserWithEmailAndPassword(secAuth, email, pass);
    const cid = cred.user.uid;
    await M.setDoc(M.doc(secDb,'users',cid), {
      uid:cid, email, name, role:'client', isApproved:true, trainerId: meUid, createdAt: Date.now(),
    });
    const eq = ncCollectEquip();
    await M.setDoc(M.doc(secDb,'clients_dossier',cid), {
      uid:cid, trainerId: meUid, updatedAt: Date.now(),
      fisico:{ equipment:eq.equipment, weights:eq.weights,
        sports: $('#nc-sports').value.split(',').map(s=>s.trim()).filter(Boolean),
        injuries: $('#nc-injuries').value.split(',').map(s=>s.trim()).filter(Boolean) },
      habitos:{ diet:$('#nc-diet').value.trim(), sleepHours:+$('#nc-sleep').value||null, stress:$('#nc-stress').value },
      estiloVida:{ workRoutine:$('#nc-work').value, hoursAvailable:+$('#nc-hours').value||null },
      psicologia:{ motivation:$('#nc-motiv').value, motivationText:$('#nc-motiv-text').value.trim(), barriers:$('#nc-barriers').value.trim() },
    });
    await M.signOut(secAuth);
    await M.deleteApp(sec);
    msg.textContent='✅ Cliente creado.';
    ['nc-name','nc-email','nc-pass','nc-sports','nc-injuries','nc-diet','nc-sleep','nc-hours','nc-motiv-text','nc-barriers'].forEach(id=>{const el=document.getElementById(id); if(el) el.value='';});
    setTimeout(()=>{ ncClose(); loadClients(); }, 900);
  }catch(err){
    try{ await M.deleteApp(sec); }catch{}
    msg.textContent = err.code==='auth/email-already-in-use' ? 'Ese email ya tiene cuenta.' : err.message;
  }
});

boot();
