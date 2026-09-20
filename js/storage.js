// ===== Historial de entrenamientos (localStorage) =====
const KEY='fitcoach.history.v1';
const SETTINGS='fitcoach.settings.v1';
const PLANS='fitcoach.plans.v1';
const PROFILE='fitcoach.profile.v1';
const SESSIONS='fitcoach.sessions.v1';   // feedback por sesión (RPE/Likert)

// Perfil local (modo invitado)
export function loadProfile(){ try{ return JSON.parse(localStorage.getItem(PROFILE))||null; }catch{ return null; } }
export function saveProfileLocal(p){ try{ localStorage.setItem(PROFILE, JSON.stringify(p)); }catch{} }
// ¿Hay un perfil guardado en este navegador? (para el CTA "Crea tu perfil")
export function hasSavedProfile(){ try{ return !!localStorage.getItem(PROFILE); }catch{ return false; } }

// Reemplaza historial y planes locales con los del servidor (al iniciar sesión)
export function replaceAll(progress){
  try{
    localStorage.setItem(KEY, JSON.stringify(progress?.history || []));
    localStorage.setItem(PLANS, JSON.stringify(progress?.plans || {}));
  }catch{}
}

export function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch{ return []; }
}
export function saveSet(entry){
  // entry: {exerciseId, name, reps, avgRom, form, ts}
  const h=loadHistory();
  h.push({...entry, ts: entry.ts ?? Date.now()});
  try{ localStorage.setItem(KEY, JSON.stringify(h)); }catch{}
}
export function clearHistory(){ try{ localStorage.removeItem(KEY); }catch{} }
// Añade campos (RPE, molestia…) a la última serie guardada
export function patchLastSet(fields){
  const h=loadHistory(); if(!h.length) return;
  Object.assign(h[h.length-1], fields);
  try{ localStorage.setItem(KEY, JSON.stringify(h)); }catch{}
}

export function loadSettings(){
  const def={mirror:true, model:'lite', rest:60, voice:true, camId:null,
             sound:true, prep:true, targetReps:10, holdSecs:40,
             textScale:'normal', contrast:false, reduceMotion:false, onboardingDone:false,
             level:'intermedio'};
  try{ return {...def, ...(JSON.parse(localStorage.getItem(SETTINGS))||{})}; }
  catch{ return def; }
}
export function saveSettings(s){ try{ localStorage.setItem(SETTINGS, JSON.stringify(s)); }catch{} }

// Agrupa el historial por día para la vista
export function groupByDay(history){
  const days={};
  for(const e of history){
    const d=new Date(e.ts);
    const key=d.toLocaleDateString('es-ES',{weekday:'long', day:'numeric', month:'long', year:'numeric'});
    (days[key] ||= []).push(e);
  }
  return days;
}

export function summary(history){
  const totalSets=history.length;
  const totalReps=history.reduce((s,e)=>s+(e.reps||0),0);
  const days=new Set(history.map(e=>new Date(e.ts).toDateString())).size;
  return {totalSets, totalReps, days};
}

// ===== Calendario: planificación de cargas =====
// plans = { 'YYYY-MM-DD': {focus, intensity, note} }
export function dateKey(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export function loadPlans(){
  try{ return JSON.parse(localStorage.getItem(PLANS)) || {}; }catch{ return {}; }
}
export function savePlan(key, plan){
  const p=loadPlans(); p[key]=plan;
  try{ localStorage.setItem(PLANS, JSON.stringify(p)); }catch{}
}
export function deletePlan(key){
  const p=loadPlans(); delete p[key];
  try{ localStorage.setItem(PLANS, JSON.stringify(p)); }catch{}
}
// Series realizadas agrupadas por fecha (dateKey → array de entradas)
export function historyByDate(){
  const h=loadHistory(), map={};
  for(const e of h){ (map[dateKey(new Date(e.ts))] ||= []).push(e); }
  return map;
}
// ===== Métricas de progreso =====
// Racha de días entrenados (consecutivos hasta hoy/ayer)
export function streak(){
  const days=new Set(loadHistory().map(e=>dateKey(new Date(e.ts))));
  if(!days.size) return 0;
  let count=0; const d=new Date();
  // permite que la racha siga viva si hoy aún no entrenó pero ayer sí
  if(!days.has(dateKey(d))) d.setDate(d.getDate()-1);
  while(days.has(dateKey(d))){ count++; d.setDate(d.getDate()-1); }
  return count;
}
// Volumen (nº de series) por semana ISO de las últimas n semanas
export function weeklyVolume(n=8){
  const h=loadHistory(); const now=new Date();
  const weeks=[];
  for(let i=n-1;i>=0;i--){
    const end=new Date(now); end.setDate(now.getDate()-i*7);
    const start=new Date(end); start.setDate(end.getDate()-6);
    const s=start.setHours(0,0,0,0), e=end.setHours(23,59,59,999);
    const sets=h.filter(x=>x.ts>=s && x.ts<=e).length;
    weeks.push({label:new Date(start).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}), sets});
  }
  return weeks;
}
// Récords personales por ejercicio (mejores reps y mejor peso)
export function personalRecords(){
  const pr={};
  for(const e of loadHistory()){
    const p=pr[e.name] || (pr[e.name]={name:e.name, unit:e.unit, bestReps:0, bestWeight:0});
    if((e.reps||0)>p.bestReps) p.bestReps=e.reps||0;
    if((e.weight||0)>p.bestWeight) p.bestWeight=e.weight||0;
  }
  return Object.values(pr);
}
export function trainedToday(){
  return loadHistory().some(e=>dateKey(new Date(e.ts))===dateKey(new Date()));
}

// ===== Sobrecarga progresiva: lectura del historial reciente =====
// Devuelve el mejor resultado del ejercicio en su ÚLTIMA sesión registrada
// (mismo día natural más reciente en que se hizo). Con esto el generador decide
// si el usuario "superó" la prescripción anterior y toca progresar.
export function lastResultFor(exerciseId){
  const h=loadHistory().filter(e=>e.exerciseId===exerciseId);
  if(!h.length) return null;
  const lastDay = dateKey(new Date(Math.max(...h.map(e=>e.ts))));   // día más reciente con ese ejercicio
  const sameDay = h.filter(e=>dateKey(new Date(e.ts))===lastDay);
  return {
    reps:   Math.max(...sameDay.map(e=>e.reps||0)),      // mejor serie de esa sesión
    unit:   sameDay[0].unit || 'reps',
    weight: Math.max(...sameDay.map(e=>e.weight||0)),
    sets:   sameDay.length,
    ts:     Math.max(...sameDay.map(e=>e.ts)),
  };
}

// ===== Feedback post-sesión (Escala Likert 1-5) =====
export function loadSessions(){ try{ return JSON.parse(localStorage.getItem(SESSIONS))||[]; }catch{ return []; } }
// feedback: { focus, goal, rpe (1-5) }
export function saveSessionFeedback(feedback){
  const s=loadSessions();
  s.push({ ...feedback, date:dateKey(new Date()), ts:Date.now() });
  try{ localStorage.setItem(SESSIONS, JSON.stringify(s)); }catch{}
}
// Último RPE (1-5) para un foco concreto (o el más reciente global si no hay del foco)
export function lastSessionRPE(focus){
  const s=loadSessions();
  if(!s.length) return null;
  const byFocus = s.filter(x=>x.focus===focus);
  const pick = (byFocus.length?byFocus:s).reduce((a,b)=>b.ts>a.ts?b:a);
  return pick.rpe ?? null;
}

// ===== Racha de entrenamientos (según el calendario) =====
// Cuenta días consecutivos "cumpliendo" hacia atrás desde hoy:
//  · Día entrenado           → +1 y reinicia el margen de descanso.
//  · Día con sesión PLANIFICADA no entrenada → corta la racha (se saltó la sesión).
//  · Día de descanso/sin plan → no cuenta ni corta, salvo que se superen los días
//    de descanso permitidos seguidos (margen ≈ 7/díasPorSemana), que también corta.
// El día en curso aún sin entrenar no penaliza (se empieza a contar desde ayer).
export function sessionStreak(profileDays=3){
  const plans=loadPlans();
  const trained=new Set(loadHistory().map(e=>dateKey(new Date(e.ts))));
  const allowedGap=Math.max(2, Math.ceil(7/Math.max(1,profileDays))+1);
  let streak=0, gap=0;
  const d=new Date(); d.setHours(0,0,0,0);
  if(!trained.has(dateKey(d))) d.setDate(d.getDate()-1);   // hoy pendiente no rompe
  for(let i=0;i<180;i++){
    const key=dateKey(d);
    const p=plans[key];
    const planned = p && p.focus && p.focus!=='rest';
    if(trained.has(key)){ streak++; gap=0; }
    else if(planned){ break; }                    // faltó a una sesión planificada
    else { gap++; if(gap>allowedGap) break; }      // demasiados días seguidos sin entrenar
    d.setDate(d.getDate()-1);
  }
  return streak;
}

// ===== Portabilidad de datos (backup local) =====
const BACKUP_KEYS = { history:KEY, settings:SETTINGS, plans:PLANS, profile:PROFILE, sessions:SESSIONS };

// Empaqueta todo el estado relevante y descarga fitcoach_backup.json
export function exportUserData(){
  const data = { app:'FitCoach Casa', kind:'backup', version:1, exportedAt:new Date().toISOString() };
  for(const [name,key] of Object.entries(BACKUP_KEYS)){
    try{ data[name] = JSON.parse(localStorage.getItem(key)); }catch{ data[name]=null; }
  }
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'fitcoach_backup.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  return data;
}

// Restaura el estado desde un JSON de backup (string). Devuelve {ok, error?}.
export function importUserData(jsonString){
  let data;
  try{ data = JSON.parse(jsonString); }
  catch{ return {ok:false, error:'El archivo no es un JSON válido.'}; }
  if(!data || typeof data!=='object' || data.kind!=='backup')
    return {ok:false, error:'No parece un backup de FitCoach Casa.'};
  try{
    for(const [name,key] of Object.entries(BACKUP_KEYS)){
      if(data[name]!==undefined && data[name]!==null) localStorage.setItem(key, JSON.stringify(data[name]));
    }
    return {ok:true};
  }catch(e){ return {ok:false, error:'No se pudo guardar en este navegador: '+e.message}; }
}
