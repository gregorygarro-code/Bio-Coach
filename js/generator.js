// ===== Sistema experto de generación de rutinas =====
// Carga el catálogo declarativo (data/exercises.json) de forma ASÍNCRONA y
// ejecuta el filtrado/selección según los parámetros del usuario. La parte
// biomecánica (funciones de medición/checks) sigue viviendo en exercises.js;
// aquí trabajamos solo con la parte declarativa + el historial (sobrecarga).
import { buildGuidedPlan, getExercise } from './exercises.js?v=33';
import { lastResultFor, loadPlans } from './storage.js?v=33';

// Semana del mesociclo (1..4+) a partir del primer día auto-planificado en el calendario
function mesoWeek(){
  try{
    const plans=loadPlans();
    const auto=Object.keys(plans).filter(k=>plans[k]&&plans[k].auto).sort();
    if(!auto.length) return 1;
    const start=new Date(auto[0]); const now=new Date(); now.setHours(0,0,0,0);
    return Math.max(1, Math.floor((now-start)/86400000/7)+1);
  }catch{ return 1; }
}
// Prescripción de "Fuerza Útil" (endurance) según la semana del mesociclo
function enduranceReps(week){
  if(week<=1) return "6 reps (peso para 18) - 85% vel.";
  if(week===2) return "6 reps (peso para 16) - 85% vel.";
  if(week===3) return "5 reps (peso para 14) - 85% vel.";
  return "3 reps (peso para 12) - 85% vel.";
}

// ---- Carga del catálogo JSON (con caché en memoria) ----
let _catalog = null, _loading = null;
export async function loadCatalog(){
  if(_catalog) return _catalog;
  if(_loading) return _loading;
  _loading = fetch('data/exercises.json?v=33')
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(j=>{ _catalog = j.exercises || []; return _catalog; })
    .catch(err=>{ console.warn('[generator] no se pudo cargar el catálogo JSON:', err.message); _catalog = []; return _catalog; });
  return _loading;
}
export function getCatalog(){ return _catalog || []; }

// ---- Mapa de contraindicaciones por lesión (lesión → ids a excluir) ----
// Conservador: ante una molestia, quitamos lo que carga o impacta esa zona.
const INJURY_CONTRA = {
  rodilla:  ['jump_squat','thruster','bulgarian','lunge','push_press'],
  hombro:   ['ohp','push_press','upright_row','dip','thruster','lateral','pullup'],
  espalda:  ['rdl','swing','thruster','superman','cobra','upright_row','deadlift','remo_pendlay','remo_barra_hexagonal'],
  lumbar:   ['rdl','swing','thruster','superman','cobra','good_morning','buenos_dias','peso_muerto_convencional','sentadilla_trasera','remo_pendlay','row','russian_twists_disco','side_bends'],
  cadera:   ['swing','bulgarian','lunge','jump_squat'],
  tobillo:  ['jump_squat','thruster','marching'],
  muneca:   ['pushup','plank','mountain_climber','dip','scapular_pushup','bird_dog'],
  cuello:   ['crunch','bicycle','upright_row'],
  codo:     ['dip','pullup','triceps_ext'],
};
// Normaliza texto de lesión (minúsculas, sin acentos) para casar con las claves
const norm = s => (s||'').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

// Devuelve un Set de ids contraindicados a partir de una lista de lesiones libres
export function injuriesToExclude(injuries=[]){
  const ex = new Set();
  for(const raw of injuries){
    const n = norm(raw);
    for(const [key, ids] of Object.entries(INJURY_CONTRA)){
      if(n.includes(key)) ids.forEach(id=>ex.add(id));
    }
  }
  return ex;
}

// ---- Sustitución inteligente por lesión lumbar (Fallback) ----
// Si tras excluir los lifts de estrés axial la rutina se queda sin un patrón de
// tirón o de bisagra, fuerza una alternativa segura según el equipo del perfil.
const PULL_PATTERN  = ['row','trx_row','remo_soporte_pecho','remo_una_mano','remo_pendlay','remo_barra_hexagonal','facepull','pullup'];
const HINGE_PATTERN = ['rdl','deadlift','peso_muerto_convencional','peso_muerto_hexagonal','peso_muerto_rumano','single_leg_dl','hip_thrust','swing','kb_swing_end','buenos_dias'];
function swapExercise(step, ex){
  if(!step || !ex) return;
  step.id=ex.id; step.ex=ex; step.name=ex.name; step.emoji=ex.emoji;
  step.type=ex.type||'reps'; step.mode = ex.type==='hold' ? 'hold' : 'reps';
  step.bilateral=!!ex.bilateral; step.sides=ex.bilateral?2:1;
}
function forceLumbarSafe(plan, equip){
  const cap = k => !!(equip && equip.has(k));
  let mains = plan.steps.filter(s=>s.phase==='main');
  if(!mains.length) return;
  // Patrón de tirón/espalda: remo con soporte en pecho (mancuernas) o remo en TRX (banda)
  if(!mains.some(s=>PULL_PATTERN.includes(s.id))){
    const sub = cap('dumbbell') ? getExercise('remo_soporte_pecho')
              : cap('band')     ? getExercise('trx_row') : null;
    if(sub) swapExercise(mains[mains.length-1], sub);
  }
  // Patrón de bisagra/cadera: peso muerto hexagonal (barra) o hip thrust
  mains = plan.steps.filter(s=>s.phase==='main');
  if(!mains.some(s=>HINGE_PATTERN.includes(s.id))){
    const sub = cap('bar') ? getExercise('peso_muerto_hexagonal') : getExercise('hip_thrust');
    if(sub) swapExercise(mains[0], sub);
  }
}

// ---- Filtrado de candidatos SOBRE el JSON (demuestra el motor de reglas) ----
// equip: Set de capacidades (bodyweight|dumbbell|band|bar)
export function filterCandidates(params){
  const { equip, group, exclude=new Set() } = params;
  return getCatalog().filter(e=>{
    if(exclude.has(e.id)) return false;
    if(equip && !e.equipment.some(k=>equip.has(k))) return false;
    if(group && group!=='all' && group!=='full'){
      if(group==='upper')  return e.group==='upper' || e.group==='core';
      return e.group===group;
    }
    return e.group!=='stretch' && e.group!=='prevencion';   // full body
  });
}

// ===== Sobrecarga progresiva (Progressive Overload) =====
// Dos señales combinadas:
//  (A) Rendimiento por ejercicio: ¿alcanzó/superó lo prescrito la última vez?
//  (B) Esfuerzo percibido de la ÚLTIMA sesión (feel, Likert 1-5):
//      1 "muy fácil"  → progresa AGRESIVO   2 "fácil" → progresa moderado
//      3 "perfecto"   → progresión normal   4 "duro"  → mantiene
//      5 "extenuante" → REDUCE la carga
// feelBump() traduce ese 1-5 en un delta de repeticiones/segundos a nivel de sesión.
function feelDelta(feel){
  // Δreps para ejercicios de repeticiones y Δsegundos para isométricos
  switch(feel){
    case 1: return { reps:+3, secs:+10, tag:'agresiva (fue muy fácil)' };
    case 2: return { reps:+2, secs:+5,  tag:'(fue fácil)' };
    case 4: return { reps:-1, secs:-5,  tag:'suave (fue dura)' };
    case 5: return { reps:-2, secs:-10, tag:'baja carga (fue extenuante)' };
    default: return { reps:0, secs:0, tag:'' };   // 3 o sin dato → sin cambio de sesión
  }
}

function applyProgressiveOverload(plan, feel){
  const fd = feelDelta(feel);
  for(const step of plan.steps){
    if(step.phase!=='main') continue;               // solo progresa el bloque principal

    // (B) Ajuste global por esfuerzo percibido de la última sesión de este foco
    if(fd.reps || fd.secs){
      if(step.mode==='hold'){
        step.secs = Math.max(10, step.secs + fd.secs);
      }else{
        step.reps = Math.max(5, step.reps + fd.reps);
        step.repsLabel = `${step.reps}`;
      }
      if(fd.tag) step.overload = { note:`Ajuste ${fd.tag}` };
    }

    const last = lastResultFor(step.id);
    if(!last) continue;                              // sin historial → solo aplica (B)

    if(step.mode==='hold'){
      // MATEMÁTICA (isométricos): si aguantó ≥ los segundos prescritos → +5 s
      if(last.unit==='seg' && last.reps >= step.secs){
        step.secs += 5;
        step.overload = { note:`Progresión: +5 s (antes ${last.reps}s)` };
      }
    } else {
      // MATEMÁTICA (reps): prescripción = extremo alto (step.reps).
      // Si la mejor serie previa (last.reps) ≥ prescrito → el ejercicio "se superó".
      if(last.unit==='reps' && last.reps >= step.reps){
        if(step.ex && step.ex.weighted && last.weight>0){
          // Con carga: mejor subir peso que acumular reps infinitas
          step.overload = { note:`Progresión: sube el peso (última: ${last.weight}${last.wunit||'kg'} × ${last.reps})` };
        } else if(step.reps < 15){
          // Rango bajo/medio: +2 repeticiones
          step.reps += 2;
          step.repsLabel = `${step.reps}`;
          step.overload = { note:`Progresión: +2 reps (antes ${last.reps})` };
        } else if(step.sets < 4){
          // Reps ya altas: mejor +1 serie que seguir subiendo reps
          step.sets += 1;
          step.overload = { note:`Progresión: +1 serie (reps ya altas)` };
        } else {
          // Techo de volumen: progresa por tempo (más tiempo bajo tensión)
          step.overload = { note:'Progresión: baja más lento (tempo 3-1-3)' };
        }
      }
    }
  }
  return plan;
}

// ---- Filtro de poblaciones especiales (bajo impacto) ----
// Excluye ejercicios balísticos/pliométricos/de potencia (saltos, swings, thrusters…).
const BALLISTIC_IDS = ['jump_squat','thruster','push_press','swing'];
function lowImpactExclusions(){
  const ex = new Set(BALLISTIC_IDS);
  getCatalog().forEach(e=>{ if(e.explosive) ex.add(e.id); });   // usa la etiqueta del catálogo
  return ex;
}

// ---- Programación en Super-series antagonistas ----
// Empareja pasos principales adyacentes (la selección ya alterna empuje/tracción/
// inferior/core), formando bloques de 2 → "Superserie Antagonista". Calentamiento y
// vuelta a la calma quedan como bloques individuales. NO reordena la ejecución real
// (plan.steps se conserva intacto para el motor); esto es la estructura/vista.
function stepDTO(s, repsOverride){
  return {
    id: s.id, nombre: s.name, emoji: s.emoji, modo: s.mode,
    series: s.sets,
    reps: s.mode==='hold' ? null : (repsOverride || s.repsLabel || String(s.reps)),
    segundos: s.mode==='hold' ? s.secs : null,
    bilateral: !!s.bilateral,
    est_seg: s.est,
  };
}
function buildBlocks(plan, restPost, opts={}){
  const blocks = []; let n = 0;
  const warm = plan.steps.filter(s=>s.phase==='warmup');
  const main = plan.steps.filter(s=>s.phase==='main');
  const cool = plan.steps.filter(s=>s.phase==='cooldown');
  const PHASE_REST = 10;
  const endurance = !!opts.endurance;
  const reps = endurance ? enduranceReps(opts.week||1) : null;
  const mainIntra = endurance ? 180 : 15;   // descanso_entre_ejercicios
  const mainPost  = endurance ? 180 : restPost;   // descanso_entre_series / post-bloque

  for(const s of warm)
    blocks.push({ bloque:++n, tipo:'Calentamiento', ejercicios:[stepDTO(s)], descanso_entre_ejercicios:0, descanso_post_bloque:PHASE_REST });

  // Empareja principales de dos en dos (antagonista por la alternancia de la selección)
  for(let i=0; i<main.length; i+=2){
    const par = main.slice(i, i+2).map(s=>stepDTO(s, reps));
    blocks.push({
      bloque: ++n,
      tipo: par.length===2 ? 'Superserie' : 'Serie',
      ejercicios: par,
      descanso_entre_ejercicios: par.length===2 ? mainIntra : 0,
      descanso_entre_series: mainPost,
      descanso_post_bloque: mainPost,
    });
  }

  for(const s of cool)
    blocks.push({ bloque:++n, tipo:'Vuelta a la calma', ejercicios:[stepDTO(s)], descanso_entre_ejercicios:0, descanso_post_bloque:PHASE_REST });

  return blocks;
}

// ===== API pública del generador =====
// params: { group, equip:Set, minutes, goal, level, age, sex, injuries:[], isBajoImpacto }
export async function generateRoutine(params){
  await loadCatalog();                              // garantiza catálogo (y caché offline)
  const exclude = injuriesToExclude(params.injuries || []);

  // Poblaciones especiales: si el perfil es de bajo impacto, fuera balísticos/pliométricos.
  if(params.isBajoImpacto) for(const id of lowImpactExclusions()) exclude.add(id);

  // (El filtrado sobre el JSON queda disponible/depurable; la selección final,
  //  con calentamiento, vuelta a la calma y ajuste al tiempo, la resuelve el
  //  motor probado de exercises.js, al que pasamos la exclusión.)
  const candidates = filterCandidates({ equip:params.equip, group:params.group, exclude });

  const plan = buildGuidedPlan(params.group, params.equip, params.minutes, {
    goal: params.goal, level: params.level, age: params.age, sex: params.sex,
    rest: params.rest, exclude,
  });

  // Sustitución inteligente: si hay lesión lumbar, garantiza patrones seguros.
  if((params.injuries||[]).some(x=>norm(x).includes('lumbar'))) forceLumbarSafe(plan, params.equip);

  plan.candidateCount = candidates.length;
  plan.injuriesApplied = [...exclude];
  plan.bajoImpacto = !!params.isBajoImpacto;
  // feel = RPE (1-5) de la última sesión de este foco → modula la progresión
  applyProgressiveOverload(plan, params.feel);

  // Estructura estricta de bloques/super-series (para preview y programación avanzada)
  const endurance = params.goal==='endurance' || params.objetivo==='endurance';
  plan.blocks = buildBlocks(plan, (plan.goal && plan.goal.rest) || params.rest || 60,
    { endurance, week: mesoWeek() });
  return plan;
}
