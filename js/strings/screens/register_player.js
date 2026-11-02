// /js/strings/screens/register_player.js
// Textos de register_player.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("register_player", "Registro de jugador (viejo)", {
  nombreYNumeroSon: "❌ Nombre y número son obligatorios",
  jugadorGuardado: "Jugador guardado ✅",
  errorGuardandoJugador: "Error guardando jugador ❌",
});

export const txf = fmt;
