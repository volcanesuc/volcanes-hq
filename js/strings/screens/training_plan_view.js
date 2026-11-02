// /js/strings/screens/training_plan_view.js
// Textos de training_plan_view.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("training_plan_view", "Plan de entrenamiento (público)", {
  tag: "Tag",
  ver: "Ver",
  video: "Video",
  objetivo: "Objetivo",
  volumen: "Volumen",
  descanso: "Descanso",
  vistaPrevia: "Vista previa",
  faltaElParametroId: "Falta el parámetro id. Ej: training_plan.html?id=XXXX",
  noSeEncontroEste: "No se encontró este Plan de Entrenamiento.",
  estePlanDeEntrenamiento: "Este Plan de Entrenamiento es privado.",
  linkCopiado: "Link copiado ✅",
  compartir: "Compartir",
  noPudeCopiarEl: "No pude copiar el link. Copialo manualmente de la barra.",
  planDeEntrenamiento: "Plan de Entrenamiento",
  publico: "Público",
  errorCargandoElPlan: "Error cargando el Plan de Entrenamiento.",
});

export const txf = fmt;
