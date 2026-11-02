// /js/features/pickups/pickups.js
// Página Pickups: próximos y mis pickups para todos; Gestionar / Finanzas / Ajustes para admins.
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
import { initFinance, renderFinance } from "/js/features/pickups/pickups_admin_finance.js";
import { initSettings, renderSettings } from "/js/features/pickups/pickups_admin_settings.js";

const $ = (id) => document.getElementById(id);

const state = {
  isAdmin: false,
  uid: null,
  payerKey: null,
  pickups: [],          // admin: todos; resto: públicos + los de mis inscripciones
  regs: [],             // admin: todas; resto: las de los próximos + las mías
  myRegs: [],
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
async function loadMine() {
  if (!state.uid) return [];
  const jobs = [loadRegsOwnedBy(state.uid)];
  if (state.payerKey) jobs.push(loadRegsByPayer(state.payerKey, state.uid));
  const map = new Map();
  (await Promise.all(jobs)).flat().forEach((r) => map.set(r.id, r));
  return [...map.values()];
}

async function reload() {
  if (state.isAdmin) {
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
    state.myRegs = regs.filter((r) => r.ownerUid === state.uid || r.linkedUid === state.uid || r.uid === state.uid || (state.payerKey && r.payerKey === state.payerKey));
  } else {
    const [publicPickups, mine] = await Promise.all([
      loadPublicPickups(),
      loadMine().catch((err) => {
        console.warn("[pickups] no se pudieron cargar mis inscripciones:", err);
        return [];
      }),
    ]);
    const upcoming = publicPickups.filter((p) => norm(p.status) === PICKUP_STATUS.PUBLISHED && !hasStarted(p));
    const upcomingRegs = (await Promise.all(upcoming.map((p) => loadRegsForPickup(p.id).catch(() => [])))).flat();

    const known = new Map(publicPickups.map((p) => [p.id, p]));
    const missing = [...new Set(mine.map((r) => r.pickupId))].filter((id) => !known.has(id));
    (await Promise.all(missing.map((id) => loadPickup(id).catch(() => null)))).filter(Boolean).forEach((p) => known.set(p.id, p));

    const regMap = new Map();
    [...upcomingRegs, ...mine].forEach((r) => regMap.set(r.id, r));
    state.pickups = [...known.values()];
    state.regs = [...regMap.values()];
    state.myRegs = mine;
  }
  renderAll();
}

/* =========================
   Render
========================= */
// Jugadores: publicados, públicos y sin empezar. Admins: además borradores, cerrados y privados (con su estado).
function isUpcomingFor(p) {
  if (hasStarted(p)) return false;
  const status = norm(p.status) || PICKUP_STATUS.DRAFT;
  if (state.isAdmin) return ![PICKUP_STATUS.CANCELLED, PICKUP_STATUS.FINISHED].includes(status);
  return p.isPublic === true && status === PICKUP_STATUS.PUBLISHED;
}

function renderUpcoming() {
  const upcoming = state.pickups
    .filter(isUpcomingFor)
    .sort((a, b) => (a.startAt?.toMillis?.() || 0) - (b.startAt?.toMillis?.() || 0));

  $("upcomingEmpty").classList.toggle("d-none", upcoming.length > 0);
  $("upcomingList").innerHTML = upcoming.map((p) => {
    const regs = state.regs.filter((r) => r.pickupId === p.id);
    const { inList, waitlist } = splitSpots(p, regs);
    const cap = getPickupCapacity(p);
    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card shadow-sm h-100"><div class="card-body d-flex flex-column">
          <div class="d-flex justify-content-between gap-2">
            <div class="fw-semibold">${escapeHtml(p.title || "—")}</div>
            ${state.isAdmin && (norm(p.status) !== PICKUP_STATUS.PUBLISHED || p.isPublic !== true)
              ? `<span class="badge ${pickupStatusBadge(p.status)}">${escapeHtml(t(`status.pickup.${norm(p.status) || "draft"}`))}${p.isPublic === true ? "" : " · 🔒"}</span>`
              : ""}
          </div>
          <div class="small text-muted mb-2">${escapeHtml(fmtDateTime(p.startAt))} · ${escapeHtml(p.venueName || "")}</div>
          <div class="small mb-3">
            ${escapeHtml(t("public.capacity"))}: <strong>${cap ? `${inList.length} / ${cap}` : `${inList.length} · ${escapeHtml(t("common.unlimited"))}`}</strong>
            ${waitlist.length ? ` · ${escapeHtml(t("status.spot.waitlist"))}: ${waitlist.length}` : ""}
          </div>
          <a class="btn btn-primary btn-sm mt-auto" href="${escapeHtml(buildPickupPublicUrl(p))}">${escapeHtml(t("list.open"))}</a>
        </div></div>
      </div>`;
  }).join("");
}

function renderMine() {
  const byPickup = new Map(state.pickups.map((p) => [p.id, p]));
  const credit = state.payerKey ? computeCredits(state.myRegs).get(state.payerKey)?.balance || 0 : 0;

  $("mineCredit").classList.toggle("d-none", !(credit > 0));
  $("mineCredit").textContent = t("mine.creditBalance", { amount: money(credit) });

  const items = state.myRegs
    .map((r) => ({ r, p: byPickup.get(r.pickupId) }))
    .filter((x) => x.p)
    .sort((a, b) => (b.p.startAt?.toMillis?.() || 0) - (a.p.startAt?.toMillis?.() || 0));

  $("mineEmpty").classList.toggle("d-none", items.length > 0);
  $("mineList").innerHTML = items.map(({ r, p }) => {
    const spot = getSpotMap(p, state.regs.filter((x) => x.pickupId === p.id)).get(r.id) || SPOT.CANCELLED;
    const status = norm(r.paymentStatus || "pending");
    return `
      <a class="list-group-item list-group-item-action" href="${escapeHtml(buildPickupPublicUrl(p))}">
        <div class="d-flex justify-content-between flex-wrap gap-2">
          <div>
            <div class="fw-semibold">${escapeHtml(p.title || "—")} · ${escapeHtml(r.displayName || "")}</div>
            <div class="small text-muted">${escapeHtml(fmtDateTime(p.startAt))} · ${escapeHtml(regTierLabel(r))} · ${escapeHtml(money(r.amountDue))}</div>
          </div>
          <div class="d-flex gap-1 align-items-start">
            <span class="badge ${spotBadge(spot)}">${escapeHtml(t(`status.spot.${spot}`))}</span>
            ${spot === SPOT.CANCELLED ? "" : `<span class="badge ${paymentBadge(status)}">${escapeHtml(t(`status.payment.${status}`))}</span>`}
          </div>
        </div>
      </a>`;
  }).join("");
}

function renderAll() {
  renderUpcoming();
  renderMine();
  if (state.isAdmin) {
    renderManage();
    renderFinance();
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
    state.uid = auth.currentUser?.uid || null;

    const userDoc = cfg?.userData || (await loadUserDoc(state.uid));
    state.payerKey = (await personKeyFromId(userDoc?.profile?.idNumber || userDoc?.idNumber)) || personKeyFromUid(state.uid);

    document.querySelectorAll("[data-admin-only]").forEach((el) => el.classList.toggle("d-none", !state.isAdmin));
    $("openCreatePickupBtn").classList.toggle("d-none", !state.isAdmin);

    if (state.isAdmin) {
      initManage(ctx);
      initFinance(ctx);
      initSettings(ctx);
      renderSettings();
    }

    await reload();
  } catch (err) {
    console.error("[pickups] init error:", err);
    ctx.alert(err?.message || t("common.error"), "danger");
  } finally {
    hideLoader();
    document.body.classList.remove("loading");
    document.documentElement.classList.remove("preload");
  }
})();
