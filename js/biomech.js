// ===== Motor biomecánico avanzado =====
// Dos capacidades sobre el seguimiento lineal de articulaciones:
//  1) detectDeviations(): identifica DESVIACIONES INDEBIDAS de postura/seguridad
//     por patrón de movimiento (bisagra→lumbar, sentadilla→valgo, press→arqueo…),
//     no solo el ángulo principal de la repetición.
//  2) MovementMatcher: CLASIFICA el movimiento en vivo y comprueba si coincide con
//     el ejercicio esperado (su firma angular/orientación) o parece otra variante.
//
// Límite honesto de MediaPipe Pose: 33 puntos, sin landmarks de columna media, así
// que el "redondeo/arqueo lumbar" se APROXIMA con el comportamiento del segmento
// tronco (hombro→cadera) y su relación con muslo/tobillo. Detecta los casos gruesos
// y peligrosos (sobre-bisagra, echarse hacia atrás en el lockout, colapso lateral,
// valgo, cadera hundida/en pico, cadera despareja), no micro-curvaturas.

import { LM, angle, midpoint, vis } from './utils.js?v=54';

const V = p => vis(p);
const mid = (a,b)=> (a&&b) ? {x:(a.x+b.x)/2, y:(a.y+b.y)/2, visibility:Math.min(a.visibility??1,b.visibility??1)} : null;
// Ángulo del segmento a→b respecto a la vertical ascendente (0 = vertical; + hacia +x)
function leanDeg(a,b){ if(!a||!b) return null; return Math.atan2(b.x-a.x, -(b.y-a.y))*180/Math.PI; }

// ---- Señales posturales a partir de los landmarks (coordenadas normalizadas, y hacia abajo) ----
export function postureSignals(lm){
  if(!lm) return null;
  const sh = (V(lm[LM.L_SHOULDER])&&V(lm[LM.R_SHOULDER])) ? mid(lm[LM.L_SHOULDER],lm[LM.R_SHOULDER]) : null;
  const hp = (V(lm[LM.L_HIP])&&V(lm[LM.R_HIP])) ? mid(lm[LM.L_HIP],lm[LM.R_HIP]) : null;
  const kn = (V(lm[LM.L_KNEE])&&V(lm[LM.R_KNEE])) ? mid(lm[LM.L_KNEE],lm[LM.R_KNEE]) : null;
  const an = (V(lm[LM.L_ANKLE])&&V(lm[LM.R_ANKLE])) ? mid(lm[LM.L_ANKLE],lm[LM.R_ANKLE]) : null;
  const S = { sh, hp, kn, an };

  // Inclinación del tronco respecto a la vertical (magnitud y dirección en x)
  S.trunkLean = (sh&&hp) ? leanDeg(hp, sh) : null;          // 0 = vertical
  S.trunkLeanAbs = S.trunkLean!=null ? Math.abs(S.trunkLean) : null;
  // Ángulo de cadera (tronco vs muslo): bisagra/sentadilla
  S.hipAngle = (sh&&hp&&kn) ? angle(sh,hp,kn) : null;
  // Rodilla (cadera-rodilla-tobillo)
  S.kneeAngle = (hp&&kn&&an) ? angle(hp,kn,an) : null;

  // Valgo de rodilla (vista frontal): rodillas más juntas que los tobillos
  if(V(lm[LM.L_KNEE])&&V(lm[LM.R_KNEE])&&V(lm[LM.L_ANKLE])&&V(lm[LM.R_ANKLE])){
    const kneeGap=Math.abs(lm[LM.L_KNEE].x-lm[LM.R_KNEE].x);
    const ankGap =Math.abs(lm[LM.L_ANKLE].x-lm[LM.R_ANKLE].x);
    S.valgusRatio = ankGap>0.03 ? kneeGap/ankGap : null;     // <1 = rodillas hacia dentro
  } else S.valgusRatio = null;

  // Inclinación lateral del tronco (frontal): desplazamiento x de hombros vs cadera
  if(sh&&hp && V(lm[LM.L_SHOULDER])&&V(lm[LM.R_SHOULDER])){
    const shW = Math.abs(lm[LM.L_SHOULDER].x-lm[LM.R_SHOULDER].x) || 0.001;
    S.lateralShift = (sh.x-hp.x)/shW;                        // + a la derecha de la imagen
  } else S.lateralShift = null;

  // Cadera / hombros desparejos (asimetría vertical)
  S.hipTilt = (V(lm[LM.L_HIP])&&V(lm[LM.R_HIP])) ? (lm[LM.L_HIP].y-lm[LM.R_HIP].y) : null;
  S.shoulderTilt = (V(lm[LM.L_SHOULDER])&&V(lm[LM.R_SHOULDER])) ? (lm[LM.L_SHOULDER].y-lm[LM.R_SHOULDER].y) : null;

  // Línea del cuerpo (plancha/flexión): rectitud y signo (hundida/en pico)
  if(sh&&hp&&an){
    S.bodyLine = angle(sh,hp,an);                            // ~180 = recto
    // producto cruz (an-sh)×(hp-sh): signo indica a qué lado se desvía la cadera
    S.bodyCross = (an.x-sh.x)*(hp.y-sh.y) - (an.y-sh.y)*(hp.x-sh.x);
  } else { S.bodyLine=null; S.bodyCross=null; }

  // ¿Muñecas por encima de los hombros? (lockout de press de hombro)
  S.wristsOverhead = (V(lm[LM.L_WRIST])&&V(lm[LM.L_SHOULDER]) && lm[LM.L_WRIST].y < lm[LM.L_SHOULDER].y) ||
                     (V(lm[LM.R_WRIST])&&V(lm[LM.R_SHOULDER]) && lm[LM.R_WRIST].y < lm[LM.R_SHOULDER].y);

  S.at = { sh, hp, kn, an };
  return S;
}

// ---- Patrón de movimiento del ejercicio (para asignar reglas de seguridad) ----
export function patternOf(ex){
  const id=(ex.id||'').toLowerCase(), n=(ex.name||'').toLowerCase();
  const has=(...k)=>k.some(w=>id.includes(w)||n.includes(w));
  if(has('rdl','swing','good_morning','buenos_dias','peso muerto','deadlift','single_leg_dl','nordic','hip_hinge','kb_swing','hinge')) return 'hinge';
  if(has('ohp','press de hombro','push_press','thruster','overhead','militar','arnold')) return 'overhead';
  if(has('plank','plancha','bird_dog','dead_bug','hollow','superman','side_plank')) return 'antiext';
  if(has('pushup','flexion','bench','press de banca','dip','fondo')) return 'hpush';
  if(has('pullup','dominada','row','remo','pulldown','jalon','face','pull')) return 'pull';
  if(has('curl','lateral','elevacion','extension de triceps','triceps','raise')) return 'isostand';
  if(has('squat','sentadilla','lunge','zancada','bulgarian','step','cossack','goblet','wall_sit','prensa','pistol')) return 'squat';
  // por grupo si no hubo coincidencia por nombre
  if(ex.group==='lower') return 'squat';
  return 'generic';
}

const pt = p => p ? [p.x,p.y] : [0.5,0.5];

// ---- Reglas de desviación por patrón ----
// Cada entrada devuelve {level:'warn'|'bad', msg, at} o null.
const RULES = {
  hinge: (S,phase)=>{
    const out=[];
    // Sobre-bisagra / tronco casi horizontal con cadera aún abierta = riesgo de redondeo
    if(S.trunkLeanAbs!=null && S.hipAngle!=null){
      if(S.trunkLeanAbs>72 && S.hipAngle>95)
        out.push({zone:'lumbar', level:'bad', msg:'⚠ Espalda neutra: no redondees', at:pt(S.hp)});
      else if(S.trunkLeanAbs>60 && S.hipAngle>110)
        out.push({zone:'lumbar', level:'warn', msg:'Mantén la espalda recta en la bisagra', at:pt(S.hp)});
    }
    // Lockout: de pie debe quedar casi vertical; echarse hacia atrás = hiperextensión
    if(phase==='reset' && S.trunkLeanAbs!=null && S.hipAngle!=null && S.hipAngle>150 && S.trunkLeanAbs>18)
      out.push({zone:'lumbar', level:'warn', msg:'No te eches hacia atrás al terminar', at:pt(S.sh)});
    return out;
  },
  overhead: (S)=>{
    const out=[];
    if(S.wristsOverhead && S.trunkLeanAbs!=null && S.trunkLeanAbs>16)
      out.push({zone:'lumbar', level:'bad', msg:'⚠ Arqueo lumbar: aprieta abdomen y glúteo', at:pt(S.hp)});
    return out;
  },
  squat: (S)=>{
    const out=[];
    if(S.valgusRatio!=null){
      if(S.valgusRatio<0.68) out.push({zone:'rodilla', level:'bad', msg:'⚠ Rodillas hacia dentro', at:pt(S.kn)});
      else if(S.valgusRatio<0.8) out.push({zone:'rodilla', level:'warn', msg:'Empuja las rodillas hacia fuera', at:pt(S.kn)});
    }
    // Inclinación excesiva del tronco en el valle (buenas mañanas = "good-morning squat")
    if(S.trunkLeanAbs!=null && S.kneeAngle!=null && S.kneeAngle<120 && S.trunkLeanAbs>55)
      out.push({zone:'tronco', level:'warn', msg:'Pecho arriba, no te vayas al frente', at:pt(S.sh)});
    return out;
  },
  antiext: (S)=>{
    const out=[];
    if(S.bodyLine!=null && S.bodyLine<160){
      const sag = (S.bodyCross||0) > 0;   // cadera por debajo de la línea hombro-tobillo
      out.push({zone:'cadera', level: S.bodyLine<150?'bad':'warn',
        msg: sag ? '⚠ No hundas la cadera' : 'No subas la cadera (en pico)', at:pt(S.hp)});
    }
    return out;
  },
  hpush: (S)=>{
    const out=[];
    if(S.bodyLine!=null && S.bodyLine<158){
      const sag = (S.bodyCross||0) > 0;
      out.push({zone:'cadera', level: S.bodyLine<148?'bad':'warn',
        msg: sag ? '⚠ No hundas la cadera' : 'Baja la cadera, cuerpo recto', at:pt(S.hp)});
    }
    return out;
  },
  pull: (S)=>{
    const out=[];
    // Impulso de tronco (kipping/cheating): balanceo grande en un tirón estricto
    if(S.trunkLeanAbs!=null && S.trunkLeanAbs>28)
      out.push({zone:'tronco', level:'warn', msg:'Evita el impulso del tronco', at:pt(S.sh)});
    return out;
  },
  isostand: (S)=>{
    const out=[];
    // Balanceo de tronco en ejercicios de aislamiento (usar impulso)
    if(S.lateralShift!=null && Math.abs(S.lateralShift)>0.6)
      out.push({zone:'tronco', level:'warn', msg:'Tronco firme, sin balanceo', at:pt(S.sh)});
    else if(S.trunkLeanAbs!=null && S.trunkLeanAbs>22)
      out.push({zone:'tronco', level:'warn', msg:'No uses impulso, aísla el músculo', at:pt(S.sh)});
    return out;
  },
  generic: ()=>[],
};

// Reglas globales (aplican a todo de pie): asimetrías marcadas.
function globalRules(S, pattern){
  const out=[];
  if((pattern==='squat'||pattern==='hinge'||pattern==='isostand'||pattern==='overhead') && S.hipTilt!=null){
    if(Math.abs(S.hipTilt)>0.06) out.push({zone:'cadera', level:'warn', msg:'Nivela la cadera (peso parejo)', at:pt(S.hp)});
  }
  return out;
}

// ---- API principal de desviaciones ----
// Devuelve hasta 2 alertas [{zone, level, msg, at:[x,y] normalizado}] más severas.
export function detectDeviations(lm, ex, counter){
  const S = postureSignals(lm);
  if(!S) return [];
  const pattern = ex ? patternOf(ex) : 'generic';
  const phase = counter ? counter.phase : null;
  let out = [];
  try{ out = out.concat((RULES[pattern]||RULES.generic)(S, phase) || []); }catch{}
  try{ out = out.concat(globalRules(S, pattern) || []); }catch{}
  const sev = {bad:2, warn:1};
  out.sort((a,b)=>(sev[b.level]||0)-(sev[a.level]||0));
  return out.slice(0,2);
}

// ======================================================
// Clasificación del movimiento (¿coincide con el ejercicio?)
// ======================================================
// Firma esperada derivada de la definición del ejercicio.
export function signatureOf(ex){
  const label = (ex.gauges && ex.gauges[0] && ex.gauges[0].label || '').toLowerCase();
  let joint = 'hip';
  if(/rodilla/.test(label)) joint='knee';
  else if(/codo/.test(label)) joint='elbow';
  else if(/hombro/.test(label)) joint='shoulder';
  else if(/cadera|tronco/.test(label)) joint='hip';
  else if(/cuerpo/.test(label)) joint='body';
  const view = (ex.view||'').toLowerCase();
  const orient = /frente|frontal/.test(view) ? 'front' : 'side';
  const g = ex.gauges && ex.gauges[0];
  const amp = g ? Math.abs((g.max??180)-(g.min??0)) : 90;
  return { id:ex.id, name:ex.name, joint, orient, amp, pattern:patternOf(ex) };
}

// Ángulos de todas las articulaciones candidatas en un frame (para medir cuál se mueve).
function jointAngles(lm){
  const a=(x,y,z)=> (V(lm[x])&&V(lm[y])&&V(lm[z])) ? angle(lm[x],lm[y],lm[z]) : null;
  const avg=(p,q)=>{ const v=[p,q].filter(x=>x!=null); return v.length?v.reduce((s,x)=>s+x,0)/v.length:null; };
  const sh=mid(lm[LM.L_SHOULDER],lm[LM.R_SHOULDER]), hp=mid(lm[LM.L_HIP],lm[LM.R_HIP]), an=mid(lm[LM.L_ANKLE],lm[LM.R_ANKLE]);
  return {
    knee: avg(a(LM.L_HIP,LM.L_KNEE,LM.L_ANKLE), a(LM.R_HIP,LM.R_KNEE,LM.R_ANKLE)),
    elbow:avg(a(LM.L_SHOULDER,LM.L_ELBOW,LM.L_WRIST), a(LM.R_SHOULDER,LM.R_ELBOW,LM.R_WRIST)),
    hip:  avg(a(LM.L_SHOULDER,LM.L_HIP,LM.L_KNEE), a(LM.R_SHOULDER,LM.R_HIP,LM.R_KNEE)),
    shoulder:avg(a(LM.L_HIP,LM.L_SHOULDER,LM.L_ELBOW), a(LM.R_HIP,LM.R_SHOULDER,LM.R_ELBOW)),
    body: (sh&&hp&&an) ? angle(sh,hp,an) : null,
  };
}

// Acumula el rango de movimiento por articulación y la orientación durante una serie.
export class MovementMatcher{
  constructor(expectedSig){ this.exp=expectedSig; this.reset(); }
  reset(){
    this.min={knee:Infinity,elbow:Infinity,hip:Infinity,shoulder:Infinity,body:Infinity};
    this.max={knee:-Infinity,elbow:-Infinity,hip:-Infinity,shoulder:-Infinity,body:-Infinity};
    this.frontVotes=0; this.sideVotes=0; this.frames=0;
  }
  observe(lm){
    if(!lm) return;
    this.frames++;
    const ja=jointAngles(lm);
    for(const k in ja){ if(ja[k]!=null){ this.min[k]=Math.min(this.min[k],ja[k]); this.max[k]=Math.max(this.max[k],ja[k]); } }
    // Orientación: ancho de hombros en x vs profundidad → frontal si ambos hombros bien separados y visibles
    const ls=lm[LM.L_SHOULDER], rs=lm[LM.R_SHOULDER];
    if(V(ls)&&V(rs)){
      const span=Math.abs(ls.x-rs.x);
      if(span>0.18) this.frontVotes++; else this.sideVotes++;
    }
  }
  rom(j){ const r=this.max[j]-this.min[j]; return isFinite(r)?r:0; }
  liveSignature(){
    const joints=['knee','elbow','hip','shoulder'];
    let best='hip', bestRom=-1;
    for(const j of joints){ const r=this.rom(j); if(r>bestRom){ bestRom=r; best=j; } }
    const orient = this.frontVotes>=this.sideVotes ? 'front' : 'side';
    return { joint:best, rom:bestRom, orient, bodyRom:this.rom('body') };
  }
  // Puntuación 0..1 de coincidencia con el ejercicio esperado.
  score(){
    const live=this.liveSignature();
    if(this.frames<10 || live.rom<12) return { pct:null, live, ready:false };
    let s=0;
    // Articulación principal que más se mueve (peso alto)
    if(live.joint===this.exp.joint || (this.exp.joint==='body')) s+=0.6;
    else if(sameChain(live.joint,this.exp.joint)) s+=0.3;
    // Orientación de cámara
    if(live.orient===this.exp.orient) s+=0.2; else s+=0.05;
    // Amplitud plausible (el rango vivo alcanza al menos el 45% del esperado)
    if(live.rom >= this.exp.amp*0.45) s+=0.2;
    return { pct:Math.round(Math.min(1,s)*100), live, ready:true };
  }
  // Mejor ejercicio alternativo de la biblioteca para el movimiento observado.
  suggest(library){
    const live=this.liveSignature();
    let best=null, bestScore=-1;
    for(const ex of library){
      const sg=signatureOf(ex); let sc=0;
      if(sg.joint===live.joint) sc+=2; else if(sameChain(sg.joint,live.joint)) sc+=1;
      if(sg.orient===live.orient) sc+=0.5;
      if(sc>bestScore){ bestScore=sc; best=ex; }
    }
    return best;
  }
}
function sameChain(a,b){
  const lower=new Set(['knee','hip']), upperPush=new Set(['elbow','shoulder']);
  return (lower.has(a)&&lower.has(b)) || (upperPush.has(a)&&upperPush.has(b));
}
