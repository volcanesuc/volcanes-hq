import { db, auth } from "/js/auth/firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { APP_CONFIG } from "/js/config/config.js";

const COL = APP_CONFIG.collections;
const COL_MOVEMENTS = COL.finance_movements;
const COL_HISTORY = COL.finance_movements_history;
const COL_SUBMISSIONS = COL.membershipPaymentSubmissions;

const CRC = (n) =>
  new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
  }).format(Number(n || 0));

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tsMillis(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    const [y, m, d] = String(v).split("-").map(Number);
    return new Date(y, m - 1, d).getTime();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function fmtDateShort(v) {
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  let d = null;

  if (!v) return "—";
  if (typeof v?.toDate === "function") {
    d = v.toDate();
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    const [y, m, day] = String(v).split("-").map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(v);
  }

  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";

  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function isValidatedMembershipSubmission(p) {
  const st = String(p?.status || "").toLowerCase();
  return st === "validated" || st === "approved" || st === "applied";
}

function getSubmissionDisplayDate(p) {
  return p?.decidedAt || p?.updatedAt || p?.createdAt || null;
}

function getSubmissionDescription(p) {
  const payer = String(p?.payerName || "").trim();
  const season = String(p?.season || "").trim();
  const planId = String(p?.planId || "").trim();
  const membershipId = String(p?.membershipId || "").trim();

  const bits = [];
  bits.push("Pago de membresía");
  if (payer) bits.push(`— ${payer}`);
  if (season) bits.push(`• Temp. ${season}`);
  if (membershipId) bits.push(`• Membresía ${membershipId}`);
  else if (planId) bits.push(`• Plan ${planId}`);

  return bits.join(" ");
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b), "es")
  );
}

export async function mount(root, cfg) {
  root.innerHTML = `
    <div class="card shadow-sm mb-3">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h3 class="mb-0">Contabilidad</h3>
          <div class="text-muted small">Resumen y movimientos financieros del club</div>
        </div>
        <button
          class="btn btn-sm btn-outline-secondary"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#fxSummaryCollapse"
          aria-expanded="true"
          aria-controls="fxSummaryCollapse"
        >
          Mostrar / ocultar
        </button>
      </div>

      <div class="collapse show" id="fxSummaryCollapse">
        <div class="card-body">
          <div class="row g-3 mb-4">
            <div class="col-md-3">
              <div class="border rounded p-3 h-100">
                <div class="small text-muted">Membresías recaudadas</div>
                <div class="fs-4 fw-bold" id="fxMembershipIncome">₡0</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="border rounded p-3 h-100">
                <div class="small text-muted">Otros ingresos</div>
                <div class="fs-4 fw-bold text-success" id="fxOtherIncome">₡0</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="border rounded p-3 h-100">
                <div class="small text-muted">Gastos</div>
                <div class="fs-4 fw-bold text-danger" id="fxExpenses">₡0</div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="border rounded p-3 h-100">
                <div class="small text-muted">Balance neto</div>
                <div class="fs-4 fw-bold" id="fxBalance">₡0</div>
              </div>
            </div>
          </div>

          <div class="row g-2 mb-3">
            <div class="col-md-3">
              <label class="form-label">Buscar</label>
              <input id="fxSearch" class="form-control" placeholder="Descripción, persona, plan, membresía..." />
            </div>

            <div class="col-md-2">
              <label class="form-label">Tipo</label>
              <select id="fxFilterType" class="form-select">
                <option value="all">Todos</option>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
              </select>
            </div>

            <div class="col-md-2">
              <label class="form-label">Categoría</label>
              <select id="fxFilterCategory" class="form-select">
                <option value="all">Todas</option>
              </select>
            </div>

            <div class="col-md-2">
              <label class="form-label">Origen</label>
              <select id="fxFilterSource" class="form-select">
                <option value="all">Todos</option>
              </select>
            </div>

            <div class="col-md-1">
              <label class="form-label">Monto mín.</label>
              <input id="fxMinAmount" type="number" min="0" step="0.01" class="form-control" />
            </div>

            <div class="col-md-1">
              <label class="form-label">Monto máx.</label>
              <input id="fxMaxAmount" type="number" min="0" step="0.01" class="form-control" />
            </div>

            <div class="col-md-1 d-flex align-items-end">
              <button id="fxClearFilters" type="button" class="btn btn-outline-secondary w-100">
                Limpiar
              </button>
            </div>
          </div>

          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <div id="fxCountLabel" class="small text-muted">—</div>
          </div>

          <div class="table-responsive">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Monto</th>
                  <th>Origen</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody id="fxTableBody">
                <tr><td colspan="7" class="text-muted">Cargando…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="card shadow-sm mb-3">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h4 class="mb-0">Agregar movimiento manual</h4>
          <div class="text-muted small">Registrar ingresos y gastos no automáticos</div>
        </div>
        <button
          class="btn btn-sm btn-outline-secondary"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#fxFormCollapse"
          aria-expanded="false"
          aria-controls="fxFormCollapse"
        >
          Mostrar / ocultar
        </button>
      </div>

      <div class="collapse" id="fxFormCollapse">
        <div class="card-body">
          <form id="fxForm" class="row g-3">
            <div class="col-md-2">
              <label class="form-label">Tipo</label>
              <select id="fxType" class="form-select" required>
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
              </select>
            </div>

            <div class="col-md-3">
              <label class="form-label">Categoría</label>
              <select id="fxCategory" class="form-select" required>
                <option value="pickup">Pickups</option>
                <option value="discos">Discos</option>
                <option value="dominio">Dominio</option>
                <option value="federacion">Federación</option>
                <option value="torneo">Torneo</option>
                <option value="uniformes">Uniformes</option>
                <option value="patrocinio">Patrocinio</option>
                <option value="otros">Otros</option>
              </select>
            </div>

            <div class="col-md-3">
              <label class="form-label">Descripción</label>
              <input id="fxDescription" class="form-control" required />
            </div>

            <div class="col-md-2">
              <label class="form-label">Monto</label>
              <input id="fxAmount" type="number" min="0" step="0.01" class="form-control" required />
            </div>

            <div class="col-md-2">
              <label class="form-label">Fecha</label>
              <input id="fxDate" type="date" class="form-control" required />
            </div>

            <div class="col-md-3">
              <label class="form-label">Método</label>
              <select id="fxMethod" class="form-select">
                <option value="sinpe">SINPE</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div class="col-md-7">
              <label class="form-label">Notas</label>
              <input id="fxNotes" class="form-control" />
            </div>

            <div class="col-md-2 d-flex align-items-end">
              <button class="btn btn-success w-100" type="submit">Guardar movimiento</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  const $ = {
    membershipIncome: root.querySelector("#fxMembershipIncome"),
    otherIncome: root.querySelector("#fxOtherIncome"),
    expenses: root.querySelector("#fxExpenses"),
    balance: root.querySelector("#fxBalance"),

    form: root.querySelector("#fxForm"),
    type: root.querySelector("#fxType"),
    category: root.querySelector("#fxCategory"),
    description: root.querySelector("#fxDescription"),
    amount: root.querySelector("#fxAmount"),
    date: root.querySelector("#fxDate"),
    method: root.querySelector("#fxMethod"),
    notes: root.querySelector("#fxNotes"),

    tableBody: root.querySelector("#fxTableBody"),
    countLabel: root.querySelector("#fxCountLabel"),

    search: root.querySelector("#fxSearch"),
    filterType: root.querySelector("#fxFilterType"),
    filterCategory: root.querySelector("#fxFilterCategory"),
    filterSource: root.querySelector("#fxFilterSource"),
    minAmount: root.querySelector("#fxMinAmount"),
    maxAmount: root.querySelector("#fxMaxAmount"),
    clearFilters: root.querySelector("#fxClearFilters"),
  };

  $.date.value = new Date().toISOString().slice(0, 10);

  let allRows = [];

  function fillFilterOptions(rows) {
    const currentCategory = $.filterCategory.value || "all";
    const currentSource = $.filterSource.value || "all";

    const categories = uniqueSorted(rows.map((r) => r.category));
    const sources = uniqueSorted(rows.map((r) => r.source));

    $.filterCategory.innerHTML = [
      `<option value="all">Todas</option>`,
      ...categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`),
    ].join("");

    $.filterSource.innerHTML = [
      `<option value="all">Todos</option>`,
      ...sources.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`),
    ].join("");

    if ([...$.filterCategory.options].some((o) => o.value === currentCategory)) {
      $.filterCategory.value = currentCategory;
    } else {
      $.filterCategory.value = "all";
    }

    if ([...$.filterSource.options].some((o) => o.value === currentSource)) {
      $.filterSource.value = currentSource;
    } else {
      $.filterSource.value = "all";
    }
  }

  function renderTable() {
    const q = norm($.search.value);
    const typeVal = $.filterType.value || "all";
    const categoryVal = $.filterCategory.value || "all";
    const sourceVal = $.filterSource.value || "all";
    const minVal = $.minAmount.value === "" ? null : Number($.minAmount.value);
    const maxVal = $.maxAmount.value === "" ? null : Number($.maxAmount.value);

    let rows = [...allRows];

    if (typeVal !== "all") {
      rows = rows.filter((r) => r.type === typeVal);
    }

    if (categoryVal !== "all") {
      rows = rows.filter((r) => r.category === categoryVal);
    }

    if (sourceVal !== "all") {
      rows = rows.filter((r) => r.source === sourceVal);
    }

    if (minVal !== null && !Number.isNaN(minVal)) {
      rows = rows.filter((r) => Number(r.amount || 0) >= minVal);
    }

    if (maxVal !== null && !Number.isNaN(maxVal)) {
      rows = rows.filter((r) => Number(r.amount || 0) <= maxVal);
    }

    if (q) {
      rows = rows.filter((r) => {
        const blob = [
          r.category,
          r.description,
          r.source,
          r.createdBy,
          r.membershipId,
          r.planId,
          r.season,
          r.typeLabel,
        ].map(norm).join(" ");

        return blob.includes(q);
      });
    }

    $.countLabel.textContent = `${rows.length} registro(s)`;

    if (!rows.length) {
      $.tableBody.innerHTML = `<tr><td colspan="7" class="text-muted">No hay resultados con esos filtros.</td></tr>`;
      return;
    }

    $.tableBody.innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.dateLabel)}</td>
        <td>
          <span class="badge text-bg-${r.type === "income" ? "success" : "danger"}">
            ${esc(r.typeLabel)}
          </span>
        </td>
        <td>${esc(r.category || "—")}</td>
        <td>${esc(r.description || "—")}</td>
        <td>${CRC(r.amount || 0)}</td>
        <td>${esc(r.source || "—")}</td>
        <td>${esc(r.createdBy || "—")}</td>
      </tr>
    `).join("");
  }

  async function loadSummaryAndTable() {
    $.tableBody.innerHTML = `<tr><td colspan="7" class="text-muted">Cargando…</td></tr>`;

    const [movSnap, paymentsSnap] = await Promise.all([
      getDocs(query(collection(db, COL_MOVEMENTS), orderBy("createdAt", "desc"))),
      getDocs(collection(db, COL_SUBMISSIONS)),
    ]);

    const movements = movSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const paymentSubs = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const validatedMembershipPayments = paymentSubs.filter(isValidatedMembershipSubmission);

    const membershipIncome = validatedMembershipPayments.reduce(
      (acc, p) => acc + Number(p.amountReported || 0),
      0
    );

    const otherIncome = movements
      .filter((m) => m.isVoided !== true && m.type === "income")
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);

    const expenses = movements
      .filter((m) => m.isVoided !== true && m.type === "expense")
      .reduce((acc, m) => acc + Number(m.amount || 0), 0);

    const balance = membershipIncome + otherIncome - expenses;

    $.membershipIncome.textContent = CRC(membershipIncome);
    $.otherIncome.textContent = CRC(otherIncome);
    $.expenses.textContent = CRC(expenses);
    $.balance.textContent = CRC(balance);

    const manualRows = movements
      .filter((m) => m.isVoided !== true)
      .map((m) => ({
        _kind: "movement",
        _sortTs: tsMillis(m.movementDate || m.createdAt),
        dateLabel: fmtDateShort(m.movementDate || m.createdAt),
        type: m.type === "expense" ? "expense" : "income",
        typeLabel: m.type === "expense" ? "Gasto" : "Ingreso",
        category: m.category || "otros",
        description: m.description || "—",
        amount: Number(m.amount || 0),
        source: m.source || "manual",
        createdBy: m.createdByName || m.createdByUid || "—",
        membershipId: m.relatedMembershipId || "",
        planId: "",
        season: "",
      }));

    const membershipRows = validatedMembershipPayments.map((p) => ({
      _kind: "membership_payment",
      _sortTs: tsMillis(getSubmissionDisplayDate(p)),
      dateLabel: fmtDateShort(getSubmissionDisplayDate(p)),
      type: "income",
      typeLabel: "Ingreso",
      category: "membresía",
      description: getSubmissionDescription(p),
      amount: Number(p.amountReported || 0),
      source: "membresía",
      createdBy: p.payerName || p.email || p.userId || "—",
      membershipId: p.membershipId || "",
      planId: p.planId || "",
      season: p.season || "",
    }));

    allRows = [...manualRows, ...membershipRows].sort((a, b) => b._sortTs - a._sortTs);

    fillFilterOptions(allRows);
    renderTable();
  }

  $.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("No hay usuario autenticado.");
    }

    const payload = {
      type: $.type.value,
      category: $.category.value,
      subcategory: $.category.value,
      description: $.description.value.trim(),
      amount: Number($.amount.value || 0),
      currency: "CRC",
      movementDate: $.date.value,
      method: $.method.value || "otro",
      source: "manual",
      sourceId: null,
      relatedUserId: null,
      relatedMembershipId: null,
      relatedSubmissionId: null,
      notes: $.notes.value.trim() || null,
      createdByUid: currentUser?.uid || null,
      createdByName: currentUser?.displayName || currentUser?.email || "Usuario",
      isVoided: false,
      voidedAt: null,
      voidedByUid: null,
      voidReason: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, COL_MOVEMENTS), payload);

    await addDoc(collection(db, COL_HISTORY), {
      movementId: ref.id,
      action: "create",
      snapshot: {
        ...payload,
        movementId: ref.id,
      },
      changedByUid: currentUser?.uid || null,
      changedByName: currentUser?.displayName || currentUser?.email || "Usuario",
      changedAt: serverTimestamp(),
    });

    $.form.reset();
    $.date.value = new Date().toISOString().slice(0, 10);
    $.type.value = "income";
    $.category.value = "pickup";

    await loadSummaryAndTable();
  });

  [
    $.search,
    $.filterType,
    $.filterCategory,
    $.filterSource,
    $.minAmount,
    $.maxAmount,
  ].forEach((el) => {
    el?.addEventListener("input", renderTable);
    el?.addEventListener("change", renderTable);
  });

  $.clearFilters?.addEventListener("click", () => {
    $.search.value = "";
    $.filterType.value = "all";
    $.filterCategory.value = "all";
    $.filterSource.value = "all";
    $.minAmount.value = "";
    $.maxAmount.value = "";
    renderTable();
  });

  await loadSummaryAndTable();
}