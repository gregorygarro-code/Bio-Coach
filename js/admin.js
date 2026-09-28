// Panel de administración · aprobar/gestionar entrenadores (rol admin).
import { FIREBASE_ENABLED, fb } from './firebase.js?v=46';

const $ = s => document.querySelector(s);
let M = null;
const show = (id, on=true) => { const el = $(id); if(el) el.hidden = !on; };
const hideAll = () => ['#ad-auth','#ad-gate','#ad-dash'].forEach(i => show(i, false));

async function boot(){
  if(!FIREBASE_ENABLED){ hideAll(); show('#ad-disabled'); return; }
  M = await fb();
  M.onAuthStateChanged(M.auth, async user => {
    hideAll();
    if(!user){ show('#ad-auth'); return; }
    $('#ad-me').textContent = user.email || '';
    $('#ad-logout').hidden = false;
    let prof = null;
    try{ const s = await M.getDoc(M.doc(M.db,'users',user.uid)); prof = s.exists()?s.data():null; }catch{}
    if(!prof || prof.role !== 'admin'){
      $('#ad-gate-hint').textContent = 'Para el primer admin: en Firestore → users → tu documento, pon role:"admin".';
      show('#ad-gate'); return;
    }
    show('#ad-dash'); loadAll();
  });
}

async function setApproved(uid, val){
  await M.updateDoc(M.doc(M.db,'users',uid), { isApproved: val });
  loadAll();
}

function trainerRow(id, u, approved){
  const el = document.createElement('div'); el.className = 'ad-row';
  el.innerHTML = `<div class="who"><b>${u.name||'(sin nombre)'}</b><span class="muted small">${u.email||''} · ${id}</span></div>`;
  const act = document.createElement('div'); act.className = 'ad-actions';
  if(approved){
    const b = document.createElement('button'); b.className='btn ghost'; b.textContent='Revocar';
    b.onclick = ()=>setApproved(id, false); act.appendChild(b);
  }else{
    const b = document.createElement('button'); b.className='btn accent'; b.textContent='Aprobar';
    b.onclick = ()=>setApproved(id, true); act.appendChild(b);
  }
  el.appendChild(act); return el;
}

async function loadAll(){
  const pend = $('#ad-pending'), appr = $('#ad-approved'), allb = $('#ad-users');
  pend.innerHTML=''; appr.innerHTML=''; allb.innerHTML='';
  try{
    const snap = await M.getDocs(M.query(M.collection(M.db,'users'), M.where('role','==','trainer')));
    let nP=0, nA=0;
    snap.forEach(d => { const u=d.data();
      if(u.isApproved===true){ appr.appendChild(trainerRow(d.id,u,true)); nA++; }
      else { pend.appendChild(trainerRow(d.id,u,false)); nP++; }
    });
    if(!nP) pend.innerHTML='<p class="muted small">No hay entrenadores pendientes.</p>';
    if(!nA) appr.innerHTML='<p class="muted small">Aún no hay entrenadores aprobados.</p>';
  }catch(err){ pend.innerHTML = `<p class="muted small">${err.message}</p>`; }

  try{
    const snap = await M.getDocs(M.collection(M.db,'users'));
    if(snap.empty){ allb.innerHTML='<p class="muted small">Sin usuarios.</p>'; return; }
    snap.forEach(d => { const u=d.data();
      const el=document.createElement('div'); el.className='ad-row';
      const state = u.role==='trainer' ? (u.isApproved?'<span class="badge-ok">aprobado</span>':'<span class="badge-wait">pendiente</span>') : '';
      el.innerHTML=`<div class="who"><b>${u.name||'(sin nombre)'}</b><span class="muted small">${u.email||''} · rol: ${u.role||'—'} ${state}</span></div>`;
      allb.appendChild(el);
    });
  }catch(err){ allb.innerHTML = `<p class="muted small">${err.message}</p>`; }
}

$('#ad-login').onclick = async () => {
  const msg=$('#ad-auth-msg'); msg.textContent='Entrando…';
  try{ await M.signInWithEmailAndPassword(M.auth, $('#ad-email').value.trim(), $('#ad-pass').value); msg.textContent=''; }
  catch(err){ msg.textContent=err.message; }
};
const logout = () => M.signOut(M.auth);
$('#ad-logout').onclick = logout; $('#ad-gate-logout').onclick = logout;

boot();
