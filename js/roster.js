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
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { APP_CONFIG } from "./config/config.js";

import { loadPartialOnce } from "./ui/loadPartial.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";

import { showLoader, hideLoader } from "./ui/loader.js";

/*************************************************
 * INIT
 *************************************************/
const COL = APP_CONFIG.collections;
const CLUB_PLAYERS_COL = COL.club_players;
const USERS_COL = COL.users;

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
let usersById = new Map();

// Filtros
const filters = {
  search: document.getElementById("rosterSearch"),
  gender: document.getElementById("rosterGenderFilter"),
  role: document.getElementById("rosterRoleFilter"),
  clear: document.getElementById("rosterClearFilters")
};

let rosterFilterEventsBound = false;

/*************************************************
 * HELPERS GENERALES
 *************************************************/

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

function normalizeRoleId(role) {
  return String(role || "").trim().toLowerCase();
}

function toStartCase(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitName(fullName) {
  const clean = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: ""
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join("")
  };
}

function getConfigRoles() {
  return Array.isArray(APP_CONFIG?.playerRoles) ? APP_CONFIG.playerRoles : [];
}

function getDefaultRoleId() {
  return getConfigRoles()?.[0]?.id || "player";
}

function getRoleLabel(roleId) {
  const rid = normalizeRoleId(roleId);
  const found = getConfigRoles().find((r) => normalizeRoleId(r.id) === rid);
  return found?.label || toStartCase(rid || getDefaultRoleId());
}

function getRosterFilterConfig() {
  const rosterCfg = APP_CONFIG?.roster || {};
  const filtersCfg = rosterCfg.filters || {};

  const rolesFromConfig = getConfigRoles().length
    ? getConfigRoles().map((r) => ({
        value: r.id,
        label: r.label || toStartCase(r.id)
      }))
    : [{ value: getDefaultRoleId(), label: toStartCase(getDefaultRoleId()) }];

  return {
    genders: Array.isArray(filtersCfg.genders) && filtersCfg.genders.length
      ? filtersCfg.genders
      : [
          { value: "F", label: "Femenino" },
          { value: "M", label: "Masculino" },
          { value: "X", label: "Otro" }
        ],
    roles: rolesFromConfig
  };
}

function getGenderLabel(gender) {
  const cfg = getRosterFilterConfig();
  const found = cfg.genders.find(g => g.value === gender);
  return found?.label || "—";
}

function getUserDisplayName(userData = {}) {
  const joinedName = [userData.firstName, userData.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    userData.fullName ||
    userData.displayName ||
    joinedName ||
    userData.name ||
    userData.email ||
    "—"
  );
}

function getClubPlayerUserId(cp = {}) {
  return cp.userId || cp.linkedUserId || cp.uid || cp.userRefId || null;
}

function normalizeClubPlayerActive(cp = {}) {
  if (cp.active === false) return false;
  if (cp.isActive === false) return false;
  if (cp.status === "inactive") return false;
  return true;
}

function buildPlayerRecord(docSnap) {
  const cp = docSnap.data() || {};
  const id = docSnap.id;
  const userId = getClubPlayerUserId(cp);
  const linkedUser = userId ? usersById.get(userId) || null : null;

  const firstName = cp.firstName ?? linkedUser?.firstName ?? "";
  const lastName = cp.lastName ?? linkedUser?.lastName ?? "";
  const displayName = cp.displayName ?? linkedUser?.displayName ?? "";
  const fullName =
    cp.fullName ||
    displayName ||
    getUserDisplayName(linkedUser || {}) ||
    `${firstName} ${lastName}`.trim() ||
    "—";

  const role = normalizeRoleId(cp.role || cp.position || linkedUser?.role || getDefaultRoleId());

  return {
    id,
    clubPlayerId: id,
    userId,
    linkedUser,

    firstName,
    lastName,
    fullName,
    displayName,

    idNumber: cp.idNumber ?? linkedUser?.idNumber ?? null,
    number: cp.number ?? cp.jerseyNumber ?? linkedUser?.number ?? null,
    gender: cp.gender ?? linkedUser?.gender ?? null,
    birthday: cp.birthday ?? linkedUser?.birthday ?? null,
    role,
    roleLabel: getRoleLabel(role),

    active: normalizeClubPlayerActive(cp),

    rawClubPlayer: cp,
    rawUser: linkedUser || null
  };
}

function getPlayerFullName(player) {
  return String(player?.fullName || "").trim() || "—";
}

function getPlayerFirstName(player) {
  return String(player?.firstName || "").trim();
}

function getPlayerLastName(player) {
  return String(player?.lastName || "").trim();
}

function getPlayerBirthDate(player) {
  return String(player?.birthday || "").trim();
}

function getPlayerInitials(player) {
  const first = getPlayerFirstName(player);
  const last = getPlayerLastName(player);

  const firstInitial = first ? first.charAt(0).toUpperCase() : "";
  const lastInitial = last ? last.charAt(0).toUpperCase() : "";

  const initials = `${firstInitial}${lastInitial}`.trim();
  if (initials) return initials;

  const full = getPlayerFullName(player);
  return full !== "—" ? full.charAt(0).toUpperCase() : "—";
}

function formatBirthdayMonthDay(value) {
  if (!value) return "—";

  const s = String(value).trim();
  if (!s) return "—";

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

function populateRoleSelect() {
  if (!fields.role) return;

  const roles = getConfigRoles();
  const defaultRole = getDefaultRoleId();

  fields.role.innerHTML = roles.length
    ? roles.map((role) => `
        <option value="${escapeHtml(role.id)}">
          ${escapeHtml(role.label || toStartCase(role.id))}
        </option>
      `).join("")
    : `<option value="${escapeHtml(defaultRole)}">${escapeHtml(toStartCase(defaultRole))}</option>`;
}

function resetFormForCreate() {
  form?.reset();

  fields.id.value = "";
  fields.firstName.value = "";
  fields.lastName.value = "";
  fields.idNumber.value = "";
  fields.number.value = "";
  fields.gender.value = "";
  fields.birthday.value = "";
  fields.role.value = getDefaultRoleId();
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
  fields.role.value = player.role ?? getDefaultRoleId();
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
  const [clubPlayersSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, CLUB_PLAYERS_COL)),
    getDocs(collection(db, USERS_COL)),
  ]);

  usersById = new Map(
    usersSnap.docs.map(d => [d.id, { id: d.id, ...(d.data() || {}) }])
  );

  players = clubPlayersSnap.docs.map(buildPlayerRecord);

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
        .map(g => `<option value="${escapeHtml(g.value)}">${escapeHtml(g.label)}</option>`)
        .join("")}
    `;
  }

  if (filters.role) {
    filters.role.innerHTML = `
      <option value="">Todos</option>
      ${cfg.roles
        .map(r => `<option value="${escapeHtml(r.value)}">${escapeHtml(r.label)}</option>`)
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
  const role = normalizeRoleId(filters.role?.value || "");

  return players.filter(p => {
    const fullName = normalizeText(getPlayerFullName(p));
    const matchesName = !term || fullName.includes(term);
    const matchesGender = !gender || (p.gender || "") === gender;
    const matchesRole = !role || normalizeRoleId(p.role) === role;

    return matchesName && matchesGender && matchesRole;
  });
}

/*************************************************
 * SORTING
 *************************************************/

function applySort() {
  const dir = currentSort.direction === "asc" ? 1 : -1;

  players.sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    let valA;
    let valB;

    switch (currentSort.key) {
      case "name":
        valA = normalizeText(getPlayerFullName(a));
        valB = normalizeText(getPlayerFullName(b));
        break;

      case "number":
        valA = a.number ?? 999;
        valB = b.number ?? 999;
        break;

      case "role":
        valA = normalizeRoleId(a.role);
        valB = normalizeRoleId(b.role);
        break;

      case "gender":
        valA = a.gender ?? "";
        valB = b.gender ?? "";
        break;

      case "birthday":
        valA = getPlayerBirthDate(a);
        valB = getPlayerBirthDate(b);
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
            data-id="${escapeHtml(p.id)}"
            class="player-row"
            style="cursor:${permissions?.canEditPlayers ? "pointer" : "default"}"
          >
            <td>
              <div class="player-cell">
                <div class="player-avatar" aria-hidden="true">
                  ${escapeHtml(getPlayerInitials(p))}
                </div>
                <div class="player-cell-text">
                  <div class="player-cell-name fw-semibold">${escapeHtml(getPlayerFullName(p))}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="badge role-badge">
                ${escapeHtml(p.roleLabel || "—")}
              </span>
            </td>
            <td>${escapeHtml(p.number ?? "—")}</td>
            <td>${escapeHtml(getGenderLabel(p.gender))}</td>
            <td>${escapeHtml(formatBirthdayMonthDay(getPlayerBirthDate(p)))}</td>
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
      data-id="${escapeHtml(p.id)}"
      style="cursor:${permissions?.canEditPlayers ? "pointer" : "default"}"
    >
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div class="d-flex align-items-start gap-3 flex-grow-1 min-w-0">
            <div class="player-avatar" aria-hidden="true">
              ${escapeHtml(getPlayerInitials(p))}
            </div>

            <div class="flex-grow-1 min-w-0">
              <div class="player-name">${escapeHtml(getPlayerFullName(p))}</div>
              <div class="player-extra mt-2">
                <span class="player-chip role-chip">${escapeHtml(p.roleLabel || "—")}</span>
                <span class="player-chip gender-chip">${escapeHtml(getGenderLabel(p.gender))}</span>
                <span class="player-chip">${escapeHtml(formatBirthdayMonthDay(getPlayerBirthDate(p)))}</span>
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
    const age = calculateAge(getPlayerBirthDate(p));
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

/*************************************************
 * SAVE
 *************************************************/

async function savePlayerFromForm() {
  if (!permissions?.canEditPlayers) return;

  const firstName = fields.firstName.value.trim();
  const lastName = fields.lastName.value.trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const role = normalizeRoleId(fields.role.value || getDefaultRoleId());

  const payload = {
    firstName,
    lastName,
    fullName,
    displayName: fullName,

    idNumber: (fields.idNumber.value || "").trim() || null,
    number: fields.number.value === "" ? null : Number(fields.number.value),
    gender: fields.gender.value || null,
    birthday: fields.birthday.value || null,
    role,
    active: fields.active.checked,
    isActive: fields.active.checked,

    updatedAt: serverTimestamp()
  };

  showLoader();

  try {
    if (fields.id.value) {
      await updateDoc(doc(db, CLUB_PLAYERS_COL, fields.id.value), payload);
    } else {
      const nameParts = splitName(fullName);
      await setDoc(doc(collection(db, CLUB_PLAYERS_COL)), {
        ...payload,
        firstName: firstName || nameParts.firstName || "",
        lastName: lastName || nameParts.lastName || "",
        userId: null,
        linkedUserId: null,
        createdAt: serverTimestamp()
      });
    }

    modal?.hide();
    await loadPlayers();
  } finally {
    hideLoader();
  }
}

/*************************************************
 * MODAL
 *************************************************/

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

  populateRoleSelect();

  if (modalEl) {
    modal = new bootstrap.Modal(modalEl);
  }

  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      await savePlayerFromForm();
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