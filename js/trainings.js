// /js/trainings.js
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./auth/firebase.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader, updateLoaderMessage } from "./ui/loader.js";

/* =========================
   CONFIG / COLS
========================= */
const clubId = "volcanes"; // TODO: sacarlo de CLUB_DATA
const COL_TRAININGS = "trainings";
const COL_PLAYERS = "club_players";
const COL_DRILLS = "drills";
const COL_PLAYBOOK_TRAININGS = "playbook_trainings";

/* =========================
   STATE
========================= */
let players = [];
let attendees = [];
let trainings = [];
let currentTrainingId = null;

// playbook data
let pbDrills = [];
let pbTrainings = [];
let selectedDrillIds = [];
let selectedPlaybookTrainingIds = [];

/* =========================
   DOM
========================= */
const $ = {
  table: document.getElementById("trainingsTable"),
  cards: document.getElementById("trainingsCards"),

  modal: document.getElementById("trainingModal"),
  modalTitle: document.querySelector("#trainingModal .modal-title"),

  trainingDate: document.getElementById("trainingDate"),
  summary: document.getElementById("trainingSummary"),
  notes: document.getElementById("trainingNotes"),

  quickTextSection: document.getElementById("quickTextSection"),
  attendanceText: document.getElementById("attendanceText"),
  processBtn: document.getElementById("processBtn"),

  playersList: document.getElementById("playersList"),
  saveBtn: document.getElementById("saveTrainingBtn"),

    // KPIs
  kpiTotal: document.getElementById("kpiTotalTrainings"),
  kpiAvg: document.getElementById("kpiAvgAttendance"),
  kpiLast: document.getElementById("kpiLastTraining"),

  // filtros
  search: document.getElementById("trainingSearch"),
  monthFilter: document.getElementById("monthFilter"),
  sortFilter: document.getElementById("sortFilter"),
  dateFrom: document.getElementById("dateFrom"),
  dateTo: document.getElementById("dateTo"),

  clearFiltersBtn: document.getElementById("clearFiltersBtn"),

};

let modalInstance = null;

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  showLoader("Cargando entrenos…");

  try {
    const { cfg, redirected } = await guardPage("trainings");
    if (redirected) return;

    updateLoaderMessage("Cargando header…");
    await loadHeader("trainings", cfg);

    ensurePlaybookUI();
    bindCollapseCarets();

    updateLoaderMessage("Cargando jugadores…");
    await loadPlayers();

    updateLoaderMessage("Cargando playbook…");
    await loadPlaybookData();

    updateLoaderMessage("Cargando lista…");
    await loadTrainings();

    bindEvents();
  } catch (e) {
    console.error("[trainings] init error:", e);
    // opcional: mostrar un mensaje en la UI
  } finally {
    hideLoader(); // 🔥 quita html.preload y destapa el body
  }
});


/* =========================
   PLAYBOOK UI (inject into modal)
========================= */
function ensurePlaybookUI() {
  const summaryEl = document.getElementById("trainingSummary");
  if (!summaryEl) return;

  const summaryBlock = summaryEl.closest(".mb-3");
  if (!summaryBlock) return;

  if (document.getElementById("pbTrainingsList")) return;

  const wrap = document.createElement("div");
  wrap.className = "mb-3";

  wrap.innerHTML = `
    <div class="d-flex align-items-center justify-content-between">
      <button
        class="btn btn-link p-0 text-decoration-none d-flex align-items-center gap-2"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#playbookCollapse"
        aria-expanded="true"
        aria-controls="playbookCollapse"
      >
        <span class="fw-semibold">Playbook</span>
        <span class="collapse-caret" data-caret-for="playbookCollapse">▾</span>
      </button>
    </div>

    <div id="playbookCollapse" class="collapse show mt-2">
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="d-flex justify-content-between align-items-center gap-2">
            <div class="small text-muted">Entrenamientos completos</div>
            <input id="pbTrainingSearch" class="form-control form-control-sm" style="max-width:220px" placeholder="Buscar..." />
          </div>
          <div id="pbTrainingsList" class="list-group mt-2"></div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="d-flex justify-content-between align-items-center gap-2">
            <div class="small text-muted">Drills</div>
            <input id="pbDrillSearch" class="form-control form-control-sm" style="max-width:220px" placeholder="Buscar..." />
          </div>
          <div id="pbDrillsList" class="list-group mt-2"></div>
        </div>
      </div>

      <div class="form-text mt-2">
        Seleccioná drills/entrenos del playbook, o describí todo en el resumen.
      </div>
    </div>
  `;

  summaryBlock.parentNode.insertBefore(wrap, summaryBlock);

  // binds search
  document.getElementById("pbTrainingSearch")?.addEventListener("input", renderPlaybookSelectors);
  document.getElementById("pbDrillSearch")?.addEventListener("input", renderPlaybookSelectors);

  // bind carets (para que rote)
  bindCollapseCarets();
}

/* =========================
   LOAD PLAYERS
========================= */
async function loadPlayers() {
  const list = $.playersList;
  if (!list) return;

  list.innerHTML = "";

  const snapshot = await getDocs(collection(db, COL_PLAYERS));

  players = snapshot.docs
    .map(d => ({
      id: d.id,
      firstName: d.data().firstName,
      lastName: d.data().lastName,
      number: d.data().number,
      active: d.data().active !== false,
    }))
    .filter(p => p.active)
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  for (const p of players) {
    const label = document.createElement("label");
    label.className = "attendance-item";
    label.innerHTML = `
      <input type="checkbox" class="attendance-check" data-id="${escapeHtml(p.id)}" />
      <span class="attendance-name">${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</span>
      <span class="attendance-number">${escapeHtml(p.number ?? "")}</span>
    `;
    list.appendChild(label);
  }

  document.querySelectorAll(".attendance-check").forEach(cb => {
    cb.addEventListener("change", onAttendanceChange);
  });
}

/* =========================
   LOAD PLAYBOOK (drills + playbook trainings)
========================= */
async function loadPlaybookData() {
  // drills activos
  const qDrills = query(
    collection(db, COL_DRILLS),
    where("clubId", "==", clubId),
    where("isActive", "==", true)
  );
  const s1 = await getDocs(qDrills);
  pbDrills = s1.docs.map(d => ({ id: d.id, ...d.data() }));
  pbDrills.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // playbook trainings (con clubId)
  const qPB = query(
    collection(db, COL_PLAYBOOK_TRAININGS),
    where("clubId", "==", clubId)
  );
  const s2 = await getDocs(qPB);
  pbTrainings = s2.docs.map(d => ({ id: d.id, ...d.data() }));

  // ✅ fallback migración: si no hay nada, traé todos y quedate con los que
  // tienen clubId==clubId o no tienen clubId (docs viejos)
  if (!pbTrainings.length) {
    console.warn("[trainings] 0 playbook_trainings con clubId, intentando fallback (migración).");
    const all = await getDocs(collection(db, COL_PLAYBOOK_TRAININGS));
    pbTrainings = all.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(x => !x.clubId || x.clubId === clubId);
  }

  pbTrainings.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/* =========================
   LOAD TRAININGS (list)
========================= */
async function loadTrainings() {
  if (!$.table || !$.cards) return;

  $.table.innerHTML = "";
  $.cards.innerHTML = "";
  trainings = [];

  // 1) intento con clubId (lo actual)
  const q1 = query(
    collection(db, COL_TRAININGS),
    where("clubId", "==", clubId),
    orderBy("date", "desc")
  );

  let snapshot = await getDocs(q1);

  // 2) fallback migración: si no hay nada, trae todo y filtra local
  if (snapshot.empty) {
    console.warn("[trainings] 0 trainings con clubId; fallback (migración).");

    const all = await getDocs(collection(db, COL_TRAININGS));
    trainings = all.docs
      .map(d => ({ id: d.id, ...d.data() }))
      // legacy: sin clubId o clubId correcto
      .filter(t => !t.clubId || t.clubId === clubId)
      // orden desc por date
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } else {
    snapshot.forEach(d => trainings.push({ id: d.id, ...d.data() }));
  }

  // KPIs + filtros + render
  calcKPIs(trainings);
  fillMonthOptions(trainings);
  refreshListUI();
  bindEditEvents();
  updateClearBtnState();
}

function bindEditEvents() {
  document.querySelectorAll(".training-row, .training-card").forEach(el => {
    el.onclick = () => {
      const id = el.dataset.id;
      const training = trainings.find(t => t.id === id);
      if (!training) return;
      openEditTraining(training);
    };
  });
}

/* =========================
   MODAL: open/edit/reset
========================= */
function openNewTraining() {
  currentTrainingId = null;

  if ($.modalTitle) $.modalTitle.innerText = "Nuevo entrenamiento";
  $.quickTextSection && ($.quickTextSection.style.display = "block");

  // reset state
  attendees = [];
  selectedDrillIds = [];
  selectedPlaybookTrainingIds = [];

  // clear fields
  if ($.trainingDate) $.trainingDate.value = "";
  if ($.summary) $.summary.value = "";
  if ($.notes) $.notes.value = "";
  if ($.attendanceText) $.attendanceText.value = "";

  // uncheck all
  document.querySelectorAll(".attendance-check").forEach(cb => (cb.checked = false));

  // clear searches
  const tSearch = document.getElementById("pbTrainingSearch");
  const dSearch = document.getElementById("pbDrillSearch");
  if (tSearch) tSearch.value = "";
  if (dSearch) dSearch.value = "";

  renderPlaybookSelectors();
  bootstrap.Collapse.getOrCreateInstance(document.getElementById("playersCollapse"), { toggle: false }).show();
  bootstrap.Collapse.getOrCreateInstance(document.getElementById("playbookCollapse"), { toggle: false }).show();

  showModal();
}

function openEditTraining(training) {
  currentTrainingId = training.id;

  if ($.modalTitle) $.modalTitle.innerText = "Editar entrenamiento";
  $.quickTextSection && ($.quickTextSection.style.display = "none");

  // fields
  if ($.trainingDate) $.trainingDate.value = training.date ?? "";
  if ($.summary) $.summary.value = training.summary ?? "";
  if ($.notes) $.notes.value = training.notes ?? "";
  if ($.attendanceText) $.attendanceText.value = "";

  attendees = Array.isArray(training.attendees) ? [...training.attendees] : [];

  // ✅ nuevas selecciones
  selectedDrillIds = Array.isArray(training.drillIds) ? [...training.drillIds] : [];
  selectedPlaybookTrainingIds = Array.isArray(training.playbookTrainingIds) ? [...training.playbookTrainingIds] : [];

  // checkboxes de asistencia
  document.querySelectorAll(".attendance-check").forEach(cb => {
    cb.checked = attendees.includes(cb.dataset.id);
  });

  // clear searches
  const tSearch = document.getElementById("pbTrainingSearch");
  const dSearch = document.getElementById("pbDrillSearch");
  if (tSearch) tSearch.value = "";
  if (dSearch) dSearch.value = "";

  renderPlaybookSelectors();
  bootstrap.Collapse.getOrCreateInstance(document.getElementById("playersCollapse"), { toggle: false }).hide();
  bootstrap.Collapse.getOrCreateInstance(document.getElementById("playbookCollapse"), { toggle: false }).hide();

  showModal();
}

function showModal() {
  if (!$.modal) return;
  modalInstance = bootstrap.Modal.getOrCreateInstance($.modal);
  modalInstance.show();
}

function resetModal() {
  // si cerraron el modal, lo dejamos listo para "nuevo"
  openNewTraining(); // abre modal, NO queremos eso
  // entonces re-hacemos un reset "silencioso"
  currentTrainingId = null;
  attendees = [];
  selectedDrillIds = [];
  selectedPlaybookTrainingIds = [];

  if ($.modalTitle) $.modalTitle.innerText = "Nuevo entrenamiento";
  $.quickTextSection && ($.quickTextSection.style.display = "block");

  if ($.trainingDate) $.trainingDate.value = "";
  if ($.summary) $.summary.value = "";
  if ($.notes) $.notes.value = "";
  if ($.attendanceText) $.attendanceText.value = "";

  document.querySelectorAll(".attendance-check").forEach(cb => (cb.checked = false));

  const tSearch = document.getElementById("pbTrainingSearch");
  const dSearch = document.getElementById("pbDrillSearch");
  if (tSearch) tSearch.value = "";
  if (dSearch) dSearch.value = "";

  renderPlaybookSelectors();
}

/* =========================
   PLAYBOOK SELECTORS (render)
========================= */
function renderPlaybookSelectors() {
  const mountT = document.getElementById("pbTrainingsList");
  const mountD = document.getElementById("pbDrillsList");
  if (!mountT || !mountD) return;

  const tTerm = norm(document.getElementById("pbTrainingSearch")?.value);
  const dTerm = norm(document.getElementById("pbDrillSearch")?.value);

  const tFiltered = tTerm ? pbTrainings.filter(x => norm(x.name).includes(tTerm)) : pbTrainings;
  const dFiltered = dTerm ? pbDrills.filter(x => (norm(x.name) + " " + norm(x.authorName)).includes(dTerm)) : pbDrills;

  mountT.innerHTML = "";
  mountD.innerHTML = "";

  for (const t of tFiltered) {
    const checked = selectedPlaybookTrainingIds.includes(t.id);
    const el = document.createElement("label");
    el.className = "list-group-item d-flex gap-2 align-items-start";
    el.innerHTML = `
      <input class="form-check-input mt-1" type="checkbox" ${checked ? "checked" : ""}>
      <div>
        <div class="fw-semibold">${escapeHtml(t.name || "—")}</div>
      </div>
    `;
    el.querySelector("input").addEventListener("change", () => {
      toggleId(selectedPlaybookTrainingIds, t.id);
    });
    mountT.appendChild(el);
  }

  for (const d of dFiltered) {
    const checked = selectedDrillIds.includes(d.id);
    const el = document.createElement("label");
    el.className = "list-group-item d-flex gap-2 align-items-start";
    el.innerHTML = `
      <input class="form-check-input mt-1" type="checkbox" ${checked ? "checked" : ""}>
      <div>
        <div class="fw-semibold">${escapeHtml(d.name || "—")}</div>
        <div class="text-muted small">${escapeHtml(d.objective || "—")}</div>
      </div>
    `;
    el.querySelector("input").addEventListener("change", () => {
      toggleId(selectedDrillIds, d.id);
    });
    mountD.appendChild(el);
  }
}

function toggleId(arr, id) {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(id);
}

/* =========================
   ATTENDANCE
========================= */
function onAttendanceChange(e) {
  const playerId = e.target.dataset.id;
  if (e.target.checked) {
    if (!attendees.includes(playerId)) attendees.push(playerId);
  } else {
    attendees = attendees.filter(id => id !== playerId);
  }
}

/* =========================
   QUICK TEXT (WhatsApp)
========================= */
function processQuickText() {
  const text = ($.attendanceText?.value || "").toLowerCase();

  players.forEach(player => {
    const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
    const checkbox = document.querySelector(`.attendance-check[data-id="${player.id}"]`);
    if (!checkbox) return;

    if (text.includes(player.firstName.toLowerCase()) || text.includes(fullName)) {
      checkbox.checked = true;
      if (!attendees.includes(player.id)) attendees.push(player.id);
    }
  });
}

/* =========================
   SAVE
========================= */
async function saveTraining() {
  const date = $.trainingDate?.value;
  if (!date) return alert("Selecciona una fecha");

  const hasPick = selectedDrillIds.length || selectedPlaybookTrainingIds.length;
  const hasSummary = ($.summary?.value || "").trim().length > 0;

  // ✅ regla: o seleccionás o describís en summary
  if (!hasPick && !hasSummary) {
    alert("Seleccioná drills/entrenos del playbook o escribí qué se trabajó en el resumen.");
    return;
  }

  const payload = {
    clubId,
    date,
    month: date.slice(0, 7),
    attendees,
    playbookTrainingIds: [...selectedPlaybookTrainingIds],
    drillIds: [...selectedDrillIds],
    summary: ($.summary?.value || "").trim(),
    notes: ($.notes?.value || "").trim(),
    active: true,
  };

  $.saveBtn.disabled = true;

  try {
    if (currentTrainingId) {
      await updateDoc(doc(db, COL_TRAININGS, currentTrainingId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, COL_TRAININGS), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    // cerrar
    bootstrap.Modal.getInstance($.modal)?.hide();

    // reset + reload list
    resetModal();
    await loadTrainings();
  } catch (e) {
    console.error(e);
    alert("❌ Error guardando entreno");
  } finally {
    $.saveBtn.disabled = false;
  }
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  $.saveBtn?.addEventListener("click", saveTraining);
  $.processBtn?.addEventListener("click", processQuickText);
    // filtros
  $.search?.addEventListener("input", refreshListUI);
  $.monthFilter?.addEventListener("change", refreshListUI);
  $.sortFilter?.addEventListener("change", refreshListUI);
  $.dateFrom?.addEventListener("change", refreshListUI);
  $.dateTo?.addEventListener("change", refreshListUI);

  $.clearFiltersBtn?.addEventListener("click", () => {
    console.log('clearFiltersBtn', "clean filters button pressed");
    clearFilters();
    updateClearBtnState();
  });

  // cuando se cierra, reset (sin re-abrir)
  $.modal?.addEventListener("hidden.bs.modal", () => {
    // reset silencioso
    currentTrainingId = null;
    attendees = [];
    selectedDrillIds = [];
    selectedPlaybookTrainingIds = [];

    if ($.modalTitle) $.modalTitle.innerText = "Nuevo entrenamiento";
    $.quickTextSection && ($.quickTextSection.style.display = "block");

    if ($.trainingDate) $.trainingDate.value = "";
    if ($.summary) $.summary.value = "";
    if ($.notes) $.notes.value = "";
    if ($.attendanceText) $.attendanceText.value = "";

    document.querySelectorAll(".attendance-check").forEach(cb => (cb.checked = false));

    const tSearch = document.getElementById("pbTrainingSearch");
    const dSearch = document.getElementById("pbDrillSearch");
    if (tSearch) tSearch.value = "";
    if (dSearch) dSearch.value = "";

    renderPlaybookSelectors();
  });

  // botón "+ Nuevo entrenamiento" ya abre por data-bs-target, pero queremos setear estado limpio
  // escuchamos el show del modal y si no hay currentTrainingId, dejamos "nuevo"
  $.modal?.addEventListener("show.bs.modal", () => {
    if (!currentTrainingId) {
      // estado nuevo
      attendees = [];
      selectedDrillIds = [];
      selectedPlaybookTrainingIds = [];
      renderPlaybookSelectors();
    }
  });
}
/* =========================
   HELPERS
========================= */

function calcKPIs(list) {
  const total = list.length;

  const avg =
    total === 0
      ? 0
      : list.reduce((acc, t) => acc + (Array.isArray(t.attendees) ? t.attendees.length : 0), 0) / total;

  const lastISO = list[0]?.date || null;
  const lastHuman = lastISO ? fmtHumanDayMonth(lastISO) : "—";
  const ago = lastISO ? humanDaysAgo(daysAgo(lastISO)) : "";

  if ($.kpiTotal) $.kpiTotal.textContent = total.toString();
  if ($.kpiAvg) $.kpiAvg.textContent = total ? avg.toFixed(1) : "0.0";
  if ($.kpiLast) $.kpiLast.textContent = lastISO ? `${lastHuman} · ${ago}` : "—";
}

function monthLabel(yyyyMm) {
  // "2026-02" => "Febrero 2026"
  if (!yyyyMm) return "—";
  const [y, m] = yyyyMm.split("-");
  const d = new Date(`${yyyyMm}-01T00:00:00`);
  const month = d.toLocaleDateString("es-CR", { month: "long" });
  const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capMonth} ${y}`;
}

function fillMonthOptions(list) {
  if (!$.monthFilter) return;

  const counts = new Map();
  list.forEach(t => {
    if (!t.month) return;
    counts.set(t.month, (counts.get(t.month) || 0) + 1);
  });

  const months = [...counts.keys()].sort().reverse();
  const current = $.monthFilter.value;

  $.monthFilter.innerHTML = `<option value="">Todos</option>`;

  months.forEach(mm => {
    const opt = document.createElement("option");
    opt.value = mm;
    opt.textContent = `${monthLabel(mm)} (${counts.get(mm)})`;
    $.monthFilter.appendChild(opt);
  });

  $.monthFilter.value = current;
}

function buildSearchText(t) {
  // incluye summary o drills/playbook names (trainingDisplayText ya los concatena)
  const base = trainingDisplayText(t);
  const notes = (t.notes || "").toString();
  // podés sumar más campos si querés
  return norm(`${base} ${notes}`);
}

function applyFilters(list) {
  let out = [...list];

  // month
  const month = $.monthFilter?.value || "";
  if (month) out = out.filter(t => (t.month || "") === month);

  // date range
  const from = $.dateFrom?.value || "";
  const to = $.dateTo?.value || "";
  if (from) out = out.filter(t => (t.date || "") >= from);
  if (to) out = out.filter(t => (t.date || "") <= to);

  // search
  const term = norm($.search?.value || "");
  if (term) out = out.filter(t => buildSearchText(t).includes(term));

  // sort
  const sort = $.sortFilter?.value || "date_desc";
  out.sort((a, b) => {
    const aCount = Array.isArray(a.attendees) ? a.attendees.length : 0;
    const bCount = Array.isArray(b.attendees) ? b.attendees.length : 0;

    if (sort === "date_asc") return (a.date || "").localeCompare(b.date || "");
    if (sort === "att_desc") return bCount - aCount;
    if (sort === "att_asc") return aCount - bCount;
    // default date_desc
    return (b.date || "").localeCompare(a.date || "");
  });

  return out;
}

function renderTrainings(list) {
  $.table.innerHTML = "";
  $.cards.innerHTML = "";

  const totalAll = trainings.length; // para el label Entreno #n consistente con tu lógica original

  list.forEach((t) => {
    const idxInAll = trainings.findIndex(x => x.id === t.id);
    const label = trainingLabel(t, idxInAll >= 0 ? idxInAll : 0, totalAll);
    const rawDetails = shortTitle(trainingDisplayText(t));
    const term = $.search?.value || "";
    const detailsHtml = highlightText(rawDetails, term);
    const count = Array.isArray(t.attendees) ? t.attendees.length : 0;

    // DESKTOP ROW (sin Estado)
    $.table.innerHTML += `
      <tr data-id="${escapeHtml(t.id)}" class="training-row" style="cursor:pointer">
        <td class="date-col">${escapeHtml(label)}</td>
        <td class="name-col">${detailsHtml}</td>
        <td class="att-col"><span class="att-pill">${count}</span></td>
      </tr>
    `;

    // MOBILE CARD (sin Estado)
    $.cards.innerHTML += `
      <div class="card mb-2 training-card" data-id="${escapeHtml(t.id)}" style="cursor:pointer">
        <div class="card-body p-3">
          <div class="fw-semibold">${escapeHtml(label)}</div>
          <div class="text-muted small">${detailsHtml || "Entrenamiento"}</div>
          <div class="d-flex justify-content-between mt-2">
            <span class="small">👥 ${count} asistentes</span>
            <span class="text-primary small">Editar →</span>
          </div>
        </div>
      </div>
    `;
  });

  bindEditEvents(); // re-bindea click
}

function refreshListUI() {
  const filtered = applyFilters(trainings);
  renderTrainings(filtered);
}

function daysAgo(iso) {
  const d = parseISODate(iso);
  if (!d) return null;
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = b - a;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function humanDaysAgo(n) {
  if (n == null) return "";
  if (n === 0) return "hoy";
  if (n === 1) return "hace 1 día";
  if (n < 0) return "próximo"; // por si metieron fecha futura
  return `hace ${n} días`;
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, term) {
  const safeText = escapeHtml(text ?? "");
  const t = norm(term);
  if (!t) return safeText;

  const re = new RegExp(`(${escapeRegExp(t)})`, "ig");
  return safeText.replace(re, `<mark class="search-hit">$1</mark>`);
}

function clearFilters() {
  if ($.search) $.search.value = "";
  if ($.monthFilter) $.monthFilter.value = "";
  if ($.sortFilter) $.sortFilter.value = "date_desc";
  if ($.dateFrom) $.dateFrom.value = "";
  if ($.dateTo) $.dateTo.value = "";
  refreshListUI();
}

function updateClearBtnState() {
  if (!$.clearFiltersBtn) return;

  const hasFilters =
    (norm($.search?.value) !== "") ||
    (($.monthFilter?.value || "") !== "") ||
    (($.sortFilter?.value || "date_desc") !== "date_desc") ||
    (($.dateFrom?.value || "") !== "") ||
    (($.dateTo?.value || "") !== "");

  $.clearFiltersBtn.disabled = !hasFilters;
}

/* =========================
   UTILS
========================= */
function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function shortTitle(s) {
  const t = (s || "").toString().trim();
  if (!t) return "-";
  return t.length > 60 ? t.slice(0, 60) + "…" : t;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDrillName(id) {
  const d = pbDrills.find(x => x.id === id);
  return d?.name || null;
}

function getPlaybookTrainingName(id) {
  const t = pbTrainings.find(x => x.id === id);
  return t?.name || null;
}

function trainingDisplayText(t) {
  const summary = (t.summary || "").trim();
  if (summary) return summary;

  const names = [];

  // primero entrenamientos completos
  if (Array.isArray(t.playbookTrainingIds)) {
    for (const id of t.playbookTrainingIds) {
      const nm = getPlaybookTrainingName(id);
      if (nm) names.push(nm);
    }
  }

  // luego drills sueltos
  if (Array.isArray(t.drillIds)) {
    for (const id of t.drillIds) {
      const nm = getDrillName(id);
      if (nm) names.push(nm);
    }
  }

  if (!names.length) return "-";
  return names.join(", ");
}

function parseISODate(iso) {
  // iso: "YYYY-MM-DD"
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? null : d;
}

function fmtHumanDayMonth(iso) {
  const d = parseISODate(iso);
  if (!d) return "—";
  // "febrero 24" -> capitalizamos mes
  const month = d.toLocaleDateString("es-CR", { month: "long" });
  const day = d.toLocaleDateString("es-CR", { day: "2-digit" });
  const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capMonth} ${day}`;
}

function trainingLabel(t, idx, total) {
  // idx viene del render (0..total-1) en orden DESC.
  // Queremos #1 el más viejo => número = total - idx
  const n = total - idx;
  return `Entreno #${n}: ${fmtHumanDayMonth(t.date)}`;
}

function bindCollapseCarets() {
  // evita doble bind
  if (bindCollapseCarets._bound) return;
  bindCollapseCarets._bound = true;

  document.addEventListener("shown.bs.collapse", (e) => {
    const id = e.target?.id;
    if (!id) return;
    document.querySelectorAll(`[data-caret-for="${id}"]`).forEach(el => (el.textContent = "▾"));
  });

  document.addEventListener("hidden.bs.collapse", (e) => {
    const id = e.target?.id;
    if (!id) return;
    document.querySelectorAll(`[data-caret-for="${id}"]`).forEach(el => (el.textContent = "▸"));
  });
}