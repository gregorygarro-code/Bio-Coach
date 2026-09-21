// ===== Demostraciones animadas de cada ejercicio (figura articulada) =====
// Cinemática directa simple: cada fase se define con ángulos de segmento.
// Convención de ángulos (grados, y hacia abajo): 0=derecha, 90=abajo, -90=arriba.

const LEN = { torso:34, head:12, uarm:18, farm:16, thigh:24, shin:24 };
const DEF = { hipX:100, hipY:120, torso:-90, uarm:90, farm:90, thigh:90, shin:90 };

const dir = d => { const r=d*Math.PI/180; return [Math.cos(r), Math.sin(r)]; };

function build(p){
  const P={...DEF,...p};
  const hip=[P.hipX,P.hipY];
  const [tx,ty]=dir(P.torso); const sh=[hip[0]+LEN.torso*tx, hip[1]+LEN.torso*ty];
  const head=[sh[0]+LEN.head*tx, sh[1]+LEN.head*ty];
  const [ux,uy]=dir(P.uarm); const el=[sh[0]+LEN.uarm*ux, sh[1]+LEN.uarm*uy];
  const [fx,fy]=dir(P.farm); const ha=[el[0]+LEN.farm*fx, el[1]+LEN.farm*fy];
  const [ax,ay]=dir(P.thigh); const kn=[hip[0]+LEN.thigh*ax, hip[1]+LEN.thigh*ay];
  const [bx,by]=dir(P.shin);  const an=[kn[0]+LEN.shin*bx, kn[1]+LEN.shin*by];
  return {hip,sh,head,el,ha,kn,an};
}
const lerp=(a,b,t)=>a+(b-a)*t;
function lerpPose(A,B,t){ const o={}; for(const k in DEF) o[k]=lerp(A[k]??DEF[k], B[k]??DEF[k], t); return o; }

// Definición de fases por ejercicio {a, b, speed?}
export const DEMOS = {
  squat:{ a:{uarm:40,farm:40}, b:{hipX:96,hipY:150,torso:-62,uarm:18,farm:18,thigh:40,shin:128} },
  pushup:{ a:{hipX:96,hipY:120,torso:-12,uarm:92,farm:92,thigh:192,shin:192},
           b:{hipX:96,hipY:132,torso:-12,uarm:120,farm:62,thigh:192,shin:192} },
  lunge:{ a:{uarm:90,farm:90}, b:{hipX:100,hipY:142,torso:-84,uarm:88,farm:88,thigh:58,shin:120} },
  plank:{ a:{hipX:96,hipY:122,torso:-12,uarm:92,farm:92,thigh:192,shin:192},
          b:{hipX:96,hipY:125,torso:-12,uarm:92,farm:92,thigh:192,shin:192}, speed:0.5 },
  curl:{ a:{uarm:88,farm:88}, b:{uarm:82,farm:-18} },
  ohp:{ a:{uarm:-138,farm:-92}, b:{uarm:-90,farm:-90} },
  row:{ a:{hipX:100,hipY:118,torso:-34,thigh:90,shin:90,uarm:82,farm:82},
        b:{hipX:100,hipY:118,torso:-34,thigh:90,shin:90,uarm:58,farm:-8} },
  rdl:{ a:{torso:-90,uarm:90,farm:90}, b:{hipX:100,hipY:116,torso:-38,uarm:72,farm:72,thigh:94,shin:92} },
  swing:{ a:{hipX:100,hipY:116,torso:-42,uarm:58,farm:58,thigh:94,shin:92},
          b:{torso:-90,uarm:32,farm:32}, speed:1.4 },
  facepull:{ a:{uarm:12,farm:12}, b:{uarm:-8,farm:-150} },
  lateral:{ a:{uarm:90,farm:90}, b:{uarm:3,farm:3} },
  pullup:{ a:{hipX:100,hipY:120,uarm:-90,farm:-90,thigh:92,shin:92},
           b:{hipX:100,hipY:110,uarm:-118,farm:-66,thigh:92,shin:92} },
  dip:{ a:{hipX:100,hipY:118,uarm:92,farm:92,thigh:18,shin:44},
        b:{hipX:100,hipY:132,uarm:118,farm:66,thigh:18,shin:44} },
  bench:{ a:{hipX:78,hipY:150,torso:2,thigh:205,shin:150,uarm:-90,farm:-90},
          b:{hipX:78,hipY:150,torso:2,thigh:205,shin:150,uarm:-90,farm:-138} },

  // ===== CORE =====
  crunch:{ a:{hipX:82,hipY:150,torso:-8,uarm:20,farm:20,thigh:-35,shin:55},
           b:{hipX:82,hipY:150,torso:-34,uarm:-12,farm:-42,thigh:-35,shin:55} },
  leg_raise:{ a:{hipX:100,hipY:150,torso:178,uarm:120,farm:120,thigh:6,shin:6},
              b:{hipX:100,hipY:150,torso:178,uarm:120,farm:120,thigh:-70,shin:-70} },
  mountain_climber:{ a:{hipX:96,hipY:120,torso:-12,uarm:92,farm:92,thigh:192,shin:192},
                     b:{hipX:96,hipY:120,torso:-12,uarm:92,farm:92,thigh:150,shin:120}, speed:1.5 },
  bicycle:{ a:{hipX:100,hipY:150,torso:175,uarm:150,farm:150,thigh:20,shin:60},
            b:{hipX:100,hipY:150,torso:175,uarm:150,farm:150,thigh:-40,shin:20}, speed:1.3 },
  side_plank:{ a:{hipX:100,hipY:130,torso:-26,uarm:92,farm:92,thigh:200,shin:200},
               b:{hipX:100,hipY:132,torso:-26,uarm:92,farm:92,thigh:200,shin:200}, speed:0.5 },
  bird_dog:{ a:{hipX:100,hipY:118,torso:-15,uarm:22,farm:22,thigh:158,shin:200},
             b:{hipX:100,hipY:120,torso:-15,uarm:26,farm:26,thigh:162,shin:200}, speed:0.5 },
  superman:{ a:{hipX:100,hipY:150,torso:-8,uarm:26,farm:16,thigh:196,shin:172},
             b:{hipX:100,hipY:146,torso:-8,uarm:20,farm:8,thigh:200,shin:166}, speed:0.6 },

  // ===== FUERZA (extra) =====
  glute_bridge:{ a:{hipX:100,hipY:150,torso:168,uarm:120,farm:120,thigh:60,shin:120},
                 b:{hipX:100,hipY:134,torso:162,uarm:120,farm:120,thigh:44,shin:132} },
  bulgarian:{ a:{uarm:88,farm:88,thigh:90,shin:90},
              b:{hipX:100,hipY:142,torso:-84,uarm:88,farm:88,thigh:58,shin:120} },
  triceps_ext:{ a:{uarm:-90,farm:-135}, b:{uarm:-90,farm:-90} },
  upright_row:{ a:{uarm:88,farm:88}, b:{uarm:48,farm:14} },

  // ===== ESTIRAMIENTOS / MOVILIDAD =====
  hamstring:{ a:{torso:-72,uarm:44,farm:44}, b:{torso:-40,uarm:20,farm:20}, speed:0.4 },
  quad:{ a:{thigh:90,shin:90,uarm:90,farm:90}, b:{thigh:90,shin:-18,uarm:90,farm:64}, speed:0.4 },
  hip_flexor:{ a:{hipX:100,hipY:132,torso:-85,thigh:55,shin:120}, b:{hipX:100,hipY:138,torso:-85,thigh:52,shin:122}, speed:0.4 },
  calf:{ a:{torso:-72,uarm:18,farm:18,thigh:112,shin:92}, b:{torso:-70,uarm:18,farm:18,thigh:114,shin:92}, speed:0.4 },
  chest_open:{ a:{uarm:150,farm:150}, b:{uarm:172,farm:172}, speed:0.4 },
  lat_side:{ a:{torso:-90,uarm:-80,farm:-80}, b:{torso:-68,uarm:-58,farm:-58}, speed:0.4 },
  glute_fig4:{ a:{hipX:100,hipY:150,torso:176,uarm:130,farm:130,thigh:-42,shin:18}, b:{hipX:100,hipY:150,torso:176,uarm:130,farm:130,thigh:-52,shin:12}, speed:0.4 },
  cat_cow:{ a:{hipX:100,hipY:118,torso:-16,uarm:80,farm:80,thigh:168,shin:168}, b:{hipX:100,hipY:126,torso:-26,uarm:80,farm:80,thigh:172,shin:172}, speed:0.5 },
  child_pose:{ a:{hipX:112,hipY:150,torso:-28,uarm:20,farm:20,thigh:205,shin:250}, b:{hipX:112,hipY:150,torso:-30,uarm:16,farm:16,thigh:205,shin:250}, speed:0.4 },
  cobra:{ a:{hipX:90,hipY:150,torso:-22,uarm:92,farm:92,thigh:190,shin:190}, b:{hipX:90,hipY:150,torso:-42,uarm:96,farm:96,thigh:190,shin:190}, speed:0.5 },
  neck:{ a:{torso:-90,uarm:90,farm:90}, b:{torso:-84,uarm:90,farm:90}, speed:0.4 },
  thoracic_rot:{ a:{hipX:100,hipY:120,torso:-15,uarm:60,farm:60,thigh:170,shin:170}, b:{hipX:100,hipY:120,torso:-15,uarm:-42,farm:-42,thigh:170,shin:170}, speed:0.5 },
  forward_fold:{ a:{torso:-78,uarm:20,farm:20}, b:{torso:-34,uarm:44,farm:44}, speed:0.4 },
  shoulder_circles:{ a:{uarm:40,farm:40}, b:{uarm:-40,farm:-40}, speed:0.8 },

  // ===== BAJO IMPACTO =====
  chair_squat:{ a:{uarm:35,farm:35}, b:{hipX:96,hipY:146,torso:-58,uarm:15,farm:15,thigh:40,shin:118} },
  wall_pushup:{ a:{torso:-90,uarm:10,farm:10}, b:{torso:-90,uarm:18,farm:-46} },
  marching:{ a:{uarm:70,farm:70,thigh:90,shin:90}, b:{uarm:70,farm:70,thigh:40,shin:70}, speed:1.2 },
  seated_knee:{ a:{hipX:96,hipY:120,torso:-90,uarm:70,farm:70,thigh:6,shin:92}, b:{hipX:96,hipY:120,torso:-90,uarm:70,farm:70,thigh:-28,shin:45}, speed:0.9 },

  // ===== EXPLOSIVOS / CARDIO =====
  jump_squat:{ a:{hipX:100,hipY:104,uarm:-40,farm:-40,thigh:92,shin:92}, b:{hipX:96,hipY:150,torso:-58,uarm:20,farm:20,thigh:40,shin:126}, speed:1.4 },
  push_press:{ a:{hipX:100,hipY:126,torso:-90,uarm:-135,farm:-92,thigh:70,shin:110}, b:{uarm:-90,farm:-90,thigh:90,shin:90}, speed:1.3 },
  thruster:{ a:{hipX:96,hipY:150,torso:-58,uarm:-130,farm:-96,thigh:40,shin:126}, b:{uarm:-90,farm:-90,thigh:90,shin:90}, speed:1.2 },
  jumping_jacks:{ a:{uarm:88,farm:88,thigh:96,shin:88}, b:{uarm:-64,farm:-64,thigh:66,shin:104}, speed:1.5 },

  // ===== PREVENCIÓN DE LESIONES / PREHAB =====
  band_pull_apart:{ a:{uarm:6,farm:6}, b:{uarm:2,farm:-14}, speed:0.8 },
  ext_rotation:{ a:{uarm:70,farm:12}, b:{uarm:70,farm:70}, speed:0.7 },
  wall_slide:{ a:{torso:-90,uarm:-40,farm:-40}, b:{torso:-90,uarm:-92,farm:-92}, speed:0.6 },
  clamshell:{ a:{hipX:100,hipY:150,torso:176,uarm:150,farm:150,thigh:-30,shin:30}, b:{hipX:100,hipY:150,torso:176,uarm:150,farm:150,thigh:-58,shin:6}, speed:0.7 },
  glute_med_raise:{ a:{hipX:100,hipY:150,torso:178,uarm:150,farm:150,thigh:2,shin:2}, b:{hipX:100,hipY:150,torso:178,uarm:150,farm:150,thigh:-24,shin:-24}, speed:0.7 },
  dead_bug:{ a:{hipX:100,hipY:150,torso:178,uarm:-70,farm:-70,thigh:-70,shin:-10}, b:{hipX:100,hipY:150,torso:178,uarm:120,farm:120,thigh:6,shin:60}, speed:0.6 },
  ankle_mob:{ a:{hipX:100,hipY:130,torso:-85,thigh:60,shin:120}, b:{hipX:100,hipY:136,torso:-85,thigh:48,shin:126}, speed:0.5 },
  nordic_curl:{ a:{hipX:100,hipY:120,torso:-90,thigh:90,shin:90,uarm:80,farm:80}, b:{hipX:100,hipY:120,torso:-52,thigh:90,shin:90,uarm:40,farm:40}, speed:0.4 },
  scapular_pushup:{ a:{hipX:96,hipY:122,torso:-12,uarm:92,farm:92,thigh:192,shin:192}, b:{hipX:96,hipY:118,torso:-12,uarm:92,farm:92,thigh:192,shin:192}, speed:0.6 },
  calf_raise_prehab:{ a:{hipX:100,hipY:122,uarm:70,farm:70}, b:{hipX:100,hipY:112,uarm:70,farm:70}, speed:0.7 },

  // ===== MOVILIDAD (FRC) + CONTROL POSTURAL =====
  worlds_greatest:{ a:{hipX:100,hipY:140,torso:-70,uarm:70,farm:70,thigh:55,shin:120}, b:{hipX:100,hipY:140,torso:-50,uarm:-70,farm:-70,thigh:55,shin:120}, speed:0.45 },
  hip_9090:{ a:{hipX:100,hipY:150,torso:-90,uarm:40,farm:40,thigh:20,shin:70}, b:{hipX:100,hipY:150,torso:-90,uarm:40,farm:40,thigh:-30,shin:20}, speed:0.5 },
  cossack:{ a:{uarm:35,farm:35,thigh:90,shin:90}, b:{hipX:112,hipY:150,torso:-64,uarm:20,farm:20,thigh:40,shin:120}, speed:0.5 },
  bird_dog_adv:{ a:{hipX:100,hipY:118,torso:-15,uarm:22,farm:22,thigh:158,shin:200}, b:{hipX:100,hipY:120,torso:-15,uarm:20,farm:20,thigh:162,shin:205}, speed:0.45 },
  side_plank_rotation:{ a:{hipX:100,hipY:130,torso:-26,uarm:-70,farm:-70,thigh:200,shin:200}, b:{hipX:100,hipY:132,torso:-26,uarm:40,farm:120,thigh:200,shin:200}, speed:0.6 },
  single_leg_bridge:{ a:{hipX:100,hipY:150,torso:168,uarm:120,farm:120,thigh:60,shin:120}, b:{hipX:100,hipY:132,torso:162,uarm:120,farm:120,thigh:6,shin:6}, speed:0.7 },
};

const BONES=[['head','sh'],['sh','hip'],['sh','el'],['el','ha'],['hip','kn'],['kn','an']];

// Lee un color de las variables CSS del tema (con fallback), para que las
// demostraciones combinen con la identidad visual actual.
function themeColors(canvas){
  let accent='#ff5a1f', accent2='#ffd21e', skin='#f1f5f9';
  try{
    const cs=getComputedStyle(canvas);
    const a=cs.getPropertyValue('--accent').trim(); if(a) accent=a;
    const b=cs.getPropertyValue('--accent2').trim(); if(b) accent2=b;
  }catch{}
  return {accent, accent2, skin};
}

export function createDemoPlayer(canvas){
  const ctx=canvas.getContext('2d');
  let raf=null, ex=null, start=0;
  let col=themeColors(canvas);

  function frame(now){
    if(!ex){ return; }
    const speed=DEMOS[ex]?.speed || 1;
    const period=2200/speed;
    const phase=((now-start)%period)/period;
    const t=(1-Math.cos(phase*2*Math.PI))/2; // 0→1→0 suave
    render(t);
    raf=requestAnimationFrame(frame);
  }

  // Dibuja un hueso como cápsula redondeada (más grueso = más cuerpo, menos "monigote").
  function limb(X,Y,a,b,w){
    ctx.lineWidth=w; ctx.beginPath();
    ctx.moveTo(X(a),Y(a)); ctx.lineTo(X(b),Y(b)); ctx.stroke();
  }

  function render(t){
    const d=DEMOS[ex]; if(!d) return;
    const P=lerpPose(d.a, d.b, t);
    const pts=build(P);
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const sx=W/200, sy=H/220, s=(sx+sy)/2;
    const X=p=>p[0]*sx, Y=p=>p[1]*sy;
    ctx.lineCap='round'; ctx.lineJoin='round';

    // suelo con sombra suave del cuerpo
    ctx.fillStyle='rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(X(pts.hip), 194*sy, 46*sx, 6*sy, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,192*sy); ctx.lineTo(W,192*sy); ctx.stroke();

    // --- lado lejano (offset y más tenue → sensación de volumen/3D) ---
    const off=7*sx;
    ctx.save(); ctx.translate(off,0); ctx.globalAlpha=0.35;
    ctx.strokeStyle=col.accent;
    limb(X,Y,pts.sh,pts.el,9*s); limb(X,Y,pts.el,pts.ha,7*s);
    limb(X,Y,pts.hip,pts.kn,11*s); limb(X,Y,pts.kn,pts.an,9*s);
    ctx.restore();

    // --- torso relleno (cápsula) ---
    ctx.globalAlpha=1; ctx.strokeStyle=col.accent2; ctx.lineWidth=22*s;
    ctx.beginPath(); ctx.moveTo(X(pts.hip),Y(pts.hip)); ctx.lineTo(X(pts.sh),Y(pts.sh)); ctx.stroke();

    // --- lado cercano ---
    ctx.strokeStyle=col.accent;
    limb(X,Y,pts.sh,pts.el,10*s); limb(X,Y,pts.el,pts.ha,8*s);
    limb(X,Y,pts.hip,pts.kn,12*s); limb(X,Y,pts.kn,pts.an,10*s);

    // articulaciones
    ctx.fillStyle=col.accent2;
    for(const k of ['sh','el','ha','hip','kn','an']){
      ctx.beginPath(); ctx.arc(X(pts[k]),Y(pts[k]),4.5*s,0,Math.PI*2); ctx.fill();
    }
    // cuello + cabeza
    ctx.strokeStyle=col.skin; ctx.lineWidth=7*s;
    ctx.beginPath(); ctx.moveTo(X(pts.sh),Y(pts.sh)); ctx.lineTo(X(pts.head),Y(pts.head)); ctx.stroke();
    ctx.fillStyle=col.skin;
    ctx.beginPath(); ctx.arc(X(pts.head),Y(pts.head),11*s,0,Math.PI*2); ctx.fill();
  }

  return {
    play(id, still=false){
      ex=id; col=themeColors(canvas); cancelAnimationFrame(raf); raf=null;
      if(still){ render(0.5); return; }         // reducir movimiento: fotograma estático
      start=performance.now(); raf=requestAnimationFrame(frame);
    },
    stop(){ cancelAnimationFrame(raf); raf=null; ex=null; ctx.clearRect(0,0,canvas.width,canvas.height); },
  };
}
