// /js/strings/screens/gym.js
// Textos de gym.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("gym", "Gimnasio", {
  rutinaNoExiste: "Rutina no existe",
  media: "Media",
  ver: "Ver",
  editar: "Editar",
  cerrar: "Cerrar",
  abrirEnPestanaNueva: "Abrir en pestaña nueva",
  siNoCargaAqui: "Si no carga aquí, abrilo en pestaña nueva.",
  publica: "🌐 Pública",
  privada: "🔒 Privada",
  copiarLink: "Copiar link",
  hacerPublica: "Hacer pública",
  preview: "Preview",
  copiado: "Copiado ✅",
  noPudeCopiarEl: "No pude copiar el link.",
  errorHaciendoLaRutina: "Error haciendo la rutina pública.",
  cargandoPreview: "Cargando preview…",
  errorCargandoPreview: "Error cargando preview.",
  video: "Video",
  sinEjercicios: "Sin ejercicios.",
  distancia: "Distancia: {value} {value2}",
  sets: "Sets: {value}",
  reps: "Reps: {reps}",
  descansoS: "Descanso: {restSec}s",
  publico: "🌐 Público",
  privado: "🔒 Privado",
  hacerPublico: "Hacer público",
  noPudeCopiarEl2: "No pude copiar el link del plan.",
  errorHaciendoElPlan: "Error haciendo el plan público.",
  planDeGimnasio: "Plan de Gimnasio – {value}",
  planDeGimnasio2: "Plan de Gimnasio",
  mes: "Mes {monthKey}",
});

export const txf = fmt;
