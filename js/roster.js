// /js/roster.js
/*************************************************
 * IMPORTS
 *************************************************/
import { db } from "./auth/firebase.js";
import { watchAuth, logout } from "./auth/auth.js";
import { getCurrentPermissions, applyVisibilityByPermission } from "./auth/permissions.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { APP_CONFIG } from "./config/config.js";

import { loadPartialOnce } from "./ui/loadPartial.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";

import { showLoader, hideLoader } from "./ui/loader.js";
import { Player } from "./models/player.js";

/*************************************************
 * INIT
 *************************************************/
const COL = APP_CONFIG.collections;
const PLAYERS_COL = COL.players;

// Header del dashboard
const { cfg, redirected } = await guardPage("roster");
if (!redirected) {
  await loadHeader("roster", cfg);
}

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", logout);

// DOM
const table = document.getElementById("playersTable");
const playersCards = document.getElementById("playersCards");
const addPlayerBtn = document.getElementById("addPlayerBtn");

let modalEl = null;
let modal = null;
let form = null;

let modalTitle = null;
let modalSubtitle = null;
let modalSaveBtn = null;

let permissions = null;

let fields = {};

// Array plano de jugadores
let players = [];

// Filtros
const filters = {
  search: document.getElementById("rosterSearch"),
  gender: document.getElementById("rosterGenderFilter"),
  role: document.getElementById("rosterRoleFilter"),
  clear: document.getElementById("rosterClearFilters")
};

let rosterFilterEventsBound = false;

/*************************************************
 * HELPERS UI MODAL
 *************************************************/

function setModalCopy(isEdit = false, player = null) {
  if (modalTitle) {
    modalTitle.textContent = isEdit ? "Editar jugador" : "Nuevo jugador";
  }

  if (modalSubtitle) {
    if (isEdit && player) {
      modalSubtitle.textContent = player.fullName || "Actualizar información del jugador";
    } else {
      modalSubtitle.textContent = "Registrar jugador en el roster";
    }
  }

  if (modalSaveBtn) {
    modalSaveBtn.textContent = isEdit ? "Guardar cambios" : "Crear jugador";
  }
}

function resetFormForCreate() {
  form?.reset();

  fields.id.value = "";
  fields.idNumber.value = "";
  fields.number.value = "";
  fields.gender.value = "";
  fields.birthday.value = "";
  fields.role.value = APP_CONFIG?.playerRoles?.[0]?.id || "cutter";
  fields.active.checked = true;

  setModalCopy(false, null);
}

function fillFormForEdit(player) {
  fields.id.value = player.id || "";
  fields.firstName.value = player.firstName || "";
  fields.lastName.value = player.lastName || "";
  fields.idNumber.value = player.idNumber ?? "";
  fields.number.value = player.number ?? "";
  fields.gender.value = player.gender ?? "";
  fields.birthday.value = player.birthday ?? "";
  fields.role.value = player.role ?? (APP_CONFIG?.playerRoles?.[0]?.id || "cutter");
  fields.active.checked = !!player.active;

  setModalCopy(true, player);
}

function openCreateModal() {
  if (!permissions?.canEditPlayers || !modal) return;
  resetFormForCreate();
  modal.show();
}

function openEditModal(player) {
  if (!permissions?.canEditPlayers || !modal || !player) return;
  fillFormForEdit(player);
  modal.show();
}

/*************************************************
 * LABELS / CONFIG
 *************************************************/

function getRosterFilterConfig() {
  const rosterCfg = APP_CONFIG?.roster || {};
  const filtersCfg = rosterCfg.filters || {};

  const rolesFromConfig = Array.isArray(APP_CONFIG?.playerRoles) && APP_CONFIG.playerRoles.length
    ? APP_CONFIG.playerRoles.map(r => ({
        value: r.id,
        label: r.label
      }))
    : [
        { value: "cutter", label: "Cutter" },
        { value: "hybrid", label: "Hybrid" },
        { value: "handler", label: "Handler" }
      ];

  return {
    genders: Array.isArray(filtersCfg.genders) && filtersCfg.genders.length
      ? filtersCfg.genders
      : [
          { value: "F", label: "Femenino" },
          { value: "M", label: "Masculino" }
        ],

    roles: rolesFromConfig
  };
}

function getGenderLabel(gender) {
  const cfg = getRosterFilterConfig();
  const found = cfg.genders.find(g => g.value === gender);
  return found?.label || "—";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getPlayerInitials(player) {
  const first = String(player?.firstName || "").trim();
  const last = String(player?.lastName || "").trim();

  const firstInitial = first ? first.charAt(0).toUpperCase() : "";
  const lastInitial = last ? last.charAt(0).toUpperCase() : "";

  const initials = `${firstInitial}${lastInitial}`.trim();
  return initials || "—";
}

function formatBirthdayMonthDay(value) {
  if (!value) return "—";

  const s = String(value).trim();
  if (!s) return "—";

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, mm, dd] = s.split("-");
    const months = [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
    ];
    const monthIdx = Number(mm) - 1;
    const day = Number(dd);
    return monthIdx >= 0 && monthIdx < 12 ? `${months[monthIdx]} ${day}` : s;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("es-CR", {
      month: "short",
      day: "numeric"
    });
  }

  return s;
}

/*************************************************
 * SORT STATE
 *************************************************/

let currentSort = {
  key: "name",
  direction: "asc"
};

/*************************************************
 * LOAD DATA
 *************************************************/

async function loadPlayers() {
  const snap = await getDocs(collection(db, PLAYERS_COL));

  players = snap.docs.map(d => Player.fromFirestore(d));

  applySort();
  render();
  updateSortIndicators();
}

/*************************************************
 * FILTERS
 *************************************************/

function populateRosterFilters() {
  const cfg = getRosterFilterConfig();

  if (filters.gender) {
    filters.gender.innerHTML = `
      <option value="">Todos</option>
      ${cfg.genders
        .map(g => `<option value="${g.value}">${g.label}</option>`)
        .join("")}
    `;
  }

  if (filters.role) {
    filters.role.innerHTML = `
      <option value="">Todos</option>
      ${cfg.roles
        .map(r => `<option value="${r.value}">${r.label}</option>`)
        .join("")}
    `;
  }
}

function bindRosterFilterEvents() {
  if (rosterFilterEventsBound) return;
  rosterFilterEventsBound = true;

  filters.search?.addEventListener("input", render);
  filters.gender?.addEventListener("change", render);
  filters.role?.addEventListener("change", render);

  filters.clear?.addEventListener("click", () => {
    if (filters.search) filters.search.value = "";
    if (filters.gender) filters.gender.value = "";
    if (filters.role) filters.role.value = "";
    render();
  });
}

function getFilteredPlayers() {
  const term = normalizeText(filters.search?.value);
  const gender = filters.gender?.value || "";
  const role = filters.role?.value || "";

  return players.filter(p => {
    const fullName = normalizeText(`${p.firstName || ""} ${p.lastName || ""}`);
    const matchesName = !term || fullName.includes(term);
    const matchesGender = !gender || (p.gender || "") === gender;
    const matchesRole = !role || (p.role || "") === role;

    return matchesName && matchesGender && matchesRole;
  });
}

/*************************************************
 * SORTING
 *************************************************/

function applySort() {
  const dir = currentSort.direction === "asc" ? 1 : -1;

  players.sort((a, b) => {
    // activos primero
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    let valA;
    let valB;

    switch (currentSort.key) {
      case "name":
        valA = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
        valB = `${b.firstName || ""} ${b.lastName || ""}`.toLowerCase();
        break;

      case "number":
        valA = a.number ?? 999;
        valB = b.number ?? 999;
        break;

      case "role":
        valA = a.role ?? "";
        valB = b.role ?? "";
        break;

      case "gender":
        valA = a.gender ?? "";
        valB = b.gender ?? "";
        break;

      case "birthday":
        valA = a.birthday ?? "";
        valB = b.birthday ?? "";
        break;

      case "active":
        valA = a.active ? 1 : 0;
        valB = b.active ? 1 : 0;
        break;

      default:
        return 0;
    }

    return valA > valB ? dir : valA < valB ? -dir : 0;
  });
}

/*************************************************
 * RENDER
 *************************************************/

function render() {
  const filteredPlayers = getFilteredPlayers();

  if (table) {
    table.innerHTML = filteredPlayers
      .map(
        p => `
          <tr
            data-id="${p.id}"
            class="player-row"
            style="cursor:${permissions?.canEditPlayers ? "pointer" : "default"}"
          >
            <td>
              <div class="player-cell">
                <div class="player-avatar" aria-hidden="true">
                  ${escapeHtml(getPlayerInitials(p))}
                </div>
                <div class="player-cell-text">
                  <div class="player-cell-name fw-semibold">${escapeHtml(p.fullName)}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="badge role-badge">
                ${escapeHtml(p.roleLabel)}
              </span>
            </td>
            <td>${escapeHtml(p.number ?? "—")}</td>
            <td>${escapeHtml(getGenderLabel(p.gender))}</td>
            <td>${escapeHtml(formatBirthdayMonthDay(p.birthday))}</td>
            <td>
              <span class="badge ${p.active ? "bg-success" : "bg-secondary"}">
                ${p.active ? "Activo" : "Inactivo"}
              </span>
            </td>
          </tr>
        `
      )
      .join("");
  }

  updateRosterStats(filteredPlayers);
  renderMobileCards(filteredPlayers);
}

function renderMobileCards(list = players) {
  if (!playersCards) return;

  playersCards.innerHTML = list.map(p => `
    <div
      class="card mb-2 player-card"
      data-id="${p.id}"
      style="cursor:${permissions?.canEditPlayers ? "pointer" : "default"}"
    >
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div class="d-flex align-items-start gap-3 flex-grow-1 min-w-0">
            <div class="player-avatar" aria-hidden="true">
              ${escapeHtml(getPlayerInitials(p))}
            </div>

            <div class="flex-grow-1 min-w-0">
              <div class="player-name">${escapeHtml(p.fullName)}</div>
              <div class="player-extra mt-2">
                <span class="player-chip role-chip">${escapeHtml(p.roleLabel)}</span>
                <span class="player-chip gender-chip">${escapeHtml(getGenderLabel(p.gender))}</span>
                <span class="player-chip">${escapeHtml(formatBirthdayMonthDay(p.birthday))}</span>
              </div>
            </div>
          </div>

          <div class="player-top-right text-end">
            <div class="player-number-row">
              <span class="status-dot ${p.active ? "is-active" : "is-inactive"}"></span>
              <span class="player-number">#${escapeHtml(p.number ?? "—")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}

/*************************************************
 * CONTADORES
 *************************************************/

function calculateAge(birthday) {
  if (!birthday) return null;

  let birth = null;

  if (typeof birthday === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    const [y, m, d] = birthday.split("-").map(Number);
    birth = new Date(y, m - 1, d);
  } else {
    birth = new Date(birthday);
  }

  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

function updateRosterStats(source = players) {
  const list = Array.isArray(source) ? source : Object.values(source);
  const activeList = list.filter(p => p.active);

  const total = list.length;
  const active = activeList.length;
  const inactive = total - active;

  const men = activeList.filter(p => p.gender === "M").length;
  const women = activeList.filter(p => p.gender === "F").length;

  let masterH = 0;
  let masterM = 0;
  let u24H = 0;
  let u24M = 0;

  activeList.forEach(p => {
    const age = calculateAge(p.birthday);
    if (age === null || !p.gender) return;

    if (p.gender === "M" && age >= 33) masterH++;
    if (p.gender === "F" && age >= 30) masterM++;

    if (age < 24) {
      if (p.gender === "M") u24H++;
      if (p.gender === "F") u24M++;
    }
  });

  document.getElementById("statActive").textContent = `${active} activos`;
  document.getElementById("statInactive").textContent = `${inactive} inactivos`;
  document.getElementById("statMen").textContent = men;
  document.getElementById("statWomen").textContent = women;
  document.getElementById("statMasterH").textContent = masterH;
  document.getElementById("statMasterM").textContent = masterM;
  document.getElementById("statU24H").textContent = u24H;
  document.getElementById("statU24M").textContent = u24M;
}

/*************************************************
 * CLICK EN FILA / CARD
 *************************************************/

table?.addEventListener("click", e => {
  if (!permissions?.canEditPlayers) return;

  const row = e.target.closest(".player-row");
  if (!row) return;

  const id = row.dataset.id;
  const player = players.find(pl => pl.id === id);
  if (!player) return;

  openEditModal(player);
});

playersCards?.addEventListener("click", e => {
  if (!permissions?.canEditPlayers) return;

  const card = e.target.closest(".player-card");
  if (!card) return;

  const player = players.find(pl => pl.id === card.dataset.id);
  if (!player) return;

  openEditModal(player);
});

/*************************************************
 * CLICK EN HEADERS (SORT)
 *************************************************/

document.querySelectorAll("th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;

    if (currentSort.key === key) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.key = key;
      currentSort.direction = "asc";
    }

    applySort();
    render();
    updateSortIndicators();
  });
});

function updateSortIndicators() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.remove("sorted-asc", "sorted-desc");

    if (th.dataset.sort === currentSort.key) {
      th.classList.add(
        currentSort.direction === "asc" ? "sorted-asc" : "sorted-desc"
      );
    }
  });
}

async function initPlayerModal() {
  const mount = document.getElementById("playerModalMount");
  if (!mount) return;

  await loadPartialOnce("/partials/player_modal.html", "playerModalMount");

  modalEl = document.getElementById("playerModal");
  form = document.getElementById("playerForm");

  modalTitle = document.getElementById("playerModalTitle");
  modalSubtitle = document.getElementById("playerModalSubtitle");
  modalSaveBtn = document.getElementById("playerSaveBtn");

  fields = {
    id: document.getElementById("playerId"),
    firstName: document.getElementById("firstName"),
    lastName: document.getElementById("lastName"),
    idNumber: document.getElementById("idNumber"),
    number: document.getElementById("number"),
    gender: document.getElementById("gender"),
    birthday: document.getElementById("birthday"),
    role: document.getElementById("role"),
    active: document.getElementById("active")
  };

  if (modalEl) {
    modal = new bootstrap.Modal(modalEl);
  }

  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (!permissions?.canEditPlayers) return;

      const data = {
        firstName: fields.firstName.value.trim(),
        lastName: fields.lastName.value.trim(),
        idNumber: (fields.idNumber.value || "").trim() || null,
        number: fields.number.value === "" ? null : Number(fields.number.value),
        gender: fields.gender.value || null,
        birthday: fields.birthday.value || null,
        role: fields.role.value || null,
        active: fields.active.checked
      };

      showLoader();

      try {
        if (fields.id.value) {
          await updateDoc(
            doc(db, PLAYERS_COL, fields.id.value),
            new Player(null, data).toFirestore()
          );
        } else {
          await setDoc(
            doc(collection(db, PLAYERS_COL)),
            new Player(null, data).toFirestore()
          );
        }

        modal?.hide();
        await loadPlayers();
      } finally {
        hideLoader();
      }
    });
  }
}

/*************************************************
 * NUEVO JUGADOR
 *************************************************/

addPlayerBtn?.addEventListener("click", () => {
  openCreateModal();
});

/*************************************************
 * SAVE FORM
 *************************************************/

form?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!permissions?.canEditPlayers) return;

  const data = {
    firstName: fields.firstName.value.trim(),
    lastName: fields.lastName.value.trim(),
    idNumber: (fields.idNumber.value || "").trim() || null,
    number: fields.number.value === "" ? null : Number(fields.number.value),
    gender: fields.gender.value || null,
    birthday: fields.birthday.value || null,
    role: fields.role.value || null,
    active: fields.active.checked
  };

  showLoader();

  try {
    if (fields.id.value) {
      await updateDoc(
        doc(db, PLAYERS_COL, fields.id.value),
        new Player(null, data).toFirestore()
      );
    } else {
      await setDoc(
        doc(collection(db, PLAYERS_COL)),
        new Player(null, data).toFirestore()
      );
    }

    modal?.hide();
    await loadPlayers();
  } finally {
    hideLoader();
  }
});

/*************************************************
 * AUTH FLOW
 *************************************************/

watchAuth(async () => {
  showLoader();
  try {
    permissions = await getCurrentPermissions();

    applyVisibilityByPermission(permissions, "canEditPlayers", addPlayerBtn);

    populateRosterFilters();
    bindRosterFilterEvents();

    await initPlayerModal();
    setModalCopy(false, null);

    await loadPlayers();
  } finally {
    hideLoader();
  }
});