// /js/features/association/assoc_members_list.js
import { db } from "/js/auth/firebase.js";
import { watchAuth, logout } from "/js/auth/auth.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { APP_CONFIG } from "/js/config/config.js";
import { loadPartialOnce } from "/js/ui/loadPartial.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;

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

function getFullName(user) {
  const profile = user?.profile || {};
  const first = profile.firstName || "";
  const last = profile.lastName || "";
  const full = `${first} ${last}`.trim();
  return full || profile.fullName || user?.displayName || "—";
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

function progressText(cm) {
  const total = Number(cm?.installmentsTotal || 0);
  const settled = Number(cm?.installmentsSettled || 0);
  if (!total) return "";
  return `${settled}/${total} cuotas`;
}

function baseDir() {
  const p = window.location.pathname.replace(/\/[^/]+$/, "/");
  return `${window.location.origin}${p}`;
}

function payUrlForMembership(m) {
  const membershipId = m?.membershipId || m?.id;
  if (!membershipId || !m?.payCode) return null;
  return `${baseDir()}pages/admin/membership_pay.html?mid=${encodeURIComponent(membershipId)}&code=${encodeURIComponent(m.payCode)}`;
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

function toDateSafe(v) {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(v) {
  const d = toDateSafe(v);
  if (!d) return "—";

  return new Intl.DateTimeFormat("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function getCurrentMembership(user) {
  return user?.currentMembership || null;
}

function getCoverageStart(cm) {
  return cm?.coverageStartDate || cm?.startDate || null;
}

function getCoverageEnd(cm) {
  return cm?.coverageEndDate || cm?.endDate || null;
}

function userKeyFromCurrentMembership(cm) {
  if (!cm) return "pending";

  const s = (cm.status || "").toLowerCase();
  const today = startOfToday();

  const endDate = toDateSafe(getCoverageEnd(cm));
  const nextDue = toDateSafe(cm.nextUnpaidDueDate);

  if (s === "submitted" || s === "validating") return "validating";
  if (s === "rejected") return "inactive";

  if (endDate && today > endDate) return "inactive";

  if (nextDue) {
    if (today > nextDue) return "overdue";
    return "up_to_date";
  }

  if (s === "validated" || s === "active" || s === "paid") return "up_to_date";

  if (s === "partial") {
    const pending = Number(cm.installmentsPending || 0);
    return pending > 0 ? "pending" : "up_to_date";
  }

  return "pending";
}

function membershipBadge(key, currentMembership) {
  const prog = progressText(currentMembership);
  const suffix = prog ? ` • ${prog}` : "";

  if (key === "up_to_date") return badge(`Al día${suffix}`, "green");
  if (key === "validating") return badge(`Validando${suffix}`, "yellow");
  if (key === "overdue") return badge(`Vencido${suffix}`, "red");
  if (key === "inactive") return badge("Inactivo", "gray");
  return badge(`Pendiente${suffix}`, "orange");
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
        <button
          id="btnNewAssociate"
          class="btn btn-primary btn-sm"
          type="button"
          disabled
          title="Crear miembros manualmente está deshabilitado por ahora"
        >
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
                <th>Inicio</th>
                <th>Fin</th>
                <th>Estado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="associatesTbody">
              <tr><td colspan="7" class="text-muted">Cargando…</td></tr>
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
async function loadAssociates() {
  showLoader?.("Cargando Miembros…");
  try {
    const q = query(collection(db, COL_USERS), orderBy("displayName", "asc"));
    const snap = await getDocs(q);

    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    all = users
      .map((u) => {
        const currentMembership = getCurrentMembership(u);
        const membershipKey = userKeyFromCurrentMembership(currentMembership);

        return {
          ...u,
          currentMembership,
          _assocKey: membershipKey,
          _isMoroso: membershipKey === "pending" || membershipKey === "overdue",
          _membershipStart: toDateSafe(getCoverageStart(currentMembership)),
          _membershipEnd: toDateSafe(getCoverageEnd(currentMembership)),
        };
      })
      .sort((a, b) =>
        getFullName(a).localeCompare(getFullName(b), "es", { sensitivity: "base" })
      );

    render();
  } catch (err) {
    console.error("[associates_list] load error", err);
    if ($.tbody) {
      $.tbody.innerHTML = `
        <tr><td colspan="7" class="text-danger">
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
      const emailTxt = normalize(u.email);
      const phoneTxt = normalize(getUserPhone(u));
      const startTxt = normalize(fmtDate(getCoverageStart(u.currentMembership)));
      const endTxt = normalize(fmtDate(getCoverageEnd(u.currentMembership)));

      return (
        fullName.includes(qText) ||
        emailTxt.includes(qText) ||
        phoneTxt.includes(qText) ||
        startTxt.includes(qText) ||
        endTxt.includes(qText)
      );
    });
  }

  $.countLabel.textContent = `${list.length}`;

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No hay miembros con esos filtros.</td></tr>`;
    return;
  }

  const waMsgFor = (payLink) =>
    payLink
      ? `Hola! Recordatorio de pago a la asociación usando el siguiente link ${payLink}`
      : `Hola! Recordatorio de pago a la asociación.`;

  $.tbody.innerHTML = list
    .map((u) => {
      const m = u.currentMembership || null;
      const startTxt = fmtDate(getCoverageStart(m));
      const endTxt = fmtDate(getCoverageEnd(m));
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

      const contactoHtml = emailHtml || phoneHtml
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
          <td>${startTxt}</td>
          <td>${endTxt}</td>
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
    })
    .join("");

  $.root.querySelectorAll(".btnEdit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      openModal(`partials/assoc_member_modal.html?uid=${encodeURIComponent(id)}`);
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

  $.btnNewAssociate?.addEventListener("click", () => {
    // deshabilitado por ahora
  });

  document.addEventListener("assoc-member:saved", loadAssociates);

  await loadPartialOnce("/partials/assoc_member_modal.html", "modalMount");

  watchAuth(async (user) => {
    if (!user) return;
    await loadAssociates();
  });
}