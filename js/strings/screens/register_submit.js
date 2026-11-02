// /js/strings/screens/register_submit.js
// Textos de register_submit.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("register_submit", "Registro: envío", {
  primeroIngresaConGoogle: "Primero ingresa con Google para completar el registro.",
  seleccionaUnTipoDe: "Selecciona un tipo de registro.",
  completaNombreApellidoTelefono: "Completa nombre, apellido, teléfono y contacto de emergencia.",
  debesCompletarCorreoTipo: "Debes completar correo, tipo de documento y número de documento.",
  debesSeleccionarProvinciaY: "Debes seleccionar provincia y cantón.",
  seleccionaUnPlanDe: "Selecciona un plan de pago válido.",
  adjuntaElComprobanteDe: "Adjunta el comprobante de pago.",
  debesAceptarLaDeclaracion: "Debes aceptar la declaración de veracidad/uso de información.",
  debesAceptarLosTerminos: "Debes aceptar los términos y condiciones generales.",
  debesAceptarLosTerminos2: "Debes aceptar los términos y condiciones de la asociación.",
  ensureUsers: "Ensure users/{uid}",
  saveUserProfileConsents: "Save user profile + consents",
  uploadProofStorage: "Upload proof (Storage)",
  createMembership: "Create membership",
  maybeCreateInstallments: "Maybe create installments",
  createPaymentSubmission: "Create payment submission",
  syncUserMembershipSummary: "Sync user membership summary",
  markOnboardingCompleteUsers: "Mark onboarding complete (users/{uid})",
  cargando: "Cargando…",
  enviando: "Enviando...",
  ocurrioUnErrorInesperado: "Ocurrió un error inesperado.",
});

export const txf = fmt;
