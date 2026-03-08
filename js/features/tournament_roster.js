// js/features/tournament_roster.js
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { getCurrentPermissions, applyVisibilityMap  } from "../auth/permissions.js";
import { APP_CONFIG } from "../config/config.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { loadHeader } from "../components/header.js";
import { TOURNAMENT_STRINGS } from "../strings.js";
import { Player } from "../models/player.js";
import { createTournamentEditor } from "./tournament_editor.js";
import { loadPartialOnce } from "../ui/loadPartial.js";
import { createPaymentModal, sumPayments } from "./payment_modal.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ==========================
   HEADER / AUTH
========================== */
await loadHeader("tournaments");
document.getElementById("logoutBtn")?.addEventListener("click", logout);

const S = TOURNAMENT_STRINGS;

/* ==========================
   COLLECTIONS FROM CONFIG
========================== */
const TOURNAMENTS_COL = APP_CONFIG?.club?.tournamentsCollection || "tournaments";
const PLAYERS_COL = APP_CONFIG?.club?.playersCollection || "club_players";
const GUESTS_COL = APP_CONFIG?.club?.guestsCollection || "guest_players";

const PLAYER_ROLES = Array.isArray(APP_CONFIG?.playerRoles) ? APP_CONFIG.playerRoles : [];

/* ==========================
   DOM
========================== */
const appVersion = document.getElementById("appVersion");

const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

const tName = document.getElementById("tName");
const tMeta = document.getElementById("tMeta");
const tDates = document.getElementById("tDates");
const tOfficialLink = document.getElementById("tOfficialLink");

const errorBox = document.getElementById("errorBox");

const lblSearch = document.getElementById("lblSearch");
const searchInput = document.getElementById("searchInput");
const btnAddLabel = document.getElementById("btnAddLabel");

const rosterTitle = document.getElementById("rosterTitle");
const rosterSubtitle = document.getElementById("rosterSubtitle");
const rosterList = document.getElementById("rosterList");
const rosterEmpty = document.getElementById("rosterEmpty");

const playersSearch = document.getElementById("playersSearch");
const playersList = document.getElementById("playersList");
const playersEmpty = document.getElementById("playersEmpty");

const playersTitle = document.getElementById("playersTitle");
const playersSubtitle = document.getElementById("playersSubtitle");

const teamFeePill = document.getElementById("teamFeePill");
const toggleTeamFeeBtn = document.getElementById("toggleTeamFeeBtn");

const clearLegendFiltersBtn = document.getElementById("clearLegendFilters");
const filtersHintEl = document.getElementById("filtersHint");

const statTotal = document.getElementById("statTotal");
const statF = document.getElementById("statF");
const statM = document.getElementById("statM");
const roleCounters = document.getElementById("roleCounters");

const addGuestBtn = document.getElementById("addGuestBtn");
const editTournamentBtn = document.getElementById("editTournamentBtn");

const contextHint = document.getElementById("contextHint");
const rosterPanelCol = document.getElementById("rosterPanelCol");
const playersPanelCol = document.getElementById("playersPanelCol");

const filterBlockStatus = document.getElementById("filterBlockStatus");
const filterDividerStatus = document.getElementById("filterDividerStatus");
const filterBlockFee = document.getElementById("filterBlockFee");
const filterDividerFee = document.getElementById("filterDividerFee");

/* ==========================
   PARAMS / STATE
========================== */
let permissions = null;

const params = new URLSearchParams(window.location.search);
const tournamentId = (params.get("id") || "").trim();

let tournament = null;
let roster = [];
let players = [];
let guests = [];

let activeLegendFilters = new Set();

/* ==========================
   STRINGS -> UI
========================== */
applyStrings();

/* ==========================
   TOURNAMENT EDITOR (LAZY)
========================== */
let tournamentEditor = null;

async function ensureTournamentEditor() {
  await loadPartialOnce("/partials/tournament_editor.html", "modalMount");
  if (!tournamentEditor) tournamentEditor = createTournamentEditor();
  return tournamentEditor;
}

/* ==========================
   PAYMENT MODAL (LAZY, REUSABLE)
========================== */
let payModal = null;

async function ensurePayModal() {
  await loadPartialOnce("/partials/payment_modal.html", "modalMount");
  if (!payModal) payModal = createPaymentModal();
  return payModal;
}

/* ==========================
   EVENTS
========================== */
playersSearch?.addEventListener("input", renderPlayers);
toggleTeamFeeBtn?.addEventListener("click", toggleTeamFeePaid);

addGuestBtn?.addEventListener("click", createGuestFlow);

editTournamentBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!permissions?.canEditTournament) return;
  if (!tournamentId) return;

  const editor = await ensureTournamentEditor();
  editor?.openEditById(tournamentId);
});

/* ==========================
   EVENTS: TOURNAMENT EDITOR
========================== */
window.addEventListener("tournament:changed", async (e) => {
  const { id, deleted } = e.detail || {};

  if (deleted && id === tournamentId) {
    alert("Este torneo fue eliminado.");
    window.location.href = "tournaments.html";
    return;
  }

  if (id === tournamentId) {
    showLoader();
    try {
      tournament = await fetchTournament(tournamentId);
      await loadPlayers();
      await loadGuests();
      await loadRoster();
      applyRoleUI();
      render();
      renderPlayers();
    } catch (err) {
      console.error(err);
      alert("Error recargando el torneo.");
    } finally {
      hideLoader();
    }
  }
});

/* ==========================
   INIT
========================== */
watchAuth(async () => {
  showLoader();
  try {
    permissions = await getCurrentPermissions();

    if (appVersion) appVersion.textContent = `v${APP_CONFIG.version}`;

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.textContent = "Salir";

    if (!tournamentId) {
      showError("Falta el parámetro del torneo. Ej: tournament_roster.html?id=XXXX");
      return;
    }

    tournament = await fetchTournament(tournamentId);
    if (!tournament) {
      showError("No se encontró el torneo.");
      return;
    }

    renderDynamicRoleFilters();
    initLegendFiltersUX();

    await loadPlayers();
    await loadGuests();
    await loadRoster();

    applyRoleUI();
    render();
    renderPlayers();
  } catch (e) {
    console.error(e);
    showError("Error cargando roster del torneo.");
  } finally {
    hideLoader();
  }
});

/* ==========================
   DATA
========================== */
async function fetchTournament(id) {
  const snap = await getDoc(doc(db, TOURNAMENTS_COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function loadRoster() {
  const snap = await getDocs(collection(db, TOURNAMENTS_COL, tournamentId, "roster"));
  const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const playersById = new Map(players.map(p => [p.id, p]));
  const guestsById = new Map(guests.map(g => [g.id, g]));
  const defaultFeeTotal = toNumberOrZero(tournament?.playerFee);

  roster = raw
    .map(r => {
      const refId = (r.playerId || r.guestId || r.id || "").trim();
      const isGuest = !!r.isGuest;

      const source = isGuest
        ? guestsById.get(r.guestId || refId)
        : playersById.get(r.playerId || refId);

      const payments = Array.isArray(r.payments) ? r.payments : [];
      const feeTotal = Number.isFinite(Number(r.feeTotal))
        ? Number(r.feeTotal)
        : defaultFeeTotal;

      const paidTotal = sumPayments(payments);
      const balance = feeTotal - paidTotal;
      const feeIsPaid = feeTotal > 0 ? balance <= 0 : false;

      return {
        ...r,
        sourceId: refId,
        isGuest,

        name: source?.name ?? "—",
        number: source?.number ?? null,
        role: source?.role ?? null,
        gender: source?.gender ?? null,
        loanFrom: isGuest ? (source?.loanFrom || r.loanFrom || "") : "",

        playerId: !isGuest ? (r.playerId || refId) : null,
        guestId: isGuest ? (r.guestId || refId) : null,

        payments,
        feeTotal,
        paidTotal,
        balance,
        feeIsPaid,
        missingSource: !source
      };
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
}

async function loadPlayers() {
  const snap = await getDocs(collection(db, PLAYERS_COL));

  players = snap.docs
    .map(d => Player.fromFirestore(d))
    .map(p => ({
      id: p.id,
      name: p.fullName,
      nickname: "",
      role: p.role,
      number: p.number ?? null,
      gender: p.gender,
      active: p.active !== false,
      isGuest: false
    }))
    .filter(p => p.active === true)
    .filter(p => (p.name || "").trim().length > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  if (playersSubtitle && permissions?.canManageRoster) {
    playersSubtitle.textContent = players.length
      ? `${players.length} jugador(es) activo(s)`
      : "No hay jugadores activos disponibles.";
  }
}

async function loadGuests() {
  const snap = await getDocs(collection(db, GUESTS_COL));

  guests = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .map(g => ({
      id: g.id,
      name: (g.name || "").trim(),
      nickname: g.loanFrom ? `Préstamo: ${g.loanFrom}` : "",
      role: g.role || getDefaultRoleId(),
      number: g.number ?? null,
      gender: g.gender ?? null,
      active: g.active !== false,
      loanFrom: g.loanFrom || "",
      isGuest: true
    }))
    .filter(g => g.active === true)
    .filter(g => (g.name || "").trim().length > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
}

/* ==========================
   PERMISSIONS / UI
========================== */
function applyRoleUI() {
  const canManageRoster = !!permissions?.canManageRoster;
  const canEditTournament = !!permissions?.canEditTournament;
  const canManagePayments = !!permissions?.canManagePayments;
  const canCreateGuests = !!permissions?.canCreateGuests;
  const isViewerOnly = !canManageRoster;

  applyVisibilityMap(permissions, {
      canEditTournament: editTournamentBtn,
      canManagePayments: toggleTeamFeeBtn,
      canCreateGuests: addGuestBtn
  });

  if (playersPanelCol) {
    playersPanelCol.classList.toggle("d-none", isViewerOnly);
  }

  if (rosterPanelCol) {
    rosterPanelCol.classList.toggle("col-xl-7", !isViewerOnly);
    rosterPanelCol.classList.toggle("col-xl-12", isViewerOnly);
  }

  if (contextHint) {
    contextHint.innerHTML = isViewerOnly
      ? `
        <div class="text-muted small d-flex align-items-center gap-2">
          <i class="bi bi-eye"></i>
          Vista de solo lectura del roster del torneo
        </div>
      `
      : `
        <div class="text-muted small d-flex align-items-center gap-2">
          <i class="bi bi-people"></i>
          Administra convocados, confirmados y abonos del fee
        </div>
      `;
  }

  if (playersTitle) {
    playersTitle.textContent = "Jugadores";
  }

  if (playersSubtitle) {
    playersSubtitle.textContent = isViewerOnly ? "" : "—";
  }

  filterBlockStatus?.classList.toggle("d-none", isViewerOnly);
  filterDividerStatus?.classList.toggle("d-none", isViewerOnly);

  filterBlockFee?.classList.toggle("d-none", isViewerOnly);
  filterDividerFee?.classList.toggle("d-none", isViewerOnly);

  if (isViewerOnly) {
    activeLegendFilters.delete("status:confirmado");
    activeLegendFilters.delete("status:convocado");
    activeLegendFilters.delete("status:tentative");
    activeLegendFilters.delete("fee:pendiente");
    activeLegendFilters.delete("fee:pagado");
  }

  syncLegendUI();
}

/* ==========================
   RENDER: ROSTER
========================== */
function render() {
  if (!tournament) return;

  if (tName) tName.textContent = tournament.name || "—";
  if (tMeta) tMeta.textContent = formatTournamentMeta(tournament);

  if (tDates) {
    const start = tournament?.dateStart || "—";
    const end = tournament?.dateEnd || "";
    tDates.textContent = end ? `${start} → ${end}` : start;
  }

  if (tOfficialLink) {
    const url = normalizeUrl(tournament?.officialUrl || tournament?.url || "");
    if (url) {
      tOfficialLink.href = url;
      tOfficialLink.classList.remove("d-none");
    } else {
      tOfficialLink.classList.add("d-none");
      tOfficialLink.href = "#";
    }
  }

  renderTeamFee();

  let list = [...roster];
  if (activeLegendFilters.size > 0) {
    list = list.filter(matchesLegendFilters);
  }

  if (rosterList) {
    if (!list.length) {
      rosterList.innerHTML = "";
    } else {
      const grouped = getGroupedRoster(list);
      rosterList.innerHTML = grouped.map(rosterGroupSection).join("");
    }
  }

  if (rosterEmpty) {
    rosterEmpty.classList.toggle("d-none", list.length > 0);
    rosterEmpty.textContent = S.roster?.empty || "No hay jugadores asignados a este torneo.";
  }

  renderRosterCounters(list);

  if (!permissions?.canManageRoster && !permissions?.canManagePayments) return;

  rosterList?.querySelectorAll("[data-remove]")?.forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove");
      await removeFromRoster(id);
    });
  });

  rosterList?.querySelectorAll("[data-toggle-status]")?.forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-toggle-status");
      await toggleStatus(id);
    });
  });

  rosterList?.querySelectorAll("[data-pay]")?.forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!permissions?.canManagePayments) return;

      const id = btn.getAttribute("data-pay");
      const r = roster.find(x => x.id === id);
      if (!r) return;

      const modal = await ensurePayModal();
      const suggested = r.balance > 0 ? Math.ceil(r.balance) : "";

      modal.open({
        collectionPath: `${TOURNAMENTS_COL}/${tournamentId}/roster`,
        docId: r.id,
        title: "Agregar abono",
        subtitle: r.name || "—",
        suggestedAmount: suggested,
        onSaved: async () => {
          await loadRoster();
          render();
          renderPlayers();
        }
      });
    });
  });
}

function renderRosterCounters(visibleList) {
  const base = roster;

  const total = base.length;
  const m = base.filter(r => isMale(r.gender)).length;
  const f = base.filter(r => isFemale(r.gender)).length;

  if (statTotal) statTotal.textContent = String(total);
  if (statF) statF.textContent = String(f);
  if (statM) statM.textContent = String(m);

  renderDynamicRoleCounters(base);

  if (pageSubtitle) {
    pageSubtitle.textContent = permissions?.canManageRoster
      ? (S.roster?.subtitle || "Jugadores convocados")
      : "Vista ordenada del roster por posición";
  }

  if (rosterSubtitle) {
    rosterSubtitle.textContent = permissions?.canManageRoster
      ? (S.roster?.subtitle || "Jugadores convocados")
      : "Jugadores agrupados por posición";
  }
}

function renderDynamicRoleCounters(list) {
  if (!roleCounters) return;

  const counts = getRoleCounts(list);

  roleCounters.innerHTML = PLAYER_ROLES.map(role => `
    <span class="badge text-bg-light border" title="${escapeHtml(role.label || role.id)}">
      ${escapeHtml(role.label || role.id)} <strong>${counts[role.id] || 0}</strong>
    </span>
  `).join("");
}

/* ==========================
   RENDER: RIGHT PANEL (PICKER)
========================== */
function renderPlayers() {
  if (!permissions?.canManageRoster) {
    if (playersList) playersList.innerHTML = "";
    if (playersEmpty) playersEmpty.classList.add("d-none");
    if (playersSubtitle) playersSubtitle.textContent = "";
    const addPanelState = document.getElementById("addPanelState");
    if (addPanelState) addPanelState.textContent = "";
    return;
  }

  const q = (playersSearch?.value || "").trim().toLowerCase();

  const rosterIds = new Set(roster.map(r => r.playerId || r.guestId || r.id));

  let pool = [...players, ...guests];
  let list = pool.filter(p => !rosterIds.has(p.id));

  if (q) {
    list = list.filter(p =>
      `${p.name || ""} ${p.nickname || ""} ${p.role || ""} ${p.loanFrom || ""}`
        .toLowerCase()
        .includes(q)
    );
  }

  if (playersList) {
    playersList.innerHTML = list.length ? list.map(playerPickRow).join("") : "";
  }

  if (playersEmpty) {
    playersEmpty.classList.toggle("d-none", list.length > 0);
    playersEmpty.textContent = q
      ? "No hay coincidencias."
      : "No hay jugadores disponibles (todos ya están en el roster).";
  }

  if (playersSubtitle) {
    const gCount = list.filter(x => x.isGuest).length;
    const pCount = list.length - gCount;
    playersSubtitle.textContent = `Disponibles: ${list.length} · Club: ${pCount} · Invitados: ${gCount}`;
  }

  const addPanelState = document.getElementById("addPanelState");
  if (addPanelState) addPanelState.textContent = `Disponibles: ${list.length}`;

  playersList?.querySelectorAll("[data-add]")?.forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-add");
      await addToRoster(id);
    });
  });
}

/* ==========================
   ACTIONS
========================== */
async function addToRoster(itemId) {
  if (!permissions?.canManageRoster) return;

  const p = players.find(x => x.id === itemId);
  const g = guests.find(x => x.id === itemId);
  const item = p || g;
  if (!item) return;

  showLoader();
  try {
    const ref = doc(db, TOURNAMENTS_COL, tournamentId, "roster", item.id);
    const feeTotal = toNumberOrZero(tournament?.playerFee);

    await setDoc(ref, {
      playerId: item.isGuest ? null : item.id,
      isGuest: !!item.isGuest,
      guestId: item.isGuest ? item.id : null,
      loanFrom: item.isGuest ? (item.loanFrom || "") : "",
      status: "convocado",
      feeTotal,
      payments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    await loadRoster();
    render();
    renderPlayers();
  } catch (e) {
    console.error(e);
    alert("Error agregando jugador al roster.");
  } finally {
    hideLoader();
  }
}

async function removeFromRoster(docId) {
  if (!permissions?.canManageRoster) return;

  const ok = confirm("¿Quitar del roster?");
  if (!ok) return;

  showLoader();
  try {
    await deleteDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", docId));
    await loadRoster();
    render();
    renderPlayers();
  } catch (e) {
    console.error(e);
    alert("Error quitando jugador.");
  } finally {
    hideLoader();
  }
}

async function toggleStatus(docId) {
  if (!permissions?.canManageRoster) return;

  const r = roster.find(x => x.id === docId);
  if (!r) return;

  const next = nextStatus(r.status);

  showLoader();
  try {
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", docId), {
      status: next,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await loadRoster();
    render();
    renderPlayers();
  } catch (e) {
    console.error(e);
    alert("Error actualizando estado.");
  } finally {
    hideLoader();
  }
}

async function toggleTeamFeePaid() {
  if (!permissions?.canManagePayments) return;
  if (!tournament) return;

  const next = !tournament.teamFeePaid;

  showLoader();
  try {
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId), {
      teamFeePaid: next,
      updatedAt: serverTimestamp()
    }, { merge: true });

    tournament.teamFeePaid = next;
    renderTeamFee();
  } catch (e) {
    console.error(e);
    alert("Error actualizando team fee.");
  } finally {
    hideLoader();
  }
}

function nextStatus(s) {
  const v = (s || "").toLowerCase();
  if (v === "convocado") return "confirmado";
  if (v === "confirmado") return "tentative";
  return "convocado";
}

/* ==========================
   CREATE GUEST (GLOBAL)
========================== */
async function createGuestFlow() {
  if (!permissions?.canCreateGuests) return;

  const name = prompt("Nombre del invitado:");
  if (!name || !name.trim()) return;

  const gender = (prompt("Género (M/F) (opcional):") || "").trim();
  const role = (prompt("Rol (opcional):") || getDefaultRoleId()).trim();
  const loanFrom = (prompt("¿Préstamo de qué club? (opcional):") || "").trim();
  const numberRaw = (prompt("Número (opcional):") || "").trim();
  const number = numberRaw ? Number(numberRaw) : null;

  showLoader();
  try {
    const newRef = doc(collection(db, GUESTS_COL));
    await setDoc(newRef, {
      name: name.trim(),
      gender: gender || null,
      role: role || getDefaultRoleId(),
      loanFrom: loanFrom || "",
      number: Number.isFinite(number) ? number : null,
      active: true,
      createdAt: serverTimestamp()
    });

    await loadGuests();
    renderPlayers();
  } catch (e) {
    console.error(e);
    alert("Error creando invitado.");
  } finally {
    hideLoader();
  }
}

/* ==========================
   UI BUILDERS
========================== */
function rosterRow(r) {
  const role = getRoleLabel(r.role);

  const status = prettyStatus(r.status);
  const statusClass = status === "Confirmado" ? "pill pill--yellow" : "pill";

  const guestBadge = r.isGuest
    ? `<span class="pill">${escapeHtml(r.loanFrom ? `Invitado · ${r.loanFrom}` : "Invitado")}</span>`
    : "";

  const missingBadge = r.missingSource
    ? `<span class="pill">Fuente no encontrada</span>`
    : "";

  const total = toNumberOrZero(r.feeTotal);
  const paid = toNumberOrZero(r.paidTotal);
  const balance = Math.max(0, total - paid);

  let feePill = "";

  if (total <= 0) {
    feePill = `<span class="pill">Sin fee</span>`;
  } else if (balance <= 0) {
    feePill = `<span class="pill pill--good">Fee pagado</span>`;
  } else {
    feePill = `<span class="pill">Pagado ₡${paid.toLocaleString("es-CR")} | Debe ₡${balance.toLocaleString("es-CR")}</span>`;
  }

  const actionsHtml = (permissions?.canManageRoster || permissions?.canManagePayments)
    ? `
      <div class="roster-row__actions">
        ${permissions?.canManageRoster ? `
          <button class="btn btn-sm btn-outline-secondary" title="Cambiar estado" data-toggle-status="${escapeHtml(r.id)}">
            <i class="bi bi-arrow-repeat"></i>
          </button>
        ` : ""}

        ${permissions?.canManagePayments && toNumberOrZero(r.feeTotal) > 0 ? `
          <button class="btn btn-sm btn-outline-success" title="Agregar abono" data-pay="${escapeHtml(r.id)}">
            <i class="bi bi-cash-coin"></i>
          </button>
        ` : ""}

        ${permissions?.canManageRoster ? `
          <button class="btn btn-sm btn-outline-danger" title="Quitar" data-remove="${escapeHtml(r.id)}">
            <i class="bi bi-x-lg"></i>
          </button>
        ` : ""}
      </div>
    `
    : "";

  return `
    <div class="roster-row">
      <div class="roster-row__top">
        <div>
          <div class="roster-row__name">${escapeHtml(r.name || "—")}</div>
          <div class="roster-row__meta">
            ${escapeHtml(role)}
            ${r.number != null ? ` · #${escapeHtml(r.number)}` : ""}
          </div>
        </div>

        ${actionsHtml}
      </div>

      <div class="roster-row__badges">
        <span class="${statusClass}">${escapeHtml(status)}</span>
        ${feePill}
        ${guestBadge}
        ${missingBadge}
      </div>
    </div>
  `;
}

function playerPickRow(p) {
  const sub = p.isGuest
    ? (p.loanFrom ? `Invitado · ${p.loanFrom}` : "Invitado")
    : getRoleLabel(p.role);

  const leftTag = p.isGuest ? `<span class="pill">Invitado</span>` : "";

  return `
    <div class="player-pick">
      <div>
        <div class="player-pick__name">
          ${escapeHtml(p.name || "—")}
          ${leftTag}
        </div>
        <div class="player-pick__sub">${escapeHtml(sub || "")}</div>
      </div>

      <button class="btn btn-sm btn-primary"
              data-add="${escapeHtml(p.id)}"
              title="Agregar">
        <i class="bi bi-plus-lg"></i>
      </button>
    </div>
  `;
}

function getGroupedRoster(list) {
  const groups = new Map();

  PLAYER_ROLES.forEach(role => {
    groups.set(normalizeRoleId(role.id), {
      id: normalizeRoleId(role.id),
      label: role.label || role.id,
      items: []
    });
  });

  const ungrouped = {
    id: "otros",
    label: "Otros",
    items: []
  };

  list.forEach(item => {
    const rid = normalizeRoleId(item.role);
    if (groups.has(rid)) groups.get(rid).items.push(item);
    else ungrouped.items.push(item);
  });

  const ordered = [];

  PLAYER_ROLES.forEach(role => {
    const key = normalizeRoleId(role.id);
    const group = groups.get(key);
    if (group && group.items.length) {
      group.items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
      ordered.push(group);
    }
  });

  if (ungrouped.items.length) {
    ungrouped.items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
    ordered.push(ungrouped);
  }

  return ordered;
}

function rosterGroupSection(group) {
  return `
    <section class="roster-group mb-3">
      <div class="roster-group__title fw-semibold mb-2">
        ${escapeHtml(group.label)} <span class="text-muted">(${group.items.length})</span>
      </div>
      <div class="roster-group__list d-flex flex-column gap-2">
        ${group.items.map(rosterRow).join("")}
      </div>
    </section>
  `;
}

/* ==========================
   TEAM FEE UI
========================== */
function renderTeamFee() {
  if (!teamFeePill || !toggleTeamFeeBtn || !tournament) return;

  const amount = tournament.teamFee != null
    ? `₡${Number(tournament.teamFee).toLocaleString("es-CR")}`
    : "—";

  const paid = !!tournament.teamFeePaid;

  teamFeePill.textContent = `Team fee: ${amount} · ${paid ? "Pagado" : "Pendiente"}`;
  teamFeePill.className = `pill ${paid ? "pill--good" : "pill--warn"}`;

  if (permissions?.canManagePayments) {
    toggleTeamFeeBtn.innerHTML = paid
      ? `<i class="bi bi-cash-coin"></i> Marcar pendiente`
      : `<i class="bi bi-cash-coin"></i> Marcar pagado`;
  }
}

/* ==========================
   STRINGS
========================== */
function applyStrings() {
  pageTitle && (pageTitle.textContent = S.roster?.title || "Roster del torneo");
  pageSubtitle && (pageSubtitle.textContent = S.roster?.subtitle || "Jugadores convocados");

  rosterTitle && (rosterTitle.textContent = S.roster?.title || "Roster del torneo");
  rosterSubtitle && (rosterSubtitle.textContent = S.roster?.subtitle || "Jugadores convocados");

  if (lblSearch) lblSearch.classList.add("d-none");
  if (searchInput) searchInput.classList.add("d-none");

  playersTitle && (playersTitle.textContent = "Jugadores");
  btnAddLabel && (btnAddLabel.textContent = "Agregar jugador");
}

/* ==========================
   FILTER UX (legend)
========================== */
function renderDynamicRoleFilters() {
  const mount = document.getElementById("roleFiltersMount");
  if (!mount) return;

  mount.innerHTML = PLAYER_ROLES.map(role => {
    const rid = normalizeRoleId(role.id);
    const inputId = `f_role_${rid}`;
    return `
      <div class="form-check">
        <input
          class="form-check-input roster-filter-check"
          type="checkbox"
          id="${escapeHtml(inputId)}"
          data-filter="role:${escapeHtml(rid)}"
        >
        <label class="form-check-label" for="${escapeHtml(inputId)}">
          ${escapeHtml(role.label || role.id)}
        </label>
      </div>
    `;
  }).join("");
}

function initLegendFiltersUX() {
  const checks = document.querySelectorAll(".roster-filter-check");
  const countEl = document.getElementById("filtersCount");

  function refreshUI() {
    checks.forEach(chk => {
      const key = chk.dataset?.filter;
      if (!key) return;
      chk.checked = activeLegendFilters.has(key);
    });

    const n = activeLegendFilters.size;
    if (countEl) {
      countEl.textContent = String(n);
      countEl.style.display = n > 0 ? "" : "none";
    }

    syncLegendUI();
  }

  if (checks.length) {
    checks.forEach(chk => {
      chk.addEventListener("change", () => {
        const key = chk.dataset?.filter;
        if (!key) return;

        if (chk.checked) activeLegendFilters.add(key);
        else activeLegendFilters.delete(key);

        refreshUI();
        render();
      });
    });
  }

  document.getElementById("clearLegendFilters")?.addEventListener("click", () => {
    activeLegendFilters.clear();
    refreshUI();
    render();
  });

  refreshUI();
}

function syncLegendUI() {
  if (clearLegendFiltersBtn) {
    clearLegendFiltersBtn.classList.toggle("d-none", activeLegendFilters.size === 0);
  }

  if (!filtersHintEl) return;

  if (activeLegendFilters.size === 0) {
    filtersHintEl.innerHTML = permissions?.canManageRoster
      ? `Tip: puedes combinar filtros (ej. <strong>Confirmado</strong> + <strong>Fee pendiente</strong>).`
      : `Tip: usa filtros para ordenar mejor el roster por estado, fee o posición.`;
    return;
  }

  const labels = [];
  for (const f of activeLegendFilters) {
    const [type, value] = f.split(":");

    if (type === "status") {
      if (value === "confirmado") labels.push("Confirmado");
      else if (value === "convocado") labels.push("Convocado");
      else if (value === "tentative") labels.push("Por confirmar");
      else labels.push(value);
    } else if (type === "fee") {
      if (value === "pendiente") labels.push("Fee pendiente");
      else if (value === "pagado") labels.push("Fee pagado");
      else labels.push(value);
    } else if (type === "role") {
      labels.push(getRoleLabel(value));
    } else if (type === "gender") {
      if (value === "m") labels.push("Masculino");
      else if (value === "f") labels.push("Femenino");
      else labels.push(value);
    } else if (type === "guest") {
      if (value === "true") labels.push("Solo invitados");
      else labels.push(f);
    } else {
      labels.push(f);
    }
  }

  filtersHintEl.innerHTML = `Mostrando: <strong>${labels.join(" + ")}</strong>`;
}

/* ==========================
   HELPERS
========================== */
function prettyStatus(s) {
  const v = (s || "").toLowerCase();
  if (v === "confirmado") return "Confirmado";
  if (v === "tentative") return "Por confirmar";
  if (v === "convocado") return "Convocado";
  return s || "—";
}

function formatTournamentMeta(t) {
  const where = (t.location || "").trim();
  return where ? `📍 ${where}` : "📍 —";
}

function matchesLegendFilters(r) {
  for (const f of activeLegendFilters) {
    const [type, value] = f.split(":");

    if (type === "status") {
      if ((r.status || "").toLowerCase() !== value) return false;
    }

    if (type === "fee") {
      const paid = !!r.feeIsPaid;
      if (value === "pagado" && !paid) return false;
      if (value === "pendiente" && paid) return false;
    }

    if (type === "role") {
      if (normalizeRoleId(r.role) !== value) return false;
    }

    if (type === "gender") {
      if (value === "m" && !isMale(r.gender)) return false;
      if (value === "f" && !isFemale(r.gender)) return false;
    }

    if (type === "guest") {
      const want = value === "true";
      if (!!r.isGuest !== want) return false;
    }
  }
  return true;
}

function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg;
  errorBox.classList.remove("d-none");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toNumberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMale(g) {
  const v = String(g || "").trim().toLowerCase();
  return ["m", "male", "masculino", "hombre", "man"].includes(v);
}

function isFemale(g) {
  const v = String(g || "").trim().toLowerCase();
  return ["f", "female", "femenino", "mujer", "woman"].includes(v);
}

function normalizeRoleId(role) {
  return String(role || "").trim().toLowerCase();
}

function getDefaultRoleId() {
  return APP_CONFIG?.playerRoles?.[0]?.id ?? "player";
}

function getRoleLabel(roleId) {
  const id = normalizeRoleId(roleId);
  const found = PLAYER_ROLES.find(r => normalizeRoleId(r.id) === id);
  return found?.label || roleId || "—";
}

function getRoleCounts(list) {
  const counts = {};

  PLAYER_ROLES.forEach(role => {
    counts[role.id] = 0;
  });

  list.forEach(item => {
    const rid = normalizeRoleId(item.role);
    if (!rid) return;
    if (counts[rid] !== undefined) counts[rid]++;
  });

  return counts;
}

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}