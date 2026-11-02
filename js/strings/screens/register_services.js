// /js/strings/screens/register_services.js
// Textos de register_services.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("register_services", "Registro: servicios", {
  errorDesconocido: "Error desconocido.",
  noTienesPermisoPara: "No tienes permiso para subir el comprobante. Revisa las Storage Rules para membership_submissions/{uid}/...",
  laSubidaDelComprobante: "La subida del comprobante fue cancelada.",
  laSubidaTardoDemasiado: "La subida tardó demasiado o falló por conexión. Intenta con una red más estable o un archivo más liviano.",
  elArchivoSubidoLlego: "El archivo subido llegó corrupto. Intenta subirlo otra vez.",
  elBucketDeStorage: "El bucket de Storage superó su cuota.",
  noSeEncontroEl: "No se encontró el archivo en Storage.",
  permisosInsuficientesRules: "Permisos insuficientes (rules).",
  noHaySesionActiva: "No hay sesión activa.",
  faltaUnIndiceO: "Falta un índice o una precondición de Firestore.",
  hayUnDatoInvalido: "Hay un dato inválido en la solicitud.",
  pendienteDeValidacion: "Pendiente de validación.",
  membresia: "Membresía",
  noSeleccionasteNingunComprobante: "No seleccionaste ningún comprobante.",
  elComprobantePesaDemasiado: "El comprobante pesa demasiado. Máximo permitido: {maxMb} MB.",
  formatoNoPermitidoUsa: "Formato no permitido. Usa JPG, PNG, WEBP o PDF.",
  subiendoComprobante0: "Subiendo comprobante: 0%",
  subiendoComprobante: "Subiendo comprobante: {pct}%",
  comprobanteSubidoCorrectamente: "Comprobante subido correctamente.",
});

export const txf = fmt;
