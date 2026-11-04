// /js/features/association/assoc_members_list.js
import { db } from "/js/auth/firebase.js";
import { watchAuth, logout } from "/js/auth/auth.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { openModal } from "/js/ui/modal_host.js";
import { APP_CONFIG } from "/js/config/config.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX, txf } from "/js/strings/screens/assoc_members_list.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;

// state
let all = [];
let $ = {};
let _cfg = {};
let assocVal = "all";

// Chips de estado (orden en pantalla). "moroso" = pendientes + vencidos.
const ASSOC_CHIPS = [
  { id: "all", label: () => TX.todos },
  { id: "up_to_date", label: () => TX.alDia2 },
  { id: "moroso", label: () => TX.morosos },
  { id: "validating", label: () => TX.validando },
  { id: "pending", label: () => TX.pendiente },
  { id: "overdue", label: () => TX.vencido },
  { id: "inactive", label: () => TX.inactivo },
  { id: "none", label: () => TX.sinMembresia },
];

function matchesAssoc(u, key) {
  if (key === "all") return true;
  if (key === "moroso") return u._isMoroso;
  return u._assocKey === key;
}

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
    supporter: TX.supporter,
    parent: "Encargado/a",
    other: TX.otro,
  };
  return map[t] || "—";
}

function capitalizeWords(str) {
  return (str || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}


function buildDisplayName(firstName, lastName) {
  const name = [firstName, lastName]
    .map((x) => (x || "").toString().trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return capitalizeWords(name);
}


function getFullName(user) {
  const profile = user?.profile || {};
  return (
    buildDisplayName(profile.firstName, profile.lastName) ||
    user?.displayName ||
    profile.displayName ||
    user?.email ||
    "—"
  );
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
  // sin membresía no es moroso: simplemente no está asociado
  if (!cm) return "none";

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

  if (key === "up_to_date") return badge(txf(TX.alDia, { suffix }), "green");
  if (key === "validating") return badge(`Validando${suffix}`, "yellow");
  if (key === "overdue") return badge(`Vencido${suffix}`, "red");
  if (key === "inactive") return badge(TX.inactivo, "gray");
  if (key === "none") return badge(TX.sinMembresia, "gray");
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
  $.sortSelect = container.querySelector("#sortSelect");
  $.assocChips = container.querySelector("#assocChips");
  $.btnClear = container.querySelector("#btnClearFilters");

  $.btnRefresh = container.querySelector("#btnRefresh");
  $.btnNewAssociate = container.querySelector("#btnNewAssociate");
}

function renderShell(container) {
  container.innerHTML = `
    <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
      <div>
        <div class="text-muted small">${TX.listadoDeMiembrosCon}</div>
      </div>
      <div class="d-flex gap-2">
        <button
          id="btnNewAssociate"
          class="btn btn-outline-secondary btn-sm"
          type="button"
          disabled
          title="${TX.crearMiembrosManualmenteEsta}"
        >
          <i class="bi bi-plus-lg me-1"></i> ${TX.nuevo}
        </button>

        <button id="btnRefresh" class="btn btn-outline-secondary btn-sm" type="button">
          <i class="bi bi-arrow-clockwise me-1"></i> ${TX.actualizar}
        </button>
      </div>
    </div>

    <div class="ui-filterbar mb-2">
      <div class="ui-search">
        <i class="bi bi-search"></i>
        <input id="searchInput" type="search" class="form-control" placeholder="${TX.nombreEmailOTelefono}" />
      </div>
      <select id="typeFilter" class="form-select" aria-label="${TX.tipo}">
        <option value="all" selected>${TX.todosLosTipos}</option>
        <option value="player">Jugador/a</option>
        <option value="supporter">${TX.supporter}</option>
        <option value="parent">Encargado/a</option>
        <option value="other">${TX.otro}</option>
      </select>
      <select id="sortSelect" class="form-select" aria-label="${TX.ordenar}">
        <option value="name">${TX.ordenNombre}</option>
        <option value="end">${TX.ordenVencePronto}</option>
        <option value="start">${TX.ordenInicioReciente}</option>
      </select>
      <button id="btnClearFilters" type="button" class="btn btn-link btn-sm d-none">${TX.limpiar}</button>
    </div>

    <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
      <div class="ui-chips" id="assocChips"></div>
      <div id="countLabel" class="text-muted small">—</div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead>
              <tr>
                <th>${TX.miembro}</th>
                <th>${TX.contacto}</th>
                <th>${TX.tipo}</th>
                <th>${TX.inicio}</th>
                <th>${TX.fin}</th>
                <th>${TX.estado}</th>
                <th class="text-end">${TX.acciones}</th>
              </tr>
            </thead>
            <tbody id="associatesTbody">
              <tr><td colspan="7" class="text-muted">${TX.cargando}</td></tr>
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
  showLoader?.(TX.cargandoMiembros);
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
          ${txf(TX.errorCargandoMiembros, { err: String(err?.message || err) })}
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
  const sortVal = $.sortSelect?.value || "name";

  let list = [...all];

  if (typeVal !== "all") list = list.filter((u) => getUserType(u) === typeVal);

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

  // Los contadores de los chips respetan búsqueda y tipo, pero no el estado.
  renderAssocChips(list);
  list = list.filter((u) => matchesAssoc(u, assocVal));
  sortList(list, sortVal);

  const filtering = !!qText || typeVal !== "all" || assocVal !== "all" || sortVal !== "name";
  $.btnClear?.classList.toggle("d-none", !filtering);
  $.countLabel.textContent = txf(TX.nMiembros, { n: list.length });

  if (!list.length) {
    $.tbody.innerHTML = `<tr><td colspan="7" class="text-muted">${TX.noHayMiembrosCon}</td></tr>`;
    return;
  }

  const waMsgFor = (payLink) =>
    payLink
      ? txf(TX.holaRecordatorioDePago, { payLink })
      : TX.holaRecordatorioDePago2;

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
            const waQuick = whatsappLink(phoneVal, TX.hola);
            const waBtn = waQuick
              ? `<a class="ms-2 small text-decoration-none" href="${waQuick}" target="_blank" rel="noreferrer" title="${TX.whatsapp}">
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
          ? `<a class="btn btn-sm btn-outline-success" href="${waHref}" target="_blank" rel="noreferrer" title="${TX.enviarWhatsapp}">
               <i class="bi bi-whatsapp me-1"></i> ${TX.whatsapp}
             </a>`
          : "";

      return `
        <tr>
          <td>
            <div class="fw-bold">${fullName || "—"}</div>
            ${idNumber ? `<div class="text-muted small">${txf(TX.cedula, { idNumber })}</div>` : ""}
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
                <i class="bi bi-pencil me-1"></i> ${TX.editar}
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
      openModal(
        `partials/assoc_member_modal.html?uid=${encodeURIComponent(id)}`,
        { fullscreen: true }
      );
    });
  });
}

function renderAssocChips(base) {
  if (!$.assocChips) return;
  $.assocChips.innerHTML = ASSOC_CHIPS.map((c) => {
    const n = base.filter((u) => matchesAssoc(u, c.id)).length;
    if (c.id !== "all" && c.id !== assocVal && !n) return "";
    return `<button type="button" class="ui-chip ${c.id === assocVal ? "is-active" : ""}" data-assoc="${c.id}">
      ${c.label()} <span class="ui-chip__n">${n}</span>
    </button>`;
  }).join("");
}

function sortList(list, sortVal) {
  const time = (d, fallback) => (d ? d.getTime() : fallback);
  if (sortVal === "end") {
    list.sort((a, b) => time(a._membershipEnd, Infinity) - time(b._membershipEnd, Infinity));
  } else if (sortVal === "start") {
    list.sort((a, b) => time(b._membershipStart, -Infinity) - time(a._membershipStart, -Infinity));
  }
  // "name": ya viene ordenado por nombre desde loadAssociates.
}

function clearFilters() {
  if ($.searchInput) $.searchInput.value = "";
  if ($.typeFilter) $.typeFilter.value = "all";
  if ($.sortSelect) $.sortSelect.value = "name";
  assocVal = "all";
  render();
}

/* =========================
   Public API
========================= */
let userSavedBound = false;

export async function mount(container, cfg) {
  _cfg = cfg || {};
  assocVal = "all";

  renderShell(container);
  cacheDom(container);

  $.logoutBtn?.addEventListener("click", logout);

  $.btnRefresh?.addEventListener("click", loadAssociates);
  $.searchInput?.addEventListener("input", render);
  $.typeFilter?.addEventListener("change", render);
  $.sortSelect?.addEventListener("change", render);
  $.btnClear?.addEventListener("click", clearFilters);
  $.assocChips?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-assoc]");
    if (!chip) return;
    assocVal = chip.dataset.assoc;
    render();
  });

  $.btnNewAssociate?.addEventListener("click", () => {
    // deshabilitado por ahora
  });

  if (!userSavedBound) {
    window.addEventListener("user:saved", loadAssociates);
    userSavedBound = true;
  }

  watchAuth(async (user) => {
    if (!user) return;
    await loadAssociates();
  });
}
