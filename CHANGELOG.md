# Registro de cambios — FitCoach Casa

## Se retira Supabase (temporal)
- Se quitó del código todo lo de Supabase: cliente, `js/config.js`,
  `supabase_schema.sql` y la carga del SDK. `js/api.js` queda como stub local.
- La app funciona en **modo invitado**: perfil y progreso en el navegador
  (localStorage). El login se reactivará más adelante.
- `vercel.json` se mantiene (despliegue estático, sin caché) — no es de Supabase.


## Ajuste de tiempo, equipo detallado y backend en la nube
- **Ajuste de tiempo corregido:** el plan ahora reduce ejercicios cuando el descanso
  es largo, así el estimado cuadra con el tiempo elegido (ej. Potencia 45 min ≈ 40,
  antes daba ~67).
- **Equipo detallado:** selección específica con casillas y **pesos** — mancuernas,
  kettlebell, bandas, balón medicinal, banca, rack, barra olímpica (peso), barra
  hexagonal, barra de dominadas, mat de yoga. Deriva las capacidades para filtrar
  ejercicios y alimenta el perfil.
- **Backend en la nube (GitHub + Supabase + Vercel):** el login/registro y el
  guardado por usuario pasan a **Supabase** (auth + Postgres con RLS). Incluye
  `supabase_schema.sql`, `js/config.js`, `js/api.js` (cliente Supabase) y
  `vercel.json`. `server.py` queda como servidor estático **sin caché** para local.
- Fix de caché reforzado (imports `?v=` + `no-store`).


## Backend con login y perfil de usuario
- Nuevo **backend local** (`server.py`, Python estándar): sirve la app **sin caché**
  (arregla que no se vieran las actualizaciones) y añade una **API de cuentas**.
- **Login / registro** (contraseñas con PBKDF2, sesión por cookie HttpOnly, datos en
  SQLite) para **guardar el progreso por usuario**. Sin backend: **modo invitado**.
- Nueva pestaña **Perfil**: edad, peso, altura, objetivo, días/semana, tiempo por
  sesión, **equipo disponible (casillas)**, **nivel en entrenamiento biomecánico** y
  lesiones/notas. El perfil **ajusta automáticamente** la rutina guiada.
- El **progreso** (historial + planes) se **sincroniza** con el servidor al entrenar.
- Fix de caché: imports versionados (`?v=`) + cabeceras `no-store` del backend.
- Añadido antes: **desplegable con la explicación** de cada ejercicio en la vista
  previa de la rutina (repaso antes de empezar).


## Enfoque en rutina guiada + objetivos de entrenamiento
- La app ahora **diseña la sesión**: eliges **grupo muscular + objetivo + tiempo** y
  combina ejercicios variados. Se quitó la selección de ejercicio suelto y la lista sugerida.
- Nuevo **objetivo de entrenamiento** que ajusta al instante series, reps, descanso,
  carga, tempo y **qué ejercicios entran**: General, **Fuerza**, Hipertrofia, **Potencia**,
  Resistencia muscular y Pérdida de grasa.
- **Variedad:** cada generación combina distinto (barajado) + botón «🔄 Otra variante».
- Nuevos ejercicios explosivos/cardio: sentadilla con salto, press con impulso, thruster, saltos de tijera (47 en total).
- **Eliminada** la integración con Strava y la exportación JSON/CSV (no se implementan en esta etapa).
- Se mantienen **Historial/progreso** y **Calendario** de planificación.


## Optimización guiada por feedback (3 fases)

Basada en una **simulación de 1000 usuarios + 24 stakeholders** (ver
[research/informe_feedback.md](research/informe_feedback.md), reproducible con
`python research/simulacion_feedback.py`). Satisfacción inicial modelada: **3.06/5**.

Dolores principales detectados → cómo se resolvieron:

### Fase 1 — Accesibilidad, inclusión y primer uso
- **Tamaño de texto** (Normal / Grande / Muy grande) y **alto contraste** — para
  el 16% que reportó texto pequeño (sobre todo 45-75 años).
- **Reducir movimiento** (menos animaciones) para sensibilidad al movimiento.
- **Tutorial de primer uso** (onboarding) reabrible desde Ajustes — para el 25%
  que encontró confuso el primer uso.
- **Guía de encuadre en vivo** ("no se ven las piernas", "sepárate…") — para el
  33% con problemas de cámara.

### Fase 2 — Personalización y seguridad del entrenamiento
- **Niveles de dificultad** (Principiante / Intermedio / Avanzado) que escalan
  reps y series, en rutina guiada y objetivos — pedido por el 37%.
- **Registro de peso (kg)** por serie en ejercicios con carga; se ve en historial,
  récords y en la actividad de Strava — pedido por el 31%.
- **Corrección manual de repeticiones** (+/−) y aviso de encuadre para el 26% que
  reportó conteo impreciso.
- **RPE (esfuerzo 1-10) y aviso de molestia/dolor** tras la serie (modo manual) —
  pedido por fisioterapeutas y médicos deportivos.
- **Ejercicios de bajo impacto** (sentadilla a la silla, flexión en pared, marcha
  en el sitio, elevación de rodilla sentado) — para mayores y rehabilitación
  (segmento 60-75, el de menor satisfacción).

### Fase 3 — Motivación, progreso y datos
- **Panel de progreso** en Historial: racha de días, **gráfica de volumen semanal**
  (8 semanas) y **récords personales** (mejores reps y peso) — pedido por el 46%.
- **Exportación CSV** (además de JSON) para entrenadores y hojas de cálculo.

## Hitos previos
- Base: coach con webcam, análisis biomecánico (MediaPipe), conteo de series/reps,
  corrección de técnica, adaptación al equipamiento.
- Demostraciones animadas por ejercicio + objetivo del día con rutina sugerida.
- Contador sonoro (pitidos + voz), cuenta atrás 3-2-1 y temporizador para
  isométricos / modo por tiempo (AMRAP).
- Biblioteca ampliada (core, fuerza, **módulo de estiramientos/movilidad**).
- Calendario de planificación de cargas y seguimiento.
- Rutina guiada del día ajustada al tiempo (30/45/60 min).
- Integración con Strava (servidor local en Python + OAuth + subida de actividades).
