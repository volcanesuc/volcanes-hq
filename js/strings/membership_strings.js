// js/strings/membership_strings.js

export const STR = {
    title: "Membresías",
    subtitle: "Listado por temporada/plan/estado + acceso a detalle y link de pago.",

  /* =========================
     Loader
  ========================= */
  loader: {
    loadingMemberships: "Cargando membresías…"
  },

  /* =========================
     Toasts
  ========================= */
  toast: {
    linkCopied: "✅ Link copiado",
    copyPrompt: "Copiá el link:"
  },

  /* =========================
     Errors
  ========================= */
  errors: {
    loadData: "Error cargando datos."
  },

  /* =========================
     Common
  ========================= */
  common: {
    dash: "—"
  },

  /* =========================
     Status labels
  ========================= */
  status: {
    pending: "Pendiente",
    partial: "Parcial",
    paid: "Pagado",
    validated: "Validado",
    rejected: "Rechazado"
  },

  /* =========================
     KPI labels
  ========================= */
  kpi: {
    pending: "Pendientes",
    partial: "Parciales",
    paid: "Pagadas",
    validated: "Validadas"
  },

  /* =========================
     Filters
  ========================= */
  filters: {
    searchPh: "Buscar por nombre, email, teléfono, ID, plan…",
    allSeasons: "Todas las temporadas",
    allPlans: "Todos",
    allStatus: "Todos los estados",
    allActions: "Todas",
    needsAction: "Requiere acción",
    ok: "OK"
  },

  /* =========================
     Table
  ========================= */
  table: {
    associate: "Asociado",
    plan: "Plan",
    season: "Temporada",
    amount: "Monto",
    status: "Estado",
    actions: "Acciones",
    loadingRow: "Cargando…",
    noResults: "No hay resultados con esos filtros.",
    idPrefix: "ID:"
  },

  /* =========================
     Plan labels
  ========================= */
  plan: {
    installments: "Cuotas",
    singlePay: "Pago único",
    validation: "Validación",
    noValidation: "Sin validación"
  },

  /* =========================
     Amount
  ========================= */
  amount: {
    editable: "Editable"
  },

  /* =========================
     Buttons / actions
  ========================= */
  actions: {
    refresh: "Actualizar",
    detail: "Detalle",
    link: "Link",
    newMembership: "Nueva membresía"
  },

  /* =========================
     Counter
  ========================= */
  count(n) {
    return `${n} membresía(s)`;
  }
};
