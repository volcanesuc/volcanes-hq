// /js/public/pickup_view.js
import { db, storage, auth } from "/js/auth/firebase.js";
import { loginWithGoogle } from "/js/auth/auth.js";
import { initPublicMinimalHeader } from "/js/components/public-minimal-header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { APP_CONFIG } from "/js/config/config.js";

import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  canUserUsePickups,
  countConfirmedRegistrations,
  escapeHtml,
  fmtDateTime,
  getPickupCapacity,
  getStatusBadge,
  canCancelWithoutPenalty,
} from "/js/features/pickups/pickups_shared.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_PICKUPS = COL.pickups;
const COL_PICKUP_REGS = COL.pickupRegistrations;

const $ = (id) => document.getElementById(id);

const pvTitle = $("pvTitle");
const pvSubtitle = $("pvSubtitle");
const pvStatus = $("pvStatus");
const pvStartAt = $("pvStartAt");
const pvVenue = $("pvVenue");
const pvCapacity = $("pvCapacity");
const pvNotes = $("pvNotes");
const pvPricing = $("pvPricing");
const pvList = $("pvList");
const pvListEmpty = $("pvListEmpty");
const pvJoinBtn = $("pvJoinBtn");
const pvShareBtn = $("pvShareBtn");
const pvError = $("pvError");
const pvInfo = $("pvInfo");

let currentPickup = null;
let currentRegs = [];
let currentUser = null;
let currentUserDoc = null;
let currentUserRegistration = null;

/* =========================
   Messages
========================= */
function showError(msg) {
  pvError.textContent = msg;
  pvError.classList.remove("d-none");
}

function showInfo(msg) {
  pvInfo.textContent = msg;
  pvInfo.classList.remove("d-none");
}

function clearMessages() {
  pvError.classList.add("d-none");
  pvInfo.classList.add("d-none");
}

/* =========================
   Render helpers
========================= */
function formatNotes(text) {
  if (!text) return "—";
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function registrationRow(r, idx) {
  return `
    <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
      <div class="d-flex align-items-start gap-3">
        <div class="fw-bold text-muted" style="min-width: 1.5rem;">${idx + 1}.</div>
        <div>
          <div class="fw-semibold">${escapeHtml(r.displayName || "—")}</div>
          <div class="small text-muted">${escapeHtml(r.pricingTierLabel || "—")}</div>
        </div>
      </div>
      <span class="badge text-bg-dark">${escapeHtml(r.registrationStatus || "registered")}</span>
    </div>
  `;
}

function renderPricing(pickup) {
  const tiers = Array.isArray(pickup?.pricingTiers) ? pickup.pricingTiers : [];
  pvPricing.innerHTML = tiers.length
    ? tiers.map((t) => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <span>${escapeHtml(t.label || "—")}</span>
          <strong>₡${Number(t.amount || 0)}</strong>
        </div>
      `).join("")
    : `<div class="text-muted small">No hay costos definidos todavía.</div>`;
}

function renderList() {
  pvList.innerHTML = "";

  if (!currentRegs.length) {
    pvListEmpty.classList.remove("d-none");
    return;
  }

  pvListEmpty.classList.add("d-none");

  const rows = currentRegs
    .filter((r) => r.registrationStatus !== "cancelled")
    .sort((a, b) => {
      const ta = a.createdAt?.toDate?.() ?? new Date(0);
      const tb = b.createdAt?.toDate?.() ?? new Date(0);
      return ta - tb;
    });

  pvList.innerHTML = rows.map((r, idx) => registrationRow(r, idx)).join("");
}

/* =========================
   Data load
========================= */
async function loadPickupBySlug(slug) {
  const qy = query(
    collection(db, COL_PICKUPS),
    where("slug", "==", slug),
    where("isPublic", "==", true)
  );

  const snap = await getDocs(qy);

  if (snap.empty) return null;

  const first = snap.docs[0];
  return { id: first.id, ...first.data() };
}

async function loadUserDoc(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, COL_USERS, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function loadRegs(pickupId) {
  const qy = query(collection(db, COL_PICKUP_REGS), where("pickupId", "==", pickupId));
  const snap = await getDocs(qy);
  currentRegs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  refreshCurrentUserRegistration();
  renderList();
}

function refreshCurrentUserRegistration() {
  currentUserRegistration = currentUser?.uid
    ? currentRegs.find((r) => r.uid === currentUser.uid && r.registrationStatus !== "cancelled") || null
    : null;
  syncActionButtons();
}

/* =========================
   Upload proof
========================= */
async function uploadProof(file, pickupId, uid) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `pickups/${pickupId}/proofs/${uid}_${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);

  await uploadBytes(ref, file, {
    contentType: file.type || "image/jpeg",
    cacheControl: "no-cache",
  });

  const downloadURL = await getDownloadURL(ref);
  return { storagePath: path, downloadURL };
}

/* =========================
   Join dialog
========================= */
function ensureJoinDialog() {
  let dlg = document.getElementById("pickupJoinDialog");
  if (dlg) return dlg;

  dlg = document.createElement("dialog");
  dlg.id = "pickupJoinDialog";
  dlg.style.maxWidth = "680px";
  dlg.style.width = "calc(100% - 2rem)";
  dlg.style.border = "0";
  dlg.style.borderRadius = "18px";
  dlg.style.padding = "0";
  dlg.style.boxShadow = "0 24px 80px rgba(0,0,0,.35)";

  dlg.innerHTML = `
    <form method="dialog" id="pickupJoinDialogForm" style="margin:0;">
      <div style="padding:1rem 1rem 0.75rem;border-bottom:1px solid #e9ecef;display:flex;justify-content:space-between;gap:1rem;align-items:start;">
        <div>
          <div style="font-weight:700;font-size:1.05rem;" id="pickupJoinDialogTitle">Unirme al pickup</div>
          <div class="text-muted small" id="pickupJoinDialogSubtitle">Elegí tu tarifa. El comprobante es opcional y lo podés subir luego.</div>
        </div>
        <button type="button" id="pickupJoinDialogClose" class="btn btn-sm btn-outline-secondary">Cerrar</button>
      </div>

      <div style="padding:1rem;">
        <div class="mb-3">
          <div class="small text-muted mb-2">Elegí una tarifa</div>
          <div id="pickupJoinTierList" class="d-grid gap-2"></div>
          <div id="pickupJoinTierError" class="small text-danger mt-2 d-none"></div>
        </div>

        <div class="mb-3" id="pickupJoinProofWrap">
          <label for="pickupJoinProofFile" class="form-label">Comprobante (opcional)</label>
          <input id="pickupJoinProofFile" type="file" accept="image/*" class="form-control" />
          <div id="pickupJoinProofHelp" class="form-text">Podés subirlo ahora o después desde tus botones de inscripción.</div>
          <div id="pickupJoinProofStatus" class="small mt-2 text-muted d-none"></div>
        </div>

        <div id="pickupJoinSummary" class="small text-muted"></div>
      </div>

      <div style="padding:0.75rem 1rem 1rem;border-top:1px solid #e9ecef;display:flex;justify-content:flex-end;gap:.5rem;">
        <button type="button" id="pickupJoinCancelBtn" class="btn btn-outline-secondary">Cancelar</button>
        <button type="submit" id="pickupJoinSubmitBtn" class="btn btn-primary">Confirmar inscripción</button>
      </div>
    </form>
  `;

  document.body.appendChild(dlg);

  dlg.querySelector("#pickupJoinDialogClose")?.addEventListener("click", () => dlg.close());
  dlg.querySelector("#pickupJoinCancelBtn")?.addEventListener("click", () => dlg.close());

  return dlg;
}

function ensurePayDialog() {
  let dlg = document.getElementById("pickupPayDialog");
  if (dlg) return dlg;

  dlg = document.createElement("dialog");
  dlg.id = "pickupPayDialog";
  dlg.style.maxWidth = "560px";
  dlg.style.width = "calc(100% - 2rem)";
  dlg.style.border = "0";
  dlg.style.borderRadius = "18px";
  dlg.style.padding = "0";
  dlg.style.boxShadow = "0 24px 80px rgba(0,0,0,.35)";

  dlg.innerHTML = `
    <form method="dialog" id="pickupPayDialogForm" style="margin:0;">
      <div style="padding:1rem 1rem 0.75rem;border-bottom:1px solid #e9ecef;display:flex;justify-content:space-between;gap:1rem;align-items:start;">
        <div>
          <div style="font-weight:700;font-size:1.05rem;">Subir comprobante</div>
          <div class="text-muted small">Adjuntá tu screenshot de pago para este pickup.</div>
        </div>
        <button type="button" id="pickupPayDialogClose" class="btn btn-sm btn-outline-secondary">Cerrar</button>
      </div>

      <div style="padding:1rem;">
        <div class="mb-3">
          <label for="pickupPayProofFile" class="form-label">Comprobante</label>
          <input id="pickupPayProofFile" type="file" accept="image/*" class="form-control" />
          <div id="pickupPayProofStatus" class="small mt-2 text-muted d-none"></div>
        </div>
      </div>

      <div style="padding:0.75rem 1rem 1rem;border-top:1px solid #e9ecef;display:flex;justify-content:flex-end;gap:.5rem;">
        <button type="button" id="pickupPayCancelBtn" class="btn btn-outline-secondary">Cancelar</button>
        <button type="submit" id="pickupPaySubmitBtn" class="btn btn-primary">Subir comprobante</button>
      </div>
    </form>
  `;

  document.body.appendChild(dlg);

  dlg.querySelector("#pickupPayDialogClose")?.addEventListener("click", () => dlg.close());
  dlg.querySelector("#pickupPayCancelBtn")?.addEventListener("click", () => dlg.close());

  return dlg;
}

function setJoinProofStatus(message = "", type = "muted") {
  const el = document.getElementById("pickupJoinProofStatus");
  if (!el) return;

  if (!message) {
    el.className = "small mt-2 text-muted d-none";
    el.textContent = "";
    return;
  }

  const cls =
    type === "danger" ? "text-danger" :
    type === "success" ? "text-success" :
    type === "warning" ? "text-warning" :
    "text-muted";

  el.className = `small mt-2 ${cls}`;
  el.textContent = message;
}

function setPayProofStatus(message = "", type = "muted") {
  const el = document.getElementById("pickupPayProofStatus");
  if (!el) return;

  if (!message) {
    el.className = "small mt-2 text-muted d-none";
    el.textContent = "";
    return;
  }

  const cls =
    type === "danger" ? "text-danger" :
    type === "success" ? "text-success" :
    type === "warning" ? "text-warning" :
    "text-muted";

  el.className = `small mt-2 ${cls}`;
  el.textContent = message;
}

function buildSingleSelectCheckboxes(tiers = []) {
  return tiers.map((t, idx) => `
    <label class="border rounded p-3 d-flex justify-content-between align-items-center gap-3" style="cursor:pointer;">
      <div class="d-flex align-items-center gap-2">
        <input
          type="checkbox"
          class="form-check-input m-0"
          name="pickupTierCheckbox"
          value="${escapeHtml(t.id || "")}"
          data-tier-index="${idx}"
        />
        <div>
          <div class="fw-semibold">${escapeHtml(t.label || "—")}</div>
          <div class="small text-muted">Monto a pagar</div>
        </div>
      </div>
      <div class="fw-semibold">₡${Number(t.amount || 0)}</div>
    </label>
  `).join("");
}

function bindSingleSelectCheckboxes(container) {
  const inputs = Array.from(container.querySelectorAll('input[name="pickupTierCheckbox"]'));
  inputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        inputs.forEach((other) => {
          if (other !== input) other.checked = false;
        });
      }
      updateJoinDialogSummary();
    });
  });
}

function getSelectedTierFromDialog() {
  const checked = document.querySelector('#pickupJoinTierList input[name="pickupTierCheckbox"]:checked');
  if (!checked || !currentPickup) return null;

  const idx = Number(checked.getAttribute("data-tier-index"));
  const tiers = Array.isArray(currentPickup.pricingTiers) ? currentPickup.pricingTiers : [];
  return Number.isInteger(idx) && idx >= 0 && idx < tiers.length ? tiers[idx] : null;
}

function updateJoinDialogSummary() {
  const summary = document.getElementById("pickupJoinSummary");
  if (!summary || !currentPickup) return;

  const tier = getSelectedTierFromDialog();

  summary.textContent = tier
    ? `Tarifa seleccionada: ${tier.label} · ₡${Number(tier.amount || 0)}`
    : "Seleccioná una tarifa para continuar.";
}

function openJoinDialog() {
  const dlg = ensureJoinDialog();
  const tierList = dlg.querySelector("#pickupJoinTierList");
  const proofWrap = dlg.querySelector("#pickupJoinProofWrap");
  const proofInput = dlg.querySelector("#pickupJoinProofFile");
  const tierError = dlg.querySelector("#pickupJoinTierError");

  const tiers = Array.isArray(currentPickup?.pricingTiers) ? currentPickup.pricingTiers : [];
  tierList.innerHTML = buildSingleSelectCheckboxes(tiers);
  bindSingleSelectCheckboxes(tierList);

  tierError.classList.add("d-none");
  tierError.textContent = "";

  proofInput.value = "";
  setJoinProofStatus("");

  proofWrap.style.display = "";

  proofInput.onchange = () => {
    const file = proofInput.files?.[0] || null;
    if (!file) {
      setJoinProofStatus("");
      return;
    }
    setJoinProofStatus(`Archivo listo: ${file.name}`, "muted");
  };

  updateJoinDialogSummary();

  const form = dlg.querySelector("#pickupJoinDialogForm");
  form.onsubmit = async (ev) => {
    ev.preventDefault();

    const selectedTier = getSelectedTierFromDialog();
    if (!selectedTier) {
      tierError.textContent = "Seleccioná una sola tarifa.";
      tierError.classList.remove("d-none");
      return;
    }

    const file = proofInput.files?.[0] || null;

    dlg.close();
    await submitPickupJoin({ selectedTier, file });
  };

  dlg.showModal();
}

function openPayDialog() {
  if (!currentUserRegistration?.id) {
    showError("No se encontró tu inscripción.");
    return;
  }

  const dlg = ensurePayDialog();
  const proofInput = dlg.querySelector("#pickupPayProofFile");
  const form = dlg.querySelector("#pickupPayDialogForm");

  proofInput.value = "";
  setPayProofStatus("");

  proofInput.onchange = () => {
    const file = proofInput.files?.[0] || null;
    if (!file) {
      setPayProofStatus("");
      return;
    }
    setPayProofStatus(`Archivo listo: ${file.name}`, "muted");
  };

  form.onsubmit = async (ev) => {
    ev.preventDefault();

    const file = proofInput.files?.[0] || null;
    if (!file) {
      setPayProofStatus("Seleccioná un comprobante.", "danger");
      return;
    }

    dlg.close();
    await submitPaymentProof(file);
  };

  dlg.showModal();
}

/* =========================
   Join / pay / cancel actions
========================= */
async function joinPickup() {
  clearMessages();

  if (!currentPickup) return;

  if (!currentUser) {
    await loginWithGoogle({
      dashboardPath: "/dashboard.html",
      registerPath: "/public/register.html?google=1",
      memberStatusPath: "/member_status.html",
      landingPath: `/public/pickup.html?slug=${encodeURIComponent(currentPickup?.slug || "")}`,
    });
    return;
  }

  if (!currentUserDoc?.onboardingComplete) {
    window.location.href = "/public/register.html";
    return;
  }

  if (!canUserUsePickups(currentUserDoc)) {
    showError("Tu cuenta todavía no puede usar Pickups.");
    return;
  }

  if (currentUserRegistration) {
    showInfo("Ya estás inscrito en este pickup.");
    return;
  }

  openJoinDialog();
}

async function submitPickupJoin({ selectedTier, file }) {
  clearMessages();

  let paymentProof = null;

  if (file) {
    showLoader("Subiendo comprobante…");
    try {
      paymentProof = await uploadProof(file, currentPickup.id, currentUser.uid);
    } finally {
      hideLoader();
    }
  }

  const regsRegistered = countConfirmedRegistrations(currentRegs);
  const capacity = getPickupCapacity(currentPickup);

  const registrationStatus =
    capacity !== 0 && regsRegistered >= capacity && currentPickup.allowWaitlist === true
      ? "waitlist"
      : "registered";

  await addDoc(collection(db, COL_PICKUP_REGS), {
    pickupId: currentPickup.id,
    uid: currentUser.uid,

    displayName:
      `${currentUserDoc?.profile?.firstName || ""} ${currentUserDoc?.profile?.lastName || ""}`.trim() ||
      currentUserDoc?.displayName ||
      currentUser?.displayName ||
      currentUser?.email ||
      "Usuario",

    email: currentUserDoc?.email || currentUser?.email || "",
    phone: currentUserDoc?.profile?.phone || currentUserDoc?.phone || "",

    userCategory: currentUserDoc?.isPlayerActive === true
      ? "player"
      : (currentUserDoc?.associationStatus === "active" ? "member" : "pickup_only"),

    pricingTierId: selectedTier.id,
    pricingTierLabel: selectedTier.label,
    amountDue: Number(selectedTier.amount || 0),

    registrationStatus,
    paymentStatus: paymentProof ? "submitted" : "pending",

    paymentProof: paymentProof
      ? {
          storagePath: paymentProof.storagePath,
          downloadURL: paymentProof.downloadURL,
          uploadedAt: serverTimestamp(),
          reviewedAt: null,
          reviewedBy: null,
        }
      : null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await loadRegs(currentPickup.id);
  } catch (err) {
    console.warn("Lista pública no disponible:", err);
    currentRegs = [];
    refreshCurrentUserRegistration();
    renderList();
  }

  showInfo(
    registrationStatus === "waitlist"
      ? "Quedaste en lista de espera."
      : "Te registraste correctamente."
  );
}

async function submitPaymentProof(file) {
  clearMessages();

  if (!currentPickup || !currentUserRegistration?.id || !currentUser?.uid) {
    showError("No se pudo preparar la subida del comprobante.");
    return;
  }

  showLoader("Subiendo comprobante…");
  try {
    const paymentProof = await uploadProof(file, currentPickup.id, currentUser.uid);

    await updateDoc(doc(db, COL_PICKUP_REGS, currentUserRegistration.id), {
      paymentStatus: "submitted",
      paymentProof: {
        storagePath: paymentProof.storagePath,
        downloadURL: paymentProof.downloadURL,
        uploadedAt: serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
      },
      updatedAt: serverTimestamp(),
    });

    try {
      await loadRegs(currentPickup.id);
    } catch (err) {
      console.warn("No se pudo refrescar lista tras subir comprobante:", err);
    }

    showInfo("Comprobante enviado correctamente.");
  } catch (err) {
    console.error(err);
    showError("No se pudo subir el comprobante.");
  } finally {
    hideLoader();
  }
}

async function cancelPickupRegistration() {
  clearMessages();

  if (!currentUserRegistration?.id) {
    showError("No se encontró tu inscripción.");
    return;
  }

  const penaltyFree = canCancelWithoutPenalty(currentPickup, new Date());
  const confirmMsg = penaltyFree
    ? "¿Seguro que querés salirte de este pickup?"
    : "Ya pasó la ventana para salirte sin penalización. ¿Igual querés cancelar tu participación?";

  const ok = window.confirm(confirmMsg);
  if (!ok) return;

  showLoader("Saliendo del pickup…");
  try {
    await updateDoc(doc(db, COL_PICKUP_REGS, currentUserRegistration.id), {
      registrationStatus: "cancelled",
      updatedAt: serverTimestamp(),
    });

    try {
      await loadRegs(currentPickup.id);
    } catch (err) {
      console.warn("No se pudo refrescar lista tras cancelar:", err);
      currentRegs = currentRegs.map((r) =>
        r.id === currentUserRegistration.id
          ? { ...r, registrationStatus: "cancelled" }
          : r
      );
      refreshCurrentUserRegistration();
      renderList();
    }

    showInfo(
      penaltyFree
        ? "Saliste del pickup correctamente."
        : "Te saliste del pickup. Queda sujeto a reglas de penalización."
    );
  } catch (err) {
    console.error(err);
    showError("No se pudo cancelar tu inscripción.");
  } finally {
    hideLoader();
  }
}

/* =========================
   Buttons state
========================= */
function ensureLeaveBtn() {
  let btn = document.getElementById("pvLeaveBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = "pvLeaveBtn";
  btn.type = "button";
  btn.className = "btn btn-outline-danger btn-sm";
  btn.textContent = "Salirme";

  pvJoinBtn?.insertAdjacentElement("afterend", btn);
  btn.addEventListener("click", cancelPickupRegistration);

  return btn;
}

function ensurePayBtn() {
  let btn = document.getElementById("pvPayBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = "pvPayBtn";
  btn.type = "button";
  btn.className = "btn btn-outline-primary btn-sm";
  btn.textContent = "Pagar / subir comprobante";

  const leaveBtn = ensureLeaveBtn();
  leaveBtn?.insertAdjacentElement("afterend", btn);
  btn.addEventListener("click", openPayDialog);

  return btn;
}

function syncActionButtons() {
  const leaveBtn = ensureLeaveBtn();
  const payBtn = ensurePayBtn();

  if (!pvJoinBtn || !leaveBtn || !payBtn) return;

  if (!currentUser) {
    pvJoinBtn.textContent = "Iniciar sesión para unirme";
    pvJoinBtn.disabled = false;
    leaveBtn.classList.add("d-none");
    payBtn.classList.add("d-none");
    return;
  }

  if (!currentUserDoc?.onboardingComplete) {
    pvJoinBtn.textContent = "Completar registro";
    pvJoinBtn.disabled = false;
    leaveBtn.classList.add("d-none");
    payBtn.classList.add("d-none");
    return;
  }

  if (currentUserRegistration) {
    pvJoinBtn.textContent = currentUserRegistration.registrationStatus === "waitlist"
      ? "Ya estás en espera"
      : "Ya estás inscrito";
    pvJoinBtn.disabled = true;
    leaveBtn.classList.remove("d-none");

    const paymentStatus = String(currentUserRegistration.paymentStatus || "").toLowerCase();
    if (["approved", "submitted"].includes(paymentStatus)) {
      payBtn.classList.add("d-none");
    } else {
      payBtn.classList.remove("d-none");
      payBtn.textContent = paymentStatus === "rejected"
        ? "Reenviar comprobante"
        : "Pagar / subir comprobante";
    }
    return;
  }

  pvJoinBtn.textContent = "Unirme";
  pvJoinBtn.disabled = false;
  leaveBtn.classList.add("d-none");
  payBtn.classList.add("d-none");
}

/* =========================
   Init
========================= */
(async function init() {
  const params = new URLSearchParams(window.location.search);
  const slug = String(params.get("slug") || "").trim();

  if (!slug) {
    showError("Falta el parámetro slug.");
    return;
  }

  showLoader();

  try {
    await initPublicMinimalHeader({
      activeTab: "home",
      brandHref: "/index.html",
    });

    currentPickup = await loadPickupBySlug(slug);

    if (!currentPickup) {
      showError("No se encontró este pickup.");
      return;
    }

    if (currentPickup.isPublic !== true) {
      showError("Este pickup es privado.");
      return;
    }

    pvTitle.textContent = currentPickup.title || "Pickup";
    pvSubtitle.textContent = "Juego abierto";
    pvStatus.innerHTML = `<span class="badge ${getStatusBadge(currentPickup.status)}">${escapeHtml(currentPickup.status || "draft")}</span>`;
    pvStartAt.textContent = fmtDateTime(currentPickup.startAt);
    pvVenue.innerHTML = `
      <div>${escapeHtml(currentPickup.venueName || "—")}</div>
      <div class="small text-muted">${escapeHtml(currentPickup.venueAddress || "")}</div>
      ${
        currentPickup.mapsUrl
          ? `<a href="${currentPickup.mapsUrl}" target="_blank" rel="noopener">Abrir mapa</a>`
          : ``
      }
    `;
    pvCapacity.textContent = getPickupCapacity(currentPickup) === 0 ? "Sin límite" : String(getPickupCapacity(currentPickup));
    pvNotes.innerHTML = formatNotes(currentPickup.notes);

    renderPricing(currentPickup);

    try {
      await loadRegs(currentPickup.id);
    } catch (err) {
      console.warn("Lista pública no disponible:", err);
      currentRegs = [];
      refreshCurrentUserRegistration();
      renderList();
    }

    pvShareBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const old = pvShareBtn.textContent;
        pvShareBtn.textContent = "Link copiado ✅";
        setTimeout(() => (pvShareBtn.textContent = old), 1200);
      } catch {
        alert(window.location.href);
      }
    });

    pvJoinBtn?.addEventListener("click", joinPickup);

    onAuthStateChanged(auth, async (user) => {
      currentUser = user || null;
      currentUserDoc = user ? await loadUserDoc(user.uid) : null;

      if (currentUser) {
        try {
          await loadRegs(currentPickup.id);
        } catch (err) {
          console.warn("No se pudo cargar registros con sesión:", err);
          currentRegs = [];
          refreshCurrentUserRegistration();
          renderList();
        }
      } else {
        currentUserRegistration = null;
        syncActionButtons();
      }
    });
  } catch (err) {
    console.error("[pickup_view] init error:", err);
    showError(err?.message || "Error cargando el pickup.");
  } finally {
    hideLoader();
    document.documentElement.classList.remove("preload");
  }
})();