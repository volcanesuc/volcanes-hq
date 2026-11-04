// /js/features/pickups/pickups.js
// Gestión › Pickups (solo admins): crear, publicar, lista y pagos de cada pickup.
// Los jugadores ven los próximos y "Mis pickups" en /public/pickups.html.
// Finanzas y Ajustes de pickups viven en Gestión (pickups_admin_mount.js).
import { auth } from "/js/auth/firebase.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { guardPage } from "/js/page-guard.js";
import { loadHeader } from "/js/components/header.js";

import {
  applyStrings,
  fmtDateTime,
  loadPickupSettings,
  money,
  t,
} from "/js/features/pickups/pickups_settings.js";

import {
  PICKUP_STATUS,
  SPOT,
  buildPickupPublicUrl,
  computeCredits,
  escapeHtml,
  getPickupCapacity,
  getSpotMap,
  hasStarted,
  norm,
  paymentBadge,
  personKeyFromId,
  pickupStatusBadge,
  personKeyFromUid,
  regTierLabel,
  splitSpots,
  spotBadge,
} from "/js/features/pickups/pickups_shared.js";

import {
  loadAllPickups,
  loadAllRegs,
  loadPickup,
  loadPublicPickups,
  loadRegsByPayer,
  loadRegsForPickup,
  loadRegsOwnedBy,
  loadUserDoc,
  migrateLegacyData,
  needsMigration,
} from "/js/features/pickups/pickups_services.js";

import { setAlert } from "/js/features/pickups/pickups_admin_ui.js";
import { initManage, renderManage } from "/js/features/pickups/pickups_admin_manage.js";

const $ = (id) => document.getElementById(id);

const state = {
  isAdmin: false,
  uid: null,
  payerKey: null,
  pickups: [],
  regs: [],
};

const ctx = {
  getPickups: () => state.pickups,
  getRegs: () => state.regs,
  reload: () => reload(),
  alert: (msg, type = "info") => setAlert($("alertBox"), msg, type),
};

/* =========================
   Datos
========================= */
async function reload() {
  let [pickups, regs] = await Promise.all([loadAllPickups(), loadAllRegs()]);
  if (needsMigration(pickups, regs)) {
    try {
      const n = await migrateLegacyData(pickups, regs);
      console.info(`[pickups] ${n} registros migrados al formato nuevo`);
      [pickups, regs] = await Promise.all([loadAllPickups(), loadAllRegs()]);
    } catch (err) {
      console.error("[pickups] migración falló (¿reglas nuevas publicadas?):", err);
      ctx.alert(t("admin.migrationFailed"), "warning");
    }
  }
  state.pickups = pickups;
  state.regs = regs;
  renderAll();
}

/* =========================
   Render
========================= */
function renderAll() {
  renderManage();
}

// Pickups | Ajustes (los ajustes se montan la primera vez que se abren). ?view=ajustes abre directo.
let settingsMounted = false;

async function showView(view) {
  const settings = view === "settings";
  $("tabManage").classList.toggle("d-none", settings);
  $("tabSettings").classList.toggle("d-none", !settings);
  $("openCreatePickupBtn").classList.toggle("d-none", settings);
  document.querySelectorAll("#pkViews [data-view]").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));

  const url = new URL(window.location.href);
  if (settings) url.searchParams.set("view", "ajustes");
  else url.searchParams.delete("view");
  history.replaceState({}, "", url);

  if (settings && !settingsMounted) {
    settingsMounted = true;
    const { mountSettings } = await import("/js/features/pickups/pickups_admin_mount.js");
    await mountSettings($("pickupsSettingsMount"));
  }
}

/* =========================
   Init
========================= */
(async function init() {
  const { cfg, redirected } = await guardPage("pickups");
  if (redirected) return;

  showLoader();
  try {
    await loadHeader("pickups", cfg);
    await loadPickupSettings();
    applyStrings();

    state.isAdmin = cfg?.isAdmin === true;
    if (!state.isAdmin) {
      window.location.replace("/public/pickups.html");
      return;
    }
    state.uid = auth.currentUser?.uid || null;

    const userDoc = cfg?.userData || (await loadUserDoc(state.uid));
    state.payerKey = (await personKeyFromId(userDoc?.profile?.idNumber || userDoc?.idNumber)) || personKeyFromUid(state.uid);

    document.querySelectorAll("[data-admin-only]").forEach((el) => el.classList.toggle("d-none", !state.isAdmin));
    $("openCreatePickupBtn").classList.toggle("d-none", !state.isAdmin);

    $("pkViews").addEventListener("click", (e) => {
      const b = e.target.closest("[data-view]");
      if (b) showView(b.dataset.view);
    });

    if (state.isAdmin) {
      initManage(ctx);
    }

    await reload();
    if (new URLSearchParams(window.location.search).get("view") === "ajustes") await showView("settings");
  } catch (err) {
    console.error("[pickups] init error:", err);
    ctx.alert(err?.message || t("common.error"), "danger");
  } finally {
    hideLoader();
    document.body.classList.remove("loading");
    document.documentElement.classList.remove("preload");
  }
})();
