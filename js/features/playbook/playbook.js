// /js/features/playbook/playbook.js
import { db } from "../../auth/firebase.js";
import { watchAuth } from "../../auth/auth.js";
import { showLoader, hideLoader } from "../../ui/loader.js";

import { guardPage } from "../../page-guard.js";
import { loadHeader } from "../../components/header.js";

import { PLAYBOOK_STRINGS as S } from "../../strings/playbook_strings.js";

import { loadPartialOnce } from "/js/ui/loadPartial.js";
import { createTrainingEditor } from "./training_plan_editor.js";

import { initGymTab } from "./gym/gym.js";
import { initGymEditors } from "./gym/gym_editors.js";

import { openMediaViewerModal } from "../../ui/media_viewer_modal.js";

import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Collections
========================= */
const COL_DRILLS = "drills";
const COL_PLAYBOOK_TRAININGS = "playbook_trainings";

/* =========================
   State
========================= */
let $ = {};

let canEdit = false;
let drills = [];
let trainings = [];

let trainingEditor = null;

let drillEditor = { id: null, bound: false };

let selectedDrillTagKeys = new Set();
let drillTagCatalog = [];

/* =========================
   INIT
========================= */
const { cfg, redirected } = await guardPage("playbook");
if (!redirected) {
  await loadHeader("playbook", cfg);
}

cacheDom();
bindEvents();

watchAuth(async () => {
  showLoader();
  try {
    canEdit = isAdminFromCfg(cfg);
    setRoleUI();

    $.pageSubtitle.textContent = canEdit
      ? (S.ui?.subtitleAdmin || "Admin")
      : (S.ui?.subtitleViewer || "Viewer");

    await loadDrills();
    await loadTrainings();
    try {
      await initGymTab({ db, canEdit });
      await initGymEditors({ db, canEdit, modalMountId: "modalMount" });
    } catch (e) {
      console.error("[playbook] Gym init error:", e);
      showAlert("La pestaña Gimnasio falló al cargar. Ver consola.", "warning");
    }
  } finally {
    hideLoader();
    document.body.classList.remove("loading");
  }
});

/* =========================
   Permissions
========================= */
function isAdminFromCfg(cfg) {
  const role = (cfg?.role || cfg?.userRole || cfg?.authRole || "").toString().toLowerCase();
  if (role === "admin") return true;
  if (cfg?.isAdmin === true) return true;
  return false;
}

function setRoleUI() {
  const badge = $.roleBadge;
  if (badge) badge.classList.remove("d-none");

  if (canEdit) {
    if (badge) {
      badge.className = "badge text-bg-primary";
      badge.textContent = "ADMIN (EDIT)";
    }
    $.openCreateDrillBtn?.classList.remove("d-none");
    $.openCreateTrainingBtn?.classList.remove("d-none");
  } else {
    if (badge) {
      badge.className = "badge text-bg-secondary";
      badge.textContent = "VIEW ONLY";
    }
    $.openCreateDrillBtn?.classList.add("d-none");
    $.openCreateTrainingBtn?.classList.add("d-none");
  }
}

/* =========================
   DOM
========================= */
function cacheDom() {
  $ = {
    pageSubtitle: document.getElementById("pageSubtitle"),
    roleBadge: document.getElementById("roleBadge"),
    alertBox: document.getElementById("alertBox"),

    // Drills
    drillForm: document.getElementById("drillForm"),
    drillName: document.getElementById("drillName"),
    drillAuthor: document.getElementById("drillAuthor"),
    drillTacticalUrl: document.getElementById("drillTacticalUrl"),
    drillVideoUrl: document.getElementById("drillVideoUrl"),
    drillObjective: document.getElementById("drillObjective"),
    drillVolume: document.getElementById("drillVolume"),
    drillRest: document.getElementById("drillRest"),
    drillMinPlayers: document.getElementById("drillMinPlayers"),
    drillRecs: document.getElementById("drillRecs"),
    drillTags: document.getElementById("drillTags"),
    drillTagsFilter: document.getElementById("drillTagsFilter"),

    openCreateDrillBtn: document.getElementById("openCreateDrillBtn"),
    createDrillModal: document.getElementById("createDrillModal"),
    saveCreateDrillBtn: document.getElementById("saveCreateDrillBtn"),

    drillSearch: document.getElementById("drillSearch"),
    showArchivedSwitch: document.getElementById("showArchivedSwitch"),
    refreshDrillsBtn: document.getElementById("refreshDrillsBtn"),
    drillsList: document.getElementById("drillsList"),
    drillsEmpty: document.getElementById("drillsEmpty"),

    // Trainings (nuevo)
    refreshTrainingsBtn: document.getElementById("refreshTrainingsBtn"),
    trainingSearch: document.getElementById("trainingSearch"),
    trainingsList: document.getElementById("trainingsList"),
    trainingsEmpty: document.getElementById("trainingsEmpty"),

    // Botón nuevo (agregalo en HTML del tab trainings)
    openCreateTrainingBtn: document.getElementById("openCreateTrainingBtn"),

    // mount para partials/modals
    modalMount: document.getElementById("modalMount"),
  };
}

/* =========================
   Alerts
========================= */
function showAlert(msg, type = "info") {
  const el = $.alertBox;
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove("d-none");
}

function clearAlert() {
  $.alertBox?.classList.add("d-none");
}

/* =========================
   Data: Drills
========================= */
async function loadDrills() {
  const showArchived = !!$.showArchivedSwitch?.checked;

  const filters = [];
  if (!showArchived) filters.push(where("isActive", "==", true));

  let qy = collection(db, COL_DRILLS);
  if (!showArchived) {
    qy = query(qy, where("isActive", "==", true));
  }
  const snap = await getDocs(qy);

  drills = snap.docs.map(d => {
    const row = { id: d.id, ...d.data() };
    row.tags = normalizeDrillTags(row);
    return row;
  });

  drillTagCatalog = buildDrillTagCatalog(drills);

  drills.sort((a, b) => {
    const da = a.createdAt?.toDate?.() ?? (a.createdAt ? new Date(a.createdAt) : new Date(0));
    const dbb = b.createdAt?.toDate?.() ?? (b.createdAt ? new Date(b.createdAt) : new Date(0));
    return dbb - da;
  });

  renderDrills();
}

function renderDrillTagFilters() {
  const el = $.drillTagsFilter;
  if (!el) return;

  if (!drillTagCatalog.length) {
    el.innerHTML = `<span class="text-muted small">Sin tags todavía.</span>`;
    return;
  }

  const allSelected = selectedDrillTagKeys.size === 0;

  const clearPill = `
    <span
      data-tag-clear="1"
      class="d-inline-flex align-items-center gap-1"
      style="
        background:${allSelected ? "#212529" : "#fff"};
        color:${allSelected ? "#fff" : "#212529"};
        border:1px solid #ced4da;
        border-radius:999px;
        padding:.25rem .6rem;
        font-size:.75rem;
        font-weight:600;
        line-height:1;
        cursor:pointer;
      "
    >
      Todos
    </span>
  `;

  el.innerHTML = clearPill + renderTagPills(drillTagCatalog, {
    clickable: true,
    selectedKeys: selectedDrillTagKeys,
  });

  el.querySelector("[data-tag-clear]")?.addEventListener("click", () => {
    selectedDrillTagKeys = new Set();
    renderDrillTagFilters();
    renderDrills();
  });

  el.querySelectorAll("[data-tag-filter]").forEach(node => {
    node.addEventListener("click", () => {
      const key = node.getAttribute("data-tag-filter");
      if (!key) return;

      if (selectedDrillTagKeys.has(key)) selectedDrillTagKeys.delete(key);
      else selectedDrillTagKeys.add(key);

      renderDrillTagFilters();
      renderDrills();
    });
  });
}

/* =========================
   Data: Trainings (cards)
========================= */
async function loadTrainings() {
  try {
    const listEl = document.getElementById("trainingsList");
    if (!listEl) {
      console.warn("[playbook] No existe #trainingsList en el HTML (tab trainings).");
      trainings = [];
      renderTrainings();
      return;
    }

    const q1 = collection(db, COL_PLAYBOOK_TRAININGS);
    const snap1 = await getDocs(q1);
    let rows = snap1.docs.map(d => ({ id: d.id, ...d.data() }));

    trainings = rows;

    trainings.sort((a, b) => {
      const da = (a.date?.toDate?.() ?? (a.date ? new Date(a.date) : new Date(0)));
      const dbb = (b.date?.toDate?.() ?? (b.date ? new Date(b.date) : new Date(0)));
      return dbb - da;
    });

    console.log("[playbook] trainings loaded:", trainings.length);
    renderTrainings();
  } catch (err) {
    console.error("[playbook] loadTrainings error:", err);
    showAlert("Error cargando entrenamientos. Ver consola.", "danger");
    trainings = [];
    renderTrainings();
  }
}

/* =========================
   Render: Drills
========================= */
function renderDrills() {
  const term = norm($.drillSearch?.value);

  let filtered = term ? drills.filter(d => drillMatches(d, term)) : [...drills];

  if (selectedDrillTagKeys.size) {
    filtered = filtered.filter(d => {
      const keys = new Set((d.tags || []).map(t => t.key));
      for (const key of selectedDrillTagKeys) {
        if (!keys.has(key)) return false;
      }
      return true;
    });
  }

  renderDrillTagFilters();

  if ($.drillsList) $.drillsList.innerHTML = "";

  if (!filtered.length) {
    $.drillsEmpty?.classList.remove("d-none");
    return;
  }
  $.drillsEmpty?.classList.add("d-none");

  for (const d of filtered) {
    const card = document.createElement("div");
    card.className = "col-12 col-lg-6";

    const tactical = safeUrl(d.tacticalBoardUrl);
    const video = safeUrl(d.teamVideoUrl);
    const active = d.isActive !== false;

    const clickable = canEdit
      ? `data-edit-drill="${escapeHtml(d.id)}" style="cursor:pointer"`
      : "";

    const tagsHtml = Array.isArray(d.tags) && d.tags.length
      ? `<div class="d-flex flex-wrap gap-2 mt-2">${renderTagPills(d.tags)}</div>`
      : `<div class="text-muted small mt-2">Sin tags</div>`;

    card.innerHTML = `
      <div class="card h-100" ${clickable}>
        <div class="card-body">
          <div class="d-flex justify-content-between gap-2">
            <div>
              <div class="fw-semibold">${escapeHtml(d.name || "—")}</div>

              <div class="text-muted small d-flex flex-wrap align-items-center gap-2">
                ${
                  tactical
                    ? `<button
                          type="button"
                          class="btn btn-link btn-sm p-0 text-decoration-none"
                          data-open-external="${escapeHtml(tactical)}"
                          data-open-title="${escapeHtml(d.name || "Tactical Board")}"
                       >
                          Ver
                       </button>`
                    : `<span class="text-muted">Sin Tactical</span>`
                }

                <span>•</span>

                ${
                  video
                    ? `<button
                          type="button"
                          class="btn btn-link btn-sm p-0 text-decoration-none"
                          data-open-external="${escapeHtml(video)}"
                          data-open-title="${escapeHtml(d.name || "Video")}"
                       >
                          Video
                       </button>`
                    : `<span class="text-muted">Sin video</span>`
                }
              </div>

              ${tagsHtml}
            </div>

            <div class="text-end">
              <span class="badge ${active ? "text-bg-success" : "text-bg-secondary"}">
                ${active ? "Activo" : "Archivado"}
              </span>

              ${
                canEdit
                  ? `<div class="mt-2 d-flex gap-2 justify-content-end">
                       <button class="btn btn-outline-danger btn-sm"
                               data-action="toggle"
                               data-id="${escapeHtml(d.id)}">
                         ${active ? "Archivar" : "Reactivar"}
                       </button>
                     </div>`
                  : ``
              }
            </div>
          </div>

          <hr />

          <div class="small text-muted">Objetivo</div>
          <div>${escapeHtml(d.objective || "—")}</div>

          <div class="row mt-2 g-2">
            <div class="col-6">
              <div class="small text-muted">Volumen</div>
              <div>${escapeHtml(d.volume || "—")}</div>
            </div>
            <div class="col-6">
              <div class="small text-muted">Descanso</div>
              <div>${escapeHtml(d.restAfter || "—")}</div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="small text-muted">Mínimo de personas</div>
            <div>${d.minPlayers > 0 ? escapeHtml(d.minPlayers) : "—"}</div>
          </div>

          <div class="mt-2">
            <div class="small text-muted">Recomendaciones</div>
            <div class="text-muted">${escapeHtml(d.recommendations || "—")}</div>
          </div>
        </div>
      </div>
    `;

    $.drillsList?.appendChild(card);
  }


  $.drillsList?.querySelectorAll("[data-open-external]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const url = btn.getAttribute("data-open-external");
      const title = btn.getAttribute("data-open-title") || "Vista previa";
      if (!url) return;

      openMediaViewerModal(url, { title });
    });
  });

  if (canEdit) {
    $.drillsList?.querySelectorAll("button[data-action='toggle']").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-id");
        if (!id) return;
        showLoader();
        try {
          await toggleDrillActive(id);
        } finally {
          hideLoader();
        }
      });
    });

    $.drillsList?.querySelectorAll("[data-edit-drill]").forEach(el => {
      el.addEventListener("click", async (e) => {
        const target = e.target;
        if (target?.closest("a,button")) return;

        const id = el.getAttribute("data-edit-drill");
        if (!id) return;

        await openDrillEditor(id);
      });
    });
  }
}


function drillMatches(d, term) {
  const tagLabels = Array.isArray(d.tags) ? d.tags.map(t => t.label).join(" ") : "";

  const hay = [
    d.name,
    d.authorName,
    d.objective,
    d.volume,
    d.minPlayers,
    d.restAfter,
    d.recommendations,
    tagLabels,
  ].map(norm).join(" ");

  return hay.includes(term);
}

/* =========================
   Render: Trainings (cards/list)
========================= */
function renderTrainings() {
  const term = norm($.trainingSearch?.value);
  const filtered = term
    ? trainings.filter(t => norm(t.name).includes(term))
    : trainings;

  if (!$.trainingsList) return;

  $.trainingsList.innerHTML = "";

  if (!filtered.length) {
    $.trainingsEmpty?.classList.remove("d-none");
    return;
  }
  $.trainingsEmpty?.classList.add("d-none");

  filtered.forEach(t => {
    const dateLbl = fmtDate(t.date);
    const drillCount = Array.isArray(t.drillIds) ? t.drillIds.length : (Array.isArray(t.drillRefs) ? t.drillRefs.length : 0);
    const isPublic = t.isPublic === true;

    const item = document.createElement("div");
    item.className = "list-group-item";

    const sharePath = `/training_plan.html?id=${encodeURIComponent(t.id)}`;

    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <div class="fw-semibold">${escapeHtml(t.name || "—")}</div>
          <div class="text-muted small">${escapeHtml(dateLbl)} · ${drillCount} drill(s)</div>
          <div class="text-muted small">${isPublic ? "🌐 Público" : "🔒 Privado (solo logueados)"}</div>
        </div>

        <div class="d-flex gap-2 flex-wrap">
          ${
            isPublic
              ? `<a class="btn btn-sm btn-outline-secondary" href="${sharePath}" target="_blank" rel="noopener">Ver</a>
                 <button class="btn btn-sm btn-outline-primary" data-copy="${escapeHtml(sharePath)}">Copiar link</button>`
              : `<button class="btn btn-sm btn-outline-secondary" data-view-private="${escapeHtml(t.id)}">Ver</button>`
          }
          ${
            canEdit
              ? `<button class="btn btn-sm btn-primary" data-edit="${escapeHtml(t.id)}">Editar</button>`
              : ``
          }
        </div>
      </div>
    `;

    $.trainingsList.appendChild(item);
  });

  // copiar link (solo públicos)
  $.trainingsList.querySelectorAll("[data-copy]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const path = btn.getAttribute("data-copy");
      if (!path) return;
      const url = `${window.location.origin}${path}`;
      try {
        await navigator.clipboard.writeText(url);
        const old = btn.textContent;
        btn.textContent = "Copiado ✅";
        setTimeout(() => (btn.textContent = old), 1200);
      } catch {
        alert("No pude copiar. Link:\n" + url);
      }
    });
  });

  $.trainingsList.querySelectorAll("[data-view-private]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-view-private");
      if (!id) return;
      // por ahora lo llevamos a una vista interna (simple): abre modal de edición en read-only no lo hicimos.
      // entonces abrimos la misma vista pública, que mostrará "privado" (por diseño).
      window.open(`/training_plan.html?id=${encodeURIComponent(id)}`, "_blank");
    });
  });

  // editar
  $.trainingsList.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-edit");
      if (!id) return;
      const ed = await ensureTrainingEditor();
      ed.openEditById(id);
    });
  });
}

/* =========================
   Training editor (modal)
========================= */
async function ensureTrainingEditor() {
  // asegurate de tener <div id="modalMount"></div> en el HTML
  await loadPartialOnce("/partials/training_plan_editor.html", "modalMount");
  if (!trainingEditor) trainingEditor = createTrainingEditor();
  return trainingEditor;
}

/* =========================
   Drills editor (modal)
========================= */

async function ensureCreateDrillModal() {
  await loadPartialOnce("/partials/drill_create_modal.html", "modalMount");

  // re-cache de elementos del modal (porque ahora se inyecta)
  $.drillForm = document.getElementById("drillForm");
  $.drillName = document.getElementById("drillName");
  $.drillAuthor = document.getElementById("drillAuthor");
  $.drillTacticalUrl = document.getElementById("drillTacticalUrl");
  $.drillVideoUrl = document.getElementById("drillVideoUrl");
  $.drillObjective = document.getElementById("drillObjective");
  $.drillVolume = document.getElementById("drillVolume");
  $.drillRest = document.getElementById("drillRest");
  $.drillMinPlayers = document.getElementById("drillMinPlayers");
  $.drillRecs = document.getElementById("drillRecs");
  $.drillTags = document.getElementById("drillTags");

  $.createDrillModal = document.getElementById("createDrillModal");
  $.saveCreateDrillBtn = document.getElementById("saveCreateDrillBtn");

  // bind del botón guardar UNA sola vez (evitar doble bind)
  if (!ensureCreateDrillModal._bound) {
    $.saveCreateDrillBtn?.addEventListener("click", async () => {
      if (!canEdit) return;
      showLoader();
      try {
        await createDrillFromForm();
        const modal = bootstrap.Modal.getOrCreateInstance($.createDrillModal);
        modal.hide();
      } finally {
        hideLoader();
      }
    });
    ensureCreateDrillModal._bound = true;
  }
}

/* =========================
   CRUD: Drills
========================= */
async function createDrillFromForm() {
  clearAlert();

  const name = ($.drillName?.value || "").trim();
  const authorName = ($.drillAuthor?.value || "").trim();
  const minPlayers = parsePositiveInt($.drillMinPlayers?.value);
  const tags = parseTagsInput($.drillTags?.value);

  if (!name || !authorName) {
    showAlert(S.errors?.required || "Campos requeridos.", "warning");
    return;
  }

  await addDoc(collection(db, COL_DRILLS), {
    name,
    authorName,
    tacticalBoardUrl: safeUrl($.drillTacticalUrl?.value) || "",
    teamVideoUrl: safeUrl($.drillVideoUrl?.value) || "",
    objective: ($.drillObjective?.value || "").trim(),
    volume: ($.drillVolume?.value || "").trim(),
    restAfter: ($.drillRest?.value || "").trim(),
    minPlayers: minPlayers ?? 0,
    recommendations: ($.drillRecs?.value || "").trim(),
    tags,

    isPublic: true,
    isActive: true,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  $.drillForm?.reset?.();
  showAlert(S.ok?.drillCreated || "Drill creado.", "success");
  await loadDrills();
}

async function toggleDrillActive(drillId) {
  const d = drills.find(x => x.id === drillId);
  if (!d) return;

  const next = !(d.isActive !== false);
  await updateDoc(doc(db, COL_DRILLS, drillId), {
    isActive: next,
    updatedAt: serverTimestamp(),
  });

  showAlert(next ? (S.ok?.drillReactivated || "Reactivado.") : (S.ok?.drillArchived || "Archivado."), "success");
  await loadDrills();
}

async function ensureDrillEditorModal() {
  await loadPartialOnce("/partials/drill_editor_modal.html", "modalMount");

  const modalEl = document.getElementById("drillEditorModal");
  const formEl = document.getElementById("drillEditorForm");

  // cache fields (no los guardo en $ para no mezclar con create)
  const fields = {
    modalEl,
    titleEl: document.getElementById("drillEditorTitle"),
    name: document.getElementById("deName"),
    author: document.getElementById("deAuthor"),
    tactical: document.getElementById("deTactical"),
    video: document.getElementById("deVideo"),
    objective: document.getElementById("deObjective"),
    volume: document.getElementById("deVolume"),
    rest: document.getElementById("deRest"),
    minPlayers: document.getElementById("deMinPlayers"),
    recs: document.getElementById("deRecs"),
    isPublic: document.getElementById("deIsPublic"),
    saveBtn: document.getElementById("saveDrillEditorBtn"),
    tags: document.getElementById("deTags"),
    formEl,
  };

  // bind una sola vez
  if (!ensureDrillEditorModal._bound) {
    fields.saveBtn?.addEventListener("click", async () => {
      if (!canEdit) return;
      showLoader();
      try {
        await saveDrillEdits(fields);
        const modal = bootstrap.Modal.getOrCreateInstance(fields.modalEl);
        modal.hide();
        await loadDrills(); // refresca lista
      } finally {
        hideLoader();
      }
    });
    ensureDrillEditorModal._bound = true;
  }

  return fields;
}

async function openDrillEditor(drillId) {
  const d = drills.find(x => x.id === drillId);
  if (!d) return;

  const ui = await ensureDrillEditorModal();
  drillEditor.id = drillId;

  if (ui.titleEl) ui.titleEl.textContent = "Editar drill";

  ui.name.value = d.name || "";
  ui.author.value = d.authorName || "";
  ui.tactical.value = d.tacticalBoardUrl || "";
  ui.video.value = d.teamVideoUrl || "";
  ui.objective.value = d.objective || "";
  ui.volume.value = d.volume || "";
  ui.rest.value = d.restAfter || "";
  ui.minPlayers.value = d.minPlayers || "";
  ui.recs.value = d.recommendations || "";
  ui.isPublic.checked = d.isPublic !== false;
  ui.tags.value = tagsToInputValue(d.tags);

  const modal = bootstrap.Modal.getOrCreateInstance(ui.modalEl);
  modal.show();
}

async function saveDrillEdits(ui) {
  clearAlert();
  const id = drillEditor.id;
  if (!id) return;

  const name = (ui.name.value || "").trim();
  const authorName = (ui.author.value || "").trim();
  const minPlayers = parsePositiveInt(ui.minPlayers.value);
  const tags = parseTagsInput(ui.tags.value);

  if (!name || !authorName) {
    showAlert(S.errors?.required || "Campos requeridos.", "warning");
    return;
  }

  await setDoc(doc(db, COL_DRILLS, id), {
    name,
    authorName,
    tacticalBoardUrl: safeUrl(ui.tactical.value) || "",
    teamVideoUrl: safeUrl(ui.video.value) || "",
    objective: (ui.objective.value || "").trim(),
    volume: (ui.volume.value || "").trim(),
    restAfter: (ui.rest.value || "").trim(),
    minPlayers: minPlayers ?? 0,
    recommendations: (ui.recs.value || "").trim(),
    tags,
    isPublic: ui.isPublic.checked === true,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  showAlert("Drill actualizado ✅", "success");
}


/* =========================
   Events
========================= */
function bindEvents() {
  // Drills
  $.openCreateDrillBtn?.addEventListener("click", async () => {
    if (!canEdit) return;
    clearAlert();
    await ensureCreateDrillModal();
    $.drillForm?.reset?.();
    const modal = bootstrap.Modal.getOrCreateInstance($.createDrillModal);
    modal.show();
  });

  $.drillSearch?.addEventListener("input", renderDrills);

  $.showArchivedSwitch?.addEventListener("change", async () => {
    showLoader();
    try {
      await loadDrills();
    } finally {
      hideLoader();
    }
  });

  $.refreshDrillsBtn?.addEventListener("click", async () => {
    showLoader();
    try {
      await loadDrills();
    } finally {
      hideLoader();
    }
  });

  // Trainings
  $.trainingSearch?.addEventListener("input", renderTrainings);

  $.refreshTrainingsBtn?.addEventListener("click", async () => {
    showLoader();
    try {
      await loadTrainings();
    } finally {
      hideLoader();
    }
  });

  $.openCreateTrainingBtn?.addEventListener("click", async () => {
    if (!canEdit) return;
    const ed = await ensureTrainingEditor();
    ed.openNew();
  });

  // refrescar lista cuando modal guarda
  window.addEventListener("playbookTraining:changed", async () => {
    showLoader();
    try {
      await loadTrainings();
    } finally {
      hideLoader();
    }
  });
}

/* =========================
   Utils
========================= */
function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function safeUrl(url) {
  const u = (url || "").toString().trim();
  if (!u) return "";
  // permite urls sin protocolo
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  try { return new URL(u).toString(); } catch { return ""; }
}

function toDateSafe(value) {
  if (!value) return new Date(0);
  const d = value?.toDate?.() ?? (value instanceof Date ? value : new Date(value));
  return isNaN(d) ? new Date(0) : d;
}

function fmtDate(value) {
  if (!value) return "—";
  const d = toDateSafe(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("es-CR", { year: "numeric", month: "short", day: "2-digit" });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

//usada para el min players
function parsePositiveInt(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeTagLabel(label) {
  return String(label || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tagToKey(label) {
  return normalizeTagLabel(label)
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function prettyTagLabel(label) {
  const clean = String(label || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
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

function parseTagsInput(value) {
  const parts = String(value || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  const map = new Map();

  for (const raw of parts) {
    const key = tagToKey(raw);
    if (!key) continue;

    const label = prettyTagLabel(raw);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label,
        color: colorFromString(key),
      });
    }
  }

  return Array.from(map.values());
}

function tagsToInputValue(tags) {
  if (!Array.isArray(tags)) return "";
  return tags
    .map(t => typeof t === "string" ? t : (t?.label || ""))
    .filter(Boolean)
    .join(", ");
}

function normalizeDrillTags(drill) {
  const rawTags = Array.isArray(drill?.tags) ? drill.tags : [];

  const map = new Map();

  for (const item of rawTags) {
    const rawLabel = typeof item === "string" ? item : (item?.label || item?.name || "");
    const key = item?.key || tagToKey(rawLabel);
    if (!key) continue;

    map.set(key, {
      key,
      label: prettyTagLabel(rawLabel || key.replaceAll("-", " ")),
      color: item?.color || colorFromString(key),
    });
  }

  return Array.from(map.values());
}

function buildDrillTagCatalog(items) {
  const map = new Map();

  for (const drill of items) {
    const tags = normalizeDrillTags(drill);
    for (const tag of tags) {
      if (!map.has(tag.key)) {
        map.set(tag.key, { ...tag, count: 1 });
      } else {
        map.get(tag.key).count += 1;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label, "es");
  });
}

function renderTagPills(tags = [], options = {}) {
  const { clickable = false, selectedKeys = new Set() } = options;

  return tags.map(tag => {
    const isSelected = selectedKeys.has(tag.key);
    const style = `
      --tag-color:${escapeHtml(tag.color)};
      background:${isSelected ? "var(--tag-color)" : "color-mix(in srgb, var(--tag-color) 14%, white)"};
      color:${isSelected ? "#fff" : "#222"};
      border:1px solid color-mix(in srgb, var(--tag-color) 55%, #cfcfcf);
      border-radius:999px;
      padding:.25rem .6rem;
      font-size:.75rem;
      font-weight:600;
      line-height:1;
      ${clickable ? "cursor:pointer;" : ""}
    `.replace(/\s+/g, " ").trim();

    const attrs = clickable
      ? `data-tag-filter="${escapeHtml(tag.key)}"`
      : "";

    return `
      <span class="d-inline-flex align-items-center gap-1" style="${style}" ${attrs}>
        <span>${escapeHtml(tag.label)}</span>
        ${tag.count ? `<span class="opacity-75">(${tag.count})</span>` : ""}
      </span>
    `;
  }).join("");
}
