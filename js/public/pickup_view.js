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
  onSnapshot,
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
  countWaitlistRegistrations,
  escapeHtml,
  fmtDateTime,
  getPickupCapacity,
  getStatusBadge,
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

function formatNotes(text) {
  if (!text) return "—";
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function registrationRow(r) {
  return `
    <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
      <div>
        <div class="fw-semibold">${escapeHtml(r.displayName || "—")}</div>
        <div class="small text-muted">${escapeHtml(r.pricingTierLabel || "—")}</div>
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

  pvList.innerHTML = rows.map(registrationRow).join("");
}

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
  renderList();
}

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

  const existing = currentRegs.find((r) => r.uid === currentUser.uid && r.registrationStatus !== "cancelled");
  if (existing) {
    showInfo("Ya estás inscrito en este pickup.");
    return;
  }

  const tiers = Array.isArray(currentPickup.pricingTiers) ? currentPickup.pricingTiers : [];
  const tierLabel = prompt(
    "Escribí exactamente la categoría a usar:\n" +
    tiers.map((t) => `- ${t.label} (₡${Number(t.amount || 0)})`).join("\n")
  );

  if (!tierLabel) return;

  const tier = tiers.find((t) => String(t.label || "").toLowerCase() === String(tierLabel || "").trim().toLowerCase());
  if (!tier) {
    showError("La categoría no coincide con ninguna tarifa.");
    return;
  }

  let paymentProof = null;

  if (currentPickup?.rules?.requiresPaymentProof === true) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();

    const file = await new Promise((resolve) => {
      input.addEventListener("change", () => resolve(input.files?.[0] || null), { once: true });
    });

    if (!file) {
      showError("El pickup requiere comprobante.");
      return;
    }

    showLoader();
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

    pricingTierId: tier.id,
    pricingTierLabel: tier.label,
    amountDue: Number(tier.amount || 0),

    registrationStatus,
    paymentStatus: currentPickup?.rules?.requiresPaymentProof === true ? "submitted" : "not_required",

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
    renderList();
  }
  showInfo(registrationStatus === "waitlist" ? "Quedaste en lista de espera." : "Te registraste correctamente.");
}

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
    await loadRegs(currentPickup.id);

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
    });
  } catch (err) {
        console.error("[pickup_view] init error:", err);
        showError(err?.message || "Error cargando el pickup.");
    } finally {
        hideLoader();
        document.documentElement.classList.remove("preload");
  }
})();