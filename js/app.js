// ===== FitCoach Casa · app principal =====
import { EXERCISES, EQUIPMENT, EQUIPMENT_DETAIL, capsFromDetail, GROUPS, TRAIN_GOALS, RepCounter, exercisesForGroup, buildGuidedPlan, levelReps, getExercise, POSE_CONNECTIONS } from './exercises.js?v=12';
import { createPoseLandmarker } from './pose.js?v=12';
import { createDemoPlayer } from './demos.js?v=12';
import { LandmarkSmoother, clamp, round, fmtTime, speak, setVoice, vis, LM } from './utils.js?v=12';
import { sfx, setSound, unlock as unlockAudio } from './audio.js?v=12';
import * as api from './api.js?v=12';
import * as store from './storage.js?v=12';

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ---------- Estado ----------
let settings = store.loadSettings();
let equipDetail = new Set(['bodyweight','dumbbells','bands','bench','barbell','pullup_bar']); // equipo detallado
let equipWeights = {};                                                                        // pesos por equipo
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
let currentGuidedPlan = null;            // plan generado (se reusa al empezar / regenerar variante)
let guided = { active:false, plan:null, i:0, set:1, done:0, rest:60 };
let guidedPreview = false;               // el modal de demo abre para el siguiente paso guiado
let lastVideoTs = -1;
let fpsEma = 0, lastFrame = performance.now();
let lastFormRun = 0;
let sessionSetsSummary = [];  // resumen de las series del ejercicio actual

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
  if(t.dataset.view==='historial') renderHistory();
  if(t.dataset.view==='calendario') renderCalendar();
  if(t.dataset.view==='perfil') renderPerfil();
}));

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

// Genera (y guarda) un plan nuevo con variedad y refresca la vista previa
function regenPlan(){
  currentGuidedPlan = buildGuidedPlan(currentGroup, selectedEquip, sessionMinutes,
    {rest:settings.rest, level:settings.level, goal:currentGoal});
  renderGuidedPreview();
}

function renderGuidedPreview(){
  const box=$('#guided-preview');
  const plan=currentGuidedPlan;
  if(!plan || !plan.steps.length){ box.innerHTML='<p class="muted small">No hay ejercicios para esta combinación. Prueba con otro equipamiento u objetivo.</p>'; return; }
  const label = GROUPS[currentGroup]?.label || 'Full body';
  const G = plan.goal;
  const items = plan.steps.map((s,i)=>{
    const dose = s.mode==='hold' ? `${s.sets>1?s.sets+'× ':''}${s.secs}s` : `${s.sets} × ${s.repsLabel||s.reps}`;
    const ph = s.phase!=='main' ? `<span class="gp-phase ${s.phase}">${PHASE_LABEL[s.phase]}</span>` : '';
    const cues = s.ex.cues.map(c=>`<li>${c}</li>`).join('');
    return `<details class="gp-item">
      <summary class="gp-sum">
        <span class="gp-emoji">${s.emoji}</span>
        <span class="gp-main"><span class="gp-name">${i+1}. ${s.name}</span> ${ph}</span>
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

function startGuided(){
  if(!currentGuidedPlan || !currentGuidedPlan.steps.length){ alert('No hay ejercicios para esta combinación de equipamiento y objetivo.'); return; }
  unlockAudio();
  guided={ active:true, plan:currentGuidedPlan.steps, i:0, set:1, done:0, rest:currentGuidedPlan.goal.rest };
  guidedPreview=true;
  openPreview(guided.plan[0].ex);   // muestra la demo del primer ejercicio; "Empezar" lo carga
}

function loadGuidedStep(i){
  const step=guided.plan[i];
  openSession(step.ex);            // prepara la sesión (resetea contadores, demo, etc.)
  guided.set=1;
  // fija el objetivo según el plan (reps/tiempo del esquema)
  if(step.mode==='hold'){ $('#in-secs').value=step.secs; }
  else { $('#in-timed').checked=false; $('#obj-time').classList.add('hidden'); $('#in-target').value=step.reps; }
  $('#guided-bar').classList.remove('hidden');
  updateGuidedBar();
  // arranca automáticamente si la cámara ya está activa (o no hace falta)
  if(running || step.ex.camOptional){ startSet(); }
  else { $('#cam-status').innerHTML='Activa la cámara para empezar la rutina guiada'; }
}

function updateGuidedBar(){
  const n=guided.plan.length, step=guided.plan[guided.i];
  $('#gb-title').textContent=`Rutina guiada · Ejercicio ${guided.i+1}/${n} · Serie ${guided.set}/${step.sets}`;
  $('#gb-fill').style.width=`${(guided.i/n)*100}%`;
  const next=guided.plan[guided.i+1];
  const dose = step.mode==='hold' ? `${step.secs}s` : `${step.repsLabel||step.reps} reps`;
  $('#gb-next').innerHTML = next
    ? `Ahora: <b>${step.name}</b> (${dose}) · Siguiente: ${next.emoji} ${next.name}`
    : `Ahora: <b>${step.name}</b> (${dose}) · Último ejercicio`;
}

// Llamado desde endSet cuando el modo guiado está activo y se guardó una serie
function guidedAfterSet(){
  const step=guided.plan[guided.i];
  guided.done++;
  if(guided.set < step.sets){
    guided.set++;
    updateGuidedBar();
    startRest(()=>{ if(guided.active) startSet(); });        // siguiente serie automática tras el descanso
  }else{
    if(guided.i < guided.plan.length-1){
      guided.i++; guided.set=1;
      guidedPreview=true;
      openPreview(guided.plan[guided.i].ex);   // muestra la demo del siguiente durante el descanso
      startRest(()=>{ if(guided.active && guidedPreview){ guidedPreview=false; closePreview(); loadGuidedStep(guided.i); } });
    }else{
      guidedFinish();
    }
  }
}

function guidedFinish(){
  const total=guided.done;
  guided.active=false;
  $('#guided-bar').classList.add('hidden');
  clearInterval(restInterval); $('#rest-timer').classList.add('hidden');
  speak('Rutina completada, buen trabajo',{force:true});
  alert(`🎉 ¡Rutina completada!\n\nSeries realizadas: ${total}\nGrupo: ${GROUPS[currentGroup]?.label||'Full body'} · Objetivo: ${TRAIN_GOALS[currentGoal].label} · ${sessionMinutes} min`);
  $('#panel-session').classList.add('hidden');
  $('#panel-setup').classList.remove('hidden');
  regenPlan();   // propone una variante nueva para la próxima
}

$('#btn-guided').addEventListener('click', startGuided);
$('#btn-variant').addEventListener('click', ()=>{ regenPlan(); });
$('#gb-skip').addEventListener('click', ()=>{
  if(!guided.active) return;
  if(setActive) endSet(false);
  clearInterval(restInterval); $('#rest-timer').classList.add('hidden');
  if(guided.i < guided.plan.length-1){ guided.i++; guided.set=1; guidedPreview=true; openPreview(guided.plan[guided.i].ex); }
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
    loadGuidedStep(guided.i);
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
  if(guided.active && !setActive) startSet();
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

  // conexiones
  ctx.lineWidth=4; ctx.strokeStyle='rgba(63,185,80,.9)'; ctx.lineCap='round';
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
    ctx.fillStyle='#2f81f7'; ctx.fill();
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
  targetReached=false; repsDone=0; lastPhase='reset';
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
  setActive=true;
  counter.reset(); smoother.reset(); lastPhase='reset';
  holdStart=performance.now();
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
  setActive=false;
  $('#btn-set').disabled=false;
  $('#btn-set').textContent = currentEx.type==='hold' ? 'Iniciar' : 'Iniciar serie';
  $('#btn-set').classList.add('accent'); $('#btn-set').classList.remove('primary');
  if(save){
    let reps, unit;
    if(setMode==='hold'){ reps=Math.max(0, setTargetSecs-Math.max(timeLeft,0)); unit='seg'; }
    else { reps=counter.reps; unit='reps'; }
    if(reps>0){
      const weight = currentEx.weighted ? Math.max(0, parseFloat($('#in-weight').value)||0) : 0;
      const entry={
        exerciseId:currentEx.id, name:currentEx.name, reps, unit,
        weight: weight>0 ? weight : null,
        avgRom: counter.lastRom!=null?Math.round(counter.lastRom):null,
        set:setNumber, ts:Date.now(),
      };
      store.saveSet(entry);
      syncProgress();
      sessionSetsSummary.push(entry);
      speak(`Serie completada, ${reps} ${unit==='seg'?'segundos':'repeticiones'}`, {force:true});
      setNumber++;
      $('#set-count').textContent=setNumber;
      if(guided.active){ guidedAfterSet(); }
      else { if(!askRPE()) startRest(); }   // en modo manual pregunta el esfuerzo antes del descanso
    }
  }
}

function clampInt(v,min,max,def){ v=parseInt(v,10); if(isNaN(v)) return def; return Math.max(min,Math.min(max,v)); }

function finishExercise(){
  if(sessionSetsSummary.length){
    const total=sessionSetsSummary.reduce((s,e)=>s+e.reps,0);
    alert(`¡Ejercicio terminado!\n\n${currentEx.name}\nSeries: ${sessionSetsSummary.length}\nTotal: ${total} ${sessionSetsSummary[0].unit}`);
  }
  $('#panel-session').classList.add('hidden');
  $('#panel-setup').classList.remove('hidden');
  regenPlan();
}

// ======================================================
// Temporizador de descanso
// ======================================================
let restInterval=null;
let restOnDone=null;
function startRest(onDone){
  clearInterval(restInterval);
  restOnDone = onDone || null;
  let left = (guided.active && guided.rest) ? guided.rest : settings.rest;   // descanso del esquema en modo guiado
  const el=$('#rest-timer'), val=$('#rest-val');
  el.classList.remove('hidden'); val.textContent=fmtTime(left);
  restInterval=setInterval(()=>{
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
    cell.onclick=()=>openDay(key, date);
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

$('#chk-mirror').addEventListener('change', e=>{ settings.mirror=e.target.checked; store.saveSettings(settings); applyMirror(); });
$('#chk-voice').addEventListener('change', e=>{ settings.voice=e.target.checked; setVoice(settings.voice); store.saveSettings(settings); });
$('#chk-sound').addEventListener('change', e=>{ settings.sound=e.target.checked; setSound(settings.sound); store.saveSettings(settings); if(settings.sound){ unlockAudio(); sfx.rep(1); } });
$('#chk-prep').addEventListener('change', e=>{ settings.prep=e.target.checked; store.saveSettings(settings); });
$('#in-def-target').addEventListener('change', e=>{ settings.targetReps=clampInt(e.target.value,1,100,10); e.target.value=settings.targetReps; store.saveSettings(settings); });
$('#in-def-secs').addEventListener('change', e=>{ settings.holdSecs=clampInt(e.target.value,5,600,40); e.target.value=settings.holdSecs; store.saveSettings(settings); });
$('#rng-rest').addEventListener('input', e=>{ settings.rest=+e.target.value; $('#rest-label').textContent=settings.rest+'s'; store.saveSettings(settings); });
$('#sel-model').addEventListener('change', async e=>{
  settings.model=e.target.value; store.saveSettings(settings);
  if(landmarker){ try{ landmarker.close?.(); }catch{} landmarker=null; running=false; await ensureModel(); if(stream){ running=true; requestAnimationFrame(loop);} }
});
$('#sel-cam').addEventListener('change', e=>{ settings.camId=e.target.value; store.saveSettings(settings); if(stream) startCamera(); });

// --- Accesibilidad y nivel (Fase 1 y 2) ---
$('#sel-scale').value=settings.textScale;
$('#chk-contrast').checked=settings.contrast;
$('#chk-motion').checked=settings.reduceMotion;
$('#sel-level').value=settings.level;
$('#sel-scale').addEventListener('change', e=>{ settings.textScale=e.target.value; store.saveSettings(settings); applyAccessibility(); });
$('#chk-contrast').addEventListener('change', e=>{ settings.contrast=e.target.checked; store.saveSettings(settings); applyAccessibility(); });
$('#chk-motion').addEventListener('change', e=>{ settings.reduceMotion=e.target.checked; store.saveSettings(settings); applyAccessibility(); });
$('#sel-level').addEventListener('change', e=>{ settings.level=e.target.value; store.saveSettings(settings); renderGuidedPreview(); });
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
function finishOnb(){ settings.onboardingDone=true; store.saveSettings(settings); $('#onboarding').classList.add('hidden'); }
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

function syncProgress(now=false){
  if(!auth.loggedIn) return;
  clearTimeout(syncTimer);
  const go = ()=> api.saveProgress(store.loadHistory(), store.loadPlans());
  if(now) go(); else syncTimer = setTimeout(go, 800);
}

// Aplica el perfil a los valores por defecto de la rutina guiada
function applyProfileDefaults(p){
  if(!p) return;
  if(Array.isArray(p.equip)){
    const valid = p.equip.filter(id=>EQUIPMENT_DETAIL.some(e=>e.id===id));
    if(valid.length){ equipDetail = new Set(valid); }
  }
  if(p.equipWeights) equipWeights = {...p.equipWeights};
  selectedEquip = capsFromDetail(equipDetail);
  if(p.goal && TRAIN_GOALS[p.goal]) currentGoal = p.goal;
  if(p.time && [30,45,60].includes(+p.time)) sessionMinutes = +p.time;
  if(p.level){ settings.level = p.level; store.saveSettings(settings); const sl=$('#sel-level'); if(sl) sl.value=p.level; }
  renderEquip(); renderGoals(); renderTimeChips(); regenPlan();
}

function currentProfile(){
  return profileData || {
    time: sessionMinutes, goal: currentGoal, level: settings.level,
    equip: [...equipDetail], equipWeights: {...equipWeights},
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
  $('#pf-weight').value = p.weight ?? '';
  $('#pf-height').value = p.height ?? '';
  $('#pf-days').value = p.days ?? '';
  $('#pf-time').value = p.time ?? sessionMinutes;
  $('#pf-goal').value = p.goal ?? currentGoal;
  $('#pf-level').value = p.level ?? settings.level;
  $('#pf-notes').value = p.notes ?? '';
  renderProfileEquip();     // refleja equipDetail + equipWeights globales
}

function gatherProfile(){
  return {
    age:+$('#pf-age').value||null, weight:+$('#pf-weight').value||null, height:+$('#pf-height').value||null,
    days:+$('#pf-days').value||null, time:+$('#pf-time').value, goal:$('#pf-goal').value,
    level:$('#pf-level').value, equip:[...equipDetail], equipWeights:{...equipWeights},
    notes:$('#pf-notes').value.trim(),
  };
}

function renderPerfil(){
  const gp=$('#pf-goal');
  if(!gp.dataset.built){ gp.innerHTML=Object.entries(TRAIN_GOALS).map(([k,g])=>`<option value="${k}">${g.label}</option>`).join(''); gp.dataset.built='1'; }
  if(auth.backend && !auth.loggedIn){ $('#auth-card').hidden=false; $('#profile-card').hidden=true; updateAuthMode(); return; }
  $('#auth-card').hidden=true; $('#profile-card').hidden=false;
  if(auth.loggedIn){
    $('#profile-who').textContent = `${auth.user.name} · ${auth.user.email}`;
    $('#profile-mode').textContent = '';
    $('#pf-logout').hidden = false;
  }else{
    $('#profile-who').textContent = 'Modo invitado';
    $('#profile-mode').textContent = 'Tu perfil y tu progreso se guardan en este navegador (localStorage).';
    $('#pf-logout').hidden = true;
  }
  fillProfileForm(currentProfile());
}

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
    renderPerfil(); renderHistory();
  }else{
    $('#auth-msg').textContent = r.error || 'No se pudo completar.';
  }
});
$('#pf-logout').addEventListener('click', async ()=>{ await api.logout(); auth.loggedIn=false; auth.user=null; renderPerfil(); });
$('#pf-save').addEventListener('click', async ()=>{
  const p = gatherProfile(); profileData = p;
  if(auth.loggedIn) await api.saveProfile(p); else store.saveProfileLocal(p);
  applyProfileDefaults(p);
  $('#pf-msg').textContent = '✓ Perfil guardado. La rutina guiada se ha ajustado a tu perfil.';
  setTimeout(()=>{ $('#pf-msg').textContent=''; }, 3000);
});

async function initAccount(){
  const s = await api.me();
  auth.backend = s.backend; auth.loggedIn = !!s.loggedIn; auth.user = s.user || null;
  if(s.loggedIn && s.progress) store.replaceAll(s.progress);
  profileData = (s.loggedIn ? s.profile : null) || store.loadProfile();
  if(profileData) applyProfileDefaults(profileData);
  renderPerfil();
}

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
startOnboarding(false);   // tutorial la primera vez
