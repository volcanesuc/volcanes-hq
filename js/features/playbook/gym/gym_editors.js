/* =========================================================
   /js/features/playbook/gym/gym_editors.js
   ✅ Crea/edita: Ejercicios, Rutinas, Plan mensual (colección gym_weeks)
   ✅ Escucha eventos emitidos por gym.js:
      - gymUI:exercise:new / gymUI:exercise:edit {id}
      - gymUI:routine:new  / gymUI:routine:edit  {id}
      - gymUI:week:new    / gymUI:week:edit    {id}   (week UI = Plan)

   ✅ Modales:
      - Exercise + Routine: inyecta si no existen
      - Plan (week): carga partial /partials/gym_week_editor.html si no existe en DOM

   ✅ Guarda en Firestore:
      - gym_exercises
      - gym_routines
      - gym_weeks  (plan mensual con slots)

   ✅ Emite refresh:
      - gym:exercisesChanged
      - gym:routinesChanged
      - gym:weeksChanged

   Requisitos:
   - Bootstrap bundle cargado (Modal en window.bootstrap)
   - loadPartialOnce disponible en /js/ui/loadPartial.js
========================================================= */

import {
  collection,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { loadPartialOnce } from "/js/ui/loadPartial.js";

/* =========================
   Collections
========================= */
const COL_EXERCISES = "gym_exercises";
const COL_ROUTINES  = "gym_routines";
const COL_WEEKS     = "gym_weeks"; // (UI: Plan mensual)

/* =========================
   Partials
========================= */
const PARTIAL_WEEK_EDITOR = "/partials/gym_week_editor.html";

/* =========================
   State
========================= */
let _ctx = {
  db: null,
  clubId: "pujaguas",
  canEdit: false,
  modalMountId: "modalMount",
};

let $ = {};
let _exercisesCache = []; // para armar rutinas
let _routinesCache = [];  // para armar planes

// Plan editor state
let _planSlots = []; // [{order,label,routineId}]

/* =========================
   Public API
========================= */
export async function initGymEditors({ db, clubId, canEdit, modalMountId }) {
  _ctx = { db, clubId, canEdit, modalMountId: modalMountId || "modalMount" };

  ensureModalMount();
  await ensureAllModals();     // <- week se carga por partial si hace falta
  cacheDom();
  bindUIEvents();

  // precarga data para selects
  await Promise.all([refreshExercisesCache(), refreshRoutinesCache()]);
}

/* =========================
   Modal Mount
========================= */
function ensureModalMount() {
  let mount = document.getElementById(_ctx.modalMountId);
  if (!mount) {
    mount = document.createElement("div");
    mount.id = _ctx.modalMountId;
    document.body.appendChild(mount);
  }
}

async function ensureAllModals() {
  ensureExerciseModal();
  ensureRoutineModal();
  await ensureWeekModalFromPartial();
}

/* =========================
   Inject Modals (Exercise/Routine)
========================= */
function ensureExerciseModal() {
  if (document.getElementById("gymExerciseModal")) return;

  document.getElementById(_ctx.modalMountId).insertAdjacentHTML("beforeend", `
  <div class="modal fade" id="gymExerciseModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="gymExerciseModalTitle">Ejercicio</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>

        <form id="gymExerciseForm">
          <div class="modal-body">
            <div class="alert d-none" id="gymExerciseAlert" role="alert"></div>

            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">Nombre</label>
                <input class="form-control" id="geName" required maxlength="120" />
              </div>

              <div class="col-12">
                <label class="form-label">Partes del cuerpo (separadas por coma)</label>
                <input class="form-control" id="geBodyParts" placeholder="Espalda, dorsales, bíceps" />
              </div>

              <div class="col-12 col-md-4">
                <label class="form-label">Tipo</label>
                <select class="form-select" id="geSeriesType">
                  <option value="reps" selected>Reps</option>
                  <option value="distance">Distancia</option>
                </select>
              </div>

              <div class="col-12 col-md-4">
                <label class="form-label">Sets</label>
                <input class="form-control" id="geSets" type="number" min="1" step="1" placeholder="4" />
              </div>

              <div class="col-12 col-md-4" id="geRepsWrap">
                <label class="form-label">Reps</label>
                <input class="form-control" id="geReps" placeholder="6-10" />
              </div>

              <div class="col-12 col-md-6 d-none" id="geDistanceWrap">
                <label class="form-label">Distancia</label>
                <input class="form-control" id="geDistance" type="number" min="0" step="0.01" placeholder="2" />
              </div>
              <div class="col-12 col-md-6 d-none" id="geDistanceUnitWrap">
                <label class="form-label">Unidad</label>
                <input class="form-control" id="geDistanceUnit" placeholder="km / m" />
              </div>

              <div class="col-12 col-md-4">
                <label class="form-label">Descanso (seg)</label>
                <input class="form-control" id="geRest" type="number" min="0" step="1" placeholder="60" />
              </div>

              <div class="col-12 col-md-8">
                <label class="form-label">Video URL</label>
                <input class="form-control" id="geVideoUrl" placeholder="https://..." />
              </div>

              <div class="col-12">
                <label class="form-label">Notas</label>
                <textarea class="form-control" id="geNotes" rows="3" placeholder="Cues, técnica, etc."></textarea>
              </div>

              <div class="col-12 form-check">
                <input class="form-check-input" type="checkbox" id="geIsActive" checked />
                <label class="form-check-label" for="geIsActive">Activo</label>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="geSaveBtn">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  `);
}

function ensureRoutineModal() {
  if (document.getElementById("gymRoutineModal")) return;

  document.getElementById(_ctx.modalMountId).insertAdjacentHTML("beforeend", `
  <div class="modal fade" id="gymRoutineModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="gymRoutineModalTitle">Rutina</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>

        <form id="gymRoutineForm">
          <div class="modal-body">
            <div class="alert d-none" id="gymRoutineAlert" role="alert"></div>

            <div class="row g-3">
              <div class="col-12 col-lg-6">
                <label class="form-label">Nombre</label>
                <input class="form-control" id="grName" required maxlength="140" />
              </div>
              <div class="col-12 col-lg-6">
                <label class="form-label">Descripción</label>
                <input class="form-control" id="grDescription" maxlength="200" />
              </div>

              <div class="col-12 d-flex gap-3 flex-wrap">
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="grIsPublic" />
                  <label class="form-check-label" for="grIsPublic">Pública</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" id="grIsActive" checked />
                  <label class="form-check-label" for="grIsActive">Activa</label>
                </div>
              </div>

              <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <div class="fw-semibold">Ejercicios de la rutina</div>
                  <button class="btn btn-sm btn-outline-primary" type="button" id="grAddItemBtn">+ Agregar ejercicio</button>
                </div>

                <div class="border rounded p-2">
                  <div class="text-muted small mb-2">
                    Seleccioná ejercicio y opcionalmente override de sets/reps/descanso/notas.
                    Si dejás vacío, usa defaults del ejercicio.
                  </div>

                  <div id="grItems"></div>

                  <div class="text-muted small mt-2">
                    Tip: reordená con “↑ ↓”.
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="grSaveBtn">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  `);
}

/* =========================
   Week/Plan modal via partial
========================= */
async function ensureWeekModalFromPartial() {
  // si ya está en DOM (porque lo incluís en HTML), no hacemos nada
  if (document.getElementById("gymWeekModal")) return;

  // si no, lo cargamos como partial en modalMount
  await loadPartialOnce(PARTIAL_WEEK_EDITOR, _ctx.modalMountId);
}

/* =========================
   Cache DOM
========================= */
function cacheDom() {
  $ = {
    // Exercise
    exModal: document.getElementById("gymExerciseModal"),
    exForm: document.getElementById("gymExerciseForm"),
    exAlert: document.getElementById("gymExerciseAlert"),
    geName: document.getElementById("geName"),
    geBodyParts: document.getElementById("geBodyParts"),
    geSeriesType: document.getElementById("geSeriesType"),
    geSets: document.getElementById("geSets"),
    geReps: document.getElementById("geReps"),
    geRest: document.getElementById("geRest"),
    geNotes: document.getElementById("geNotes"),
    geVideoUrl: document.getElementById("geVideoUrl"),
    geDistance: document.getElementById("geDistance"),
    geDistanceUnit: document.getElementById("geDistanceUnit"),
    geIsActive: document.getElementById("geIsActive"),
    geRepsWrap: document.getElementById("geRepsWrap"),
    geDistanceWrap: document.getElementById("geDistanceWrap"),
    geDistanceUnitWrap: document.getElementById("geDistanceUnitWrap"),

    // Routine
    rtModal: document.getElementById("gymRoutineModal"),
    rtForm: document.getElementById("gymRoutineForm"),
    rtAlert: document.getElementById("gymRoutineAlert"),
    grName: document.getElementById("grName"),
    grDescription: document.getElementById("grDescription"),
    grIsPublic: document.getElementById("grIsPublic"),
    grIsActive: document.getElementById("grIsActive"),
    grItems: document.getElementById("grItems"),
    grAddItemBtn: document.getElementById("grAddItemBtn"),

    // Plan (week) from partial
    wkModal: document.getElementById("gymWeekModal"),
    wkAlert: document.getElementById("gymWeekAlert"),
    wkTitle: document.getElementById("gymWeekModalTitle"),

    gwName: document.getElementById("gwName"),
    gwMonth: document.getElementById("gwMonth"),
    gwStartDate: document.getElementById("gwStartDate"),
    gwEndDate: document.getElementById("gwEndDate"),
    gwIsPublic: document.getElementById("gwIsPublic"),

    gwSlotLabel: document.getElementById("gwSlotLabel"),
    gwSlotRoutineSelect: document.getElementById("gwSlotRoutineSelect"),
    gwAddSlotBtn: document.getElementById("gwAddSlotBtn"),
    gwSlotsTbody: document.getElementById("gwSlotsTbody"),
    wkSaveBtn: document.getElementById("saveGymWeekBtn"),
  };

  // seriesType toggle
  $?.geSeriesType?.addEventListener("change", syncExerciseTypeUI);
  syncExerciseTypeUI();
}

/* =========================
   Bind window events from gym.js
========================= */
function bindUIEvents() {
  // Exercise events
  window.addEventListener("gymUI:exercise:new", () => openExerciseModal({ mode: "new" }));
  window.addEventListener("gymUI:exercise:edit", (ev) => openExerciseModal({ mode: "edit", id: ev?.detail?.id }));

  // Routine events
  window.addEventListener("gymUI:routine:new", () => openRoutineModal({ mode: "new" }));
  window.addEventListener("gymUI:routine:edit", (ev) => openRoutineModal({ mode: "edit", id: ev?.detail?.id }));

  // Plan (week) events
  window.addEventListener("gymUI:week:new", () => openWeekModal({ mode: "new" }));
  window.addEventListener("gymUI:week:edit", (ev) => openWeekModal({ mode: "edit", id: ev?.detail?.id }));

  // Form submits
  $?.exForm?.addEventListener("submit", onSaveExercise);
  $?.rtForm?.addEventListener("submit", onSaveRoutine);

  // Add routine item
  $?.grAddItemBtn?.addEventListener("click", () => addRoutineItemRow());

  // Plan buttons (del partial)
  rebindClick($?.gwAddSlotBtn, onAddPlanSlot);
  rebindClick($?.wkSaveBtn, onSaveWeekPlan);
}

/* =========================
   Auth + Permissions
========================= */
function requireEdit() {
  if (!_ctx.canEdit) throw new Error("No tenés permisos para editar.");
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error("Tenés que iniciar sesión para guardar.");
  return uid;
}

/* =========================
   EXERCISE: Open / Fill / Save
========================= */
function openExerciseModal({ mode, id }) {
  clearAlert($?.exAlert);
  resetExerciseForm();

  $?.exModal?.setAttribute("data-mode", mode);
  if (mode === "edit" && id) $?.exModal?.setAttribute("data-edit-id", id);
  else $?.exModal?.removeAttribute("data-edit-id");

  const titleEl = document.getElementById("gymExerciseModalTitle");
  if (titleEl) titleEl.textContent = mode === "edit" ? "Editar ejercicio" : "Crear ejercicio";

  if (mode === "edit" && id) {
    loadExerciseToForm(id).then(() => showModal($?.exModal));
  } else {
    showModal($?.exModal);
  }
}

async function loadExerciseToForm(id) {
  const snap = await getDoc(doc(_ctx.db, COL_EXERCISES, id));
  if (!snap.exists()) throw new Error("Ejercicio no existe");

  const ex = snap.data() || {};
  if ($?.geName) $.geName.value = ex.name || "";
  if ($?.geBodyParts) $.geBodyParts.value = Array.isArray(ex.bodyParts) ? ex.bodyParts.join(", ") : "";
  if ($?.geSeriesType) $.geSeriesType.value = (ex.seriesType || "reps").toString();
  if ($?.geSets) $.geSets.value = ex.sets ?? "";
  if ($?.geReps) $.geReps.value = ex.reps ?? "";
  if ($?.geRest) $.geRest.value = ex.restSec ?? "";
  if ($?.geNotes) $.geNotes.value = ex.notes || "";
  if ($?.geVideoUrl) $.geVideoUrl.value = ex.videoUrl || "";
  if ($?.geDistance) $.geDistance.value = ex.distance ?? "";
  if ($?.geDistanceUnit) $.geDistanceUnit.value = ex.distanceUnit ?? "";
  if ($?.geIsActive) $.geIsActive.checked = ex.isActive !== false;

  syncExerciseTypeUI();
}

function resetExerciseForm() {
  $?.exForm?.reset?.();
  if ($?.geSeriesType) $.geSeriesType.value = "reps";
  if ($?.geIsActive) $.geIsActive.checked = true;
  syncExerciseTypeUI();
}

function syncExerciseTypeUI() {
  const st = ($?.geSeriesType?.value || "reps").toString();
  const isDistance = st === "distance";

  $?.geRepsWrap?.classList.toggle("d-none", isDistance);
  $?.geDistanceWrap?.classList.toggle("d-none", !isDistance);
  $?.geDistanceUnitWrap?.classList.toggle("d-none", !isDistance);
}

async function onSaveExercise(ev) {
  ev.preventDefault();

  try {
    const uid = requireEdit();
    clearAlert($?.exAlert);

    const mode = $?.exModal?.getAttribute("data-mode") || "new";
    const editId = $?.exModal?.getAttribute("data-edit-id") || null;

    const payload = readExercisePayload();

    if (!payload.name) {
      showAlert($?.exAlert, "El nombre es requerido.", "warning");
      return;
    }

    if (mode === "edit" && editId) {
      await updateDoc(doc(_ctx.db, COL_EXERCISES, editId), {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } else {
      await addDoc(collection(_ctx.db, COL_EXERCISES), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    }

    hideModal($?.exModal);

    await refreshExercisesCache();
    window.dispatchEvent(new Event("gym:exercisesChanged"));
  } catch (e) {
    console.error("SAVE EXERCISE ERROR:", e);
    showAlert($?.exAlert, e?.message || "Error guardando ejercicio.", "danger");
  }
}

function readExercisePayload() {
  const name = trim($?.geName?.value);
  const bodyParts = parseCSV($?.geBodyParts?.value);

  const seriesType = ($?.geSeriesType?.value || "reps").toString();
  const sets = toNumberOrNull($?.geSets?.value);
  const restSec = toNumberOrNull($?.geRest?.value);

  const reps = seriesType === "reps" ? toStringOrNull($?.geReps?.value) : null;
  const distance = seriesType === "distance" ? toNumberOrNull($?.geDistance?.value) : null;
  const distanceUnit = seriesType === "distance" ? toStringOrNull($?.geDistanceUnit?.value) : null;

  const notes = toStringOrNull($?.geNotes?.value);
  const videoUrl = toStringOrNull($?.geVideoUrl?.value);

  const isActive = !!$?.geIsActive?.checked;

  return {
    clubId: _ctx.clubId,
    name,
    bodyParts,
    seriesType,
    sets,
    reps,
    restSec,
    distance,
    distanceUnit,
    notes,
    videoUrl,
    isActive,
  };
}

/* =========================
   ROUTINE: Open / Fill / Save
========================= */
async function openRoutineModal({ mode, id }) {
  clearAlert($?.rtAlert);
  resetRoutineForm();

  await refreshExercisesCache();

  $?.rtModal?.setAttribute("data-mode", mode);
  if (mode === "edit" && id) $?.rtModal?.setAttribute("data-edit-id", id);
  else $?.rtModal?.removeAttribute("data-edit-id");

  const titleEl = document.getElementById("gymRoutineModalTitle");
  if (titleEl) titleEl.textContent = mode === "edit" ? "Editar rutina" : "Crear rutina";

  if (mode === "edit" && id) {
    await loadRoutineToForm(id);
  } else {
    addRoutineItemRow();
  }

  showModal($?.rtModal);
}

function resetRoutineForm() {
  $?.rtForm?.reset?.();
  if ($?.grIsActive) $.grIsActive.checked = true;
  if ($?.grIsPublic) $.grIsPublic.checked = false;
  if ($?.grItems) $.grItems.innerHTML = "";
}

async function loadRoutineToForm(id) {
  const snap = await getDoc(doc(_ctx.db, COL_ROUTINES, id));
  if (!snap.exists()) throw new Error("Rutina no existe");
  const r = snap.data() || {};

  if ($?.grName) $.grName.value = r.name || "";
  if ($?.grDescription) $.grDescription.value = r.description || "";
  if ($?.grIsPublic) $.grIsPublic.checked = r.isPublic === true;
  if ($?.grIsActive) $.grIsActive.checked = r.isActive !== false;

  if ($?.grItems) $.grItems.innerHTML = "";

  const items = Array.isArray(r.exerciseItems) ? r.exerciseItems.slice() : [];
  items.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

  if (!items.length) addRoutineItemRow();
  items.forEach((it) => addRoutineItemRow(it));
}

function addRoutineItemRow(existing) {
  if (!$?.grItems) return;

  const order = existing?.order ?? ($.grItems.children.length + 1);
  const rowId = `ri_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const exerciseOptions = _exercisesCache
    .map(ex => `<option value="${escapeHtml(ex.id)}">${escapeHtml(ex.name || "—")}</option>`)
    .join("");

  const html = `
    <div class="border rounded p-2 mb-2" data-ri-row="${rowId}">
      <div class="d-flex justify-content-between align-items-center gap-2 mb-2 flex-wrap">
        <div class="fw-semibold">#<span data-ri-order>${order}</span></div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-ri-up>↑</button>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-ri-down>↓</button>
          <button class="btn btn-sm btn-outline-danger" type="button" data-ri-del>Quitar</button>
        </div>
      </div>

      <div class="row g-2">
        <div class="col-12 col-lg-5">
          <label class="form-label small text-muted mb-1">Ejercicio</label>
          <select class="form-select form-select-sm" data-ri-ex required>
            <option value="">— Seleccioná —</option>
            ${exerciseOptions}
          </select>
        </div>

        <div class="col-6 col-lg-2">
          <label class="form-label small text-muted mb-1">Sets</label>
          <input class="form-control form-control-sm" data-ri-sets type="number" min="1" step="1" placeholder="(default)">
        </div>

        <div class="col-6 col-lg-2">
          <label class="form-label small text-muted mb-1">Reps</label>
          <input class="form-control form-control-sm" data-ri-reps placeholder="(default)">
        </div>

        <div class="col-6 col-lg-3">
          <label class="form-label small text-muted mb-1">Descanso (s)</label>
          <input class="form-control form-control-sm" data-ri-rest type="number" min="0" step="1" placeholder="(default)">
        </div>

        <div class="col-12">
          <label class="form-label small text-muted mb-1">Notas (override)</label>
          <input class="form-control form-control-sm" data-ri-notes placeholder="(default)">
        </div>
      </div>
    </div>
  `;

  $.grItems.insertAdjacentHTML("beforeend", html);

  const row = $.grItems.querySelector(`[data-ri-row="${rowId}"]`);
  if (!row) return;

  const exSelect = row.querySelector("[data-ri-ex]");
  const setsEl   = row.querySelector("[data-ri-sets]");
  const repsEl   = row.querySelector("[data-ri-reps]");
  const restEl   = row.querySelector("[data-ri-rest]");
  const notesEl  = row.querySelector("[data-ri-notes]");

  function applyExerciseDefaults(exerciseId, { force = false } = {}) {
    const ex = _exercisesCache.find(x => x.id === exerciseId);
    if (!ex) return;

    // Solo llenamos si está vacío, a menos que force=true
    if (setsEl && (force || !trim(setsEl.value))) {
      setsEl.value = ex.sets ?? "";
      setsEl.placeholder = ex.sets ? String(ex.sets) : "(default)";
    }

    if (repsEl && (force || !trim(repsEl.value))) {
      repsEl.value = ex.reps ?? "";
      repsEl.placeholder = ex.reps ? String(ex.reps) : "(default)";
    }

    if (restEl && (force || !trim(restEl.value))) {
      restEl.value = ex.restSec ?? "";
      restEl.placeholder = (ex.restSec !== null && ex.restSec !== undefined)
        ? String(ex.restSec)
        : "(default)";
    }

    if (notesEl && (force || !trim(notesEl.value))) {
      notesEl.value = ex.notes ?? "";
      notesEl.placeholder = ex.notes ? String(ex.notes) : "(default)";
    }
  }

  // Cuando cambia el ejercicio, aplicamos defaults (sin pisar overrides)
  exSelect?.addEventListener("change", () => {
    applyExerciseDefaults(exSelect.value, { force: false });
  });

    if (existing?.exerciseId) {
    exSelect.value = existing.exerciseId;

    // 1) primero defaults del ejercicio
    applyExerciseDefaults(existing.exerciseId, { force: true });

    // 2) luego overrides guardados (si existen)
    if (existing?.sets !== null && existing?.sets !== undefined) setsEl.value = existing.sets;
    if (existing?.reps !== null && existing?.reps !== undefined) repsEl.value = String(existing.reps);
    if (existing?.restSec !== null && existing?.restSec !== undefined) restEl.value = existing.restSec;
    if (existing?.notes) notesEl.value = existing.notes;
  }

  row.querySelector("[data-ri-del]").addEventListener("click", () => {
    row.remove();
    renumberRoutineItems();
  });

  row.querySelector("[data-ri-up]").addEventListener("click", () => {
    const prev = row.previousElementSibling;
    if (prev) row.parentElement.insertBefore(row, prev);
    renumberRoutineItems();
  });

  row.querySelector("[data-ri-down]").addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) row.parentElement.insertBefore(next, row);
    renumberRoutineItems();
  });

  renumberRoutineItems();
}

function renumberRoutineItems() {
  if (!$?.grItems) return;
  [...$.grItems.children].forEach((el, idx) => {
    const span = el.querySelector("[data-ri-order]");
    if (span) span.textContent = String(idx + 1);
  });
}

async function onSaveRoutine(ev) {
  ev.preventDefault();

  try {
    const uid = requireEdit();
    clearAlert($?.rtAlert);

    const mode = $?.rtModal?.getAttribute("data-mode") || "new";
    const editId = $?.rtModal?.getAttribute("data-edit-id") || null;

    const payload = readRoutinePayload();

    if (!payload.name) {
      showAlert($?.rtAlert, "El nombre es requerido.", "warning");
      return;
    }
    if (!payload.exerciseItems.length) {
      showAlert($?.rtAlert, "Agregá al menos 1 ejercicio.", "warning");
      return;
    }

    if (mode === "edit" && editId) {
      await updateDoc(doc(_ctx.db, COL_ROUTINES, editId), {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } else {
      await addDoc(collection(_ctx.db, COL_ROUTINES), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    }

    hideModal($?.rtModal);

    await refreshRoutinesCache();
    window.dispatchEvent(new Event("gym:routinesChanged"));
  } catch (e) {
    console.error("SAVE ROUTINE ERROR:", e);
    showAlert($?.rtAlert, e?.message || "Error guardando rutina.", "danger");
  }
}

function readRoutinePayload() {
  const name = trim($?.grName?.value);
  const description = toStringOrNull($?.grDescription?.value);
  const isPublic = !!$?.grIsPublic?.checked;
  const isActive = !!$?.grIsActive?.checked;

  const exerciseItems = readRoutineItemsFromUI();

  return { clubId: _ctx.clubId, name, description, isPublic, isActive, exerciseItems };
}

function readRoutineItemsFromUI() {
  if (!$?.grItems) return [];
  const rows = [...$.grItems.querySelectorAll("[data-ri-row]")];

  return rows
    .map((row, idx) => {
      const exerciseId = row.querySelector("[data-ri-ex]")?.value || null;
      const sets = toNumberOrNull(row.querySelector("[data-ri-sets]")?.value);
      const reps = toStringOrNull(row.querySelector("[data-ri-reps]")?.value);
      const restSec = toNumberOrNull(row.querySelector("[data-ri-rest]")?.value);
      const notes = toStringOrNull(row.querySelector("[data-ri-notes]")?.value);

      if (!exerciseId) return null;

      return {
        order: idx + 1,
        exerciseId,
        seriesType: null,
        sets: sets ?? null,
        reps: reps ?? null,
        restSec: restSec ?? null,
        distance: null,
        distanceUnit: null,
        notes: notes ?? null,
      };
    })
    .filter(Boolean);
}

/* =========================
   PLAN (Week): Open / Fill / Save (slots)
========================= */
async function openWeekModal({ mode, id }) {
  clearAlert($?.wkAlert);
  await refreshRoutinesCache();
  fillPlanRoutineSelect();

  // reset editor
  _planSlots = [];
  if ($?.gwSlotLabel) $.gwSlotLabel.value = "";
  if ($?.gwName) $.gwName.value = "";
  if ($?.gwMonth) $.gwMonth.value = "";
  if ($?.gwStartDate) $.gwStartDate.value = "";
  if ($?.gwEndDate) $.gwEndDate.value = "";
  if ($?.gwIsPublic) $.gwIsPublic.checked = true;

  renderPlanSlots();

  $?.wkModal?.setAttribute("data-mode", mode);
  if (mode === "edit" && id) $?.wkModal?.setAttribute("data-edit-id", id);
  else $?.wkModal?.removeAttribute("data-edit-id");

  if ($?.wkTitle) $.wkTitle.textContent = mode === "edit" ? "Editar plan" : "Crear plan";

  if (mode === "edit" && id) {
    await loadPlanToForm(id);
  }

  showModal($?.wkModal);
}

function fillPlanRoutineSelect() {
  if (!$?.gwSlotRoutineSelect) return;

  $.gwSlotRoutineSelect.innerHTML = _routinesCache
    .map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name || "—")}</option>`)
    .join("");

  if (!_routinesCache.length) {
    $.gwSlotRoutineSelect.innerHTML = `<option value="">(No hay rutinas)</option>`;
  }
}

async function loadPlanToForm(id) {
  const snap = await getDoc(doc(_ctx.db, COL_WEEKS, id));
  if (!snap.exists()) throw new Error("Plan no existe");
  const p = snap.data() || {};

  if ($?.gwName) $.gwName.value = p.title || p.name || "";
  if ($?.gwMonth) $.gwMonth.value = p.monthKey || "";
  if ($?.gwIsPublic) $.gwIsPublic.checked = p.isPublic === true;

  if ($?.gwStartDate) $.gwStartDate.value = p.startDate || "";
  if ($?.gwEndDate) $.gwEndDate.value = p.endDate || "";

  _planSlots = Array.isArray(p.slots) ? p.slots.slice() : [];
  _planSlots.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  normalizePlanSlotOrders();
  renderPlanSlots();
}

function onAddPlanSlot() {
  const label = trim($?.gwSlotLabel?.value);
  const routineId = trim($?.gwSlotRoutineSelect?.value);

  if (!label) return showAlert($?.wkAlert, "Poné una etiqueta (ej: Lunes AM).", "warning");
  if (!routineId) return showAlert($?.wkAlert, "Elegí una rutina.", "warning");

  _planSlots.push({ order: _planSlots.length + 1, label, routineId });
  if ($?.gwSlotLabel) $.gwSlotLabel.value = "";
  normalizePlanSlotOrders();
  renderPlanSlots();
}

function renderPlanSlots() {
  const tbody = $?.gwSlotsTbody;
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!_planSlots.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted small">Sin slots todavía.</td></tr>`;
    return;
  }

  for (const s of _planSlots) {
    const routine = _routinesCache.find(r => r.id === s.routineId);
    const routineName = routine?.name || "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.order)}</td>
      <td>${escapeHtml(s.label || "—")}</td>
      <td>${escapeHtml(routineName)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary" type="button" data-ps-up="${escapeHtml(s.order)}">↑</button>
        <button class="btn btn-sm btn-outline-secondary" type="button" data-ps-down="${escapeHtml(s.order)}">↓</button>
        <button class="btn btn-sm btn-outline-danger" type="button" data-ps-del="${escapeHtml(s.order)}">Quitar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-ps-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = Number(btn.getAttribute("data-ps-del"));
      _planSlots = _planSlots.filter(s => Number(s.order) !== order);
      normalizePlanSlotOrders();
      renderPlanSlots();
    });
  });

  tbody.querySelectorAll("[data-ps-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = Number(btn.getAttribute("data-ps-up"));
      movePlanSlot(order, -1);
      renderPlanSlots();
    });
  });

  tbody.querySelectorAll("[data-ps-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = Number(btn.getAttribute("data-ps-down"));
      movePlanSlot(order, +1);
      renderPlanSlots();
    });
  });
}

function movePlanSlot(order, dir) {
  const i = _planSlots.findIndex(s => Number(s.order) === order);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= _planSlots.length) return;

  const a = _planSlots[i];
  const b = _planSlots[j];
  const tmp = a.order;
  a.order = b.order;
  b.order = tmp;

  _planSlots.sort((x, y) => Number(x.order) - Number(y.order));
}

function normalizePlanSlotOrders() {
  _planSlots.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  _planSlots.forEach((s, idx) => (s.order = idx + 1));
}

async function onSaveWeekPlan() {
  try {
    const uid = requireEdit();
    clearAlert($?.wkAlert);

    const mode = $?.wkModal?.getAttribute("data-mode") || "new";
    const editId = $?.wkModal?.getAttribute("data-edit-id") || null;

    const monthKey = trim($?.gwMonth?.value); // YYYY-MM
    if (!monthKey) {
      showAlert($?.wkAlert, "Elegí el mes del plan.", "warning");
      return;
    }

    const titleInput = trim($?.gwName?.value);
    const title = titleInput || autoPlanTitle(monthKey);

    const isPublic = !!$?.gwIsPublic?.checked;

    const startDate = toStringOrNull($?.gwStartDate?.value);
    const endDate = toStringOrNull($?.gwEndDate?.value);

    if (!_planSlots.length) {
      showAlert($?.wkAlert, "Agregá al menos 1 slot (ej: Lunes AM).", "warning");
      return;
    }

    const routineIds = Array.from(new Set(_planSlots.map(s => s.routineId).filter(Boolean)));

    const payload = {
      clubId: _ctx.clubId,
      monthKey,
      title,
      name: title, // compat
      isPublic,
      isActive: true,

      startDate,
      endDate,

      slots: _planSlots.map(s => ({
        order: Number(s.order || 0),
        label: s.label || "",
        routineId: s.routineId || "",
      })),

      routineIds,

      updatedAt: serverTimestamp(),
      updatedBy: uid,
    };

    if (mode === "edit" && editId) {
      await updateDoc(doc(_ctx.db, COL_WEEKS, editId), payload);
    } else {
      await addDoc(collection(_ctx.db, COL_WEEKS), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: uid,
      });
    }

    hideModal($?.wkModal);
    await refreshRoutinesCache();
    window.dispatchEvent(new Event("gym:weeksChanged"));
  } catch (e) {
    console.error("SAVE PLAN ERROR:", e);
    showAlert($?.wkAlert, e?.message || "Error guardando plan.", "danger");
  }
}

function autoPlanTitle(monthKey) {
  const [y, m] = (monthKey || "").split("-");
  const months = {
    "01":"Enero","02":"Febrero","03":"Marzo","04":"Abril","05":"Mayo","06":"Junio",
    "07":"Julio","08":"Agosto","09":"Septiembre","10":"Octubre","11":"Noviembre","12":"Diciembre"
  };
  const mm = months[m] || `Mes ${m || ""}`.trim();
  return `Plan de gimnasio – ${mm} ${y || ""}`.trim();
}

/* =========================
   Cache for selectors
========================= */
async function refreshExercisesCache() {
  if (!_ctx.db) return;
  const qy = query(collection(_ctx.db, COL_EXERCISES), where("clubId", "==", _ctx.clubId));
  const snap = await getDocs(qy);
  _exercisesCache = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.isActive !== false);
  _exercisesCache.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

async function refreshRoutinesCache() {
  if (!_ctx.db) return;
  const qy = query(collection(_ctx.db, COL_ROUTINES), where("clubId", "==", _ctx.clubId));
  const snap = await getDocs(qy);
  _routinesCache = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.isActive !== false);
  _routinesCache.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

/* =========================
   Bootstrap modal helpers
========================= */
function showModal(el) {
  if (!el) return;
  const m = window.bootstrap?.Modal?.getOrCreateInstance(el, { backdrop: "static" });
  m?.show();
}
function hideModal(el) {
  if (!el) return;
  const m = window.bootstrap?.Modal?.getInstance(el) || window.bootstrap?.Modal?.getOrCreateInstance(el);
  m?.hide();
}

/* =========================
   Alerts
========================= */
function showAlert(el, msg, type = "info") {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove("d-none");
}
function clearAlert(el) {
  if (!el) return;
  el.classList.add("d-none");
  el.textContent = "";
}

/* =========================
   Utils
========================= */
function rebindClick(el, handler) {
  if (!el) return;
  const clone = el.cloneNode(true);
  el.replaceWith(clone);
  // update reference in $ if possible (best effort)
  handler && clone.addEventListener("click", handler);
  // NOTE: cacheDom() was called earlier; we won't chase references.
  // For our usage it's OK because we only need the new button to have the handler.
}

function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}
function trim(v) {
  return (v || "").toString().trim();
}
function toStringOrNull(v) {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
}
function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseCSV(v) {
  const s = (v || "").toString().trim();
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}