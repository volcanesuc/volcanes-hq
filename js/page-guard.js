import { loadHeaderTabsConfig, isTabEnabled } from "./remote-config.js";
import { PAGE_CONFIG, HOME_HREF } from "./config/page-config.js";
import { APP_CONFIG } from "./config/config.js";

import { db } from "./auth/firebase.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;

function waitForAuthReady() {
  const auth = getAuth();

  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

function normalizePlayerStatus(data = {}) {
  const explicit = String(data.playerStatus || "").trim().toLowerCase();
  if (explicit) return explicit;

  if (data.isPlayerActive === true || data.isActive === true) {
    return "active";
  }

  return "";
}

function normalizeAssociationStatus(data = {}) {
  const explicit = String(data.associationStatus || "").trim().toLowerCase();

  if (explicit === "payment_validation_pending") return "pending";
  if (explicit === "associated_active") return "active";
  if (explicit === "associated_rejected") return "rejected";

  return explicit || "";
}

async function loadUserRoleIntoCfg(cfg) {
  const user = getAuth().currentUser;

  if (!user) {
    return {
      ...cfg,
      role: "viewer",
      isAdmin: false,
      isPlayerActive: false,
      onboardingComplete: false,
      playerStatus: "",
      associationStatus: "",
    };
  }

  try {
    const snap = await getDoc(doc(db, COL.users, user.uid));

    if (!snap.exists()) {
      return {
        ...cfg,
        role: "viewer",
        isAdmin: false,
        isPlayerActive: false,
        onboardingComplete: false,
        playerStatus: "",
        associationStatus: "",
      };
    }

    const data = snap.data() || {};
    const role = String(data.role || "viewer").trim().toLowerCase();
    const onboardingComplete = data.onboardingComplete === true;

    const playerStatus = normalizePlayerStatus(data);
    const associationStatus = normalizeAssociationStatus(data);
    const isPlayerActive = playerStatus === "active";

    const finalRole = isPlayerActive ? role : "viewer";

    return {
      ...cfg,
      role: finalRole,
      isAdmin: finalRole === "admin",
      isPlayerActive,
      onboardingComplete,
      playerStatus,
      associationStatus,
    };
  } catch (err) {
    console.warn("No se pudo cargar rol:", err);
    return {
      ...cfg,
      role: "viewer",
      isAdmin: false,
      isPlayerActive: false,
      onboardingComplete: false,
      playerStatus: "",
      associationStatus: "",
    };
  }
}

export async function guardPage(pageKey) {
  let cfg = await loadHeaderTabsConfig();

  await waitForAuthReady();
  cfg = await loadUserRoleIntoCfg(cfg);

  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  if (cfg.onboardingComplete !== true) {
    window.location.href = "/public/register.html";
    return { cfg, redirected: true };
  }

  /* Asociados no jugadores: no deben entrar a páginas del dashboard */
  if (
    cfg.associationStatus === "pending" ||
    cfg.associationStatus === "active" ||
    cfg.associationStatus === "rejected"
  ) {
    window.location.href = "/member_status.html";
    return { cfg, redirected: true };
  }

  /* Jugadores no activos aún */
  if (cfg.isPlayerActive !== true) {
    if (cfg.playerStatus === "pending") {
      window.location.href = "/index.html?state=platform_pending";
    } else {
      window.location.href = HOME_HREF;
    }
    return { cfg, redirected: true };
  }

  const page = PAGE_CONFIG[pageKey];
  if (!page) return { cfg, redirected: false };

  if (!isTabEnabled(page.tabId, cfg)) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  const adminOnlyPages = new Set(["admin", "association"]);
  if (adminOnlyPages.has(pageKey) && !cfg.isAdmin) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  return { cfg, redirected: false };
}