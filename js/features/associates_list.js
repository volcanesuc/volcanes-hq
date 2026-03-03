// js/features/associates_list.js
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

const COL_ASSOCIATES = "associates";
const COL_MEMBERSHIPS = "memberships";
const COL_PLANS = "subscription_plans";

// state
let all = [];
let $ = {};
let _cfg = {};

/* =========================
   Date helpers (season policy)
========================= */
function seasonStartDate(season, startPolicy) {
  const y = Number(season);
  if (!Number.isFinite(y)) return new Date(new Date().getFullYear(), 0, 1);

  // por ahora solo "jan" (podemos ampliar a JAN_OR_JUL, ANY, etc luego)
  if ((startPolicy || "jan") === "jan") return new Date(y, 0, 1);
  return new Date(y, 0, 1);
}

function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
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

  // ✅ top
  if (s === "validated") return 50;
  if (s === "paid") return 40;

  // ✅ mid
  if (s === "partial") return 30;

  // ✅ “en revisión”
  if (s === "submitted" || s === "validating") return 20;

  // ✅ base
  if (s === "pending") return 10;

  // ✅ low
  if (s === "rejected") return 5;

  return 0;
}

/**
 * Elige la membresía "más relevante" para el asociado en la temporada.
 * Orden:
 * 1) statusRank
 * 2) lastPaymentAt (si existe)
 * 3) updatedAt / createdAt
 */
function pickBestMembership(list) {
  if (!list?.length) return null;

  const sorted = [...list].sort((a, b) => {
    const ra = statusRank(a.status);
    const rb = statusRank(b.status);
    if (rb !== ra) return rb - ra;

    // 🔥 evidencia de pago
    const pa = tsMillis(a.lastPaymentAt);
    const pb = tsMillis(b.lastPaymentAt);
    if (pb !== pa) return pb - pa;

    // fallback: reciente
    const ta = Math.max(tsMillis(a.updatedAt), tsMillis(a.createdAt));
    const tb = Math.max(tsMillis(b.updatedAt), tsMillis(b.createdAt));
    return tb - ta;
  });

  return sorted[0] || null;
}

function assocKeyFromMembership(membership, associateActive = true) {
  if (associateActive === false) return "inactive";
  if (!membership) return "pending";

  const s = (membership.status || "").toLowerCase();

  // si está en revisión, no es moroso
  if (s === "submitted" || s === "validating") return "validating";

  const total = Number(membership.installmentsTotal || 0);
  const settled = Number(membership.installmentsSettled || 0);

  // Plan por cuotas
  if (total > 0) {
    if (settled <= 0) return "pending";

    const dueStr = membership.nextUnpaidDueDate; // "YYYY-MM-DD"
    if (!dueStr) return "up_to_date"; // no quedan cuotas

    const due = new Date(dueStr + "T00:00:00");
    const now = new Date();

    return now > due ? "overdue" : "up_to_date";
  }

  // Pago único
  if (s === "validated" || s === "paid") return "up_to_date";
  return "pending";
}



/* =========================
   UI helpers
========================= */
function normalize(s) {
  return (s || "").toString().toLowerCase().trim();
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

function assocBadge(key, membership) {
  const prog = progressText(membership);
  const suffix = prog ? ` • ${prog}` : "";

  if (key === "up_to_date") return badge(`Al día${suffix}`, "green");
  if (key === "validating") return badge(`Validando${suffix}`, "yellow");
  if (key === "overdue") return badge(`Vencido${suffix}`, "red");
  if (key === "inactive") return badge("Inactivo", "gray");
  return badge(`Pendiente${suffix}`, "orange");
}

/**
 * ✅ “Moroso” recomendado:
 * - Activo y (pendiente o vencido)
 * - “Validando” NO debería ser moroso (ya mandó comprobante)
 */
function isMoroso(assocKey, associateActive) {
  if (associateActive === false) return false;
  return assocKey === "pending" || assocKey === "overdue";
}

function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
  $.statusFilter = container.querySelector("#statusFilter");
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

      <div class="col-6 col-md-2">
        <label class="form-label mb-1">Estado (perfil)</label>
        <select id="statusFilter" class="form-select">
          <option value="all" selected>Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
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
                <th>Asociado</th>
                <th>Contacto</th>
                <th>Tipo</th>
                <th>Asociación</th>
                <th>Estado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="associatesTbody">
              <tr><td colspan="6" class="text-muted">Cargando…</td></tr>
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
async function loadMembershipMapForSeason(season, associateIds) {
  const byAid = {}; // aid -> [membership,...]
  const groups = chunk(associateIds.filter(Boolean), 10);

  for (const ids of groups) {
    const q = query(
      collection(db, COL_MEMBERSHIPS),
      where("season", "==", season),
      where("associateId", "in", ids)
    );
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const m = d.data();
      if (!m?.associateId) return;
      if (!byAid[m.associateId]) byAid[m.associateId] = [];
      byAid[m.associateId].push({ id: d.id, ...m });
    });
  }

  const map = {};
  Object.keys(byAid).forEach((aid) => {
    map[aid] = pickBestMembership(byAid[aid]);
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
    const q = query(collection(db, COL_ASSOCIATES), orderBy("fullName", "asc"));
    const snap = await getDocs(q);
    const associates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const season = (_cfg?.season || new Date().getFullYear().toString());
    const ids = associates.map((a) => a.id);

    const membershipMap = await loadMembershipMapForSeason(season, ids);

    const planIds = Object.values(membershipMap).map((m) => m?.planId);
    const plansMap = await loadPlansMap(planIds);

    all = associates.map((a) => {
      const isActive = a.active !== false;
      const membership = membershipMap[a.id] || null;

      if (membership && !membership.planSnapshot && membership.planId && plansMap[membership.planId]) {
        membership._plan = plansMap[membership.planId];
      } else if (membership) {
        membership._plan = null;
      }

      const assocKey = assocKeyFromMembership(membership, isActive);

      return {
        ...a,
        membership,
        _season: season,
        _assocKey: assocKey,
        _isMoroso: isMoroso(assocKey, isActive),
      };
    });

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
   Helper
========================= */

function progressText(membership) {
  const total = Number(membership?.installmentsTotal || 0);
  const settled = Number(membership?.installmentsSettled || 0);
  if (!total) return "";

  const next = membership?.nextUnpaidDueDate;
  return `${settled}/${total} cuotas`;
  //const nextTxt = next ? ` • Próx: ${next}` : "";
  //return `${settled}/${total} cuotas${nextTxt}`;
}

function baseDir() {
  // .../asociacion.html -> .../
  const p = window.location.pathname.replace(/\/[^/]+$/, "/");
  return `${window.location.origin}${p}`;
}

function payUrlForMembership(m) {
  if (!m?.id || !m?.payCode) return null;
  return `${baseDir()}pages/admin/membership_pay.html?mid=${encodeURIComponent(m.id)}&code=${encodeURIComponent(m.payCode)}`;
}

function normalizePhoneForWa(phone) {
  // wa.me quiere: countrycode + number, sin '+'
  const digits = String(phone || "").replace(/\D+/g, "");
  if (!digits) return null;

  // Costa Rica: 8 dígitos locales -> prefijo 506
  if (digits.length === 8) return "506" + digits;

  // Si ya viene con 506 y 11 dígitos
  if (digits.length === 11 && digits.startsWith("506")) return digits;

  // Si viene con +506 ya quedó limpio arriba.
  // Para otros largos, lo devolvemos como esté (mejor que nada)
  return digits;
}

function whatsappLink(phone, text) {
  const p = normalizePhoneForWa(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(text || "")}`;
}


/* =========================
   Render
========================= */
function render() {
  if (!$.tbody || !$.countLabel) return;

  const qText = normalize($.searchInput?.value);
  const typeVal = $.typeFilter?.value || "all";
  const statusVal = $.statusFilter?.value || "all";
  const assocVal = $.assocFilter?.value || "all";

  let list = [...all];

  // filters
  if (typeVal !== "all") list = list.filter((a) => (a.type || "other") === typeVal);

  if (statusVal === "active") list = list.filter((a) => a.active !== false);
  else if (statusVal === "inactive") list = list.filter((a) => a.active === false);

  if (assocVal !== "all") {
    if (assocVal === "moroso") list = list.filter((a) => a._isMoroso);
    else list = list.filter((a) => a._assocKey === assocVal);
  }

  if (qText) {
    list = list.filter((a) => {
      const fullName = normalize(a.fullName);
      const email = normalize(a.email);
      const phone = normalize(a.phone);
      return fullName.includes(qText) || email.includes(qText) || phone.includes(qText);
    });
  }

  $.countLabel.textContent = `${list.length}`;

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No hay miembros con esos filtros.</td></tr>`;
    return;
  }

  // helpers local
  const baseDir = () => {
    const p = window.location.pathname.replace(/\/[^/]+$/, "/");
    return `${window.location.origin}${p}`;
  };

  const payUrlForMembership = (m) => {
    if (!m?.id || !m?.payCode) return null;
    return `${baseDir()}pages/admin/membership_pay.html?mid=${encodeURIComponent(m.id)}&code=${encodeURIComponent(m.payCode)}`;
  };

  const waMsgFor = (payLink) =>
    payLink
      ? `Hola! Recordatorio de pago a la asociación usando el siguiente link ${payLink}`
      : `Hola! Recordatorio de pago a la asociación.`;

  $.tbody.innerHTML = list
    .map((a) => {
      const isActive = a.active !== false;
      const perfilBadge = isActive ? badge("Activo", "yellow") : badge("Inactivo", "gray");

      const m = a.membership || null;
      const asocBadgeHtml = assocBadge(a._assocKey, m);

      // contacto clickeable
      const emailHtml = a.email
        ? `<div><a href="mailto:${a.email}" class="link-dark text-decoration-none">${a.email}</a></div>`
        : "";

      const phoneHtml = a.phone
        ? (() => {
            const telHref = `tel:${String(a.phone).replace(/\s+/g, "")}`;
            const waQuick = whatsappLink(a.phone, "Hola!");
            const waBtn = waQuick
              ? `<a class="ms-2 small text-decoration-none" href="${waQuick}" target="_blank" rel="noreferrer" title="WhatsApp">
                   <i class="bi bi-whatsapp"></i>
                 </a>`
              : "";
            return `<div class="text-muted small">
                      <a href="${telHref}" class="link-dark text-decoration-none">${a.phone}</a>
                      ${waBtn}
                    </div>`;
          })()
        : "";

      const contactoHtml = (emailHtml || phoneHtml)
        ? `${emailHtml}${phoneHtml}`
        : `<span class="text-muted">—</span>`;

      // acción WhatsApp recordatorio SOLO si moroso (pending u overdue)
      const payLink = payUrlForMembership(m);
      const waHref = a._isMoroso ? whatsappLink(a.phone, waMsgFor(payLink)) : null;

      const waActionBtn =
        a._isMoroso && waHref
          ? `<a class="btn btn-sm btn-outline-success" href="${waHref}" target="_blank" rel="noreferrer" title="Enviar WhatsApp">
               <i class="bi bi-whatsapp me-1"></i> WhatsApp
             </a>`
          : "";

      return `
        <tr>
          <td>
            <div class="fw-bold">${a.fullName || "—"}</div>
            ${a.idNumber ? `<div class="text-muted small">Cédula: ${a.idNumber}</div>` : ""}
          </td>

          <td>${contactoHtml}</td>

          <td>${typeLabel(a.type)}</td>

          <td>${asocBadgeHtml}</td>

          <td>${perfilBadge}</td>

          <td class="text-end">
            <div class="d-inline-flex gap-2">
              ${waActionBtn}
              <button class="btn btn-sm btn-outline-primary btnEdit" data-id="${a.id}" type="button">
                <i class="bi bi-pencil me-1"></i> Editar
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  $.root.querySelectorAll(".btnEdit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      openModal(`partials/associate_modal.html?aid=${encodeURIComponent(id)}`);
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
  $.statusFilter?.addEventListener("change", render);
  $.assocFilter?.addEventListener("change", render);

  $.btnNewAssociate?.addEventListener("click", () => openModal(`partials/associate_modal.html`));

  watchAuth(async (user) => {
    if (!user) return;
    await loadAssociates();
  });
}
