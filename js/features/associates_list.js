// /js/features/associates_list.js
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { openModal } from "../ui/modal_host.js";

import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  documentId,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_USERS = "users";
const COL_MEMBERSHIPS = "memberships";
const COL_PLANS = "subscription_plans";

// state
let all = [];
let $ = {};
let _cfg = {};

/* =========================
   Helpers
========================= */
function normalize(s) {
  return (s || "").toString().toLowerCase().trim();
}

function tsMillis(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function statusRank(st) {
  const s = (st || "pending").toLowerCase();

  if (s === "validated") return 50;
  if (s === "paid") return 40;
  if (s === "partial") return 30;
  if (s === "submitted" || s === "validating") return 20;
  if (s === "pending") return 10;
  if (s === "rejected") return 5;

  return 0;
}

function pickBestMembership(list) {
  if (!list?.length) return null;

  const sorted = [...list].sort((a, b) => {
    const ra = statusRank(a.status);
    const rb = statusRank(b.status);
    if (rb !== ra) return rb - ra;

    const pa = tsMillis(a.lastPaymentAt);
    const pb = tsMillis(b.lastPaymentAt);
    if (pb !== pa) return pb - pa;

    const ta = Math.max(tsMillis(a.updatedAt), tsMillis(a.createdAt));
    const tb = Math.max(tsMillis(b.updatedAt), tsMillis(b.createdAt));
    return tb - ta;
  });

  return sorted[0] || null;
}

function userKeyFromMembership(membership) {
  if (!membership) return "pending";

  const s = (membership.status || "").toLowerCase();

  if (s === "submitted" || s === "validating") return "validating";

  const total = Number(membership.installmentsTotal || 0);
  const settled = Number(membership.installmentsSettled || 0);

  if (total > 0) {
    if (settled <= 0) return "pending";

    const dueStr = membership.nextUnpaidDueDate;
    if (!dueStr) return "up_to_date";

    const due = new Date(dueStr + "T00:00:00");
    const now = new Date();

    return now > due ? "overdue" : "up_to_date";
  }

  if (s === "validated" || s === "paid") return "up_to_date";
  return "pending";
}

function badge(text, cls = "") {
  return `<span class="badge-soft ${cls}">${text}</span>`;
}

function typeLabel(t) {
  const map = {
    player: "Jugador/a",
    supporter: "Supporter",
    parent: "Encargado/a",
    other: "Otro",
  };
  return map[t] || "—";
}

function membershipBadge(key, membership) {
  const prog = progressText(membership);
  const suffix = prog ? ` • ${prog}` : "";

  if (key === "up_to_date") return badge(`Al día${suffix}`, "green");
  if (key === "validating") return badge(`Validando${suffix}`, "yellow");
  if (key === "overdue") return badge(`Vencido${suffix}`, "red");
  if (key === "inactive") return badge("Inactivo", "gray");
  return badge(`Pendiente${suffix}`, "orange");
}

function isMoroso(membershipKey) {
  return membershipKey === "pending" || membershipKey === "overdue";
}

function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getFullName(user) {
  const profile = user?.profile || {};
  const first = profile.firstName || "";
  const last = profile.lastName || "";
  const full = `${first} ${last}`.trim();
  return full || user?.displayName || "—";
}

function getUserType(user) {
  return user?.profile?.type || "other";
}

function getUserPhone(user) {
  return user?.profile?.phone || user?.phone || "";
}

function getUserIdNumber(user) {
  return user?.profile?.idNumber || "";
}

function progressText(membership) {
  const total = Number(membership?.installmentsTotal || 0);
  const settled = Number(membership?.installmentsSettled || 0);
  if (!total) return "";
  return `${settled}/${total} cuotas`;
}

function baseDir() {
  const p = window.location.pathname.replace(/\/[^/]+$/, "/");
  return `${window.location.origin}${p}`;
}

function payUrlForMembership(m) {
  if (!m?.id || !m?.payCode) return null;
  return `${baseDir()}pages/admin/membership_pay.html?mid=${encodeURIComponent(m.id)}&code=${encodeURIComponent(m.payCode)}`;
}

function normalizePhoneForWa(phone) {
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length === 8) return "506" + digits;
  if (digits.length === 11 && digits.startsWith("506")) return digits;
  return digits;
}

function whatsappLink(phone, text) {
  const p = normalizePhoneForWa(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text || "")}`;
}

/* =========================
   DOM
========================= */
function cacheDom(container) {
  $.root = container;

  $.logoutBtn = document.getElementById("logoutBtn");

  $.tbody = container.querySelector("#associatesTbody");
  $.countLabel = container.querySelector("#countLabel");

  $.searchInput = container.querySelector("#searchInput");
  $.typeFilter = container.querySelector("#typeFilter");
  $.assocFilter = container.querySelector("#associationFilter");

  $.btnRefresh = container.querySelector("#btnRefresh");
  $.btnNewAssociate = container.querySelector("#btnNewAssociate");
}

function renderShell(container) {
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
      <div>
        <div class="text-muted small">Listado de miembros con filtros y acceso a edición.</div>
      </div>
      <div class="d-flex gap-2">
        <button id="btnNewAssociate" class="btn btn-primary btn-sm" type="button">
          <i class="bi bi-plus-lg me-1"></i> Nuevo
        </button>
        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button">
          <i class="bi bi-arrow-clockwise me-1"></i> Actualizar
        </button>
      </div>
    </div>

    <div class="row g-2 align-items-end mb-3">
      <div class="col-12 col-md-4">
        <label class="form-label mb-1">Buscar</label>
        <input id="searchInput" class="form-control" placeholder="Nombre, email o teléfono…" />
      </div>

      <div class="col-6 col-md-2">
        <label class="form-label mb-1">Tipo</label>
        <select id="typeFilter" class="form-select">
          <option value="all" selected>Todos</option>
          <option value="player">Jugador/a</option>
          <option value="supporter">Supporter</option>
          <option value="parent">Encargado/a</option>
          <option value="other">Otro</option>
        </select>
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label mb-1">Asociación</label>
        <select id="associationFilter" class="form-select">
          <option value="all" selected>Todos</option>
          <option value="up_to_date">Al día</option>
          <option value="moroso">Morosos</option>
          <option value="pending">Pendiente</option>
          <option value="validating">Validando</option>
          <option value="overdue">Vencido</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>

      <div class="col-6 col-md-1">
        <div class="text-muted small mb-1">&nbsp;</div>
        <div id="countLabel" class="text-muted small">—</div>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Contacto</th>
                <th>Tipo</th>
                <th>Asociación</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="associatesTbody">
              <tr><td colspan="5" class="text-muted">Cargando…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/* =========================
   Data
========================= */
async function loadMembershipMapForSeason(season, userIds) {
  const byUid = {};
  const groups = chunk(userIds.filter(Boolean), 10);

  for (const ids of groups) {
    const q = query(
      collection(db, COL_MEMBERSHIPS),
      where("season", "==", season),
      where("userId", "in", ids)
    );

    const snap = await getDocs(q);
    snap.forEach((d) => {
      const m = d.data();
      if (!m?.userId) return;
      if (!byUid[m.userId]) byUid[m.userId] = [];
      byUid[m.userId].push({ id: d.id, ...m });
    });
  }

  const map = {};
  Object.keys(byUid).forEach((uid) => {
    map[uid] = pickBestMembership(byUid[uid]);
  });

  return map;
}

async function loadPlansMap(planIds) {
  const ids = [...new Set((planIds || []).filter(Boolean))];
  const map = {};
  const groups = chunk(ids, 10);

  for (const g of groups) {
    const q = query(collection(db, COL_PLANS), where(documentId(), "in", g));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      map[d.id] = { id: d.id, ...d.data() };
    });
  }

  return map;
}

async function loadAssociates() {
  showLoader?.("Cargando Miembros…");
  try {
    const q = query(collection(db, COL_USERS), orderBy("displayName", "asc"));
    const snap = await getDocs(q);

    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const season = (_cfg?.season || new Date().getFullYear().toString());
    const ids = users.map((u) => u.id);

    const membershipMap = await loadMembershipMapForSeason(season, ids);
    const planIds = Object.values(membershipMap).map((m) => m?.planId);
    const plansMap = await loadPlansMap(planIds);

    all = users.map((u) => {
      const membership = membershipMap[u.id] || null;

      if (membership && !membership.planSnapshot && membership.planId && plansMap[membership.planId]) {
        membership._plan = plansMap[membership.planId];
      } else if (membership) {
        membership._plan = null;
      }

      const membershipKey = userKeyFromMembership(membership);

      return {
        ...u,
        membership,
        _season: season,
        _assocKey: membershipKey,
        _isMoroso: isMoroso(membershipKey),
      };
    }).sort((a, b) =>
      getFullName(a).localeCompare(getFullName(b), "es", { sensitivity: "base" })
    );

    render();
  } catch (err) {
    console.error("[associates_list] load error", err);
    if ($.tbody) {
      $.tbody.innerHTML = `
        <tr><td colspan="6" class="text-danger">
          Error cargando miembros: ${String(err?.message || err)}
        </td></tr>
      `;
    }
  } finally {
    hideLoader?.();
  }
}

/* =========================
   Render
========================= */
function render() {
  if (!$.tbody || !$.countLabel) return;

  const qText = normalize($.searchInput?.value);
  const typeVal = $.typeFilter?.value || "all";
  const assocVal = $.assocFilter?.value || "all";

  let list = [...all];

  if (typeVal !== "all") list = list.filter((u) => getUserType(u) === typeVal);

  if (assocVal !== "all") {
    if (assocVal === "moroso") list = list.filter((u) => u._isMoroso);
    else list = list.filter((u) => u._assocKey === assocVal);
  }

  if (qText) {
    list = list.filter((u) => {
      const fullName = normalize(getFullName(u));
      const email = normalize(u.email);
      const phone = normalize(getUserPhone(u));
      return fullName.includes(qText) || email.includes(qText) || phone.includes(qText);
    });
  }

  $.countLabel.textContent = `${list.length}`;

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No hay miembros con esos filtros.</td></tr>`;
    return;
  }

  const waMsgFor = (payLink) =>
    payLink
      ? `Hola! Recordatorio de pago a la asociación usando el siguiente link ${payLink}`
      : `Hola! Recordatorio de pago a la asociación.`;

  $.tbody.innerHTML = list.map((u) => {

    const m = u.membership || null;
    const asocBadgeHtml = membershipBadge(u._assocKey, m);

    const fullName = getFullName(u);
    const emailVal = u.email || "";
    const phoneVal = getUserPhone(u);
    const idNumber = getUserIdNumber(u);

    const emailHtml = emailVal
      ? `<div><a href="mailto:${emailVal}" class="link-dark text-decoration-none">${emailVal}</a></div>`
      : "";

    const phoneHtml = phoneVal
      ? (() => {
          const telHref = `tel:${String(phoneVal).replace(/\s+/g, "")}`;
          const waQuick = whatsappLink(phoneVal, "Hola!");
          const waBtn = waQuick
            ? `<a class="ms-2 small text-decoration-none" href="${waQuick}" target="_blank" rel="noreferrer" title="WhatsApp">
                 <i class="bi bi-whatsapp"></i>
               </a>`
            : "";

          return `<div class="text-muted small">
                    <a href="${telHref}" class="link-dark text-decoration-none">${phoneVal}</a>
                    ${waBtn}
                  </div>`;
        })()
      : "";

    const contactoHtml = (emailHtml || phoneHtml)
      ? `${emailHtml}${phoneHtml}`
      : `<span class="text-muted">—</span>`;

    const payLink = payUrlForMembership(m);
    const waHref = u._isMoroso ? whatsappLink(phoneVal, waMsgFor(payLink)) : null;

    const waActionBtn =
      u._isMoroso && waHref
        ? `<a class="btn btn-sm btn-outline-success" href="${waHref}" target="_blank" rel="noreferrer" title="Enviar WhatsApp">
             <i class="bi bi-whatsapp me-1"></i> WhatsApp
           </a>`
        : "";

    return `
      <tr>
        <td>
          <div class="fw-bold">${fullName || "—"}</div>
          ${idNumber ? `<div class="text-muted small">Cédula: ${idNumber}</div>` : ""}
        </td>

        <td>${contactoHtml}</td>

        <td>${typeLabel(getUserType(u))}</td>

        <td>${asocBadgeHtml}</td>

        <td class="text-end">
          <div class="d-inline-flex gap-2">
            ${waActionBtn}
            <button class="btn btn-sm btn-outline-primary btnEdit" data-id="${u.id}" type="button">
              <i class="bi bi-pencil me-1"></i> Editar
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  $.root.querySelectorAll(".btnEdit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      openModal(`partials/user_modal.html?uid=${encodeURIComponent(id)}`);
    });
  });
}

/* =========================
   Public API
========================= */
export async function mount(container, cfg) {
  _cfg = cfg || {};

  renderShell(container);
  cacheDom(container);

  $.logoutBtn?.addEventListener("click", logout);

  $.btnRefresh?.addEventListener("click", loadAssociates);
  $.searchInput?.addEventListener("input", render);
  $.typeFilter?.addEventListener("change", render);
  $.assocFilter?.addEventListener("change", render);

  $.btnNewAssociate?.addEventListener("click", () => openModal(`partials/user_modal.html`));

  watchAuth(async (user) => {
    if (!user) return;
    await loadAssociates();
  });
}