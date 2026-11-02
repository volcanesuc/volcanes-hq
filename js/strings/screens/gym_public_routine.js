// /js/strings/screens/gym_public_routine.js
// Textos de public_routine.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("gym_public_routine", "Gimnasio: rutina pública", {
  faltaParametro: "Falta parámetro",
  enElLink: "en el link.",
  missingId: "Missing id",
  estaRutinaEsPrivada: "Esta rutina es privada.",
  errorCargandoRutina: "Error cargando rutina.",
  rutinaNoExiste: "Rutina no existe",
  rutina: "Rutina",
  sinEjercicios: "Sin ejercicios.",
  copiarLink: "Copiar link",
  link: "Link:",
  siLaRutinaGuarda: "*Si la rutina guarda sets/reps/rest en",
  seUsanLosDefaults: ", se usan los defaults del ejercicio.",
  ejercicioNoExiste: "Ejercicio no existe",
  video: "Video",
  distancia: "Distancia: {dist} {unit}",
  sets: "Sets: {value}",
  reps: "Reps: {value}",
  descansoS: "Descanso: {restSec}s",
  copiado: "Copiado ✅",
  noPudeCopiarEl: "No pude copiar el link.\n",
});

export const txf = fmt;
