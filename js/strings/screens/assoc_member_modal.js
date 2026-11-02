// /js/strings/screens/assoc_member_modal.js
// Textos de assoc_member_modal.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("assoc_member_modal", "Asociación: modal de asociado", {
  editarMiembro: "Editar miembro",
  crearMiembrosManualmenteDesde: "Crear miembros manualmente desde este modal está deshabilitado por ahora.",
  cargandoUsuario: "Cargando usuario…",
  noSeEncontroEl: "No se encontró el usuario.",
  errorCargandoUsuario: "Error cargando usuario.",
  completaAlMenosNombre: "Completa al menos nombre, apellido o correo.",
  emailInvalido: "Email inválido.",
  guardando: "Guardando…",
  errorGuardando: "❌ Error guardando: ",
});

export const txf = fmt;
