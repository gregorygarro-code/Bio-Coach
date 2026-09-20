// ===== Sistema experto de generación de rutinas =====
// Carga el catálogo declarativo (data/exercises.json) de forma ASÍNCRONA y
// ejecuta el filtrado/selección según los parámetros del usuario. La parte
// biomecánica (funciones de medición/checks) sigue viviendo en exercises.js;
// aquí trabajamos solo con la parte declarativa + el historial (sobrecarga).
import { buildGuidedPlan, getExercise } from './exercises.js?v=22';
import { lastResultFor } from './storage.js?v=22';

// ---- Carga del catálogo JSON (con caché en memoria) ----
let _catalog = null, _loading = null;
export async function loadCatalog(){
  if(_catalog) return _catalog;
  if(_loading) return _loading;
  _loading = fetch('data/exercises.json?v=22')
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(j=>{ _catalog = j.exercises || []; return _catalog; })
    .catch(err=>{ console.warn('[generator] no se pudo cargar el catálogo JSON:', err.message); _catalog = []; return _catalog; });
  return _loading;
}
export function getCatalog(){ return _catalog || []; }

// ---- Mapa de contraindicaciones por lesión (lesión → ids a excluir) ----
// Conservador: ante una molestia, quitamos lo que carga o impacta esa zona.
const INJURY_CONTRA = {
  rodilla:  ['jump_squat','jumping_jacks','thruster','bulgarian','lunge','push_press'],
  hombro:   ['ohp','push_press','upright_row','dip','thruster','lateral','pullup'],
  espalda:  ['rdl','swing','thruster','superman','cobra','upright_row','deadlift'],
  lumbar:   ['rdl','swing','thruster','superman','cobra','good_morning'],
  cadera:   ['swing','bulgarian','lunge','jump_squat'],
  tobillo:  ['jump_squat','jumping_jacks','thruster','marching'],
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
          step.overload = { note:`Progresión: sube el peso (última: ${last.weight}kg × ${last.reps})` };
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

// ===== API pública del generador =====
// params: { group, equip:Set, minutes, goal, level, age, sex, injuries:[] }
export async function generateRoutine(params){
  await loadCatalog();                              // garantiza catálogo (y caché offline)
  const exclude = injuriesToExclude(params.injuries || []);

  // (El filtrado sobre el JSON queda disponible/depurable; la selección final,
  //  con calentamiento, vuelta a la calma y ajuste al tiempo, la resuelve el
  //  motor probado de exercises.js, al que pasamos la exclusión por lesiones.)
  const candidates = filterCandidates({ equip:params.equip, group:params.group, exclude });

  const plan = buildGuidedPlan(params.group, params.equip, params.minutes, {
    goal: params.goal, level: params.level, age: params.age, sex: params.sex,
    rest: params.rest, exclude,
  });

  plan.candidateCount = candidates.length;
  plan.injuriesApplied = [...exclude];
  // feel = RPE (1-5) de la última sesión de este foco → modula la progresión
  return applyProgressiveOverload(plan, params.feel);
}
