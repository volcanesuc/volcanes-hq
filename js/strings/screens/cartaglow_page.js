// /js/strings/screens/cartaglow_page.js
// Textos de cartaglow.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("cartaglow_page", "Cartaglow (página)", {
  cartaglow: "Cartaglow",
  volcanesUltimate: "Volcanes Ultimate",
  registrarse: "Registrarse",
  proximamente: "Próximamente",
  testimonios: "Testimonios",
  showcase: "Showcase",
  cartaglow2025: "Cartaglow 2025",
  stats: "Stats",
  cargando: "Cargando…",
  http: "HTTP {status}",
  error: "Error",
  noSePudoCargar: "No se pudo cargar el CSV. Revisa el link o CORS.",
  vacio: "Vacío",
  elCsvEstaVacio: "El CSV está vacío.",
  filas: "Filas",
  unicos: "Únicos ({col})",
  cartaglowVolcanesUltimate: "Cartaglow • Volcanes Ultimate",
});

export const txf = fmt;
