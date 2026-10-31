// ===== Planificador de mesociclo (esqueleto mensual) =====
// Reduce la fatiga de decisión: proyecta 4 semanas (28 días) e inyecta en el
// calendario (localStorage) el "Qué" (grupo) y el "Cuándo" (día). El "Cuánto"
// (ejercicios/series) NO se define aquí: se resuelve Just-In-Time al iniciar la
// sesión (js/generator.js), usando historial + RPE.
import { savePlan, loadPlans, dateKey } from './storage.js?v=57';

// Días de entrenamiento por semana → índices de día (0=Lunes … 6=Domingo)
const SLOTS = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};
// Estructura semanal por nº de días (IPT): frecuencia 2 por grupo muscular como base,
// repitiendo la MISMA estructura cada semana (no se rota el foco) para poder progresar.
//  1 día: Full body (F1) · 2: Full body ×2 (F2) · 3: Full body L-X-V (F3)
//  4: Torso-Pierna ×2 (F2) · 5: Torso-Pierna + Full body + Torso-Pierna
//  6: Torso-Pierna ×3 · 7: igual + movilidad
const CYCLE = {
  1: ['full'],
  2: ['full', 'full'],
  3: ['full', 'full', 'full'],
  4: ['upper', 'lower', 'upper', 'lower'],
  5: ['upper', 'lower', 'full', 'upper', 'lower'],
  6: ['upper', 'lower', 'upper', 'lower', 'upper', 'lower'],
  7: ['upper', 'lower', 'upper', 'lower', 'upper', 'lower', 'stretch'],
};
// Progresión del volumen en el mesociclo: MEV → MAV → MAV alto → descarga (MV)
const WEEK_GOAL = ['base', 'progreso', 'progreso', 'mantenimiento'];
const WEEK_INTENSITY = ['medio', 'medio', 'intenso', 'ligero'];
const WEEK_NOTE = ['Semana 1 · Base (MEV)', 'Semana 2 · Progreso (MAV)', 'Semana 3 · MAV alto', 'Semana 4 · Descarga (MV)'];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Genera (e inyecta en el calendario) el plan de las próximas 4 semanas.
// profile: { days, goal, time }.  Respeta los días que el usuario editó a mano
// (solo sobrescribe los que no existen o los marcados como automáticos).
export function generateMonthlyPlan(profile = {}) {
  const days = clamp(profile.days || 3, 1, 7);
  const slots = SLOTS[days], cycle = CYCLE[days];
  const existing = loadPlans();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const written = [];

  for (let i = 0; i < 28; i++) {
    // Suma días con Date: setDate() gestiona correctamente el cambio de mes/año.
    const d = new Date(today); d.setDate(today.getDate() + i);
    const wd = (d.getDay() + 6) % 7;              // 0=Lunes … 6=Domingo
    const slotIdx = slots.indexOf(wd);
    if (slotIdx < 0) continue;                     // día de descanso → no se planifica

    const key = dateKey(d);
    const cur = existing[key];
    if (cur && !cur.auto) continue;                // respeta planes hechos a mano

    const week = Math.floor(i / 7);
    const focus = cycle[slotIdx % cycle.length];
    const w = Math.min(week, 3);
    savePlan(key, { focus, goal: WEEK_GOAL[w], intensity: WEEK_INTENSITY[w], note: WEEK_NOTE[w], auto: true });
    written.push(key);
  }
  return { days, count: written.length, from: dateKey(today) };
}

// ¿Hay algún día planificado en los próximos `ahead` días? (para sugerir planificar)
export function hasUpcomingPlan(ahead = 7) {
  const plans = loadPlans();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < ahead; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const p = plans[dateKey(d)];
    if (p && p.focus && p.focus !== 'rest') return true;
  }
  return false;
}
