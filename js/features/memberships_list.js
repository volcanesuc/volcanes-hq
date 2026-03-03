// js/features/memberships_list.js
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { STR } from "../strings/membership_strings.js";
import { openModal } from "../ui/modal_host.js";

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Collections
========================= */
const COL_MEMBERSHIPS = "memberships";
const COL_PLANS = "subscription_plans";

/* =========================
   State
========================= */
let allMemberships = [];
let allPlans = [];
let viewMemberships = []; // 👈 lo que renderizamos (dedup)

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
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
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

function statusBadgeHtml(st) {
  const s = (st || "pending").toLowerCase();
  if (s === "validated") return badge(STR.status.validated, "green");
  if (s === "paid") return badge(STR.status.paid, "yellow");
  if (s === "partial") return badge(STR.status.partial, "yellow");
  if (s === "rejected") return badge(STR.status.rejected, "red");
  return badge(STR.status.pending, "gray");
}

function statusRank(st) {
  // más alto = mejor
  const s = (st || "pending").toLowerCase();
  if (s === "validated") return 5;
  if (s === "paid") return 4;
  if (s === "partial") return 3;
  if (s === "pending") return 2;
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

/**
 * Clave de deduplicación:
 * - preferimos associateId (si existe en el doc membership)
 * - si no, fallback a email / phone del associateSnapshot
 */
function membershipKey(m) {
  const season = String(m.season || "—");
  const aid = m.associateId || null;
  if (aid) return `aid:${aid}::season:${season}`;

  const a = m.associateSnapshot || {};
  const email = norm(a.email);
  const phone = digitsOnly(a.phone);

  if (email) return `email:${email}::season:${season}`;
  if (phone) return `phone:${phone}::season:${season}`;

  // peor caso: cae a id (no dedup)
  return `mid:${m.id}::season:${season}`;
}

/**
 * Escoger la mejor membership de un grupo:
 * 1) statusRank mayor
 * 2) updatedAt/createdAt más reciente
 */
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

/**
 * Construye viewMemberships (dedup) y deja metadata de duplicados
 */
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

  // orden general: más reciente primero (por createdAt/updatedAt)
  out.sort((a, b) => {
    const ta = Math.max(tsMillis(a.updatedAt), tsMillis(a.createdAt));
    const tb = Math.max(tsMillis(b.updatedAt), tsMillis(b.createdAt));
    return tb - ta;
  });

  viewMemberships = out;
}

function renderKpis() {
  const counts = { pending: 0, partial: 0, paid: 0, validated: 0 };

  for (const m of viewMemberships) {
    const st = (m.status || "pending").toLowerCase();
    if (st === "pending") counts.pending++;
    else if (st === "partial") counts.partial++;
    else if (st === "paid") counts.paid++;
    else if (st === "validated") counts.validated++;
  }

  if ($.kpiPending) $.kpiPending.textContent = counts.pending;
  if ($.kpiPartial) $.kpiPartial.textContent = counts.partial;
  if ($.kpiPaid) $.kpiPaid.textContent = counts.paid;
  if ($.kpiValidated) $.kpiValidated.textContent = counts.validated;
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
  $.btnRefresh = root.querySelector("#btnRefresh");
  $.btnNewMembership = root.querySelector("#btnNewMembership");

  $.kpiPending = root.querySelector("#kpiPending");
  $.kpiPartial = root.querySelector("#kpiPartial");
  $.kpiPaid = root.querySelector("#kpiPaid");
  $.kpiValidated = root.querySelector("#kpiValidated");
}

/* =========================
   Shell (igual que el tuyo)
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
            <i class="bi bi-plus-lg me-1"></i> ${STR.actions?.newMembership || "Nueva membresía"}
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
            <option value="pending">${STR.status.pending}</option>
            <option value="partial">${STR.status.partial}</option>
            <option value="paid">${STR.status.paid}</option>
            <option value="validated">${STR.status.validated}</option>
            <option value="rejected">${STR.status.rejected}</option>
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
            <div class="text-muted small">${STR.kpi.partial}</div>
            <div class="fs-4 fw-bold" id="kpiPartial">0</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="kpi-box">
            <div class="text-muted small">${STR.kpi.paid}</div>
            <div class="fs-4 fw-bold" id="kpiPaid">0</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="kpi-box">
            <div class="text-muted small">${STR.kpi.validated}</div>
            <div class="fs-4 fw-bold" id="kpiValidated">0</div>
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
  // igual que tu versión (la dejo igual)
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
      <div id="countLabel" class="text-muted small">${STR.count(0)}</div>
      <div class="d-flex gap-2">
        <button id="btnNewMembership" class="btn btn-primary btn-sm" type="button">
          <i class="bi bi-plus-circle me-1"></i> ${STR.actions?.newMembership || "Nueva membresía"}
        </button>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm">
          <i class="bi bi-arrow-clockwise me-1"></i> ${STR.actions.refresh}
        </button>
      </div>
    </div>

    <div class="row g-2">
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
          <option value="pending">${STR.status.pending}</option>
          <option value="partial">${STR.status.partial}</option>
          <option value="paid">${STR.status.paid}</option>
          <option value="validated">${STR.status.validated}</option>
          <option value="rejected">${STR.status.rejected}</option>
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
          <div class="text-muted small">${STR.kpi.partial}</div>
          <div class="fs-4 fw-bold" id="kpiPartial">0</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-box">
          <div class="text-muted small">${STR.kpi.paid}</div>
          <div class="fs-4 fw-bold" id="kpiPaid">0</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-box">
          <div class="text-muted small">${STR.kpi.validated}</div>
          <div class="fs-4 fw-bold" id="kpiValidated">0</div>
        </div>
      </div>
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
  const inAssociation = window.location.pathname.endsWith("/association.html");
  if (inAssociation) renderShellWithoutHeader(container);
  else renderShell(container);

  cacheDom(container);

  $.logoutBtn?.addEventListener("click", logout);

  $.btnNewMembership?.addEventListener("click", () => openModal("partials/membership_modal.html"));

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
      window.open(`pages/admin/membership_detail.html?mid=${encodeURIComponent(mid)}`, "_blank", "noopener");
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

    // 👇 clave del fix visual
    buildViewMemberships();

    fillSeasonFilter();
    fillPlanFilter();
    renderKpis();
    render();
  } catch (e) {
    console.error(e);
    if ($.tbody) $.tbody.innerHTML = `<tr><td colspan="6" class="text-danger">${STR.errors.loadData}</td></tr>`;
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
  const seasons = Array.from(new Set(viewMemberships.map((m) => m.season).filter(Boolean))).sort((a, b) =>
    String(b).localeCompare(String(a), "es")
  );

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

  if (seasonVal !== "all") list = list.filter((m) => (m.season || "all") === seasonVal);
  if (planVal !== "all") list = list.filter((m) => (m.planId || m.planSnapshot?.id) === planVal);
  if (statusVal !== "all") list = list.filter((m) => (m.status || "pending").toLowerCase() === statusVal);

  if (actionVal === "needs_action") {
    list = list.filter((m) => {
      const st = (m.status || "pending").toLowerCase();
      return st === "pending" || st === "partial";
    });
  } else if (actionVal === "ok") {
    list = list.filter((m) => {
      const st = (m.status || "pending").toLowerCase();
      return st === "paid" || st === "validated";
    });
  }

  if (qText) {
    list = list.filter((m) => {
      const a = m.associateSnapshot || {};
      const p = m.planSnapshot || {};
      const blob = [m.id, m.season, a.fullName, a.email, a.phone, p.name].map(norm).join(" ");
      return blob.includes(qText);
    });
  }

  $.countLabel.textContent = STR.count(list.length);

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="6" class="text-muted">${STR.table.noResults}</td></tr>`;
    return;
  }

  $.tbody.innerHTML = list
    .map((m) => {
      const a = m.associateSnapshot || {};
      const p = m.planSnapshot || {};
      const cur = m.currency || p.currency || "CRC";

      const dupBadge = m._hasDup ? badge(`Duplicado x${m._dupCount}`, "orange") : "";

      const associateCell = `
        <div class="fw-bold tight">${a.fullName || STR.common.dash}</div>
        <div class="small text-muted tight">
          ${[a.email || null, a.phone || null].filter(Boolean).join(" • ") || STR.common.dash}
        </div>
        <div class="small text-muted mono tight">${STR.table.idPrefix} ${m.id}</div>
        ${dupBadge ? `<div class="mt-1">${dupBadge}</div>` : ""}
      `;

      const planCell = `
        <div class="fw-bold tight">${p.name || STR.common.dash}</div>
        <div class="small text-muted tight">
          ${(p.allowPartial ? STR.plan.installments : STR.plan.singlePay)} • ${
            p.requiresValidation ? STR.plan.validation : STR.plan.noValidation
          }
        </div>
      `;

      const amountTxt = p.allowCustomAmount ? STR.amount.editable : fmtMoney(m.totalAmount ?? p.totalAmount, cur);

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
    })
    .join("");
}

/* =========================
   ejecución standalone
========================= */
async function autoMountIfStandalone() {
  const marker = document.querySelector('[data-page="memberships_list"]');
  if (!marker) return;

  const container = document.getElementById("page-content") || document.body;
  await mount(container);
}

autoMountIfStandalone();
