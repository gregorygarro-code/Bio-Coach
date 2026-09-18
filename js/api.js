// ===== Capa de cuenta (desactivada) =====
// El backend de cuentas se retiró de momento. La app funciona en "modo invitado":
// el perfil y el progreso se guardan localmente en el navegador (localStorage)
// desde storage.js. Se mantienen estos stubs para no romper la app y poder
// reactivar un backend en el futuro sin tocar el resto del código.

export async function me(){ return { backend:false }; }
export async function register(){ return { backend:false, ok:false, error:'Cuentas desactivadas por ahora.' }; }
export async function login(){ return { backend:false, ok:false, error:'Cuentas desactivadas por ahora.' }; }
export async function logout(){ /* no-op */ }
export async function saveProfile(){ return false; }
export async function saveProgress(){ return false; }
