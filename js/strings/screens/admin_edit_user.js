// /js/strings/screens/admin_edit_user.js
// Textos de admin-edit-user-modal.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("admin_edit_user", "Admin: editar usuario", {
  editarUsuario: "Editar usuario",
  actualizaRolPermisosBase: "Actualiza rol, permisos base y vínculo con player",
  cerrar: "Cerrar",
  datosDelUsuario: "Datos del usuario",
  email: "Email",
  rol: "Rol",
  estadoDeAsociacion: "Estado de asociación",
  ninguno: "Ninguno",
  activa: "Activa",
  inactiva: "Inactiva",
  permisosRapidos: "Permisos rápidos",
  puedeUsarPickups: "Puede usar pickups",
  playerActivo: "Player activo",
  vincularConPlayer: "Vincular con player",
  modo: "Modo",
  sinPlayer: "Sin player",
  ligarAPlayerExistente: "Ligar a player existente",
  crearPlayerNuevo: "Crear player nuevo",
  playerExistente: "Player existente",
  seleccionar: "Seleccionar…",
  nuevoPlayer: "Nuevo player",
  seCreaUnRegistro: "Se crea un registro nuevo en club_players y se liga a este usuario.",
  nombre: "Nombre",
  apellido: "Apellido",
  fechaDeNacimiento: "Fecha de nacimiento",
  posicionRolDeCancha: "Posición / rol de cancha",
  nota: "Nota:",
  siCambiasElVinculo: "si cambias el vínculo, este modal actualiza tanto",
  cancelar: "Cancelar",
  guardarCambios: "Guardar cambios",
});

export const txf = fmt;
