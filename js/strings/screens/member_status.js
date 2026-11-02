// /js/strings/screens/member_status.js
// Textos de member_status.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("member_status", "Estado de membresía", {
  ocurrioUnError: "Ocurrió un error.",
  pendiente: "Pendiente",
  pagoEnValidacion: "Pago en validación",
  yaRecibimosTuSolicitud: "Ya recibimos tu solicitud y tu comprobante de pago. Estamos validando la información antes de activar tu membresía.",
  tuSolicitudFueRegistrada: "Tu solicitud fue registrada el {submittedAt}. La cobertura se mostrará cuando la membresía sea aprobada.",
  tuSolicitudFueRecibida: "Tu solicitud fue recibida. La cobertura se mostrará cuando la membresía sea aprobada.",
  seAsignaraAlAprobarse: "Se asignará al aprobarse",
  membresiaActiva: "Membresía activa",
  activa: "Activa",
  tuMembresiaEstaActiva: "Tu membresía está activa y vence hoy, {endDate}.",
  tuMembresiaEstaActiva2: "Tu membresía está activa hasta el {endDate}.",
  tuMembresiaFueActivada: "Tu membresía fue activada y su cobertura llegó hasta el {endDate}.",
  tuPagoFueValidado: "Tu pago fue validado correctamente y tu membresía ya se encuentra activa.",
  tuMembresiaCubreDel: "Tu membresía cubre del {startDate} al {endDate}.",
  tuMembresiaEstaActiva3: "Tu membresía está activa. La cobertura detallada todavía no está disponible.",
  solicitudObservada: "Solicitud observada",
  requiereRevision: "Requiere revisión",
  noPudimosValidarTu: "No pudimos validar tu solicitud con la información actual. Comunícate con el club para más detalle.",
  tuPagoOTu: "Tu pago o tu comprobante requieren revisión administrativa antes de poder activar la membresía.",
  estadoDeMembresia: "Estado de membresía",
  sinConfirmar: "Sin confirmar",
  todaviaNoPudimosDeterminar: "Todavía no pudimos determinar con claridad el estado actual de tu membresía.",
  estamosMostrandoLaInformacion: "Estamos mostrando la información disponible actualmente en tu cuenta.",
  noSeEncontroLa: "No se encontró la cuenta del usuario.",
  todaviaNoEncontramosUna: "Todavía no encontramos una membresía asociada a esta cuenta. Si acabas de registrarte, vuelve a intentarlo en unos segundos.",
  noSeEncontroEl: "No se encontró el detalle de la membresía asociada a tu cuenta.",
  elEstadoActualDe: "El estado actual de tu membresía todavía no está completamente definido en el sistema.",
  cargandoEstadoDeMembresia: "Cargando estado de membresía…",
  noSePudoCargar: "No se pudo cargar el estado de tu membresía.",
  noSePudoInicializar: "No se pudo inicializar la página.",
  cerrandoSesion: "Cerrando sesión…",
});

export const txf = fmt;
