// /js/features/pickups/pickups.js
import { db } from "/js/auth/firebase.js";
import { watchAuth } from "/js/auth/auth.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { guardPage } from "/js/page-guard.js";
import { loadHeader } from "/js/components/header.js";
import { loadPartialOnce } from "/js/ui/loadPartial.js";
import { APP_CONFIG } from "/js/config/config.js";

import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  buildPickupPublicUrl,
  countConfirmedRegistrations,
  countWaitlistRegistrations,
  escapeHtml,
  fmtDateTime,
  getDefaultPickupPayload,
  getPaymentBadge,
  getPickupCapacity,
  getStatusBadge,
  parsePricingTiersInput,
  pricingTiersToTextarea,
  safeUrl,
  slugify,
} from "/js/features/pickups/pickups_shared.js";

const COL = APP_CONFIG.collections;
const COL_PICKUPS = COL.pickups;
const COL_PICKUP_REGS = COL.pickupRegistrations;

const PAYMENT_ENABLE_THRESHOLD = 0;

let $ = {};
let cfg = null;
let canEdit = false;
let pickups = [];
let registrations = [];
let currentUser = null;

const editorState = {
  id: null,
};

const { cfg: guardCfg, redirected } = await guardPage("pickups");
if (!redirected) {
  cfg = guardCfg;
  await loadHeader("pickups", cfg);
}

cacheDom();
bindEvents();

watchAuth(async (user) => {
  currentUser = user;
  showLoader();
  try {
    canEdit = cfg?.isAdmin === true;
    setRoleUI();
    await loadAllData();
  } finally {
    hideLoader();
    document.body.classList.remove("loading");
    document.documentElement.classList.remove("preload");
  }
});

function cacheDom() {
  $ = {
    pageSubtitle: document.getElementById("pageSubtitle"),
    roleBadge: document.getElementById("roleBadge"),
    alertBox: document.getElementById("alertBox"),

    pickupSearch: document.getElementById("pickupSearch"),
    refreshPickupsBtn: document.getElementById("refreshPickupsBtn"),
    openCreatePickupBtn: document.getElementById("openCreatePickupBtn"),

    upcomingPickupsList: document.getElementById("upcomingPickupsList"),
    upcomingPickupsEmpty: document.getElementById("upcomingPickupsEmpty"),

    myRegistrationsList: document.getElementById("myRegistrationsList"),
    myRegistrationsEmpty: document.getElementById("myRegistrationsEmpty"),

    adminTabWrap: document.getElementById("adminTabWrap"),
    adminPickupsList: document.getElementById("adminPickupsList"),
    adminPickupsEmpty: document.getElementById("adminPickupsEmpty"),

    participantsTabWrap: document.getElementById("participantsTabWrap"),
    participantsSearch: document.getElementById("participantsSearch"),
    participantsTableBody: document.getElementById("participantsTableBody"),
    participantsEmpty: document.getElementById("participantsEmpty"),

    modalMount: document.getElementById("modalMount"),
  };
}

function bindEvents() {
  $.pickupSearch?.addEventListener("input", renderUpcomingPickups);
  $.participantsSearch?.addEventListener("input", renderParticipantsTab);

  $.refreshPickupsBtn?.addEventListener("click", async () => {
    showLoader();
    try {
      await loadAllData();
    } finally {
      hideLoader();
    }
  });

  $.openCreatePickupBtn?.addEventListener("click", async () => {
    if (!canEdit) return;
    await openPickupEditor();
  });

  $.adminPickupsList?.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit-pickup]");
    if (editBtn) {
      await openPickupEditor(editBtn.getAttribute("data-edit-pickup"));
      return;
    }

    const approveBtn = e.target.closest("[data-approve-payment]");
    if (approveBtn) {
      await openPaymentDecisionDialog({
        regId: approveBtn.getAttribute("data-reg-id"),
        status: "approved",
      });
      return;
    }

    const rejectBtn = e.target.closest("[data-reject-payment]");
    if (rejectBtn) {
      await openPaymentDecisionDialog({
        regId: rejectBtn.getAttribute("data-reg-id"),
        status: "rejected",
      });
      return;
    }
  });
}

function showAlert(msg, type = "info") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.textContent = msg;
  $.alertBox.classList.remove("d-none");
}

function clearAlert() {
  $.alertBox?.classList.add("d-none");
}

function money(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: "CRC",
    maximumFractionDigits: 0,
  }).format(n);
}

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

function setRoleUI() {
  if (canEdit) {
    $.roleBadge.className = "badge text-bg-primary";
    $.roleBadge.textContent = "ADMIN";
    $.roleBadge.classList.remove("d-none");
    $.openCreatePickupBtn?.classList.remove("d-none");
    $.adminTabWrap?.classList.remove("d-none");
    $.participantsTabWrap?.classList.remove("d-none");
    $.pageSubtitle.textContent = "Administrá pickups y validá pagos";
  } else {
    $.roleBadge.className = "badge text-bg-secondary";
    $.roleBadge.textContent = "PLAYER";
    $.roleBadge.classList.remove("d-none");
    $.openCreatePickupBtn?.classList.add("d-none");
    $.adminTabWrap?.classList.add("d-none");
    $.participantsTabWrap?.classList.add("d-none");
    $.pageSubtitle.textContent = "Juegos abiertos y tus inscripciones";
  }
}

async function loadAllData() {
  const pickupsSnap = await getDocs(collection(db, COL_PICKUPS));
  pickups = pickupsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  pickups.sort((a, b) => {
    const da = a?.startAt?.toDate?.() ?? new Date(0);
    const dbb = b?.startAt?.toDate?.() ?? new Date(0);
    return da - dbb;
  });

  const regsSnap = await getDocs(collection(db, COL_PICKUP_REGS));
  registrations = regsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  renderUpcomingPickups();
  renderMyRegistrations();
  renderAdminPickups();
  renderParticipantsTab();
}

function getPickupRegs(pickupId) {
  return registrations.filter((r) => r.pickupId === pickupId);
}

function getRegistrationPickup(reg) {
  return pickups.find((p) => p.id === reg.pickupId) || null;
}

function isAttendanceLikeStatus(status) {
  return ["registered", "waitlist", "attended", "no_show"].includes(norm(status));
}

function isCancelledReg(reg) {
  return norm(reg?.registrationStatus) === "cancelled";
}

function isOutstandingPayment(reg) {
  if (!isAttendanceLikeStatus(reg?.registrationStatus)) return false;
  return ["pending", "submitted", "rejected"].includes(norm(reg?.paymentStatus));
}

function isApprovedPayment(reg) {
  return norm(reg?.paymentStatus) === "approved";
}

function isReviewPending(reg) {
  return norm(reg?.paymentStatus) === "submitted";
}

function isPickupPaymentEnabled(pickupId) {
  const regs = getPickupRegs(pickupId);
  const activeCount = regs.filter((r) => isAttendanceLikeStatus(r.registrationStatus)).length;
  return activeCount >= PAYMENT_ENABLE_THRESHOLD;
}

function getPickupFinancialKpis(pickupId) {
  const regs = getPickupRegs(pickupId);
  const paymentEnabled = isPickupPaymentEnabled(pickupId);

  const relevantRegs = regs.filter((r) => isAttendanceLikeStatus(r.registrationStatus));

  const expectedAmount = paymentEnabled
    ? relevantRegs.reduce((sum, r) => sum + Number(r.amountDue || 0), 0)
    : 0;

  const approvedAmount = paymentEnabled
    ? relevantRegs.filter((r) => isApprovedPayment(r)).reduce((sum, r) => sum + Number(r.amountDue || 0), 0)
    : 0;

  const pendingAmount = paymentEnabled
    ? relevantRegs.filter((r) => isOutstandingPayment(r)).reduce((sum, r) => sum + Number(r.amountDue || 0), 0)
    : 0;

  const reviewCount = paymentEnabled
    ? relevantRegs.filter((r) => isReviewPending(r)).length
    : 0;

  return {
    paymentEnabled,
    expectedAmount,
    approvedAmount,
    pendingAmount,
    reviewCount,
  };
}

function renderUpcomingPickups() {
  const term = String($.pickupSearch?.value || "").trim().toLowerCase();
  $.upcomingPickupsList.innerHTML = "";

  const filtered = pickups.filter((p) => {
    const hay = [
      p.title,
      p.venueName,
      p.venueAddress,
      p.slug,
      p.notes,
    ].join(" ").toLowerCase();

    return hay.includes(term);
  });

  if (!filtered.length) {
    $.upcomingPickupsEmpty?.classList.remove("d-none");
    return;
  }

  $.upcomingPickupsEmpty?.classList.add("d-none");

  filtered.forEach((p) => {
    const regs = getPickupRegs(p.id);
    const registered = countConfirmedRegistrations(regs);
    const waitlist = countWaitlistRegistrations(regs);
    const capacity = getPickupCapacity(p);
    const publicUrl = buildPickupPublicUrl(p);

    const col = document.createElement("div");
    col.className = "col-12 col-lg-6";

    col.innerHTML = `
      <div class="card h-100 shadow-sm">
        <div class="card-body">
          <div class="d-flex justify-content-between gap-2 align-items-start">
            <div>
              <div class="fw-semibold">${escapeHtml(p.title || "—")}</div>
              <div class="text-muted small">${escapeHtml(fmtDateTime(p.startAt))}</div>
              <div class="text-muted small">${escapeHtml(p.venueName || "Sin ubicación")}</div>
            </div>
            <span class="badge ${getStatusBadge(p.status)}">${escapeHtml(p.status || "draft")}</span>
          </div>

          <hr />

          <div class="row g-2">
            <div class="col-6">
              <div class="small text-muted">Inscritos</div>
              <div>${registered}</div>
            </div>
            <div class="col-6">
              <div class="small text-muted">Lista de espera</div>
              <div>${waitlist}</div>
            </div>
            <div class="col-12">
              <div class="small text-muted">Cupo</div>
              <div>${capacity === 0 ? "Sin límite" : capacity}</div>
            </div>
          </div>

          <div class="mt-3 d-flex gap-2 flex-wrap">
            <a class="btn btn-sm btn-outline-secondary" href="${publicUrl}" target="_blank" rel="noopener">Ver público</a>
            <button class="btn btn-sm btn-outline-primary" data-copy-url="${escapeHtml(publicUrl)}">Copiar link</button>
            ${canEdit ? `<button class="btn btn-sm btn-primary" data-edit-pickup-inline="${escapeHtml(p.id)}">Editar</button>` : ""}
          </div>
        </div>
      </div>
    `;

    $.upcomingPickupsList.appendChild(col);
  });

  $.upcomingPickupsList.querySelectorAll("[data-copy-url]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const path = btn.getAttribute("data-copy-url");
      const url = `${window.location.origin}${path}`;
      try {
        await navigator.clipboard.writeText(url);
        const old = btn.textContent;
        btn.textContent = "Copiado ✅";
        setTimeout(() => (btn.textContent = old), 1200);
      } catch {
        alert(url);
      }
    });
  });

  $.upcomingPickupsList.querySelectorAll("[data-edit-pickup-inline]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await openPickupEditor(btn.getAttribute("data-edit-pickup-inline"));
    });
  });
}

function renderMyRegistrations() {
  $.myRegistrationsList.innerHTML = "";

  const mine = registrations
    .filter((r) => r.uid && r.uid === currentUser?.uid)
    .sort((a, b) => {
      const pa = pickups.find((x) => x.id === a.pickupId);
      const pb = pickups.find((x) => x.id === b.pickupId);
      const da = pa?.startAt?.toDate?.() ?? new Date(0);
      const dbb = pb?.startAt?.toDate?.() ?? new Date(0);
      return da - dbb;
    });

  if (!mine.length) {
    $.myRegistrationsEmpty?.classList.remove("d-none");
    return;
  }

  $.myRegistrationsEmpty?.classList.add("d-none");

  mine.forEach((r) => {
    const pickup = pickups.find((x) => x.id === r.pickupId);
    if (!pickup) return;

    const item = document.createElement("div");
    item.className = "list-group-item";

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <div class="fw-semibold">${escapeHtml(pickup.title || "—")}</div>
          <div class="text-muted small">${escapeHtml(fmtDateTime(pickup.startAt))}</div>
          <div class="text-muted small">${escapeHtml(pickup.venueName || "—")}</div>
        </div>

        <div class="d-flex gap-2 flex-wrap align-items-center">
          <span class="badge text-bg-dark">${escapeHtml(r.registrationStatus || "registered")}</span>
          <span class="badge ${getPaymentBadge(r.paymentStatus)}">${escapeHtml(r.paymentStatus || "pending")}</span>
          <a class="btn btn-sm btn-outline-secondary" href="${buildPickupPublicUrl(pickup)}" target="_blank">Ver pickup</a>
        </div>
      </div>
    `;

    $.myRegistrationsList.appendChild(item);
  });
}

function renderAdminPickups() {
  if (!canEdit || !$.adminPickupsList) return;

  $.adminPickupsList.innerHTML = "";

  if (!pickups.length) {
    $.adminPickupsEmpty?.classList.remove("d-none");
    return;
  }

  $.adminPickupsEmpty?.classList.add("d-none");

  pickups.forEach((p) => {
    const regs = getPickupRegs(p.id);
    const financials = getPickupFinancialKpis(p.id);

    const regRows = regs.length
      ? regs.map((r) => {
          const cancelled = isCancelledReg(r);
          const paymentButtonsVisible = !cancelled && financials.paymentEnabled;

          return `
            <div
              class="border rounded p-2 mb-2"
              style="${cancelled ? "opacity:.55;background:#f3f4f6;border-color:#d1d5db;" : ""}"
            >
              <div class="d-flex justify-content-between flex-wrap gap-2">
                <div>
                  <div class="fw-semibold">
                    ${escapeHtml(r.displayName || r.email || "—")}
                    ${cancelled ? `<span class="badge text-bg-secondary ms-2">Cancelada</span>` : ``}
                  </div>
                  <div class="text-muted small">${escapeHtml(r.email || "—")}</div>
                  <div class="text-muted small">
                    Tier: ${escapeHtml(r.pricingTierLabel || "—")}
                    · Monto: ${money(r.amountDue || 0)}
                  </div>
                  ${
                    !financials.paymentEnabled
                      ? `<div class="small text-warning mt-1">Cobro pendiente de habilitar hasta llegar a ${PAYMENT_ENABLE_THRESHOLD} inscritos.</div>`
                      : ``
                  }
                </div>

                <div class="d-flex gap-2 flex-wrap align-items-center">
                  <span class="badge text-bg-dark">${escapeHtml(r.registrationStatus || "registered")}</span>
                  <span class="badge ${getPaymentBadge(r.paymentStatus)}">${escapeHtml(r.paymentStatus || "pending")}</span>
                  ${
                    r?.paymentProof?.downloadURL
                      ? `<a class="btn btn-sm btn-outline-secondary" href="${r.paymentProof.downloadURL}" target="_blank" rel="noopener">Comprobante</a>`
                      : ``
                  }
                  ${
                    paymentButtonsVisible
                      ? `
                        <button class="btn btn-sm btn-success" data-approve-payment="${escapeHtml(r.id)}">Aprobar</button>
                        <button class="btn btn-sm btn-outline-danger" data-reject-payment="${escapeHtml(r.id)}">Rechazar</button>
                      `
                      : ``
                  }
                </div>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="text-muted small">Sin inscripciones todavía.</div>`;

    const item = document.createElement("div");
    item.className = "list-group-item";

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3">
        <div>
          <div class="fw-semibold">${escapeHtml(p.title || "—")}</div>
          <div class="text-muted small">${escapeHtml(fmtDateTime(p.startAt))}</div>
          <div class="text-muted small">${escapeHtml(p.venueName || "—")}</div>
        </div>

        <div class="d-flex gap-2 flex-wrap">
          <a class="btn btn-sm btn-outline-secondary" href="${buildPickupPublicUrl(p)}" target="_blank">Ver público</a>
          <button class="btn btn-sm btn-primary" data-edit-pickup="${escapeHtml(p.id)}">Editar</button>
        </div>
      </div>

      <div class="row g-2 mb-3">
        <div class="col-6 col-lg-3">
          <div class="border rounded p-2 h-100">
            <div class="small text-muted">Monto esperado</div>
            <div class="fw-semibold">${money(financials.expectedAmount)}</div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="border rounded p-2 h-100">
            <div class="small text-muted">Monto aprobado</div>
            <div class="fw-semibold">${money(financials.approvedAmount)}</div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="border rounded p-2 h-100">
            <div class="small text-muted">Pendiente / moroso</div>
            <div class="fw-semibold">${money(financials.pendingAmount)}</div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="border rounded p-2 h-100">
            <div class="small text-muted">Por revisar</div>
            <div class="fw-semibold">${financials.reviewCount}</div>
            <div class="small ${financials.paymentEnabled ? "text-success" : "text-warning"}">
              ${financials.paymentEnabled ? "Cobro habilitado" : `Se habilita en ${PAYMENT_ENABLE_THRESHOLD}`}
            </div>
          </div>
        </div>
      </div>

      <div>${regRows}</div>
    `;

    $.adminPickupsList.appendChild(item);
  });
}

function buildParticipantsRows() {
  const map = new Map();

  registrations.forEach((r) => {
    const key = r.uid || `${norm(r.email)}::${norm(r.displayName)}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        uid: r.uid || null,
        displayName: r.displayName || r.email || "—",
        email: r.email || "",
        userCategory: r.userCategory || "—",
        pickupsCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        totalAmount: 0,
        outstandingAmount: 0,
        cancelledCount: 0,
      });
    }

    const row = map.get(key);

    if (isCancelledReg(r)) {
      row.cancelledCount += 1;
      return;
    }

    if (isAttendanceLikeStatus(r.registrationStatus)) {
      row.pickupsCount += 1;
      row.totalAmount += Number(r.amountDue || 0);
    }

    if (isApprovedPayment(r)) {
      row.approvedCount += 1;
    }

    if (isOutstandingPayment(r)) {
      row.pendingCount += 1;
      row.outstandingAmount += Number(r.amountDue || 0);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.pickupsCount !== a.pickupsCount) return b.pickupsCount - a.pickupsCount;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""), "es", { sensitivity: "base" });
  });
}

function renderParticipantsTab() {
  if (!canEdit || !$.participantsTableBody) return;

  const term = norm($.participantsSearch?.value || "");
  const rows = buildParticipantsRows().filter((row) => {
    const hay = [
      row.displayName,
      row.email,
      row.userCategory,
    ].join(" ").toLowerCase();
    return hay.includes(term);
  });

  $.participantsTableBody.innerHTML = "";

  if (!rows.length) {
    $.participantsEmpty?.classList.remove("d-none");
    return;
  }

  $.participantsEmpty?.classList.add("d-none");

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="fw-semibold">${escapeHtml(row.displayName || "—")}</div>
        <div class="small text-muted">${escapeHtml(row.email || "—")}</div>
      </td>
      <td>${escapeHtml(row.userCategory || "—")}</td>
      <td>${row.pickupsCount}</td>
      <td>${row.approvedCount}</td>
      <td>${row.pendingCount}</td>
      <td>${money(row.outstandingAmount)}</td>
      <td>${money(row.totalAmount)}</td>
    `;
    $.participantsTableBody.appendChild(tr);
  });
}

async function ensurePickupEditorModal() {
  await loadPartialOnce("/partials/pickup_editor_modal.html", "modalMount");

  const modalEl = document.getElementById("pickupEditorModal");
  const formEl = document.getElementById("pickupEditorForm");

  const ui = {
    modalEl,
    formEl,
    titleEl: document.getElementById("pickupEditorTitle"),
    id: document.getElementById("pickupEditorId"),
    title: document.getElementById("peTitle"),
    status: document.getElementById("peStatus"),
    startAt: document.getElementById("peStartAt"),
    endAt: document.getElementById("peEndAt"),
    venueName: document.getElementById("peVenueName"),
    venueAddress: document.getElementById("peVenueAddress"),
    mapsUrl: document.getElementById("peMapsUrl"),
    capacity: document.getElementById("peCapacity"),
    cancelHours: document.getElementById("peCancelHours"),
    allowWaitlist: document.getElementById("peAllowWaitlist"),
    isPublic: document.getElementById("peIsPublic"),
    requiresProof: document.getElementById("peRequiresProof"),
    pricingTiers: document.getElementById("pePricingTiers"),
    notes: document.getElementById("peNotes"),
  };

  if (!ensurePickupEditorModal._bound) {
    ui.formEl?.addEventListener("submit", async (e) => {
      e.preventDefault();
      showLoader();
      try {
        await savePickupEditor(ui);
        bootstrap.Modal.getOrCreateInstance(ui.modalEl).hide();
        await loadAllData();
      } finally {
        hideLoader();
      }
    });
    ensurePickupEditorModal._bound = true;
  }

  return ui;
}

function ensurePaymentDecisionModal() {
  let modalEl = document.getElementById("pickupPaymentDecisionModal");
  if (modalEl) return modalEl;

  modalEl = document.createElement("div");
  modalEl.className = "modal fade";
  modalEl.id = "pickupPaymentDecisionModal";
  modalEl.tabIndex = -1;
  modalEl.setAttribute("aria-hidden", "true");

  modalEl.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title mb-0" id="pickupPaymentDecisionTitle">Confirmar acción</h5>
            <small class="text-muted" id="pickupPaymentDecisionSubtitle">Revisá el comprobante antes de continuar.</small>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <div id="pickupPaymentDecisionBody"></div>
          <div class="mt-3">
            <label for="pickupPaymentDecisionNote" class="form-label">Nota admin (opcional)</label>
            <textarea id="pickupPaymentDecisionNote" class="form-control" rows="3" placeholder="Comentario de validación…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-primary" id="pickupPaymentDecisionConfirmBtn">Confirmar</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);
  return modalEl;
}

function toDatetimeLocalValue(value) {
  const d = value?.toDate?.() ?? (value ? new Date(value) : null);
  if (!d || isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openPickupEditor(id = null) {
  const ui = await ensurePickupEditorModal();
  editorState.id = id;

  if (!id) {
    const base = getDefaultPickupPayload();
    ui.titleEl.textContent = "Nuevo pickup";
    ui.id.value = "";
    ui.title.value = base.title;
    ui.status.value = base.status;
    ui.startAt.value = "";
    ui.endAt.value = "";
    ui.venueName.value = base.venueName;
    ui.venueAddress.value = base.venueAddress;
    ui.mapsUrl.value = base.mapsUrl;
    ui.capacity.value = base.capacity;
    ui.cancelHours.value = base.rules.cancellationDeadlineHours;
    ui.allowWaitlist.checked = base.allowWaitlist;
    ui.isPublic.checked = base.isPublic;
    ui.requiresProof.checked = base.rules.requiresPaymentProof;
    ui.pricingTiers.value = pricingTiersToTextarea(base.pricingTiers);
    ui.notes.value = base.notes;
  } else {
    const p = pickups.find((x) => x.id === id);
    if (!p) return;

    ui.titleEl.textContent = "Editar pickup";
    ui.id.value = p.id;
    ui.title.value = p.title || "";
    ui.status.value = p.status || "draft";
    ui.startAt.value = toDatetimeLocalValue(p.startAt);
    ui.endAt.value = toDatetimeLocalValue(p.endAt);
    ui.venueName.value = p.venueName || "";
    ui.venueAddress.value = p.venueAddress || "";
    ui.mapsUrl.value = p.mapsUrl || "";
    ui.capacity.value = Number(p.capacity ?? APP_CONFIG.pickups.defaultCapacity ?? 50);
    ui.cancelHours.value = Number(p?.rules?.cancellationDeadlineHours ?? 6);
    ui.allowWaitlist.checked = p.allowWaitlist !== false;
    ui.isPublic.checked = p.isPublic !== false;
    ui.requiresProof.checked = p?.rules?.requiresPaymentProof !== false;
    ui.pricingTiers.value = pricingTiersToTextarea(p.pricingTiers || []);
    ui.notes.value = p.notes || "";
  }

  bootstrap.Modal.getOrCreateInstance(ui.modalEl).show();
}

async function savePickupEditor(ui) {
  clearAlert();

  const id = editorState.id;
  const title = String(ui.title.value || "").trim();

  if (!title) {
    showAlert("El pickup necesita título.", "warning");
    return;
  }

  const tiers = parsePricingTiersInput(ui.pricingTiers.value);
  const startAt = ui.startAt.value ? Timestamp.fromDate(new Date(ui.startAt.value)) : null;
  const endAt = ui.endAt.value ? Timestamp.fromDate(new Date(ui.endAt.value)) : null;

  const payload = {
    title,
    slug: slugify(title),
    status: ui.status.value || "draft",
    isPublic: ui.isPublic.checked === true,

    startAt,
    endAt,

    venueName: String(ui.venueName.value || "").trim(),
    venueAddress: String(ui.venueAddress.value || "").trim(),
    mapsUrl: safeUrl(ui.mapsUrl.value),

    capacity: Number(ui.capacity.value || 0),
    allowWaitlist: ui.allowWaitlist.checked === true,

    rules: {
      cancellationDeadlineHours: Number(ui.cancelHours.value || 0),
      requiresProof: ui.requiresProof.checked === true,
      allowPublicList: true,
    },

    pricingTiers: tiers,
    notes: String(ui.notes.value || "").trim(),
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.uid || null,
  };

  if (!id) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = currentUser?.uid || null;
    await addDoc(collection(db, COL_PICKUPS), payload);
    showAlert("Pickup creado ✅", "success");
    return;
  }

  await setDoc(doc(db, COL_PICKUPS, id), payload, { merge: true });
  showAlert("Pickup actualizado ✅", "success");
}

async function openPaymentDecisionDialog({ regId, status }) {
  if (!canEdit || !regId) return;

  const reg = registrations.find((r) => r.id === regId);
  if (!reg) {
    showAlert("No se encontró el registro.", "warning");
    return;
  }

  const pickup = getRegistrationPickup(reg);
  const financials = getPickupFinancialKpis(reg.pickupId);

  if (isCancelledReg(reg)) {
    showAlert("La inscripción está cancelada. No se puede validar pago.", "warning");
    return;
  }

  if (!financials.paymentEnabled) {
    showAlert(`El cobro se habilita hasta llegar a ${PAYMENT_ENABLE_THRESHOLD} inscritos.`, "warning");
    return;
  }

  const modalEl = ensurePaymentDecisionModal();
  const titleEl = modalEl.querySelector("#pickupPaymentDecisionTitle");
  const subtitleEl = modalEl.querySelector("#pickupPaymentDecisionSubtitle");
  const bodyEl = modalEl.querySelector("#pickupPaymentDecisionBody");
  const noteEl = modalEl.querySelector("#pickupPaymentDecisionNote");
  const confirmBtn = modalEl.querySelector("#pickupPaymentDecisionConfirmBtn");

  titleEl.textContent = status === "approved" ? "Aprobar pago" : "Rechazar pago";
  subtitleEl.textContent = status === "approved"
    ? "Esto marcará el pago como aprobado."
    : "Esto marcará el pago como rechazado.";

  bodyEl.innerHTML = `
    <div class="border rounded p-3">
      <div class="fw-semibold">${escapeHtml(reg.displayName || reg.email || "—")}</div>
      <div class="small text-muted">${escapeHtml(reg.email || "—")}</div>
      <div class="small text-muted">Pickup: ${escapeHtml(pickup?.title || "—")}</div>
      <div class="small text-muted">Tier: ${escapeHtml(reg.pricingTierLabel || "—")} · ${money(reg.amountDue || 0)}</div>
      <div class="small text-muted">Estado actual: ${escapeHtml(reg.paymentStatus || "pending")}</div>
      ${
        reg?.paymentProof?.downloadURL
          ? `<div class="mt-2"><a class="btn btn-sm btn-outline-secondary" href="${reg.paymentProof.downloadURL}" target="_blank" rel="noopener">Abrir comprobante</a></div>`
          : `<div class="small text-warning mt-2">No hay comprobante adjunto.</div>`
      }
    </div>
  `;

  noteEl.value = "";
  confirmBtn.className = status === "approved" ? "btn btn-success" : "btn btn-danger";
  confirmBtn.textContent = status === "approved" ? "Aprobar pago" : "Rechazar pago";

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    try {
      await setPaymentState(regId, status, noteEl.value);
      modal.hide();
    } finally {
      confirmBtn.disabled = false;
    }
  };

  modal.show();
}

async function setPaymentState(regId, status, adminNote = "") {
  if (!canEdit || !regId) return;

  showLoader();
  try {
    const payload = {
      paymentStatus: status,
      "paymentProof.reviewedAt": serverTimestamp(),
      "paymentProof.reviewedBy": currentUser?.uid || null,
      updatedAt: serverTimestamp(),
    };

    if (adminNote && String(adminNote).trim()) {
      payload.adminNote = String(adminNote).trim();
    }

    await updateDoc(doc(db, COL_PICKUP_REGS, regId), payload);

    await loadAllData();
    showAlert(status === "approved" ? "Pago aprobado." : "Pago rechazado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo actualizar el pago.", "danger");
  } finally {
    hideLoader();
  }
}