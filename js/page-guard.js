import { loadHeaderTabsConfig, isTabEnabled } from "./remote-config.js";
import { PAGE_CONFIG, HOME_HREF } from "./config/page-config.js";

import { db } from "./auth/firebase.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function waitForAuthReady() {
  const auth = getAuth();

  // Si ya existe, no esperés
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
  if (!user) return cfg;

  try {
    const snap = await getDoc(doc(db, "user_roles", user.uid));
    if (!snap.exists()) return cfg;

    const data = snap.data() || {};
    const role = (data.role || "").toString().toLowerCase().trim();
    const active = data.active !== false;

    const finalRole = active && role ? role : "viewer";

    return {
      ...cfg,
      role: finalRole,
      isAdmin: finalRole === "admin",
    };
  } catch (err) {
    console.warn("No se pudo cargar rol:", err);
    return cfg;
  }
}

export async function guardPage(pageKey) {
  let cfg = await loadHeaderTabsConfig();

  // ✅ Espera a que Auth esté listo antes de leer rol
  await waitForAuthReady();
  cfg = await loadUserRoleIntoCfg(cfg);

  const page = PAGE_CONFIG[pageKey];
  if (!page) return { cfg, redirected: false };

  if (!isTabEnabled(page.tabId, cfg)) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  return { cfg, redirected: false };
}
