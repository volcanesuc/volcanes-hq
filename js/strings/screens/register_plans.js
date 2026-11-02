// /js/strings/screens/register_plans.js
// Textos de register_plans.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("register_plans", "Registro: planes", {
  seleccionar: "Seleccionar…",
  plan: "Plan",
  monto: "Monto: {value}",
  archivoListoKb: "Archivo listo: {name} ({kb} KB)",
  archivoInvalido: "Archivo inválido.",
});

export const txf = fmt;
