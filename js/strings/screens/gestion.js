// /js/strings/screens/gestion.js
// Textos de gestion.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("gestion", "Gestión", {
  gestion: "Gestión",
  cargando: "Cargando...",
  cargandoGestion: "Cargando gestión…",
  errorCargando: "Error cargando \"{view}\"",
  noExportaMount: "{view} no exporta mount()",

  miembrosTitulo: "Miembros",
  miembrosSub: "Directorio de la asociación y sus membresías.",
  directorio: "Directorio",
  membresias: "Membresías",

  finanzasTitulo: "Finanzas",
  finanzasSub: "Contabilidad, pagos de membresías, planes y finanzas de pickups.",
  pagos: "Pagos",
  planes: "Planes de membresía",
  contabilidad: "Contabilidad",
  pickups: "Pickups",
});

export const txf = fmt;
