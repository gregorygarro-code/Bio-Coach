// ===== FitCoach Casa · app principal =====
import { EXERCISES, EQUIPMENT, EQUIPMENT_DETAIL, capsFromDetail, GROUPS, TRAIN_GOALS, RepCounter, exercisesForGroup, buildGuidedPlan, levelReps, getExercise, POSE_CONNECTIONS } from './exercises.js?v=30';
import { createPoseLandmarker } from './pose.js?v=30';
import { createDemoPlayer } from './demos.js?v=30';
import * as generator from './generator.js?v=30';
import { generateMonthlyPlan, hasUpcomingPlan } from './planner.js?v=30';
import { LandmarkSmoother, clamp, round, fmtTime, speak, setVoice, vis, LM } from './utils.js?v=30';
import { sfx, setSound, unlock as unlockAudio } from './audio.js?v=30';
import * as api from './api.js?v=30';
import * as store from './storage.js?v=30';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// Colores del esqueleto en vivo, tomados del tema (con fallback)
const _css = getComputedStyle(document.documentElement);
const OVERLAY_LINE = (_css.getPropertyValue('--accent').trim()||'#34d399');
const OVERLAY_DOT  = (_css.getPropertyValue('--accent2').trim()||'#3b82f6');

// ---------- Estado ----------
let settings = store.loadSettings();
let equipDetail = new Set(['bodyweight','dumbbells','bands','bench','barbell','pullup_bar']); // equipo detallado
let equipWeights = {};                                                                        // pesos por equipo
let equipOther = '';                                                                          // equipo extra escrito por el usuario
let selectedEquip = capsFromDetail(equipDetail);                                              // capacidades derivadas
let currentGroup = 'full';
let currentEx = null;
let counter = null;
let smoother = new LandmarkSmoother(0.55);
let landmarker = null;
let stream = null;
let running = false;
let setActive = false;
let setNumber = 1;
let holdStart = 0;          // para ejercicios de tipo 'hold'
let setMode = 'reps';       // 'reps' | 'amrap' | 'hold'
let targetReps = 10;
let timeLeft = 0;
let repsDone = 0;
let timerInterval = null;
let prepInterval = null;
let lastPhase = 'reset';
let targetReached = false;
let sessionMinutes = 45;                 // tiempo elegido para la rutina guiada
let currentGoal = 'general';             // objetivo de entrenamiento
let guestSex = '';                        // ajuste rápido para invitados (sexo)
let guestAge = null;                      // ajuste rápido para invitados (edad)
let currentInjuries = [];                 // lesiones activas (de la IA o del perfil) para excluir ejercicios
let paused = false;                       // pausa de la serie/temporizador en curso
let currentGuidedPlan = null;            // plan generado (se reusa al empezar / regenerar variante)
let guided = { active:false, plan:null, i:0, set:1, done:0, rest:60 };
let guidedPreview = false;               // el modal de demo abre para el siguiente paso guiado
let lastVideoTs = -1;
let fpsEma = 0, lastFrame = performance.now();
let lastFormRun = 0;
let sessionSetsSummary = [];  // resumen de las series del ejercicio actual
let bilateralEx = false;      // el ejercicio actual se trabaja por lados
let sidePhase = 0;            // 0 = no aplica · 1 = lado 1 · 2 = lado 2
let sideAccum = 0;            // reps/segundos acumulados del primer lado
let continuingSide = false;  // startSet viene de un cambio de lado (no reinicia el conteo bilateral)
let formTally = {};          // informe de técnica: recuento por mensaje {good,warn,bad}

// ---------- DOM ----------
const video = $('#cam'), cvs = $('#overlay'), ctx = cvs.getContext('2d');
const camStatus = $('#cam-status');

setVoice(settings.voice);
setSound(settings.sound);
applyAccessibility();

// ===== Fase 1: accesibilidad =====
function applyAccessibility(){
  const r=document.documentElement;
  r.dataset.scale = settings.textScale || 'normal';
  r.dataset.contrast = settings.contrast ? '1' : '0';
  r.dataset.motion = settings.reduceMotion ? 'off' : 'on';
}

// ======================================================
// Navegación por pestañas
// ======================================================
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#view-${t.dataset.view}`).classList.add('active');
  updateAuthCTAs();   // FIX 4: mantiene ocultos los CTA de crear perfil en Modo Usuario
  if(t.dataset.view==='entrenar') renderToday();
  if(t.dataset.view==='historial') renderHistory();
  if(t.dataset.view==='calendario') renderCalendar();
  if(t.dataset.view==='perfil') renderPerfil();
  window.scrollTo({top:0, behavior:'instant'});
}));

// Navegación desde la landing (botones data-goto) y logo → Inicio
function goTo(view){ const b=document.querySelector(`.tab[data-view="${view}"]`); if(b) b.click(); }
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click', ()=>goTo(b.dataset.goto)));
document.querySelector('.brand')?.addEventListener('click', ()=>goTo('inicio'));

// Animación biomecánica del hero
(function heroDemo(){
  const c=document.getElementById('hero-demo'); if(!c) return;
  createDemoPlayer(c).play('squat', settings.reduceMotion);
  const reps=document.getElementById('hero-reps'); if(reps && !settings.reduceMotion){
    let n=0; setInterval(()=>{ n=(n%12)+1; reps.textContent=n; }, 2200);
  }
})();

// ======================================================
// Chips de equipamiento
// ======================================================
function renderEquip(){
  const wrap = $('#equip-chips'); wrap.innerHTML='';
  for(const it of EQUIPMENT_DETAIL){
    const el=document.createElement('button');
    el.className='chip'+(equipDetail.has(it.id)?' on':'');
    el.innerHTML=`<span class="ic">${it.ic}</span>${it.label}`;
    el.onclick=()=>{ toggleEquip(it.id); renderEquip(); renderProfileEquip(); regenPlan(); };
    wrap.appendChild(el);
  }
}
function toggleEquip(id){
  if(equipDetail.has(id)) equipDetail.delete(id); else equipDetail.add(id);
  if(equipDetail.size===0) equipDetail.add('bodyweight');   // nunca vacío
  selectedEquip = capsFromDetail(equipDetail);
}

// Presets rápidos de equipamiento: adaptable sin ser una lista infinita.
const EQUIP_PRESETS = {
  none: ['bodyweight','yoga_mat'],
  home: ['bodyweight','yoga_mat','dumbbells','bands'],
  full: ['bodyweight','yoga_mat','dumbbells','kettlebell','bands','bench','squat_rack','barbell','pullup_bar'],
};
function applyEquipPreset(key){
  const ids=EQUIP_PRESETS[key]; if(!ids) return;
  equipDetail=new Set(ids); selectedEquip=capsFromDetail(equipDetail);
  renderEquip(); renderProfileEquip(); regenPlan();
}
$$('[data-preset]').forEach(b=>b.addEventListener('click', ()=>{
  $$('[data-preset]').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  applyEquipPreset(b.dataset.preset);
}));
$('#equip-other')?.addEventListener('input', e=>{ equipOther=e.target.value; });

// Ajuste rápido para invitados (sexo/edad) — el perfil lo sustituye al iniciar sesión
$('#q-sex')?.addEventListener('change', e=>{ guestSex=e.target.value; regenPlan(); });
$('#q-age')?.addEventListener('change', e=>{ guestAge=+e.target.value||null; regenPlan(); });
function updateQuickPersonal(){
  const box=$('#quick-personal'); if(!box) return;
  box.hidden = auth.loggedIn;   // con sesión, manda el perfil
}

// ======================================================
// Chips de grupo muscular
// ======================================================
function renderGroups(){
  const wrap=$('#group-chips'); wrap.innerHTML='';
  for(const [key,{label,ic}] of Object.entries(GROUPS)){
    if(key==='all') continue;  // ya no hay "Todos": el grupo define la sesión
    const el=document.createElement('button');
    el.className='chip group'+(currentGroup===key?' on':'');
    el.innerHTML=`<span class="ic">${ic}</span>${label}`;
    el.onclick=()=>{ currentGroup=key; renderGroups(); regenPlan(); };
    wrap.appendChild(el);
  }
}

// ======================================================
// Chips de objetivo de entrenamiento
// ======================================================
function renderGoals(){
  const wrap=$('#goal-chips'); wrap.innerHTML='';
  for(const [key,g] of Object.entries(TRAIN_GOALS)){
    const el=document.createElement('button');
    el.className='chip goal'+(currentGoal===key?' on':'');
    el.innerHTML=`<span class="ic">${g.ic}</span>${g.label}`;
    el.onclick=()=>{ currentGoal=key; renderGoals(); $('#goal-info').textContent=g.info; regenPlan(); };
    wrap.appendChild(el);
  }
  $('#goal-info').textContent = TRAIN_GOALS[currentGoal].info;
}

// ======================================================
// Rutina guiada del día
// ======================================================
const PHASE_LABEL = { warmup:'Calentamiento', main:'Principal', cooldown:'Vuelta a la calma' };

function renderTimeChips(){
  const wrap=$('#time-chips'); wrap.innerHTML='';
  for(const min of [30,45,60]){
    const el=document.createElement('button');
    el.className='chip time'+(sessionMinutes===min?' on':'');
    el.textContent=`${min} min`;
    el.onclick=()=>{ sessionMinutes=min; renderTimeChips(); regenPlan(); };
    wrap.appendChild(el);
  }
}

// Contexto personal (edad/sexo): del perfil si hay, si no del ajuste rápido de invitado
function personalCtx(){
  const p = profileData || {};
  return { age: (p.age ?? guestAge) || null, sex: p.sex || guestSex || '' };
}

// Genera (y guarda) un plan nuevo mediante el generador experto (carga JSON,
// aplica lesiones y sobrecarga progresiva) y refresca la vista previa.
async function regenPlan(){
  const pc = personalCtx();
  currentGuidedPlan = await generator.generateRoutine({
    group: currentGroup, equip: selectedEquip, minutes: sessionMinutes,
    goal: currentGoal, level: settings.level, age: pc.age, sex: pc.sex,
    rest: settings.rest, injuries: currentInjuries,
    feel: store.lastSessionRPE(currentGroup),   // RPE de la última sesión de este foco
    isBajoImpacto: !!(profileData && profileData.isBajoImpacto),   // filtro poblaciones especiales
  });
  renderGuidedPreview();
}

function renderGuidedPreview(){
  const box=$('#guided-preview');
  const plan=currentGuidedPlan;
  if(!plan || !plan.steps.length){ box.innerHTML='<p class="muted small">No hay ejercicios para esta combinación. Prueba con otro equipamiento u objetivo.</p>'; return; }
  const label = GROUPS[currentGroup]?.label || 'Full body';
  const G = plan.goal;
  const items = plan.steps.map((s,i)=>{
    const perSide = s.bilateral ? (s.mode==='hold' ? ' ×2 lados' : ' por lado') : '';
    const dose = (s.mode==='hold' ? `${s.sets>1?s.sets+'× ':''}${s.secs}s` : `${s.sets} × ${s.repsLabel||s.reps}`) + perSide;
    const ph = s.phase!=='main' ? `<span class="gp-phase ${s.phase}">${PHASE_LABEL[s.phase]}</span>` : '';
    const ov = s.overload ? `<span class="gp-phase ov" title="${s.overload.note}">⬆ ${s.overload.note}</span>` : '';
    const cues = s.ex.cues.map(c=>`<li>${c}</li>`).join('');
    return `<details class="gp-item">
      <summary class="gp-sum">
        <span class="gp-emoji">${s.emoji}</span>
        <span class="gp-main"><span class="gp-name">${i+1}. ${s.name}</span> ${ph} ${ov}</span>
        <span class="gp-sets">${dose}</span>
        <span class="gp-chevron">▾</span>
      </summary>
      <div class="gp-detail">
        <p class="gp-muscles">${s.ex.muscles} · 📷 ${s.ex.view}</p>
        <p class="gp-cues-title">Cómo hacerlo bien</p>
        <ul>${cues}</ul>
        <button class="link gp-demo" data-id="${s.id}">▶ Ver demostración animada</button>
      </div>
    </details>`;
  }).join('');
  box.innerHTML = `<div class="gp-head"><span>${label} · <b>${G.label}</b> · ~${plan.estMin} min · ${plan.steps.length} ejercicios</span></div>
    <div class="gp-scheme">💪 Carga: ${G.load} · ⏱️ Descanso: ${G.rest}s · Tempo: ${G.tempo}</div>
    <p class="gp-hint muted small">Toca un ejercicio para ver su explicación antes de empezar.</p>
    <div class="gp-list">${items}</div>`;
  box.querySelectorAll('.gp-demo').forEach(b=>b.addEventListener('click', e=>{
    e.preventDefault(); e.stopPropagation(); openPreview(getExercise(b.dataset.id), true);
  }));
}

// Construye la COLA de ejecución por super-series. Cada celda = una serie a
// realizar, con el descanso que va DESPUÉS (corto dentro del par, completo tras él).
// En una superserie [A,B] el orden es A(r1)→B(r1)→A(r2)→B(r2)… alternando.
const INTRA_REST = 15;   // descanso entre ejercicios del par (superserie)
const PHASE_REST = 10;   // descanso tras calentamiento/movilidad
function buildSupersetQueue(steps, fullRest){
  const warm = steps.filter(s=>s.phase==='warmup');
  const main = steps.filter(s=>s.phase==='main');
  const cool = steps.filter(s=>s.phase==='cooldown');
  const q=[]; let blockNo=0;
  const single=(s,tipo,rest)=>{ blockNo++; const t=s.sets||1;
    for(let set=1;set<=t;set++) q.push({ step:s, ex:s.ex, setNum:set, totalSets:t, blockNo, tipo,
      posInBlock:0, blockSize:1, restAfter:rest, newExercise:(set===1) }); };

  warm.forEach(s=>single(s,'Calentamiento',PHASE_REST));

  for(let i=0;i<main.length;i+=2){
    const pair=main.slice(i,i+2); blockNo++;
    if(pair.length===2){
      const [A,B]=pair; const rounds=Math.max(A.sets||1,B.sets||1);
      for(let r=1;r<=rounds;r++){
        q.push({ step:A, ex:A.ex, setNum:r, totalSets:rounds, blockNo, tipo:'Superserie',
                 posInBlock:0, blockSize:2, restAfter:INTRA_REST, newExercise:true });   // A → (15s) → B
        q.push({ step:B, ex:B.ex, setNum:r, totalSets:rounds, blockNo, tipo:'Superserie',
                 posInBlock:1, blockSize:2, restAfter:fullRest, newExercise:true });      // B → descanso completo
      }
    }else single(pair[0],'Serie',fullRest);
  }

  cool.forEach(s=>single(s,'Vuelta a la calma',PHASE_REST));
  if(q.length) q[q.length-1].restAfter=0;   // sin descanso tras la última serie
  return q;
}

function startGuided(){
  if(!currentGuidedPlan || !currentGuidedPlan.steps.length){ alert('No hay ejercicios para esta combinación de equipamiento y objetivo.'); return; }
  unlockAudio();
  const fullRest = (currentGuidedPlan.goal && currentGuidedPlan.goal.rest) || settings.rest;
  const queue = buildSupersetQueue(currentGuidedPlan.steps, fullRest);
  guided={ active:true, queue, qi:0, done:0, rest:fullRest, plan:currentGuidedPlan.steps };
  guidedPreview=true;
  formTally={};   // reinicia el informe de técnica de la rutina
  // Enciende la cámara ya, mientras el usuario ve la demo del primer ejercicio.
  if(!running) startCamera().catch(()=>{});
  openPreview(queue[0].ex);   // demo del primer ejercicio; "Empezar" carga la primera celda
}

// Carga la celda de la cola (un ejercicio + su objetivo) y arranca la serie
function loadGuidedCell(qi){
  const c=guided.queue[qi]; if(!c) return;
  openSession(c.ex);               // prepara la sesión (resetea contadores, demo, etc.)
  if(c.step.mode==='hold'){ $('#in-secs').value=c.step.secs; }
  else { $('#in-timed').checked=false; $('#obj-time').classList.add('hidden'); $('#in-target').value=c.step.reps; }
  $('#guided-bar').classList.remove('hidden');
  updateGuidedBar();
  if(running || c.ex.camOptional){ startSet(); }
  else { $('#cam-status').innerHTML='Activa la cámara para empezar la rutina guiada'; }
}
const loadGuidedStep = loadGuidedCell;   // alias (compatibilidad)

function updateGuidedBar(){
  const q=guided.queue, c=q&&q[guided.qi]; if(!c) return;
  const totalBlocks=q[q.length-1].blockNo;
  const perSide = c.step.bilateral ? (c.step.mode==='hold'?' ×2 lados':' por lado') : '';
  const dose = (c.step.mode==='hold' ? `${c.step.secs}s` : `${c.step.repsLabel||c.step.reps} reps`) + perSide;
  const tag = c.blockSize===2 ? `Superserie ${c.posInBlock===0?'A':'B'}` : c.tipo;
  $('#gb-title').textContent=`Bloque ${c.blockNo}/${totalBlocks} · ${tag} · Ronda ${c.setNum}/${c.totalSets}`;
  $('#gb-fill').style.width=`${(guided.qi/q.length)*100}%`;
  const next=q[guided.qi+1];
  $('#gb-next').innerHTML = next
    ? `Ahora: <b>${c.step.name}</b> (${dose}) · Luego: ${next.ex.emoji} ${next.step.name}`
    : `Ahora: <b>${c.step.name}</b> (${dose}) · Última serie`;
}

// Llamado desde endSet cuando el modo guiado está activo y se guardó una serie/celda
function guidedAfterCell(){
  const prev=guided.queue[guided.qi];
  guided.done++;
  guided.qi++;
  if(guided.qi>=guided.queue.length){ guidedFinish(); return; }
  const rest=prev.restAfter||0;
  const next=guided.queue[guided.qi];
  updateGuidedBar();
  if(next.newExercise){
    // cambia de estación (otro ejercicio del par o del siguiente bloque): muestra su demo
    guidedPreview=true;
    openPreview(next.ex);
    const go=()=>{ if(guided.active && guidedPreview){ guidedPreview=false; closePreview(); loadGuidedCell(guided.qi); } };
    if(rest>0) startRest(go, rest); else go();
  }else{
    // misma estación, siguiente serie (bloque de un solo ejercicio)
    if(rest>0) startRest(()=>{ if(guided.active) startSet(); }, rest);
    else if(guided.active) startSet();
  }
}
const guidedAfterSet = guidedAfterCell;   // alias (compatibilidad con endSet)

function guidedFinish(){
  const total=guided.done;
  guided.active=false;
  $('#guided-bar').classList.add('hidden');
  clearInterval(restInterval); $('#rest-timer').classList.add('hidden');
  paused=false; updatePauseBtn(); updateSideBadge();
  speak('Rutina completada, buen trabajo',{force:true});
  const sub=`🎉 ¡Rutina completada! · ${total} series · ${GROUPS[currentGroup]?.label||'Full body'} · ${TRAIN_GOALS[currentGoal].label} · ${sessionMinutes} min`;
  $('#panel-session').classList.add('hidden');
  $('#panel-setup').classList.remove('hidden');
  // Primero el feedback de esfuerzo (Likert 1-5), luego el informe de técnica.
  showSessionFeel(currentGroup, currentGoal, ()=>{ showReport('Informe de la rutina', sub); renderToday(); });
  regenPlan();   // propone una variante nueva para la próxima
}

$('#btn-guided').addEventListener('click', startGuided);
$('#btn-variant').addEventListener('click', ()=>{ regenPlan(); });
$('#gb-skip').addEventListener('click', ()=>{
  if(!guided.active) return;
  if(setActive) endSet(false);
  clearInterval(restInterval); $('#rest-timer').classList.add('hidden');
  guided.qi++;   // salta a la siguiente celda de la cola (siguiente serie/estación)
  if(guided.qi < guided.queue.length){ guidedPreview=true; updateGuidedBar(); openPreview(guided.queue[guided.qi].ex); }
  else guidedFinish();
});
$('#gb-quit').addEventListener('click', ()=>{ if(setActive) endSet(false); guidedFinish(); });

// ======================================================
// Modal de demostración (antes de empezar)
// ======================================================
let demoPlayer=null, previewEx=null;
function openPreview(ex, review=false){
  previewEx=ex;
  $('#preview-name').textContent=`${ex.emoji} ${ex.name}`;
  $('#preview-muscles').textContent=ex.muscles;
  $('#preview-view').textContent=`📷 Vista recomendada: ${ex.view}`;
  $('#preview-cues').innerHTML=ex.cues.map(c=>`<li>${c}</li>`).join('');
  $('#preview-start').hidden = review;   // en modo repaso no se inicia, solo se revisa
  $('#preview').classList.remove('hidden');
  if(!demoPlayer) demoPlayer=createDemoPlayer($('#demo-canvas'));
  demoPlayer.play(ex.id, settings.reduceMotion);
}
function closePreview(){
  $('#preview').classList.add('hidden');
  demoPlayer?.stop();
}
$('#preview-close').addEventListener('click', closePreview);
$('#preview').addEventListener('click', e=>{ if(e.target.id==='preview') closePreview(); });
$('#preview-start').addEventListener('click', ()=>{
  const ex=previewEx; closePreview();
  if(guided.active && guidedPreview){
    guidedPreview=false;
    clearInterval(restInterval); restOnDone=null; $('#rest-timer').classList.add('hidden'); // continuar ya, sin esperar el descanso
    loadGuidedCell(guided.qi);
  }
  else { guided.active=false; openSession(ex); }   // abrir un ejercicio suelto sale del modo guiado
});
$('#preview-yt').addEventListener('click', ()=>{ if(previewEx) window.open(previewEx.yt, '_blank', 'noopener'); });

// ======================================================
// Abrir / cerrar sesión de ejercicio
// ======================================================
function openSession(ex){
  currentEx=ex;
  counter=new RepCounter(ex);
  setNumber=1; setActive=false; sessionSetsSummary=[];
  bilateralEx=!!ex.bilateral; sidePhase=bilateralEx?1:0; sideAccum=0; continuingSide=false;
  if(!guided.active) formTally={};   // informe de técnica por ejercicio (en guiado se acumula toda la rutina)
  $('#panel-setup').classList.add('hidden');
  $('#panel-session').classList.remove('hidden');
  $('#guided-bar').classList.add('hidden');
  $('#ex-name').textContent=`${ex.emoji} ${ex.name}`;
  $('#ex-equip').textContent=`${ex.muscles} · Vista: ${ex.view}`;
  $('#cue-list').innerHTML=ex.cues.map(c=>`<li>${c}</li>`).join('');
  // etiquetas de gauges
  $('#g1-label').textContent=ex.gauges[0]?.label||'—';
  $('#g2-label').textContent=ex.gauges[1]?.label||'—';
  $('.gauges .gauge-row:nth-child(2)').style.display = ex.gauges[1]?'':'none';
  $('#set-count').textContent=setNumber;
  $('#rep-count').textContent='0';
  $('#rom-val').textContent='—';
  $('#btn-set').textContent = ex.type==='hold' ? 'Iniciar' : 'Iniciar serie';
  configureObjective(ex);
  resetFormList();
  updateSetButtons();
}

// Configura el control de objetivo según el tipo de ejercicio
function configureObjective(ex){
  targetReached=false;
  if(ex.type==='hold'){
    $('#obj-reps').classList.add('hidden');
    $('#obj-time').classList.remove('hidden');
    $('#obj-time-lbl').textContent='Duración';
    $('#in-secs').value = ex.holdDefault || settings.holdSecs;
  }else{
    $('#obj-reps').classList.remove('hidden');
    $('#in-target').value = levelReps(settings.targetReps, settings.level);  // ajustado al nivel
    $('#in-timed').checked=false;
    $('#obj-time').classList.add('hidden');
    $('#obj-time-lbl').textContent='Tiempo (AMRAP)';
    $('#in-secs').value=60;
  }
  // registro de peso (kg) solo en ejercicios con carga
  $('#obj-weight').classList.toggle('hidden', !ex.weighted);
  $('#in-weight').value = 0;
}
// Alterna "por tiempo" (AMRAP) en ejercicios de repeticiones
$('#in-timed').addEventListener('change', e=>{
  $('#obj-time').classList.toggle('hidden', !e.target.checked);
});
$('#btn-back').addEventListener('click', ()=>{
  if(setActive) endSet(false);
  guided.active=false;
  clearInterval(restInterval); $('#rest-timer').classList.add('hidden');
  $('#guided-bar').classList.add('hidden');
  $('#panel-session').classList.add('hidden');
  $('#panel-setup').classList.remove('hidden');
});

function updateSetButtons(){
  const canStart = running || (currentEx && currentEx.camOptional);
  $('#btn-set').disabled = !canStart;
  $('#btn-finish').disabled = !canStart;
}

// ======================================================
// Cámara + modelo de pose
// ======================================================
async function ensureModel(){
  if(landmarker) return;
  showLoader('Cargando modelo de pose…');
  try{
    landmarker = await createPoseLandmarker(settings.model, m=>setLoader(m));
  }catch(e){
    hideLoader();
    alert('No se pudo cargar el modelo de pose.\n\nAsegúrate de abrir la app desde un servidor local (http://localhost) y con conexión a internet la primera vez.\n\nDetalle: '+e.message);
    throw e;
  }
  hideLoader();
}

async function listCameras(){
  try{
    const devs=await navigator.mediaDevices.enumerateDevices();
    const cams=devs.filter(d=>d.kind==='videoinput');
    const sel=$('#sel-cam'); sel.innerHTML='';
    cams.forEach((c,i)=>{
      const o=document.createElement('option');
      o.value=c.deviceId; o.textContent=c.label||`Cámara ${i+1}`;
      sel.appendChild(o);
    });
    if(settings.camId) sel.value=settings.camId;
  }catch{}
}

async function startCamera(){
  unlockAudio();
  await ensureModel();
  showLoader('Activando cámara…');
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    const constraints={ video:{ width:{ideal:960}, height:{ideal:720},
      deviceId: settings.camId?{exact:settings.camId}:undefined }, audio:false };
    stream=await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject=stream;
    await video.play();
    await listCameras();
  }catch(e){
    hideLoader();
    alert('No se pudo acceder a la cámara. Revisa los permisos del navegador.\n\nDetalle: '+e.message);
    return;
  }
  applyMirror();
  camStatus.classList.add('hidden');
  hideLoader();
  running=true;
  $('#btn-cam').textContent='Cámara activa';
  $('#btn-cam').disabled=true;
  updateSetButtons();
  requestAnimationFrame(loop);
  // en rutina guiada, arranca automáticamente la serie pendiente al activar la cámara
  // (solo si ya hay un ejercicio cargado y no estamos en la demo previa)
  if(guided.active && !setActive && !guidedPreview && currentEx) startSet();
}
$('#btn-cam').addEventListener('click', startCamera);

function applyMirror(){
  const t = settings.mirror ? 'scaleX(-1)' : 'none';
  video.style.transform=t; cvs.style.transform=t;
}

// ======================================================
// Bucle de detección
// ======================================================
function loop(){
  if(!running) return;
  if(video.readyState>=2 && landmarker){
    let ts=performance.now();
    if(ts<=lastVideoTs) ts=lastVideoTs+1;
    lastVideoTs=ts;
    let result;
    try{ result=landmarker.detectForVideo(video, ts); }catch{}
    const now=performance.now();
    const dt=now-lastFrame; lastFrame=now;
    fpsEma = fpsEma? fpsEma*0.9 + (1000/dt)*0.1 : 1000/dt;
    $('#badge-fps').textContent=`${Math.round(fpsEma)} fps`;

    let lm = result?.landmarks?.[0] || null;
    if(lm) lm = smoother.smooth(lm);
    drawSkeleton(lm);
    if(lm) analyze(lm); else setQuality(false);
  }
  requestAnimationFrame(loop);
}

// ======================================================
// Dibujo del esqueleto
// ======================================================
function drawSkeleton(lm){
  const box=video.getBoundingClientRect();
  if(cvs.width!==Math.round(box.width)||cvs.height!==Math.round(box.height)){
    cvs.width=Math.round(box.width); cvs.height=Math.round(box.height);
  }
  ctx.clearRect(0,0,cvs.width,cvs.height);
  if(!lm) return;
  const W=cvs.width,H=cvs.height,W0=video.videoWidth||W,H0=video.videoHeight||H;
  const scale=Math.max(W/W0,H/H0), dw=W0*scale, dh=H0*scale;
  const ox=(W-dw)/2, oy=(H-dh)/2;
  const pt=l=>{ let x=l.x*W0*scale+ox; const y=l.y*H0*scale+oy; return [x,y]; };

  // conexiones (color del tema)
  ctx.lineWidth=5; ctx.strokeStyle=OVERLAY_LINE; ctx.lineCap='round';
  for(const [a,b] of POSE_CONNECTIONS){
    if(!vis(lm[a])||!vis(lm[b])) continue;
    const [x1,y1]=pt(lm[a]),[x2,y2]=pt(lm[b]);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  }
  // articulaciones
  for(let i=0;i<lm.length;i++){
    if(i<11) continue; // ignoramos la cara para no saturar
    if(!vis(lm[i])) continue;
    const [x,y]=pt(lm[i]);
    ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2);
    ctx.fillStyle=OVERLAY_DOT; ctx.fill();
  }
}

// ======================================================
// Análisis biomecánico por frame
// ======================================================
function setQuality(good){
  const b=$('#badge-quality');
  b.textContent = good?'Encuadre: bien':'Encuadre: ajústate';
  b.style.borderColor = good?'var(--good)':'var(--warn)';
}

// Guía de encuadre de cámara (Fase 1)
function framing(lm){
  if(!lm) return {ok:false, msg:'Colócate frente a la cámara'};
  const torso=[LM.L_HIP,LM.R_HIP,LM.L_SHOULDER,LM.R_SHOULDER].filter(i=>vis(lm[i])).length;
  if(torso<3) return {ok:false, msg:'Sepárate para verte de cuerpo entero'};
  const knees=[LM.L_KNEE,LM.R_KNEE].some(i=>vis(lm[i]));
  if(!knees) return {ok:false, msg:'Aléjate un poco: no se ven las piernas'};
  return {ok:true, msg:'Encuadre correcto'};
}

function analyze(lm){
  const ex=currentEx; if(!ex) return;

  // gauges
  const g1=ex.gauges[0]?.get(lm), g2=ex.gauges[1]?.get(lm);
  updateGauge('#g1-fill','#g1-val',ex.gauges[0],g1);
  if(ex.gauges[1]) updateGauge('#g2-fill','#g2-val',ex.gauges[1],g2);

  const measure=ex.rep.measure(lm);
  const fr=framing(lm);
  setQuality(fr.ok);

  if(!setActive){
    // guía de encuadre antes de iniciar la serie (Fase 1)
    $('#cue-main').textContent = fr.ok ? 'Listo. Pulsa Iniciar serie' : fr.msg;
    $('#cue-main').className = 'cue '+(fr.ok?'good':'warn');
    return;
  }
  if(paused) return;   // en pausa no se cuenta ni se corrige

  // conteo de reps (el temporizador gestiona el tiempo en 'hold')
  if(setMode!=='hold'){
    const r=counter.update(measure);
    // tic al alcanzar la fase de esfuerzo (profundidad/rango)
    if(counter.phase!==lastPhase){
      if(counter.phase==='effort') sfx.bottom();
      lastPhase=counter.phase;
    }
    if(r.rep){
      repsDone=r.reps;
      $('#rep-count').textContent=r.reps;
      if(setMode==='reps' && counter.lastRom!=null) $('#rom-val').textContent=Math.round(counter.lastRom)+'°';
      sfx.rep(r.reps);
      speak(String(r.reps));
      tempoFeedback();
      if(setMode==='reps') checkTarget(r.reps);
    }
  }

  // feedback de técnica (throttle ~150ms)
  const now=performance.now();
  if(now-lastFormRun>150){
    lastFormRun=now;
    runFormChecks(lm);
  }
}

function updateGauge(fillSel,valSel,gauge,val){
  if(val==null){ $(valSel).textContent='—'; $(fillSel).style.width='0%'; return; }
  const pct=clamp((val-gauge.min)/(gauge.max-gauge.min)*100,0,100);
  $(fillSel).style.width=pct+'%';
  $(valSel).textContent=Math.round(val)+'°';
}

function runFormChecks(lm){
  const ex=currentEx;
  const checks = ex.checks ? ex.checks(lm, counter) : [];
  // cue principal = severidad más alta
  const order={bad:3,warn:2,good:1};
  let main=null;
  for(const c of checks){ if(!main||order[c.level]>order[main.level]) main=c; }
  const cue=$('#cue-main');
  if(main){
    cue.textContent=main.msg;
    cue.className='cue '+main.level;
    if(main.level==='bad') speak(main.msg);
  }else{
    cue.textContent='Sigue así'; cue.className='cue neutral';
  }
  // lista detallada
  const ul=$('#form-list');
  if(checks.length){
    ul.innerHTML=checks.map(c=>`<li class="${c.level}">${iconFor(c.level)} ${c.msg}</li>`).join('');
  }
  // recuento para el informe de técnica (solo con la serie activa)
  if(setActive && !paused){
    for(const c of checks){
      const t = formTally[c.msg] || (formTally[c.msg] = {good:0,warn:0,bad:0, ex:currentEx.name});
      t[c.level] = (t[c.level]||0)+1;
    }
  }
}
function iconFor(l){ return l==='good'?'✅':l==='warn'?'⚠️':'❌'; }

function tempoFeedback(){
  const t=counter.tempo, sub=$('#cue-tempo');
  const down=t.down, up=t.up;
  let msg='';
  if(down!=null && up!=null){
    msg=`Tempo — fase 1: ${down.toFixed(1)}s · fase 2: ${up.toFixed(1)}s`;
    if(down<0.5 || up<0.5) msg+=' · ¡controla más el movimiento!';
  }
  sub.textContent=msg;
}

function resetFormList(){
  $('#form-list').innerHTML='<li class="muted">Empieza una serie para recibir correcciones.</li>';
  $('#cue-main').textContent='Colócate de cuerpo entero en el encuadre';
  $('#cue-main').className='cue neutral';
  $('#cue-tempo').textContent='';
}

// ======================================================
// Control de series
// ======================================================
let setTargetSecs=0;   // duración inicial en modos con temporizador

$('#btn-set').addEventListener('click', ()=>{
  if(setActive) endSet(true);
  else if(!prepInterval) startSet();      // ignora clics durante la cuenta atrás
});
$('#btn-finish').addEventListener('click', ()=>{
  if(setActive) endSet(true);
  finishExercise();
});

// --- Pausa de la serie / temporizador en curso ---
function togglePause(){
  if(!setActive) return;
  paused=!paused;
  updatePauseBtn();
  if(paused){ sfx.tick?.(); speak('Pausa',{force:true}); }
  else{ sfx.go?.(); speak('Seguimos',{force:true}); }
}
function updatePauseBtn(){
  const btn=$('#btn-pause'), ov=$('#pause-overlay');
  if(btn){
    btn.classList.toggle('hidden', !setActive);
    btn.textContent = paused ? '▶ Reanudar' : '⏸ Pausar';
    btn.classList.toggle('accent', paused);
  }
  if(ov) ov.classList.toggle('hidden', !(setActive && paused));
}
$('#btn-pause')?.addEventListener('click', togglePause);

// --- Cuenta atrás / número grande sobre el vídeo ---
function showBig(val, lbl='', urgent=false){
  const el=$('#big-timer');
  el.classList.remove('hidden');
  el.classList.toggle('urgent', urgent);
  $('#big-timer-val').textContent=val;
  $('#big-timer-lbl').textContent=lbl;
}
function hideBig(){ $('#big-timer').classList.add('hidden'); $('#big-timer').classList.remove('urgent'); }

function checkTarget(reps){
  if(targetReached) return;
  if(reps===targetReps-1){ sfx.last(); speak('última repetición',{force:true}); }
  if(reps>=targetReps){
    targetReached=true; sfx.target();
    speak(`Objetivo cumplido, ${reps} repeticiones`,{force:true});
    $('#cue-main').textContent=`✅ ¡Objetivo de ${targetReps} reps cumplido!`;
    $('#cue-main').className='cue good';
    if(guided.active) setTimeout(()=>{ if(setActive && guided.active) endSet(true); }, 1300); // avanza solo
  }
}

function startSet(){
  if(!running && !currentEx.camOptional){ alert('Activa la cámara primero.'); return; }
  unlockAudio();
  // determinar modo y objetivo
  if(currentEx.type==='hold'){
    setMode='hold'; timeLeft=clampInt($('#in-secs').value,5,600,settings.holdSecs);
  }else if($('#in-timed').checked){
    setMode='amrap'; timeLeft=clampInt($('#in-secs').value,5,600,60); targetReps=Infinity;
  }else{
    setMode='reps'; targetReps=clampInt($('#in-target').value,1,100,settings.targetReps);
  }
  setTargetSecs=timeLeft;
  targetReached=false; repsDone=0; lastPhase='reset'; paused=false;
  if(bilateralEx && !continuingSide){ sidePhase=1; sideAccum=0; }  // serie nueva → empieza por el lado 1
  continuingSide=false;
  updatePauseBtn();
  $('#rest-timer').classList.add('hidden');
  // cuenta atrás de preparación
  runPrep(beginSet);
}

function runPrep(done){
  if(!settings.prep){ done(); return; }
  let n=3;
  showBig(n,'prepárate'); sfx.tick();
  $('#btn-set').textContent='Preparados…'; $('#btn-set').disabled=true;
  prepInterval=setInterval(()=>{
    n--;
    if(n>0){ showBig(n,'prepárate'); sfx.tick(); }
    else if(n===0){ showBig('¡YA!',''); sfx.go(); }
    else{ clearInterval(prepInterval); prepInterval=null; $('#btn-set').disabled=false; done(); }
  },1000);
}

function beginSet(){
  setActive=true; paused=false; updatePauseBtn();
  counter.reset(); smoother.reset(); lastPhase='reset';
  holdStart=performance.now();
  updateSideBadge();
  $('#btn-set').textContent = currentEx.type==='hold' ? 'Terminar' : 'Terminar serie';
  $('#btn-set').classList.remove('accent'); $('#btn-set').classList.add('primary');
  $('#rep-adjust').classList.toggle('hidden', setMode==='hold');  // corrección manual solo en reps

  if(setMode==='reps'){
    hideBig();
    $('#main-label').textContent='reps'; $('#rom-label').textContent='ROM';
    $('#rep-count').textContent='0'; $('#rom-val').textContent='—';
    speak(`Empieza. Objetivo ${targetReps} repeticiones`,{force:true});
  }else if(setMode==='amrap'){
    $('#main-label').textContent='reps'; $('#rom-label').textContent='seg';
    $('#rep-count').textContent='0'; $('#rom-val').textContent=timeLeft;
    speak('Máximas repeticiones, empieza',{force:true});
    startCountdown();
  }else{ // hold
    $('#main-label').textContent='seg'; $('#rom-label').textContent='ROM';
    $('#rom-val').textContent='—';
    speak('Aguanta la posición',{force:true});
    startCountdown();
  }
}

function startCountdown(){
  clearInterval(timerInterval);
  showBig(timeLeft,'seg');
  if(setMode==='hold') $('#rep-count').textContent=timeLeft;
  timerInterval=setInterval(()=>{
    if(paused) return;   // temporizador congelado durante la pausa
    timeLeft--;
    const urgent = timeLeft<=3;
    showBig(Math.max(timeLeft,0), timeLeft<=0?'':'seg', urgent);
    if(setMode==='hold') $('#rep-count').textContent=Math.max(timeLeft,0);
    if(setMode==='amrap') $('#rom-val').textContent=Math.max(timeLeft,0);
    if(timeLeft<=3 && timeLeft>0) sfx.urgent();
    if(timeLeft<=0){ clearInterval(timerInterval); timerInterval=null; sfx.bell(); endSet(true); }
  },1000);
}

function endSet(save){
  clearInterval(timerInterval); timerInterval=null;
  clearInterval(prepInterval); prepInterval=null;
  hideBig();
  $('#rep-adjust').classList.add('hidden');
  setActive=false; paused=false; updatePauseBtn(); updateSideBadge();
  $('#btn-set').disabled=false;
  $('#btn-set').textContent = currentEx.type==='hold' ? 'Iniciar' : 'Iniciar serie';
  $('#btn-set').classList.add('accent'); $('#btn-set').classList.remove('primary');
  if(save){
    let reps, unit;
    if(setMode==='hold'){ reps=Math.max(0, setTargetSecs-Math.max(timeLeft,0)); unit='seg'; }
    else { reps=counter.reps; unit='reps'; }

    // Ejercicio unilateral: al terminar el lado 1, pasa automáticamente al lado 2 y suma ambos.
    if(bilateralEx && sidePhase===1){
      sideAccum = reps;
      sidePhase = 2;
      switchSide();
      return;
    }
    if(bilateralEx && sidePhase===2) reps = sideAccum + reps;   // total de los dos lados
    updateSideBadge();

    if(reps>0){
      const weight = currentEx.weighted ? Math.max(0, parseFloat($('#in-weight').value)||0) : 0;
      const entry={
        exerciseId:currentEx.id, name:currentEx.name, reps, unit,
        weight: weight>0 ? weight : null,
        avgRom: counter.lastRom!=null?Math.round(counter.lastRom):null,
        bilateral: bilateralEx || undefined,
        set:setNumber, ts:Date.now(),
      };
      store.saveSet(entry);
      syncProgress();
      sessionSetsSummary.push(entry);
      const sideMsg = bilateralEx ? ' entre los dos lados' : '';
      speak(`Serie completada, ${reps} ${unit==='seg'?'segundos':'repeticiones'}${sideMsg}`, {force:true});
      setNumber++;
      $('#set-count').textContent=setNumber;
      sidePhase = bilateralEx?1:0; sideAccum=0;   // preparar la siguiente serie
      if(guided.active){ guidedAfterSet(); }
      else { if(!askRPE()) startRest(); }   // en modo manual pregunta el esfuerzo antes del descanso
    }
  }
}

// Transición entre lados en ejercicios unilaterales
function switchSide(){
  hideBig();
  showBig('LADO 2','cambia de lado', true);
  speak('Cambia de lado',{force:true});
  updateSideBadge();
  setTimeout(()=>{ hideBig(); continuingSide=true; startSet(); }, 3200);
}

function updateSideBadge(){
  const b=$('#badge-side'); if(!b) return;
  if(bilateralEx && setActive){ b.classList.remove('hidden'); b.textContent = sidePhase===2?'▶ Lado derecho':'▶ Lado izquierdo'; }
  else b.classList.add('hidden');
}

function clampInt(v,min,max,def){ v=parseInt(v,10); if(isNaN(v)) return def; return Math.max(min,Math.min(max,v)); }

function finishExercise(){
  const summary = sessionSetsSummary.length
    ? `${sessionSetsSummary.length} ${sessionSetsSummary.length===1?'serie':'series'} · ${sessionSetsSummary.reduce((s,e)=>s+e.reps,0)} ${sessionSetsSummary[0].unit} en total`
    : '';
  showReport(`Informe · ${currentEx?.name||'Ejercicio'}`, summary);
  $('#panel-session').classList.add('hidden');
  $('#panel-setup').classList.remove('hidden');
  regenPlan();
}

// ======================================================
// Informe de técnica (hallazgos de movilidad / fuerza + adaptaciones)
// ======================================================
function adaptationTip(msg){
  const m=msg.toLowerCase();
  if(/profundidad|baja más|baja un poco|rango|dorsiflex|sube más|más las piernas/.test(m))
    return 'Sugerencia: mejora la movilidad (tobillo/cadera) o reduce el rango hasta donde controles sin molestias.';
  if(/rodillas hacia dentro|valgo|rodillas no se metan/.test(m))
    return 'Sugerencia: refuerza glúteo medio (almeja, banda) y empuja las rodillas hacia fuera.';
  if(/recto|cadera en línea|espalda|neutra|alineac|no rompas|no subas la cadera/.test(m))
    return 'Sugerencia: activa el core antes de cada rep y baja la carga/ritmo hasta dominar la postura.';
  if(/extiende|bloqueo|arriba|aprieta glúteo|termina de pie/.test(m))
    return 'Sugerencia: trabaja la fuerza en el rango final (pausas arriba) y activa el glúteo.';
  if(/codo|escápula|hombro|banda hacia la cara|codos altos/.test(m))
    return 'Sugerencia: añade trabajo de prevención de hombro (rotación externa, pull-apart).';
  return 'Sugerencia: baja el ritmo y prioriza la técnica antes de subir la intensidad.';
}

function buildReportHTML(){
  const entries=Object.entries(formTally);
  if(!entries.length) return '<p class="muted">No se registraron suficientes datos de técnica en esta sesión. Enciende la cámara y colócate de cuerpo entero para el análisis biomecánico.</p>';
  const good=[], improve=[];
  for(const [msg,t] of entries){
    const bad=t.bad||0, warn=t.warn||0, gd=t.good||0;
    if(gd>=warn+bad) good.push({msg, ex:t.ex});
    else improve.push({msg, ex:t.ex, score:warn+bad*2, level: bad>=warn?'bad':'warn'});
  }
  improve.sort((a,b)=>b.score-a.score);
  let html='';
  if(improve.length){
    html+='<h3>⚠️ A trabajar</h3><ul class="rep-list">'+improve.slice(0,6).map(x=>
      `<li class="${x.level}"><b>${iconFor(x.level)} ${x.msg}</b><span class="muted small"> · ${x.ex}</span><br><span class="rep-tip">${adaptationTip(x.msg)}</span></li>`).join('')+'</ul>';
  }
  if(good.length){
    html+='<h3>✅ Bien ejecutado</h3><ul class="rep-list">'+good.slice(0,6).map(x=>
      `<li class="good">✅ ${x.msg}<span class="muted small"> · ${x.ex}</span></li>`).join('')+'</ul>';
  }
  if(!improve.length) html='<p class="good" style="font-weight:600">🎉 Técnica sólida en toda la sesión. ¡Buen trabajo!</p>'+html;
  return html;
}

function showReport(title, subtitle){
  const box=$('#report-modal'); if(!box) return;
  $('#report-title').textContent=title;
  $('#report-sub').textContent=subtitle||'';
  $('#report-body').innerHTML=buildReportHTML();
  box.classList.remove('hidden');
}
$('#report-close')?.addEventListener('click', ()=>$('#report-modal').classList.add('hidden'));
$('#report-close2')?.addEventListener('click', ()=>$('#report-modal').classList.add('hidden'));
$('#report-modal')?.addEventListener('click', e=>{ if(e.target.id==='report-modal') $('#report-modal').classList.add('hidden'); });

// ======================================================
// Temporizador de descanso
// ======================================================
let restInterval=null;
let restOnDone=null;
function startRest(onDone, secs){
  clearInterval(restInterval);
  restOnDone = onDone || null;
  // secs explícito (p.ej. descanso corto de superserie); si no, el del esquema/ajustes
  let left = (secs!=null) ? secs : ((guided.active && guided.rest) ? guided.rest : settings.rest);
  const el=$('#rest-timer'), val=$('#rest-val');
  const lbl=el.querySelector('span'); if(lbl) lbl.textContent = (secs!=null && secs<=INTRA_REST) ? 'Descanso corto' : 'Descanso';
  el.classList.remove('hidden'); val.textContent=fmtTime(left);
  restInterval=setInterval(()=>{
    if(paused) return;   // descanso congelado durante la pausa
    left--; val.textContent=fmtTime(left);
    if(left<=3 && left>0) sfx.urgent();
    if(left<=0){
      clearInterval(restInterval); el.classList.add('hidden'); sfx.go();
      speak('Descanso terminado',{force:true});
      const cb=restOnDone; restOnDone=null; if(cb) cb();
    }
  },1000);
}
$('#rest-skip').addEventListener('click', ()=>{
  clearInterval(restInterval); $('#rest-timer').classList.add('hidden');
  const cb=restOnDone; restOnDone=null; if(cb) cb();     // saltar el descanso continúa la rutina guiada
});

// ======================================================
// Historial
// ======================================================
function renderHistory(){
  const h=store.loadHistory();
  const s=store.summary(h);
  $('#history-summary').innerHTML=`
    <div class="stat"><b>${s.days}</b><span>días entrenados</span></div>
    <div class="stat"><b>${s.totalSets}</b><span>series totales</span></div>
    <div class="stat"><b>${s.totalReps}</b><span>reps/seg totales</span></div>`;
  const list=$('#history-list'); list.innerHTML='';
  if(!h.length){ list.innerHTML='<p class="muted">Aún no hay entrenamientos registrados.</p>'; return; }
  const days=store.groupByDay(h);
  for(const [day,entries] of Object.entries(days).reverse()){
    const div=document.createElement('div'); div.className='hist-day';
    div.innerHTML=`<h4>${day}</h4>`+entries.map(e=>{
      const t=new Date(e.ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
      const w=e.weight?` · ${e.weight} kg`:'';
      const rpe=e.rpe?` · RPE ${e.rpe}${e.pain?' ⚠️':''}`:'';
      return `<div class="hist-ex"><span>${t} · ${e.name} (serie ${e.set})</span><b>${e.reps} ${e.unit}${w}${rpe}</b></div>`;
    }).join('');
    list.appendChild(div);
  }
  renderProgress();
}

// ===== Fase 3: panel de progreso =====
function renderProgress(){
  const st=$('#prog-stats');
  const s=store.summary(store.loadHistory());
  st.innerHTML=`
    <div class="stat"><b>${store.streak()}</b><span>racha (días)</span></div>
    <div class="stat"><b>${s.days}</b><span>días entrenados</span></div>
    <div class="stat"><b>${s.totalSets}</b><span>series totales</span></div>`;
  const weeks=store.weeklyVolume(8);
  const max=Math.max(1, ...weeks.map(w=>w.sets));
  $('#prog-chart').innerHTML=weeks.map(w=>{
    const h=Math.round(w.sets/max*100);
    return `<div class="prog-bar"><b>${w.sets||''}</b><i style="height:${h}%"></i><span>${w.label}</span></div>`;
  }).join('');
  const prs=store.personalRecords().filter(p=>p.bestReps>0||p.bestWeight>0)
    .sort((a,b)=>(b.bestWeight-a.bestWeight)||(b.bestReps-a.bestReps));
  $('#pr-list').innerHTML = prs.length
    ? prs.map(p=>{
        const best = p.bestWeight>0 ? `${p.bestWeight} kg × ${p.bestReps}` : `${p.bestReps} ${p.unit||'reps'}`;
        return `<div class="pr-item"><span>${p.name}</span><b>${best}</b></div>`;
      }).join('')
    : '<p class="muted">Aún no hay récords. ¡Entrena para verlos aquí!</p>';
}

$('#btn-clear-history').addEventListener('click', ()=>{
  if(confirm('¿Borrar todo el historial de entrenamientos?')){ store.clearHistory(); syncProgress(true); renderHistory(); }
});

// ======================================================
// Calendario (planificación de cargas + seguimiento)
// ======================================================
let calMonth = new Date(); calMonth.setDate(1);
let dayKeyOpen = null;
const FOCUS = {
  rest:{label:'Descanso', cls:'plan-rest'},
  full:{label:'Full body', cls:'plan-full'},
  upper:{label:'Superior', cls:'plan-upper'},
  lower:{label:'Inferior', cls:'plan-lower'},
  core:{label:'Core', cls:'plan-core'},
  stretch:{label:'Estiramiento', cls:'plan-stretch'},
};

function renderCalendar(){
  const y=calMonth.getFullYear(), m=calMonth.getMonth();
  $('#cal-title').textContent = calMonth.toLocaleDateString('es-ES',{month:'long', year:'numeric'});
  const first=new Date(y,m,1);
  const offset=(first.getDay()+6)%7;           // lunes primero
  const daysInMonth=new Date(y,m+1,0).getDate();
  const plans=store.loadPlans();
  const byDate=store.historyByDate();
  const todayKey=store.dateKey(new Date());

  const grid=$('#cal-grid'); grid.innerHTML='';
  for(let i=0;i<offset;i++){ const e=document.createElement('div'); e.className='cal-cell empty'; grid.appendChild(e); }
  for(let d=1; d<=daysInMonth; d++){
    const date=new Date(y,m,d), key=store.dateKey(date);
    const cell=document.createElement('button'); cell.className='cal-cell';
    if(key===todayKey) cell.classList.add('today');
    let html=`<span class="cal-day">${d}</span>`;
    const plan=plans[key];
    if(plan && plan.focus){
      const f=FOCUS[plan.focus]||{label:plan.focus,cls:''};
      html+=`<span class="cal-plan ${f.cls}">${f.label}</span>`;
      if(plan.intensity) html+=`<i class="cal-int int-${plan.intensity}" title="${plan.intensity}"></i>`;
    }
    const done=byDate[key];
    if(done && done.length){
      html+=`<span class="cal-vol">✓ ${done.length} ${done.length===1?'serie':'series'}</span>`;
    }
    cell.innerHTML=html;
    // Día futuro con plan → abre la previsualización de la rutina; si no, el editor del día.
    const planned = plan && plan.focus && plan.focus!=='rest';
    cell.onclick = (key>todayKey && planned)
      ? ()=>openRoutinePreview(key, plan, date)
      : ()=>openDay(key, date);
    grid.appendChild(cell);
  }
}

function openDay(key, date){
  dayKeyOpen=key;
  $('#day-title').textContent = date.toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const plan=store.loadPlans()[key] || {};
  $('#day-focus').value=plan.focus||'';
  $('#day-intensity').value=plan.intensity||'medio';
  $('#day-note').value=plan.note||'';
  // realizado
  const done=store.historyByDate()[key]||[];
  const box=$('#day-done');
  if(done.length){
    box.innerHTML=done.map(e=>{
      const t=new Date(e.ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
      return `<div class="hist-ex"><span>${t} · ${e.name}</span><b>${e.reps} ${e.unit}</b></div>`;
    }).join('');
  }else{
    box.innerHTML='<p class="muted">Sin entrenamientos registrados.</p>';
  }
  $('#day-modal').classList.remove('hidden');
}
function closeDay(){ $('#day-modal').classList.add('hidden'); dayKeyOpen=null; }

// ===== Previsualización de la rutina de un día futuro (dialog nativo) =====
let previewPlanFocus = null;
async function openRoutinePreview(key, plan, date){
  const dlg=$('#modal-rutina-preview'); if(!dlg) return;
  const prof = profileData || {};
  const goalId  = plan.goal || prof.goal || currentGoal;
  const minutes = plan.minutes || prof.time || sessionMinutes;
  previewPlanFocus = plan.focus;
  $('#mrp-title').textContent = date.toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long'});
  $('#mrp-obj').textContent   = `Objetivo: ${TRAIN_GOALS[goalId]?.label||'General'} · ${GROUPS[plan.focus]?.label||plan.focus} · ${minutes} min`;
  $('#mrp-est').textContent   = '';
  $('#mrp-body').innerHTML    = '<p class="muted">Generando vista previa…</p>';
  if(typeof dlg.showModal==='function') dlg.showModal(); else dlg.setAttribute('open','');
  // Resolución Just-In-Time de la estructura por bloques (super-series)
  const routine = await generator.generateRoutine({
    group:plan.focus, equip:selectedEquip, minutes, goal:goalId,
    level:settings.level, age:prof.age, sex:prof.sex, rest:settings.rest,
    injuries:currentInjuries, isBajoImpacto:!!prof.isBajoImpacto,
  });
  renderPreviewBlocks(routine);
}
function renderPreviewBlocks(routine){
  const blocks = routine.blocks || [];
  $('#mrp-est').textContent = `~${routine.estMin} min estimados · ${blocks.length} bloques`;
  $('#mrp-body').innerHTML = blocks.map(b=>{
    const exs = b.ejercicios.map(e=>{
      const dose = e.modo==='hold' ? `${e.series>1?e.series+'× ':''}${e.segundos}s` : `${e.series} × ${e.reps}`;
      const side = e.bilateral ? (e.modo==='hold'?' ×2 lados':' por lado') : '';
      return `<li><span>${e.emoji} ${e.nombre}</span><b>${dose}${side}</b></li>`;
    }).join('');
    const rest = b.ejercicios.length>1 ? `${b.descanso_entre_ejercicios}s entre ejercicios · ` : '';
    return `<div class="mrp-block">
      <div class="mrp-bhead"><span>Bloque ${b.bloque} · ${b.tipo}</span></div>
      <ul>${exs}</ul>
      <p class="mrp-rest muted small">${rest}descanso ${b.descanso_post_bloque}s tras el bloque</p>
    </div>`;
  }).join('') || '<p class="muted">No hay ejercicios para esta combinación.</p>';
}
$('#mrp-close')?.addEventListener('click', ()=>$('#modal-rutina-preview')?.close?.());
// "Modificar rutina (IA)": lleva a Entrenar con ese foco y despliega el input de IA
$('#mrp-modify')?.addEventListener('click', ()=>{
  $('#modal-rutina-preview')?.close?.();
  if(previewPlanFocus && GROUPS[previewPlanFocus]){ currentGroup=previewPlanFocus; renderGroups(); regenPlan(); }
  goTo('entrenar');
  revealAI(true);
});
$('#day-close').addEventListener('click', closeDay);
$('#day-modal').addEventListener('click', e=>{ if(e.target.id==='day-modal') closeDay(); });
$('#day-save').addEventListener('click', ()=>{
  if(!dayKeyOpen) return;
  const focus=$('#day-focus').value;
  if(!focus){ store.deletePlan(dayKeyOpen); }
  else store.savePlan(dayKeyOpen, {focus, intensity:$('#day-intensity').value, note:$('#day-note').value.trim()});
  syncProgress();
  closeDay(); renderCalendar();
});
$('#day-clear').addEventListener('click', ()=>{
  if(dayKeyOpen) store.deletePlan(dayKeyOpen);
  syncProgress();
  closeDay(); renderCalendar();
});
$('#cal-prev').addEventListener('click', ()=>{ calMonth.setMonth(calMonth.getMonth()-1); renderCalendar(); });
$('#cal-next').addEventListener('click', ()=>{ calMonth.setMonth(calMonth.getMonth()+1); renderCalendar(); });
$('#cal-today').addEventListener('click', ()=>{ calMonth=new Date(); calMonth.setDate(1); renderCalendar(); });

// ======================================================
// Ajustes
// ======================================================
$('#chk-mirror').checked=settings.mirror;
$('#sel-model').value=settings.model;
$('#rng-rest').value=settings.rest; $('#rest-label').textContent=settings.rest+'s';
$('#chk-voice').checked=settings.voice;
$('#chk-sound').checked=settings.sound;
$('#chk-prep').checked=settings.prep;
$('#in-def-target').value=settings.targetReps;
$('#in-def-secs').value=settings.holdSecs;

$('#chk-mirror').addEventListener('change', e=>{ settings.mirror=e.target.checked; persistSettings(); applyMirror(); });
$('#chk-voice').addEventListener('change', e=>{ settings.voice=e.target.checked; setVoice(settings.voice); persistSettings(); });
$('#chk-sound').addEventListener('change', e=>{ settings.sound=e.target.checked; setSound(settings.sound); persistSettings(); if(settings.sound){ unlockAudio(); sfx.rep(1); } });
$('#chk-prep').addEventListener('change', e=>{ settings.prep=e.target.checked; persistSettings(); });
$('#in-def-target').addEventListener('change', e=>{ settings.targetReps=clampInt(e.target.value,1,100,10); e.target.value=settings.targetReps; persistSettings(); });
$('#in-def-secs').addEventListener('change', e=>{ settings.holdSecs=clampInt(e.target.value,5,600,40); e.target.value=settings.holdSecs; persistSettings(); });
$('#rng-rest').addEventListener('input', e=>{ settings.rest=+e.target.value; $('#rest-label').textContent=settings.rest+'s'; persistSettings(); });
$('#sel-model').addEventListener('change', async e=>{
  settings.model=e.target.value; persistSettings();
  if(landmarker){ try{ landmarker.close?.(); }catch{} landmarker=null; running=false; await ensureModel(); if(stream){ running=true; requestAnimationFrame(loop);} }
});
$('#sel-cam').addEventListener('change', e=>{ settings.camId=e.target.value; persistSettings(); if(stream) startCamera(); });

// --- Accesibilidad y nivel (Fase 1 y 2) ---
$('#sel-scale').value=settings.textScale;
$('#chk-contrast').checked=settings.contrast;
$('#chk-motion').checked=settings.reduceMotion;
$('#sel-level').value=settings.level;
$('#sel-scale').addEventListener('change', e=>{ settings.textScale=e.target.value; persistSettings(); applyAccessibility(); });
$('#chk-contrast').addEventListener('change', e=>{ settings.contrast=e.target.checked; persistSettings(); applyAccessibility(); });
$('#chk-motion').addEventListener('change', e=>{ settings.reduceMotion=e.target.checked; persistSettings(); applyAccessibility(); });
$('#sel-level').addEventListener('change', e=>{ settings.level=e.target.value; persistSettings(); renderGuidedPreview(); });
$('#btn-tutorial').addEventListener('click', ()=>startOnboarding(true));

// ======================================================
// Onboarding (Fase 1)
// ======================================================
const ONB_STEPS = [
  {emoji:'🏋️', h:'Bienvenido a FitCoach Casa', p:'Tu entrenador con webcam: cuenta series y repeticiones y te corrige la técnica en tiempo real. Todo se procesa en tu equipo.'},
  {emoji:'🎯', h:'Elige objetivo y tiempo', p:'Marca tu equipamiento y objetivo, y usa la Rutina guiada (30/45/60 min): la app arma la sesión y avanza sola.'},
  {emoji:'📷', h:'Coloca bien la cámara', p:'Ponte a 2-3 m, de cuerpo entero y con buena luz. Cada ejercicio te dice si mirar de frente o de lado.'},
  {emoji:'🔊', h:'Sonido y accesibilidad', p:'Activa pitidos y voz para no mirar la pantalla. En Ajustes puedes agrandar el texto, subir el contraste y elegir tu nivel.'},
];
let onbIdx=0;
function startOnboarding(force){
  if(!force && settings.onboardingDone) return;
  onbIdx=0; renderOnb(); $('#onboarding').classList.remove('hidden');
}
function renderOnb(){
  const s=ONB_STEPS[onbIdx];
  $('#onb-step').innerHTML=`<div class="onb-emoji">${s.emoji}</div><h2>${s.h}</h2><p>${s.p}</p>`;
  $('#onb-dots').innerHTML=ONB_STEPS.map((_,i)=>`<i class="${i===onbIdx?'on':''}"></i>`).join('');
  $('#onb-next').textContent = onbIdx===ONB_STEPS.length-1 ? 'Empezar' : 'Siguiente';
}
function finishOnb(){ settings.onboardingDone=true; persistSettings(); $('#onboarding').classList.add('hidden'); }
$('#onb-next').addEventListener('click', ()=>{ if(onbIdx<ONB_STEPS.length-1){ onbIdx++; renderOnb(); } else finishOnb(); });
$('#onb-skip').addEventListener('click', finishOnb);

// ======================================================
// Corrección manual de repeticiones (Fase 2)
// ======================================================
function adjustReps(d){
  if(!setActive || setMode==='hold' || !counter) return;
  counter.reps = Math.max(0, counter.reps + d);
  repsDone = counter.reps;
  $('#rep-count').textContent = counter.reps;
  if(d>0) sfx.rep(counter.reps);
}
$('#rep-plus').addEventListener('click', ()=>adjustReps(+1));
$('#rep-minus').addEventListener('click', ()=>adjustReps(-1));

// ======================================================
// RPE / molestia tras la serie — solo modo manual (Fase 2)
// ======================================================
function askRPE(){
  if(guided.active || currentEx.type==='hold') return false;   // no interrumpe rutinas ni isométricos
  const sc=$('#rpe-scale');
  if(!sc.dataset.built){
    for(let i=1;i<=10;i++){ const b=document.createElement('button'); b.textContent=i; b.onclick=()=>submitRPE(i); sc.appendChild(b); }
    sc.dataset.built='1';
  }
  $('#rpe-pain').checked=false;
  $('#rpe-modal').classList.remove('hidden');
  return true;
}
function submitRPE(n){
  const pain=$('#rpe-pain').checked;
  store.patchLastSet({rpe:n, pain});
  $('#rpe-modal').classList.add('hidden');
  if(pain) alert('Has marcado molestia o dolor.\nSi persiste, detén el ejercicio y consulta a un profesional.');
  startRest();
}
$('#rpe-skip').addEventListener('click', ()=>{ $('#rpe-modal').classList.add('hidden'); startRest(); });

// ======================================================
// Loader helpers
// ======================================================
function showLoader(msg){ setLoader(msg); $('#loader').classList.remove('hidden'); }
function setLoader(msg){ $('#loader-msg').textContent=msg; }
function hideLoader(){ $('#loader').classList.add('hidden'); }

// ======================================================
// Cuenta y perfil de usuario
// ======================================================
let auth = { backend:false, loggedIn:false, user:null };
let profileData = null;
let authMode = 'login';
let syncTimer = null;

// Guarda ajustes en local y (si hay sesión) los sincroniza por usuario
function persistSettings(){ store.saveSettings(settings); syncProgress(); }

function syncProgress(now=false){
  if(!auth.loggedIn) return;
  clearTimeout(syncTimer);
  const go = ()=> api.saveProgress(store.loadHistory(), store.loadPlans(), settings);
  if(now) go(); else syncTimer = setTimeout(go, 800);
}

// Muestra/oculta las pestañas personales según la sesión
function updateTabsAccess(){
  updateQuickPersonal();
  // Con perfil (local o en la nube) se desbloquean Calendario/Historial/Ajustes.
  const unlocked = hasProfile();
  const gated=['calendario','historial','ajustes'];
  gated.forEach(v=>{ const b=document.querySelector(`.tab[data-view="${v}"]`); if(b) b.hidden = !unlocked; });
  if(!unlocked){
    const active=document.querySelector('.tab.active')?.dataset.view;
    if(gated.includes(active)) document.querySelector('.tab[data-view="entrenar"]').click();
  }
}

// Refleja los ajustes actuales en los controles de la vista Ajustes
function applySettingsToUI(){
  setVoice(settings.voice); setSound(settings.sound); applyAccessibility(); applyMirror();
  const set=(id,val,prop='value')=>{ const el=$(id); if(el) el[prop]=val; };
  set('#chk-mirror',settings.mirror,'checked'); set('#sel-model',settings.model);
  set('#rng-rest',settings.rest); if($('#rest-label')) $('#rest-label').textContent=settings.rest+'s';
  set('#chk-voice',settings.voice,'checked'); set('#chk-sound',settings.sound,'checked'); set('#chk-prep',settings.prep,'checked');
  set('#in-def-target',settings.targetReps); set('#in-def-secs',settings.holdSecs);
  set('#sel-scale',settings.textScale); set('#chk-contrast',settings.contrast,'checked'); set('#chk-motion',settings.reduceMotion,'checked');
  set('#sel-level',settings.level);
}

// Aplica el perfil a los valores por defecto de la rutina guiada
function applyProfileDefaults(p){
  if(!p) return;
  if(Array.isArray(p.equip)){
    const valid = p.equip.filter(id=>EQUIPMENT_DETAIL.some(e=>e.id===id));
    if(valid.length){ equipDetail = new Set(valid); }
  }
  if(p.equipWeights) equipWeights = {...p.equipWeights};
  if(p.equipOther!==undefined) equipOther = p.equipOther;
  // Deriva lesiones desde las notas del perfil para excluir ejercicios de riesgo
  if(p.notes){ const t=p.notes.toLowerCase();
    currentInjuries=['rodilla','hombro','espalda','lumbar','cadera','tobillo','muñeca','cuello','codo'].filter(z=>t.includes(z)); }
  selectedEquip = capsFromDetail(equipDetail);
  if(p.goal && TRAIN_GOALS[p.goal]) currentGoal = p.goal;
  if(p.time && [30,45,60].includes(+p.time)) sessionMinutes = +p.time;
  if(p.level){ settings.level = p.level; persistSettings(); const sl=$('#sel-level'); if(sl) sl.value=p.level; }
  renderEquip(); renderGoals(); renderTimeChips(); regenPlan();
}

function currentProfile(){
  return profileData || {
    time: sessionMinutes, goal: currentGoal, level: settings.level, sex: guestSex, age: guestAge,
    equip: [...equipDetail], equipWeights: {...equipWeights}, equipOther,
  };
}

// Equipo detallado con pesos (en el perfil)
function renderProfileEquip(){
  const ec=$('#pf-equip'); if(!ec) return;
  ec.innerHTML = EQUIPMENT_DETAIL.map(it=>{
    const on = equipDetail.has(it.id);
    const wv = (equipWeights[it.id]||'').replace(/"/g,'&quot;');
    const winput = it.weight
      ? `<input class="pf-w" data-k="${it.id}" type="text" placeholder="${it.wl}: ${it.ph||''}" value="${wv}" ${on?'':'hidden'} />`
      : '';
    return `<div class="equip-row">
      <button type="button" class="chip-check${on?' on':''}" data-k="${it.id}"><span>${it.ic}</span>${it.label}</button>
      ${winput}
    </div>`;
  }).join('');
  ec.querySelectorAll('.chip-check').forEach(b=>b.onclick=()=>{ toggleEquip(b.dataset.k); renderProfileEquip(); renderEquip(); regenPlan(); });
  ec.querySelectorAll('.pf-w').forEach(inp=>inp.oninput=()=>{ equipWeights[inp.dataset.k]=inp.value; });
}

function fillProfileForm(p){
  p = p || {};
  $('#pf-age').value = p.age ?? '';
  if($('#pf-sex')) $('#pf-sex').value = p.sex ?? '';
  if($('#equip-other')){ equipOther = p.equipOther ?? equipOther; $('#equip-other').value = equipOther; }
  $('#pf-weight').value = p.weight ?? '';
  $('#pf-height').value = p.height ?? '';
  $('#pf-days').value = p.days ?? '';
  $('#pf-time').value = p.time ?? sessionMinutes;
  $('#pf-goal').value = p.goal ?? currentGoal;
  $('#pf-level').value = p.level ?? settings.level;
  $('#pf-notes').value = p.notes ?? '';
  if($('#pf-bajo-impacto')) $('#pf-bajo-impacto').checked = !!p.isBajoImpacto;   // toggle bajo impacto
  renderProfileEquip();     // refleja equipDetail + equipWeights globales
}

function gatherProfile(){
  return {
    age:+$('#pf-age').value||null, sex:($('#pf-sex')?.value)||'', weight:+$('#pf-weight').value||null, height:+$('#pf-height').value||null,
    days:+$('#pf-days').value||null, time:+$('#pf-time').value, goal:$('#pf-goal').value,
    level:$('#pf-level').value, equip:[...equipDetail], equipWeights:{...equipWeights}, equipOther,
    notes:$('#pf-notes').value.trim(),
    isBajoImpacto: $('#pf-bajo-impacto')?.checked || false,   // se persiste dentro del perfil (localStorage/nube)
  };
}

function renderPerfil(){
  const gp=$('#pf-goal');
  if(!gp.dataset.built){ gp.innerHTML=Object.entries(TRAIN_GOALS).map(([k,g])=>`<option value="${k}">${g.label}</option>`).join(''); gp.dataset.built='1'; }
  // Invitado con backend: mostramos el login como OPCIÓN (para sincronizar en la nube),
  // pero permitimos crear/editar el perfil localmente (modo invitado, localStorage).
  const guest = auth.backend && !auth.loggedIn;
  $('#auth-card').hidden = !guest;
  if(guest) updateAuthMode();
  $('#profile-card').hidden = false;
  if(auth.loggedIn){
    $('#profile-who').textContent = `${auth.user.name} · ${auth.user.email}`;
    $('#profile-mode').textContent = '';
    $('#pf-logout').hidden = false;
  }else{
    $('#profile-who').textContent = 'Modo invitado';
    $('#profile-mode').textContent = 'Tu perfil y tu progreso se guardan en este navegador (localStorage).';
    $('#pf-logout').hidden = true;
  }
  // FIX 1 · Sin perfil guardado → estado vacío con un único botón "Crear Perfil".
  //         El formulario detallado solo se revela tras pulsarlo (o si ya hay perfil).
  const showForm = hasProfile() || profileFormRevealed;
  $('#profile-empty').hidden = showForm;
  $('#profile-form').hidden = !showForm;

  fillProfileForm(currentProfile());
  renderPlanStatus();   // FIX 5: botón inteligente Generar/Revisar
}
// Revela el formulario de perfil desde el estado vacío
$('#btn-open-profile-form')?.addEventListener('click', ()=>{
  profileFormRevealed = true;
  renderPerfil();
  $('#profile-form')?.scrollIntoView({behavior:'smooth', block:'start'});
});

function updateAuthMode(){
  $('#auth-title').textContent = authMode==='login' ? 'Iniciar sesión' : 'Crear cuenta';
  $('#auth-name-row').hidden = authMode==='login';
  $('#auth-submit').textContent = authMode==='login' ? 'Entrar' : 'Crear cuenta';
  $('#auth-toggle').textContent = authMode==='login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Inicia sesión';
}

$('#auth-toggle').addEventListener('click', ()=>{ authMode = authMode==='login'?'register':'login'; $('#auth-msg').textContent=''; updateAuthMode(); });
$('#auth-submit').addEventListener('click', async ()=>{
  const email=$('#auth-email').value.trim(), pass=$('#auth-pass').value, name=$('#auth-name').value.trim();
  if(!email || !pass){ $('#auth-msg').textContent='Escribe email y contraseña.'; return; }
  $('#auth-msg').textContent='Procesando…';
  const r = authMode==='login' ? await api.login(email,pass) : await api.register(email,name,pass);
  if(r.ok && r.loggedIn){
    auth.loggedIn=true; auth.user=r.user;
    if(r.progress){ store.replaceAll(r.progress); }
    else { syncProgress(true); }               // primera vez: sube el progreso local de invitado
    profileData = r.profile || profileData;
    if(profileData){ applyProfileDefaults(profileData); if(!r.profile) api.saveProfile(profileData); }
    $('#auth-msg').textContent='';
    updateTabsAccess(); renderPerfil(); renderHistory();
  }else{
    $('#auth-msg').textContent = r.error || 'No se pudo completar.';
  }
});
$('#pf-logout').addEventListener('click', async ()=>{ await api.logout(); auth.loggedIn=false; auth.user=null; updateTabsAccess(); renderPerfil(); });
$('#pf-save').addEventListener('click', async ()=>{
  const p = gatherProfile(); profileData = p;
  if(auth.loggedIn) await api.saveProfile(p); else store.saveProfileLocal(p);
  applyProfileDefaults(p);
  updateTabsAccess();        // FIX: al crear perfil se desbloquean Calendario/Historial/Ajustes
  renderToday();             // refresca dashboard + oculta CTAs (FIX 2 y 4)
  $('#pf-msg').textContent = '✓ Perfil guardado. La rutina guiada se ha ajustado a tu perfil.';
  setTimeout(()=>{ $('#pf-msg').textContent=''; }, 3000);
});

async function loadAccountState(){
  const s = await api.me();
  auth.backend = s.backend; auth.loggedIn = !!s.loggedIn; auth.user = s.user || null;
  if(s.loggedIn && s.progress){
    store.replaceAll(s.progress);                              // historial + planes del usuario
    if(s.progress.settings){                                  // ajustes del usuario
      settings = {...settings, ...s.progress.settings};
      store.saveSettings(settings); applySettingsToUI();
    }
  }
  profileData = (s.loggedIn ? s.profile : null) || store.loadProfile();
  if(profileData) applyProfileDefaults(profileData);
  updateTabsAccess();
  renderPerfil();
  renderToday();
  if($('#view-historial').classList.contains('active')) renderHistory();
  if($('#view-calendario').classList.contains('active')) renderCalendar();
}
async function initAccount(){
  await loadAccountState();
  // reacciona al login/confirmación por email (token en la URL) y logout
  api.onAuthChange(async (event)=>{
    if(event==='SIGNED_IN' || event==='SIGNED_OUT' || event==='TOKEN_REFRESHED'){
      await loadAccountState();
    }
  });
}

// ======================================================
// Dashboard "Hoy" (One-Click Start) + racha + planificador
// ======================================================
let todayFocus = null;
let todaySession = null;   // {focus, goal, minutes} de la sesión de hoy (calendario, incl. ajuste IA)
let profileFormRevealed = false;   // FIX 1: el invitado abrió el formulario de perfil

// ¿El usuario tiene un perfil creado? (cloud o guardado en localStorage)
function hasProfile(){ return !!profileData || store.hasSavedProfile(); }

// FIX 4 · Oculta CTAs de "crear cuenta/perfil" cuando ya existe usuario
function updateAuthCTAs(){
  const ready = hasProfile();
  document.querySelectorAll('#cta-create-account, #btn-create-profile')
    .forEach(el=>{ el.hidden = ready; });   // en Modo Usuario no se muestran
}

// Renderiza el dashboard "Hoy". Es también renderTodayDashboard() (alias abajo).
function renderToday(){
  const card=$('#today-card'); if(!card) return;
  const prof = profileData || {};
  const days = prof.days || 3;
  const profileReady = hasProfile();

  // FIX 2 · La racha (🔥) solo tiene sentido con perfil → se oculta a invitados.
  const streakEl = card.querySelector('.streak');
  if(streakEl){
    streakEl.hidden = !profileReady;
    if(profileReady) $('#streak-n').textContent = store.sessionStreak(days);
  }
  const today=new Date();
  $('#today-date').textContent = today.toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long'});

  // FIX 4 · Oculta los CTA de crear cuenta/perfil cuando ya hay usuario.
  updateAuthCTAs();

  // FIX 1 · Sin perfil → solo el CTA "Crea tu perfil"; oculta el plan de hoy.
  $('#today-noprofile').hidden = profileReady;
  if(!profileReady){
    $('#today-has').hidden = true;
    $('#today-none').hidden = true;
    todayFocus = null; todaySession = null;
    return;
  }

  // --- localStorage: sesión programada para hoy ---
  const plan = store.loadPlans()[store.dateKey(today)];
  const has = !!(plan && plan.focus && plan.focus!=='rest');
  $('#today-has').hidden = !has;
  $('#today-none').hidden = has;
  if(has){
    // La sesión puede traer goal/minutes propios (p.ej. tras un ajuste de IA)
    const goalId = plan.goal || prof.goal || currentGoal;
    const mins   = plan.minutes || prof.time || sessionMinutes;
    todayFocus = plan.focus;
    todaySession = { focus:plan.focus, goal:goalId, minutes:mins };
    // --- DOM: resumen de la sesión ---
    $('#today-summary').textContent = `${TRAIN_GOALS[goalId]?.label||'General'} · ${GROUPS[plan.focus]?.label||plan.focus} · ${mins} min`;
    const done = store.trainedToday();
    $('#today-done').hidden = !done;
    $('#btn-start-today').textContent = done ? '▶ Entrenar otra vez' : '▶ INICIAR SESIÓN';
  }else{
    todayFocus = null; todaySession = null;
  }
}
const renderTodayDashboard = renderToday;   // alias pedido en el requerimiento

// One-Click Start: resuelve la rutina Just-In-Time con los parámetros de HOY
// (incluye cualquier ajuste hecho por la IA, no la sesión original).
async function startTodaySession(){
  const s = todaySession; if(!s) return;
  currentGroup = s.focus;
  if(s.goal && TRAIN_GOALS[s.goal]) currentGoal = s.goal;
  if(s.minutes && [30,45,60].includes(+s.minutes)) sessionMinutes = +s.minutes;
  renderGroups(); renderGoals(); renderTimeChips();
  await regenPlan();          // JIT: arma la sesión en este instante (historial + RPE + lesiones)
  startGuided();              // enciende cámara + demo del primer ejercicio
}
$('#btn-start-today')?.addEventListener('click', startTodaySession);
// CTA "Crea tu perfil" → lleva a la pestaña Perfil
$('#btn-create-profile')?.addEventListener('click', ()=>goTo('perfil'));

// FIX 2 · Estado del botón "Generar Plan Mensual" en el Perfil
function renderPlanStatus(){
  const status=$('#plan-status'), btnMain=$('#pf-plan-month'), btnRegen=$('#pf-plan-regen');
  if(!status || !btnMain || !btnRegen) return;
  const active = hasUpcomingPlan(14);   // ¿hay sesiones programadas a futuro? (localStorage)
  btnMain.hidden = false;
  if(active){
    // FIX 5 · Ya hay plan → el botón principal REVISA (va al Calendario), no regenera.
    status.textContent = '✅ Plan activo: tienes sesiones programadas para las próximas semanas.';
    btnMain.textContent = '📅 Revisar mi plan de entrenamiento';
    btnMain.dataset.mode = 'review';
    btnRegen.hidden = false;             // regenerar queda como opción secundaria
  }else{
    status.textContent = 'Aún no tienes un plan mensual. Genera tu mesociclo para ver tu sesión cada día.';
    btnMain.textContent = '🗓️ Generar Plan Mensual';
    btnMain.dataset.mode = 'generate';
    btnRegen.hidden = true;
  }
}
function doGenerateMonthly(){
  const prof = profileData || gatherProfile() || { days:3 };
  const r = generateMonthlyPlan(prof);   // escribe el esqueleto en localStorage (calendario)
  syncProgress();                        // sincroniza los planes si hay sesión en la nube
  renderPlanStatus(); renderToday();
  if($('#view-calendario')?.classList.contains('active')) renderCalendar();
  return r;
}
$('#pf-plan-month')?.addEventListener('click', ()=>{
  // FIX 5 · Si ya hay plan, este botón lleva al Calendario en vez de regenerar.
  if($('#pf-plan-month').dataset.mode === 'review'){ goTo('calendario'); return; }
  const r=doGenerateMonthly();
  $('#pf-msg').textContent = `🗓️ Plan mensual creado: ${r.count} sesiones en 4 semanas (${r.days} días/sem).`;
});
$('#pf-plan-regen')?.addEventListener('click', ()=>{
  // Advertencia de confirmación para no borrar el progreso por error
  if(!confirm('Regenerar sobrescribirá tu planificación FUTURA (los días automáticos).\n\nNo se borra tu historial ni tu progreso, y se respetan los días que editaste a mano.\n\n¿Continuar?')) return;
  const r=doGenerateMonthly();
  $('#pf-msg').textContent = `♻ Plan regenerado: ${r.count} sesiones.`;
});

// "Modificar sesión de hoy" → despliega el input de IA
function revealAI(focus=true){
  const ai=$('#ai-card'); if(ai){ ai.hidden=false; ai.classList.add('flash'); }
  if(focus){ const inp=$('#ai-input'); if(inp){ inp.focus(); inp.scrollIntoView({behavior:'smooth',block:'center'}); } }
}
$('#btn-modify-today')?.addEventListener('click', ()=>revealAI(true));

// Planificar el mes (mesociclo) e inyectarlo en el calendario
$('#btn-plan-month')?.addEventListener('click', ()=>{
  const prof = profileData || { days:3 };
  const r = generateMonthlyPlan(prof);
  syncProgress();                         // los planes van al backend si hay sesión
  renderToday();
  if($('#view-calendario')?.classList.contains('active')) renderCalendar();
  alert(`🗓️ Plan mensual creado.\n\n${r.count} sesiones programadas para las próximas 4 semanas (${r.days} días/semana).\nCada día verás tu sesión lista para empezar de un toque.`);
});
$('#btn-freestyle')?.addEventListener('click', ()=>{ revealAI(false); $('#group-chips')?.scrollIntoView({behavior:'smooth',block:'start'}); });

// ======================================================
// Feedback post-sesión (Escala Likert 1-5)
// ======================================================
let feelThen = null;
const FEEL_LABELS = {1:'Muy fácil', 2:'Fácil', 3:'Perfecto', 4:'Dura', 5:'Extenuante'};
function showSessionFeel(focus, goal, then){
  const box=$('#feel-modal');
  if(!box){ then && then(); return; }
  feelThen = then;
  const sc=$('#feel-scale');
  if(!sc.dataset.built){
    for(let i=1;i<=5;i++){
      const b=document.createElement('button');
      b.className='feel-btn feel-'+i;
      b.innerHTML=`<b>${i}</b><span>${FEEL_LABELS[i]}</span>`;
      b.onclick=()=>submitFeel(i);
      sc.appendChild(b);
    }
    sc.dataset.built='1';
  }
  box.dataset.focus = focus; box.dataset.goal = goal;
  box.classList.remove('hidden');
}
function submitFeel(rpe){
  const box=$('#feel-modal');
  store.saveSessionFeedback({ focus:box.dataset.focus, goal:box.dataset.goal, rpe });
  box.classList.add('hidden');
  const cb=feelThen; feelThen=null; if(cb) cb();
}
$('#feel-skip')?.addEventListener('click', ()=>{ $('#feel-modal').classList.add('hidden'); const cb=feelThen; feelThen=null; if(cb) cb(); });

// ======================================================
// IA conversacional: texto libre → params → generador
// ======================================================
const EQ_WORD_TO_ID = { 'peso corporal':'bodyweight','mancuernas':'dumbbells','kettlebell':'kettlebell','bandas':'bands','barra':'barbell','banca':'bench','dominadas':'pullup_bar' };
function applyParsed(p){
  // Equipo: mapea las palabras del JSON a los ids de la app y refresca los chips
  if(Array.isArray(p.equipo) && p.equipo.length){
    const ids=new Set(['bodyweight']);
    p.equipo.forEach(w=>{ const id=EQ_WORD_TO_ID[String(w).toLowerCase()]; if(id) ids.add(id); });
    equipDetail=ids; selectedEquip=capsFromDetail(equipDetail); renderEquip(); renderProfileEquip();
  }
  // Foco/zona (grupo) que devuelve la IA → cambia el grupo muscular del día
  if(p.grupo && GROUPS[p.grupo]){ currentGroup=p.grupo; renderGroups(); }
  if(p.objetivo && TRAIN_GOALS[p.objetivo]){ currentGoal=p.objetivo; renderGoals(); }
  if(p.tiempo_minutos){ // ajusta al chip más cercano (30/45/60)
    sessionMinutes=[30,45,60].reduce((a,b)=>Math.abs(b-p.tiempo_minutos)<Math.abs(a-p.tiempo_minutos)?b:a);
    renderTimeChips();
  }
  if(p.nivel){ settings.level=p.nivel; persistSettings(); const sl=$('#sel-level'); if(sl) sl.value=p.nivel; }
  currentInjuries = Array.isArray(p.lesiones) ? p.lesiones : [];
  regenPlan();   // reconstruye la vista previa de la rutina con los nuevos parámetros

  // FIX 3 · Si hay perfil, la IA SOBREESCRIBE la sesión de hoy en localStorage,
  // refresca el dashboard (DOM) y deja el botón START vinculado a la nueva rutina.
  if(hasProfile()){
    const key = store.dateKey(new Date());
    store.savePlan(key, { focus:currentGroup, goal:currentGoal, minutes:sessionMinutes, intensity:'medio', note:'Ajuste IA', auto:true });  // localStorage
    syncProgress();               // los planes se sincronizan si hay sesión en la nube
    renderTodayDashboard();       // DOM: resumen y START reflejan la sesión modificada
  }
}
async function runAI(){
  const inp=$('#ai-input'); if(!inp) return;
  const text=inp.value.trim(); if(!text){ inp.focus(); return; }
  $('#ai-msg').textContent='Interpretando…';
  let p; try{ p = await api.parseUserRequest(text); }
  catch{ $('#ai-msg').textContent='No se pudo interpretar la petición.'; return; }
  applyParsed(p);
  const src = p._source==='gemini' ? '🤖 Gemini' : '📝 Intérprete local';
  $('#ai-msg').textContent = `${src}: ${TRAIN_GOALS[p.objetivo]?.label||p.objetivo} · ${sessionMinutes} min${(p.lesiones&&p.lesiones.length)?' · cuidando '+p.lesiones.join(', '):''}. Rutina actualizada ↓`;
}
$('#ai-go')?.addEventListener('click', runAI);
$('#ai-input')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); runAI(); } });

// ======================================================
// Copia de seguridad (export / import) — item 5
// ======================================================
$('#btn-export')?.addEventListener('click', ()=>{ store.exportUserData(); $('#backup-msg').textContent='✓ Descargado fitcoach_backup.json'; });
$('#btn-import')?.addEventListener('click', ()=> $('#import-file')?.click());
$('#import-file')?.addEventListener('change', e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    const res=store.importUserData(r.result);
    if(res.ok){
      settings=store.loadSettings(); applySettingsToUI();
      profileData=store.loadProfile()||profileData; if(profileData) applyProfileDefaults(profileData);
      updateTabsAccess(); renderHistory(); renderToday();
      $('#backup-msg').textContent='✓ Datos restaurados en este navegador.';
    }else{ $('#backup-msg').textContent='✗ '+res.error; }
  };
  r.readAsText(f); e.target.value='';
});

// ======================================================
// Init
// ======================================================
renderEquip();
renderGroups();
renderGoals();
renderTimeChips();
regenPlan();
applyMirror();
initAccount();            // detecta backend/sesión, carga perfil y progreso
