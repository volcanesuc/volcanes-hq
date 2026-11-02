// /js/strings/screens/register_auth.js
// Textos de register.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("register_auth", "Registro (cuenta)", {
  cargando: "Cargando…",
  procesandoRegistro: "Procesando registro…",
  cargando2: "Cargando...",
  noSePudoCargar: "No se pudo cargar la configuración. Refresca la página.",
});

export const txf = fmt;
