// Fase 2 · Captura de anamnesis del cliente → clients_dossier/{uid}
import { FIREBASE_ENABLED, fb } from './firebase.js?v=48';
import { EQUIPMENT_DETAIL } from './exercises.js?v=48';

const $ = s => document.querySelector(s);
let M = null, mode = 'register';

const EQUIP = EQUIPMENT_DETAIL.filter(e => e.id !== 'bodyweight' && e.id !== 'yoga_mat');

function renderEquip(sel = {}, weights = {}){
  $('#ob-equip').innerHTML = EQUIP.map(it => {
    const on = !!sel[it.id];
    const w = it.weight ? `<input class="pf-w" data-w="${it.id}" type="text" placeholder="${it.wl||'peso'}" value="${(weights[it.id]||'').replace(/"/g,'&quot;')}" ${on?'':'hidden'} />` : '';
    return `<div class="equip-row"><button type="button" class="chip-check${on?' on':''}" data-k="${it.id}"><span>${it.ic}</span>${it.label}</button>${w}</div>`;
  }).join('');
  $('#ob-equip').querySelectorAll('.chip-check').forEach(b => b.onclick = () => {
    b.classList.toggle('on');
    const wi = $('#ob-equip').querySelector(`[data-w="${b.dataset.k}"]`);
    if(wi) wi.hidden = !b.classList.contains('on');
  });
}
function collectEquip(){
  const equipment = [], weights = {};
  $('#ob-equip').querySelectorAll('.chip-check.on').forEach(b => {
    equipment.push(b.dataset.k);
    const wi = $('#ob-equip').querySelector(`[data-w="${b.dataset.k}"]`);
    if(wi && wi.value.trim()) weights[b.dataset.k] = wi.value.trim();
  });
  return { equipment, weights };
}

async function boot(){
  if(!FIREBASE_ENABLED){ $('#ob-disabled').hidden = false; return; }
  M = await fb();
  renderEquip();
  M.onAuthStateChanged(M.auth, async user => {
    if(!user){ $('#ob-auth').hidden = false; $('#ob-form').hidden = true; return; }
    $('#ob-auth').hidden = true; $('#ob-form').hidden = false;
    $('#ob-who').textContent = user.email || '';
    // Precarga expediente existente
    try{
      const snap = await M.getDoc(M.doc(M.db, 'clients_dossier', user.uid));
      if(snap.exists()) fill(snap.data());
    }catch{}
  });
}

function fill(d){
  const f = d.fisico||{}, h = d.habitos||{}, e = d.estiloVida||{}, p = d.psicologia||{};
  const sel = {}; (f.equipment||[]).forEach(id => sel[id] = true);
  renderEquip(sel, f.weights||{});
  $('#ob-sports').value = (f.sports||[]).join(', ');
  $('#ob-injuries').value = (f.injuries||[]).join(', ');
  $('#ob-diet').value = h.diet||''; $('#ob-sleep').value = h.sleepHours||''; $('#ob-stress').value = h.stress||'medio';
  $('#ob-work').value = e.workRoutine||'mixto'; $('#ob-hours').value = e.hoursAvailable||'';
  $('#ob-motiv').value = p.motivation||'salud'; $('#ob-motiv-text').value = p.motivationText||''; $('#ob-barriers').value = p.barriers||'';
}

// ---- Auth ----
$('#ob-toggle').onclick = () => {
  mode = mode === 'register' ? 'login' : 'register';
  $('#ob-auth-title').textContent = mode === 'register' ? 'Crear cuenta de cliente' : 'Iniciar sesión';
  $('#ob-submit').textContent = mode === 'register' ? 'Crear cuenta' : 'Entrar';
  $('#ob-toggle').textContent = mode === 'register' ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Crear una';
  $('#ob-name-row').hidden = mode === 'login';
  $('#ob-code-row').hidden = mode === 'login';
};
$('#ob-submit').onclick = async () => {
  const email = $('#ob-email').value.trim(), pass = $('#ob-pass').value;
  const msg = $('#ob-auth-msg'); msg.textContent = 'Procesando…';
  try{
    if(mode === 'register'){
      const cred = await M.createUserWithEmailAndPassword(M.auth, email, pass);
      await M.setDoc(M.doc(M.db, 'users', cred.user.uid), {
        uid: cred.user.uid, email, name: $('#ob-name').value.trim(),
        role: 'client', isApproved: true,
        trainerId: $('#ob-trainer').value.trim() || null, createdAt: Date.now(),
      });
    }else{
      await M.signInWithEmailAndPassword(M.auth, email, pass);
    }
    msg.textContent = '';
  }catch(err){ msg.textContent = err.message; }
};
$('#ob-logout').onclick = () => M.signOut(M.auth);

// ---- Guardar anamnesis ----
$('#ob-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const msg = $('#ob-msg'); msg.textContent = 'Guardando…';
  const user = M.auth.currentUser; if(!user) return;
  const eq = collectEquip();
  let trainerId = null;
  try{ const u = await M.getDoc(M.doc(M.db, 'users', user.uid)); trainerId = u.exists() ? (u.data().trainerId||null) : null; }catch{}
  const dossier = {
    uid: user.uid, trainerId, updatedAt: Date.now(),
    fisico: {
      equipment: eq.equipment, weights: eq.weights,
      sports: $('#ob-sports').value.split(',').map(s=>s.trim()).filter(Boolean),
      injuries: $('#ob-injuries').value.split(',').map(s=>s.trim()).filter(Boolean),
    },
    habitos: { diet: $('#ob-diet').value.trim(), sleepHours: +$('#ob-sleep').value||null, stress: $('#ob-stress').value },
    estiloVida: { workRoutine: $('#ob-work').value, hoursAvailable: +$('#ob-hours').value||null },
    psicologia: { motivation: $('#ob-motiv').value, motivationText: $('#ob-motiv-text').value.trim(), barriers: $('#ob-barriers').value.trim() },
  };
  try{
    await M.setDoc(M.doc(M.db, 'clients_dossier', user.uid), dossier, { merge: true });
    msg.textContent = '✅ Cuestionario guardado. Tu entrenador ya puede verlo.';
  }catch(err){ msg.textContent = err.message; }
});

boot();
