// ===== Planificador de mesociclo (esqueleto mensual) =====
// Reduce la fatiga de decisión: proyecta 4 semanas (28 días) e inyecta en el
// calendario (localStorage) el "Qué" (grupo) y el "Cuándo" (día). El "Cuánto"
// (ejercicios/reps) NO se define aquí: se resuelve Just-In-Time al iniciar la
// sesión (js/generator.js), usando historial + RPE.
import { savePlan, loadPlans, dateKey } from './storage.js?v=29';

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
// Ciclo de focos por nº de días (se rota cada semana para dar variedad/recuperación)
const CYCLE = {
  1: ['full'],
  2: ['upper', 'lower'],
  3: ['lower', 'upper', 'full'],
  4: ['lower', 'upper', 'core', 'full'],
  5: ['lower', 'upper', 'core', 'full', 'prevencion'],
  6: ['lower', 'upper', 'core', 'full', 'lower', 'upper'],
  7: ['lower', 'upper', 'core', 'full', 'lower', 'upper', 'stretch'],
};
// Ondulación de intensidad del mesociclo: 3 semanas progresivas + descarga
const WEEK_INTENSITY = ['medio', 'medio', 'intenso', 'ligero'];

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
    const focus = cycle[(slotIdx + week) % cycle.length];   // rota el foco por semana
    const intensity = WEEK_INTENSITY[week] || 'medio';
    savePlan(key, { focus, intensity, note: 'Plan mensual', auto: true });
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
