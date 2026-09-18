// ===== Biblioteca de ejercicios + motor biomecánico =====
import { LM, angle, angleFromVertical, midpoint, vis, clamp } from './utils.js?v=18';

// --- helpers de ángulos sobre landmarks ---
function tri(lm, a, b, c){
  if(vis(lm[a]) && vis(lm[b]) && vis(lm[c])) return angle(lm[a], lm[b], lm[c]);
  return null;
}
// media de ambos lados si ambos visibles; si no, el que haya
function bilateral(lm, left, right){
  const l = tri(lm, ...left), r = tri(lm, ...right);
  if(l!=null && r!=null) return (l+r)/2;
  return l!=null ? l : r;
}
function bestSide(lm, left, right){
  const l = tri(lm, ...left), r = tri(lm, ...right);
  const vl = vis(lm[left[1]]) ? (lm[left[1]].visibility??1) : 0;
  const vr = vis(lm[right[1]]) ? (lm[right[1]].visibility??1) : 0;
  if(l!=null && r!=null) return vl>=vr ? l : r;
  return l!=null ? l : r;
}

const ELBOW_L=[LM.L_SHOULDER,LM.L_ELBOW,LM.L_WRIST];
const ELBOW_R=[LM.R_SHOULDER,LM.R_ELBOW,LM.R_WRIST];
const KNEE_L =[LM.L_HIP,LM.L_KNEE,LM.L_ANKLE];
const KNEE_R =[LM.R_HIP,LM.R_KNEE,LM.R_ANKLE];
const HIP_L  =[LM.L_SHOULDER,LM.L_HIP,LM.L_KNEE];
const HIP_R  =[LM.R_SHOULDER,LM.R_HIP,LM.R_KNEE];
const SHLDR_L=[LM.L_HIP,LM.L_SHOULDER,LM.L_ELBOW];   // abducción de hombro (izq)
const SHLDR_R=[LM.R_HIP,LM.R_SHOULDER,LM.R_ELBOW];

const elbow = lm => bilateral(lm, ELBOW_L, ELBOW_R);
const knee  = lm => bilateral(lm, KNEE_L, KNEE_R);
const hip   = lm => bilateral(lm, HIP_L, HIP_R);

// clave de check
const ok   = m => ({level:'good', msg:m});
const warn = m => ({level:'warn', msg:m});
const bad  = m => ({level:'bad',  msg:m});

// alineación tronco-cadera-tobillo (para flexiones/plancha)
function bodyLineAngle(lm){
  const sh=midpoint(lm[LM.L_SHOULDER],lm[LM.R_SHOULDER]);
  const hp=midpoint(lm[LM.L_HIP],lm[LM.R_HIP]);
  const an=midpoint(lm[LM.L_ANKLE],lm[LM.R_ANKLE]);
  return angle(sh,hp,an);
}

// ===== Motor de conteo de repeticiones (máquina de estados con histéresis) =====
export class RepCounter{
  constructor(ex){ this.ex=ex; this.reset(); }
  reset(){
    this.reps=0; this.phase='reset';
    this.repMin=Infinity; this.repMax=-Infinity;
    this.lastRepMin=null; this.lastRepMax=null; this.lastRom=null;
    this.phaseStart=performance.now(); this.tempo={down:null,up:null};
  }
  update(val){
    if(val==null) return {rep:false, phase:this.phase, reps:this.reps};
    this.repMin=Math.min(this.repMin,val);
    this.repMax=Math.max(this.repMax,val);
    const {effort, effortThresh, resetThresh}=this.ex.rep;
    let rep=false;
    if(this.phase==='reset'){
      const entered = effort==='low' ? val<effortThresh : val>effortThresh;
      if(entered){
        this.phase='effort';
        this.tempo.down=(performance.now()-this.phaseStart)/1000;
        this.phaseStart=performance.now();
      }
    }else{
      const exited = effort==='low' ? val>resetThresh : val<resetThresh;
      if(exited){
        this.phase='reset';
        this.tempo.up=(performance.now()-this.phaseStart)/1000;
        this.phaseStart=performance.now();
        this.lastRepMin=this.repMin; this.lastRepMax=this.repMax;
        this.lastRom=this.repMax-this.repMin;
        this.reps++; rep=true;
        this.repMin=Infinity; this.repMax=-Infinity;
      }
    }
    return {rep, phase:this.phase, reps:this.reps};
  }
}

// Equipamiento: 'bodyweight' | 'dumbbell' | 'band' | 'bar'
export const EQUIPMENT = {
  bodyweight:{label:'Peso corporal', ic:'🧍'},
  dumbbell:  {label:'Mancuernas / KB', ic:'🏋️'},
  band:      {label:'Bandas elásticas', ic:'🎗️'},
  bar:       {label:'Barra / banco', ic:'🔩'},
};

// Equipamiento detallado (lo que ve el usuario). Cada item aporta "capacidades"
// (caps) que son las que usan los ejercicios para el filtrado. weight:true habilita
// un campo para indicar los pesos disponibles.
export const EQUIPMENT_DETAIL = [
  { id:'bodyweight', label:'Peso corporal',        ic:'🧍', caps:['bodyweight'] },
  { id:'yoga_mat',   label:'Mat de yoga',          ic:'🧘', caps:['bodyweight'] },
  { id:'dumbbells',  label:'Mancuernas',           ic:'🏋️', caps:['dumbbell'], weight:true, wl:'Pesos disponibles (kg)', ph:'ej. 6, 8, 10, 12' },
  { id:'kettlebell', label:'Kettlebell',           ic:'🔔', caps:['dumbbell'], weight:true, wl:'Pesos (kg)', ph:'ej. 12, 16, 20' },
  { id:'bands',      label:'Bandas elásticas',     ic:'🎗️', caps:['band'], weight:true, wl:'Resistencias', ph:'ej. media, fuerte' },
  { id:'med_ball',   label:'Balón medicinal',      ic:'⚽', caps:['dumbbell'], weight:true, wl:'Peso (kg)', ph:'ej. 5' },
  { id:'bench',      label:'Banca',                ic:'🛋️', caps:['bar','dumbbell'] },
  { id:'squat_rack', label:'Rack de sentadillas',  ic:'🗜️', caps:['bar'] },
  { id:'barbell',    label:'Barra olímpica',       ic:'🏋️', caps:['bar','dumbbell'], weight:true, wl:'Barra + discos (kg)', ph:'ej. barra 20 + 60' },
  { id:'hex_bar',    label:'Barra hexagonal',      ic:'⬡',  caps:['bar','dumbbell'], weight:true, wl:'Peso (kg)', ph:'ej. 25 + discos' },
  { id:'pullup_bar', label:'Barra de dominadas',   ic:'🚪', caps:['bar'] },
];
// Deriva las capacidades (bodyweight/dumbbell/band/bar) desde la selección detallada
export function capsFromDetail(detailSet){
  const caps=new Set(['bodyweight']);          // el peso corporal siempre está disponible
  for(const it of EQUIPMENT_DETAIL){ if(detailSet.has(it.id)) it.caps.forEach(c=>caps.add(c)); }
  return caps;
}

// ===== Definición de ejercicios =====
export const EXERCISES = [
  {
    id:'squat', name:'Sentadilla', emoji:'🦵',
    equipment:['bodyweight','dumbbell','band'],
    muscles:'Cuádriceps · glúteo · core',
    view:'De frente o 45°, cuerpo entero',
    rep:{ measure:knee, effort:'low', effortThresh:110, resetThresh:155 },
    gauges:[
      {label:'Rodilla', get:knee, min:70, max:175},
      {label:'Cadera',  get:hip,  min:60, max:180},
    ],
    cues:['Pecho arriba y espalda neutra','Rodillas hacia fuera, en línea con los pies','Baja hasta muslos paralelos','Empuja desde el talón'],
    checks(lm, c){
      const out=[];
      const depth = c.lastRepMin ?? c.repMin;
      if(isFinite(depth)){
        if(depth<=100) out.push(ok('Profundidad correcta'));
        else if(depth<=120) out.push(warn('Baja un poco más (muslos paralelos)'));
        else out.push(bad('Poca profundidad, baja más'));
      }
      // valgo de rodilla (rodillas que se meten hacia dentro) — vista frontal
      if(vis(lm[LM.L_KNEE])&&vis(lm[LM.R_KNEE])&&vis(lm[LM.L_ANKLE])&&vis(lm[LM.R_ANKLE])){
        const kneeGap=Math.abs(lm[LM.L_KNEE].x-lm[LM.R_KNEE].x);
        const ankGap =Math.abs(lm[LM.L_ANKLE].x-lm[LM.R_ANKLE].x);
        if(ankGap>0.02){
          const r=kneeGap/ankGap;
          if(r<0.65) out.push(bad('Rodillas hacia dentro: ábrelas'));
          else if(r<0.8) out.push(warn('Cuida que las rodillas no se metan'));
          else out.push(ok('Rodillas bien alineadas'));
        }
      }
      return out;
    }
  },

  {
    id:'pushup', name:'Flexiones', emoji:'💪',
    equipment:['bodyweight'],
    muscles:'Pecho · tríceps · hombro',
    view:'De lado o 45°, cuerpo entero',
    rep:{ measure:elbow, effort:'low', effortThresh:100, resetThresh:150 },
    gauges:[
      {label:'Codo', get:elbow, min:60, max:175},
      {label:'Cuerpo', get:bodyLineAngle, min:130, max:185},
    ],
    cues:['Cuerpo en línea recta (no subas la cadera)','Codos ~45° del cuerpo','Baja el pecho cerca del suelo','Aprieta el abdomen'],
    checks(lm, c){
      const out=[];
      const depth=c.lastRepMin ?? c.repMin;
      if(isFinite(depth)){
        if(depth<=95) out.push(ok('Buen rango de bajada'));
        else out.push(warn('Baja más, dobla más los codos'));
      }
      const bl=bodyLineAngle(lm);
      if(bl!=null){
        if(bl>=165) out.push(ok('Cuerpo recto'));
        else out.push(bad('Mantén el cuerpo recto (cadera en línea)'));
      }
      return out;
    }
  },

  {
    id:'lunge', name:'Zancadas', emoji:'🚶',
    equipment:['bodyweight','dumbbell'],
    muscles:'Cuádriceps · glúteo',
    view:'De lado, cuerpo entero',
    rep:{ measure:lm=>{ const l=tri(lm,...KNEE_L), r=tri(lm,...KNEE_R);
      const arr=[l,r].filter(v=>v!=null); return arr.length?Math.min(...arr):null; },
      effort:'low', effortThresh:105, resetThresh:155 },
    gauges:[
      {label:'Rodilla', get:lm=>{ const l=tri(lm,...KNEE_L), r=tri(lm,...KNEE_R); const a=[l,r].filter(v=>v!=null); return a.length?Math.min(...a):null; }, min:70, max:175},
      {label:'Cadera', get:hip, min:80, max:180},
    ],
    cues:['Tronco erguido','Rodilla delantera a 90°','La rodilla no pasa la punta del pie','Peso repartido'],
    checks(lm, c){
      const out=[];
      const depth=c.lastRepMin ?? c.repMin;
      if(isFinite(depth)){
        if(depth<=100) out.push(ok('Buena profundidad de zancada'));
        else out.push(warn('Baja más la rodilla trasera'));
      }
      return out;
    }
  },

  {
    id:'plank', name:'Plancha', emoji:'🧘', type:'hold',
    equipment:['bodyweight'],
    muscles:'Core · hombro',
    view:'De lado, cuerpo entero',
    rep:{ measure:bodyLineAngle, effort:'low', effortThresh:0, resetThresh:999 }, // no cuenta reps
    gauges:[ {label:'Cuerpo', get:bodyLineAngle, min:130, max:185} ],
    cues:['Cuerpo en línea recta','No hundas ni subas la cadera','Aprieta abdomen y glúteo','Respira'],
    checks(lm){
      const out=[]; const bl=bodyLineAngle(lm);
      if(bl!=null){
        if(bl>=168) out.push(ok('Alineación perfecta, aguanta'));
        else if(bl>=155) out.push(warn('Corrige la cadera ligeramente'));
        else out.push(bad('Cuerpo recto: corrige la cadera'));
      }
      return out;
    }
  },

  {
    id:'curl', name:'Curl de bíceps', emoji:'💪',
    equipment:['dumbbell','band'],
    muscles:'Bíceps',
    view:'De frente o de lado',
    rep:{ measure:elbow, effort:'low', effortThresh:60, resetThresh:150 },
    gauges:[ {label:'Codo', get:elbow, min:30, max:175} ],
    cues:['Codos pegados al cuerpo','Sube controlando, no balancees','Extiende del todo abajo','Sin impulso de la espalda'],
    checks(lm, c){
      const out=[];
      const rom=c.lastRom;
      if(rom!=null){
        if(rom>=90) out.push(ok('Rango completo'));
        else out.push(warn('Recorrido corto: extiende y flexiona más'));
      }
      // deriva de codo (brazo que se adelanta)
      const drift=Math.min(...[[LM.L_SHOULDER,LM.L_ELBOW],[LM.R_SHOULDER,LM.R_ELBOW]]
        .map(([s,e])=> (vis(lm[s])&&vis(lm[e]))?angleFromVertical(lm[s],lm[e]):999));
      if(drift<900){
        if(drift<=25) out.push(ok('Codos estables'));
        else out.push(warn('Mantén el codo pegado, no lo adelantes'));
      }
      return out;
    }
  },

  {
    id:'ohp', name:'Press de hombro', emoji:'🙆',
    equipment:['dumbbell','band'],
    muscles:'Hombro · tríceps',
    view:'De frente, medio cuerpo',
    rep:{ measure:elbow, effort:'high', effortThresh:155, resetThresh:100 },
    gauges:[ {label:'Codo', get:elbow, min:70, max:180} ],
    cues:['Aprieta el core, no arquees la espalda','Sube hasta extender los codos','Muñecas sobre los hombros','Baja controlado a la altura del mentón'],
    checks(lm, c){
      const out=[];
      const top=c.lastRepMax;
      if(top!=null){
        if(top>=160) out.push(ok('Bloqueo completo arriba'));
        else out.push(warn('Extiende del todo arriba'));
      }
      // muñecas por encima de hombros
      const wristsUp=[[LM.L_WRIST,LM.L_SHOULDER],[LM.R_WRIST,LM.R_SHOULDER]]
        .some(([w,s])=>vis(lm[w])&&vis(lm[s])&&lm[w].y<lm[s].y);
      if(wristsUp) out.push(ok('Trayectoria vertical correcta'));
      return out;
    }
  },

  {
    id:'row', name:'Remo inclinado', emoji:'🚣',
    equipment:['dumbbell','band'],
    muscles:'Espalda · bíceps',
    view:'De lado, medio cuerpo',
    rep:{ measure:elbow, effort:'low', effortThresh:75, resetThresh:150 },
    gauges:[
      {label:'Codo', get:elbow, min:40, max:175},
      {label:'Cadera', get:hip, min:60, max:180},
    ],
    cues:['Cadera en bisagra, espalda neutra','Lleva el codo hacia atrás y arriba','Aprieta la escápula','No tires con impulso'],
    checks(lm, c){
      const out=[];
      const h=hip(lm);
      if(h!=null){
        if(h<140) out.push(ok('Buena posición de bisagra'));
        else out.push(warn('Inclínate más desde la cadera'));
      }
      const rom=c.lastRom;
      if(rom!=null && rom>=70) out.push(ok('Recorrido de tirón completo'));
      return out;
    }
  },

  {
    id:'rdl', name:'Peso muerto rumano', emoji:'🏋️',
    equipment:['dumbbell','band'],
    muscles:'Isquios · glúteo · espalda',
    view:'De lado, cuerpo entero',
    rep:{ measure:hip, effort:'high', effortThresh:165, resetThresh:120 },
    gauges:[
      {label:'Cadera', get:hip, min:60, max:180},
      {label:'Rodilla', get:knee, min:120, max:180},
    ],
    cues:['Bisagra de cadera, no sentadilla','Espalda recta todo el recorrido','Rodillas ligeramente flexionadas','Termina de pie apretando glúteo'],
    checks(lm, c){
      const out=[];
      const bottom=c.lastRepMin;
      if(bottom!=null){
        if(bottom<=110) out.push(ok('Buena bisagra de cadera'));
        else out.push(warn('Baja más la cadera hacia atrás'));
      }
      const top=c.lastRepMax;
      if(top!=null && top<160) out.push(warn('Termina de pie, aprieta glúteo'));
      return out;
    }
  },

  {
    id:'swing', name:'Swing (kettlebell)', emoji:'🔔',
    equipment:['dumbbell'],
    muscles:'Glúteo · isquios · core',
    view:'De lado, cuerpo entero',
    rep:{ measure:hip, effort:'high', effortThresh:165, resetThresh:120 },
    gauges:[ {label:'Cadera', get:hip, min:60, max:180} ],
    cues:['Potencia desde la cadera, no los brazos','Espalda neutra en la bisagra','Aprieta glúteo arriba','Ritmo explosivo y controlado'],
    checks(lm, c){
      const out=[];
      const top=c.lastRepMax;
      if(top!=null){
        if(top>=165) out.push(ok('Buena extensión de cadera'));
        else out.push(warn('Extiende más la cadera arriba'));
      }
      return out;
    }
  },

  {
    id:'facepull', name:'Face pull (banda)', emoji:'🎗️',
    equipment:['band'],
    muscles:'Deltoides posterior · espalda alta',
    view:'De frente, medio cuerpo',
    rep:{ measure:elbow, effort:'low', effortThresh:85, resetThresh:150 },
    gauges:[ {label:'Codo', get:elbow, min:50, max:175} ],
    cues:['Codos altos, a la altura de los hombros','Lleva la banda hacia la cara','Aprieta la escápula','Controla la vuelta'],
    checks(lm, c){
      const out=[];
      const rom=c.lastRom;
      if(rom!=null && rom>=55) out.push(ok('Buen tirón hacia la cara'));
      // codos altos
      const high=[[LM.L_ELBOW,LM.L_SHOULDER],[LM.R_ELBOW,LM.R_SHOULDER]]
        .some(([e,s])=>vis(lm[e])&&vis(lm[s])&&lm[e].y<=lm[s].y+0.04);
      out.push(high?ok('Codos a buena altura'):warn('Sube los codos a la altura del hombro'));
      return out;
    }
  },

  {
    id:'lateral', name:'Elevaciones laterales', emoji:'🕊️',
    equipment:['dumbbell','band'],
    muscles:'Deltoides lateral',
    view:'De frente, medio cuerpo',
    rep:{ measure:lm=>bilateral(lm,SHLDR_L,SHLDR_R), effort:'high', effortThresh:78, resetThresh:40 },
    gauges:[ {label:'Hombro', get:lm=>bilateral(lm,SHLDR_L,SHLDR_R), min:10, max:110} ],
    cues:['Sube los brazos a los lados hasta la altura del hombro','No pases de la horizontal','Codos ligeramente flexionados','Baja controlando'],
    checks(lm, c){
      const out=[];
      const top=c.lastRepMax;
      if(top!=null){
        if(top>105) out.push(warn('No subas por encima del hombro'));
        else if(top>=80) out.push(ok('Altura correcta (hasta el hombro)'));
        else out.push(warn('Sube un poco más, hasta la horizontal'));
      }
      // simetría
      const l=tri(lm,...SHLDR_L), r=tri(lm,...SHLDR_R);
      if(l!=null&&r!=null&&Math.abs(l-r)>18) out.push(warn('Sube ambos brazos por igual'));
      return out;
    }
  },

  {
    id:'pullup', name:'Dominadas', emoji:'🧗',
    equipment:['bar'],
    muscles:'Dorsal · bíceps · espalda',
    view:'De frente, cuerpo entero',
    rep:{ measure:elbow, effort:'low', effortThresh:80, resetThresh:160 },
    gauges:[ {label:'Codo', get:elbow, min:40, max:180} ],
    cues:['Cuelga con brazos extendidos','Lleva el pecho a la barra','Aprieta la escápula abajo','Controla la bajada'],
    checks(lm, c){
      const out=[];
      const bottom=c.lastRepMax; // extensión abajo (codo grande)
      if(bottom!=null){
        if(bottom>=160) out.push(ok('Extensión completa abajo'));
        else out.push(warn('Extiende del todo los brazos abajo'));
      }
      // mentón por encima de las muñecas (arriba)
      const chin=[[LM.NOSE,LM.L_WRIST],[LM.NOSE,LM.R_WRIST]]
        .some(([n,w])=>vis(lm[n])&&vis(lm[w])&&lm[n].y<lm[w].y);
      if(c.phase==='effort') out.push(chin?ok('Barbilla sobre la barra'):warn('Sube más, barbilla a la barra'));
      return out;
    }
  },

  {
    id:'dip', name:'Fondos en banco', emoji:'🪑',
    equipment:['bar','bodyweight'],
    muscles:'Tríceps · pecho · hombro',
    view:'De lado, medio cuerpo',
    rep:{ measure:elbow, effort:'low', effortThresh:100, resetThresh:155 },
    gauges:[ {label:'Codo', get:elbow, min:60, max:175} ],
    cues:['Codos hacia atrás, no hacia fuera','Baja hasta ~90° de codo','Hombros abajo, lejos de las orejas','Empuja hasta extender'],
    checks(lm, c){
      const out=[];
      const depth=c.lastRepMin ?? c.repMin;
      if(isFinite(depth)){
        if(depth<=100) out.push(ok('Buena profundidad'));
        else out.push(warn('Baja un poco más'));
      }
      return out;
    }
  },

  {
    id:'bench', name:'Press de banca', emoji:'🛏️',
    equipment:['bar','dumbbell'],
    muscles:'Pecho · tríceps · hombro',
    view:'De lado, medio cuerpo',
    rep:{ measure:elbow, effort:'low', effortThresh:95, resetThresh:155 },
    gauges:[ {label:'Codo', get:elbow, min:60, max:180} ],
    cues:['Escápulas retraídas y apoyadas','Baja la barra al pecho controlando','Codos ~45-75° del torso','Empuja hasta extender'],
    checks(lm, c){
      const out=[];
      const depth=c.lastRepMin ?? c.repMin;
      if(isFinite(depth)){
        if(depth<=95) out.push(ok('Buen rango al pecho'));
        else out.push(warn('Baja más la barra al pecho'));
      }
      const top=c.lastRepMax;
      if(top!=null && top>=160) out.push(ok('Extensión completa arriba'));
      return out;
    }
  },

  // ================= CORE =================
  {
    id:'crunch', name:'Crunch abdominal', emoji:'🔻', group:'core',
    equipment:['bodyweight'], muscles:'Abdominales (recto)', view:'De lado, tumbado',
    rep:{ measure:hip, effort:'low', effortThresh:112, resetThresh:132 },
    gauges:[ {label:'Tronco', get:hip, min:95, max:150} ],
    cues:['Tumbado, rodillas flexionadas','Sube los hombros con el abdomen, no con el cuello','Mentón separado del pecho','Baja controlando'],
    checks(lm,c){ const out=[]; const rom=c.lastRom; if(rom!=null) out.push(rom>=16?ok('Buena contracción'):warn('Enrolla un poco más el tronco')); return out; }
  },
  {
    id:'leg_raise', name:'Elevación de piernas', emoji:'🦵', group:'core',
    equipment:['bodyweight'], muscles:'Abdomen inferior · flexores de cadera', view:'De lado, tumbado',
    rep:{ measure:lm=>bilateral(lm,[LM.L_SHOULDER,LM.L_HIP,LM.L_ANKLE],[LM.R_SHOULDER,LM.R_HIP,LM.R_ANKLE]), effort:'low', effortThresh:115, resetThresh:150 },
    gauges:[ {label:'Cadera', get:lm=>bilateral(lm,[LM.L_SHOULDER,LM.L_HIP,LM.L_ANKLE],[LM.R_SHOULDER,LM.R_HIP,LM.R_ANKLE]), min:80, max:175} ],
    cues:['Tumbado boca arriba, piernas rectas','Sube las piernas hacia la vertical','Baja sin tocar el suelo','Zona lumbar pegada al suelo'],
    checks(lm,c){ const out=[]; const b=c.lastRepMin; if(b!=null) out.push(b<=105?ok('Buen rango'):warn('Sube más las piernas')); return out; }
  },
  {
    id:'mountain_climber', name:'Escaladores', emoji:'⛰️', group:'core',
    equipment:['bodyweight'], muscles:'Core · cardio · hombro', view:'De lado, cuerpo entero',
    rep:{ measure:lm=>{ const a=[tri(lm,...KNEE_L),tri(lm,...KNEE_R)].filter(v=>v!=null); return a.length?Math.min(...a):null; }, effort:'low', effortThresh:95, resetThresh:150 },
    gauges:[ {label:'Rodilla', get:lm=>{ const a=[tri(lm,...KNEE_L),tri(lm,...KNEE_R)].filter(v=>v!=null); return a.length?Math.min(...a):null; }, min:60, max:175} ],
    cues:['Posición de plancha alta','Lleva las rodillas al pecho alternando','Cadera baja y estable','Ritmo constante'],
    checks(lm){ const out=[]; const bl=bodyLineAngle(lm); if(bl!=null) out.push(bl>=158?ok('Cadera estable'):warn('No subas la cadera')); return out; }
  },
  {
    id:'bicycle', name:'Bicicleta abdominal', emoji:'🚴', group:'core',
    equipment:['bodyweight'], muscles:'Abdomen · oblicuos', view:'De lado, tumbado',
    rep:{ measure:lm=>{ const a=[tri(lm,...KNEE_L),tri(lm,...KNEE_R)].filter(v=>v!=null); return a.length?Math.min(...a):null; }, effort:'low', effortThresh:95, resetThresh:150 },
    gauges:[ {label:'Rodilla', get:lm=>{ const a=[tri(lm,...KNEE_L),tri(lm,...KNEE_R)].filter(v=>v!=null); return a.length?Math.min(...a):null; }, min:60, max:175} ],
    cues:['Codo hacia la rodilla contraria','Alterna con control','No tires del cuello','Lumbar apoyada'],
    checks(){ return [ok('Alterna codo-rodilla contraria')]; }
  },
  {
    id:'side_plank', name:'Plancha lateral', emoji:'🧍', group:'core', type:'hold',
    equipment:['bodyweight'], muscles:'Oblicuos · core', view:'Lateral, cuerpo entero',
    rep:{ measure:bodyLineAngle, effort:'low', effortThresh:0, resetThresh:999 },
    gauges:[ {label:'Cuerpo', get:bodyLineAngle, min:130, max:185} ],
    cues:['Antebrazo bajo el hombro','Cuerpo en línea recta','Cadera arriba','Aprieta el core'],
    checks(lm){ const out=[]; const bl=bodyLineAngle(lm); if(bl!=null) out.push(bl>=165?ok('Alineación correcta, aguanta'):warn('Sube la cadera, cuerpo recto')); return out; }
  },
  {
    id:'bird_dog', name:'Bird dog', emoji:'🐦', group:'core', type:'hold',
    equipment:['bodyweight'], muscles:'Core · lumbar · glúteo', view:'De lado, cuerpo entero',
    rep:{ measure:hip, effort:'low', effortThresh:0, resetThresh:999 },
    gauges:[ {label:'Cadera', get:hip, min:120, max:185} ],
    cues:['Cuadrupedia, espalda neutra','Extiende brazo y pierna opuestos','Cadera nivelada','No arquees la lumbar'],
    checks(){ return [ok('Mantén el equilibrio, cadera nivelada')]; }
  },
  {
    id:'superman', name:'Superman', emoji:'🦸', group:'core', type:'hold',
    equipment:['bodyweight'], muscles:'Lumbar · glúteo · espalda', view:'De lado, boca abajo',
    rep:{ measure:bodyLineAngle, effort:'low', effortThresh:0, resetThresh:999 },
    gauges:[],
    cues:['Boca abajo, brazos al frente','Eleva brazos y piernas a la vez','Aprieta glúteo y espalda','Cuello neutro'],
    checks(){ return [ok('Eleva brazos y piernas, aprieta arriba')]; }
  },

  // ================= FUERZA (extra) =================
  {
    id:'glute_bridge', name:'Puente de glúteo', emoji:'🌉', group:'lower',
    equipment:['bodyweight','dumbbell'], muscles:'Glúteo · isquios', view:'De lado, tumbado',
    rep:{ measure:hip, effort:'high', effortThresh:160, resetThresh:120 },
    gauges:[ {label:'Cadera', get:hip, min:90, max:185} ],
    cues:['Tumbado, pies apoyados','Empuja la cadera arriba','Aprieta el glúteo en el tope','No arquees la lumbar'],
    checks(lm,c){ const out=[]; const top=c.lastRepMax; if(top!=null) out.push(top>=160?ok('Buena extensión de cadera'):warn('Sube más la cadera, aprieta glúteo')); return out; }
  },
  {
    id:'bulgarian', name:'Sentadilla búlgara', emoji:'🦿', group:'lower',
    equipment:['bodyweight','dumbbell'], muscles:'Cuádriceps · glúteo', view:'De lado, cuerpo entero',
    rep:{ measure:lm=>{ const a=[tri(lm,...KNEE_L),tri(lm,...KNEE_R)].filter(v=>v!=null); return a.length?Math.min(...a):null; }, effort:'low', effortThresh:105, resetThresh:155 },
    gauges:[ {label:'Rodilla', get:lm=>{ const a=[tri(lm,...KNEE_L),tri(lm,...KNEE_R)].filter(v=>v!=null); return a.length?Math.min(...a):null; }, min:70, max:175} ],
    cues:['Pie trasero elevado en un banco','Baja recto, rodilla delantera a 90°','Tronco erguido','Empuja con el talón delantero'],
    checks(lm,c){ const out=[]; const d=c.lastRepMin??c.repMin; if(isFinite(d)) out.push(d<=105?ok('Buena profundidad'):warn('Baja un poco más')); return out; }
  },
  {
    id:'triceps_ext', name:'Extensión de tríceps', emoji:'🔨', group:'upper',
    equipment:['dumbbell','band'], muscles:'Tríceps', view:'De lado, medio cuerpo',
    rep:{ measure:elbow, effort:'high', effortThresh:155, resetThresh:95 },
    gauges:[ {label:'Codo', get:elbow, min:50, max:180} ],
    cues:['Codos arriba y pegados','Extiende del todo arriba','Baja detrás de la cabeza controlando','No muevas los hombros'],
    checks(lm,c){ const out=[]; const top=c.lastRepMax; if(top!=null) out.push(top>=160?ok('Extensión completa'):warn('Extiende del todo arriba')); return out; }
  },
  {
    id:'upright_row', name:'Remo al mentón', emoji:'🏋️', group:'upper',
    equipment:['dumbbell','band'], muscles:'Hombro · trapecio', view:'De frente, medio cuerpo',
    rep:{ measure:elbow, effort:'low', effortThresh:95, resetThresh:150 },
    gauges:[ {label:'Codo', get:elbow, min:50, max:175} ],
    cues:['Guía el movimiento con los codos altos','Peso cerca del cuerpo','Sube hasta el pecho','Baja controlando'],
    checks(lm){ const out=[]; const high=[[LM.L_ELBOW,LM.L_SHOULDER],[LM.R_ELBOW,LM.R_SHOULDER]].some(([e,s])=>vis(lm[e])&&vis(lm[s])&&lm[e].y<=lm[s].y+0.06); out.push(high?ok('Codos altos, correcto'):warn('Guía con los codos hacia arriba')); return out; }
  },
];

// ================= MÓDULO COMPLEMENTARIO: ESTIRAMIENTOS / MOVILIDAD =================
// Son ejercicios de tipo 'hold' (temporizador), con cámara opcional y sin conteo de reps.
const STRETCHES = [
  {id:'hamstring', name:'Estiramiento de isquios', emoji:'🦵', muscles:'Isquiosurales', view:'Cámara opcional', holdDefault:30,
    cues:['Sentado o de pie, pierna estirada','Lleva el pecho hacia el muslo','Espalda recta, no encorves','Respira, sin rebotes']},
  {id:'quad', name:'Estiramiento de cuádriceps', emoji:'🦵', muscles:'Cuádriceps', view:'Cámara opcional', holdDefault:30,
    cues:['De pie, sujeta el tobillo por detrás','Rodillas juntas','Empuja la cadera al frente','Mantén el equilibrio']},
  {id:'hip_flexor', name:'Estiramiento de flexor de cadera', emoji:'🚶', muscles:'Psoas · flexor de cadera', view:'Cámara opcional', holdDefault:30,
    cues:['Zancada, rodilla trasera en el suelo','Empuja la cadera hacia delante','Tronco erguido','Aprieta el glúteo trasero']},
  {id:'calf', name:'Estiramiento de gemelos', emoji:'🦶', muscles:'Gemelos · sóleo', view:'Cámara opcional', holdDefault:30,
    cues:['Manos en la pared, una pierna atrás','Talón en el suelo','Empuja el talón hacia abajo','Cambia de pierna']},
  {id:'chest_open', name:'Estiramiento de pecho', emoji:'🫁', muscles:'Pectoral · hombro', view:'Cámara opcional', holdDefault:30,
    cues:['Antebrazo apoyado en el marco de una puerta','Gira el tronco hacia fuera','Pecho abierto','Hombros abajo']},
  {id:'lat_side', name:'Estiramiento lateral (dorsal)', emoji:'🙆', muscles:'Dorsal · costado', view:'Cámara opcional', holdDefault:30,
    cues:['De pie, brazo por encima de la cabeza','Inclina el tronco al lado contrario','Estira el costado','Alterna lados']},
  {id:'glute_fig4', name:'Estiramiento de glúteo (figura 4)', emoji:'🍑', muscles:'Glúteo · piramidal', view:'Cámara opcional', holdDefault:30,
    cues:['Tumbado, cruza el tobillo sobre la rodilla','Lleva la rodilla al pecho','Nota el estiramiento en el glúteo','Relaja']},
  {id:'cat_cow', name:'Gato-camello', emoji:'🐱', muscles:'Columna · movilidad', view:'Cámara opcional', holdDefault:40,
    cues:['Cuadrupedia','Alterna arquear y redondear la espalda','Mueve con la respiración','Lento y controlado']},
  {id:'child_pose', name:'Postura del niño', emoji:'🧎', muscles:'Espalda · cadera', view:'Cámara opcional', holdDefault:40,
    cues:['De rodillas, siéntate sobre los talones','Estira los brazos al frente','Relaja la espalda','Respira profundo']},
  {id:'cobra', name:'Cobra (extensión lumbar)', emoji:'🐍', muscles:'Abdomen · lumbar', view:'Cámara opcional', holdDefault:30,
    cues:['Boca abajo, manos bajo los hombros','Eleva el pecho estirando los brazos','Hombros abajo','Sin forzar la lumbar']},
  {id:'neck', name:'Estiramiento de cuello', emoji:'🙂', muscles:'Cuello · trapecio', view:'Cámara opcional', holdDefault:25,
    cues:['Sentado o de pie','Inclina la cabeza a un lado','Baja el hombro contrario','Alterna con suavidad']},
  {id:'thoracic_rot', name:'Rotación torácica', emoji:'🔄', muscles:'Columna dorsal · movilidad', view:'Cámara opcional', holdDefault:30,
    cues:['Cuadrupedia, una mano en la nuca','Abre el codo hacia el techo rotando','Sigue el codo con la mirada','Alterna lados']},
  {id:'forward_fold', name:'Flexión de pie', emoji:'🙇', muscles:'Cadena posterior', view:'Cámara opcional', holdDefault:30,
    cues:['De pie, piernas casi rectas','Baja el tronco hacia los pies','Relaja cuello y brazos','Rodillas ligeramente flexionadas']},
  {id:'shoulder_circles', name:'Círculos de hombros', emoji:'🔃', muscles:'Calentamiento · hombro', view:'Cámara opcional', holdDefault:30,
    cues:['De pie, brazos extendidos','Círculos amplios adelante y atrás','Movimiento continuo','Calienta el hombro']},
];
STRETCHES.forEach(s=>{
  s.type='hold'; s.group='stretch'; s.category='estiramiento'; s.camOptional=true;
  s.equipment = s.equipment || ['bodyweight'];
  s.gauges = s.gauges || [];
  s.rep = s.rep || { measure:()=>null, effort:'low', effortThresh:0, resetThresh:999 };
  s.checks = s.checks || (()=>[{level:'good', msg:'Respira hondo y relaja, sin rebotes'}]);
});
EXERCISES.push(...STRETCHES);

// ================= BAJO IMPACTO (mayores / rehabilitación / principiantes) =================
const kneeMinHip = lm => { const a=[tri(lm,LM.L_SHOULDER,LM.L_HIP,LM.L_KNEE),tri(lm,LM.R_SHOULDER,LM.R_HIP,LM.R_KNEE)].filter(v=>v!=null); return a.length?Math.min(...a):null; };
const LOWIMPACT = [
  { id:'chair_squat', name:'Sentadilla a la silla', emoji:'🪑', group:'lower', lowImpact:true,
    equipment:['bodyweight'], muscles:'Cuádriceps · glúteo (bajo impacto)', view:'De lado, cuerpo entero',
    rep:{ measure:knee, effort:'low', effortThresh:120, resetThresh:160 },
    gauges:[{label:'Rodilla', get:knee, min:80, max:175}],
    cues:['Siéntate y levántate de una silla','Controla la bajada','Pecho arriba','Empuja con los talones'],
    checks(lm,c){ const out=[]; const d=c.lastRepMin??c.repMin; if(isFinite(d)) out.push(d<=130?ok('Buen recorrido'):warn('Baja hasta rozar la silla')); return out; } },
  { id:'wall_pushup', name:'Flexión en pared', emoji:'🧱', group:'upper', lowImpact:true,
    equipment:['bodyweight'], muscles:'Pecho · tríceps (bajo impacto)', view:'De lado, medio cuerpo',
    rep:{ measure:elbow, effort:'low', effortThresh:110, resetThresh:155 },
    gauges:[{label:'Codo', get:elbow, min:70, max:175}],
    cues:['Manos en la pared a la altura del pecho','Acerca el pecho a la pared','Cuerpo recto','Empuja para volver'],
    checks(lm,c){ const out=[]; const d=c.lastRepMin??c.repMin; if(isFinite(d)) out.push(d<=110?ok('Buen rango'):warn('Acércate más a la pared')); return out; } },
  { id:'marching', name:'Marcha en el sitio', emoji:'🚶', group:'core', lowImpact:true,
    equipment:['bodyweight'], muscles:'Core · cardio suave', view:'De frente, cuerpo entero',
    rep:{ measure:kneeMinHip, effort:'low', effortThresh:120, resetThresh:150 },
    gauges:[{label:'Cadera', get:kneeMinHip, min:90, max:175}],
    cues:['Marcha levantando las rodillas','Ritmo cómodo','Los brazos acompañan','Respira'],
    checks(){ return [ok('Sube bien las rodillas, ritmo cómodo')]; } },
  { id:'seated_knee', name:'Elevación de rodilla (sentado)', emoji:'💺', group:'core', lowImpact:true,
    equipment:['bodyweight'], muscles:'Abdomen · flexor de cadera (sentado)', view:'De lado, sentado',
    rep:{ measure:kneeMinHip, effort:'low', effortThresh:85, resetThresh:115 },
    gauges:[{label:'Cadera', get:kneeMinHip, min:60, max:135}],
    cues:['Sentado, espalda recta','Sube una rodilla hacia el pecho','Alterna','Aprieta el abdomen'],
    checks(){ return [ok('Sube la rodilla y aprieta el abdomen')]; } },
];
EXERCISES.push(...LOWIMPACT);

// ================= EXPLOSIVOS / CARDIO (potencia y acondicionamiento) =================
const DYNAMIC = [
  { id:'jump_squat', name:'Sentadilla con salto', emoji:'🆙', group:'lower',
    equipment:['bodyweight'], muscles:'Cuádriceps · glúteo (potencia)', view:'De frente, cuerpo entero',
    rep:{ measure:knee, effort:'low', effortThresh:120, resetThresh:165 },
    gauges:[{label:'Rodilla', get:knee, min:70, max:175}],
    cues:['Baja en sentadilla','Salta con fuerza extendiendo la cadera','Aterriza suave, rodillas alineadas','Encadena con control'],
    checks(lm,c){ const out=[]; const d=c.lastRepMin??c.repMin; if(isFinite(d)) out.push(d<=120?ok('Buena carga antes del salto'):warn('Baja algo más antes de saltar')); return out; } },
  { id:'push_press', name:'Press con impulso', emoji:'⏫', group:'upper',
    equipment:['dumbbell','bar'], muscles:'Hombro · tríceps · piernas (potencia)', view:'De frente, cuerpo entero',
    rep:{ measure:elbow, effort:'high', effortThresh:155, resetThresh:95 },
    gauges:[{label:'Codo', get:elbow, min:70, max:180}],
    cues:['Flexiona apenas las piernas','Impulsa y empuja el peso arriba','Bloquea los codos','Baja controlando al hombro'],
    checks(lm,c){ const out=[]; const top=c.lastRepMax; if(top!=null) out.push(top>=160?ok('Bloqueo completo arriba'):warn('Extiende del todo arriba')); return out; } },
  { id:'thruster', name:'Thruster', emoji:'🚀', group:'full',
    equipment:['dumbbell'], muscles:'Full body (potencia)', view:'De frente, cuerpo entero',
    rep:{ measure:knee, effort:'low', effortThresh:120, resetThresh:165 },
    gauges:[{label:'Rodilla', get:knee, min:70, max:175},{label:'Codo', get:elbow, min:70, max:180}],
    cues:['Sentadilla profunda','Sube explosivo y empuja el peso arriba','Un solo movimiento fluido','Controla la bajada'],
    checks(lm,c){ const out=[]; const d=c.lastRepMin??c.repMin; if(isFinite(d)) out.push(d<=120?ok('Buena sentadilla'):warn('Baja más en la sentadilla')); return out; } },
  { id:'jumping_jacks', name:'Saltos de tijera', emoji:'🤸', group:'core',
    equipment:['bodyweight'], muscles:'Cardio · full body', view:'De frente, cuerpo entero',
    rep:{ measure:lm=>bilateral(lm,SHLDR_L,SHLDR_R), effort:'high', effortThresh:120, resetThresh:60 },
    gauges:[{label:'Brazos', get:lm=>bilateral(lm,SHLDR_L,SHLDR_R), min:20, max:170}],
    cues:['Abre brazos y piernas a la vez','Sube las manos sobre la cabeza','Ritmo constante','Aterriza suave'],
    checks(){ return [ok('Abre bien brazos y piernas, ritmo constante')]; } },
];
EXERCISES.push(...DYNAMIC);

// --- Grupo muscular, categoría, atributos y enlace de vídeo por ejercicio ---
const GROUP_MAP = {
  squat:'lower', pushup:'upper', lunge:'lower', plank:'core', curl:'upper',
  ohp:'upper', row:'upper', rdl:'lower', swing:'full', facepull:'upper',
  lateral:'upper', pullup:'upper', dip:'upper', bench:'upper',
};
const A_EXPLOSIVE = new Set(['swing','jump_squat','thruster','push_press','jumping_jacks']);
const A_CARDIO    = new Set(['mountain_climber','bicycle','jumping_jacks','marching','jump_squat','thruster']);
const A_ISOLATION = new Set(['curl','lateral','triceps_ext','facepull','upright_row']);
const A_COMPOUND  = new Set(['squat','lunge','rdl','bulgarian','glute_bridge','pushup','ohp','row','pullup','dip','bench','thruster','push_press','chair_squat','wall_pushup','jump_squat']);
EXERCISES.forEach(e=>{
  e.group = e.group || GROUP_MAP[e.id] || 'full';
  e.category = e.category || 'fuerza';
  e.weighted = e.equipment.includes('dumbbell') || e.equipment.includes('bar');  // admite registrar kg
  e.lowImpact = !!e.lowImpact;
  e.explosive = A_EXPLOSIVE.has(e.id);
  e.cardio    = A_CARDIO.has(e.id);
  e.isolation = A_ISOLATION.has(e.id);
  e.compound  = A_COMPOUND.has(e.id);
  e.yt = 'https://www.youtube.com/results?search_query='+encodeURIComponent('técnica '+e.name+' ejercicio en casa');
});

// Escalado por nivel de dificultad (Fase 2)
export function levelReps(base, level){
  const m = level==='principiante' ? 0.8 : level==='avanzado' ? 1.3 : 1;
  return Math.max(5, Math.round((base||10)*m));
}
export function levelSets(baseSets, level){
  return Math.max(2, (baseSets||3) + (level==='avanzado'?1:0) - (level==='principiante'?1:0));
}

export const GROUPS = {
  all:    {label:'Todos',          ic:'🗂️'},
  full:   {label:'Full body',      ic:'🔥'},
  upper:  {label:'Tren superior',  ic:'💪'},
  lower:  {label:'Tren inferior',  ic:'🦵'},
  core:   {label:'Core',           ic:'🎯'},
  stretch:{label:'Estiramiento',   ic:'🧘'},
};

// Objetivos de entrenamiento: cada uno define un esquema (reps/series/descanso/tempo/carga)
// y un sesgo de selección de ejercicios. Cambiarlo re-genera la rutina al instante.
export const TRAIN_GOALS = {
  general:      {label:'General / Salud',    ic:'✅', reps:[10,12], setsDelta:0,  rest:60,  load:'Moderado',                tempo:'Controlado',                 bias:'balanced',  exDelta:0,  info:'Equilibrio de fuerza y tono para estar en forma.'},
  fuerza:       {label:'Fuerza',             ic:'🏋️', reps:[4,6],   setsDelta:1,  rest:150, load:'Pesado (≈85% 1RM)',       tempo:'Controlado, lejos del fallo',bias:'compound',  exDelta:-1, info:'Cargas altas, pocas reps y descansos largos. Ejercicios compuestos.'},
  hipertrofia:  {label:'Hipertrofia',        ic:'💪', reps:[8,12],  setsDelta:0,  rest:75,  load:'Moderado-alto (≈70-80%)', tempo:'2-0-2, cerca del fallo',     bias:'balanced',  exDelta:0,  info:'Volumen moderado para ganar músculo.'},
  potencia:     {label:'Potencia',           ic:'⚡', reps:[3,5],   setsDelta:1,  rest:120, load:'Explosivo (≈50-70%)',     tempo:'Máxima velocidad al subir',  bias:'explosive', exDelta:0,  info:'Movimientos explosivos, pocas reps, descanso completo.'},
  resistencia:  {label:'Resistencia musc.',  ic:'🔁', reps:[15,20], setsDelta:-1, rest:40,  load:'Ligero',                  tempo:'Continuo',                   bias:'endurance', exDelta:0,  info:'Muchas reps con poco descanso para aguante muscular.'},
  perdida_grasa:{label:'Pérdida de grasa',   ic:'🔥', reps:[12,15], setsDelta:0,  rest:25,  load:'Ligero-moderado',         tempo:'Ritmo alto (circuito)',      bias:'cardio',    exDelta:2,  info:'Formato circuito con cardio y descansos cortos.'},
};
export function getGoal(id){ return TRAIN_GOALS[id] || TRAIN_GOALS.general; }

function matchGroup(e, group){
  if(group==='all')    return true;
  if(group==='full')   return e.group!=='stretch';       // full body = fuerza, la rutina hace el balance
  if(group==='upper')  return e.group==='upper' || e.group==='core';
  if(group==='lower')  return e.group==='lower';
  if(group==='core')   return e.group==='core';
  if(group==='stretch')return e.group==='stretch';
  return true;
}

// Ejercicios disponibles para un grupo + equipamiento
export function exercisesForGroup(group, equip){
  return EXERCISES.filter(e => e.equipment.some(k=>equip.has(k)) && matchGroup(e, group));
}

// Sugerencia de rutina equilibrada para el día
export function suggestRoutine(group, equip){
  const pool = EXERCISES.filter(e => e.equipment.some(k=>equip.has(k)));
  const g = key => pool.filter(e=>e.group===key);
  const push = pool.filter(e=>['pushup','ohp','lateral','dip','bench'].includes(e.id));
  const pull = pool.filter(e=>['row','facepull','pullup','curl'].includes(e.id));
  const interleave = (a,b,max)=>{ const r=[]; let i=0,j=0;
    while(r.length<max && (i<a.length||j<b.length)){ if(i<a.length)r.push(a[i++]); if(r.length<max&&j<b.length)r.push(b[j++]); }
    return r; };
  let list;
  if(group==='lower')       list=[...g('lower'), ...g('core')].slice(0,5);
  else if(group==='core')   list=[...g('core'), ...g('lower')].slice(0,5);
  else if(group==='upper')  list=[...interleave(push,pull,5), ...g('core')].slice(0,6);
  else if(group==='stretch')list=g('stretch').slice(0,8);
  else /* full / all */     list=[...g('lower').slice(0,2), ...interleave(push,pull,3), ...g('core').slice(0,1)];
  return [...new Map(list.map(e=>[e.id,e])).values()]; // dedupe manteniendo el orden
}

export function getExercise(id){ return EXERCISES.find(e=>e.id===id); }

// ===== Rutina guiada del día (ajustada al tiempo, al objetivo y con variedad) =====
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const PUSH_IDS=['pushup','ohp','lateral','dip','bench','triceps_ext','upright_row','push_press','wall_pushup'];
const PULL_IDS=['row','facepull','pullup','curl'];

// Selección de ejercicios principales con variedad (barajada) y sesgo según el objetivo
function selectMain(pool, n, bias){
  let p = pool.slice();
  if(bias==='compound')  p = p.filter(e=>e.compound).length>=3 ? p.filter(e=>e.compound) : p;
  if(bias==='explosive'){ const ex=p.filter(e=>e.explosive||e.compound); if(ex.length>=3) p=ex; p=p.filter(e=>!e.isolation); }
  const lower=shuffle(p.filter(e=>e.group==='lower'));
  const push =shuffle(p.filter(e=>PUSH_IDS.includes(e.id)));
  const pull =shuffle(p.filter(e=>PULL_IDS.includes(e.id)));
  const core =shuffle(p.filter(e=>e.group==='core'));
  const cardio=shuffle(p.filter(e=>e.cardio));
  const explosive=shuffle(p.filter(e=>e.explosive));
  let rot;
  if(bias==='explosive')   rot=[explosive,lower,push,pull,explosive,core];
  else if(bias==='cardio') rot=[cardio,lower,push,pull,cardio,core];
  else                     rot=[lower,push,pull,core];
  rot=rot.concat([lower,push,pull,core]); // relleno equilibrado
  const seq=[]; let guard=0;
  while(seq.length<n && guard++<300){
    let progressed=false;
    for(const bucket of rot){
      if(seq.length>=n) break;
      const x=bucket.find(e=>!seq.includes(e));
      if(x){ seq.push(x); progressed=true; }
    }
    if(!progressed) break;
  }
  for(const e of shuffle(p)){ if(seq.length>=n) break; if(!seq.includes(e)) seq.push(e); } // relleno final
  return seq.slice(0,n);
}

// Devuelve {steps:[{id,ex,name,emoji,type,mode,sets,reps,repsLabel,secs,phase,est}], estMin, minutes, goal}
export function buildGuidedPlan(group, equip, minutes, opts={}){
  const level = opts.level || 'intermedio';
  const goal = getGoal(opts.goal);
  const [repLo, repHi] = goal.reps;
  const restS = goal.rest;
  const trans = 20;
  const g = (group==='all') ? 'full' : group;
  const stretchPool = exercisesForGroup('stretch', equip);
  const byId = id => stretchPool.find(e=>e.id===id);
  const workOf = (mode,reps,secs)=> mode==='hold' ? secs : Math.round(reps*3.2);
  // tiempo realista: principal = series*(trabajo+descanso)+transición; movilidad = duración + transición corta
  const estOf = (mode,sets,reps,secs,phase)=> phase==='main' ? sets*(workOf(mode,reps,secs)+restS)+trans : (secs+15);
  const mk = (ex,mode,sets,reps,secs,phase,repsLabel)=>({ id:ex.id, ex, name:ex.name, emoji:ex.emoji, type:ex.type, mode, sets, reps, secs, phase, repsLabel, est:estOf(mode,sets,reps,secs,phase) });
  const meta = { key: opts.goal||'general', ...goal };
  const steps=[];

  // Sesión de estiramiento/movilidad (ignora el objetivo de fuerza)
  if(g==='stretch'){
    const target = {30:6,45:9,60:12}[minutes] || 8;
    for(const ex of shuffle(stretchPool.slice())){ if(steps.length>=target) break; steps.push(mk(ex,'hold',1,0,ex.holdDefault||30,'main')); }
    return { steps, estMin:Math.round(steps.reduce((s,x)=>s+x.est,0)/60), minutes, goal:meta };
  }

  const cfgBase = {30:{warm:0,cool:1}, 45:{warm:1,cool:2}, 60:{warm:2,cool:3}}[minutes] || {warm:1,cool:2};
  const baseSets = {30:3,45:3,60:4}[minutes] || 3;
  const sets = Math.max(2, baseSets + goal.setsDelta + (level==='avanzado'?1:0) - (level==='principiante'?1:0));
  const pool = exercisesForGroup(g, equip).filter(e=>e.group!=='stretch');
  const warmIds=['shoulder_circles','cat_cow','thoracic_rot','hip_flexor'];
  const coolIds=['hamstring','quad','chest_open','forward_fold','child_pose','glute_fig4'];

  const budget=minutes*60;
  const total=()=>steps.reduce((s,x)=>s+x.est,0);
  const coolReserve = cfgBase.cool*(30+15);          // reserva realista de la vuelta a la calma
  const MIN_MAIN=3, MAX_MAIN=9;

  for(let k=0;k<cfgBase.warm;k++){ const ex=byId(warmIds[k]); if(ex) steps.push(mk(ex,'hold',1,0,Math.min(ex.holdDefault||30,30),'warmup')); }

  // Añade principales ajustándose al TIEMPO disponible (mín 3). Con descansos largos → menos ejercicios.
  const mainList = selectMain(pool, MAX_MAIN, goal.bias);
  for(const ex of mainList){
    let st;
    if(ex.type==='hold'){
      const secs = Math.round((ex.holdDefault||40) * (goal.bias==='endurance'?1.3 : goal.bias==='explosive'?0.7 : 1));
      st = mk(ex,'hold',sets,0,secs,'main');
    }else{
      st = mk(ex,'reps',sets,repHi,0,'main', `${repLo}-${repHi}`);  // el contador usa el extremo alto
    }
    const mainCount = steps.filter(s=>s.phase==='main').length;
    if(mainCount>=MAX_MAIN) break;
    if(mainCount < MIN_MAIN || total()+st.est+coolReserve <= budget) steps.push(st);
    else break;
  }

  for(let k=0;k<cfgBase.cool;k++){ const ex=byId(coolIds[k]); if(ex) steps.push(mk(ex,'hold',1,0,ex.holdDefault||30,'cooldown')); }

  while(total() > budget*1.08){
    const idxMain = steps.map((s,i)=>s.phase==='main'?i:-1).filter(i=>i>=0);
    if(idxMain.length<=MIN_MAIN) break;
    steps.splice(idxMain[idxMain.length-1],1);
  }
  return { steps, estMin:Math.round(total()/60), minutes, goal:meta };
}

// Filtra por equipamiento seleccionado (set de claves) y texto de búsqueda
export function filterExercises(selected, query=''){
  const q=query.trim().toLowerCase();
  return EXERCISES.filter(e=>{
    const eqOk = e.equipment.some(k=>selected.has(k));
    const qOk = !q || e.name.toLowerCase().includes(q) || e.muscles.toLowerCase().includes(q);
    return eqOk && qOk;
  });
}

// Conexiones para dibujar el esqueleto
export const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],       // brazos + hombros
  [11,23],[12,24],[23,24],                        // torso
  [23,25],[25,27],[24,26],[26,28],                // piernas
  [27,29],[27,31],[28,30],[28,32],                // pies
];
