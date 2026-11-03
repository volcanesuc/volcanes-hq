// /js/features/association/assoc_memberships_list.js
import { db } from "/js/auth/firebase.js";
import { watchAuth, logout } from "/js/auth/auth.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { STR } from "/js/strings/membership_strings.js";
import { openModal } from "/js/ui/modal_host.js";
import { APP_CONFIG } from "/js/config/config.js";

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX, txf } from "/js/strings/screens/assoc_memberships_list.js";

/* =========================
   Collections
========================= */
const COL = APP_CONFIG.collections;
const COL_MEMBERSHIPS = COL.memberships;
const COL_PLANS = COL.subscriptionPlans;

/* =========================
   State
========================= */
let allMemberships = [];
let allPlans = [];
let viewMemberships = [];
let plansById = new Map();

let $ = {};
let _msgListenerBound = false;

/* =========================
   Helpers
========================= */
function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function digitsOnly(s) {
  return (s || "").toString().replace(/\D+/g, "");
}

function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  if (typeof ts?.seconds === "number") return ts.seconds * 1000;
  if (typeof ts?.toDate === "function") {
    const d = ts.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.getTime() : 0;
  }
  const d = new Date(ts);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function fmtMoney(n, cur = "CRC") {
  if (n === null || n === undefined || n === "") return STR.common.dash;
  const v = Number(n);
  if (Number.isNaN(v)) return STR.common.dash;
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(v);
}

function badge(text, cls = "") {
  return `<span class="badge-soft ${cls}">${text}</span>`;
}

function normalizeMembershipStatus(status) {
  const s = String(status || "pending").toLowerCase();

  if (s === "validated" || s === "paid") return "active";
  if (s === "active") return "active";
  if (s === "partial") return "partial";
  if (s === "moroso" || s === "vencido" || s === "expired") return "expired";
  if (s === "rejected") return "rejected";
  return "pending";
}

function statusBadgeHtml(st) {
  const s = normalizeMembershipStatus(st);

  if (s === "active") return badge(TX.activa, "green");
  if (s === "partial") return badge(TX.validando, "yellow");
  if (s === "expired") return badge(TX.vencida, "red");
  if (s === "rejected") return badge(TX.rechazada, "red");
  return badge(TX.pendiente, "gray");
}

function statusRank(st) {
  const s = normalizeMembershipStatus(st);

  if (s === "active") return 5;
  if (s === "partial") return 4;
  if (s === "pending") return 3;
  if (s === "expired") return 2;
  if (s === "rejected") return 1;
  return 0;
}

function payUrl(mid, code) {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/[^/]+$/, "/")}`;
  return `${base}pages/admin/membership_pay.html?mid=${encodeURIComponent(mid)}&code=${encodeURIComponent(code || "")}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    alert(STR.toast.linkCopied);
  } catch {
    prompt(STR.toast.copyPrompt, text);
  }
}

function getOwnerSnapshot(m) {
  return m.userSnapshot || m.associateSnapshot || {};
}

function getOwnerId(m) {
  return m.userId || m.associateId || null;
}

function buildDisplayName(firstName, lastName) {
  return [firstName, lastName]
    .map((x) => (x || "").toString().trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getOwnerName(m) {
  const a = getOwnerSnapshot(m);

  return (
    buildDisplayName(a.firstName, a.lastName) ||
    a.displayName ||
    a.fullName || // fallback legacy
    a.email ||
    STR.common.dash
  );
}


function getOwnerEmail(m) {
  const a = getOwnerSnapshot(m);
  return a.email || null;
}

function getOwnerPhone(m) {
  const a = getOwnerSnapshot(m);
  return a.phone || null;
}

function fmtShortDate(v) {
  if (!v) return null;

  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("es-CR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d);
    }
    return null;
  }

  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      return new Intl.DateTimeFormat("es-CR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(dt);
    }
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function getCoverageRange(m) {
  const start =
    m.coverageStartDate ||
    m.startDate ||
    m.currentMembership?.coverageStartDate ||
    m.currentMembership?.startDate ||
    null;

  const end =
    m.coverageEndDate ||
    m.endDate ||
    m.currentMembership?.coverageEndDate ||
    m.currentMembership?.endDate ||
    null;

  return { start, end };
}

function fmtCoverageRange(m) {
  const { start, end } = getCoverageRange(m);
  const startTxt = fmtShortDate(start);
  const endTxt = fmtShortDate(end);

  if (!startTxt && !endTxt) return "—";
  if (startTxt && endTxt) return `${startTxt} → ${endTxt}`;
  return startTxt || endTxt || "—";
}

/**
 * Clave de deduplicación:
 * - preferimos userId
 * - fallback a associateId legacy
 * - si no, email / phone del snapshot
 */
function membershipKey(m) {
  const season = String(m.season || "—");
  const ownerId = getOwnerId(m);
  if (ownerId) return `owner:${ownerId}::season:${season}`;

  const a = getOwnerSnapshot(m);
  const email = norm(a.email);
  const phone = digitsOnly(a.phone);

  if (email) return `email:${email}::season:${season}`;
  if (phone) return `phone:${phone}::season:${season}`;

  return `mid:${m.id}::season:${season}`;
}

function pickBestMembership(group) {
  const sorted = [...group].sort((a, b) => {
    const ra = statusRank(a.status);
    const rb = statusRank(b.status);
    if (rb !== ra) return rb - ra;

    const ta = Math.max(tsMillis(a.updatedAt), tsMillis(a.createdAt));
    const tb = Math.max(tsMillis(b.updatedAt), tsMillis(b.createdAt));
    return tb - ta;
  });
  return sorted[0] || null;
}

function buildViewMemberships() {
  const map = new Map();

  for (const m of allMemberships) {
    const key = membershipKey(m);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }

  const out = [];
  for (const [key, group] of map.entries()) {
    const best = pickBestMembership(group);
    if (!best) continue;

    out.push({
      ...best,
      _dupKey: key,
      _dupCount: group.length,
      _dupIds: group.map((x) => x.id),
      _hasDup: group.length > 1,
    });
  }

  out.sort((a, b) => {
    const ra = statusRank(a.status);
    const rb = statusRank(b.status);
    if (rb !== ra) return rb - ra;

    const ta = Math.max(tsMillis(a.updatedAt), tsMillis(a.createdAt));
    const tb = Math.max(tsMillis(b.updatedAt), tsMillis(b.createdAt));
    return tb - ta;
  });

  viewMemberships = out;
}

function renderKpis() {
  const counts = { pending: 0, partial: 0, active: 0, expired: 0, rejected: 0 };

  for (const m of viewMemberships) {
    const st = normalizeMembershipStatus(m.status);
    if (st === "pending") counts.pending++;
    else if (st === "partial") counts.partial++;
    else if (st === "active") counts.active++;
    else if (st === "expired") counts.expired++;
    else if (st === "rejected") counts.rejected++;
  }

  if ($.kpiPending) $.kpiPending.textContent = counts.pending;
  if ($.kpiPartial) $.kpiPartial.textContent = counts.partial;
  if ($.kpiActive) $.kpiActive.textContent = counts.active;
  if ($.kpiRejected) $.kpiRejected.textContent = counts.expired + counts.rejected;
  if ($.kpiAll) $.kpiAll.textContent = viewMemberships.length;
}

function cacheDom(container) {
  const root = container || document;

  $.root = root;
  $.logoutBtn = document.getElementById("logoutBtn");
  $.tbody = root.querySelector("#membershipsTbody");
  $.countLabel = root.querySelector("#countLabel");

  $.searchInput = root.querySelector("#searchInput");
  $.seasonFilter = root.querySelector("#seasonFilter");
  $.planFilter = root.querySelector("#planFilter");
  $.statusFilter = root.querySelector("#statusFilter");
  $.actionFilter = root.querySelector("#actionFilter");
  $.statusChips = root.querySelector("#statusChips");
  $.btnClear = root.querySelector("#btnClearFilters");
  $.btnRefresh = root.querySelector("#btnRefresh");
  $.btnNewMembership = root.querySelector("#btnNewMembership");

  $.kpiAll = root.querySelector("#kpiAll");
  $.kpiPending = root.querySelector("#kpiPending");
  $.kpiPartial = root.querySelector("#kpiPartial");
  $.kpiActive = root.querySelector("#kpiActive");
  $.kpiRejected = root.querySelector("#kpiRejected");
}

/* =========================
   Shell
========================= */
function renderShell(container) {
  container.innerHTML = `
    <section class="card">
      <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h2 class="h5 mb-1">${STR.title}</h2>
          <div class="text-muted small">${STR.subtitle}</div>
        </div>
        <div class="d-flex gap-2">
          <button id="btnNewMembership" class="btn btn-primary btn-sm" type="button">
            <i class="bi bi-plus-lg me-1"></i> ${STR.actions?.newMembership || TX.nuevaMembresia}
          </button>
          <button id="btnRefresh" class="btn btn-outline-secondary btn-sm">
            <i class="bi bi-arrow-clockwise me-1"></i> ${STR.actions.refresh}
          </button>
        </div>
      </div>

      <div class="row g-2 mt-3">
        <div class="col-12 col-md-4">
          <input id="searchInput" class="form-control" placeholder="${STR.filters.searchPh}" />
        </div>
        <div class="col-6 col-md-2">
          <select id="seasonFilter" class="form-select">
            <option value="all">${STR.filters.allSeasons}</option>
          </select>
        </div>
        <div class="col-6 col-md-2">
          <select id="planFilter" class="form-select">
            <option value="all">${STR.filters.allPlans}</option>
          </select>
        </div>
        <div class="col-6 col-md-2">
          <select id="statusFilter" class="form-select">
            <option value="all">${STR.filters.allStatus}</option>
            <option value="active">${TX.activa}</option>
            <option value="partial">${TX.validando}</option>
            <option value="pending">${TX.pendiente}</option>
            <option value="expired">${TX.vencida}</option>
            <option value="rejected">${TX.rechazada}</option>
          </select>
        </div>
        <div class="col-6 col-md-2">
          <select id="actionFilter" class="form-select">
            <option value="all">${STR.filters.allActions}</option>
            <option value="needs_action">${STR.filters.needsAction}</option>
            <option value="ok">${STR.filters.ok}</option>
          </select>
        </div>
      </div>

      <div class="row g-2 mt-3">
        <div class="col-6 col-md-3">
          <div class="kpi-box">
            <div class="text-muted small">${STR.kpi.pending}</div>
            <div class="fs-4 fw-bold" id="kpiPending">0</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="kpi-box">
            <div class="text-muted small">${TX.validando}</div>
            <div class="fs-4 fw-bold" id="kpiPartial">0</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="kpi-box">
            <div class="text-muted small">${TX.activas}</div>
            <div class="fs-4 fw-bold" id="kpiActive">0</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="kpi-box">
            <div class="text-muted small">${TX.vencidasRechazadas}</div>
            <div class="fs-4 fw-bold" id="kpiRejected">0</div>
          </div>
        </div>
      </div>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <div id="countLabel" class="text-muted small">${STR.count(0)}</div>
      </div>

      <div class="table-responsive mt-2">
        <table class="table align-middle">
          <thead>
            <tr>
              <th>${STR.table.associate}</th>
              <th>${STR.table.plan}</th>
              <th>${STR.table.season}</th>
              <th>${STR.table.amount}</th>
              <th>${STR.table.status}</th>
              <th class="text-end">${STR.table.actions}</th>
            </tr>
          </thead>
          <tbody id="membershipsTbody">
            <tr><td colspan="6" class="text-muted">${STR.table.loadingRow}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderShellWithoutHeader(container) {
  container.innerHTML = `
    <div class="ui-filterbar mb-2">
      <div class="ui-search">
        <i class="bi bi-search"></i>
        <input id="searchInput" type="search" class="form-control" placeholder="${STR.filters.searchPh}" />
      </div>
      <select id="seasonFilter" class="form-select" aria-label="${STR.filters.allSeasons}">
        <option value="all">${STR.filters.allSeasons}</option>
      </select>
      <select id="planFilter" class="form-select" aria-label="${STR.filters.allPlans}">
        <option value="all">${STR.filters.allPlans}</option>
      </select>
      <button id="btnClearFilters" type="button" class="btn btn-link btn-sm d-none">${TX.limpiar}</button>
      <div class="ms-auto d-flex gap-2">
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button" title="${STR.actions.refresh}">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
        <button id="btnNewMembership" class="btn btn-primary btn-sm" type="button">
          <i class="bi bi-plus-lg me-1"></i> ${STR.actions?.newMembership || TX.nuevaMembresia}
        </button>
      </div>
    </div>

    <!-- estado: chips con contadores (reemplazan los KPIs y los selects de estado/acción) -->
    <input type="hidden" id="statusFilter" value="all" />
    <input type="hidden" id="actionFilter" value="all" />
    <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-1">
      <div class="ui-chips" id="statusChips">
        <button type="button" class="ui-chip is-active" data-status="all">${TX.todas} <span class="ui-chip__n" id="kpiAll">0</span></button>
        <button type="button" class="ui-chip" data-status="pending">${STR.kpi.pending} <span class="ui-chip__n" id="kpiPending">0</span></button>
        <button type="button" class="ui-chip" data-status="partial">${TX.validando} <span class="ui-chip__n" id="kpiPartial">0</span></button>
        <button type="button" class="ui-chip" data-status="active">${TX.activas} <span class="ui-chip__n" id="kpiActive">0</span></button>
        <button type="button" class="ui-chip" data-status="closed">${TX.vencidasRechazadas} <span class="ui-chip__n" id="kpiRejected">0</span></button>
      </div>
      <div id="countLabel" class="text-muted small">${STR.count(0)}</div>
    </div>

    <div class="table-responsive mt-3">
      <table class="table align-middle">
        <thead>
          <tr>
            <th>${STR.table.associate}</th>
            <th>${STR.table.plan}</th>
            <th>${STR.table.season}</th>
            <th>${STR.table.amount}</th>
            <th>${STR.table.status}</th>
            <th class="text-end">${STR.table.actions}</th>
          </tr>
        </thead>
        <tbody id="membershipsTbody">
          <tr><td colspan="6" class="text-muted">${STR.table.loadingRow}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

/* =========================
   Public API
========================= */
export async function mount(container, cfg) {
  // Dentro de Gestión / Ajustes (data-hub) la página ya trae su propio encabezado.
  const inAssociation = !!container.closest("[data-hub]");
  if (inAssociation) renderShellWithoutHeader(container);
  else renderShell(container);

  cacheDom(container);

  $.logoutBtn?.addEventListener("click", logout);
  $.btnNewMembership?.addEventListener("click", () => openModal("partials/membership_assignment_manual.html"));

  if (!_msgListenerBound) {
    _msgListenerBound = true;
    window.addEventListener("message", (ev) => {
      if (ev.origin !== window.location.origin) return;
      const msg = ev.data || {};
      if (msg.type === "membership:created") refreshAll();
    });
  }

  $.btnRefresh?.addEventListener("click", refreshAll);
  $.searchInput?.addEventListener("input", render);

  $.statusChips?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-status]");
    if (!chip || !$.statusFilter) return;
    $.statusFilter.value = chip.dataset.status;
    $.statusChips.querySelectorAll("[data-status]").forEach((el) => el.classList.toggle("is-active", el === chip));
    render();
  });

  $.btnClear?.addEventListener("click", () => {
    if ($.searchInput) $.searchInput.value = "";
    if ($.seasonFilter) $.seasonFilter.value = "all";
    if ($.planFilter) $.planFilter.value = "all";
    if ($.statusFilter) $.statusFilter.value = "all";
    $.statusChips?.querySelectorAll("[data-status]").forEach((el) => el.classList.toggle("is-active", el.dataset.status === "all"));
    render();
  });
  $.seasonFilter?.addEventListener("change", render);
  $.planFilter?.addEventListener("change", render);
  $.statusFilter?.addEventListener("change", render);
  $.actionFilter?.addEventListener("change", render);

  $.tbody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const mid = btn.dataset.mid;
    const code = btn.dataset.code || "";

    if (action === "detail") {
      window.open(
        `pages/admin/membership_detail.html?mid=${encodeURIComponent(mid)}`,
        "_blank",
        "noopener"
      );
      return;
    }

    if (action === "copyPayLink") {
      await copyToClipboard(payUrl(mid, code));
      return;
    }

    if (action === "openPayLink") {
      window.open(payUrl(mid, code), "_blank", "noopener,noreferrer");
    }
  });

  watchAuth(async (user) => {
    if (!user) return;
    await refreshAll();
  });
}

/* =========================
   Load
========================= */
async function refreshAll() {
  showLoader?.(STR.loader.loadingMemberships);
  try {
    await Promise.all([loadPlans(), loadMemberships()]);
    buildViewMemberships();
    fillSeasonFilter();
    fillPlanFilter();
    renderKpis();
    render();
  } catch (e) {
    console.error(e);
    if ($.tbody) {
      $.tbody.innerHTML = `<tr><td colspan="6" class="text-danger">${STR.errors.loadData}</td></tr>`;
    }
  } finally {
    hideLoader?.();
  }
}

async function loadPlans() {
  const snap = await getDocs(collection(db, COL_PLANS));
  allPlans = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !p.archived)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  plansById = new Map(allPlans.map((p) => [p.id, p]));
}

function getPlanForMembership(m) {
  const directPlanId = m.planId || m.currentMembership?.planId || null;
  return plansById.get(directPlanId) || m.planSnapshot || null;
}

async function loadMemberships() {
  const snap = await getDocs(collection(db, COL_MEMBERSHIPS));
  allMemberships = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function fillPlanFilter() {
  if (!$.planFilter) return;

  const curr = $.planFilter.value || "all";
  const opts = [`<option value="all">${STR.filters.allPlans}</option>`].concat(
    allPlans.map((p) => `<option value="${p.id}">${p.name || STR.common.dash}</option>`)
  );

  $.planFilter.innerHTML = opts.join("");
  const exists = [...$.planFilter.options].some((o) => o.value === curr);
  $.planFilter.value = exists ? curr : "all";
}

function fillSeasonFilter() {
  if (!$.seasonFilter) return;

  const curr = $.seasonFilter.value || "all";
  const seasons = Array.from(new Set(viewMemberships.map((m) => m.season).filter(Boolean)))
    .sort((a, b) => String(b).localeCompare(String(a), "es"));

  const opts = [`<option value="all">${STR.filters.allSeasons}</option>`].concat(
    seasons.map((s) => `<option value="${s}">${s}</option>`)
  );

  $.seasonFilter.innerHTML = opts.join("");
  const exists = [...$.seasonFilter.options].some((o) => o.value === curr);
  $.seasonFilter.value = exists ? curr : "all";
}

/* =========================
   Render
========================= */
function render() {
  if (!$.tbody || !$.countLabel) return;

  const qText = norm($.searchInput?.value);
  const seasonVal = $.seasonFilter?.value || "all";
  const planVal = $.planFilter?.value || "all";
  const statusVal = $.statusFilter?.value || "all";
  const actionVal = $.actionFilter?.value || "all";

  let list = [...viewMemberships];

  if (seasonVal !== "all") {
    list = list.filter((m) => (m.season || "all") === seasonVal);
  }

  if (planVal !== "all") {
    list = list.filter((m) => {
      const p = getPlanForMembership(m);
      return (m.planId || p?.id || null) === planVal;
    });
  }

  if (statusVal === "closed") {
    list = list.filter((m) => ["expired", "rejected"].includes(normalizeMembershipStatus(m.status)));
  } else if (statusVal !== "all") {
    list = list.filter((m) => normalizeMembershipStatus(m.status) === statusVal);
  }

  const filtering = !!qText || seasonVal !== "all" || planVal !== "all" || statusVal !== "all";
  $.btnClear?.classList.toggle("d-none", !filtering);

  if (actionVal === "needs_action") {
    list = list.filter((m) => {
      const st = normalizeMembershipStatus(m.status);
      return st === "pending" || st === "partial";
    });
  } else if (actionVal === "ok") {
    list = list.filter((m) => {
      const st = normalizeMembershipStatus(m.status);
      return st === "active";
    });
  }

  if (qText) {
    list = list.filter((m) => {
      const owner = getOwnerSnapshot(m);
      const p = getPlanForMembership(m) || {};
      const coverage = fmtCoverageRange(m);

      const blob = [
        m.id,
        m.season,
        buildDisplayName(owner.firstName, owner.lastName),
        owner.displayName,
        owner.fullName,
        owner.email,
        owner.phone,
        p.name,
        m.userId,
        m.associateId,
        m.coverageStartDate,
        m.coverageEndDate,
        coverage,
      ].map(norm).join(" ");


      return blob.includes(qText);
    });
  }

  $.countLabel.textContent = STR.count(list.length);

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="6" class="text-muted">${STR.table.noResults}</td></tr>`;
    return;
  }

  $.tbody.innerHTML = list.map((m) => {
    const p = getPlanForMembership(m) || {};
    const cur = m.currency || p.currency || "CRC";
    const coverageText = fmtCoverageRange(m);
    const dupBadge = m._hasDup ? badge(txf(TX.duplicadoX, { dupCount: m._dupCount }), "orange") : "";

    const associateCell = `
      <div class="fw-bold tight">${getOwnerName(m)}</div>
      <div class="small text-muted tight">
        ${[getOwnerEmail(m), getOwnerPhone(m)].filter(Boolean).join(" • ") || STR.common.dash}
      </div>
      <div class="small text-muted mono tight">${STR.table.idPrefix} ${m.id}</div>
      ${m.userId ? `<div class="small text-muted mono tight">${txf(TX.uid, { userId: m.userId })}</div>` : ""}
      ${dupBadge ? `<div class="mt-1">${dupBadge}</div>` : ""}
    `;

    const planCell = `
      <div class="fw-bold tight">${p.name || STR.common.dash}</div>
      <div class="small text-muted tight">
        ${(p.allowPartial ? STR.plan.installments : STR.plan.singlePay)} • ${
          p.requiresValidation ? STR.plan.validation : STR.plan.noValidation
        }
      </div>
      <div class="small text-muted tight">
        ${txf(TX.inicio, { value: fmtShortDate(m.coverageStartDate) || "—" })}
      </div>
      <div class="small text-muted tight">
        ${txf(TX.fin, { value: fmtShortDate(m.coverageEndDate) || "—" })}
      </div>
      <div class="small text-muted tight">
        ${txf(TX.cobertura, { coverageText })}
      </div>
    `;

    const totalAmount =
      m.totalAmount ??
      p.totalAmount ??
      p.amount ??
      null;

    const amountTxt = p.allowCustomAmount
      ? STR.amount.editable
      : fmtMoney(totalAmount, cur);

    const actions = `
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-outline-primary" data-action="detail" data-mid="${m.id}">
          <i class="bi bi-eye me-1"></i> ${STR.actions.detail}
        </button>
        <button class="btn btn-outline-dark" data-action="copyPayLink" data-mid="${m.id}" data-code="${m.payCode || ""}">
          <i class="bi bi-clipboard me-1"></i> ${STR.actions.link}
        </button>
        <button class="btn btn-outline-secondary" data-action="openPayLink" data-mid="${m.id}" data-code="${m.payCode || ""}">
          <i class="bi bi-box-arrow-up-right"></i>
        </button>
      </div>
    `;

    return `
      <tr>
        <td>${associateCell}</td>
        <td>${planCell}</td>
        <td><span class="mono">${m.season || STR.common.dash}</span></td>
        <td style="white-space:nowrap;">${amountTxt}</td>
        <td>${statusBadgeHtml(m.status)}</td>
        <td class="text-end">${actions}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   ejecución standalone
========================= */
async function autoMountIfStandalone() {
  const marker = document.querySelector('[data-page="assoc_memberships_list"]');
  if (!marker) return;

  const container = document.getElementById("page-content") || document.body;
  await mount(container);
}

autoMountIfStandalone();