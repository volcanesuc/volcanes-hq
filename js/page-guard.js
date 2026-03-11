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

async function loadUserRoleIntoCfg(cfg) {
  const user = getAuth().currentUser;

  if (!user) {
    return {
      ...cfg,
      role: "viewer",
      isAdmin: false,
      isActive: false,
      onboardingComplete: false,
    };
  }

  try {
    const snap = await getDoc(doc(db, COL.users, user.uid));

    if (!snap.exists()) {
      return {
        ...cfg,
        role: "viewer",
        isAdmin: false,
        isActive: false,
        onboardingComplete: false,
      };
    }

    const data = snap.data() || {};
    const role = String(data.role || "viewer").trim().toLowerCase();
    const isActive = data.isActive === true;
    const onboardingComplete = data.onboardingComplete === true;

    const finalRole = isActive ? role : "viewer";

    return {
      ...cfg,
      role: finalRole,
      isAdmin: finalRole === "admin",
      isActive,
      onboardingComplete,
    };
  } catch (err) {
    console.warn("No se pudo cargar rol:", err);
    return {
      ...cfg,
      role: "viewer",
      isAdmin: false,
      isActive: false,
      onboardingComplete: false,
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

  if (cfg.isActive !== true) {
    window.location.href = "/index.html?pending=1";
    return { cfg, redirected: true };
  }

  const page = PAGE_CONFIG[pageKey];
  if (!page) return { cfg, redirected: false };

  if (!isTabEnabled(page.tabId, cfg)) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  if (pageKey === "admin" && !cfg.isAdmin) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  return { cfg, redirected: false };
}