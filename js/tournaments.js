// js/tournaments.js
import { db } from "./auth/firebase.js";
import { watchAuth, logout } from "./auth/auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { TOURNAMENT_STRINGS } from "./strings.js";

import { createTournamentEditor } from "./features/tournament_editor.js";
import { loadPartialOnce } from "./ui/loadPartial.js";

/*************************************************
 * INIT
 *************************************************/

// Header
const { cfg, redirected } = await guardPage("tournaments");
if (!redirected) {
  await loadHeader("tournaments", cfg);
}

document.getElementById("logoutBtn")?.addEventListener("click", logout);

const S = TOURNAMENT_STRINGS;
const TOURNAMENTS_COL = APP_CONFIG?.club?.tournamentsCollection || "tournaments";

/* ==========================
   DOM
========================== */
const tableEl = document.getElementById("tournamentsTable");
const cardsEl = document.getElementById("tournamentsCards");
const searchEl = document.getElementById("tournamentSearch");
const addBtn = document.getElementById("addTournamentBtn");

const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) appVersionEl.textContent = `v${APP_CONFIG.version}`;

/* ==========================
   STRINGS -> UI
========================== */
applyStrings();

/* ==========================
   EDITOR (lazy modal)
========================== */
let editor = null;

async function ensureEditor() {
  // monta el modal desde partial (solo 1 vez)
  await loadPartialOnce("./partials/tournament_editor.html", "modalMount");

  // crea el editor (solo 1 vez)
  if (!editor) editor = createTournamentEditor();
  return editor;
}

/* ==========================
   DATA
========================== */
let allTournaments = [];

/* ==========================
   INIT
========================== */
watchAuth(async () => {
  showLoader();
  try {
    await loadTournaments();
    render();
  } catch (e) {
    console.error(e);
  } finally {
    hideLoader();
  }
});

// Re-render when tournament is saved/deleted from the modal
window.addEventListener("tournament:changed", async () => {
  showLoader();
  try {
    await loadTournaments();
    render();
  } catch (e) {
    console.error(e);
  } finally {
    hideLoader();
  }
});

/* ==========================
   LOAD
========================== */
async function loadTournaments() {
  const snap = await getDocs(collection(db, TOURNAMENTS_COL));
  allTournaments = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.dateStart || "").localeCompare(b.dateStart || ""));
}

/* ==========================
   RENDER
========================== */
function render() {
  const q = (searchEl?.value || "").trim().toLowerCase();

  const list = q
    ? allTournaments.filter(t =>
        `${t.name || ""} ${t.location || ""}`.toLowerCase().includes(q)
      )
    : allTournaments;

  renderTable(list);
  renderCards(list);
}

function rosterUrl(id) {
  return `pages/admin/tournament_roster.html?id=${encodeURIComponent(id)}`;
}

function renderTable(list) {
  if (!tableEl) return;

  tableEl.innerHTML = list.length
    ? list
        .map(t => {
          const fees = formatFees(t.teamFee, t.playerFee);
          const official = safeUrl(t.officialUrl);
          return `
            <tr>
              <td class="fw-bold">${escapeHtml(t.name)}</td>
              <td>${formatDateRange(t.dateStart, t.dateEnd)}</td>
              <td>${badgeLabel(S.fields.type.options?.[t.type] ?? t.type)}</td>
              <td>${badgeLabel(S.fields.age.options?.[t.age] ?? t.age)}</td>
              <td>${badgeLabel(S.fields.venue.options?.[t.venue] ?? t.venue)}</td>
              <td>${fees}</td>
              <td class="text-end">
                <!-- Editar torneo -->
                <button class="btn btn-sm btn-outline-primary" data-edit="${t.id}" title="Editar">
                  <i class="bi bi-pencil"></i>
                </button>

                <!-- Roster / Jugadores -->
                <a class="btn btn-sm btn-outline-success ms-2"
                   href="${rosterUrl(t.id)}"
                   title="Roster">
                   <i class="bi bi-people"></i>
                </a>
                ${
                  official
                    ? `<a class="btn btn-sm btn-outline-dark ms-2"
                          href="${escapeHtml(official)}"
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Sitio oficial">
                          <i class="bi bi-box-arrow-up-right"></i>
                      </a>`
                    : ``
                }
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="7" class="text-muted p-3">${escapeHtml(S.page.empty)}</td></tr>`;

  tableEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-edit");
      const ed = await ensureEditor();
      ed.openEditById(id);
    });
  });
}

function renderCards(list) {
  if (!cardsEl) return;

  cardsEl.innerHTML = list.length
    ? list
        .map(t => {
          const fees = formatFees(t.teamFee, t.playerFee);
          const typeLbl = S.fields.type.options?.[t.type] ?? t.type ?? "—";
          const ageLbl = S.fields.age.options?.[t.age] ?? t.age ?? "—";
          const venueLbl = S.fields.venue.options?.[t.venue] ?? t.venue ?? "—";
          const official = safeUrl(t.officialUrl);

          return `
            <div class="mobile-card mb-3">
              <div class="mobile-card__title">${escapeHtml(t.name)}</div>
              <div class="mobile-card__sub">
                ${formatDateRange(t.dateStart, t.dateEnd)} · ${escapeHtml(t.location || "—")}
              </div>

              <div class="d-flex flex-wrap gap-2 mt-2">
                <span class="pill">${escapeHtml(typeLbl)}</span>
                <span class="pill">${escapeHtml(ageLbl)}</span>
                <span class="pill">${escapeHtml(venueLbl)}</span>
              </div>

              <div class="d-flex justify-content-between align-items-center mt-3">
                <div class="text-muted small">${fees}</div>

                <div class="d-flex gap-2">
                  <!-- Roster / Jugadores -->
                  <a class="btn btn-sm btn-outline-success"
                     href="${rosterUrl(t.id)}"
                     title="Roster">
                    <i class="bi bi-people"></i>
                  </a>

                  ${
                    official
                      ? `<a class="btn btn-sm btn-outline-dark"
                            href="${escapeHtml(official)}"
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Sitio oficial">
                            <i class="bi bi-box-arrow-up-right"></i>
                        </a>`
                      : ``
                  }

                  <!-- Editar torneo -->
                  <button class="btn btn-sm btn-outline-primary" data-edit="${t.id}" title="Editar">
                    <i class="bi bi-pencil"></i>
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="text-muted p-2">${escapeHtml(S.page.empty)}</div>`;

  cardsEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-edit");
      const ed = await ensureEditor();
      ed.openEditById(id);
    });
  });
}

/* ==========================
   EVENTS
========================== */
addBtn?.addEventListener("click", async () => {
  const ed = await ensureEditor();
  ed.openNew();
});

searchEl?.addEventListener("input", render);

/* ==========================
   STRINGS APPLY
========================== */
function applyStrings() {
  document.getElementById("pageTitle").textContent = S.page.title;
  document.getElementById("pageHeading").textContent = S.page.title;
  document.getElementById("pageSubtitle").textContent = S.page.subtitle;

  document.getElementById("searchLabel").textContent = S.search?.label || "Buscar";
  document.getElementById("tournamentSearch").placeholder = S.search?.placeholder || "";

  document.getElementById("addTournamentBtn").textContent = `+ ${S.actions.add}`;

  document.getElementById("thName").textContent = S.list.headers.name;
  document.getElementById("thDate").textContent = S.list.headers.date;
  document.getElementById("thType").textContent = S.list.headers.type;
  document.getElementById("thAge").textContent = S.list.headers.age;
  document.getElementById("thVenue").textContent = S.list.headers.venue;
  document.getElementById("thFees").textContent = S.list.headers.fees;
  document.getElementById("thActions").textContent = S.list.headers.actions;
}

/* ==========================
   HELPERS
========================== */
function formatDateRange(start, end) {
  if (!start) return "—";
  if (!end) return start;
  return `${start} → ${end}`;
}

function formatFees(teamFee, playerFee) {
  const cur = S.fees?.currency || "₡";
  const tfLabel = S.fees?.team || "Team";
  const pfLabel = S.fees?.player || "Player";

  const tf =
    teamFee != null ? `${tfLabel} ${cur}${Number(teamFee).toLocaleString("es-CR")}` : null;
  const pf =
    playerFee != null ? `${pfLabel} ${cur}${Number(playerFee).toLocaleString("es-CR")}` : null;

  if (tf && pf) return `${tf} · ${pf}`;
  return tf || pf || "—";
}

function badgeLabel(txt) {
  return `<span class="pill">${escapeHtml(txt || "—")}</span>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  // si el usuario pega "www..." sin protocolo, se lo agregamos
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}
