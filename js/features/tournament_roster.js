// js/features/tournament_roster.js
// Roster de un torneo: convocados, estados, player fee (con becas), abonos e invitados.
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { getCurrentPermissions } from "../auth/permissions.js";
import { APP_CONFIG } from "../config/config.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { loadHeader } from "../components/header.js";
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
import { TX, txf } from "/js/strings/screens/tournament_roster.js";
import { TOURNAMENT_STRINGS } from "../strings.js";

/* ==========================
   HEADER / AUTH
========================== */
await loadHeader("tournaments");
document.getElementById("logoutBtn")?.addEventListener("click", logout);

/* ==========================
   CONFIG
========================== */
const COL = APP_CONFIG.collections;
const TOURNAMENTS_COL = COL.tournaments;
const CLUB_PLAYERS_COL = COL.club_players;
const USERS_COL = COL.users;
const GUESTS_COL = COL.guests;

const PLAYER_ROLES = Array.isArray(APP_CONFIG?.playerRoles) ? APP_CONFIG.playerRoles : [];

// feeType del jugador en el roster
const FEE = {
  STANDARD: "standard", // player fee del torneo
  PERCENT: "percent",   // beca parcial (%)
  FULL: "full",         // beca completa
  CUSTOM: "custom",     // monto personalizado
};

const STATUS_ORDER = ["convocado", "confirmado", "tentative"];

/* ==========================
   DOM
========================== */
const $ = (id) => document.getElementById(id);

/* ==========================
   STATE
========================== */
let permissions = null;

const params = new URLSearchParams(window.location.search);
const tournamentId = (params.get("id") || "").trim();

let tournament = null;
let roster = [];
let players = [];
let guests = [];

let activeFilter = "all";
let openPayments = new Set();

/* ==========================
   LAZY MODALS
========================== */
let tournamentEditor = null;
async function ensureTournamentEditor() {
  await loadPartialOnce("/partials/tournament_editor.html", "modalMount");
  if (!tournamentEditor) tournamentEditor = createTournamentEditor();
  return tournamentEditor;
}

let payModal = null;
async function ensurePayModal() {
  await loadPartialOnce("/partials/payment_modal.html", "modalMount");
  if (!payModal) payModal = createPaymentModal();
  return payModal;
}

const feeModal = new bootstrap.Modal($("feeModal"));
const guestModal = new bootstrap.Modal($("guestModal"));

/* ==========================
   EVENTS
========================== */
$("playersSearch")?.addEventListener("input", renderPlayers);
$("rosterSearch")?.addEventListener("input", renderRoster);
$("toggleTeamFeeBtn")?.addEventListener("click", toggleTeamFeePaid);
$("addGuestBtn")?.addEventListener("click", openGuestModal);
$("guestForm")?.addEventListener("submit", submitGuest);
$("feeForm")?.addEventListener("submit", submitFee);
$("feeForm")?.addEventListener("input", updateFeePreview);

$("rosterFilters")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-filter]");
  if (!btn) return;
  activeFilter = btn.getAttribute("data-filter");
  renderRoster();
});

$("rosterList")?.addEventListener("click", onRosterClick);

$("playersList")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-add]");
  if (btn) addToRoster(btn.getAttribute("data-add"));
});

$("editTournamentBtn")?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!permissions?.canEditTournament || !tournamentId) return;
  const editor = await ensureTournamentEditor();
  editor?.openEditById(tournamentId);
});

window.addEventListener("tournament:changed", async (e) => {
  const { id, deleted } = e.detail || {};
  if (id !== tournamentId) return;

  if (deleted) {
    alert(TX.esteTorneoFueEliminado);
    window.location.href = "/tournaments.html";
    return;
  }

  showLoader();
  try {
    tournament = await fetchTournament(tournamentId);
    await reloadAll();
  } catch (err) {
    console.error(err);
    alert(TX.errorRecargandoElTorneo);
  } finally {
    hideLoader();
  }
});

/* ==========================
   INIT
========================== */
watchAuth(async () => {
  showLoader();
  try {
    permissions = await getCurrentPermissions();
    if ($("appVersion")) $("appVersion").textContent = `v${APP_CONFIG.version}`;

    if (!tournamentId) return showError(TX.faltaElParametroDel);

    tournament = await fetchTournament(tournamentId);
    if (!tournament) return showError(TX.noSeEncontroEl);

    fillGuestRoles();
    await reloadAll();
  } catch (e) {
    console.error(e);
    showError(TX.errorCargandoRosterDel);
  } finally {
    hideLoader();
  }
});

async function reloadAll() {
  await Promise.all([loadPlayers(), loadGuests()]);
  await loadRoster();
  applyRoleUI();
  render();
}

/* ==========================
   DATA
========================== */
async function fetchTournament(id) {
  const snap = await getDoc(doc(db, TOURNAMENTS_COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

function buildDisplayName(firstName, lastName) {
  return [firstName, lastName]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getUserProfile(userData = {}) {
  const safeUser = userData && typeof userData === "object" ? userData : {};
  const profile = safeUser.profile && typeof safeUser.profile === "object"
    ? safeUser.profile
    : {};

  return {
    firstName: safeUser.firstName ?? profile.firstName ?? "",
    lastName: safeUser.lastName ?? profile.lastName ?? "",
    displayName: safeUser.displayName ?? profile.displayName ?? "",
    name: safeUser.name ?? profile.name ?? "",
    email: safeUser.email ?? profile.email ?? "",
    idNumber: safeUser.idNumber ?? profile.idNumber ?? null,
    gender: safeUser.gender ?? profile.gender ?? null,
    birthday: safeUser.birthday ?? safeUser.birthDate ?? profile.birthday ?? profile.birthDate ?? null,
    number: safeUser.number ?? profile.number ?? null,
    role: safeUser.role ?? profile.role ?? "",
    nickname: safeUser.nickname ?? profile.nickname ?? "",
    photoURL: safeUser.photoURL ?? profile.photoURL ?? profile.avatarUrl ?? ""
  };
}

function getUserDisplayName(userData = {}) {
  const u = getUserProfile(userData);

  const joinedName = buildDisplayName(u.firstName, u.lastName);

  return (
    joinedName ||
    u.displayName ||
    u.name ||
    u.email ||
    "—"
  );
}

function normalizeClubPlayerActive(cp = {}) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  if (safeCp.active === false) return false;
  if (safeCp.isActive === false) return false;
  if (safeCp.status === "inactive") return false;
  return true;
}

function getClubPlayerUserId(cp = {}) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  return safeCp.userId || safeCp.linkedUserId || safeCp.uid || safeCp.userRefId || null;
}

function getClubPlayerName(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};

  const joinedName = buildDisplayName(safeCp.firstName, safeCp.lastName);

  return (
    joinedName ||
    safeCp.displayName ||
    safeCp.name ||
    getUserDisplayName(user || {}) ||
    "—"
  );
}

function getClubPlayerNumber(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  const v = safeCp.number ?? safeCp.jerseyNumber ?? u.number ?? null;
  return v == null ? null : v;
}

function getClubPlayerRole(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return normalizeRoleId(safeCp.role || safeCp.position || u.role || "");
}

function getClubPlayerGender(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return safeCp.gender || u.gender || null;
}

function getClubPlayerNickname(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return safeCp.nickname || u.nickname || "";
}

function getClubPlayerEmail(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return safeCp.email || u.email || "";
}

function getClubPlayerPhoto(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return safeCp.photoURL || safeCp.avatarUrl || u.photoURL || "";
}

/* ==========================
   FEES / BECAS
========================== */
function basePlayerFee() {
  return toNumberOrZero(tournament?.playerFee);
}

// Lo que tiene que pagar este jugador según su tipo de fee.
// Sin feeType (registros viejos) se respeta el feeTotal guardado.
function computeFee(r) {
  const base = basePlayerFee();
  switch (r.feeType) {
    case FEE.FULL: return 0;
    case FEE.PERCENT: return Math.max(0, Math.round(base * (1 - clampPercent(r.feePercent) / 100)));
    case FEE.CUSTOM: return Math.max(0, toNumberOrZero(r.feeCustom));
    case FEE.STANDARD: return base;
    default: return Number.isFinite(Number(r.feeTotal)) ? Number(r.feeTotal) : base;
  }
}

function isBeca(r) {
  return r.feeType === FEE.FULL || r.feeType === FEE.PERCENT || r.feeType === FEE.CUSTOM;
}

function becaLabel(r) {
  if (r.feeType === FEE.FULL) return TX.becaFull;
  if (r.feeType === FEE.PERCENT) return txf(TX.becaPercent, { percent: clampPercent(r.feePercent) });
  if (r.feeType === FEE.CUSTOM) return TX.becaCustom;
  return "";
}

function clampPercent(v) {
  return Math.min(100, Math.max(0, Math.round(toNumberOrZero(v))));
}

function currencySymbol() {
  const c = String(tournament?.feeCurrency || "CRC").toUpperCase();
  return c === "USD" ? "$" : c === "EUR" ? "€" : "₡";
}

function money(n) {
  return `${currencySymbol()}${Math.round(toNumberOrZero(n)).toLocaleString("es-CR")}`;
}

/* ==========================
   ROSTER
========================== */
async function loadRoster() {
  const snap = await getDocs(collection(db, TOURNAMENTS_COL, tournamentId, "roster"));
  const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const playersById = new Map(players.map(p => [p.id, p]));
  const playersByUserId = new Map(players.filter(p => p.userId).map(p => [p.userId, p]));
  const guestsById = new Map(guests.map(g => [g.id, g]));

  roster = raw
    .map(r => {
      const isGuest = !!r.isGuest;
      let source = null;
      let sourceId = "";

      if (isGuest) {
        const gid = (r.guestId || r.id || "").trim();
        source = guestsById.get(gid) || null;
        sourceId = gid;
      } else {
        const clubPlayerId = (r.clubPlayerId || r.playerId || r.id || "").trim();
        const userId = (r.userId || "").trim();
        source = playersById.get(clubPlayerId) || (userId ? playersByUserId.get(userId) : null) || null;
        sourceId = source?.id || clubPlayerId || userId || "";
      }

      const payments = Array.isArray(r.payments) ? r.payments : [];
      const feeTotal = computeFee(r);
      const paidTotal = sumPayments(payments);
      const balance = feeTotal - paidTotal;

      return {
        ...r,
        sourceId,
        isGuest,
        name: source?.name ?? "—",
        number: source?.number ?? null,
        role: source?.role ?? null,
        gender: source?.gender ?? null,
        photoURL: source?.photoURL || "",
        loanFrom: isGuest ? (source?.loanFrom || r.loanFrom || "") : "",
        clubPlayerId: !isGuest ? (source?.id || r.clubPlayerId || r.playerId || null) : null,
        guestId: isGuest ? (r.guestId || sourceId || null) : null,
        payments,
        feeTotal,
        paidTotal,
        balance,
        feeIsPaid: feeTotal > 0 ? balance <= 0 : true,
        missingSource: !source,
      };
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
}

async function loadPlayers() {
  const [usersSnap, clubPlayersSnap] = await Promise.all([
    getDocs(collection(db, USERS_COL)),
    getDocs(collection(db, CLUB_PLAYERS_COL))
  ]);

  const usersById = {};
  usersSnap.forEach(d => { usersById[d.id] = { id: d.id, ...d.data() }; });

  players = clubPlayersSnap.docs
    .map(d => {
      const cp = d.data() || {};
      const userId = getClubPlayerUserId(cp);
      const user = userId ? usersById[userId] || null : null;
      const displayName = getClubPlayerName(cp, user);
      return {
        id: d.id,
        clubPlayerId: d.id,
        userId,
        name: displayName,
        nickname: getClubPlayerNickname(cp, user),
        role: getClubPlayerRole(cp, user),
        number: getClubPlayerNumber(cp, user),
        gender: getClubPlayerGender(cp, user),
        active: normalizeClubPlayerActive(cp),
        isGuest: false,
        photoURL: getClubPlayerPhoto(cp, user),
      };
    })
    .filter(p => p.active === true && (p.name || "").trim().length > 0)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
}

async function loadGuests() {
  const snap = await getDocs(collection(db, GUESTS_COL));
  guests = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .map(g => ({
      id: g.id,
      name: (g.name || "").trim(),
      role: g.role || getDefaultRoleId(),
      number: g.number ?? null,
      gender: g.gender ?? null,
      active: g.active !== false,
      loanFrom: g.loanFrom || "",
      isGuest: true,
    }))
    .filter(g => g.active === true && g.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/* ==========================
   PERMISSIONS / UI
========================== */
const canManage = () => !!permissions?.canManageRoster;
const canPay = () => !!permissions?.canManagePayments;

function applyRoleUI() {
  $("editTournamentBtn")?.classList.toggle("d-none", !permissions?.canEditTournament);
  $("addGuestBtn")?.classList.toggle("d-none", !permissions?.canCreateGuests);
  $("toggleTeamFeeBtn")?.classList.toggle("d-none", !canPay());

  // la plata (y las becas) solo la ven quienes manejan pagos
  document.querySelectorAll("[data-money]").forEach((el) => el.classList.toggle("d-none", !canPay()));
  $("summaryRow")?.querySelector(".col-lg-3")?.classList.toggle("col-lg-12", !canPay());

  $("playersPanelCol")?.classList.toggle("d-none", !canManage());
  $("rosterPanelCol")?.classList.toggle("col-xl-8", canManage());
  $("rosterPanelCol")?.classList.toggle("col-xl-12", !canManage());

  if ($("pageSubtitle")) $("pageSubtitle").textContent = canManage() ? TX.kickerAdmin : TX.kickerViewer;
  if ($("rosterTitle")) $("rosterTitle").textContent = TX.rosterDelTorneo;
  if ($("playersTitle")) $("playersTitle").textContent = TX.agregarJugadores;
}

/* ==========================
   RENDER
========================== */
function render() {
  renderHero();
  renderSummary();
  renderRoster();
  renderPlayers();
}

function renderHero() {
  if (!tournament) return;
  $("tName").textContent = tournament.name || "—";
  $("tMeta").textContent = (tournament.location || "").trim() || "—";
  $("tDates").textContent = formatDateRange(tournament.dateStart, tournament.dateEnd);

  const opts = TOURNAMENT_STRINGS.fields || {};
  const type = [
    opts.type?.options?.[tournament.type] || tournament.type,
    opts.age?.options?.[tournament.age] || tournament.age,
    opts.venue?.options?.[tournament.venue] || tournament.venue,
  ].filter(Boolean).join(" · ");
  $("tTypeWrap").classList.toggle("d-none", !type);
  $("tType").textContent = type;

  const url = normalizeUrl(tournament?.officialUrl || tournament?.url || "");
  $("tOfficialLink").classList.toggle("d-none", !url);
  $("tOfficialLink").href = url || "#";
  document.title = `${tournament.name || TX.rosterDelTorneo}`;
}

function renderSummary() {
  const total = roster.length;
  const confirmed = roster.filter(r => norm(r.status) === "confirmado").length;
  $("statTotal").textContent = String(total);
  $("statConfirmed").textContent = txf(TX.statConfirmed, { n: confirmed });
  $("statF").textContent = String(roster.filter(r => isFemale(r.gender)).length);
  $("statM").textContent = String(roster.filter(r => isMale(r.gender)).length);

  const counts = getRoleCounts(roster);
  $("roleCounters").textContent = PLAYER_ROLES
    .map(role => `${role.label || role.id}: ${counts[normalizeRoleId(role.id)] || 0}`)
    .join(" · ");

  if (!canPay()) return;

  const expected = roster.reduce((s, r) => s + r.feeTotal, 0);
  const collected = roster.reduce((s, r) => s + r.paidTotal, 0);
  const pending = roster.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const debtors = roster.filter(r => r.balance > 0).length;
  const becas = roster.filter(isBeca);
  const becaAmount = becas.reduce((s, r) => s + Math.max(0, basePlayerFee() - r.feeTotal), 0);

  $("statCollected").textContent = money(collected);
  $("statExpected").textContent = txf(TX.statExpected, { expected: money(expected) });
  $("statProgress").style.width = `${expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0}%`;
  $("statPending").textContent = money(pending);
  $("statDebtors").textContent = debtors ? txf(TX.statDebtors, { n: debtors }) : TX.statAllPaid;
  $("statBecas").textContent = becas.length
    ? txf(TX.statBecas, { n: becas.length, amount: money(becaAmount) })
    : TX.statNoBecas;

  renderTeamFee();
}

function renderTeamFee() {
  const hasFee = tournament?.teamFee != null && tournament.teamFee !== "";
  const paid = !!tournament?.teamFeePaid;
  $("teamFeeAmount").textContent = hasFee ? money(tournament.teamFee) : TX.noTeamFee;
  const pill = $("teamFeePill");
  pill.textContent = paid ? TX.teamFeePaid : TX.teamFeePending;
  pill.className = `tr-chip ${paid ? "tr-chip--good" : "tr-chip--warn"}`;
  pill.classList.toggle("d-none", !hasFee);
  const btn = $("toggleTeamFeeBtn");
  btn.textContent = paid ? TX.marcarPendiente : TX.marcarPagado;
  btn.classList.toggle("d-none", !canPay() || !hasFee);
}

/* ---------- filtros ---------- */
const FILTERS = [
  { id: "all", label: () => TX.filterAll, test: () => true },
  { id: "confirmado", label: () => TX.filterConfirmed, test: (r) => norm(r.status) === "confirmado" },
  { id: "convocado", label: () => TX.filterCalled, test: (r) => norm(r.status) === "convocado" || !r.status },
  { id: "tentative", label: () => TX.filterTentative, test: (r) => norm(r.status) === "tentative" },
  { id: "owes", label: () => TX.filterOwes, test: (r) => r.balance > 0, money: true },
  { id: "paid", label: () => TX.filterPaid, test: (r) => r.feeTotal > 0 && r.balance <= 0, money: true },
  { id: "beca", label: () => TX.filterBeca, test: isBeca, money: true },
  { id: "guests", label: () => TX.filterGuests, test: (r) => r.isGuest },
];

function renderFilters() {
  const visible = FILTERS.filter(f => !f.money || canPay());
  if (!visible.some(f => f.id === activeFilter)) activeFilter = "all";
  $("rosterFilters").innerHTML = visible
    .map(f => {
      const n = roster.filter(f.test).length;
      if (f.id !== "all" && n === 0 && f.id !== activeFilter) return "";
      return `<button type="button" class="tr-filter ${f.id === activeFilter ? "is-active" : ""}" data-filter="${f.id}">
        ${escapeHtml(f.label())}<span class="tr-filter__n">${n}</span></button>`;
    })
    .join("");
}

function renderRoster() {
  renderFilters();
  const filter = FILTERS.find(f => f.id === activeFilter) || FILTERS[0];
  const q = ($("rosterSearch")?.value || "").trim().toLowerCase();

  const list = roster
    .filter(filter.test)
    .filter(r => !q || `${r.name} ${r.number ?? ""} ${getRoleLabel(r.role)} ${r.loanFrom}`.toLowerCase().includes(q));

  $("rosterList").innerHTML = list.length ? getGroupedRoster(list).map(rosterGroupSection).join("") : "";
  $("rosterEmpty").classList.toggle("d-none", list.length > 0);
  $("rosterEmpty").textContent = roster.length ? TX.noMatches : TX.noHayJugadoresAsignados;
}

function rosterGroupSection(group) {
  return `
    <section class="tr-group">
      <div class="tr-group__title">${escapeHtml(group.label)} · ${group.items.length}</div>
      ${group.items.map(rosterRow).join("")}
    </section>`;
}

function statusChip(r) {
  const s = norm(r.status) || "convocado";
  const cls = s === "confirmado" ? "tr-chip--good" : s === "tentative" ? "tr-chip--warn" : "tr-chip--info";
  const label = prettyStatus(s);
  if (!canManage()) return `<span class="tr-chip ${cls}">${escapeHtml(label)}</span>`;
  return `<button type="button" class="tr-chip ${cls}" data-toggle-status="${escapeHtml(r.id)}" title="${escapeHtml(TX.cambiarEstado)}">
    ${escapeHtml(label)} <i class="bi bi-arrow-repeat"></i></button>`;
}

function feeBlock(r) {
  if (!canPay()) return "";
  const total = r.feeTotal;
  const paid = r.paidTotal;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 100;
  const done = total <= 0 || r.balance <= 0;

  const beca = isBeca(r)
    ? `<span class="tr-chip tr-chip--beca" ${r.feeNote ? `title="${escapeHtml(r.feeNote)}"` : ""}><i class="bi bi-mortarboard"></i> ${escapeHtml(becaLabel(r))}</span>`
    : "";

  const status = total <= 0
    ? `<span class="tr-chip tr-chip--muted">${escapeHtml(TX.sinFee)}</span>`
    : done
      ? `<span class="tr-chip tr-chip--good"><i class="bi bi-check2"></i> ${escapeHtml(TX.feePaid)}</span>`
      : `<span class="tr-chip tr-chip--warn">${escapeHtml(txf(TX.feeOwes, { balance: money(r.balance) }))}</span>`;

  const nPay = r.payments.length;
  const open = openPayments.has(r.id);

  // beca completa sin pagos: no hay barra ni montos que mostrar
  const progress = total <= 0 && !paid
    ? `<div class="tr-fee__text">${beca || status}</div>`
    : `
        <div class="tr-fee__bar ${done ? "is-paid" : ""}"><span style="width:${pct}%"></span></div>
        <div class="tr-fee__text mt-1">
          <span>${txf(TX.feeProgress, { paid: `<strong>${escapeHtml(money(paid))}</strong>`, total: escapeHtml(money(total)) })}</span>
          ${status}
          ${beca}
        </div>`;

  return `
    <div class="tr-fee">
      <div>${progress}</div>
      <div class="tr-fee__actions">
        ${total > 0 && !done ? `<button type="button" class="btn btn-sm btn-primary" data-pay="${escapeHtml(r.id)}"><i class="bi bi-cash-coin"></i> ${escapeHtml(TX.agregarAbono)}</button>` : ""}
        <button type="button" class="btn btn-sm btn-outline-secondary" data-fee="${escapeHtml(r.id)}"><i class="bi bi-mortarboard"></i> ${escapeHtml(TX.feeButton)}</button>
        ${nPay ? `<button type="button" class="btn btn-sm btn-outline-secondary ${open ? "active" : ""}" data-payments="${escapeHtml(r.id)}">${escapeHtml(txf(TX.paymentsButton, { n: nPay }))}</button>` : ""}
      </div>
    </div>
    ${open ? paymentsList(r) : ""}`;
}

function paymentsList(r) {
  if (!r.payments.length) return `<div class="tr-payments text-muted">${escapeHtml(TX.noPayments)}</div>`;
  const methods = { sinpe: TX.methodSinpe, cash: TX.methodCash, transfer: TX.methodTransfer };
  return `
    <div class="tr-payments">
      ${r.payments.map((p, i) => `
        <div class="tr-payments__row">
          <span>${escapeHtml(p.date || "—")}</span>
          <span class="text-muted">${escapeHtml(methods[p.method] || p.method || "")}</span>
          ${p.note ? `<span class="text-muted text-truncate">· ${escapeHtml(p.note)}</span>` : ""}
          <span class="tr-payments__amount">${escapeHtml(money(p.amount))}</span>
          <button type="button" class="btn btn-sm btn-link text-danger p-0" data-del-payment="${escapeHtml(r.id)}" data-index="${i}" title="${escapeHtml(TX.deletePayment)}"><i class="bi bi-trash"></i></button>
        </div>`).join("")}
    </div>`;
}

function rosterRow(r) {
  const role = getRoleLabel(r.role);
  const meta = [
    escapeHtml(role),
    r.isGuest ? `<span class="tr-chip tr-chip--info">${escapeHtml(r.loanFrom ? txf(TX.invitado, { loanFrom: r.loanFrom }) : TX.invitado2)}</span>` : "",
    r.missingSource ? `<span class="tr-chip tr-chip--muted">${escapeHtml(TX.fuenteNoEncontrada)}</span>` : "",
  ].filter(Boolean).join(" ");

  return `
    <div class="tr-row">
      <div class="tr-row__main">
        ${avatar(r)}
        <div class="min-w-0">
          <div class="tr-row__name">${escapeHtml(r.name || "—")}${r.number != null ? `<span class="tr-num">#${escapeHtml(r.number)}</span>` : ""}</div>
          <div class="tr-row__meta">${meta}</div>
        </div>
        <div class="tr-row__side">
          ${statusChip(r)}
          ${canManage() ? `
            <div class="dropdown">
              <button class="btn btn-sm btn-light" type="button" data-bs-toggle="dropdown" aria-label="…"><i class="bi bi-three-dots-vertical"></i></button>
              <ul class="dropdown-menu dropdown-menu-end">
                <li><button class="dropdown-item text-danger" type="button" data-remove="${escapeHtml(r.id)}"><i class="bi bi-x-lg me-1"></i>${escapeHtml(TX.quitar)}</button></li>
              </ul>
            </div>` : ""}
        </div>
      </div>
      ${feeBlock(r)}
    </div>`;
}

function avatar(p) {
  const initials = String(p.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const img = p.photoURL ? `<img src="${escapeHtml(p.photoURL)}" alt="" loading="lazy" />` : escapeHtml(initials || "?");
  return `<span class="tr-avatar ${p.isGuest ? "tr-avatar--guest" : ""}">${img}</span>`;
}

function getGroupedRoster(list) {
  const groups = new Map(PLAYER_ROLES.map(role => [normalizeRoleId(role.id), { label: role.label || role.id, items: [] }]));
  const others = { label: TX.otros, items: [] };
  list.forEach(item => (groups.get(normalizeRoleId(item.role)) || others).items.push(item));
  return [...groups.values(), others].filter(g => g.items.length);
}

/* ---------- picker ---------- */
function renderPlayers() {
  if (!canManage()) return;

  const q = ($("playersSearch")?.value || "").trim().toLowerCase();
  const inRoster = new Set(roster.map(r => (r.isGuest ? r.guestId : r.clubPlayerId)).filter(Boolean));

  const available = [...players, ...guests].filter(p => !inRoster.has(p.id));
  const list = q
    ? available.filter(p => `${p.name} ${p.nickname || ""} ${getRoleLabel(p.role)} ${p.loanFrom || ""}`.toLowerCase().includes(q))
    : available;

  $("playersSubtitle").textContent = txf(TX.disponibles, { n: available.length });
  $("playersList").innerHTML = list.map(p => `
    <div class="tr-pick">
      ${avatar(p)}
      <div class="min-w-0">
        <div class="tr-pick__name text-truncate">${escapeHtml(p.name)}${p.number != null ? ` <span class="text-muted">#${escapeHtml(p.number)}</span>` : ""}</div>
        <div class="tr-pick__sub">${escapeHtml(p.isGuest ? (p.loanFrom ? txf(TX.invitado, { loanFrom: p.loanFrom }) : TX.invitado2) : getRoleLabel(p.role))}</div>
      </div>
      <button class="btn btn-sm btn-outline-primary" data-add="${escapeHtml(p.id)}" title="${escapeHtml(TX.agregar)}"><i class="bi bi-plus-lg"></i></button>
    </div>`).join("");

  $("playersEmpty").classList.toggle("d-none", list.length > 0);
  $("playersEmpty").textContent = q ? TX.noHayCoincidencias : TX.noHayJugadoresDisponibles;
}

/* ==========================
   ACTIONS
========================== */
async function onRosterClick(ev) {
  const t = ev.target.closest("[data-toggle-status],[data-remove],[data-pay],[data-fee],[data-payments],[data-del-payment]");
  if (!t) return;

  if (t.hasAttribute("data-toggle-status")) return toggleStatus(t.getAttribute("data-toggle-status"));
  if (t.hasAttribute("data-remove")) return removeFromRoster(t.getAttribute("data-remove"));
  if (t.hasAttribute("data-fee")) return openFeeModal(t.getAttribute("data-fee"));
  if (t.hasAttribute("data-del-payment")) return deletePayment(t.getAttribute("data-del-payment"), Number(t.getAttribute("data-index")));

  if (t.hasAttribute("data-payments")) {
    const id = t.getAttribute("data-payments");
    if (openPayments.has(id)) openPayments.delete(id);
    else openPayments.add(id);
    return renderRoster();
  }

  if (t.hasAttribute("data-pay")) {
    if (!canPay()) return;
    const r = roster.find(x => x.id === t.getAttribute("data-pay"));
    if (!r) return;
    const modal = await ensurePayModal();
    modal.open({
      collectionPath: `${TOURNAMENTS_COL}/${tournamentId}/roster`,
      docId: r.id,
      title: TX.agregarAbono,
      subtitle: r.name || "—",
      suggestedAmount: r.balance > 0 ? Math.ceil(r.balance) : "",
      onSaved: refreshRoster,
    });
  }
}

async function refreshRoster() {
  await loadRoster();
  render();
}

async function withLoader(fn, errorMsg) {
  showLoader();
  try {
    await fn();
  } catch (e) {
    console.error(e);
    alert(errorMsg);
  } finally {
    hideLoader();
  }
}

function addToRoster(itemId) {
  if (!canManage()) return;
  const item = players.find(x => x.id === itemId) || guests.find(x => x.id === itemId);
  if (!item) return;

  return withLoader(async () => {
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", item.id), {
      clubPlayerId: item.isGuest ? null : item.id,
      userId: item.isGuest ? null : (item.userId || null),
      playerId: item.isGuest ? null : item.id, // compatibilidad
      isGuest: !!item.isGuest,
      guestId: item.isGuest ? item.id : null,
      loanFrom: item.isGuest ? (item.loanFrom || "") : "",
      status: "convocado",
      feeType: FEE.STANDARD,
      feeTotal: basePlayerFee(),
      payments: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    await refreshRoster();
  }, TX.errorAgregandoJugadorAl);
}

function removeFromRoster(docId) {
  if (!canManage()) return;
  const r = roster.find(x => x.id === docId);
  if (!confirm(txf(TX.quitarDelRoster, { name: r?.name || "" }))) return;

  return withLoader(async () => {
    await deleteDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", docId));
    await refreshRoster();
  }, TX.errorQuitandoJugador);
}

function toggleStatus(docId) {
  if (!canManage()) return;
  const r = roster.find(x => x.id === docId);
  if (!r) return;
  const i = STATUS_ORDER.indexOf(norm(r.status));
  const next = STATUS_ORDER[(i + 1) % STATUS_ORDER.length];

  return withLoader(async () => {
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", docId), { status: next, updatedAt: serverTimestamp() }, { merge: true });
    r.status = next;
    renderSummary();
    renderRoster();
  }, TX.errorActualizandoEstado);
}

function toggleTeamFeePaid() {
  if (!canPay() || !tournament) return;
  const next = !tournament.teamFeePaid;
  return withLoader(async () => {
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId), { teamFeePaid: next, updatedAt: serverTimestamp() }, { merge: true });
    tournament.teamFeePaid = next;
    renderTeamFee();
  }, TX.errorActualizandoTeamFee);
}

function deletePayment(docId, index) {
  if (!canPay()) return;
  const r = roster.find(x => x.id === docId);
  const p = r?.payments?.[index];
  if (!p || !confirm(txf(TX.deletePaymentConfirm, { amount: money(p.amount) }))) return;

  return withLoader(async () => {
    const payments = r.payments.filter((_, i) => i !== index);
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", docId), { payments, updatedAt: serverTimestamp() }, { merge: true });
    await refreshRoster();
  }, TX.errorBorrandoPago);
}

/* ---------- beca / monto ---------- */
let feeEditingId = null;

function openFeeModal(docId) {
  if (!canPay()) return;
  const r = roster.find(x => x.id === docId);
  if (!r) return;
  feeEditingId = docId;

  const type = r.feeType && Object.values(FEE).includes(r.feeType)
    ? r.feeType
    : (Number(r.feeTotal) === basePlayerFee() || r.feeTotal == null ? FEE.STANDARD : FEE.CUSTOM);

  $("feeSubtitle").textContent = r.name || "—";
  $("feeStandardHint").textContent = txf(TX.feeStandardHint, { amount: money(basePlayerFee()) });
  $("feeCurrencySymbol").textContent = currencySymbol();
  document.querySelectorAll('#feeForm [name="feeType"]').forEach(el => { el.checked = el.value === type; });
  $("feePercentInput").value = r.feeType === FEE.PERCENT ? clampPercent(r.feePercent) : "";
  $("feeCustomInput").value = type === FEE.CUSTOM ? (r.feeType === FEE.CUSTOM ? toNumberOrZero(r.feeCustom) : toNumberOrZero(r.feeTotal)) : "";
  $("feeNoteInput").value = r.feeNote || "";
  $("feeError").classList.add("d-none");
  updateFeePreview();
  feeModal.show();
}

function readFeeForm() {
  const type = document.querySelector('#feeForm [name="feeType"]:checked')?.value || FEE.STANDARD;
  const draft = {
    feeType: type,
    feePercent: type === FEE.PERCENT ? Number($("feePercentInput").value) : null,
    feeCustom: type === FEE.CUSTOM ? Number($("feeCustomInput").value) : null,
    feeNote: $("feeNoteInput").value.trim(),
  };
  let error = "";
  if (type === FEE.PERCENT && !(draft.feePercent >= 1 && draft.feePercent <= 99)) error = TX.feeErrorPercent;
  if (type === FEE.CUSTOM && !(Number.isFinite(draft.feeCustom) && draft.feeCustom >= 0) ) error = TX.feeErrorCustom;
  return { draft, error, amount: error ? null : computeFee(draft) };
}

function updateFeePreview(ev) {
  // escribir en un campo selecciona su opción
  if (ev?.target?.id === "feePercentInput") document.querySelector('#feeForm [value="percent"]').checked = true;
  if (ev?.target?.id === "feeCustomInput") document.querySelector('#feeForm [value="custom"]').checked = true;

  const { amount } = readFeeForm();
  const saving = amount == null ? 0 : basePlayerFee() - amount;
  $("feePreview").innerHTML = amount == null
    ? "—"
    : txf(saving > 0 ? TX.feePreviewSaving : TX.feePreview, { amount: escapeHtml(money(amount)), saving: escapeHtml(money(saving)) });
}

async function submitFee(ev) {
  ev.preventDefault();
  const { draft, error, amount } = readFeeForm();
  if (error) {
    $("feeError").textContent = error;
    $("feeError").classList.remove("d-none");
    return;
  }

  await withLoader(async () => {
    await setDoc(doc(db, TOURNAMENTS_COL, tournamentId, "roster", feeEditingId), {
      feeType: draft.feeType,
      feePercent: draft.feeType === FEE.PERCENT ? clampPercent(draft.feePercent) : null,
      feeCustom: draft.feeType === FEE.CUSTOM ? Math.round(draft.feeCustom) : null,
      feeNote: draft.feeNote || null,
      feeTotal: amount, // compatibilidad con otras pantallas
      updatedAt: serverTimestamp()
    }, { merge: true });
    feeModal.hide();
    await refreshRoster();
  }, TX.errorGuardandoFee);
}

/* ---------- invitado ---------- */
function fillGuestRoles() {
  $("guestRole").innerHTML = PLAYER_ROLES
    .map(role => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label || role.id)}</option>`)
    .join("");
}

function openGuestModal() {
  if (!permissions?.canCreateGuests) return;
  $("guestForm").reset();
  $("guestRole").value = getDefaultRoleId();
  $("guestAddNow").checked = true;
  $("guestError").classList.add("d-none");
  guestModal.show();
  setTimeout(() => $("guestName").focus(), 300);
}

async function submitGuest(ev) {
  ev.preventDefault();
  const name = $("guestName").value.trim();
  if (!name) {
    $("guestError").textContent = TX.guestErrorName;
    $("guestError").classList.remove("d-none");
    return;
  }
  const numberRaw = $("guestNumber").value.trim();
  const number = numberRaw === "" ? null : Number(numberRaw);

  await withLoader(async () => {
    const ref = doc(collection(db, GUESTS_COL));
    await setDoc(ref, {
      name,
      gender: $("guestGender").value || null,
      role: $("guestRole").value || getDefaultRoleId(),
      loanFrom: $("guestLoanFrom").value.trim(),
      number: Number.isFinite(number) ? number : null,
      active: true,
      createdAt: serverTimestamp()
    });
    guestModal.hide();
    await loadGuests();
    if ($("guestAddNow").checked) await addToRoster(ref.id);
    else renderPlayers();
  }, TX.errorCreandoInvitado);
}

/* ==========================
   HELPERS
========================== */
function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function prettyStatus(s) {
  if (s === "confirmado") return TX.confirmado;
  if (s === "tentative") return TX.porConfirmar;
  return TX.convocado;
}

function formatDateRange(start, end) {
  const fmt = (v) => {
    const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : (v?.toDate?.() || null);
    return d && !isNaN(d) ? d : null;
  };
  const a = fmt(start);
  const b = fmt(end);
  if (!a) return "—";
  const f = (d, opts) => new Intl.DateTimeFormat("es-CR", opts).format(d).replace(".", "");
  if (!b || b.getTime() === a.getTime()) return f(a, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${f(a, { month: "short", year: "numeric" })}`;
  }
  return `${f(a, { day: "numeric", month: "short" })} – ${f(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

function showError(msg) {
  $("errorBox").textContent = msg;
  $("errorBox").classList.remove("d-none");
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
  return ["m", "male", "masculino", "hombre", "man"].includes(norm(g));
}

function isFemale(g) {
  return ["f", "female", "femenino", "mujer", "woman"].includes(norm(g));
}

function normalizeRoleId(role) {
  return norm(role);
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
  PLAYER_ROLES.forEach(role => { counts[normalizeRoleId(role.id)] = 0; });
  list.forEach(item => {
    const rid = normalizeRoleId(item.role);
    if (counts[rid] !== undefined) counts[rid]++;
  });
  return counts;
}

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
