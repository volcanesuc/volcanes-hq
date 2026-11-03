// /js/strings/screens/perfil.js
// Textos de perfil.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("perfil", "Mi perfil", {
  cargandoPerfil: "Cargando tu perfil…",
  guardando: "Guardando…",
  guardado: "Listo, tus datos quedaron guardados.",
  noSePudoGuardar: "No se pudo guardar: {err}",
  faltaNombre: "Nombre y apellidos son obligatorios.",
  noSePudieronCargarPosts: "No se pudieron cargar tus publicaciones.",
  eliminarPost: "¿Eliminar esta publicación?",
  noSePudoEliminar: "No se pudo eliminar la publicación.",

  jugadorActivo: "Jugador/a activo",
  jugadorPendiente: "Jugador/a en revisión",
  asociadoActivo: "Asociado/a",
  asociacionPendiente: "Membresía en validación",
  asociacionRechazada: "Membresía rechazada",
});

export const txf = fmt;
