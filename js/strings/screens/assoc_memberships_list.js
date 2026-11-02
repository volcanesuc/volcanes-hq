// /js/strings/screens/assoc_memberships_list.js
// Textos de assoc_memberships_list.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("assoc_memberships_list", "Asociación: lista de membresías", {
  activa: "Activa",
  validando: "Validando",
  vencida: "Vencida",
  rechazada: "Rechazada",
  pendiente: "Pendiente",
  nuevaMembresia: "Nueva membresía",
  activas: "Activas",
  vencidasRechazadas: "Vencidas / Rechazadas",
  duplicadoX: "Duplicado x{dupCount}",
  uid: "UID: {userId}",
  inicio: "Inicio: {value}",
  fin: "Fin: {value}",
  cobertura: "Cobertura: {coverageText}",
});

export const txf = fmt;
