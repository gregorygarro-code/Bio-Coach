// ===== Service Worker · FitCoach Casa (PWA offline) =====
// Cachea los estáticos locales (HTML, CSS, JS, JSON de ejercicios, iconos) para
// funcionar sin conexión y sin servidor. Los recursos externos (MediaPipe, fuentes,
// Supabase) se cachean bajo demanda tras el primer uso.
const V = 'v29';
const CACHE = 'fitcoach-' + V;

// Estáticos locales a precachear. Las rutas con ?v= deben coincidir con index.html.
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'og-image.svg',
  'css/styles.css?v=29',
  'js/app.js?v=29',
  'js/exercises.js?v=29',
  'js/generator.js?v=29',
  'js/demos.js?v=29',
  'js/pose.js?v=29',
  'js/utils.js?v=29',
  'js/audio.js?v=29',
  'js/storage.js?v=29',
  'js/api.js?v=29',
  'js/config.js?v=29',
  'data/exercises.json?v=29',
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith('fitcoach-') && k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET') return;                 // no interceptamos POST (Gemini/Supabase)
  const url = new URL(req.url);

  // Local (mismo origen): cache-first, con actualización en segundo plano.
  if(url.origin === self.location.origin){
    e.respondWith(
      caches.match(req).then(hit=>{
        const net = fetch(req).then(res=>{
          if(res && res.ok){ const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req, copy)); }
          return res;
        }).catch(()=>hit);
        return hit || net;
      })
    );
    return;
  }

  // Externo (MediaPipe/fuentes/CDN): network-first con respaldo en caché.
  e.respondWith(
    fetch(req).then(res=>{
      if(res && res.ok && (res.type==='basic' || res.type==='cors')){
        const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req, copy));
      }
      return res;
    }).catch(()=>caches.match(req))
  );
});
