// /js/strings/screens/payment_modal.js
// Textos de payment_modal.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("payment_modal", "Modal de pago", {
  agregarPago: "Agregar pago",
  faltaElDestinoDel: "Falta el destino del pago.",
  montoInvalido: "Monto inválido.",
  fechaRequerida: "Fecha requerida.",
  guardandoPago: "Guardando pago…",
  errorGuardandoPago: "Error guardando pago.",
});

export const txf = fmt;
