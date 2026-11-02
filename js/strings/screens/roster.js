// /js/strings/screens/roster.js
// Textos de roster.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("roster", "Roster", {
  femenino: "Femenino",
  masculino: "Masculino",
  otro: "Otro",
  editarJugador: "Editar jugador",
  nuevoJugador: "Nuevo jugador",
  actualizarInformacionDelJugador: "Actualizar información del jugador",
  registrarJugadorEnEl: "Registrar jugador en el roster",
  guardarCambios: "Guardar cambios",
  crearJugador: "Crear jugador",
  todos: "Todos",
  activo: "Activo",
  inactivo: "Inactivo",
});

export const txf = fmt;
