import { auth, db } from "../auth/firebase.js";
import { loginWithGoogle, logout } from "../auth/auth.js";
import { routeAfterGoogleLogin } from "../auth/role-routing.js";

import { CLUB_DATA } from "../strings.js";
import { loadHeaderTabsConfig, filterMenuByConfig } from "../remote-config.js";
import { APP_CONFIG } from "../config/config.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX } from "/js/strings/screens/header.js";
import { logoHtml } from "/js/core/theme.js";

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

// Íconos de la barra inferior (mobile), por id de grupo.
const NAV_ICONS = {
  home: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
  train: `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>`,
  team: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  social: `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
  manage: `<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`,
};

function navIcon(groupId) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[groupId] || NAV_ICONS.home}</svg>`;
}

// Arma los grupos con solo los items visibles; un grupo sin items no se muestra.
function buildNavGroups(nav, visibleItems) {
  const visibleIds = new Set((visibleItems || []).map((item) => item.id));
  return (nav || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => visibleIds.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);
}

// si el tema cambia (logo nuevo) después de pintar el header
window.addEventListener("club-theme:changed", () => {
  document.querySelectorAll("[data-club-logo]").forEach((el) => {
    el.innerHTML = logoHtml(el.getAttribute("data-club-logo"));
  });
});

export async function loadHeader(activeTab, cfgOverride) {
  const header = document.getElementById("app-header");
  if (!header) return { ready: Promise.resolve() };

  const NAV = CLUB_DATA.header.nav || [];
  const MENU = NAV.flatMap((group) => group.items || []);
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
    const groups = buildNavGroups(NAV, menu);
    const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeTab));
    const isActiveGroup = (group) => group === activeGroup;
    const groupHref = (group) => toAbsHref(group.items[0].href);

    const desktop = groups
      .map(
        (group) => `
          <a href="${groupHref(group)}" class="top-tab ${isActiveGroup(group) ? "active" : ""}">
            ${group.label}
          </a>
        `
      )
      .join("");

    // Subtabs: solo si el grupo activo tiene más de una página visible.
    const subItems = activeGroup && activeGroup.items.length > 1 ? activeGroup.items : [];
    const sub = subItems
      .map(
        (item) => `
          <a href="${toAbsHref(item.href)}" class="sub-tab ${activeTab === item.id ? "active" : ""}">
            ${item.label}
          </a>
        `
      )
      .join("");

    const mobile = groups
      .map((group) => {
        if (group.items.length === 1) {
          return `
            <a href="${groupHref(group)}" class="mobile-link ${isActiveGroup(group) ? "active" : ""}">
              ${group.label}
            </a>
          `;
        }
        return `
          <div class="mobile-group">${group.label}</div>
          ${group.items
            .map(
              (item) => `
                <a href="${toAbsHref(item.href)}" class="mobile-link mobile-sublink ${activeTab === item.id ? "active" : ""}">
                  ${item.label}
                </a>
              `
            )
            .join("")}
        `;
      })
      .join("");

    const bottom = groups
      .map(
        (group) => `
          <a href="${groupHref(group)}" class="bottom-tab ${isActiveGroup(group) ? "active" : ""}">
            ${navIcon(group.id)}
            <span>${group.label}</span>
          </a>
        `
      )
      .join("");

    const desktopNav = header.querySelector(".top-tabs");
    const subNav = header.querySelector(".sub-tabs");
    const mobileNav = header.querySelector(".mobile-links");
    const bottomNav = header.querySelector(".bottom-nav");

    if (desktopNav) desktopNav.innerHTML = desktop;
    if (subNav) {
      subNav.innerHTML = sub;
      subNav.classList.toggle("d-none", !sub);
    }
    if (mobileNav) mobileNav.innerHTML = mobile;
    if (bottomNav) {
      bottomNav.innerHTML = bottom;
      bottomNav.classList.toggle("d-none", !groups.length);
    }
    document.body.classList.toggle("has-bottom-nav", groups.length > 0);
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
          aria-label="${TX.abrirMenu}"
        >☰</button>

        <a class="logo logo-link" href="${HOME_HREF}" title="${TX.irAlInicio}" data-club-logo="${CLUB_DATA.header.logoText || TX.club}">
          ${logoHtml(CLUB_DATA.header.logoText || TX.club)}
        </a>
      </div>

      <nav class="top-tabs"></nav>

      <div class="header-cta d-flex align-items-center gap-2" id="headerCta"></div>
    </header>

    <nav class="sub-tabs d-none" aria-label="${TX.subsecciones}"></nav>

    <nav class="bottom-nav d-none" aria-label="${TX.menuPrincipal}"></nav>

    <div class="offcanvas offcanvas-start" tabindex="-1" id="mobileMenu" aria-labelledby="mobileMenuLabel">
      <div class="offcanvas-header">
        <a class="offcanvas-title logo-link" id="mobileMenuLabel" href="${HOME_HREF}" title="${TX.irAlInicio}" data-club-logo="${CLUB_DATA.header.mobileTitle || CLUB_DATA.header.logoText || TX.club}">
          ${logoHtml(CLUB_DATA.header.mobileTitle || CLUB_DATA.header.logoText || TX.club)}
        </a>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="${TX.cerrar}"></button>
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

    const logoutLabel = CLUB_DATA.header?.logout?.label || TX.salir;

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
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="16" height="16" alt="${TX.google}">
          ${TX.ingresar}
        </button>
      `;

      mcta.innerHTML = `
        <button id="googleLoginBtnMobile" class="btn btn-light w-100 d-flex align-items-center justify-content-center gap-2">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="16" height="16" alt="${TX.google}">
          ${TX.ingresar}
        </button>
      `;

      const doLogin = async () => {
        try {
          await loginWithGoogle();
        } catch (e) {
          console.error(e);
          alert(TX.noSePudoIniciar);
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