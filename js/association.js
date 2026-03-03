// js/association.js
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { initModalHost } from "./ui/modal_host.js";
import { showLoader, hideLoader } from "./ui/loader.js";


const TABS = ["associates", "memberships", "payments", "plans"];

function getTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tab = (params.get("tab") || "associates").toLowerCase(); // default = associates
  return TABS.includes(tab) ? tab : "associates";
}

function setTabInUrl(tab) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  history.pushState({}, "", url);
}

function setActiveTab(tab) {
  document.querySelectorAll("#associationTabs .nav-link").forEach((a) => {
    const active = a.dataset.tab === tab;
    a.classList.toggle("active", active);
    a.setAttribute("aria-current", active ? "page" : "false");
  });

  document.querySelectorAll("#associationContent .assoc-panel").forEach((p) => {
    p.classList.toggle("d-none", p.dataset.panel !== tab);
  });
}

async function mountTab(tab, cfg) {
  const panel = document.querySelector(
    `#associationContent .assoc-panel[data-panel="${tab}"]`
  );
  if (!panel) return;

  let mount = panel.querySelector("[data-mount]");
  if (!mount) {
    mount = document.createElement("div");
    mount.dataset.mount = "true";
    mount.className = "mt-3";
    panel.appendChild(mount);
  }

  mount.innerHTML = `<div class="py-3">Cargando...</div>`;

  try {
    if (tab === "associates") {
      const mod = await import("./features/associates_list.js?v=1");
      if (!mod.mount) throw new Error("associates_list.js no exporta mount()");
      await mod.mount(mount, cfg);
      return;
    }

    if (tab === "memberships") {
      const mod = await import("./features/memberships_list.js?v=1");
      if (!mod.mount) throw new Error("memberships_list.js no exporta mount()");
      await mod.mount(mount, cfg);
      return;
    }

    if (tab === "payments") {
      const mod = await import("./features/payments_admin.js?v=1");
      if (!mod.mount) throw new Error("payments_admin.js no exporta mount()");
      await mod.mount(mount, cfg);
      return;
    }

    if (tab === "plans") {
        const mod = await import("./features/subscription_plans.js?v=1");
        if (!mod.mount) throw new Error("subscription_plans.js no exporta mount()");
        await mod.mount(mount, cfg);
        return;
    }
  } catch (err) {
    console.error(err);
    mount.innerHTML = `
      <div class="alert alert-danger">
        <div class="fw-bold">Error cargando "${tab}"</div>
        <div class="small mt-1"><code>${String(err?.message || err)}</code></div>
      </div>
    `;
  }
}

async function renderAssociation(cfg) {
  const tab = getTabFromUrl();
  setActiveTab(tab);
  await mountTab(tab, cfg);
}

const { cfg, redirected } = await guardPage("association");
if (!redirected) {
  try {
    await loadHeader("association", cfg);
    initModalHost();

    // listeners...
    window.addEventListener("associate:saved", async () => {
      const tab = getTabFromUrl();
      if (tab === "associates") {
        showLoader();
        try { await renderAssociation(cfg); }
        finally { hideLoader(); }
      }
    });

    document.querySelectorAll("#associationTabs .nav-link").forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const tab = a.dataset.tab;
        if (!tab) return;

        showLoader();
        try {
          setTabInUrl(tab);
          await renderAssociation(cfg);
        } finally {
          hideLoader();
        }
      });
    });

    await renderAssociation(cfg);
    window.addEventListener("popstate", async () => {
      showLoader();
      try { await renderAssociation(cfg); }
      finally { hideLoader(); }
    });
  } finally {
    hideLoader();
  }
}
