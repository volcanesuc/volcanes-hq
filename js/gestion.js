// js/gestion.js
// Gestión del club: Personas (miembros, membresías) y Dinero (pagos, contabilidad, pickups).
// Ajustes vive en admin.html. Cada vista es un módulo con mount(container, cfg).
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { initModalHost } from "./ui/modal_host.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import { TX, txf } from "/js/strings/screens/gestion.js";

const SECTIONS = {
  personas: {
    navId: "people",
    title: TX.personasTitulo,
    subtitle: TX.personasSub,
    views: [
      { id: "miembros", label: TX.miembros, load: () => import("./features/association/assoc_members_list.js?v=1") },
      { id: "membresias", label: TX.membresias, load: () => import("./features/association/assoc_memberships_list.js?v=1") },
    ],
  },
  dinero: {
    navId: "money",
    title: TX.dineroTitulo,
    subtitle: TX.dineroSub,
    views: [
      { id: "pagos", label: TX.pagos, load: () => import("./features/association/assoc_payments_validation_list.js?v=1") },
      { id: "contabilidad", label: TX.contabilidad, load: () => import("./features/association/assoc_accounting.js?v=1") },
      {
        id: "pickups",
        label: TX.pickups,
        load: async () => ({ mount: (await import("./features/pickups/pickups_admin_mount.js")).mountFinance }),
      },
    ],
  },
};

function readState() {
  const params = new URLSearchParams(window.location.search);
  const tab = String(params.get("tab") || "").toLowerCase();
  const section = SECTIONS[tab] ? tab : "personas";
  const views = SECTIONS[section].views;
  const viewId = String(params.get("view") || "").toLowerCase();
  const view = views.find((v) => v.id === viewId) || views[0];
  return { section, view };
}

function setViewInUrl(sectionKey, viewId) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", sectionKey);
  url.searchParams.set("view", viewId);
  history.pushState({}, "", url);
}

function renderChrome(sectionKey, activeView) {
  const section = SECTIONS[sectionKey];
  document.getElementById("hubTitle").textContent = section.title;
  document.getElementById("hubSubtitle").textContent = section.subtitle;
  document.title = `${section.title} · ${TX.gestion}`;

  const nav = document.getElementById("hubViews");
  nav.innerHTML = section.views
    .map(
      (v) => `
        <a href="?tab=${sectionKey}&view=${v.id}" class="ui-chip ${v.id === activeView.id ? "is-active" : ""}"
           data-view="${v.id}" ${v.id === activeView.id ? 'aria-current="page"' : ""}>${v.label}</a>`
    )
    .join("");
  nav.classList.toggle("d-none", section.views.length < 2);
}

async function mountView(view, cfg) {
  const host = document.getElementById("hubContent");
  host.innerHTML = `<div class="ui-empty">${TX.cargando}</div>`;

  try {
    const mod = await view.load();
    if (typeof mod?.mount !== "function") throw new Error(txf(TX.noExportaMount, { view: view.id }));
    const mount = document.createElement("div");
    host.innerHTML = "";
    host.appendChild(mount);
    await mod.mount(mount, cfg);
  } catch (err) {
    console.error(err);
    host.innerHTML = `
      <div class="alert alert-danger">
        <div class="fw-bold">${txf(TX.errorCargando, { view: view.label })}</div>
        <div class="small mt-1"><code>${String(err?.message || err)}</code></div>
      </div>
    `;
  }
}

async function render(cfg) {
  const { section, view } = readState();
  renderChrome(section, view);
  await mountView(view, cfg);
}

showLoader(TX.cargandoGestion);

const { cfg, redirected } = await guardPage("association");

if (redirected) {
  hideLoader();
} else if (!cfg?.isAdmin) {
  window.location.replace("/dashboard.html");
} else {
  try {
    const { section } = readState();
    await loadHeader(SECTIONS[section].navId, cfg);
    initModalHost();

    window.addEventListener("user:saved", async () => {
      if (readState().view.id !== "miembros") return;
      showLoader();
      try {
        await render(cfg);
      } finally {
        hideLoader();
      }
    });

    document.getElementById("hubViews").addEventListener("click", async (e) => {
      const link = e.target.closest("[data-view]");
      if (!link) return;
      e.preventDefault();
      showLoader();
      try {
        setViewInUrl(readState().section, link.dataset.view);
        await render(cfg);
      } finally {
        hideLoader();
      }
    });

    window.addEventListener("popstate", async () => {
      showLoader();
      try {
        await render(cfg);
      } finally {
        hideLoader();
      }
    });

    await render(cfg);
  } finally {
    hideLoader();
  }
}
