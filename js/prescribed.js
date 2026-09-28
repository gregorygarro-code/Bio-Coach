// Fase 4 · Consulta del plan prescrito por el entrenador e inyección en el motor.
import { getExercise } from './exercises.js?v=48';

const todayKey = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local

// Busca en clients_dossier/{clientId}/assigned_plans un plan con date == hoy.
export async function getTodaysPrescribedPlan(mods, clientId){
  const { db, collection, query, where, getDocs } = mods;
  const ref = collection(db, 'clients_dossier', clientId, 'assigned_plans');
  const snap = await getDocs(query(ref, where('date', '==', todayKey())));
  if(snap.empty) return null;
  return snap.docs[0].data();
}

// Convierte el JSON prescrito en el plan {steps:[...]} que consume startGuided().
export function buildPlanFromPrescription(planDoc){
  const steps = (planDoc.steps || []).map(s => {
    const ex = getExercise(s.id);
    if(!ex) return null;
    const mode = ex.type === 'hold' ? 'hold' : 'reps';
    return {
      id: ex.id, ex, name: ex.name, emoji: ex.emoji, type: ex.type, mode,
      sets: s.sets || 3,
      reps: mode === 'hold' ? 0 : (parseInt(s.reps, 10) || 10),
      repsLabel: mode === 'hold' ? null : String(s.reps ?? ''),
      secs: mode === 'hold' ? (s.secs || ex.holdDefault || 40) : 0,
      phase: s.phase || 'main',
      bilateral: !!ex.bilateral, sides: ex.bilateral ? 2 : 1,
      rest: s.rest, est: 0,
    };
  }).filter(Boolean);

  const rest = (planDoc.steps && planDoc.steps[0] && planDoc.steps[0].rest) || 90;
  return {
    steps,
    minutes: planDoc.minutes || 45,
    estMin: planDoc.estMin || null,
    goal: { key: planDoc.goal || 'prescrito', label: planDoc.title || 'Plan del entrenador', rest },
    prescribed: true,
  };
}
