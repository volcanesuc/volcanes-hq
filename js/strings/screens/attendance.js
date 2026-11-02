// /js/strings/screens/attendance.js
// Textos de attendance.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("attendance", "Asistencia", {
  noHayEntrenamientosEn: "No hay entrenamientos en este rango.",
  noHayDatosPara: "No hay datos para calcular asistencia.",
  jspdfNoEstaCargado: "jsPDF no está cargado. Revisá el script CDN.",
  reporteDeAsistenciaCacuc: "Reporte de Asistencia (CACUC)",
  rangoA: "Rango: {value} a {value2}",
  entrenamientosJugadoresActivos: "Entrenamientos: {totalTrainings} · Jugadores activos: {rowsCount}",
  jugador: "Jugador",
  asistencias: "Asistencias",
  totalEntrenos: "Total entrenos",
  participacion: "% participación",
  noSePudoGenerar: "No se pudo generar el PDF: {value}",
  asistencia: "Asistencia",
  de: "{value} de {totalTrainings} · {value2}%",
  asistencia2: "% Asistencia",
});

export const txf = fmt;
