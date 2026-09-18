#!/usr/bin/env python3
"""
Simulación de feedback de 1000 usuarios + stakeholders para FitCoach Casa.

Genera perfiles sintéticos (edad, objetivo, dispositivo, nivel), les asigna una
satisfacción y una lista de temas de feedback ponderados por su segmento, y
agrega los resultados en un informe (Markdown + JSON).

NO son usuarios reales: es un modelo para priorizar el desarrollo.
Reproducible (seed fija).  Ejecutar:  python research/simulacion_feedback.py
"""
import json, os, random
from collections import Counter, defaultdict

random.seed(42)
HERE = os.path.dirname(os.path.abspath(__file__))
N_USERS = 1000

# ---------------- Segmentos ----------------
AGE_BANDS = {
    "13-17":  0.08,
    "18-29":  0.30,
    "30-44":  0.32,
    "45-59":  0.20,
    "60-75":  0.10,
}
GOALS = {
    "perder_peso":        0.26,
    "ganar_musculo":      0.24,
    "salud_general":      0.22,
    "movilidad_rehab":    0.10,
    "rendimiento_dep":    0.10,
    "envejecim_activo":   0.08,
}
DEVICES = {"pc_webcam": 0.55, "laptop": 0.30, "movil": 0.15}
LEVELS = {"principiante": 0.5, "intermedio": 0.35, "avanzado": 0.15}

# Catálogo de temas de feedback. Cada tema tiene:
#  base = probabilidad base de mencionarlo
#  by_age / by_goal / by_device / by_level = multiplicadores por segmento
#  kind = 'dolor' (problema) o 'elogio'
CATALOG = {
    "texto_pequeno":        dict(base=0.10, kind="dolor", by_age={"45-59":3.0,"60-75":5.0}, ),
    "encuadre_camara":      dict(base=0.28, kind="dolor", by_device={"movil":1.8,"laptop":1.3}),
    "falta_niveles":        dict(base=0.22, kind="dolor", by_level={"principiante":2.2,"avanzado":1.6}, by_age={"13-17":1.5}),
    "registrar_peso":       dict(base=0.20, kind="dolor", by_goal={"ganar_musculo":2.6,"rendimiento_dep":1.8}),
    "seguim_progreso":      dict(base=0.34, kind="dolor", by_goal={"ganar_musculo":1.5,"perder_peso":1.6,"rendimiento_dep":1.5}),
    "bajo_impacto":         dict(base=0.08, kind="dolor", by_age={"60-75":4.5,"45-59":1.8}, by_goal={"movilidad_rehab":3.0,"envejecim_activo":3.5}),
    "rpe_dolor":            dict(base=0.10, kind="dolor", by_goal={"movilidad_rehab":3.0,"rendimiento_dep":1.8}),
    "conteo_impreciso":     dict(base=0.24, kind="dolor", by_device={"movil":1.5}),
    "quiere_calentamiento": dict(base=0.14, kind="dolor", by_goal={"rendimiento_dep":1.8,"movilidad_rehab":1.6}),
    "export_csv":           dict(base=0.06, kind="dolor"),
    "recordatorios":        dict(base=0.18, kind="dolor", by_age={"30-44":1.5}, by_goal={"salud_general":1.4}),
    "planes_nutricion":     dict(base=0.12, kind="dolor", by_goal={"perder_peso":2.2,"ganar_musculo":1.5}),
    "mas_ejercicios":       dict(base=0.20, kind="dolor", by_level={"avanzado":2.0}),
    "onboarding_confuso":   dict(base=0.16, kind="dolor", by_age={"60-75":2.2,"45-59":1.5}, by_level={"principiante":1.6}),
    # elogios
    "audio_util":           dict(base=0.30, kind="elogio"),
    "rutina_guiada_top":    dict(base=0.34, kind="elogio", by_level={"principiante":1.4}),
    "privacidad_local":     dict(base=0.16, kind="elogio"),
    "correccion_tecnica":   dict(base=0.30, kind="elogio", by_goal={"movilidad_rehab":1.4}),
    "demos_animadas":       dict(base=0.18, kind="elogio", by_level={"principiante":1.5}),
}

def pick(dist):
    r, acc = random.random(), 0.0
    for k, p in dist.items():
        acc += p
        if r <= acc:
            return k
    return list(dist)[-1]

def prob_for(theme, u):
    d = CATALOG[theme]
    p = d["base"]
    for dim, key in (("by_age","age"),("by_goal","goal"),("by_device","device"),("by_level","level")):
        if dim in d and u[key] in d[dim]:
            p *= d[dim][u[key]]
    return min(p, 0.98)

# ---------------- Generación de usuarios ----------------
users = []
for i in range(N_USERS):
    u = dict(
        id=i+1,
        age=pick(AGE_BANDS),
        goal=pick(GOALS),
        device=pick(DEVICES),
        level=pick(LEVELS),
    )
    tags = [t for t in CATALOG if random.random() < prob_for(t, u)]
    # satisfacción: base 3.4, +por elogios, -por dolores (con techo/suelo)
    elogios = sum(1 for t in tags if CATALOG[t]["kind"] == "elogio")
    dolores = sum(1 for t in tags if CATALOG[t]["kind"] == "dolor")
    sat = 3.4 + 0.28*elogios - 0.22*dolores + random.uniform(-0.4, 0.4)
    u["satisfaction"] = round(max(1.0, min(5.0, sat)), 2)
    u["tags"] = tags
    users.append(u)

# ---------------- Stakeholders (usuarios indirectos) ----------------
STAKEHOLDERS = {
    "fisioterapeuta":          ["rpe_dolor","bajo_impacto","quiere_calentamiento","correccion_tecnica","conteo_impreciso"],
    "entrenador_personal":     ["registrar_peso","seguim_progreso","export_csv","falta_niveles","mas_ejercicios"],
    "medico_deportivo":        ["rpe_dolor","bajo_impacto","privacidad_local","onboarding_confuso"],
    "dueno_gimnasio":          ["export_csv","seguim_progreso","recordatorios","mas_ejercicios"],
    "especialista_accesibilid":["texto_pequeno","onboarding_confuso","bajo_impacto"],
    "oficial_privacidad":      ["privacidad_local"],
    "nutricionista":           ["planes_nutricion","seguim_progreso"],
    "padre_madre":             ["onboarding_confuso","privacidad_local","texto_pequeno"],
}
stakeholders = []
for role, concerns in STAKEHOLDERS.items():
    for k in range(3):  # 3 representantes por rol = 24
        stakeholders.append(dict(role=role, tags=concerns))

# ---------------- Agregación ----------------
def band_stats():
    by = defaultdict(lambda: dict(n=0, sat=0.0))
    for u in users:
        by[u["age"]]["n"] += 1; by[u["age"]]["sat"] += u["satisfaction"]
    for k in by: by[k]["sat"] = round(by[k]["sat"]/by[k]["n"], 2)
    return dict(by)

def goal_stats():
    by = defaultdict(lambda: dict(n=0, sat=0.0))
    for u in users:
        by[u["goal"]]["n"] += 1; by[u["goal"]]["sat"] += u["satisfaction"]
    for k in by: by[k]["sat"] = round(by[k]["sat"]/by[k]["n"], 2)
    return dict(by)

tag_counts = Counter()
for u in users:
    tag_counts.update(u["tags"])

pains = [(t, c) for t, c in tag_counts.items() if CATALOG[t]["kind"] == "dolor"]
praises = [(t, c) for t, c in tag_counts.items() if CATALOG[t]["kind"] == "elogio"]
pains.sort(key=lambda x: -x[1]); praises.sort(key=lambda x: -x[1])

overall_sat = round(sum(u["satisfaction"] for u in users)/len(users), 2)

LABELS = {
    "texto_pequeno":"Texto pequeño / accesibilidad visual",
    "encuadre_camara":"Cuesta encuadrar bien la cámara",
    "falta_niveles":"Faltan niveles de dificultad",
    "registrar_peso":"Poder registrar el peso (kg) usado",
    "seguim_progreso":"Seguimiento de progreso (récords, gráficas)",
    "bajo_impacto":"Ejercicios de bajo impacto / adaptados",
    "rpe_dolor":"Registrar esfuerzo (RPE) y avisar dolor",
    "conteo_impreciso":"Conteo impreciso en algunos ejercicios",
    "quiere_calentamiento":"Calentamiento siempre incluido",
    "export_csv":"Exportar datos en CSV",
    "recordatorios":"Recordatorios / notificaciones",
    "planes_nutricion":"Guía de nutrición",
    "mas_ejercicios":"Más variedad de ejercicios",
    "onboarding_confuso":"Primer uso confuso (falta tutorial)",
    "audio_util":"Contador sonoro muy útil",
    "rutina_guiada_top":"La rutina guiada encanta",
    "privacidad_local":"Valoran que sea local y privado",
    "correccion_tecnica":"La corrección de técnica aporta",
    "demos_animadas":"Las demos animadas ayudan",
}
def pct(c): return round(100*c/N_USERS, 1)

# Mapa problema -> fase de desarrollo
PHASE = {
    "texto_pequeno":1, "onboarding_confuso":1, "encuadre_camara":1,   # F1 accesibilidad/onboarding
    "falta_niveles":2, "registrar_peso":2, "rpe_dolor":2, "quiere_calentamiento":2, "bajo_impacto":2,  # F2 personalización/seguridad
    "seguim_progreso":3, "export_csv":3, "recordatorios":3, "mas_ejercicios":3,  # F3 motivación/seguimiento
    "conteo_impreciso":2, "planes_nutricion":3,
}

# ---------------- Escribir JSON ----------------
out = dict(
    n_users=N_USERS, overall_satisfaction=overall_sat,
    by_age=band_stats(), by_goal=goal_stats(),
    pains=[dict(tag=t, label=LABELS[t], pct=pct(c), phase=PHASE.get(t)) for t, c in pains],
    praises=[dict(tag=t, label=LABELS[t], pct=pct(c)) for t, c in praises],
    users_sample=users[:20],
)
with open(os.path.join(HERE, "feedback_1000.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

# ---------------- Escribir informe Markdown ----------------
def bar(p, width=28):
    n = round(p/100*width); return "█"*n + "·"*(width-n)

lines = []
lines.append("# Informe de feedback simulado — FitCoach Casa\n")
lines.append(f"_Modelo sintético de **{N_USERS} usuarios** + 24 stakeholders (8 roles). "
             "No son usuarios reales; sirve para priorizar. Reproducible (seed=42)._\n")
lines.append(f"**Satisfacción media global: {overall_sat} / 5**\n")

lines.append("## Distribución y satisfacción por edad\n")
lines.append("| Edad | Usuarios | Satisfacción |\n|---|---|---|")
for k, v in out["by_age"].items():
    lines.append(f"| {k} | {v['n']} | {v['sat']} |")
lines.append("")

lines.append("## Distribución y satisfacción por objetivo\n")
lines.append("| Objetivo | Usuarios | Satisfacción |\n|---|---|---|")
for k, v in out["by_goal"].items():
    lines.append(f"| {k} | {v['n']} | {v['sat']} |")
lines.append("")

lines.append("## Lo que más gusta (elogios)\n")
for t, c in praises:
    lines.append(f"- **{LABELS[t]}** — {pct(c)}%  `{bar(pct(c))}`")
lines.append("")

lines.append("## Principales problemas / peticiones (dolores)\n")
for t, c in pains:
    lines.append(f"- **{LABELS[t]}** — {pct(c)}%  `{bar(pct(c))}`  _(Fase {PHASE.get(t,'-')})_")
lines.append("")

lines.append("## Voz de los stakeholders (usuarios indirectos)\n")
role_labels = {
    "fisioterapeuta":"Fisioterapeutas","entrenador_personal":"Entrenadores personales",
    "medico_deportivo":"Médicos deportivos","dueno_gimnasio":"Dueños de gimnasio",
    "especialista_accesibilid":"Especialistas en accesibilidad","oficial_privacidad":"Responsables de privacidad",
    "nutricionista":"Nutricionistas","padre_madre":"Padres/madres (menores)",
}
for role, concerns in STAKEHOLDERS.items():
    cs = ", ".join(LABELS[c] for c in concerns)
    lines.append(f"- **{role_labels[role]}:** {cs}")
lines.append("")

lines.append("## Roadmap priorizado en 3 fases\n")
phase_titles = {
    1:"Fase 1 — Accesibilidad, inclusión y primer uso",
    2:"Fase 2 — Personalización y seguridad del entrenamiento",
    3:"Fase 3 — Motivación, progreso y datos",
}
for ph in (1,2,3):
    lines.append(f"### {phase_titles[ph]}\n")
    items = [f"- {LABELS[t]} ({pct(c)}%)" for t, c in pains if PHASE.get(t)==ph]
    lines.extend(items)
    lines.append("")

with open(os.path.join(HERE, "informe_feedback.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

# ---------------- Resumen por consola ----------------
print(f"Usuarios simulados: {N_USERS} | Satisfacción media: {overall_sat}/5")
print("\nTop problemas (dolores):")
for t, c in pains[:10]:
    print(f"  {pct(c):5.1f}%  F{PHASE.get(t,'-')}  {LABELS[t]}")
print("\nTop elogios:")
for t, c in praises[:5]:
    print(f"  {pct(c):5.1f}%  {LABELS[t]}")
print("\nArchivos generados: research/feedback_1000.json, research/informe_feedback.md")
