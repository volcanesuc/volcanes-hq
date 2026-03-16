// /js/features/pickups/pickups.js
import { db } from "/js/auth/firebase.js";
import { watchAuth, getCurrentUserAccess } from "/js/auth/auth.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { guardPage } from "/js/page-guard.js";
import { loadHeader } from "/js/components/header.js";
import { loadPartialOnce } from "/js/ui/loadPartial.js";
import { APP_CONFIG } from "/js/config/config.js";

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
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

    modalMount: document.getElementById("modalMount"),
  };
}

function bindEvents() {
  $.pickupSearch?.addEventListener("input", renderUpcomingPickups);

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
      await setPaymentState(
        approveBtn.getAttribute("data-reg-id"),
        "approved"
      );
      return;
    }

    const rejectBtn = e.target.closest("[data-reject-payment]");
    if (rejectBtn) {
      await setPaymentState(
        rejectBtn.getAttribute("data-reg-id"),
        "rejected"
      );
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

function setRoleUI() {
  if (canEdit) {
    $.roleBadge.className = "badge text-bg-primary";
    $.roleBadge.textContent = "ADMIN";
    $.roleBadge.classList.remove("d-none");
    $.openCreatePickupBtn?.classList.remove("d-none");
    $.adminTabWrap?.classList.remove("d-none");
    $.pageSubtitle.textContent = "Administrá pickups y validá pagos";
  } else {
    $.roleBadge.className = "badge text-bg-secondary";
    $.roleBadge.textContent = "PLAYER";
    $.roleBadge.classList.remove("d-none");
    $.openCreatePickupBtn?.classList.add("d-none");
    $.adminTabWrap?.classList.add("d-none");
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
}

function getPickupRegs(pickupId) {
  return registrations.filter((r) => r.pickupId === pickupId);
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

    const regRows = regs.length
      ? regs.map((r) => `
          <div class="border rounded p-2 mb-2">
            <div class="d-flex justify-content-between flex-wrap gap-2">
              <div>
                <div class="fw-semibold">${escapeHtml(r.displayName || r.email || "—")}</div>
                <div class="text-muted small">${escapeHtml(r.email || "—")}</div>
                <div class="text-muted small">Tier: ${escapeHtml(r.pricingTierLabel || "—")} · Monto: ₡${Number(r.amountDue || 0)}</div>
              </div>
              <div class="d-flex gap-2 flex-wrap align-items-center">
                <span class="badge text-bg-dark">${escapeHtml(r.registrationStatus || "registered")}</span>
                <span class="badge ${getPaymentBadge(r.paymentStatus)}">${escapeHtml(r.paymentStatus || "pending")}</span>
                ${
                  r?.paymentProof?.downloadURL
                    ? `<a class="btn btn-sm btn-outline-secondary" href="${r.paymentProof.downloadURL}" target="_blank" rel="noopener">Comprobante</a>`
                    : ``
                }
                <button class="btn btn-sm btn-success" data-approve-payment="${escapeHtml(r.id)}">Aprobar</button>
                <button class="btn btn-sm btn-outline-danger" data-reject-payment="${escapeHtml(r.id)}">Rechazar</button>
              </div>
            </div>
          </div>
        `).join("")
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

      <div>${regRows}</div>
    `;

    $.adminPickupsList.appendChild(item);
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
      requiresPaymentProof: ui.requiresProof.checked === true,
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

async function setPaymentState(regId, status) {
  if (!canEdit || !regId) return;

  showLoader();
  try {
    await updateDoc(doc(db, COL_PICKUP_REGS, regId), {
      paymentStatus: status,
      "paymentProof.reviewedAt": serverTimestamp(),
      "paymentProof.reviewedBy": currentUser?.uid || null,
      updatedAt: serverTimestamp(),
    });

    await loadAllData();
    showAlert(status === "approved" ? "Pago aprobado." : "Pago rechazado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo actualizar el pago.", "danger");
  } finally {
    hideLoader();
  }
}