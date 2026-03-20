import { auth, db } from "../auth/firebase.js";
import { loginWithGoogle, logout } from "../auth/auth.js";
import { routeAfterGoogleLogin } from "../auth/role-routing.js";

import { CLUB_DATA } from "../strings.js";
import { loadHeaderTabsConfig, filterMenuByConfig } from "../remote-config.js";
import { APP_CONFIG } from "../config/config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_SYSTEM_CONFIG = COL.system_config || "system_config";

/*
  Header único:
  - Tabs filtrados por remote config
  - Tabs filtrados además por permisos del rol
  - CTA según sesión:
      * NO logueado: "Ingresar"
      * Logueado: "Salir"
*/

function toAbsHref(href) {
  if (!href) return "#";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("#") || href.startsWith("?")) return href;

  const base =
    document.querySelector("base")?.href ||
    window.location.origin + window.location.pathname.replace(/[^/]*$/, "");

  const u = new URL(href, base);
  return u.pathname + u.search + u.hash;
}

function normalizeRole(role) {
  return String(role || "viewer").trim().toLowerCase();
}

function getDefaultRolePermissions(roleId = "") {
  const role = normalizeRole(roleId);

  const defaults = {
    tabs: {
      admin: false,
      association: false,
      accountability: false,
    },
    adminSections: {
      users: false,
      landingSections: false,
      registerSettings: false,
    },
  };

  if (role === "admin") {
    defaults.tabs.admin = true;
    defaults.tabs.association = true;
    defaults.tabs.accountability = true;
    defaults.adminSections.users = true;
    defaults.adminSections.landingSections = true;
    defaults.adminSections.registerSettings = true;
  }

  return defaults;
}

function mergePermissions(base = {}, incoming = {}) {
  return {
    tabs: {
      ...(base.tabs || {}),
      ...(incoming.tabs || {}),
    },
    adminSections: {
      ...(base.adminSections || {}),
      ...(incoming.adminSections || {}),
    },
  };
}

function normalizeRoleDefinition(role = {}) {
  const base = getDefaultRolePermissions(role?.id);
  return {
    id: normalizeRole(role?.id),
    label: role?.label || role?.id || "",
    permissions: mergePermissions(base, role?.permissions || {}),
  };
}

function mergeRolesWithFallback(firebaseRoles = [], fallbackRoles = []) {
  const byId = new Map();

  for (const role of fallbackRoles || []) {
    if (!role?.id) continue;
    const normalized = normalizeRoleDefinition(role);
    byId.set(normalized.id, normalized);
  }

  for (const role of firebaseRoles || []) {
    if (!role?.id) continue;
    const prev = byId.get(normalizeRole(role.id)) || normalizeRoleDefinition({ id: role.id, label: role.label });
    const normalized = normalizeRoleDefinition({
      ...prev,
      ...role,
      permissions: mergePermissions(prev.permissions || {}, role.permissions || {}),
    });
    byId.set(normalized.id, normalized);
  }

  return Array.from(byId.values());
}

async function loadRolesCatalog() {
  try {
    const snap = await getDoc(doc(db, COL_SYSTEM_CONFIG, "roles"));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const firebaseRoles = Array.isArray(data.roles) ? data.roles : [];
    const fallbackRoles = Array.isArray(APP_CONFIG.userRoles) ? APP_CONFIG.userRoles : [];
    return mergeRolesWithFallback(firebaseRoles, fallbackRoles);
  } catch (err) {
    console.warn("loadRolesCatalog failed in header:", err);
    const fallbackRoles = Array.isArray(APP_CONFIG.userRoles) ? APP_CONFIG.userRoles : [];
    return mergeRolesWithFallback([], fallbackRoles);
  }
}

async function loadUserAccessContext(user) {
  if (!user?.uid) {
    return {
      role: "viewer",
      permissions: getDefaultRolePermissions("viewer"),
    };
  }

  try {
    const [userSnap, roles] = await Promise.all([
      getDoc(doc(db, COL.users, user.uid)),
      loadRolesCatalog(),
    ]);

    const userData = userSnap.exists() ? (userSnap.data() || {}) : {};
    const role = normalizeRole(userData.role || "viewer");
    const roleDef =
      roles.find((r) => normalizeRole(r.id) === role) ||
      normalizeRoleDefinition({ id: role });

    return {
      role,
      permissions: roleDef.permissions || getDefaultRolePermissions(role),
      userData,
    };
  } catch (err) {
    console.warn("loadUserAccessContext failed:", err);
    return {
      role: "viewer",
      permissions: getDefaultRolePermissions("viewer"),
    };
  }
}

function canSeeMenuItemByPermissions(item, cfg = {}) {
  const perms = cfg?.permissions || {};
  const tabs = perms.tabs || {};

  if (item?.id === "admin") return tabs.admin === true;
  if (item?.id === "association") return tabs.association === true;
  if (item?.id === "accountability") return tabs.accountability === true;

  return true;
}

function filterMenuByRolePermissions(menu, cfg) {
  return (menu || []).filter((item) => canSeeMenuItemByPermissions(item, cfg));
}

export async function loadHeader(activeTab, cfgOverride) {
  const header = document.getElementById("app-header");
  if (!header) return { ready: Promise.resolve() };

  const MENU = CLUB_DATA.header.menu || [];
  const HOME_HREF = toAbsHref(CLUB_DATA.header.homeHref || "dashboard.html");

  let cfg = cfgOverride;
  if (!cfg) {
    try {
      cfg = await loadHeaderTabsConfig();
    } catch (e) {
      console.warn("Remote config failed, fallback local", e);
      cfg = { enabledTabs: {} };
    }
  }

  const isOverride = !!cfgOverride;

  function getVisibleMenu(currentCfg) {
    let visibleMenu = isOverride
      ? filterMenuStrict(MENU, currentCfg)
      : filterMenuByConfig(MENU, currentCfg);

    visibleMenu = filterMenuByRolePermissions(visibleMenu, currentCfg);
    return visibleMenu;
  }

  function filterMenuStrict(menu, localCfg) {
    const enabled = localCfg?.enabledTabs || {};
    return (menu || []).filter((item) => enabled[item.id] === true);
  }

  function renderNav(menu) {
    const desktop = (menu || [])
      .map(
        (item) => `
          <a href="${toAbsHref(item.href)}" class="top-tab ${activeTab === item.id ? "active" : ""}">
            ${item.label}
          </a>
        `
      )
      .join("");

    const mobile = (menu || [])
      .map(
        (item) => `
          <a href="${toAbsHref(item.href)}" class="mobile-link ${activeTab === item.id ? "active" : ""}">
            ${item.label}
          </a>
        `
      )
      .join("");

    const desktopNav = header.querySelector(".top-tabs");
    const mobileNav = header.querySelector(".mobile-links");

    if (desktopNav) desktopNav.innerHTML = desktop;
    if (mobileNav) mobileNav.innerHTML = mobile;
  }

  let resolvedOnce = false;
  let readyResolve;

  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  const resolveOnce = (val) => {
    if (resolvedOnce) return;
    resolvedOnce = true;
    readyResolve(val);
  };

  header.innerHTML = `
    <header class="topbar">
      <div class="left">
        <button
          class="hamburger"
          type="button"
          data-bs-toggle="offcanvas"
          data-bs-target="#mobileMenu"
          aria-controls="mobileMenu"
          aria-label="Abrir menú"
        >☰</button>

        <a class="logo logo-link" href="${HOME_HREF}" title="Ir al inicio">
          ${CLUB_DATA.header.logoText || "Club"}
        </a>
      </div>

      <nav class="top-tabs"></nav>

      <div class="header-cta d-flex align-items-center gap-2" id="headerCta"></div>
    </header>

    <div class="offcanvas offcanvas-start" tabindex="-1" id="mobileMenu" aria-labelledby="mobileMenuLabel">
      <div class="offcanvas-header">
        <a class="offcanvas-title logo-link" id="mobileMenuLabel" href="${HOME_HREF}" title="Ir al inicio">
          ${CLUB_DATA.header.mobileTitle || CLUB_DATA.header.logoText || "Club"}
        </a>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
      </div>

      <div class="offcanvas-body">
        <div class="mobile-links"></div>

        <hr />

        <div class="d-grid gap-2" id="mobileCta"></div>
      </div>
    </div>
  `;

  renderNav(getVisibleMenu(cfg));

  const initialCta = document.getElementById("headerCta");
  const initialMcta = document.getElementById("mobileCta");
  if (initialCta) {
    initialCta.innerHTML = `<div class="spinner-border spinner-border-sm text-light" role="status"></div>`;
  }
  if (initialMcta) {
    initialMcta.innerHTML = `<div class="spinner-border spinner-border-sm" role="status"></div>`;
  }

  onAuthStateChanged(auth, async (user) => {
    const cta = document.getElementById("headerCta");
    const mcta = document.getElementById("mobileCta");

    if (!cta || !mcta) {
      resolveOnce({ user, reason: "no-cta" });
      return;
    }

    const logoutLabel = CLUB_DATA.header?.logout?.label || "SALIR";

    const isIndex =
      location.pathname === "/" ||
      location.pathname.endsWith("/index.html") ||
      location.pathname.endsWith("/");

    const accessCfg = user
      ? { ...cfg, ...(await loadUserAccessContext(user)) }
      : { ...cfg, role: "viewer", permissions: getDefaultRolePermissions("viewer") };

    renderNav(getVisibleMenu(accessCfg));

    if (!user) {
      cta.innerHTML = `
        <button id="googleLoginBtn" class="btn btn-light btn-sm d-flex align-items-center gap-2">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="16" height="16" alt="Google">
          Ingresar
        </button>
      `;

      mcta.innerHTML = `
        <button id="googleLoginBtnMobile" class="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="16" height="16" alt="Google">
          Ingresar
        </button>
      `;

      const doLogin = async () => {
        try {
          await loginWithGoogle();
        } catch (e) {
          console.error(e);
          alert("No se pudo iniciar sesión con Google.");
        }
      };

      document.getElementById("googleLoginBtn")?.addEventListener("click", doLogin);
      document.getElementById("googleLoginBtnMobile")?.addEventListener("click", doLogin);

      resolveOnce({ user: null, reason: "logged-out" });
      return;
    }

    if (isIndex) {
      try {
        await routeAfterGoogleLogin(user);
        resolveOnce({ user, reason: "routed" });
      } catch (e) {
        console.error("routeAfterGoogleLogin failed", e);
        resolveOnce({ user, reason: "route-error" });
        window.location.href = "/public/register.html?error=routing";
      }
      return;
    }

    cta.innerHTML = `
      <button id="logoutBtn" class="logout-btn">${logoutLabel}</button>
    `;

    mcta.innerHTML = `
      <button class="btn btn-outline-primary w-100 mt-2" id="logoutBtnMobile">${logoutLabel}</button>
    `;

    bindHeaderEvents();
    resolveOnce({ user, reason: "logged-in" });
  });

  return { ready };
}

function bindHeaderEvents() {
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);
}