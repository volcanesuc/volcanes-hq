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

loadHeader("home", { enabledTabs: {} });

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

async function getUserState(uid) {
  const snap = await getDoc(doc(db, COL_USERS, uid));
  return snap.exists() ? snap.data() : null;
}

async function loadActivePickups() {
  try {
    const qy = query(
      collection(db, COL_PICKUPS),
      where("isActive", "==", true),
      orderBy("startAt", "asc")
    );

    const snap = await getDocs(qy);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!items.length) {
      $.pickupsList.innerHTML = `
        <div class="col-12">
          <div class="pickup-card">
            <div class="fw-bold mb-1">No hay pickups activos en este momento</div>
            <div class="text-muted">Cuando publiquen nuevos pickups, los verás aquí.</div>
          </div>
        </div>
      `;
      return;
    }

    $.pickupsList.innerHTML = items.map((p) => {
      const title = p.name || p.title || "Pickup";
      const location = p.location || "Ubicación por confirmar";
      const when = fmtDate(p.startAt || p.date || p.startsAt);
      const description = p.description || p.notes || "";
      const link = p.publicUrl || p.link || "";

      return `
        <div class="col-md-6">
          <div class="pickup-card">
            <div class="fw-bold mb-1">${title}</div>
            <div class="mb-1"><strong>Fecha:</strong> ${when}</div>
            <div class="mb-2"><strong>Lugar:</strong> ${location}</div>
            ${description ? `<div class="text-muted mb-3">${description}</div>` : ""}
            ${
              link
                ? `<a class="btn btn-sm btn-outline-primary" href="${link}" target="_blank" rel="noopener">Ver pickup</a>`
                : `<button class="btn btn-sm btn-outline-secondary" disabled>Próximamente</button>`
            }
          </div>
        </div>
      `;
    }).join("");
  } catch (e) {
    console.error(e);
    $.pickupsList.innerHTML = `
      <div class="col-12">
        <div class="pickup-card">
          <div class="fw-bold mb-1">No se pudieron cargar los pickups</div>
          <div class="text-muted">Revisa la colección y los índices si aplica.</div>
        </div>
      </div>
    `;
  }
}

async function becomePlayer(uid) {
  showLoader("Actualizando solicitud…");
  try {
    await setDoc(doc(db, COL_USERS, uid), {
      registration: {
        type: "volcanes",
        wantsPlayer: true,
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
  }
}

async function becomeMember(uid) {
  showLoader("Preparando afiliación…");
  try {
    await setDoc(doc(db, COL_USERS, uid), {
      registration: {
        type: "asovoca",
        wantsMembershipPayment: false,
      },
      updatedAt: serverTimestamp(),
    }, { merge: true });

    window.location.replace("/register.html?mode=upgrade_member");
  } catch (e) {
    console.error(e);
    showAlert("No se pudo preparar el cambio a asociado.");
  } finally {
    hideLoader();
  }
}

onAuthStateChanged(auth, async (user) => {
  hideAlert();

  if (!user?.uid) {
    window.location.replace("/login.html");
    return;
  }

  showLoader("Cargando…");
  try {
    const data = await getUserState(user.uid);

    if (!data?.onboardingComplete) {
      window.location.replace("/register.html");
      return;
    }

    if (data?.playerStatus === "active") {
      window.location.replace("/dashboard.html");
      return;
    }

    if (data?.associationStatus === "pending" || data?.associationStatus === "active") {
      window.location.replace("/member_status.html");
      return;
    }

    if (data?.canUsePickups !== true) {
      window.location.replace("/index.html");
      return;
    }

    await loadActivePickups();

    $.btnBecomePlayer?.addEventListener("click", () => becomePlayer(user.uid));
    $.btnBecomeMember?.addEventListener("click", () => becomeMember(user.uid));
  } catch (e) {
    console.error(e);
    showAlert("No se pudo cargar tu información.");
  } finally {
    hideLoader();
  }
});