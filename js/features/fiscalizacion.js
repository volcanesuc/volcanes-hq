import { db, auth } from "../auth/firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_MOVEMENTS = "finance_movements";
const COL_HISTORY = "finance_movements_history";
const COL_SUBMISSIONS = "membership_payment_submissions";

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

function fmtDate(v) {
  if (!v) return "—";
  if (typeof v?.toDate === "function") {
    return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(v.toDate());
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(d);
}

export async function mount(root, cfg) {
  root.innerHTML = `
    <div class="card shadow-sm mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h3 class="mb-1">Fiscalización</h3>
            <div class="text-muted small">Control financiero del club</div>
          </div>
        </div>

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

        <form id="fxForm" class="row g-3 mb-4">
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
  };

  $.date.value = new Date().toISOString().slice(0, 10);

  async function loadSummaryAndTable() {
    $.tableBody.innerHTML = `<tr><td colspan="7" class="text-muted">Cargando…</td></tr>`;

    const [movSnap, paymentsSnap] = await Promise.all([
      getDocs(query(collection(db, COL_MOVEMENTS), orderBy("createdAt", "desc"))),
      getDocs(collection(db, COL_SUBMISSIONS)),
    ]);

    const movements = movSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const paymentSubs = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const membershipIncome = paymentSubs
      .filter((p) => p.status === "approved" || p.status === "validated" || p.status === "applied")
      .reduce((acc, p) => acc + Number(p.amountReported || 0), 0);

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

    if (!movements.length) {
      $.tableBody.innerHTML = `<tr><td colspan="7" class="text-muted">No hay movimientos manuales registrados.</td></tr>`;
      return;
    }

    $.tableBody.innerHTML = movements.map((m) => `
      <tr>
        <td>${esc(fmtDate(m.movementDate || m.createdAt))}</td>
        <td>
          <span class="badge text-bg-${m.type === "income" ? "success" : "danger"}">
            ${m.type === "income" ? "Ingreso" : "Gasto"}
          </span>
        </td>
        <td>${esc(m.category || "—")}</td>
        <td>${esc(m.description || "—")}</td>
        <td>${CRC(m.amount || 0)}</td>
        <td>${esc(m.source || "manual")}</td>
        <td>${esc(m.createdByName || m.createdByUid || "—")}</td>
      </tr>
    `).join("");
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

  await loadSummaryAndTable();
}