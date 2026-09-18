# 🏋️ FitCoach Casa

Coach de entrenamiento en casa con **webcam + análisis biomecánico en directo**.
Detecta tu postura con IA (MediaPipe Pose), cuenta series y repeticiones,
mide el rango de movimiento (ROM) y te **corrige la técnica en tiempo real**.
Se adapta al **equipamiento** que tengas: peso corporal, mancuernas/kettlebell,
bandas elásticas y barra/banco.

Todo el procesamiento ocurre **en tu navegador**: el vídeo nunca sale de tu equipo.

---

## ▶️ Cómo ejecutarlo

La app necesita abrirse desde un **servidor local** (no vale hacer doble clic en
`index.html`, porque los navegadores bloquean los módulos y la cámara en `file://`).

### Recomendado — Doble clic (Windows)
Haz doble clic en **`iniciar.bat`**. Levanta `server.py` (servidor estático **sin
caché**, así siempre ves la última versión) y abre la app.

### Alternativa — Python
```bash
python server.py
```
Luego abre: http://localhost:8000

> Sin `server.py` la app funciona igual en **modo invitado** (datos solo en este
> navegador). Con `python -m http.server` puede que el navegador cachee versiones
> viejas; usa **`server.py`** o recarga con **Ctrl+Shift+R**.

> La **primera vez** necesitas conexión a internet para descargar el modelo de
> IA (se cachea después). Usa **Chrome o Edge** para mejor rendimiento (usa la GPU).

---

## 🧭 Cómo se usa — Rutina guiada del día

La app **diseña la sesión por ti** combinando ejercicios variados. Solo eliges:

1. **Equipamiento** que tienes (peso corporal, mancuernas/KB, bandas, barra/banco).
2. **Grupo muscular:** Full body / Tren superior / Tren inferior / Core / Estiramiento.
3. **Objetivo de entrenamiento** — ajusta al instante series, repeticiones, descanso,
   carga recomendada, tempo **y qué ejercicios se eligen**:
   - **General / Salud** — 3 × 10-12, descanso 60s.
   - **Fuerza** — 4-5 × 4-6, descanso 150s, cargas altas, ejercicios compuestos.
   - **Hipertrofia** — 3-4 × 8-12, descanso 75s.
   - **Potencia** — 4-5 × 3-5, descanso 120s, movimientos explosivos.
   - **Resistencia muscular** — 2-3 × 15-20, descanso 40s.
   - **Pérdida de grasa** — 3 × 12-15, descanso corto (circuito) con cardio.
4. **Tiempo disponible:** 30, 45 o 60 min.

La app **genera la rutina** (calentamiento + principal + vuelta a la calma) con su
plan, esquema y duración estimada. Cada generación **combina distinto** para dar
variedad; con **🔄 Otra variante** obtienes una sesión nueva.

Pulsa **▶ Empezar rutina guiada**: verás la demo de cada ejercicio y la app
**avanza sola** — serie tras serie y ejercicio tras ejercicio — con descansos,
cuenta atrás, pitidos y voz, y **corrección de técnica por webcam** (esqueleto,
ángulos, conteo de reps). Una barra arriba muestra "Ejercicio X/N · Serie Y/Z".
Puedes **Saltar** o **Terminar** cuando quieras.

## 🔊 Sin mirar la pantalla
- **Cuenta atrás 3-2-1** y **número gigante** al iniciar cada serie.
- **Pitido + voz en cada repetición** y sonido al cumplir el objetivo.
- **Temporizador** para isométricos/estiramientos (pitidos finales + campana).

## 👤 Perfil (local)
- En la pestaña **Perfil** guardas tu información (edad, peso, altura, objetivo,
  días/semana, tiempo por sesión, **equipo disponible detallado con pesos**, nivel en
  entrenamiento biomecánico, lesiones/notas). **Ajusta automáticamente** el
  equipamiento, el objetivo, el tiempo y el nivel de la rutina guiada.
- **Equipo detallado:** mancuernas (pesos), kettlebell, bandas, balón medicinal,
  banca, rack de sentadillas, barra olímpica (peso), barra hexagonal, barra de
  dominadas, mat de yoga… con casillas y campo de pesos.
- El perfil y el progreso se guardan **en este navegador** (localStorage).
  El login/cuentas en la nube se retiró de momento (se reactivará más adelante).

## 📅 Otras pantallas
- **Calendario:** planifica tus cargas (objetivo + intensidad por día) y ve lo entrenado.
- **Historial / Progreso:** racha, volumen semanal y récords personales.
- **Ajustes:** cámara, espejo, modelo, descanso, sonido/voz, **accesibilidad**
  (tamaño de texto, alto contraste, reducir movimiento) y **nivel de dificultad**.

## 🏃 Ejercicios incluidos (47)
La rutina guiada los **combina automáticamente** según el grupo y el objetivo:
- **Tren inferior:** sentadilla, zancadas, peso muerto rumano, puente de glúteo, sentadilla búlgara, sentadilla con salto.
- **Tren superior:** flexiones, press de hombro, remo inclinado, face pull, elevaciones laterales,
  dominadas, fondos, press de banca, extensión de tríceps, remo al mentón, curl de bíceps, press con impulso.
- **Core:** plancha, crunch, elevación de piernas, escaladores, bicicleta, plancha lateral, bird dog, superman, saltos de tijera.
- **Full body / potencia:** swing (kettlebell), thruster.
- **Bajo impacto** (mayores/rehab): sentadilla a la silla, flexión en pared, marcha en el sitio, elevación de rodilla sentado.
- **Estiramientos / movilidad (14):** con temporizador y **cámara opcional**.

## 📅 Calendario (planificación de cargas y seguimiento)
- Vista mensual: **planifica** cada día (objetivo + intensidad ligero/medio/intenso + nota) y
  **revisa lo entrenado** (volumen de series realizado, tomado del historial).
- Toca un día para editar su plan o ver el detalle de lo hecho.

## 🔒 Privacidad
El **vídeo se procesa localmente** en tu navegador (nunca sale de tu equipo). Tu
**perfil y progreso** se guardan solo en este navegador (`localStorage`).

## 🧩 Estructura
```
server.py           · servidor estático local (sin caché) para desarrollo
index.html          · interfaz
css/styles.css      · estilos
js/app.js           · lógica principal (cámara, rutina guiada, calendario, perfil)
js/exercises.js     · biblioteca + biomecánica + objetivos y generador de rutina
js/demos.js         · demostraciones animadas
js/pose.js          · carga del modelo MediaPipe
js/audio.js         · contador sonoro / temporizador
js/utils.js         · geometría, suavizado, voz
js/storage.js       · historial, planes, perfil, progreso, ajustes (localStorage)
js/api.js           · stub de cuenta (login desactivado por ahora)
```

## ⚠️ Aviso
Es una herramienta de apoyo para el seguimiento y la técnica, no sustituye a un
profesional. Consulta a un especialista ante lesiones o dudas de salud.
