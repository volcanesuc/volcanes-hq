// /js/features/gym/exercise_catalog.js
// Músculos (para filtrar) y catálogo base de ejercicios comunes de gimnasio, con los nombres
// estándar que usan las apps de entrenamiento (ej. "Bench Press (Barbell)").
// Desde Gimnasio › Ejercicios un admin puede importar los que todavía no estén en gym_exercises.

// Grupos musculares: id estable + nombre visible + sinónimos (ES/EN) para leer bodyParts viejos.
export const MUSCLES = [
  { id: "pecho", label: "Pecho", aliases: ["pecho", "pectoral", "pectorales", "chest", "pecs"] },
  { id: "espalda", label: "Espalda", aliases: ["espalda", "dorsal", "dorsales", "back", "lats", "lat", "upper back"] },
  { id: "hombros", label: "Hombros", aliases: ["hombro", "hombros", "deltoides", "shoulders", "shoulder", "delts"] },
  { id: "biceps", label: "Bíceps", aliases: ["biceps", "bíceps", "bicep"] },
  { id: "triceps", label: "Tríceps", aliases: ["triceps", "tríceps", "tricep"] },
  { id: "antebrazos", label: "Antebrazos", aliases: ["antebrazo", "antebrazos", "forearms", "forearm", "grip", "agarre"] },
  { id: "abdomen", label: "Abdomen y core", aliases: ["abdomen", "abs", "core", "abdominales", "oblicuos", "obliques"] },
  { id: "cuadriceps", label: "Cuádriceps", aliases: ["cuadriceps", "cuádriceps", "quads", "quadriceps", "legs", "piernas", "pierna"] },
  { id: "isquios", label: "Isquiotibiales", aliases: ["isquios", "isquiotibiales", "femoral", "femorales", "hamstrings", "hamstring"] },
  { id: "gluteos", label: "Glúteos", aliases: ["gluteos", "glúteos", "gluteo", "glutes", "glute"] },
  { id: "pantorrillas", label: "Pantorrillas", aliases: ["pantorrilla", "pantorrillas", "gemelos", "calves", "calf"] },
  { id: "aductores", label: "Aductores", aliases: ["aductores", "aductor", "adductors"] },
  { id: "abductores", label: "Abductores", aliases: ["abductores", "abductor", "abductors"] },
  { id: "trapecio", label: "Trapecio", aliases: ["trapecio", "trapecios", "traps", "trapezius"] },
  { id: "lumbar", label: "Lumbar", aliases: ["lumbar", "lumbares", "lower back", "espalda baja"] },
  { id: "cardio", label: "Cardio y acondicionamiento", aliases: ["cardio", "acondicionamiento", "conditioning", "resistencia"] },
  { id: "cuerpo", label: "Cuerpo completo", aliases: ["cuerpo completo", "full body", "fullbody", "total body", "pliometria", "pliometría", "plyometrics"] },
];

export const EQUIPMENT = {
  barra: "Barra",
  mancuernas: "Mancuernas",
  maquina: "Máquina",
  polea: "Polea",
  peso_corporal: "Peso corporal",
  kettlebell: "Kettlebell",
  banda: "Banda",
  otro: "Otro",
};

const norm = (v) =>
  String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const ALIAS_TO_ID = new Map(MUSCLES.flatMap((m) => [m.id, ...m.aliases].map((a) => [norm(a), m.id])));

// bodyParts libres ("legs, glutes") → ids de MUSCLES. Lo que no se reconoce queda afuera.
export function musclesOf(exercise = {}) {
  const raw = [exercise.primaryMuscle, ...(Array.isArray(exercise.bodyParts) ? exercise.bodyParts : [])];
  return [...new Set(raw.map((p) => ALIAS_TO_ID.get(norm(p))).filter(Boolean))];
}

export function muscleLabel(id) {
  return MUSCLES.find((m) => m.id === id)?.label || id;
}

// Para comparar nombres al importar ("Bench Press (Barbell)" == "bench press barbell").
export function exerciseKey(name) {
  return norm(name).replace(/[^a-z0-9]+/g, " ").trim();
}

// [nombre, músculo principal, [secundarios], equipo]
const RAW = [
  // Pecho
  ["Bench Press (Barbell)", "pecho", ["triceps", "hombros"], "barra"],
  ["Incline Bench Press (Barbell)", "pecho", ["hombros", "triceps"], "barra"],
  ["Decline Bench Press (Barbell)", "pecho", ["triceps"], "barra"],
  ["Bench Press (Dumbbell)", "pecho", ["triceps", "hombros"], "mancuernas"],
  ["Incline Bench Press (Dumbbell)", "pecho", ["hombros", "triceps"], "mancuernas"],
  ["Chest Fly (Dumbbell)", "pecho", ["hombros"], "mancuernas"],
  ["Cable Crossover", "pecho", ["hombros"], "polea"],
  ["Chest Press (Machine)", "pecho", ["triceps"], "maquina"],
  ["Pec Deck (Machine)", "pecho", [], "maquina"],
  ["Push Up", "pecho", ["triceps", "hombros", "abdomen"], "peso_corporal"],
  ["Incline Push Up", "pecho", ["triceps"], "peso_corporal"],
  ["Decline Push Up", "pecho", ["hombros", "triceps"], "peso_corporal"],
  ["Chest Dip", "pecho", ["triceps", "hombros"], "peso_corporal"],

  // Espalda
  ["Pull Up", "espalda", ["biceps"], "peso_corporal"],
  ["Chin Up", "espalda", ["biceps"], "peso_corporal"],
  ["Lat Pulldown (Cable)", "espalda", ["biceps"], "polea"],
  ["Close Grip Lat Pulldown", "espalda", ["biceps"], "polea"],
  ["Bent Over Row (Barbell)", "espalda", ["biceps", "lumbar"], "barra"],
  ["Pendlay Row (Barbell)", "espalda", ["biceps"], "barra"],
  ["Dumbbell Row", "espalda", ["biceps"], "mancuernas"],
  ["Seated Cable Row", "espalda", ["biceps"], "polea"],
  ["T-Bar Row", "espalda", ["biceps"], "barra"],
  ["Inverted Row", "espalda", ["biceps"], "peso_corporal"],
  ["Straight Arm Pulldown", "espalda", [], "polea"],
  ["Face Pull", "hombros", ["espalda", "trapecio"], "polea"],

  // Hombros
  ["Overhead Press (Barbell)", "hombros", ["triceps"], "barra"],
  ["Seated Overhead Press (Dumbbell)", "hombros", ["triceps"], "mancuernas"],
  ["Arnold Press (Dumbbell)", "hombros", ["triceps"], "mancuernas"],
  ["Push Press", "hombros", ["triceps", "cuadriceps"], "barra"],
  ["Lateral Raise (Dumbbell)", "hombros", [], "mancuernas"],
  ["Lateral Raise (Cable)", "hombros", [], "polea"],
  ["Front Raise (Dumbbell)", "hombros", [], "mancuernas"],
  ["Rear Delt Fly (Dumbbell)", "hombros", ["espalda"], "mancuernas"],
  ["Reverse Fly (Machine)", "hombros", ["espalda"], "maquina"],
  ["Upright Row (Barbell)", "hombros", ["trapecio"], "barra"],
  ["Landmine Press", "hombros", ["pecho", "triceps"], "barra"],

  // Trapecio
  ["Shrug (Barbell)", "trapecio", [], "barra"],
  ["Shrug (Dumbbell)", "trapecio", [], "mancuernas"],

  // Bíceps
  ["Bicep Curl (Barbell)", "biceps", ["antebrazos"], "barra"],
  ["Bicep Curl (Dumbbell)", "biceps", ["antebrazos"], "mancuernas"],
  ["Hammer Curl (Dumbbell)", "biceps", ["antebrazos"], "mancuernas"],
  ["Preacher Curl (EZ Bar)", "biceps", [], "barra"],
  ["Incline Curl (Dumbbell)", "biceps", [], "mancuernas"],
  ["Concentration Curl", "biceps", [], "mancuernas"],
  ["Bicep Curl (Cable)", "biceps", [], "polea"],

  // Tríceps
  ["Triceps Pushdown (Cable)", "triceps", [], "polea"],
  ["Overhead Triceps Extension (Cable)", "triceps", [], "polea"],
  ["Overhead Triceps Extension (Dumbbell)", "triceps", [], "mancuernas"],
  ["Skull Crusher (EZ Bar)", "triceps", [], "barra"],
  ["Close Grip Bench Press", "triceps", ["pecho"], "barra"],
  ["Triceps Dip", "triceps", ["pecho", "hombros"], "peso_corporal"],
  ["Bench Dip", "triceps", [], "peso_corporal"],
  ["Triceps Kickback (Dumbbell)", "triceps", [], "mancuernas"],

  // Antebrazos / agarre
  ["Wrist Curl (Barbell)", "antebrazos", [], "barra"],
  ["Reverse Curl (Barbell)", "antebrazos", ["biceps"], "barra"],
  ["Farmer's Walk", "antebrazos", ["trapecio", "abdomen", "cuerpo"], "mancuernas"],
  ["Dead Hang", "antebrazos", ["espalda"], "peso_corporal"],

  // Cuádriceps / piernas
  ["Back Squat (Barbell)", "cuadriceps", ["gluteos", "isquios", "lumbar"], "barra"],
  ["Front Squat (Barbell)", "cuadriceps", ["gluteos", "abdomen"], "barra"],
  ["Goblet Squat", "cuadriceps", ["gluteos"], "kettlebell"],
  ["Bulgarian Split Squat", "cuadriceps", ["gluteos", "isquios"], "mancuernas"],
  ["Split Squat", "cuadriceps", ["gluteos"], "peso_corporal"],
  ["Lunge (Dumbbell)", "cuadriceps", ["gluteos", "isquios"], "mancuernas"],
  ["Walking Lunge", "cuadriceps", ["gluteos", "isquios"], "peso_corporal"],
  ["Reverse Lunge", "cuadriceps", ["gluteos"], "peso_corporal"],
  ["Lateral Lunge", "cuadriceps", ["aductores", "gluteos"], "peso_corporal"],
  ["Step Up", "cuadriceps", ["gluteos"], "mancuernas"],
  ["Leg Press (Machine)", "cuadriceps", ["gluteos", "isquios"], "maquina"],
  ["Hack Squat (Machine)", "cuadriceps", ["gluteos"], "maquina"],
  ["Leg Extension (Machine)", "cuadriceps", [], "maquina"],
  ["Pistol Squat", "cuadriceps", ["gluteos", "abdomen"], "peso_corporal"],
  ["Wall Sit", "cuadriceps", [], "peso_corporal"],
  ["Bodyweight Squat", "cuadriceps", ["gluteos"], "peso_corporal"],

  // Isquios / cadena posterior
  ["Deadlift (Barbell)", "isquios", ["gluteos", "lumbar", "espalda", "trapecio"], "barra"],
  ["Romanian Deadlift (Barbell)", "isquios", ["gluteos", "lumbar"], "barra"],
  ["Romanian Deadlift (Dumbbell)", "isquios", ["gluteos", "lumbar"], "mancuernas"],
  ["Single Leg Romanian Deadlift", "isquios", ["gluteos", "abdomen"], "mancuernas"],
  ["Trap Bar Deadlift", "cuadriceps", ["gluteos", "isquios", "trapecio"], "barra"],
  ["Sumo Deadlift", "gluteos", ["isquios", "aductores", "lumbar"], "barra"],
  ["Good Morning (Barbell)", "isquios", ["lumbar", "gluteos"], "barra"],
  ["Lying Leg Curl (Machine)", "isquios", [], "maquina"],
  ["Seated Leg Curl (Machine)", "isquios", [], "maquina"],
  ["Nordic Hamstring Curl", "isquios", [], "peso_corporal"],
  ["Kettlebell Swing", "gluteos", ["isquios", "lumbar", "cardio"], "kettlebell"],

  // Glúteos / cadera
  ["Hip Thrust (Barbell)", "gluteos", ["isquios"], "barra"],
  ["Glute Bridge", "gluteos", ["isquios"], "peso_corporal"],
  ["Single Leg Glute Bridge", "gluteos", ["isquios"], "peso_corporal"],
  ["Cable Pull Through", "gluteos", ["isquios"], "polea"],
  ["Glute Kickback (Cable)", "gluteos", [], "polea"],
  ["Hip Abduction (Machine)", "abductores", ["gluteos"], "maquina"],
  ["Hip Adduction (Machine)", "aductores", [], "maquina"],
  ["Lateral Band Walk", "abductores", ["gluteos"], "banda"],
  ["Copenhagen Plank", "aductores", ["abdomen"], "peso_corporal"],
  ["Back Extension", "lumbar", ["gluteos", "isquios"], "peso_corporal"],

  // Pantorrillas / tobillo
  ["Standing Calf Raise", "pantorrillas", [], "maquina"],
  ["Seated Calf Raise", "pantorrillas", [], "maquina"],
  ["Single Leg Calf Raise", "pantorrillas", [], "peso_corporal"],
  ["Tibialis Raise", "pantorrillas", [], "peso_corporal"],

  // Abdomen / core
  ["Plank", "abdomen", ["hombros"], "peso_corporal"],
  ["Side Plank", "abdomen", [], "peso_corporal"],
  ["Crunch", "abdomen", [], "peso_corporal"],
  ["Bicycle Crunch", "abdomen", [], "peso_corporal"],
  ["Hanging Leg Raise", "abdomen", ["antebrazos"], "peso_corporal"],
  ["Lying Leg Raise", "abdomen", [], "peso_corporal"],
  ["Russian Twist", "abdomen", [], "peso_corporal"],
  ["Dead Bug", "abdomen", [], "peso_corporal"],
  ["Bird Dog", "abdomen", ["lumbar"], "peso_corporal"],
  ["Ab Wheel Rollout", "abdomen", ["hombros"], "otro"],
  ["Pallof Press", "abdomen", [], "polea"],
  ["Cable Crunch", "abdomen", [], "polea"],
  ["Hollow Body Hold", "abdomen", [], "peso_corporal"],
  ["Mountain Climber", "abdomen", ["cardio", "hombros"], "peso_corporal"],
  ["Woodchopper (Cable)", "abdomen", [], "polea"],

  // Cuerpo completo / potencia (clave para ultimate)
  ["Power Clean", "cuerpo", ["isquios", "gluteos", "trapecio"], "barra"],
  ["Hang Clean", "cuerpo", ["trapecio", "isquios"], "barra"],
  ["Clean and Jerk", "cuerpo", ["hombros", "cuadriceps"], "barra"],
  ["Snatch", "cuerpo", ["hombros", "cuadriceps"], "barra"],
  ["Thruster (Barbell)", "cuerpo", ["cuadriceps", "hombros"], "barra"],
  ["Burpee", "cuerpo", ["cardio", "pecho"], "peso_corporal"],
  ["Turkish Get Up", "cuerpo", ["hombros", "abdomen"], "kettlebell"],
  ["Medicine Ball Slam", "cuerpo", ["abdomen", "hombros"], "otro"],
  ["Box Jump", "cuerpo", ["cuadriceps", "gluteos"], "otro"],
  ["Broad Jump", "cuerpo", ["cuadriceps", "gluteos"], "peso_corporal"],
  ["Jump Squat", "cuerpo", ["cuadriceps", "gluteos"], "peso_corporal"],
  ["Lateral Bound", "cuerpo", ["gluteos", "abductores"], "peso_corporal"],
  ["Depth Jump", "cuerpo", ["cuadriceps", "pantorrillas"], "otro"],
  ["Sled Push", "cuerpo", ["cuadriceps", "gluteos", "cardio"], "otro"],

  // Cardio / acondicionamiento
  ["Running", "cardio", ["cuadriceps", "pantorrillas"], "peso_corporal"],
  ["Sprint", "cardio", ["isquios", "gluteos"], "peso_corporal"],
  ["Shuttle Run", "cardio", ["cuadriceps"], "peso_corporal"],
  ["Jump Rope", "cardio", ["pantorrillas"], "otro"],
  ["Rowing (Machine)", "cardio", ["espalda", "cuadriceps"], "maquina"],
  ["Cycling (Stationary Bike)", "cardio", ["cuadriceps"], "maquina"],
  ["Assault Bike", "cardio", ["cuerpo"], "maquina"],
  ["Battle Ropes", "cardio", ["hombros", "abdomen"], "otro"],
  ["Jumping Jack", "cardio", [], "peso_corporal"],
];

export const EXERCISE_CATALOG = RAW.map(([name, primaryMuscle, secondary, equipment]) => ({
  name,
  primaryMuscle,
  bodyParts: [primaryMuscle, ...secondary],
  equipment,
}));
