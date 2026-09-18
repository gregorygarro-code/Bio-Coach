// ===== Carga y ejecución del detector de pose (MediaPipe Tasks Vision) =====
// Se importa dinámicamente desde CDN. Requiere ejecutar la app desde un servidor local (http://localhost).

const VERSION = '0.10.12';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

let PoseLandmarker, FilesetResolver;

export async function createPoseLandmarker(model='lite', onProgress=()=>{}){
  onProgress('Descargando runtime de visión…');
  const vision = await import(/* @vite-ignore */ `${CDN}/vision_bundle.mjs`);
  PoseLandmarker = vision.PoseLandmarker;
  FilesetResolver = vision.FilesetResolver;

  onProgress('Inicializando WASM…');
  const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);

  onProgress('Cargando modelo de pose…');
  let landmarker;
  try{
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions:{ modelAssetPath: MODELS[model]||MODELS.lite, delegate:'GPU' },
      runningMode:'VIDEO', numPoses:1,
      minPoseDetectionConfidence:0.5, minPosePresenceConfidence:0.5, minTrackingConfidence:0.5,
    });
  }catch(e){
    // Fallback a CPU si la GPU no está disponible
    onProgress('GPU no disponible, usando CPU…');
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions:{ modelAssetPath: MODELS[model]||MODELS.lite, delegate:'CPU' },
      runningMode:'VIDEO', numPoses:1,
    });
  }
  return landmarker;
}
