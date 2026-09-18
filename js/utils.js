// ===== Utilidades de geometría y señal =====

// Índices de landmarks de MediaPipe Pose (33 puntos)
export const LM = {
  NOSE:0,
  L_SHOULDER:11, R_SHOULDER:12,
  L_ELBOW:13, R_ELBOW:14,
  L_WRIST:15, R_WRIST:16,
  L_HIP:23, R_HIP:24,
  L_KNEE:25, R_KNEE:26,
  L_ANKLE:27, R_ANKLE:28,
  L_HEEL:29, R_HEEL:30,
  L_FOOT:31, R_FOOT:32,
};

// Ángulo (en grados) en el vértice b formado por a-b-c
export function angle(a, b, c){
  if(!a || !b || !c) return null;
  const abx=a.x-b.x, aby=a.y-b.y;
  const cbx=c.x-b.x, cby=c.y-b.y;
  const dot=abx*cbx+aby*cby;
  const m1=Math.hypot(abx,aby), m2=Math.hypot(cbx,cby);
  if(m1===0||m2===0) return null;
  let cos=dot/(m1*m2);
  cos=Math.max(-1,Math.min(1,cos));
  return Math.acos(cos)*180/Math.PI;
}

// Ángulo del segmento a->b respecto a la vertical (0 = perfectamente vertical)
export function angleFromVertical(a, b){
  if(!a||!b) return null;
  const dx=b.x-a.x, dy=b.y-a.y;
  return Math.abs(Math.atan2(dx, dy) * 180/Math.PI); // dx frente a dy (vertical)
}

export function midpoint(a,b){
  if(!a||!b) return null;
  return {x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:((a.z||0)+(b.z||0))/2, visibility:Math.min(a.visibility??1,b.visibility??1)};
}

export const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export const round=(v,d=0)=>v==null?null:Number(v.toFixed(d));

// ¿Está el punto suficientemente visible?
export function vis(p, th=0.5){ return p && (p.visibility===undefined || p.visibility>=th); }

// Suavizado exponencial de landmarks (reduce el temblor del esqueleto)
export class LandmarkSmoother{
  constructor(alpha=0.5){ this.alpha=alpha; this.prev=null; }
  smooth(lms){
    if(!lms) return lms;
    if(!this.prev){ this.prev=lms.map(p=>({...p})); return this.prev; }
    const a=this.alpha;
    this.prev=lms.map((p,i)=>{
      const q=this.prev[i]||p;
      return {
        x:a*p.x+(1-a)*q.x,
        y:a*p.y+(1-a)*q.y,
        z:a*(p.z||0)+(1-a)*(q.z||0),
        visibility:p.visibility ?? q.visibility ?? 1,
      };
    });
    return this.prev;
  }
  reset(){ this.prev=null; }
}

// Formatea segundos a mm:ss
export function fmtTime(s){
  s=Math.max(0,Math.round(s));
  const m=Math.floor(s/60), ss=s%60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

// Voz (feedback hablado) — usa Web Speech API si está disponible
let voiceOn=true;
export function setVoice(on){ voiceOn=on; }
let lastSpoken=0, lastMsg='';
export function speak(text, {force=false}={}){
  if(!voiceOn || !('speechSynthesis' in window)) return;
  const now=performance.now();
  if(!force && (text===lastMsg || now-lastSpoken<1800)) return; // evita spam
  lastSpoken=now; lastMsg=text;
  const u=new SpeechSynthesisUtterance(text);
  u.lang='es-ES'; u.rate=1.05; u.volume=0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
