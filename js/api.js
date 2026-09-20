// ===== Cliente de Supabase (auth + datos por usuario) =====
// Se configura en js/config.js (window.APP_CONFIG). Si no está configurado,
// todas devuelven backend:false y la app funciona en "modo invitado" (localStorage).
// La anon key es PÚBLICA; la seguridad la dan las políticas RLS de Supabase.

let _sb;   // undefined = sin inicializar; null = no configurado
function client(){
  if(_sb !== undefined) return _sb;
  const c = window.APP_CONFIG || {};
  _sb = (c.supabaseUrl && c.supabaseAnonKey && window.supabase)
    ? window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey)
    : null;
  return _sb;
}
const nameOf = u => (u.user_metadata && u.user_metadata.name) || (u.email||'').split('@')[0];

async function fetchData(sb, uid){
  const [pr, pg] = await Promise.all([
    sb.from('fc_profiles').select('data').eq('user_id', uid).maybeSingle(),
    sb.from('fc_progress').select('data').eq('user_id', uid).maybeSingle(),
  ]);
  return { profile: pr.data?.data || null, progress: pg.data?.data || null };
}

export async function me(){
  const sb = client(); if(!sb) return { backend:false };
  try{
    const { data:{ session } } = await sb.auth.getSession();  // lee de local, sin red si no hay sesión
    const user = session?.user;
    if(!user) return { backend:true, loggedIn:false };
    const d = await fetchData(sb, user.id);
    return { backend:true, loggedIn:true, user:{id:user.id, email:user.email, name:nameOf(user)}, ...d };
  }catch{ return { backend:true, loggedIn:false }; }
}

export async function register(email, name, password){
  const sb = client(); if(!sb) return { backend:false, ok:false, error:'Configura Supabase (ver README).' };
  const { data, error } = await sb.auth.signUp({ email, password, options:{ data:{ name } } });
  if(error) return { backend:true, ok:false, error:error.message };
  if(!data.session) return { backend:true, ok:true, loggedIn:false, error:'Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.' };
  const u = data.user;
  return { backend:true, ok:true, loggedIn:true, user:{id:u.id, email:u.email, name:nameOf(u)}, profile:null, progress:null };
}

export async function login(email, password){
  const sb = client(); if(!sb) return { backend:false, ok:false, error:'Configura Supabase (ver README).' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) return { backend:true, ok:false, error:error.message };
  const u = data.user; const d = await fetchData(sb, u.id);
  return { backend:true, ok:true, loggedIn:true, user:{id:u.id, email:u.email, name:nameOf(u)}, ...d };
}

export async function logout(){ const sb = client(); if(sb) await sb.auth.signOut(); }

// Notifica cambios de sesión (login, logout, confirmación por email que llega
// con el token en la URL, refresco de token). Devuelve una función para cancelar.
export function onAuthChange(cb){
  const sb = client(); if(!sb) return ()=>{};
  const { data } = sb.auth.onAuthStateChange((event)=>cb(event));
  return () => data?.subscription?.unsubscribe?.();
}

export async function saveProfile(profile){
  const sb = client(); if(!sb) return false;
  const { data:{ user } } = await sb.auth.getUser(); if(!user) return false;
  const { error } = await sb.from('fc_profiles').upsert({ user_id:user.id, data:profile, updated_at:new Date().toISOString() });
  return !error;
}

export async function saveProgress(history, plans, settings){
  const sb = client(); if(!sb) return false;
  const { data:{ user } } = await sb.auth.getUser(); if(!user) return false;
  const { error } = await sb.from('fc_progress').upsert({ user_id:user.id, data:{ history, plans, settings }, updated_at:new Date().toISOString() });
  return !error;
}

// ============================================================
// IA conversacional (NLP → JSON) con Gemini gemini-1.5-flash
// ------------------------------------------------------------
// Zero-server: la clave la pone el usuario (BYO key) y se guarda SOLO en su
// navegador. Si no hay clave, se usa un parser local por palabras clave (sin
// llamadas externas), para mantener el modo 100% local/offline.
// ============================================================
const GEMINI_KEY = 'fitcoach.geminiKey';
export function getGeminiKey(){ try{ return localStorage.getItem(GEMINI_KEY) || (window.APP_CONFIG&&window.APP_CONFIG.geminiKey) || ''; }catch{ return ''; } }
export function setGeminiKey(k){ try{ k ? localStorage.setItem(GEMINI_KEY, k.trim()) : localStorage.removeItem(GEMINI_KEY); }catch{} }
export function hasGeminiKey(){ return !!getGeminiKey(); }

const AI_SCHEMA_HINT = `Devuelve SOLO un objeto JSON válido, sin texto extra, con EXACTAMENTE estas claves:
{"nivel":"", "grupo":"", "equipo":[], "tiempo_minutos":0, "lesiones":[], "objetivo":""}
- nivel: uno de "principiante","intermedio","avanzado" (por defecto "intermedio").
- grupo: zona/foco a entrenar, uno de "full","upper","lower","core","prevencion","stretch"
  ("stretch" si pide estiramiento/movilidad; "prevencion" si pide prevención de lesiones; por defecto "full").
- equipo: subconjunto de ["peso corporal","mancuernas","kettlebell","bandas","barra","banca","dominadas"].
- tiempo_minutos: entero (30, 45 o 60 aprox.).
- lesiones: zonas mencionadas, p.ej. ["rodilla","hombro","espalda","lumbar","cadera","tobillo","muñeca","cuello"].
- objetivo: uno de "general","fuerza","hipertrofia","potencia","resistencia","perdida_grasa".`;

// Llama a Gemini y extrae el JSON estructurado del texto de la respuesta.
async function callGemini(text, key){
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+encodeURIComponent(key);
  const body = {
    contents: [{ parts: [{ text: `${AI_SCHEMA_HINT}\n\nMensaje del usuario: """${text}"""` }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  };
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  if(!res.ok) throw new Error('Gemini HTTP '+res.status);
  const data = await res.json();
  // La respuesta llega como texto dentro de candidates[0].content.parts[0].text.
  // Aunque pedimos responseMimeType JSON, saneamos por si viene con ```json ... ```.
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const clean = raw.replace(/```json/gi,'').replace(/```/g,'').trim();
  const match = clean.match(/\{[\s\S]*\}/);          // primer objeto {...} del texto
  return JSON.parse(match ? match[0] : clean);
}

// Parser local de respaldo (sin IA): heurística por palabras clave.
function localParse(text){
  const t = (text||'').toLowerCase();
  const has = (...w)=>w.some(x=>t.includes(x));
  const mins = (t.match(/(\d{2,3})\s*(min|minuto)/)||[])[1];
  const equipo=[];
  if(has('mancuerna','pesa','dumbbell')) equipo.push('mancuernas');
  if(has('kettlebell','pesa rusa')) equipo.push('kettlebell');
  if(has('banda','elástic','elastic')) equipo.push('bandas');
  if(has('barra')) equipo.push('barra');
  if(has('banca','banco')) equipo.push('banca');
  if(has('dominad','pull-up','pullup')) equipo.push('dominadas');
  if(!equipo.length || has('peso corporal','sin equipo','en casa sin','solo mi cuerpo')) equipo.unshift('peso corporal');
  const lesiones=[];
  for(const z of ['rodilla','hombro','espalda','lumbar','cadera','tobillo','muñeca','muneca','cuello','codo'])
    if(t.includes(z)) lesiones.push(z==='muneca'?'muñeca':z);
  let objetivo='general';
  if(has('fuerza','fuerte')) objetivo='fuerza';
  else if(has('hipertrofia','músculo','musculo','masa','volumen')) objetivo='hipertrofia';
  else if(has('potencia','explosiv')) objetivo='potencia';
  else if(has('resistencia','aguante')) objetivo='resistencia';
  else if(has('grasa','adelgaz','perder peso','definir','quemar')) objetivo='perdida_grasa';
  let nivel='intermedio';
  if(has('principiante','empiezo','nuevo','novato')) nivel='principiante';
  else if(has('avanzado','experto')) nivel='avanzado';
  // Foco/zona (grupo) por palabras clave
  let grupo='full';
  if(has('estira','movilidad','flexibilidad','relaj')) grupo='stretch';
  else if(has('prevenc','rehab','lesion')) grupo='prevencion';
  else if(has('inferior','pierna','glúteo','gluteo','cuádriceps','cuadriceps','sentadilla')) grupo='lower';
  else if(has('superior','pecho','espalda','brazo','hombro','bíceps','biceps','tríceps','triceps')) grupo='upper';
  else if(has('core','abdomen','abdominal','oblicuo')) grupo='core';
  return { nivel, grupo, equipo, tiempo_minutos: mins?+mins:45, lesiones, objetivo, _source:'local' };
}

// API pública: texto libre → JSON estructurado (Gemini si hay clave, si no local).
export async function parseUserRequest(text){
  const key = getGeminiKey();
  if(key){
    try{ const j = await callGemini(text, key); return { ...localParse(text), ...j, _source:'gemini' }; }
    catch(e){ console.warn('[ai] Gemini falló, uso parser local:', e.message); }
  }
  return localParse(text);
}
