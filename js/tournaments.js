// js/tournaments.js
import { db } from "./auth/firebase.js";
import { watchAuth, logout } from "./auth/auth.js";
import { getCurrentPermissions, applyVisibilityByPermission } from "./auth/permissions.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { TOURNAMENT_STRINGS } from "./strings.js";

import { createTournamentEditor } from "./features/tournament_editor.js";
import { loadPartialOnce } from "./ui/loadPartial.js";
import { TX } from "/js/strings/screens/tournaments_list.js";

/*************************************************
 * INIT
 *************************************************/
const { cfg, redirected } = await guardPage("tournaments");
if (!redirected) {
  await loadHeader("tournaments", cfg);
}

document.getElementById("logoutBtn")?.addEventListener("click", logout);

const S = TOURNAMENT_STRINGS;
const COL = APP_CONFIG.collections;
const TOURNAMENTS_COL = COL.tournaments;

/* ==========================
   DOM
========================== */
const cardsEl = document.getElementById("tournamentsCards");
const desktopEl = document.getElementById("tournamentsDesktop");
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
  await loadPartialOnce("./partials/tournament_editor.html", "modalMount");
  if (!editor) editor = createTournamentEditor();
  return editor;
}

/* ==========================
   DATA
========================== */
let permissions = null;
let allTournaments = [];

// En curso / Próximos / Finalizados como tabs (estilo torneos de ClubStudioHQ).
const GROUPS = [
  { key: "active", label: () => TX.enCurso },
  { key: "upcoming", label: () => TX.proximos },
  { key: "past", label: () => TX.finalizados },
];
const filtersEl = document.getElementById("tournamentFilters");
let currentGroup = null; // se elige con los datos: el primero que tenga torneos

/* ==========================
   INIT
========================== */
watchAuth(async () => {
  showLoader();
  try {
    permissions = await getCurrentPermissions();
    applyVisibilityByPermission(permissions, "canEditTournament", addBtn);

    await loadTournaments();
    render();
  } catch (e) {
    console.error(e);
  } finally {
    hideLoader();
  }
});

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
    .sort((a, b) => normalizeDateForSort(a.dateStart).localeCompare(normalizeDateForSort(b.dateStart)));
}

/* ==========================
   RENDER
========================== */
function render() {
  const q = (searchEl?.value || "").trim().toLowerCase();

  const filtered = q
    ? allTournaments.filter(t =>
        `${t.name || ""} ${t.location || ""} ${t.type || ""} ${t.age || ""} ${t.venue || ""}`
          .toLowerCase()
          .includes(q)
      )
    : allTournaments;

  const grouped = groupTournaments(filtered);
  if (!currentGroup) currentGroup = GROUPS.find((g) => grouped[g.key].length)?.key || "upcoming";

  renderFilters(grouped);
  renderDesktop(grouped[currentGroup]);
  renderCards(grouped[currentGroup]);
}

function renderFilters(grouped) {
  if (!filtersEl) return;
  filtersEl.innerHTML = GROUPS.map((g) => `
    <button type="button" class="ui-seg__item ${g.key === currentGroup ? "is-active" : ""}" data-group="${g.key}">
      ${escapeHtml(g.label())} <span class="ui-chip__n">${grouped[g.key].length}</span>
    </button>`).join("");
}

filtersEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-group]");
  if (!btn) return;
  currentGroup = btn.dataset.group;
  render();
});

function renderDesktop(list) {
  if (!desktopEl) return;

  desktopEl.innerHTML = list.length
    ? `
      <div class="card">
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>${escapeHtml(S.list.headers.name)}</th>
                  <th>${escapeHtml(S.list.headers.date)}</th>
                  <th>${escapeHtml(S.list.headers.type)}</th>
                  <th>${escapeHtml(S.list.headers.age)}</th>
                  <th>${escapeHtml(S.list.headers.venue)}</th>
                  <th>${escapeHtml(S.list.headers.fees)}</th>
                  <th class="text-end">${escapeHtml(S.list.headers.actions)}</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(renderDesktopRow).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>`
    : `<div class="ui-empty">${TX.noHayTorneosEn}</div>`;

  bindEditButtons(desktopEl);
}

function renderDesktopRow(t) {
  const fees = formatFees(t.teamFee, t.playerFee, t.feeCurrency);
  const official = safeUrl(t.officialUrl);

  return `
    <tr>
      <td class="fw-bold">${escapeHtml(t.name || "—")}</td>
      <td>${escapeHtml(formatDateRange(t.dateStart, t.dateEnd))}</td>
      <td>${badgeLabel(S.fields.type.options?.[t.type] ?? t.type)}</td>
      <td>${badgeLabel(S.fields.age.options?.[t.age] ?? t.age)}</td>
      <td>${badgeLabel(S.fields.venue.options?.[t.venue] ?? t.venue)}</td>
      <td>${escapeHtml(fees)}</td>
      <td class="text-end">
        ${permissions?.canEditTournament ? `
          <button class="btn btn-sm btn-outline-primary" data-edit="${t.id}" title="${TX.editar}">
            <i class="bi bi-pencil"></i>
          </button>
        ` : ""}

        <a class="btn btn-sm btn-outline-success ${permissions?.canEditTournament ? "ms-2" : ""}"
          href="${rosterUrl(t.id)}"
          title="${TX.roster}">
          <i class="bi bi-people"></i>
        </a>

        ${
          official
            ? `<a class="btn btn-sm btn-outline-dark ms-2"
                  href="${escapeHtml(official)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="${TX.sitioOficial}">
                  <i class="bi bi-box-arrow-up-right"></i>
              </a>`
            : ``
        }
      </td>
    </tr>
  `;
}

function renderCards(list) {
  if (!cardsEl) return;

  cardsEl.innerHTML = list.length
    ? list.map(renderCard).join("")
    : `<div class="ui-empty">${TX.noHayTorneosEn}</div>`;

  bindEditButtons(cardsEl);
}

function renderCard(t) {
  const fees = formatFees(t.teamFee, t.playerFee);
  const typeLbl = S.fields.type.options?.[t.type] ?? t.type ?? "—";
  const ageLbl = S.fields.age.options?.[t.age] ?? t.age ?? "—";
  const venueLbl = S.fields.venue.options?.[t.venue] ?? t.venue ?? "—";
  const official = safeUrl(t.officialUrl);

  return `
    <div class="mobile-card mb-3">
      <div class="mobile-card__title">${escapeHtml(t.name || "—")}</div>
      <div class="mobile-card__sub">
        ${escapeHtml(formatDateRange(t.dateStart, t.dateEnd))} · ${escapeHtml(t.location || "—")}
      </div>

      <div class="d-flex flex-wrap gap-2 mt-2">
        <span class="pill">${escapeHtml(typeLbl)}</span>
        <span class="pill">${escapeHtml(ageLbl)}</span>
        <span class="pill">${escapeHtml(venueLbl)}</span>
      </div>

      <div class="d-flex justify-content-between align-items-center mt-3 gap-2">
        <div class="text-muted small">${escapeHtml(fees)}</div>

        <div class="d-flex gap-2 flex-shrink-0">
          <a class="btn btn-sm btn-outline-success"
            href="${rosterUrl(t.id)}"
            title="${TX.roster}">
            <i class="bi bi-people"></i>
          </a>

          ${
            official
              ? `<a class="btn btn-sm btn-outline-dark"
                    href="${escapeHtml(official)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="${TX.sitioOficial}">
                    <i class="bi bi-box-arrow-up-right"></i>
                </a>`
              : ``
          }

          ${permissions?.canEditTournament ? `
            <button class="btn btn-sm btn-outline-primary" data-edit="${t.id}" title="${TX.editar}">
              <i class="bi bi-pencil"></i>
            </button>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

function bindEditButtons(root) {
  if (!permissions?.canEditTournament || !root) return;

  root.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-edit");
      const ed = await ensureEditor();
      ed.openEditById(id);
    });
  });
}

/* ==========================
   GROUPING
========================== */
function groupTournaments(list) {
  const today = getTodayYMD();

  const active = [];
  const upcoming = [];
  const past = [];

  for (const t of list) {
    const start = normalizeDateForSort(t.dateStart);
    const end = normalizeDateForSort(t.dateEnd || t.dateStart);

    if (start && end && start <= today && end >= today) {
      active.push(t);
    } else if (start && start > today) {
      upcoming.push(t);
    } else {
      past.push(t);
    }
  }

  active.sort((a, b) => normalizeDateForSort(a.dateStart).localeCompare(normalizeDateForSort(b.dateStart)));
  upcoming.sort((a, b) => normalizeDateForSort(a.dateStart).localeCompare(normalizeDateForSort(b.dateStart)));
  past.sort((a, b) => normalizeDateForSort(b.dateEnd || b.dateStart).localeCompare(normalizeDateForSort(a.dateEnd || a.dateStart)));

  return { active, upcoming, past };
}

/* ==========================
   EVENTS
========================== */
addBtn?.addEventListener("click", async () => {
  if (!permissions?.canEditTournament) return;
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

  document.getElementById("searchLabel").textContent = S.search?.label || TX.buscar;
  document.getElementById("tournamentSearch").placeholder = S.search?.placeholder || "";

  const btnText = document.querySelector("#addTournamentBtn span");
  if (btnText) btnText.textContent = S.actions.add;
}

/* ==========================
   HELPERS
========================== */
function rosterUrl(id) {
  return `pages/admin/tournament_roster.html?id=${encodeURIComponent(id)}`;
}

function formatDateRange(start, end) {
  if (!start) return "—";

  const startTxt = formatDate(start);
  const endTxt = end ? formatDate(end) : null;

  if (!endTxt || start === end) return startTxt;
  return `${startTxt} → ${endTxt}`;
}

function formatDate(ymd) {
  const date = parseYMD(ymd);
  if (!date) return ymd || "—";

  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatFees(teamFee, playerFee, feeCurrency = "CRC") {
  const cur = feeCurrency === "USD" ? "$" : "₡";
  const locale = feeCurrency === "USD" ? "en-US" : "es-CR";

  const tfLabel = S.fees?.team || TX.team;
  const pfLabel = S.fees?.player || TX.player;

  const tf =
    teamFee != null ? `${tfLabel} ${cur}${Number(teamFee).toLocaleString(locale)}` : null;
  const pf =
    playerFee != null ? `${pfLabel} ${cur}${Number(playerFee).toLocaleString(locale)}` : null;

  if (tf && pf) return `${tf} · ${pf}`;
  return tf || pf || "—";
}

function badgeLabel(txt) {
  return `<span class="pill">${escapeHtml(txt || "—")}</span>`;
}

function parseYMD(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateForSort(value) {
  const d = parseYMD(value);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getTodayYMD() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}