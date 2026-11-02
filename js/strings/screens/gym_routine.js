// /js/strings/screens/gym_routine.js
// Textos de gym_routine.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("gym_routine", "Gimnasio: rutina", {
  faltaParametroIdEn: "Falta parámetro id en el link.",
  missingId: "Missing id",
  rutinaDeGimnasio: "Rutina de gimnasio",
  public: "PUBLIC",
  private: "PRIVATE",
  estaRutinaEsPrivada: "Esta rutina es privada.",
  errorCargandoRutinaVer: "Error cargando rutina. Ver consola.",
  rutinaNoExiste: "Rutina no existe",
  rutina: "Rutina",
  linkCopiado: "Link copiado ✅",
  noPudeCopiarEl: "No pude copiar el link.",
  noHayEjerciciosEn: "No hay ejercicios en esta rutina.",
  media: "Media",
  ver: "Ver",
  ejercicioNoExiste: "Ejercicio no existe",
  partesDelCuerpo: "Partes del cuerpo",
  notas: "Notas",
  distancia: "Distancia: {dist} {unit}",
  sets: "Sets: {value}",
  reps: "Reps: {value}",
  descansoS: "Descanso: {restSec}s",
});

export const txf = fmt;
