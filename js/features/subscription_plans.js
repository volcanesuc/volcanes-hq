// js/features/subscription_plans.js
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { loadHeader } from "../components/header.js";

import {
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Const / State
========================= */
const COL = "subscription_plans";

let allPlans = [];
let $ = {};
let _unsubAuth = null;

/* =========================
   Helpers
========================= */
function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function fmtMoney(n, cur = "CRC") {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(v);
}

function badge(text, cls = "") {
  return `<span class="badge-soft ${cls}">${text}</span>`;
}

function planStateLabel(p) {
  if (p.archived) return badge("Archivado", "gray");
  if (!p.active) return badge("Inactivo", "gray");
  return badge("Activo", "yellow");
}

function validateMonthDay(mmdd) {
  return /^\d{2}-\d{2}$/.test(mmdd);
}

function pad2(n){ return String(n).padStart(2, "0"); }

function defaultDueMonthDays(n, day = "01") {
  n = Math.max(1, Number(n || 1));

  // pedido explícito
  if (n === 2) return [`01-${day}`, `07-${day}`];

  // perfecto cuando 12 % n === 0
  if (12 % n === 0) {
    const step = 12 / n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const month = 1 + i * step;
      out.push(`${pad2(month)}-${day}`);
    }
    return out;
  }

  // fallback aproximado
  const used = new Set();
  const out = [];
  for (let i = 0; i < n; i++) {
    let month = 1 + Math.round((i * 11) / Math.max(1, (n - 1)));
    month = Math.min(12, Math.max(1, month));

    while (used.has(month) && month < 12) month++;
    while (used.has(month) && month > 1) month--;

    used.add(month);
    out.push(`${pad2(month)}-${day}`);
  }
  return out;
}

function distributeAmounts(total, n) {
  const T = Math.max(0, Number(total || 0));
  n = Math.max(1, Number(n || 1));

  const base = Math.floor(T / n);
  const rem = T - base * n;

  const arr = Array(n).fill(base);
  arr[n - 1] = base + rem;
  return arr;
}

/**
 * startPolicy values (persisted in Firestore):
 * - "any"      => puede iniciar cualquier mes
 * - "jan"      => solo enero
 * - "jan_jul"  => solo enero o julio
 */
function startPolicyLabel(plan) {
  const sp = (plan.startPolicy || "jan").toLowerCase();
  if (sp === "any") return "Cualquier mes";
  if (sp === "jan_jul") return "Ene o Jul";
  return "Ene";
}

function durationLabel(plan) {
  const dm = Number(plan.durationMonths || 0);
  if (!dm) return "—";
  if (dm === 12) return "12 meses (anual)";
  if (dm === 6) return "6 meses (semestral)";
  if (dm === 1) return "1 mes (mensual)";
  return `${dm} meses`;
}

function validatePlanPayload(p) {
  if (!p.name) return "Falta el nombre del plan.";
  if (!p.season) return "Falta la temporada (ej: 2026 o all).";

  const dm = Number(p.durationMonths);
  if (!Number.isInteger(dm) || dm < 1 || dm > 12) {
    return "Duración inválida. Usá un número entre 1 y 12.";
  }

  const sp = (p.startPolicy || "").toLowerCase();
  if (!["any", "jan", "jan_jul"].includes(sp)) {
    return "Política de inicio inválida.";
  }

  // Coherencia mínima (anual -> enero)
  if (dm === 12 && sp !== "jan") {
    return "Un plan anual debe iniciar en Enero (startPolicy = jan).";
  }

  if (
    !p.allowCustomAmount &&
    (p.totalAmount === null || p.totalAmount === undefined || p.totalAmount === "")
  ) {
    return "Falta el monto total (o marcá Monto editable).";
  }

  if (p.allowPartial) {
    const inst = p.installmentsTemplate || [];
    if (!inst.length) return "Marcaste “Permite cuotas” pero no definiste cuotas.";
    const bad = inst.find((x) => x.dueMonthDay && !validateMonthDay(x.dueMonthDay));
    if (bad) return "Formato de fecha inválido en cuotas. Usá MM-DD (ej: 02-15).";
  }

  return null;
}

/**
 * Default sugerido por duración (admin puede cambiarlo)
 */
function defaultStartPolicyForDuration(dm) {
  if (dm === 12) return "jan";
  if (dm === 6) return "jan_jul";
  if (dm === 1) return "any";
  // 2-11: default enero (más conservador)
  return "jan";
}

function toggleStartPolicyUI() {
  const dm = Number($.planDurationMonths?.value || 0);

  // ✅ mostrar startPolicy cuando durationMonths < 12
  const show = dm > 0 && dm < 12;

  if ($.startPolicyWrap) $.startPolicyWrap.classList.toggle("d-none", !show);

  // Defaults/normalización visible
  if ($.planStartPolicy) {
    if (!$.planStartPolicy.value) {
      $.planStartPolicy.value = defaultStartPolicyForDuration(dm);
    }

    // anual fuerza enero (aunque esté oculto)
    if (dm === 12) $.planStartPolicy.value = "jan";
  }
}

/* =========================
   DOM
========================= */
function renderShell(container, { inAssociation }) {
  container.innerHTML = inAssociation
    ? `
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
        <div class="text-muted small">Administración de planes</div>
        <div class="d-flex gap-2">
          <button id="btnNewPlan" class="btn btn-primary btn-sm">
            <i class="bi bi-plus-lg me-1"></i> Nuevo
          </button>
          <button id="btnRefresh" class="btn btn-outline-secondary btn-sm">
            <i class="bi bi-arrow-clockwise me-1"></i> Refrescar
          </button>
        </div>
      </div>

      <div class="row g-2">
        <div class="col-12 col-md-5">
          <input id="searchInput" class="form-control" placeholder="Buscar por nombre o tags..." />
        </div>
        <div class="col-6 col-md-3">
          <select id="seasonFilter" class="form-select">
            <option value="all">Todas las temporadas</option>
            <option value="all">all</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
        </div>
        <div class="col-6 col-md-4">
          <select id="statusFilter" class="form-select">
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
            <option value="archived">Archivados</option>
          </select>
        </div>
      </div>

      <div class="table-responsive mt-3">
        <table class="table align-middle">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Temporada</th>
              <th>Monto</th>
              <th>Cuotas</th>
              <th>Estado</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody id="plansTbody">
            <tr><td colspan="6" class="text-muted">Cargando…</td></tr>
          </tbody>
        </table>
      </div>

      ${renderModalHtml()}
    `
    : `
      <section class="card">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h2 class="h5 mb-1">Planes de suscripción</h2>
            <div class="text-muted small">Crear/editar planes, duración e inicio permitido</div>
          </div>
          <div class="d-flex gap-2">
            <button id="btnNewPlan" class="btn btn-primary btn-sm">
              <i class="bi bi-plus-lg me-1"></i> Nuevo
            </button>
            <button id="btnRefresh" class="btn btn-outline-secondary btn-sm">
              <i class="bi bi-arrow-clockwise me-1"></i> Refrescar
            </button>
          </div>
        </div>

        <div class="row g-2 mt-3">
          <div class="col-12 col-md-5">
            <input id="searchInput" class="form-control" placeholder="Buscar por nombre o tags..." />
          </div>
          <div class="col-6 col-md-3">
            <select id="seasonFilter" class="form-select">
              <option value="all">Todas las temporadas</option>
              <option value="all">all</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>
          <div class="col-6 col-md-4">
            <select id="statusFilter" class="form-select">
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
              <option value="archived">Archivados</option>
            </select>
          </div>
        </div>

        <div class="table-responsive mt-3">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Temporada</th>
                <th>Monto</th>
                <th>Cuotas</th>
                <th>Estado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="plansTbody">
              <tr><td colspan="6" class="text-muted">Cargando…</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      ${renderModalHtml()}
    `;
}

function renderModalHtml() {
  return `
  <div class="modal fade" id="planModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-fullscreen-md-down modal-xl modal-dialog-scrollable">
      <div class="modal-content">

        <div class="modal-header">
          <div>
            <div class="small text-muted">Plan</div>
            <h5 class="modal-title mb-0" id="planModalTitle">Nuevo plan</h5>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>

        <div class="modal-body">
          <input type="hidden" id="planId" />

          <div class="card">
            <div class="card-header p-0 bg-white">
              <ul class="nav nav-tabs" id="planTabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button
                    class="nav-link active"
                    id="tab-general"
                    data-bs-toggle="tab"
                    data-bs-target="#panel-general"
                    type="button"
                    role="tab"
                    aria-controls="panel-general"
                    aria-selected="true">
                    General
                  </button>
                </li>

                <li class="nav-item" role="presentation">
                  <button
                    class="nav-link"
                    id="tab-installments"
                    data-bs-toggle="tab"
                    data-bs-target="#panel-installments"
                    type="button"
                    role="tab"
                    aria-controls="panel-installments"
                    aria-selected="false">
                    Cuotas
                  </button>
                </li>
              </ul>
            </div>

            <div class="card-body">
              <div class="tab-content">

                <!-- GENERAL -->
                <div class="tab-pane fade show active" id="panel-general" role="tabpanel" aria-labelledby="tab-general">

                  <div class="row g-2">
                    <div class="col-12 col-md-7">
                      <label class="form-label">Nombre</label>
                      <input id="planName" class="form-control" placeholder="Membresía 2026" />
                    </div>

                    <div class="col-6 col-md-3">
                      <label class="form-label">Temporada</label>
                      <input id="planSeason" class="form-control" placeholder="2026 / all" value="2026" />
                    </div>

                    <div class="col-6 col-md-2">
                      <label class="form-label">Moneda</label>
                      <select id="planCurrency" class="form-select">
                        <option value="CRC">CRC</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>

                  <div class="row g-2 mt-2">
                    <div class="col-12 col-md-4">
                      <label class="form-label">Duración (meses)</label>
                      <input
                        id="planDurationMonths"
                        class="form-control"
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                        placeholder="12"
                        value="12" />
                      <div class="small text-muted mt-1">Ej: 12=anual, 6=semestral, 1=mensual</div>
                    </div>

                    <!-- ✅ Start policy: visible cuando durationMonths < 12 -->
                    <div class="col-12 col-md-8 d-none" id="startPolicyWrap">
                      <label class="form-label">Política de inicio</label>
                      <select id="planStartPolicy" class="form-select">
                        <option value="any">Puede iniciar en cualquier mes</option>
                        <option value="jan">Solo puede iniciar en Enero</option>
                        <option value="jan_jul">Solo puede iniciar en Enero o Julio</option>
                      </select>
                      <div class="small text-muted mt-1">
                        Define desde qué mes puede arrancar la cobertura del plan (para planes &lt; 12 meses).
                      </div>
                    </div>
                  </div>

                  <!-- Monto -->
                  <div class="row g-2 mt-2">
                    <div class="col-12 col-md-4">
                      <label class="form-label">Monto total</label>
                      <input id="planTotal" class="form-control" type="number" placeholder="45000" />
                    </div>
                  </div>

                  <!-- ✅ CHECKS agrupados en card -->
                  <div class="card border-0 bg-light mt-3">
                    <div class="card-body py-3">
                      <div class="fw-semibold mb-2">Opciones</div>
                      <div class="row g-2">

                        <div class="col-12 col-md-3">
                          <label class="form-check">
                            <input class="form-check-input" type="checkbox" id="planActive" checked>
                            <span class="form-check-label">Activo</span>
                          </label>
                        </div>

                        <div class="col-12 col-md-3">
                          <label class="form-check">
                            <input class="form-check-input" type="checkbox" id="planRequiresValidation" checked>
                            <span class="form-check-label">Requiere validación</span>
                          </label>
                        </div>

                        <div class="col-12 col-md-3">
                          <label class="form-check">
                            <input class="form-check-input" type="checkbox" id="planAllowCustomAmount">
                            <span class="form-check-label">Monto editable</span>
                          </label>
                        </div>

                        <div class="col-12 col-md-3">
                          <label class="form-check">
                            <input class="form-check-input" type="checkbox" id="planAllowPartial">
                            <span class="form-check-label">Permite cuotas</span>
                          </label>
                        </div>

                      </div>
                    </div>
                  </div>

                  <!-- ✅ Tags DEBAJO del card -->
                  <div class="row g-2 mt-3">
                    <div class="col-12">
                      <label class="form-label">Tags</label>
                      <input id="planTags" class="form-control" placeholder="membresía, adulto, juvenil" />
                    </div>
                  </div>

                  <div class="row g-2 mt-3">
                    <div class="col-12">
                      <label class="form-label">Beneficios (1 por línea)</label>
                      <textarea id="planBenefits" class="form-control" rows="5"
                        placeholder="Camiseta&#10;Cancha&#10;Torneos"></textarea>
                    </div>
                  </div>

                </div>

                <!-- CUOTAS -->
                <div class="tab-pane fade" id="panel-installments" role="tabpanel" aria-labelledby="tab-installments">
                  <div id="installmentsDisabledHint" class="alert alert-light border small d-none mb-2">
                    Activá <b>“Permite cuotas”</b> en la pestaña General para habilitar esta sección.
                  </div>

                  <div class="d-flex justify-content-between align-items-center">
                    <div class="text-muted small">
                      Formato de vencimiento: <span class="mono">MM-DD</span> (ej: 02-15)
                    </div>
                    <button id="btnAddInstallment" class="btn btn-outline-secondary btn-sm" type="button">
                      <i class="bi bi-plus-lg me-1"></i> Agregar cuota
                    </button>
                  </div>

                  <div class="table-responsive mt-2">
                    <table class="table table-sm align-middle">
                      <thead>
                        <tr>
                          <th style="width:64px;">#</th>
                          <th style="width:160px;">Vence (MM-DD)</th>
                          <th style="width:200px;">Monto</th>
                          <th class="text-end"></th>
                        </tr>
                      </thead>
                      <tbody id="installmentsTbody"></tbody>
                    </table>
                  </div>

                  <div class="alert alert-warning small mt-2 mb-0">
                    Si NO es “Monto editable” y dejás “Monto total” vacío, se calcula sumando las cuotas.
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>

        <div class="modal-footer d-flex justify-content-between">
          <button id="btnArchivePlan" class="btn btn-outline-danger" type="button" style="display:none;">
            <i class="bi bi-archive me-1"></i> Archivar
          </button>
          <div class="d-flex gap-2 ms-auto">
            <button class="btn btn-outline-secondary" type="button" data-bs-dismiss="modal">Cancelar</button>
            <button id="btnSavePlan" class="btn btn-primary" type="button">
              <i class="bi bi-check-lg me-1"></i> Guardar
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
  `;
}

function cacheDom(container) {
  const root = container || document;

  $.root = root;

  $.logoutBtn = document.getElementById("logoutBtn");

  $.tbody = root.querySelector("#plansTbody");
  $.btnNew = root.querySelector("#btnNewPlan");
  $.btnRefresh = root.querySelector("#btnRefresh");
  $.searchInput = root.querySelector("#searchInput");
  $.seasonFilter = root.querySelector("#seasonFilter");
  $.statusFilter = root.querySelector("#statusFilter");

  $.planModalEl = root.querySelector("#planModal");
  $.planModalTitle = root.querySelector("#planModalTitle");
  $.planIdEl = root.querySelector("#planId");

  $.planName = root.querySelector("#planName");
  $.planSeason = root.querySelector("#planSeason");
  $.planCurrency = root.querySelector("#planCurrency");

  $.planDurationMonths = root.querySelector("#planDurationMonths");
  $.planStartPolicy = root.querySelector("#planStartPolicy");
  $.startPolicyWrap = root.querySelector("#startPolicyWrap");

  $.planTotal = root.querySelector("#planTotal");
  $.planAllowCustomAmount = root.querySelector("#planAllowCustomAmount");
  $.planAllowPartial = root.querySelector("#planAllowPartial");
  $.planRequiresValidation = root.querySelector("#planRequiresValidation");
  $.planActive = root.querySelector("#planActive");
  $.planTags = root.querySelector("#planTags");
  $.planBenefits = root.querySelector("#planBenefits");

  $.installmentsTbody = root.querySelector("#installmentsTbody");
  $.btnAddInstallment = root.querySelector("#btnAddInstallment");

  $.tabInstallmentsBtn = root.querySelector("#tab-installments");
  $.installmentsDisabledHint = root.querySelector("#installmentsDisabledHint");

  $.btnSavePlan = root.querySelector("#btnSavePlan");
  $.btnArchivePlan = root.querySelector("#btnArchivePlan");

  $.planModal = $.planModalEl ? new bootstrap.Modal($.planModalEl) : null;
}

/* =========================
   Installments UI
========================= */
function installmentRow(n, dueMonthDay, amount) {
  // data-touched: evita que auto-cálculo pise lo editado por el user
  return `
    <tr data-row="installment">
      <td class="fw-bold"><span class="installment-n">${n}</span></td>
      <td>
        <input
          class="form-control form-control-sm due"
          placeholder="MM-DD"
          value="${dueMonthDay || ""}"
          data-touched="0"
        >
      </td>
      <td>
        <input
          class="form-control form-control-sm amt"
          type="number"
          placeholder="20000"
          value="${amount ?? ""}"
          data-touched="0"
        >
      </td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" type="button" data-action="removeInstallment">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `;
}

function renumberInstallments() {
  if (!$.installmentsTbody) return;
  [...$.installmentsTbody.querySelectorAll('tr[data-row="installment"]')].forEach((tr, i) => {
    tr.querySelector(".installment-n").textContent = String(i + 1);
  });
}

function readInstallmentsFromUI() {
  if (!$.installmentsTbody) return [];
  const rows = [...$.installmentsTbody.querySelectorAll('tr[data-row="installment"]')];
  return rows
    .map((tr, idx) => {
      const dueMonthDay = tr.querySelector(".due")?.value?.trim() || "";
      const amount = Number(tr.querySelector(".amt")?.value);
      return {
        n: idx + 1,
        dueMonthDay,
        amount: Number.isNaN(amount) ? 0 : amount,
      };
    })
    .filter((r) => r.dueMonthDay || r.amount);
}

function getInstallmentRows() {
  if (!$.installmentsTbody) return [];
  return [...$.installmentsTbody.querySelectorAll('tr[data-row="installment"]')];
}

function syncInstallmentDefaults({ forceDates = false, forceAmounts = false } = {}) {
  const rows = getInstallmentRows();
  if (!rows.length) return;

  const n = rows.length;
  const dueDefaults = defaultDueMonthDays(n, "01");

  // 1) fechas sugeridas
  rows.forEach((tr, idx) => {
    const dueEl = tr.querySelector(".due");
    if (!dueEl) return;

    const touched = dueEl.dataset.touched === "1";
    const empty = !(dueEl.value || "").trim();

    if (forceDates || (!touched && empty)) {
      dueEl.value = dueDefaults[idx] || "";
    }
  });

  // 2) montos sugeridos (si hay total y NO editable)
  const allowCustom = !!$.planAllowCustomAmount?.checked;
  const totalVal = $.planTotal?.value;
  const total = totalVal === "" ? 0 : Number(totalVal || 0);

  if (!allowCustom && total > 0) {
    const amts = distributeAmounts(total, n);

    rows.forEach((tr, idx) => {
      const amtEl = tr.querySelector(".amt");
      if (!amtEl) return;

      const touched = amtEl.dataset.touched === "1";
      const empty = amtEl.value === "" || amtEl.value === null || amtEl.value === undefined;

      if (forceAmounts || (!touched && empty)) {
        amtEl.value = String(amts[idx] ?? "");
      }
    });
  }
}

/**
 * Cuando el user agrega/elimina cuotas, normalmente querés:
 * - renumerar
 * - sugerir fechas SI están vacías
 * - recalcular montos SI hay total (y no editable)
 */
function afterInstallmentCountChanged() {
  renumberInstallments();
  // no pises lo que el user tocó, pero completá vacíos
  syncInstallmentDefaults({ forceDates: false, forceAmounts: true });
}

function toggleInstallmentsUI() {
  const enabled = !!$.planAllowPartial?.checked;

  if ($.tabInstallmentsBtn) {
    $.tabInstallmentsBtn.classList.toggle("disabled", !enabled);
    $.tabInstallmentsBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
    $.tabInstallmentsBtn.tabIndex = enabled ? 0 : -1;
  }

  if ($.btnAddInstallment) {
    $.btnAddInstallment.disabled = !enabled;
  }

  if ($.installmentsDisabledHint) {
    $.installmentsDisabledHint.classList.toggle("d-none", enabled);
  }
}

/* =========================
   Modal helpers
========================= */
function clearModal() {
  if (!$.planIdEl) return;

  $.planIdEl.value = "";
  if ($.planModalTitle) $.planModalTitle.textContent = "Nuevo plan";

  $.planName.value = "";
  $.planSeason.value = "2026";
  $.planCurrency.value = "CRC";

  $.planDurationMonths.value = "12";
  if ($.planStartPolicy) $.planStartPolicy.value = "jan";

  $.planTotal.value = "";
  $.planAllowCustomAmount.checked = false;
  $.planAllowPartial.checked = false;
  $.planRequiresValidation.checked = true;
  $.planActive.checked = true;

  $.planTags.value = "";
  $.planBenefits.value = "";

  if ($.installmentsTbody) $.installmentsTbody.innerHTML = "";
  if ($.btnArchivePlan) $.btnArchivePlan.style.display = "none";

  toggleInstallmentsUI();
  toggleStartPolicyUI();
}

function setInstallments(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!$.installmentsTbody) return;

  $.installmentsTbody.innerHTML = list
    .sort((a, b) => (a.n || 0) - (b.n || 0))
    .map((r, idx) => installmentRow(idx + 1, r.dueMonthDay || "", r.amount ?? ""))
    .join("");

  renumberInstallments();
}

/* =========================
   Render list
========================= */
function renderPlans() {
  if (!$.tbody) return;

  const qText = norm($.searchInput?.value);
  const seasonVal = $.seasonFilter?.value || "all";
  const statusVal = $.statusFilter?.value || "all";

  let list = [...allPlans];

  if (seasonVal !== "all") {
    list = list.filter((p) => (p.season || "all") === seasonVal);
  }

  if (statusVal === "active") {
    list = list.filter((p) => !p.archived && p.active);
  } else if (statusVal === "inactive") {
    list = list.filter((p) => !p.archived && !p.active);
  } else if (statusVal === "archived") {
    list = list.filter((p) => !!p.archived);
  }

  if (qText) {
    list = list.filter((p) => {
      const name = norm(p.name);
      const tags = (p.tags || []).map(norm).join(" ");
      return name.includes(qText) || tags.includes(qText);
    });
  }

  list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No hay planes con esos filtros.</td></tr>`;
    return;
  }

  $.tbody.innerHTML = list
    .map((p) => {
      const season = p.season || "all";
      const cur = p.currency || "CRC";
      const cuotas = (p.installmentsTemplate || []).length || 0;
      const monto = p.allowCustomAmount ? "Editable" : fmtMoney(p.totalAmount, cur);

      const meta = [`Cubre: ${durationLabel(p)}`, `Inicio: ${startPolicyLabel(p)}`].join(" · ");

      return `
        <tr>
          <td>
            <div class="fw-bold">${p.name || "—"}</div>
            <div class="small text-muted">${meta}</div>
            <div class="small text-muted">${(p.tags || []).join(", ")}</div>
          </td>
          <td>${season}</td>
          <td>${monto}</td>
          <td>${cuotas}</td>
          <td>${planStateLabel(p)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" type="button" data-action="edit" data-id="${p.id}">
              <i class="bi bi-pencil me-1"></i> Editar
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* =========================
   Data
========================= */
async function loadPlans() {
  showLoader?.("Cargando planes…");
  const q = query(collection(db, COL));
  const snap = await getDocs(q);
  allPlans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  renderPlans();
  hideLoader?.();
}

/* =========================
   CRUD
========================= */
async function openEdit(id) {
  showLoader?.("Cargando plan…");

  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    hideLoader?.();
    alert("No se encontró el plan.");
    return;
  }

  const p = { id: snap.id, ...snap.data() };

  clearModal();
  $.planIdEl.value = p.id;
  $.planModalTitle.textContent = "Editar plan";

  $.planName.value = p.name || "";
  $.planSeason.value = p.season || "all";
  $.planCurrency.value = p.currency || "CRC";

  $.planDurationMonths.value = String(p.durationMonths ?? 12);

  // startPolicy persistido
  const dm = Number($.planDurationMonths.value || 12);
  const sp = (p.startPolicy || defaultStartPolicyForDuration(dm)).toLowerCase();
  if ($.planStartPolicy) $.planStartPolicy.value = sp;

  toggleStartPolicyUI();

  $.planTotal.value = p.totalAmount ?? "";
  $.planAllowCustomAmount.checked = !!p.allowCustomAmount;
  $.planAllowPartial.checked = !!p.allowPartial;
  $.planRequiresValidation.checked = !!p.requiresValidation;
  $.planActive.checked = !!p.active;
  $.planTags.value = (p.tags || []).join(", ");
  $.planBenefits.value = (p.benefits || []).join("\n");

  setInstallments(p.installmentsTemplate || []);
  if ($.planAllowPartial.checked) {
    syncInstallmentDefaults({ forceDates: false, forceAmounts: true });
  }
  toggleInstallmentsUI();

  if ($.btnArchivePlan) $.btnArchivePlan.style.display = "inline-block";

  hideLoader?.();
  $.planModal?.show();
}

async function savePlan() {
  const id = $.planIdEl?.value || null;

  const durationMonths = Number($.planDurationMonths?.value || 0);

  // startPolicy:
  // - si <12: el admin decide
  // - si 12: forzamos "jan"
  const spUi = ($.planStartPolicy?.value || "").toLowerCase();
  const startPolicy = durationMonths < 12 ? (spUi || defaultStartPolicyForDuration(durationMonths)) : "jan";

  const payload = {
    name: $.planName.value.trim(),
    season: $.planSeason.value.trim() || "all",
    currency: $.planCurrency.value,

    durationMonths,
    startPolicy,

    totalAmount: $.planTotal.value === "" ? null : Number($.planTotal.value),
    allowCustomAmount: !!$.planAllowCustomAmount.checked,
    allowPartial: !!$.planAllowPartial.checked,
    requiresValidation: !!$.planRequiresValidation.checked,
    active: !!$.planActive.checked,
    archived: false,
    sortIndex: 10,

    tags: $.planTags.value.split(",").map((s) => s.trim()).filter(Boolean),
    benefits: $.planBenefits.value.split("\n").map((s) => s.trim()).filter(Boolean),

    installmentsTemplate: $.planAllowPartial.checked ? readInstallmentsFromUI() : [],
  };

  const err = validatePlanPayload(payload);
  if (err) return alert(err);

  // si no es editable y no hay monto, lo calculamos por cuotas
  if (!payload.allowCustomAmount && (payload.totalAmount === null || payload.totalAmount === undefined)) {
    payload.totalAmount = (payload.installmentsTemplate || []).reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  }

  showLoader?.("Guardando…");

  try {
    if (!id) {
      await addDoc(collection(db, COL), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        doc(db, COL, id),
        {
          ...payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    try {
      await loadPlans();
    } catch (e) {
      console.warn("Guardó, pero falló refresh:", e);
    }

    $.planModal?.hide();
    alert("✅ Plan guardado");
  } catch (e) {
    console.error(e);
    alert("❌ Error guardando el plan: " + (e?.message || e));
  } finally {
    hideLoader?.();
  }
}

async function archivePlan() {
  const id = $.planIdEl?.value;
  if (!id) return;

  if (!confirm("¿Archivar este plan? No se borrará, solo se ocultará por defecto.")) return;

  showLoader?.("Archivando…");

  try {
    await updateDoc(doc(db, COL, id), {
      archived: true,
      active: false,
      updatedAt: serverTimestamp(),
    });

    await loadPlans();
    $.planModal?.hide();
  } catch (e) {
    console.error(e);
    alert("❌ Error archivando el plan: " + (e?.message || e));
  } finally {
    hideLoader?.();
  }
}

/* =========================
   Events
========================= */
function bindEvents() {
  if (!$.root) return;

  $.logoutBtn?.addEventListener("click", logout);

  $.btnRefresh?.addEventListener("click", loadPlans);
  $.btnNew?.addEventListener("click", () => {
    clearModal();
    $.planModal?.show();
  });

  $.searchInput?.addEventListener("input", renderPlans);
  $.seasonFilter?.addEventListener("change", renderPlans);
  $.statusFilter?.addEventListener("change", renderPlans);

  $.tbody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === "edit") await openEdit(id);
  });

  $.btnAddInstallment?.addEventListener("click", () => {
    $.installmentsTbody?.insertAdjacentHTML("beforeend", installmentRow(1, "", ""));
    afterInstallmentCountChanged();
  });

  $.installmentsTbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "removeInstallment") {
      btn.closest("tr")?.remove();
      afterInstallmentCountChanged();
    }
  });

  $.tabInstallmentsBtn?.addEventListener("click", (e) => {
    if (!$.planAllowPartial?.checked) {
      e.preventDefault();
      e.stopPropagation();
      const generalBtn = $.root?.querySelector("#tab-general");
      generalBtn?.click?.();
    }
  });

  // ✅ si el user edita una cuota, no la pisamos luego
  $.installmentsTbody?.addEventListener("input", (e) => {
    const t = e.target;
    if (!t) return;

    if (t.classList.contains("due")) t.dataset.touched = "1";
    if (t.classList.contains("amt")) t.dataset.touched = "1";
  });

  $.btnSavePlan?.addEventListener("click", savePlan);
  $.btnArchivePlan?.addEventListener("click", archivePlan);

  $.planAllowPartial?.addEventListener("change", () => {
    toggleInstallmentsUI();

    if (!$.planAllowPartial.checked) return;

    if ($.installmentsTbody && $.installmentsTbody.children.length === 0) {
      const dm = Number($.planDurationMonths?.value || 12);

      let n;
      if (dm === 12) n = 12;       // mensual
      else if (dm === 6) n = 2;    // semestral (ene/jul)
      else if (dm === 1) n = 1;
      else n = dm;                // default: mensual según duración

      const dues = defaultDueMonthDays(n, "01");
      const totalVal = $.planTotal?.value;
      const total = totalVal === "" ? 0 : Number(totalVal || 0);
      const allowCustom = !!$.planAllowCustomAmount?.checked;
      const amts = (!allowCustom && total > 0) ? distributeAmounts(total, n) : Array(n).fill("");

      setInstallments(
        Array.from({ length: n }).map((_, i) => ({
          n: i + 1,
          dueMonthDay: dues[i] || "",
          amount: amts[i] ?? ""
        }))
      );
    }

    // recalcular/normalizar por si ya existían filas vacías
    syncInstallmentDefaults({ forceDates: false, forceAmounts: true });
  });

  $.planTotal?.addEventListener("input", () => {
    // si hay cuotas activas, recalculá montos (sin tocar fechas)
    if ($.planAllowPartial?.checked) {
      syncInstallmentDefaults({ forceDates: false, forceAmounts: true });
    }
  });

  $.planAllowCustomAmount?.addEventListener("change", () => {
    // si deja de ser editable y hay total + cuotas, sugerimos montos
    if (!$.planAllowCustomAmount.checked && $.planAllowPartial?.checked) {
      syncInstallmentDefaults({ forceDates: false, forceAmounts: true });
    }
  });

  // ✅ duration changes => mostrar/ocultar startPolicy + defaults
  $.planDurationMonths?.addEventListener("input", () => {
    toggleStartPolicyUI();
  });
}

/* =========================
   Public API
========================= */
export async function mount(container, cfg) {
  allPlans = [];
  $ = {};

  const inAssociation = window.location.pathname.endsWith("/association.html");

  renderShell(container, { inAssociation });
  cacheDom(container);
  bindEvents();

  if (_unsubAuth) {
    try {
      _unsubAuth();
    } catch {}
    _unsubAuth = null;
  }

  const ret = watchAuth(async (user) => {
    if (!user) return;
    await loadPlans();
  });
  if (typeof ret === "function") _unsubAuth = ret;
}

/* =========================
   Standalone automount (opcional)
========================= */
async function autoMountIfStandalone() {
  const marker = document.querySelector('[data-page="subscription_plans"]');
  if (!marker) return;

  try {
    await loadHeader("plans");
  } catch {}

  const container = document.getElementById("page-content") || document.body;
  await mount(container);
}

autoMountIfStandalone();
