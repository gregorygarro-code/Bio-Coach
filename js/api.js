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
    const { data:{ user } } = await sb.auth.getUser();
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

export async function saveProgress(history, plans){
  const sb = client(); if(!sb) return false;
  const { data:{ user } } = await sb.auth.getUser(); if(!user) return false;
  const { error } = await sb.from('fc_progress').upsert({ user_id:user.id, data:{ history, plans }, updated_at:new Date().toISOString() });
  return !error;
}
