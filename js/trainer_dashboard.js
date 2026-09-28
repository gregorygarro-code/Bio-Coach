// Fase 3 · Dashboard del entrenador (protegido por Firebase Auth + rol).
import { FIREBASE_ENABLED, fb } from './firebase.js?v=45';

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
    if(!prof || prof.role !== 'trainer'){
      $('#td-gate-title').textContent = 'Acceso solo para entrenadores';
      $('#td-gate-msg').textContent = 'Esta cuenta no tiene rol de entrenador.';
      show('#td-gate'); $('#td-logout').hidden = false; return;
    }
    if(prof.isApproved !== true){
      $('#td-gate-title').textContent = 'Cuenta pendiente de aprobación';
      $('#td-gate-msg').textContent = 'Un administrador debe autorizar tu cuenta de entrenador antes de acceder.';
      show('#td-gate'); $('#td-logout').hidden = false; return;
    }
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

boot();
