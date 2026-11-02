// /js/strings/screens/gym_plan.js
// Textos de gym_plan_page.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("gym_plan", "Gimnasio: plan", {
  cargandoPlan: "Cargando plan…",
  faltaIdDelPlan: "Falta ?id del plan.",
  leyendoPlan: "Leyendo plan…",
  estePlanNoExiste: "Este plan no existe.",
  slotsDelPlan: "Slots del plan",
  cargandoRutinas: "Cargando rutinas…",
  rutinasDelPlan: "Rutinas del plan",
  noPudeCargarEl: "No pude cargar el plan (error inesperado).",
  copiado: "Copiado ✅",
  planDeGimnasioMes: "Plan de Gimnasio – Mes {monthKey}",
  planDeGimnasio: "Plan de Gimnasio",
  mes: "Mes: {monthKey}",
  publico: "🌐 Público",
  rutinaNoAccesible: "Rutina (no accesible)",
  verRutina: "Ver rutina",
  privada: "🔒 Privada",
  id: "ID: {rid}",
  slot: "Slot",
  rutina: "Rutina",
  publica: "🌐 Pública",
});

export const txf = fmt;
