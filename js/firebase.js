// Inicialización perezosa de Firebase (Auth + Firestore) vía CDN modular v10.
// Solo carga el SDK cuando FIREBASE_ENABLED === true y se solicita.
import { FIREBASE_CONFIG, FIREBASE_ENABLED } from './firebase-config.js?v=49';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
let _mods = null, _loading = null;

export { FIREBASE_ENABLED };

// Devuelve { app, auth, db, ...funciones de auth y firestore } o lanza si está deshabilitado.
export async function fb(){
  if(!FIREBASE_ENABLED) throw new Error('Firebase deshabilitado (configura js/firebase-config.js)');
  if(_mods) return _mods;
  if(_loading) return _loading;
  _loading = (async ()=>{
    const [appM, authM, fsM] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app  = appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    const db   = fsM.getFirestore(app);
    _mods = { app, auth, db, CONFIG: FIREBASE_CONFIG, ...appM, ...authM, ...fsM };
    return _mods;
  })();
  return _loading;
}

// Espera a saber si hay sesión y devuelve el user (o null).
export async function currentUser(){
  const m = await fb();
  return new Promise(res=>{
    const off = m.onAuthStateChanged(m.auth, u=>{ off(); res(u||null); });
  });
}

// Lee users/{uid} → perfil con rol.
export async function getProfile(uid){
  const m = await fb();
  const snap = await m.getDoc(m.doc(m.db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}
