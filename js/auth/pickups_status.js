import { ROUTES, destinationFor, loadAccess } from "/js/core/me.js";
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
import { TX } from "/js/strings/screens/pickups_status.js";

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
    if (Number.isNaN(d.getTime())) return TX.fechaPorDefinir;
    return new Intl.DateTimeFormat("es-CR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return TX.fechaPorDefinir;
  }
}

function renderEmptyPickups(message = TX.noHayPickupsActivos) {
  $.pickupsList.innerHTML = `
    <div class="col-12">
      <div class="pickup-card">
        <div class="fw-bold mb-1">${message}</div>
        <div class="muted-help">${TX.cuandoPubliquenNuevosPickups}</div>
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
    const title = p.title || p.name || TX.pickup;
    const when = fmtDate(p.startAt);
    const endWhen = fmtDate(p.endAt);
    const venueName = p.venueName || TX.ubicacionPorConfirmar;
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

          <div class="pickup-meta mb-1"><strong>${TX.inicio}</strong> ${when}</div>
          <div class="pickup-meta mb-1"><strong>${TX.fin}</strong> ${endWhen}</div>
          <div class="pickup-meta mb-1"><strong>${TX.lugar}</strong> ${venueName}</div>
          ${venueAddress ? `<div class="muted-help mb-2">${venueAddress}</div>` : ""}
          ${capacity > 0 ? `<div class="pickup-meta mb-1"><strong>${TX.cupo}</strong> ${capacity}</div>` : ""}
          ${pricing ? `<div class="pickup-meta mb-2"><strong>${TX.tarifas}</strong> ${pricing}</div>` : ""}
          ${description ? `<div class="muted-help mb-3">${description}</div>` : ""}

          ${
            mapsUrl
              ? `<a class="btn btn-sm btn-outline-primary" href="${mapsUrl}" target="_blank" rel="noopener">${TX.verUbicacion}</a>`
              : `<button class="btn btn-sm btn-secondary" type="button" disabled>${TX.sinEnlace}</button>`
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
          <div class="fw-bold mb-1">${TX.noSePudieronCargar}</div>
          <div class="muted-help">${TX.revisaLaColeccionDe}</div>
        </div>
      </div>
    `;
  }
}

function bindActions(uid) {
  if (actionBound) return;
  actionBound = true;

  $.btnBecomePlayer?.addEventListener("click", async () => {
    showLoader(TX.actualizandoSolicitud);
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
      showAlert(TX.noSePudoRegistrar);
    } finally {
      hideLoader();
      releaseUI();
    }
  });

  $.btnBecomeMember?.addEventListener("click", async () => {
    showLoader(TX.preparandoAfiliacion);
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
      showAlert(TX.noSePudoPreparar);
    } finally {
      hideLoader();
      releaseUI();
    }
  });
}

async function boot() {
  showLoader(TX.cargando);

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

    showLoader(TX.validandoAcceso);

    try {
      // Esta página es para quien solo usa pickups; el resto va a su lugar (me.js).
      const dest = destinationFor(await loadAccess(user.uid));
      if (dest !== ROUTES.pickupsOnly) {
        window.location.replace(dest);
        return;
      }

      await loadActivePickups();
      bindActions(user.uid);
    } catch (e) {
      console.error(e);
      showAlert(TX.noSePudoCargar);
    } finally {
      hideLoader();
      releaseUI();
    }
  });
}

boot();