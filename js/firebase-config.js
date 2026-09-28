// Configuración de Firebase (config web = pública, no secreta).
// Rellena con los datos de tu proyecto (Consola Firebase → Configuración del proyecto)
// y pon FIREBASE_ENABLED = true. Mientras esté en false, la app usa localStorage normal.
// Proyecto: fitcoach-16ebf.
// NOTA DE SEGURIDAD: la config web de Firebase (incluida apiKey) es PÚBLICA por
// diseño; viaja al navegador y NO es un secreto. No autoriza acceso a datos: la
// protección real son las reglas de Firestore (firebase/firestore.rules) + Auth
// + App Check. Restringe además la apiKey por dominio en Google Cloud Console
// (APIs y servicios → Credenciales → HTTP referrers). Ref: https://firebase.google.com/docs/projects/api-keys
export const FIREBASE_ENABLED = true;

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDX_SQqVjiBBBGZ_9YJw7M05G6sG5IuxGQ",
  authDomain: "fitcoach-16ebf.firebaseapp.com",
  projectId: "fitcoach-16ebf",
  storageBucket: "fitcoach-16ebf.firebasestorage.app",
  messagingSenderId: "983106769463",
  appId: "1:983106769463:web:590ffbf359298a65bd65b2",
  measurementId: "G-LLPHFFWS0M"
};
