// /js/strings/screens/community.js
// Textos de community.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("community", "Comunidad", {
  cargandoComunidad: "Cargando comunidad...",
  nuevoPost: "Nuevo post",
  compartiIdeasSesionesGrabadas: "Compartí ideas, sesiones grabadas y recursos del club",
  sinTitulo: "Sin título",
  miembroDelClub: "Miembro del club",
  abrirRecurso: "Abrir recurso",
  verLinkRelacionado: "Ver link relacionado",
  destacado: "Destacado",
  editar: "Editar",
  eliminar: "Eliminar",
  soloStaff: "Solo staff",
  club: "Club",
  youtube: "YouTube",
  abrir: "Abrir",
  necesitasIniciarSesionPara: "Necesitás iniciar sesión para publicar.",
  elTituloEsObligatorio: "El título es obligatorio.",
  agregaContenidoUnLink: "Agregá contenido, un link de YouTube, media o un link externo.",
  guardandoPost: "Guardando post...",
  noSePudoGuardar: "No se pudo guardar el post.",
  editarPost: "Editar post",
  actualizaContenidoLinksVisibilidad: "Actualizá contenido, links, visibilidad y destacados",
  eliminar2: "¿Eliminar \"{title}\"?",
  eliminandoPost: "Eliminando post...",
  noSePudoEliminar: "No se pudo eliminar el post.",
  video: "Video",
  sesion: "Sesión",
  media: "Media",
  documento: "Documento",
  anuncio: "Anuncio",
  opinion: "Opinión",
  opciones: "Opciones",
  ahora: "ahora",
  composerPlaceholder: "¿Qué querés compartir, {name}?",
  composerPlaceholderAnon: "¿Qué querés compartir?",
  sinResultados: "No hay publicaciones con ese filtro.",
  agregaTituloOContenido: "Escribí algo o agregá un link para publicar.",
});

export const txf = fmt;
