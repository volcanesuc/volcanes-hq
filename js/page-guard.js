// js/page-guard.js
// Protege las pantallas de la app: sesión, a dónde pertenece la persona (me.js),
// tab habilitado en Remote Config y permiso del rol para Gestión / Ajustes.
import { loadHeaderTabsConfig, isTabEnabled } from "./remote-config.js";
import { PAGE_CONFIG, HOME_HREF } from "./config/page-config.js";
import { ROUTES, destinationFor, loadAccess } from "./core/me.js";

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

function canAccessPageByPermissions(pageKey, cfg) {
  const tabs = cfg?.permissions?.tabs || {};

  if (pageKey === "admin") return tabs.admin === true;
  if (pageKey === "association") return tabs.association === true;
  if (pageKey === "accountability") return tabs.accountability === true;

  return true;
}

function go(url) {
  window.location.href = url;
}

/**
 * cfg = Remote Config + el acceso de me.js (role, isAdmin, permissions, userData, caps…).
 * @returns {{ cfg: object, redirected: boolean }}
 */
export async function guardPage(pageKey) {
  const [rc, user] = await Promise.all([loadHeaderTabsConfig(), waitForAuthReady()]);
  const access = await loadAccess(user?.uid);
  const cfg = { ...rc, ...access };

  if (!user) {
    go(ROUTES.landing);
    return { cfg, redirected: true };
  }

  const dest = destinationFor(access);
  if (dest !== ROUTES.dashboard) {
    go(dest);
    return { cfg, redirected: true };
  }

  const page = PAGE_CONFIG[pageKey];
  if (!page) return { cfg, redirected: false };

  if (!isTabEnabled(page.tabId, cfg) || !canAccessPageByPermissions(pageKey, cfg)) {
    go(HOME_HREF);
    return { cfg, redirected: true };
  }

  return { cfg, redirected: false };
}
