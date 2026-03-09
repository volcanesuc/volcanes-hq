// /js/trainings_history.js
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

import { APP_CONFIG } from "./config/config.js";
import { db } from "./auth/firebase.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader, updateLoaderMessage } from "./ui/loader.js";
import { loadPartialOnce } from "/js/ui/loadPartial.js";

/* =========================
   CONFIG
========================= */
const COL = APP_CONFIG.collections;

const COL_TRAININGS = COL.trainings;
const COL_PLAYERS = COL.players;
const COL_DRILLS = COL.drills;
const COL_PLAYBOOK_TRAININGS = COL.playbookTrainings;

const CLUB_ID =
  APP_CONFIG?.clubId ||
  APP_CONFIG?.club?.id ||
  APP_CONFIG?.brand?.clubId ||
  "volcanes";

/* =========================
   STATE
========================= */
let players = [];
let attendees = [];
let trainings = [];
let currentTrainingId = null;

let pbDrills = [];
let pbTrainings = [];

// lista principal ordenada de la sesión realizada
let sessionItems = [];

// dom refs
let $ = {};
let modalInstance = null;
let manualItemModalInstance = null;
let createDrillModalInstance = null;

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  showLoader("Cargando historial…");

  try {
    const { cfg, redirected } = await guardPage("trainings");
    if (redirected) return;

    updateLoaderMessage("Cargando header…");
    await loadHeader("trainings", cfg);

    updateLoaderMessage("Cargando modal…");
    await ensureTrainingModalPartial();
    cacheDom();

    bindCollapseCarets();
    bindResponsiveUI();

    updateLoaderMessage("Cargando jugadores…");
    await loadPlayers();

    updateLoaderMessage("Cargando playbook…");
    await loadPlaybookData();

    updateLoaderMessage("Cargando lista…");
    await loadTrainings();

    bindEvents();
  } catch (e) {
    console.error("[trainings] init error:", e);
  } finally {
    hideLoader();
  }
});

/* =========================
   PARTIAL / DOM
========================= */
async function ensureTrainingModalPartial() {
  const mount = document.getElementById("trainingModalMount");
  if (!mount) return;

  await loadPartialOnce("/partials/training_session_modal.html", "trainingModalMount");
}

function cacheDom() {
  $ = {
    table: document.getElementById("trainingsTable"),
    cards: document.getElementById("trainingsCards"),

    addTrainingBtn: document.getElementById("addTrainingBtn"),

    modal: document.getElementById("trainingModal"),
    modalTitle: document.getElementById("trainingModalTitle"),
    modalSubtitle: document.getElementById("trainingModalSubtitle"),

    form: document.getElementById("trainingForm"),
    trainingId: document.getElementById("trainingId"),
    trainingDate: document.getElementById("trainingDate"),
    attendanceText: document.getElementById("attendanceText"),
    processBtn: document.getElementById("processBtn"),
    quickTextSection: document.getElementById("quickTextSection"),
    quickTextInner: document.getElementById("quickTextInner"),

    playersList: document.getElementById("playersList"),
    participantsCounter: document.getElementById("participantsCounter"),
    participantsCollapse: document.getElementById("participantsCollapse"),
    participantsCollapsedHint: document.getElementById("participantsCollapsedHint"),
    participantsCollapseToggle: document.getElementById("participantsCollapseToggle"),

    sessionItemsList: document.getElementById("sessionItemsList"),
    sessionItemsEmpty: document.getElementById("sessionItemsEmpty"),
    sessionItemsCount: document.getElementById("sessionItemsCount"),
    sessionEstimatedTime: document.getElementById("sessionEstimatedTime"),
    sessionRestTime: document.getElementById("sessionRestTime"),

    addManualSessionItemBtn: document.getElementById("addManualSessionItemBtn"),
    openCreateDrillModalBtn: document.getElementById("openCreateDrillModalBtn"),

    pbTrainingSearch: document.getElementById("pbTrainingSearch"),
    pbDrillSearch: document.getElementById("pbDrillSearch"),
    pbTrainingsList: document.getElementById("pbTrainingsList"),
    pbDrillsList: document.getElementById("pbDrillsList"),

    notes: document.getElementById("trainingNotes"),
    saveBtn: document.getElementById("saveTrainingBtn"),

    manualItemModal: document.getElementById("manualSessionItemModal"),
    manualItemForm: document.getElementById("manualSessionItemForm"),
    manualItemName: document.getElementById("manualItemName"),
    manualItemObjective: document.getElementById("manualItemObjective"),
    manualItemVolume: document.getElementById("manualItemVolume"),
    manualItemMinutes: document.getElementById("manualItemMinutes"),
    manualItemRestAfter: document.getElementById("manualItemRestAfter"),

    createPlaybookDrillModal: document.getElementById("createPlaybookDrillModal"),
    createPlaybookDrillForm: document.getElementById("createPlaybookDrillForm"),
    newDrillName: document.getElementById("newDrillName"),
    newDrillObjective: document.getElementById("newDrillObjective"),
    newDrillVolume: document.getElementById("newDrillVolume"),
    newDrillMinutes: document.getElementById("newDrillMinutes"),
    newDrillRestAfter: document.getElementById("newDrillRestAfter"),

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
    filtersCollapse: document.getElementById("trainingFiltersCollapse"),
    filtersToggle: document.getElementById("trainingFiltersToggle"),
  };
}

/* =========================
   LOADERS
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
    .sort((a, b) =>
      `${a.firstName || ""} ${a.lastName || ""}`.localeCompare(`${b.firstName || ""} ${b.lastName || ""}`)
    );

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

  renderParticipantsCounter();
}

async function loadPlaybookData() {
  const qDrills = query(
    collection(db, COL_DRILLS),
    where("isActive", "==", true)
  );

  const s1 = await getDocs(qDrills);
  pbDrills = s1.docs.map(d => ({
    id: d.id,
    ...d.data(),
  }));
  pbDrills.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const s2 = await getDocs(collection(db, COL_PLAYBOOK_TRAININGS));
  pbTrainings = s2.docs.map(d => ({
    id: d.id,
    ...d.data(),
  }));
  pbTrainings.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  renderPlaybookSelectors();
}

async function loadTrainings() {
  if (!$.table || !$.cards) return;

  $.table.innerHTML = "";
  $.cards.innerHTML = "";
  trainings = [];

  const q = query(
    collection(db, COL_TRAININGS),
    orderBy("date", "desc")
  );

  const snapshot = await getDocs(q);
  snapshot.forEach(d => {
    trainings.push({ id: d.id, ...d.data() });
  });

  calcKPIs(trainings);
  fillMonthOptions(trainings);
  refreshListUI();
  updateClearBtnState();
}

/* =========================
   EVENTS
========================= */
function bindEvents() {
  $.addTrainingBtn?.addEventListener("click", openNewTraining);
  $.form?.addEventListener("submit", onSubmitTrainingForm);

  $.processBtn?.addEventListener("click", processQuickText);

  $.pbTrainingSearch?.addEventListener("input", renderPlaybookSelectors);
  $.pbDrillSearch?.addEventListener("input", renderPlaybookSelectors);

  $.manualItemForm?.addEventListener("submit", onSubmitManualItem);

  $.addManualSessionItemBtn?.addEventListener("click", () => {
    if (!$.manualItemModal) {
      console.error("[trainings] manualSessionItemModal no existe en el DOM");
      return;
    }

    resetManualItemForm();
    manualItemModalInstance = new bootstrap.Modal($.manualItemModal, {
      backdrop: true,
      focus: true
    });
    manualItemModalInstance.show();
  });

  $.openCreateDrillModalBtn?.addEventListener("click", () => {
    if (!$.createPlaybookDrillModal) {
      console.error("[trainings] createPlaybookDrillModal no existe en el DOM");
      return;
    }

  resetCreateDrillForm();
  createDrillModalInstance = new bootstrap.Modal($.createPlaybookDrillModal, {
    backdrop: true,
    focus: true
  });
  createDrillModalInstance.show();
});

  $.createPlaybookDrillForm?.addEventListener("submit", onSubmitCreatePlaybookDrill);

  $.participantsCollapse?.addEventListener("shown.bs.collapse", () => {
    $.participantsCollapsedHint?.classList.add("d-none");
  });

  $.participantsCollapse?.addEventListener("hidden.bs.collapse", () => {
    $.participantsCollapsedHint?.classList.remove("d-none");
  });

  // filtros
  $.search?.addEventListener("input", () => {
    refreshListUI();
    updateClearBtnState();
  });

  $.monthFilter?.addEventListener("change", () => {
    refreshListUI();
    updateClearBtnState();
  });

  $.sortFilter?.addEventListener("change", () => {
    refreshListUI();
    updateClearBtnState();
  });

  $.dateFrom?.addEventListener("change", () => {
    refreshListUI();
    updateClearBtnState();
  });

  $.dateTo?.addEventListener("change", () => {
    refreshListUI();
    updateClearBtnState();
  });

  $.clearFiltersBtn?.addEventListener("click", clearFilters);

  $.modal?.addEventListener("hidden.bs.modal", () => {
    silentResetTrainingForm();
  });
}

/* =========================
   OPEN / EDIT
========================= */
function openNewTraining() {
  currentTrainingId = null;

  $.modalTitle.textContent = "Nuevo entrenamiento";
  $.modalSubtitle.textContent = "Registrar sesión realizada, asistencia y material trabajado";
  if ($.quickTextInner) $.quickTextInner.style.display = "";

  sessionItems = [];
  attendees = [];

  $.trainingId.value = "";
  $.trainingDate.value = "";
  $.attendanceText.value = "";
  $.notes.value = "";

  document.querySelectorAll(".attendance-check").forEach(cb => {
    cb.checked = false;
  });

  $.pbTrainingSearch.value = "";
  $.pbDrillSearch.value = "";

  renderParticipantsCounter();
  renderPlaybookSelectors();
  renderSessionItems();

  modalInstance = bootstrap.Modal.getOrCreateInstance($.modal);
  setupParticipantsCollapseByViewport();
  refreshParticipantsCollapseHint();
  modalInstance.show();
}

function openEditTraining(training) {
  currentTrainingId = training.id;

  $.modalTitle.textContent = "Editar entrenamiento";
  $.modalSubtitle.textContent = "Ajusta asistencia, orden de la sesión y material realizado";

  $.trainingId.value = training.id;
  $.trainingDate.value = training.date || "";
  $.attendanceText.value = "";
  $.notes.value = training.notes || "";

  attendees = Array.isArray(training.attendees) ? [...training.attendees] : [];

  // nuevo modelo
  if (Array.isArray(training.sessionItems) && training.sessionItems.length) {
    sessionItems = training.sessionItems.map(item => ({
      uid: item.uid || cryptoRandomId(),
      type: item.type || "manual",
      source: item.source || "manual",
      sourceId: item.sourceId || null,
      parentTrainingId: item.parentTrainingId || null,
      parentTrainingName: item.parentTrainingName || null,
      name: item.name || "",
      objective: item.objective || "",
      volume: item.volume || "",
      estimatedMinutes: toNumberOrNull(item.estimatedMinutes),
      restAfter: item.restAfter || "",
      restMinutes: toNumberOrNull(item.restMinutes),
    }));
  } else {
    // no fallback complejo; dejamos vacío si no tiene sessionItems
    sessionItems = [];
  }

  document.querySelectorAll(".attendance-check").forEach(cb => {
    cb.checked = attendees.includes(cb.dataset.id);
  });

  $.pbTrainingSearch.value = "";
  $.pbDrillSearch.value = "";

  renderParticipantsCounter();
  renderPlaybookSelectors();
  renderSessionItems();

  if ($.quickTextInner) $.quickTextInner.style.display = "none";

  bootstrap.Collapse.getOrCreateInstance($.participantsCollapse, { toggle: false }).hide();
  refreshParticipantsCollapseHint();

  modalInstance = bootstrap.Modal.getOrCreateInstance($.modal);
  modalInstance.show();
}

function silentResetTrainingForm() {
  currentTrainingId = null;
  attendees = [];
  sessionItems = [];

  if ($.trainingId) $.trainingId.value = "";
  if ($.trainingDate) $.trainingDate.value = "";
  if ($.attendanceText) $.attendanceText.value = "";
  if ($.notes) $.notes.value = "";

  document.querySelectorAll(".attendance-check").forEach(cb => {
    cb.checked = false;
  });

  if ($.pbTrainingSearch) $.pbTrainingSearch.value = "";
  if ($.pbDrillSearch) $.pbDrillSearch.value = "";

  renderParticipantsCounter();
  renderPlaybookSelectors();
  renderSessionItems();
  if ($.quickTextInner) $.quickTextInner.style.display = "";
  refreshParticipantsCollapseHint();
}

/* =========================
   SESSION ITEMS
========================= */
function renderSessionItems() {
  const mount = $.sessionItemsList;
  if (!mount) return;

  mount.innerHTML = "";

  const hasItems = sessionItems.length > 0;
  $.sessionItemsEmpty.style.display = hasItems ? "none" : "block";

  sessionItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "session-item-card";
    card.dataset.uid = item.uid;

    const sourceBadge = getSessionItemSourceBadge(item);

    card.innerHTML = `
      <div class="session-item-card__top">
        <div class="d-flex align-items-start gap-3 flex-grow-1">
          <div class="session-item-order">${index + 1}</div>

          <div class="flex-grow-1">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
              <div class="session-item-title">${escapeHtml(item.name || "Actividad")}</div>
              ${sourceBadge}
            </div>

            ${item.parentTrainingName ? `
              <div class="small text-muted mb-2">
                Plan de origen: ${escapeHtml(item.parentTrainingName)}
              </div>
            ` : ""}

            <div class="mb-2">
              <label class="form-label form-label-sm">Objetivo</label>
              <textarea class="form-control form-control-sm session-item-input" data-field="objective" rows="2">${escapeHtml(item.objective || "")}</textarea>
            </div>

            <div class="row g-2">
              <div class="col-12 col-md-4">
                <label class="form-label form-label-sm">Volumen</label>
                <input class="form-control form-control-sm session-item-input" data-field="volume" value="${escapeHtml(item.volume || "")}" placeholder="Ej: 5 vueltas / 10 min" />
              </div>

              <div class="col-12 col-md-4">
                <label class="form-label form-label-sm">Duración estimada (min)</label>
                <input type="number" min="0" step="1" class="form-control form-control-sm session-item-input" data-field="estimatedMinutes" value="${escapeHtml(item.estimatedMinutes ?? "")}" placeholder="0" />
              </div>

              <div class="col-12 col-md-4">
                <label class="form-label form-label-sm">Descanso después</label>
                <input class="form-control form-control-sm session-item-input" data-field="restAfter" value="${escapeHtml(item.restAfter || "")}" placeholder="Ej: 2 minutos" />
              </div>

              <div class="col-12 col-md-4">
                <label class="form-label form-label-sm">Descanso (min)</label>
                <input type="number" min="0" step="1" class="form-control form-control-sm session-item-input" data-field="restMinutes" value="${escapeHtml(item.restMinutes ?? "")}" placeholder="0" />
              </div>
            </div>
          </div>
        </div>

        <div class="session-item-actions">
          <button class="btn btn-outline-secondary btn-sm" type="button" data-action="move-up" ${index === 0 ? "disabled" : ""}>
            <i class="bi bi-arrow-up"></i>
          </button>
          <button class="btn btn-outline-secondary btn-sm" type="button" data-action="move-down" ${index === sessionItems.length - 1 ? "disabled" : ""}>
            <i class="bi bi-arrow-down"></i>
          </button>
          <button class="btn btn-outline-danger btn-sm" type="button" data-action="remove">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;

    bindSessionItemCardEvents(card, item.uid);
    mount.appendChild(card);
  });

  updateSessionSummaryStrip();
}

function bindSessionItemCardEvents(card, uid) {
  card.querySelectorAll(".session-item-input").forEach(input => {
    input.addEventListener("input", e => {
      const field = e.target.dataset.field;
      const item = sessionItems.find(x => x.uid === uid);
      if (!item || !field) return;

      if (field === "estimatedMinutes" || field === "restMinutes") {
        item[field] = toNumberOrNull(e.target.value);
      } else {
        item[field] = e.target.value;
      }

      updateSessionSummaryStrip();
      refreshListUI();
    });
  });

  card.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const index = sessionItems.findIndex(x => x.uid === uid);
      if (index < 0) return;

      if (action === "remove") {
        sessionItems.splice(index, 1);
      } else if (action === "move-up" && index > 0) {
        [sessionItems[index - 1], sessionItems[index]] = [sessionItems[index], sessionItems[index - 1]];
      } else if (action === "move-down" && index < sessionItems.length - 1) {
        [sessionItems[index + 1], sessionItems[index]] = [sessionItems[index], sessionItems[index + 1]];
      }

      renderSessionItems();
    });
  });
}

function updateSessionSummaryStrip() {
  const count = sessionItems.length;
  const estimated = sessionItems.reduce((acc, item) => acc + (toNumberOrNull(item.estimatedMinutes) || 0), 0);
  const rest = sessionItems.reduce((acc, item) => acc + (toNumberOrNull(item.restMinutes) || 0), 0);

  if ($.sessionItemsCount) $.sessionItemsCount.textContent = String(count);
  if ($.sessionEstimatedTime) $.sessionEstimatedTime.textContent = `${estimated} min`;
  if ($.sessionRestTime) $.sessionRestTime.textContent = `${rest} min`;
}

function getSessionItemSourceBadge(item) {
  if (item.source === "playbook_training") {
    return `<span class="badge text-bg-primary-subtle text-primary-emphasis">Plan</span>`;
  }
  if (item.source === "playbook_drill") {
    return `<span class="badge text-bg-success-subtle text-success-emphasis">Drill Playbook</span>`;
  }
  return `<span class="badge text-bg-secondary">Manual</span>`;
}

function createSessionItemFromDrill(drill, extra = {}) {
  return {
    uid: cryptoRandomId(),
    type: "drill",
    source: extra.source || "playbook_drill",
    sourceId: drill?.id || null,
    parentTrainingId: extra.parentTrainingId || null,
    parentTrainingName: extra.parentTrainingName || null,
    name: drill?.name || "Drill",
    objective: drill?.objective || "",
    volume: drill?.volume || "",
    estimatedMinutes: toNumberOrNull(drill?.estimatedMinutes ?? drill?.durationMinutes ?? null),
    restAfter: drill?.restAfter || "",
    restMinutes: extractMinutes(drill?.restAfter),
  };
}

function createManualSessionItem(data = {}) {
  return {
    uid: cryptoRandomId(),
    type: "manual",
    source: "manual",
    sourceId: null,
    parentTrainingId: null,
    parentTrainingName: null,
    name: data.name || "Actividad manual",
    objective: data.objective || "",
    volume: data.volume || "",
    estimatedMinutes: toNumberOrNull(data.estimatedMinutes),
    restAfter: data.restAfter || "",
    restMinutes: toNumberOrNull(data.restMinutes),
  };
}

/* =========================
   PLAYBOOK PICKERS
========================= */
function renderPlaybookSelectors() {
  if (!$.pbTrainingsList || !$.pbDrillsList) return;

  const tTerm = norm($.pbTrainingSearch?.value);
  const dTerm = norm($.pbDrillSearch?.value);

  const tFiltered = tTerm
    ? pbTrainings.filter(x => norm(x.name).includes(tTerm))
    : pbTrainings;

  const dFiltered = dTerm
    ? pbDrills.filter(d => {
        const tagLabels = Array.isArray(d.tags)
          ? d.tags.map(t => typeof t === "string" ? t : (t?.label || "")).join(" ")
          : "";

        return `${norm(d.name)} ${norm(d.objective)} ${norm(d.authorName)} ${norm(tagLabels)}`.includes(dTerm);
      })
    : pbDrills;

  $.pbTrainingsList.innerHTML = "";
  $.pbDrillsList.innerHTML = "";

  for (const t of tFiltered) {
    const item = document.createElement("div");
    item.className = "list-group-item";

    const drillCount = Array.isArray(t.drillIds) ? t.drillIds.length : 0;

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="min-w-0">
          <div class="fw-semibold">${escapeHtml(t.name || "—")}</div>
          <div class="text-muted small">
            ${drillCount} drill${drillCount === 1 ? "" : "s"}
          </div>
        </div>

        <button class="btn btn-outline-primary btn-sm" type="button">
          <i class="bi bi-plus-lg"></i> Usar plan
        </button>
      </div>
    `;

    item.querySelector("button")?.addEventListener("click", () => {
      addPlaybookTrainingToSession(t.id);
    });

    $.pbTrainingsList.appendChild(item);
  }

  for (const d of dFiltered) {
    const item = document.createElement("div");
    item.className = "list-group-item";

    const minPlayers = Number.parseInt(d.minPlayers, 10);
    const hasMinPlayers = Number.isFinite(minPlayers) && minPlayers > 0;
    const isHighMin = hasMinPlayers && minPlayers >= 7;
    const minClass = isHighMin ? "fw-semibold text-danger" : "fw-semibold text-dark";

    const normalizedTags = Array.isArray(d.tags) ? d.tags : [];

    const tagsHtml = normalizedTags.length
      ? `
        <div class="d-flex flex-wrap gap-1 mt-2">
          ${normalizedTags.map(tag => {
            const label = typeof tag === "string" ? tag : (tag?.label || "Tag");
            const key = typeof tag === "string" ? tag : (tag?.key || label);
            const color = typeof tag === "string"
              ? colorFromString(key)
              : (tag?.color || colorFromString(key));

            return `
              <span
                class="badge rounded-pill"
                style="
                  background: ${escapeHtml(color)};
                  color: #fff;
                  font-weight: 500;
                "
              >
                ${escapeHtml(label)}
              </span>
            `;
          }).join("")}
        </div>
      `
      : "";

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div class="min-w-0 flex-grow-1">
          <div class="fw-semibold">${escapeHtml(d.name || "—")}</div>
          <div class="text-muted small mt-1">${escapeHtml(d.objective || "Sin objetivo")}</div>

          <div class="small text-muted mt-2">
            Volumen: ${escapeHtml(d.volume || "—")}
            · Descanso: ${escapeHtml(d.restAfter || "—")}
            · <span class="${minClass}">
                Mín: ${hasMinPlayers ? escapeHtml(String(minPlayers)) : "—"} personas
              </span>
          </div>

          ${tagsHtml}
        </div>

        <button class="btn btn-outline-primary btn-sm flex-shrink-0" type="button">
          <i class="bi bi-plus-lg"></i> Agregar
        </button>
      </div>
    `;

    item.querySelector("button")?.addEventListener("click", () => {
      addDrillToSession(d.id);
    });

    $.pbDrillsList.appendChild(item);
  }
}

function addDrillToSession(drillId) {
  const drill = pbDrills.find(x => x.id === drillId);
  if (!drill) return;

  sessionItems.push(createSessionItemFromDrill(drill, { source: "playbook_drill" }));
  renderSessionItems();
}

function addPlaybookTrainingToSession(playbookTrainingId) {
  const training = pbTrainings.find(x => x.id === playbookTrainingId);
  if (!training) return;

  const drillIds = Array.isArray(training.drillIds) ? training.drillIds : [];
  if (!drillIds.length) return;

  drillIds.forEach(drillId => {
    const drill = pbDrills.find(x => x.id === drillId);
    if (!drill) return;

    sessionItems.push(
      createSessionItemFromDrill(drill, {
        source: "playbook_training",
        parentTrainingId: training.id,
        parentTrainingName: training.name || "",
      })
    );
  });

  renderSessionItems();
}

/* =========================
   PARTICIPANTES
========================= */
function onAttendanceChange(e) {
  const playerId = e.target.dataset.id;
  if (!playerId) return;

  if (e.target.checked) {
    if (!attendees.includes(playerId)) attendees.push(playerId);
  } else {
    attendees = attendees.filter(id => id !== playerId);
  }

  renderParticipantsCounter();
}

function renderParticipantsCounter() {
  if (!$.participantsCounter) return;
  $.participantsCounter.textContent = `${attendees.length} seleccionados`;
}

/* =========================
   WHATSAPP QUICK TEXT
========================= */
function processQuickText() {
  const text = ($.attendanceText?.value || "").toLowerCase();

  players.forEach(player => {
    const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
    const checkbox = document.querySelector(`.attendance-check[data-id="${player.id}"]`);
    if (!checkbox) return;

    if (text.includes((player.firstName || "").toLowerCase()) || text.includes(fullName)) {
      checkbox.checked = true;
      if (!attendees.includes(player.id)) attendees.push(player.id);
    }
  });

  attendees = [...new Set(attendees)];
  renderParticipantsCounter();
}

/* =========================
   MANUAL ITEM MODAL
========================= */
function resetManualItemForm() {
  $.manualItemForm?.reset();
}

function onSubmitManualItem(e) {
  e.preventDefault();

  const name = ($.manualItemName?.value || "").trim();
  if (!name) {
    alert("Ponle nombre a la actividad.");
    return;
  }

  sessionItems.push(
    createManualSessionItem({
      name,
      objective: ($.manualItemObjective?.value || "").trim(),
      volume: ($.manualItemVolume?.value || "").trim(),
      estimatedMinutes: ($.manualItemMinutes?.value || "").trim(),
      restAfter: ($.manualItemRestAfter?.value || "").trim(),
      restMinutes: extractMinutes($.manualItemRestAfter?.value || ""),
    })
  );

  manualItemModalInstance?.hide();
  renderSessionItems();
}

/* =========================
   CREATE PLAYBOOK DRILL MODAL
========================= */
function resetCreateDrillForm() {
  $.createPlaybookDrillForm?.reset();
}

async function onSubmitCreatePlaybookDrill(e) {
  e.preventDefault();

  const name = ($.newDrillName?.value || "").trim();
  const objective = ($.newDrillObjective?.value || "").trim();

  if (!name) {
    alert("El drill necesita nombre.");
    return;
  }

  const payload = {
    name,
    objective,
    volume: ($.newDrillVolume?.value || "").trim(),
    estimatedMinutes: toNumberOrNull($.newDrillMinutes?.value),
    restAfter: ($.newDrillRestAfter?.value || "").trim(),
    authorName: "Staff",
    clubId: CLUB_ID,
    isActive: true,
    isPublic: false,
    recommendations: "",
    tacticalBoardUrl: "",
    teamVideoUrl: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = await addDoc(collection(db, COL_DRILLS), payload);

    pbDrills.unshift({
      id: ref.id,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    pbDrills.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    renderPlaybookSelectors();

    const savedDrill = pbDrills.find(x => x.id === ref.id);
    if (savedDrill) {
      sessionItems.push(createSessionItemFromDrill(savedDrill, { source: "playbook_drill" }));
      renderSessionItems();
    }

    createDrillModalInstance?.hide();
  } catch (err) {
    console.error(err);
    alert("No se pudo crear el drill.");
  }
}

/* =========================
   SAVE
========================= */
async function onSubmitTrainingForm(e) {
  e.preventDefault();
  await saveTraining();
}

async function saveTraining() {
  const date = $.trainingDate?.value || "";

  if (!date) {
    alert("Selecciona una fecha.");
    return;
  }

  if (!sessionItems.length) {
    alert("Agrega al menos un drill o actividad a la sesión.");
    return;
  }

  const cleanedSessionItems = sessionItems.map(item => ({
    uid: item.uid || cryptoRandomId(),
    type: item.type || "manual",
    source: item.source || "manual",
    sourceId: item.sourceId || null,
    parentTrainingId: item.parentTrainingId || null,
    parentTrainingName: item.parentTrainingName || null,
    name: (item.name || "").trim(),
    objective: (item.objective || "").trim(),
    volume: (item.volume || "").trim(),
    estimatedMinutes: toNumberOrNull(item.estimatedMinutes),
    restAfter: (item.restAfter || "").trim(),
    restMinutes: toNumberOrNull(item.restMinutes),
  }));

  const drillIds = [
    ...new Set(
      cleanedSessionItems
        .filter(x => x.sourceId && (x.source === "playbook_drill" || x.source === "playbook_training"))
        .map(x => x.sourceId)
    ),
  ];

  const playbookTrainingIds = [
    ...new Set(
      cleanedSessionItems
        .filter(x => x.parentTrainingId)
        .map(x => x.parentTrainingId)
    ),
  ];

  const autoSummary = cleanedSessionItems
    .map((item, idx) => `${idx + 1}. ${item.name}`)
    .join(" · ");

  const payload = {
    date,
    month: date.slice(0, 7),
    attendees: [...new Set(attendees)],
    sessionItems: cleanedSessionItems,
    drillIds,
    playbookTrainingIds,
    summary: autoSummary,
    notes: ($.notes?.value || "").trim(),
    active: true,
    clubId: CLUB_ID,
    estimatedSessionMinutes: cleanedSessionItems.reduce((acc, item) => acc + (item.estimatedMinutes || 0), 0),
    totalRestMinutes: cleanedSessionItems.reduce((acc, item) => acc + (item.restMinutes || 0), 0),
    updatedAt: serverTimestamp(),
  };

  $.saveBtn.disabled = true;

  try {
    if (currentTrainingId) {
      await updateDoc(doc(db, COL_TRAININGS, currentTrainingId), payload);
    } else {
      await addDoc(collection(db, COL_TRAININGS), {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }

    bootstrap.Modal.getOrCreateInstance($.modal).hide();
    await loadTrainings();
  } catch (err) {
    console.error(err);
    alert("Error guardando entrenamiento.");
  } finally {
    $.saveBtn.disabled = false;
  }
}

/* =========================
   LIST / TABLE
========================= */
function renderTrainings(list) {
  $.table.innerHTML = "";
  $.cards.innerHTML = "";

  const totalAll = trainings.length;

  list.forEach((t) => {
    const idxInAll = trainings.findIndex(x => x.id === t.id);
    const label = trainingLabel(t, idxInAll >= 0 ? idxInAll : 0, totalAll);
    const rawDetails = shortTitle(trainingDisplayText(t));
    const detailsHtml = highlightText(rawDetails, $.search?.value || "");
    const count = Array.isArray(t.attendees) ? t.attendees.length : 0;

    $.table.innerHTML += `
      <tr data-id="${escapeHtml(t.id)}" class="training-row" style="cursor:pointer">
        <td class="date-col">${escapeHtml(label)}</td>
        <td class="name-col">${detailsHtml}</td>
        <td class="att-col"><span class="att-pill">${count}</span></td>
      </tr>
    `;

    $.cards.innerHTML += `
      <div class="card mb-2 training-card" data-id="${escapeHtml(t.id)}" style="cursor:pointer">
        <div class="card-body p-3">
          <div class="fw-semibold">${escapeHtml(label)}</div>
          <div class="text-muted small">${detailsHtml || "Sesión"}</div>
          <div class="d-flex justify-content-between mt-2">
            <span class="small">👥 ${count} asistentes</span>
            <span class="text-primary small">Abrir</span>
          </div>
        </div>
      </div>
    `;
  });

  bindEditEvents();
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

function refreshListUI() {
  const filtered = applyFilters(trainings);
  renderTrainings(filtered);
}

function buildSearchText(t) {
  const base = trainingDisplayText(t);
  const notes = (t.notes || "").toString();
  return norm(`${base} ${notes}`);
}

function applyFilters(list) {
  let out = [...list];

  const month = $.monthFilter?.value || "";
  if (month) out = out.filter(t => (t.month || "") === month);

  const from = $.dateFrom?.value || "";
  const to = $.dateTo?.value || "";
  if (from) out = out.filter(t => (t.date || "") >= from);
  if (to) out = out.filter(t => (t.date || "") <= to);

  const term = norm($.search?.value || "");
  if (term) out = out.filter(t => buildSearchText(t).includes(term));

  const sort = $.sortFilter?.value || "date_desc";
  out.sort((a, b) => {
    const aCount = Array.isArray(a.attendees) ? a.attendees.length : 0;
    const bCount = Array.isArray(b.attendees) ? b.attendees.length : 0;

    if (sort === "date_asc") return (a.date || "").localeCompare(b.date || "");
    if (sort === "att_desc") return bCount - aCount;
    if (sort === "att_asc") return aCount - bCount;
    return (b.date || "").localeCompare(a.date || "");
  });

  return out;
}

/* =========================
   KPIS / FILTER UI
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

function clearFilters() {
  if ($.search) $.search.value = "";
  if ($.monthFilter) $.monthFilter.value = "";
  if ($.sortFilter) $.sortFilter.value = "date_desc";
  if ($.dateFrom) $.dateFrom.value = "";
  if ($.dateTo) $.dateTo.value = "";
  refreshListUI();
  updateClearBtnState();
}

function updateClearBtnState() {
  if (!$.clearFiltersBtn) return;

  const hasFilters =
    norm($.search?.value) !== "" ||
    ($.monthFilter?.value || "") !== "" ||
    ($.sortFilter?.value || "date_desc") !== "date_desc" ||
    ($.dateFrom?.value || "") !== "" ||
    ($.dateTo?.value || "") !== "";

  $.clearFiltersBtn.disabled = !hasFilters;
}

function setupResponsiveFiltersCollapse() {
  if (!$.filtersCollapse) return;

  const collapse = bootstrap.Collapse.getOrCreateInstance($.filtersCollapse, {
    toggle: false,
  });

  if (window.innerWidth <= 576) {
    collapse.hide();
    $.filtersToggle?.setAttribute("aria-expanded", "false");
  } else {
    collapse.show();
    $.filtersToggle?.setAttribute("aria-expanded", "true");
  }
}

let filtersResizeTimer = null;

function bindResponsiveUI() {
  setupResponsiveFiltersCollapse();
  setupParticipantsCollapseByViewport();

  window.addEventListener("resize", () => {
    clearTimeout(filtersResizeTimer);
    filtersResizeTimer = setTimeout(() => {
      setupResponsiveFiltersCollapse();
      setupParticipantsCollapseByViewport();
    }, 120);
  });
}

function bindCollapseCarets() {
  if (bindCollapseCarets._bound) return;
  bindCollapseCarets._bound = true;

  document.addEventListener("shown.bs.collapse", (e) => {
    const id = e.target?.id;
    if (!id) return;
    document.querySelectorAll(`[data-caret-for="${id}"]`).forEach(el => {
      el.textContent = "▾";
    });
  });

  document.addEventListener("hidden.bs.collapse", (e) => {
    const id = e.target?.id;
    if (!id) return;
    document.querySelectorAll(`[data-caret-for="${id}"]`).forEach(el => {
      el.textContent = "▸";
    });
  });
}

/* =========================
   DISPLAY HELPERS
========================= */
function trainingDisplayText(t) {
  if (Array.isArray(t.sessionItems) && t.sessionItems.length) {
    return t.sessionItems.map((item, idx) => `${idx + 1}. ${item.name}`).join(", ");
  }

  if (t.summary) return t.summary.trim();

  return "-";
}

function trainingLabel(t, idx, total) {
  const n = total - idx;
  return `Entreno #${n}: ${fmtHumanDayMonth(t.date)}`;
}

function monthLabel(yyyyMm) {
  if (!yyyyMm) return "—";
  const [y] = yyyyMm.split("-");
  const d = new Date(`${yyyyMm}-01T00:00:00`);
  const month = d.toLocaleDateString("es-CR", { month: "long" });
  const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capMonth} ${y}`;
}

function parseISODate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d) ? null : d;
}

function fmtHumanDayMonth(iso) {
  const d = parseISODate(iso);
  if (!d) return "—";
  const month = d.toLocaleDateString("es-CR", { month: "long" });
  const day = d.toLocaleDateString("es-CR", { day: "2-digit" });
  const capMonth = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capMonth} ${day}`;
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
  if (n < 0) return "próximo";
  return `hace ${n} días`;
}

function colorFromString(str) {
  const s = String(str || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 55%)`;
}

function setupParticipantsCollapseByViewport() {
  if (!$.participantsCollapse) return;

  const collapse = bootstrap.Collapse.getOrCreateInstance($.participantsCollapse, {
    toggle: false,
  });

  if (window.innerWidth <= 768) {
    collapse.hide();
    $.participantsCollapsedHint?.classList.remove("d-none");
    $.participantsCollapseToggle?.setAttribute("aria-expanded", "false");
  } else {
    collapse.show();
    $.participantsCollapsedHint?.classList.add("d-none");
    $.participantsCollapseToggle?.setAttribute("aria-expanded", "true");
  }
}

function refreshParticipantsCollapseHint() {
  if (!$.participantsCollapse || !$.participantsCollapsedHint) return;
  const isShown = $.participantsCollapse.classList.contains("show");
  $.participantsCollapsedHint.classList.toggle("d-none", isShown);
}

/* =========================
   GENERIC HELPERS
========================= */
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function shortTitle(s) {
  const t = (s || "").toString().trim();
  if (!t) return "-";
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, term) {
  const safeText = escapeHtml(text ?? "");
  const cleanTerm = term || "";
  if (!cleanTerm.trim()) return safeText;

  const re = new RegExp(`(${escapeRegExp(cleanTerm.trim())})`, "ig");
  return safeText.replace(re, `<mark class="search-hit">$1</mark>`);
}

function cryptoRandomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `it_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractMinutes(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;

  const match = t.match(/(\d+)/);
  if (!match) return null;

  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}