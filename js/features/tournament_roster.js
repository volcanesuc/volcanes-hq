// js/tournament_roster.js
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
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

// ✅ Invitados globales (reutilizables entre torneos)
const GUESTS_COL = APP_CONFIG?.club?.guestsCollection || "guest_players";

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

// Team fee UI (hero)
const teamFeePill = document.getElementById("teamFeePill");
const toggleTeamFeeBtn = document.getElementById("toggleTeamFeeBtn");

// UX filtros (si existen en tu HTML)
const clearLegendFiltersBtn = document.getElementById("clearLegendFilters");
const filtersHintEl = document.getElementById("filtersHint");

// Stats badges (panel roster)
const statTotal = document.getElementById("statTotal");
const statF = document.getElementById("statF");
const statM = document.getElementById("statM");
const statHandlers = document.getElementById("statHandlers");
const statCutters = document.getElementById("statCutters");

// Invitados UI (si existe en tu HTML)
const addGuestBtn = document.getElementById("addGuestBtn");

// Boton de editar
const editTournamentBtn = document.getElementById("editTournamentBtn");

/* ==========================
   PARAMS / STATE
========================== */
const params = new URLSearchParams(window.location.search);
const tournamentId = (params.get("id") || "").trim();

let tournament = null;
let roster = [];      // tournaments/{id}/roster
let players = [];     // club players (activos)
let guests = [];      // guest_players (activos)

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
      await loadRoster();
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

    initLegendFiltersUX();

    await loadPlayers();
    await loadGuests();
    await loadRoster();
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

      const fromGuest = r.isGuest ? guestsById.get(refId) : null;
      const fromPlayer = !r.isGuest ? playersById.get(refId) : null;
      const source = fromPlayer || fromGuest || playersById.get(refId) || guestsById.get(refId);

      const payments = Array.isArray(r.payments) ? r.payments : [];
      const feeTotal = Number.isFinite(Number(r.feeTotal)) ? Number(r.feeTotal) : defaultFeeTotal;
      const paidTotal = sumPayments(payments);
      const balance = feeTotal - paidTotal;
      const feeIsPaid = feeTotal > 0 ? balance <= 0 : false;

      return {
        ...r,

        // ✅ relleno UI
        name: r.name ?? source?.name ?? "—",
        number: r.number ?? source?.number ?? null,
        role: r.role ?? source?.role ?? null,
        gender: r.gender ?? source?.gender ?? null,

        playerId: r.playerId || refId || null,

        // ✅ pagos parciales (en memoria)
        payments,
        feeTotal,
        paidTotal,
        balance,
        feeIsPaid
      };
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  console.log(
    "Roster loaded:",
    roster.length,
    "with gender:",
    roster.filter(x => !!x.gender).length
  );
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

  if (playersSubtitle) {
    playersSubtitle.textContent = players.length
      ? `${players.length} jugador(es) activo(s)`
      : `No hay jugadores activos disponibles.`;
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
      role: g.role || "hybrid",
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

  //Mostrar link del evento
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

  if (rosterList) rosterList.innerHTML = list.length ? list.map(rosterRow).join("") : "";

  if (rosterEmpty) {
    rosterEmpty.classList.toggle("d-none", list.length > 0);
    rosterEmpty.textContent = S.roster?.empty || "No hay jugadores asignados a este torneo.";
  }

  renderRosterCounters(list);

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

  // ✅ nuevo: abonar (usa componente extraído)
  rosterList?.querySelectorAll("[data-pay]")?.forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pay");
      const r = roster.find(x => x.id === id);
      if (!r) return;

      const modal = await ensurePayModal();

      // sugerencia = saldo si debe, si no vacío
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
  // Puedes decidir si contar sobre roster completo o sobre lo visible (filtrado)
  const base = roster;         // stats globales
  // const base = visibleList; // <- descomenta si quieres stats por filtros

  const total = base.length;

  const m = base.filter(r => isMale(r.gender)).length;
  const f = base.filter(r => isFemale(r.gender)).length;

  const handlers = base.filter(r => isHandler(r.role)).length;
  const cutters = base.filter(r => isCutter(r.role)).length;

  const guestsCount = base.filter(r => r.isGuest).length;

  const paidCount = base.filter(r => r.feeIsPaid).length;
  const pendingCount = base.filter(r => !r.feeIsPaid).length;

  // pintar en badges (abajo)
  if (statTotal) statTotal.textContent = String(total);
  if (statF) statF.textContent = String(f);
  if (statM) statM.textContent = String(m);
  if (statHandlers) statHandlers.textContent = String(handlers);
  if (statCutters) statCutters.textContent = String(cutters);

  // arriba ya no mostramos el mega texto
  if (pageSubtitle) pageSubtitle.textContent = "";

}


/* ==========================
   RENDER: RIGHT PANEL (PICKER)
========================== */
function renderPlayers() {
  const q = (playersSearch?.value || "").trim().toLowerCase();

  const rosterIds = new Set(roster.map(r => r.playerId || r.id));

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
  const p = players.find(x => x.id === itemId);
  const g = guests.find(x => x.id === itemId);
  const item = p || g;
  if (!item) return;

  showLoader();
  try {
    const ref = doc(db, TOURNAMENTS_COL, tournamentId, "roster", item.id);

    // ✅ feeTotal por defecto = playerFee del torneo
    const feeTotal = toNumberOrZero(tournament?.playerFee);

    await setDoc(ref, {
      playerId: item.id,
      isGuest: !!item.isGuest,
      guestId: item.isGuest ? item.id : null,
      loanFrom: item.isGuest ? (item.loanFrom || "") : "",
      name: item.name,
      number: item.number ?? null,
      role: item.role || "hybrid",
      gender: item.gender ?? null,
      status: "convocado",

      // ✅ pagos parciales
      feeTotal,
      payments: [],

      createdAt: serverTimestamp()
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
  const name = prompt("Nombre del invitado:");
  if (!name || !name.trim()) return;

  const gender = (prompt("Género (M/F) (opcional):") || "").trim();
  const role = (prompt("Rol (handler/cutter/hybrid) (opcional):") || "hybrid").trim();
  const loanFrom = (prompt("¿Préstamo de qué club? (opcional):") || "").trim();
  const numberRaw = (prompt("Número (opcional):") || "").trim();
  const number = numberRaw ? Number(numberRaw) : null;

  showLoader();
  try {
    const newRef = doc(collection(db, GUESTS_COL));
    await setDoc(newRef, {
      name: name.trim(),
      gender: gender || null,
      role: role || "hybrid",
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
  const role = r.role || "—";

  const status = prettyStatus(r.status);
  const statusClass = status === "Confirmado" ? "pill pill--yellow" : "pill";

  const guestBadge = r.isGuest
    ? `<span class="pill">${escapeHtml(r.loanFrom ? `Invitado · ${r.loanFrom}` : "Invitado")}</span>`
    : "";

  const total = toNumberOrZero(r.feeTotal);
  const paid = toNumberOrZero(r.paidTotal);
  const balance = Math.max(0, total - paid);

  // 💰 estado visual
  let feePill = "";
  let feeDetail = "";

  if (total <= 0) {
    feePill = `<span class="pill">Sin fee</span>`;
    feeDetail = "";
  } 
  else if (balance <= 0) {
    // 🟢 PAGADO
    feePill = `<span class="pill pill--good">Fee pagado</span>`;
    feeDetail = "";
  } 
  else {
    // 🔴 DEBE
    feePill = `<span class="pill">Pagado ₡${paid.toLocaleString("es-CR")} | Debe ₡${balance.toLocaleString("es-CR")}</span>`;
    feeDetail = "";
  }

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

        <div class="roster-row__actions">
          <button class="btn btn-sm btn-outline-secondary" title="Cambiar estado" data-toggle-status="${escapeHtml(r.id)}">
            <i class="bi bi-arrow-repeat"></i>
          </button>

          <!-- ✅ abonos -->
          <button class="btn btn-sm btn-outline-success" title="Agregar abono" data-pay="${escapeHtml(r.id)}">
            <i class="bi bi-cash-coin"></i>
          </button>

          <button class="btn btn-sm btn-outline-danger" title="Quitar" data-remove="${escapeHtml(r.id)}">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      <div class="roster-row__badges">
        <span class="${statusClass}">${escapeHtml(status)}</span>
        ${feePill}
        ${feeDetail}
        ${guestBadge}
      </div>
    </div>
  `;
}

function playerPickRow(p) {
  const sub = p.isGuest
    ? (p.loanFrom ? `Invitado · ${p.loanFrom}` : "Invitado")
    : (p.role || "");

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

  toggleTeamFeeBtn.innerHTML = paid
    ? `<i class="bi bi-cash-coin"></i> Marcar pendiente`
    : `<i class="bi bi-cash-coin"></i> Marcar pagado`;
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
function initLegendFiltersUX() {
  const checks = document.querySelectorAll(".roster-filter-check");
  const countEl = document.getElementById("filtersCount");

  function refreshUI() {
    // Sync checks con activeLegendFilters
    checks.forEach(chk => {
      const key = chk.dataset?.filter;
      if (!key) return;
      chk.checked = activeLegendFilters.has(key);
    });

    // Count badge
    const n = activeLegendFilters.size;
    if (countEl) {
      countEl.textContent = String(n);
      countEl.style.display = n > 0 ? "" : "none";
    }

    // Hint
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

  // Limpiar
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
    filtersHintEl.innerHTML = `Tip: puedes combinar filtros (ej. <strong>Confirmado</strong> + <strong>Fee pendiente</strong>).`;
    return;
  }

  const labels = [];
  for (const f of activeLegendFilters) {
    if (f === "status:confirmado") labels.push("Confirmado");
    else if (f === "status:convocado") labels.push("Convocado");
    else if (f === "fee:pendiente") labels.push("Fee pendiente");
    else if (f === "fee:pagado") labels.push("Fee pagado");
    else labels.push(f);
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
      if ((r.role || "").toLowerCase() !== value) return false;
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

// counters helpers
function isMale(g) {
  const v = String(g || "").trim().toLowerCase();
  return ["m", "male", "masculino", "hombre", "man"].includes(v);
}

function isFemale(g) {
  const v = String(g || "").trim().toLowerCase();
  return ["f", "female", "femenino", "mujer", "woman"].includes(v);
}

function isHandler(role) {
  return role === "handler";
}

function isCutter(role) {
  return role === "cutter";
}

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}
