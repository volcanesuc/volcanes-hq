import { auth } from "../auth/firebase.js";
import { loginWithGoogle, logout } from "../auth/auth.js";
import { routeAfterGoogleLogin } from "../auth/role-routing.js";

import { CLUB_DATA } from "../strings.js";
import { loadHeaderTabsConfig, filterMenuByConfig } from "../remote-config.js";
import { defaultRolePermissions, loadAccess } from "../core/me.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { TX } from "/js/strings/screens/header.js";
import { logoHtml } from "/js/core/theme.js";

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

async function loadUserAccessContext(user) {
  const access = await loadAccess(user?.uid);
  return { role: access.role, permissions: access.permissions, userData: access.userData };
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

  // Remote Config y permisos se evalúan con `gate` (la llave de la página real),
  // así varios items pueden colgar del mismo permiso (ej. Personas y Dinero → association).
  // `perm` exige además un permiso de rol distinto (ej. Pickups en Gestión → association).
  function getVisibleMenu(currentCfg) {
    const gated = MENU.map((item) => ({ ...item, id: item.gate || item.id, navId: item.id }));
    let visibleMenu = isOverride
      ? filterMenuStrict(gated, currentCfg)
      : filterMenuByConfig(gated, currentCfg);

    visibleMenu = filterMenuByRolePermissions(visibleMenu, currentCfg).filter(
      (item) => !item.perm || canSeeMenuItemByPermissions({ id: item.perm }, currentCfg)
    );
    return visibleMenu.map((item) => ({ ...item, id: item.navId }));
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
          <a href="${toAbsHref(item.href)}" class="ui-seg__item ${activeTab === item.id ? "is-active" : ""}">
            ${item.label}
          </a>
        `
      )
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
    const bottomNav = header.querySelector(".bottom-nav");

    if (desktopNav) desktopNav.innerHTML = desktop;
    if (subNav) {
      subNav.innerHTML = sub ? `<div class="ui-seg">${sub}</div>` : "";
      subNav.classList.toggle("d-none", !sub);
    }
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

  const logoFull = CLUB_DATA.header.logoText || TX.club;
  const logoShort = CLUB_DATA.header.mobileTitle || logoFull;

  // Misma barra que los torneos de ClubStudioHQ, con el color del club.
  header.innerHTML = `
    <nav class="hq-nav">
      <div class="container hq-nav__inner">
        <a class="hq-nav__brand logo-link" href="${HOME_HREF}" title="${TX.irAlInicio}">
          <span class="hq-nav__brand-full" data-club-logo="${logoFull}">${logoHtml(logoFull)}</span>
          <span class="hq-nav__brand-short" data-club-logo="${logoShort}">${logoHtml(logoShort)}</span>
        </a>

        <a class="hq-nav__cs" href="https://www.clubstudiohq.com" target="_blank" rel="noopener" title="${TX.hechoConClubStudio}">
          <img src="/img/clubstudiohq.svg" width="24" height="24" alt="ClubStudioHQ" />
          <span class="hq-nav__cs-text">ClubStudio<span class="hq-nav__hq">HQ</span></span>
        </a>

        <div class="top-tabs"></div>

        <div class="hq-nav__cta" id="headerCta"></div>
      </div>
    </nav>

    <nav class="sub-tabs d-none" aria-label="${TX.subsecciones}"></nav>

    <nav class="bottom-nav d-none" aria-label="${TX.menuPrincipal}"></nav>
  `;

  renderNav(getVisibleMenu(cfg));

  const initialCta = document.getElementById("headerCta");
  if (initialCta) {
    initialCta.innerHTML = `<div class="spinner-border spinner-border-sm text-light" role="status"></div>`;
  }

  onAuthStateChanged(auth, async (user) => {
    const cta = document.getElementById("headerCta");

    if (!cta) {
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
      : { ...cfg, role: "viewer", permissions: defaultRolePermissions("viewer") };

    renderNav(getVisibleMenu(accessCfg));

    if (!user) {
      cta.innerHTML = `
        <button id="googleLoginBtn" class="btn btn-light btn-sm d-flex align-items-center gap-2">
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

    const name = user.displayName || user.email || "";
    const avatar = user.photoURL
      ? `<img class="hq-nav__avatar" src="${escAttr(user.photoURL)}" alt="${escAttr(name)}" referrerpolicy="no-referrer" />`
      : `<span class="hq-nav__avatar hq-nav__avatar--empty">${escAttr((name.trim()[0] || "?").toUpperCase())}</span>`;

    cta.innerHTML = `
      <a class="hq-nav__me" href="/perfil.html" title="${escAttr(TX.miPerfil)}">${avatar}</a>
      <button id="logoutBtn" class="btn btn-sm btn-outline-light hq-nav__logout">${logoutLabel}</button>
    `;

    bindHeaderEvents();
    resolveOnce({ user, reason: "logged-in" });
  });

  return { ready };
}

function escAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function bindHeaderEvents() {
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
}