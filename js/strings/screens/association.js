// /js/strings/screens/association.js
// Textos de association.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("association", "Asociación", {
  cargando: "Cargando...",
  subscriptionPlansJsNo: "subscription_plans.js no exporta mount()",
  assocMembersListJs: "assoc_members_list.js no exporta mount()",
  assocMembershipsListJs: "assoc_memberships_list.js no exporta mount()",
  assocPaymentsValidationList: "assoc_payments_validation_list.js no exporta mount()",
  assocAccountingJsNo: "assoc_accounting.js no exporta mount()",
  errorCargando: "Error cargando \"{tab}\"",
  cargandoAsociacion: "Cargando asociación…",
});

export const txf = fmt;
