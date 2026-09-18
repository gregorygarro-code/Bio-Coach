// ===== Sonidos del contador y temporizador (Web Audio API, sin archivos) =====
let actx = null;
let soundOn = true;

export function setSound(on){ soundOn = on; }
export function isSoundOn(){ return soundOn; }

function ctx(){
  if(!actx){
    try{ actx = new (window.AudioContext || window.webkitAudioContext)(); }catch{ actx=null; }
  }
  return actx;
}
// Debe llamarse tras un gesto del usuario (click) para desbloquear el audio
export function unlock(){
  const a=ctx();
  if(a && a.state==='suspended') a.resume().catch(()=>{});
}

function tone(freq=880, dur=0.12, vol=0.25, type='sine', when=0){
  if(!soundOn) return;
  const a=ctx(); if(!a) return;
  const t=a.currentTime+when;
  const o=a.createOscillator(), g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t+dur+0.03);
}

// --- Sonidos semánticos ---
export const sfx = {
  // Pitido de repetición: sube ligeramente de tono con el número de rep
  rep(n=1){ tone(600 + Math.min(n,12)*28, 0.11, 0.28, 'square'); },
  // Se alcanzó la profundidad/rango (fase baja)
  bottom(){ tone(360, 0.06, 0.14, 'sine'); },
  // Tic de cuenta atrás (3,2,1…)
  tick(){ tone(760, 0.10, 0.22, 'triangle'); },
  // Últimos segundos del temporizador
  urgent(){ tone(880, 0.10, 0.26, 'square'); },
  // "¡Ya!" al empezar
  go(){ tone(1046, 0.28, 0.32, 'sawtooth'); },
  // Fin de temporizador (campana doble)
  bell(){ tone(988,0.30,0.3,'sine'); tone(1319,0.5,0.28,'sine',0.12); },
  // Objetivo de repeticiones cumplido (arpegio ascendente)
  target(){ [660,880,1046,1319].forEach((f,i)=>tone(f,0.16,0.3,'triangle',i*0.11)); },
  // Aviso de "última repetición"
  last(){ tone(520,0.18,0.28,'triangle'); },
};
