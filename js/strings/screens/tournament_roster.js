// /js/strings/screens/tournament_roster.js
// Textos de tournament_roster.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("tournament_roster", "Torneos: roster", {
  esteTorneoFueEliminado: "Este torneo fue eliminado.",
  errorRecargandoElTorneo: "Error recargando el torneo.",
  faltaElParametroDel: "Falta el parámetro del torneo. Ej: tournament_roster.html?id=XXXX",
  noSeEncontroEl: "No se encontró el torneo.",
  errorCargandoRosterDel: "Error cargando roster del torneo.",
  rosterDelTorneo: "Roster del torneo",
  kickerAdmin: "Roster y pagos",
  kickerViewer: "Roster del torneo",

  // resumen
  statConfirmed: "{n} confirmados",
  statExpected: "de {expected} esperado",
  statDebtors: "{n} jugadores deben",
  statAllPaid: "Todos al día 🎉",
  statBecas: "{n} becas · {amount} cubierto",
  statNoBecas: "Sin becas",
  teamFeePaid: "Pagado",
  teamFeePending: "Pendiente",
  marcarPendiente: "Marcar pendiente",
  marcarPagado: "Marcar pagado",
  noTeamFee: "Sin team fee",

  // filtros
  filterAll: "Todos",
  filterConfirmed: "Confirmados",
  filterCalled: "Convocados",
  filterTentative: "Por confirmar",
  filterOwes: "Deben",
  filterPaid: "Pagados",
  filterBeca: "Becas",
  filterGuests: "Invitados",
  noHayJugadoresAsignados: "No hay jugadores asignados a este torneo.",
  noMatches: "Nadie coincide con este filtro.",

  // filas
  confirmado: "Confirmado",
  convocado: "Convocado",
  porConfirmar: "Por confirmar",
  cambiarEstado: "Tocá para cambiar el estado",
  invitado: "Invitado · {loanFrom}",
  invitado2: "Invitado",
  fuenteNoEncontrada: "Fuente no encontrada",
  otros: "Otros",
  sinFee: "Sin fee",
  feePaid: "Pagado",
  feeOwes: "Debe {balance}",
  feeProgress: "{paid} de {total}",
  becaFull: "Beca completa",
  becaPercent: "Beca {percent}%",
  becaCustom: "Monto especial",
  agregarAbono: "Abono",
  feeButton: "Beca / monto",
  paymentsButton: "Pagos ({n})",
  noPayments: "Todavía no hay pagos.",
  deletePayment: "Borrar pago",
  deletePaymentConfirm: "¿Borrar este pago de {amount}?",
  quitar: "Quitar del roster",
  quitarDelRoster: "¿Quitar a {name} del roster?",
  methodSinpe: "SINPE",
  methodCash: "Efectivo",
  methodTransfer: "Transferencia",

  // picker
  agregarJugadores: "Agregar jugadores",
  disponibles: "{n} disponibles",
  noHayCoincidencias: "No hay coincidencias.",
  noHayJugadoresDisponibles: "Todos los jugadores ya están en el roster.",
  agregar: "Agregar",

  // beca
  feeStandardHint: "{amount} (player fee del torneo)",
  feePreview: "Va a pagar <strong>{amount}</strong>",
  feePreviewSaving: "Va a pagar <strong>{amount}</strong> · beca de {saving}",
  feeErrorPercent: "Poné un porcentaje entre 1 y 99.",
  feeErrorCustom: "Poné un monto válido.",
  feeSaved: "Fee actualizado.",

  // invitado
  guestErrorName: "Poné el nombre.",

  // errores
  errorAgregandoJugadorAl: "Error agregando jugador al roster.",
  errorQuitandoJugador: "Error quitando jugador.",
  errorActualizandoEstado: "Error actualizando estado.",
  errorActualizandoTeamFee: "Error actualizando team fee.",
  errorCreandoInvitado: "Error creando invitado.",
  errorGuardandoFee: "Error guardando el fee.",
  errorBorrandoPago: "Error borrando el pago.",
});

export const txf = fmt;
