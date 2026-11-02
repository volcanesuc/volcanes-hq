// /js/strings/screens/tournament_editor.js
// Textos de tournament_editor.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("tournament_editor", "Torneos: editor", {
  noSePudoCargar: "No se pudo cargar el torneo.",
  faltanCamposObligatorios: "Faltan campos obligatorios.",
  errorGuardandoTorneo: "Error guardando torneo.",
  eliminarEsteTorneo: "¿Eliminar este torneo?",
  errorEliminandoTorneo: "Error eliminando torneo.",
  opcional: "{label} (opcional)",
  moneda: "Moneda",
  colones: "Colones (₡)",
  dolares: "Dólares ($)",
});

export const txf = fmt;
