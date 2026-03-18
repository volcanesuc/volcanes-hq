import { db, auth } from "./firebase.js";
import { loadHeader } from "../components/header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { APP_CONFIG } from "../config/config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_PICKUPS = COL.pickups || "pickups";

const $ = {
  alertBox: document.getElementById("alertBox"),
  pickupsList: document.getElementById("pickupsList"),
  btnBecomePlayer: document.getElementById("btnBecomePlayer"),
  btnBecomeMember: document.getElementById("btnBecomeMember"),
};

let actionBound = false;

function releaseUI() {
  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
}

function showAlert(msg, type = "danger") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.innerHTML = String(msg || "").replace(/\n/g, "<br>");
  $.alertBox.classList.remove("d-none");
}

function hideAlert() {
  $.alertBox?.classList.add("d-none");
}

function fmtDate(v) {
  try {
    const d = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
    if (Number.isNaN(d.getTime())) return "Fecha por definir";
    return new Intl.DateTimeFormat("es-CR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "Fecha por definir";
  }
}

function normalizePlayerStatus(data) {
  const explicit = String(data?.playerStatus || "").trim().toLowerCase();
  if (explicit) return explicit;
  return data?.isPlayerActive === true ? "active" : "";
}

function normalizeAssociationStatus(data) {
  const explicit = String(data?.associationStatus || "").trim().toLowerCase();
  if (explicit === "associated_active") return "active";
  if (explicit === "associated_rejected") return "rejected";
  if (explicit === "payment_validation_pending") return "pending";
  return explicit;
}

async function getUserState(uid) {
  const snap = await getDoc(doc(db, COL_USERS, uid));
  return snap.exists() ? snap.data() : null;
}

function renderEmptyPickups(message = "No hay pickups activos en este momento") {
  $.pickupsList.innerHTML = `
    <div class="col-12">
      <div class="pickup-card">
        <div class="fw-bold mb-1">${message}</div>
        <div class="muted-help">Cuando publiquen nuevos pickups, los verás aquí.</div>
      </div>
    </div>
  `;
}

function renderPickups(items = []) {
  if (!items.length) {
    renderEmptyPickups();
    return;
  }

  $.pickupsList.innerHTML = items.map((p) => {
    const title = p.title || p.name || "Pickup";
    const when = fmtDate(p.startAt);
    const endWhen = fmtDate(p.endAt);
    const venueName = p.venueName || "Ubicación por confirmar";
    const venueAddress = p.venueAddress || "";
    const description = p.notes || p.description || "";
    const mapsUrl = p.mapsUrl || "";
    const capacity = Number(p.capacity || 0);

    const pricing = Array.isArray(p.pricingTiers)
      ? p.pricingTiers
          .filter((tier) => tier?.active === true)
          .map((tier) => `${tier.label}: ₡${Number(tier.amount || 0).toLocaleString("es-CR")}`)
          .join(" · ")
      : "";

    return `
      <div class="col-md-6">
        <div class="pickup-card">
          <div class="fw-bold mb-2">${title}</div>

          <div class="pickup-meta mb-1"><strong>Inicio:</strong> ${when}</div>
          <div class="pickup-meta mb-1"><strong>Fin:</strong> ${endWhen}</div>
          <div class="pickup-meta mb-1"><strong>Lugar:</strong> ${venueName}</div>
          ${venueAddress ? `<div class="muted-help mb-2">${venueAddress}</div>` : ""}
          ${capacity > 0 ? `<div class="pickup-meta mb-1"><strong>Cupo:</strong> ${capacity}</div>` : ""}
          ${pricing ? `<div class="pickup-meta mb-2"><strong>Tarifas:</strong> ${pricing}</div>` : ""}
          ${description ? `<div class="muted-help mb-3">${description}</div>` : ""}

          ${
            mapsUrl
              ? `<a class="btn btn-sm btn-outline-primary" href="${mapsUrl}" target="_blank" rel="noopener">Ver ubicación</a>`
              : `<button class="btn btn-sm btn-secondary" type="button" disabled>Sin enlace</button>`
          }
        </div>
      </div>
    `;
  }).join("");
}

async function loadActivePickups() {
  try {
    const qy = query(
      collection(db, COL_PICKUPS),
      where("active", "==", true),
      orderBy("startAt", "asc")
    );

    const snap = await getDocs(qy);
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.status === "published");
    console.log("Pickups encontrados:", items.length, items);
    renderPickups(items);
    return;
  } catch (e) {
    console.log("Pickups fallback:", items.length, items);
    console.warn("Primary pickups query failed, trying fallback:", e);
  }

  try {
    const snap = await getDocs(collection(db, COL_PICKUPS));
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.active === true && p.status === "published")
      .sort((a, b) => {
        const da = (
          typeof a?.startAt?.toDate === "function"
            ? a.startAt.toDate()
            : new Date(a.startAt || 0)
        ).getTime();

        const db = (
          typeof b?.startAt?.toDate === "function"
            ? b.startAt.toDate()
            : new Date(b.startAt || 0)
        ).getTime();

        return da - db;
      });

    renderPickups(items);
  } catch (e) {
    console.error(e);
    $.pickupsList.innerHTML = `
      <div class="col-12">
        <div class="pickup-card">
          <div class="fw-bold mb-1">No se pudieron cargar los pickups</div>
          <div class="muted-help">Revisa la colección de pickups o los permisos de lectura.</div>
        </div>
      </div>
    `;
  }
}

function bindActions(uid) {
  if (actionBound) return;
  actionBound = true;

  $.btnBecomePlayer?.addEventListener("click", async () => {
    showLoader("Actualizando solicitud…");
    try {
      await setDoc(doc(db, COL_USERS, uid), {
        registration: {
          type: "volcanes",
          wantsPlayer: true,
          canUsePickups: true,
        },
        playerStatus: "pending",
        updatedAt: serverTimestamp(),
      }, { merge: true });

      window.location.replace("/index.html?state=platform_pending");
    } catch (e) {
      console.error(e);
      showAlert("No se pudo registrar tu interés como jugador.");
    } finally {
      hideLoader();
      releaseUI();
    }
  });

  $.btnBecomeMember?.addEventListener("click", async () => {
    showLoader("Preparando afiliación…");
    try {
      await setDoc(doc(db, COL_USERS, uid), {
        registration: {
          type: "asovoca",
          wantsMembershipPayment: false,
          canUsePickups: true,
        },
        updatedAt: serverTimestamp(),
      }, { merge: true });

      window.location.replace("/register.html?mode=upgrade_member");
    } catch (e) {
      console.error(e);
      showAlert("No se pudo preparar el cambio a asociado.");
    } finally {
      hideLoader();
      releaseUI();
    }
  });
}

async function boot() {
  showLoader("Cargando…");

  try {
    const header = await loadHeader("home", { enabledTabs: {} });
    if (header?.ready) await header.ready;
  } catch (e) {
    console.warn("Header load failed:", e);
  }

  onAuthStateChanged(auth, async (user) => {
    hideAlert();

    if (!user?.uid) {
      hideLoader();
      releaseUI();
      window.location.replace("/login.html");
      return;
    }

    showLoader("Validando acceso…");

    try {
      const data = await getUserState(user.uid);

      if (!data?.onboardingComplete) {
        window.location.replace("/register.html");
        return;
      }

      const playerStatus = normalizePlayerStatus(data);
      const associationStatus = normalizeAssociationStatus(data);
      const canUsePickups = data?.canUsePickups === true;

      if (playerStatus === "active") {
        window.location.replace("/dashboard.html");
        return;
      }

      if (associationStatus === "pending" || associationStatus === "active") {
        window.location.replace("/member_status.html");
        return;
      }

      if (playerStatus === "pending") {
        window.location.replace("/index.html?state=platform_pending");
        return;
      }

      if (!canUsePickups) {
        window.location.replace("/index.html");
        return;
      }

      await loadActivePickups();
      bindActions(user.uid);
    } catch (e) {
      console.error(e);
      showAlert("No se pudo cargar tu información.");
    } finally {
      hideLoader();
      releaseUI();
    }
  });
}

boot();