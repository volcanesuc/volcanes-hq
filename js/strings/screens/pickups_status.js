// /js/strings/screens/pickups_status.js
// Textos de pickups_status.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("pickups_status", "Estado de pickups", {
  fechaPorDefinir: "Fecha por definir",
  noHayPickupsActivos: "No hay pickups activos en este momento",
  cuandoPubliquenNuevosPickups: "Cuando publiquen nuevos pickups, los verás aquí.",
  pickup: "Pickup",
  ubicacionPorConfirmar: "Ubicación por confirmar",
  cupo: "Cupo:",
  tarifas: "Tarifas:",
  verUbicacion: "Ver ubicación",
  sinEnlace: "Sin enlace",
  inicio: "Inicio:",
  fin: "Fin:",
  lugar: "Lugar:",
  noSePudieronCargar: "No se pudieron cargar los pickups",
  revisaLaColeccionDe: "Revisa la colección de pickups o los permisos de lectura.",
  actualizandoSolicitud: "Actualizando solicitud…",
  noSePudoRegistrar: "No se pudo registrar tu interés como jugador.",
  preparandoAfiliacion: "Preparando afiliación…",
  noSePudoPreparar: "No se pudo preparar el cambio a asociado.",
  cargando: "Cargando…",
  validandoAcceso: "Validando acceso…",
  noSePudoCargar: "No se pudo cargar tu información.",
});

export const txf = fmt;
