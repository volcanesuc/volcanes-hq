// /js/features/playbook/gym/gym.js
// Gym tab (Playbook): lista ejercicios / rutinas / planes (antes "weeks")
// Emite eventos gymUI:* para que gym_editors.js abra y guarde en modales.

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Collections
========================= */
const COL_EXERCISES = "gym_exercises";
const COL_ROUTINES  = "gym_routines";
const COL_PLANS     = "gym_weeks";

/* =========================
   State
========================= */
let $ = {};
let _ctx = {
  db: null,
  clubId: "volcanes",
  canEdit: false,
};

let exercises = [];
let routines  = [];
let plans     = [];

/* =========================
   Public API
========================= */
export async function initGymTab({ db, clubId, canEdit }) {
  _ctx = { db, clubId, canEdit };

  cacheDom();
  bindEvents();
  toggleAdminButtons(canEdit);

  await refreshAll();
}

// Se usa también en gym_routine.html / gym_plan.html si querés reutilizarlo
export async function loadRoutineResolved({ db, routineId }) {
  const rSnap = await getDoc(doc(db, COL_ROUTINES, routineId));
  if (!rSnap.exists()) throw new Error("Rutina no existe");

  const routine = { id: rSnap.id, ...rSnap.data() };

  const items = Array.isArray(routine.exerciseItems) ? routine.exerciseItems.slice() : [];
  items.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

  const exerciseSnaps = await Promise.all(
    items.map((it) =>
      it?.exerciseId ? getDoc(doc(db, COL_EXERCISES, it.exerciseId)) : Promise.resolve(null)
    )
  );

  const resolvedItems = items.map((it, idx) => {
    const exSnap = exerciseSnaps[idx];
    const ex = exSnap && exSnap.exists() ? { id: exSnap.id, ...exSnap.data() } : null;

    const pick = (overrideVal, baseVal) =>
      overrideVal === null || overrideVal === undefined ? baseVal : overrideVal;

    const pickNotes = (overrideNotes, baseNotes) => {
      const o = (overrideNotes ?? "").toString().trim();
      if (o) return o;
      return (baseNotes ?? "").toString().trim();
    };

    return {
      order: it.order ?? idx + 1,
      exerciseId: it.exerciseId || null,

      name: ex?.name || "—",
      videoUrl: ex?.videoUrl || "",
      bodyParts: Array.isArray(ex?.bodyParts) ? ex.bodyParts : [],

      seriesType: pick(it.seriesType, ex?.seriesType ?? "reps"),
      sets: pick(it.sets, ex?.sets ?? null),
      reps: toStringOrNull(pick(it.reps, ex?.reps ?? null)),
      restSec: pick(it.restSec, ex?.restSec ?? null),
      distance: pick(it.distance, ex?.distance ?? null),
      distanceUnit: pick(it.distanceUnit, ex?.distanceUnit ?? null),

      notes: pickNotes(it.notes, ex?.notes),
      _exerciseMissing: !ex,
    };
  });

  return { routine, resolvedItems };
}

/* =========================
   DOM
========================= */
function cacheDom() {
  $ = {
    refreshGymBtn: document.getElementById("refreshGymBtn"),

    // Exercises
    gymExerciseSearch: document.getElementById("gymExerciseSearch"),
    gymExercisesList:  document.getElementById("gymExercisesList"),
    gymExercisesEmpty: document.getElementById("gymExercisesEmpty"),

    // Routines
    gymRoutineSearch:  document.getElementById("gymRoutineSearch"),
    gymRoutinesList:   document.getElementById("gymRoutinesList"),
    gymRoutinesEmpty:  document.getElementById("gymRoutinesEmpty"),

    // Plans (antes weeks)
    gymPlanSearch:  document.getElementById("gymWeekSearch") || document.getElementById("gymPlanSearch"),
    gymPlansList:   document.getElementById("gymWeeksList")  || document.getElementById("gymPlansList"),
    gymPlansEmpty:  document.getElementById("gymWeeksEmpty") || document.getElementById("gymPlansEmpty"),

    // Admin CTAs
    openCreateGymExerciseBtn: document.getElementById("openCreateGymExerciseBtn"),
    openCreateGymRoutineBtn:  document.getElementById("openCreateGymRoutineBtn"),
    openCreateGymPlanBtn:     document.getElementById("openCreateGymWeekBtn") || document.getElementById("openCreateGymPlanBtn"),
  };
}

function toggleAdminButtons(canEdit) {
  const toggle = (el, on) => el?.classList[on ? "remove" : "add"]("d-none");
  toggle($.openCreateGymExerciseBtn, canEdit);
  toggle($.openCreateGymRoutineBtn,  canEdit);
  toggle($.openCreateGymPlanBtn,     canEdit);
}

/* =========================
   Events
========================= */
function bindEvents() {
  $.refreshGymBtn?.addEventListener("click", refreshAll);

  $.gymExerciseSearch?.addEventListener("input", renderExercises);
  $.gymRoutineSearch?.addEventListener("input", renderRoutines);
  $.gymPlanSearch?.addEventListener("input", renderPlans);

  window.addEventListener("gym:changed", refreshAll);
  window.addEventListener("gym:routinesChanged", loadRoutinesAndRender);
  window.addEventListener("gym:exercisesChanged", loadExercisesAndRender);
  window.addEventListener("gym:weeksChanged", loadPlansAndRender); // compat con tus eventos existentes
  window.addEventListener("gym:plansChanged", loadPlansAndRender);

  $.openCreateGymExerciseBtn?.addEventListener("click", () => {
    if (!_ctx.canEdit) return;
    cleanupExerciseModalState();
    emitGymUI("gymUI:exercise:new");
  });

  $.openCreateGymRoutineBtn?.addEventListener("click", () => {
    if (!_ctx.canEdit) return;
    cleanupRoutineModalState();
    emitGymUI("gymUI:routine:new");
  });

  $.openCreateGymPlanBtn?.addEventListener("click", () => {
    if (!_ctx.canEdit) return;
    cleanupPlanModalState();
    // mantenemos el evento original (week) para no romper tu editor existente
    emitGymUI("gymUI:week:new");
  });
}

function emitGymUI(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
  console.log("[gym] emitted:", name, detail || "");
}

/* =========================
   Modal cleanup
========================= */
function cleanupExerciseModalState() {
  const modalEl =
    document.getElementById("gymExerciseModal") ||
    document.getElementById("gymExerciseEditorModal") ||
    document.getElementById("editGymExerciseModal");

  modalEl?.removeAttribute("data-edit-id");
  modalEl?.removeAttribute("data-mode");

  const formEl =
    document.getElementById("gymExerciseForm") ||
    document.getElementById("gymExerciseEditorForm");

  formEl?.reset?.();

  const ids = ["geName", "geSets", "geReps", "geRest", "geNotes", "geVideoUrl", "geDistance", "geDistanceUnit"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  });
}

function cleanupRoutineModalState() {
  const modalEl = document.getElementById("gymRoutineModal") || document.getElementById("gymRoutineEditorModal");
  modalEl?.removeAttribute("data-edit-id");
  modalEl?.removeAttribute("data-mode");

  const formEl = document.getElementById("gymRoutineForm") || document.getElementById("gymRoutineEditorForm");
  formEl?.reset?.();
}

function cleanupPlanModalState() {
  const modalEl = document.getElementById("gymWeekModal") || document.getElementById("gymWeekEditorModal") || document.getElementById("gymPlanModal");
  modalEl?.removeAttribute("data-edit-id");
  modalEl?.removeAttribute("data-mode");

  const formEl = document.getElementById("gymWeekForm") || document.getElementById("gymWeekEditorForm") || document.getElementById("gymPlanForm");
  formEl?.reset?.();
}

/* =========================
   Load
========================= */
async function refreshAll() {
  await Promise.all([loadExercises(), loadRoutines(), loadPlans()]);
  renderExercises();
  renderRoutines();
  renderPlans();
}

async function loadExercises() {
  if (!_ctx.db) return;
  const qy = query(collection(_ctx.db, COL_EXERCISES), where("clubId", "==", _ctx.clubId));
  const snap = await getDocs(qy);
  exercises = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.isActive !== false);
  exercises.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

async function loadRoutines() {
  if (!_ctx.db) return;
  const qy = query(collection(_ctx.db, COL_ROUTINES), where("clubId", "==", _ctx.clubId));
  const snap = await getDocs(qy);
  routines = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.isActive !== false);
  routines.sort((a, b) => toDateSafe(b.updatedAt) - toDateSafe(a.updatedAt));
}

async function loadPlans() {
  if (!_ctx.db) return;
  const qy = query(collection(_ctx.db, COL_PLANS), where("clubId", "==", _ctx.clubId));
  const snap = await getDocs(qy);
  plans = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.isActive !== false);

  // Orden: más reciente primero (por monthKey si existe, si no updatedAt)
  plans.sort((a, b) => {
    const ak = String(a.monthKey || "");
    const bk = String(b.monthKey || "");
    if (ak && bk && ak !== bk) return bk.localeCompare(ak);
    return toDateSafe(b.updatedAt) - toDateSafe(a.updatedAt);
  });
}

async function loadExercisesAndRender() { await loadExercises(); renderExercises(); }
async function loadRoutinesAndRender()  { await loadRoutines();  renderRoutines(); }
async function loadPlansAndRender()     { await loadPlans();     renderPlans(); }

/* =========================
   Render: Exercises
========================= */
function renderExercises() {
  if (!$.gymExercisesList) return;

  const term = norm($.gymExerciseSearch?.value);
  const filtered = term ? exercises.filter((e) => norm(e.name).includes(term)) : exercises;

  $.gymExercisesList.innerHTML = "";

  if (!filtered.length) {
    $.gymExercisesEmpty?.classList.remove("d-none");
    return;
  }
  $.gymExercisesEmpty?.classList.add("d-none");

  for (const ex of filtered) {
    const item = document.createElement("div");
    item.className = "list-group-item";

    item.innerHTML = `
      <div class="d-flex justify-content-between gap-2 flex-wrap">
        <div ${_ctx.canEdit ? `data-edit-exercise="${escapeHtml(ex.id)}" style="cursor:pointer"` : ""}>
          <div class="fw-semibold">${escapeHtml(ex.name || "—")}</div>
          <div class="text-muted small">${fmtExerciseDefaults(ex)}</div>
          ${ex.notes ? `<div class="small mt-1">${escapeHtml(ex.notes)}</div>` : ``}
        </div>

        <div class="d-flex gap-2 align-items-start flex-wrap">
          ${ex.videoUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(ex.videoUrl)}" target="_blank" rel="noopener">Video</a>` : ``}
          ${_ctx.canEdit ? `<button class="btn btn-sm btn-primary" data-edit-exercise-btn="${escapeHtml(ex.id)}">Editar</button>` : ``}
        </div>
      </div>
    `;

    $.gymExercisesList.appendChild(item);
  }

  bindExerciseButtons();
}

function bindExerciseButtons() {
  if (!_ctx.canEdit) return;

  $.gymExercisesList?.querySelectorAll("[data-edit-exercise-btn]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-edit-exercise-btn");
      if (!id) return;
      emitGymUI("gymUI:exercise:edit", { id });
    });
  });

  $.gymExercisesList?.querySelectorAll("[data-edit-exercise]").forEach((row) => {
    row.addEventListener("click", (e) => {
      const target = e.target;
      if (target?.closest("a,button")) return;

      const id = row.getAttribute("data-edit-exercise");
      if (!id) return;
      emitGymUI("gymUI:exercise:edit", { id });
    });
  });
}

function fmtExerciseDefaults(ex) {
  const st = (ex.seriesType || "reps").toString();
  const parts = [];

  if (st === "distance") {
    parts.push(`Distancia: ${escapeHtml(ex.distance ?? "—")} ${escapeHtml(ex.distanceUnit ?? "")}`.trim());
  } else {
    parts.push(`Sets: ${escapeHtml(ex.sets ?? "—")}`);
    parts.push(`Reps: ${escapeHtml(fmtMaybeText(ex.reps))}`);
  }

  if (ex.restSec !== null && ex.restSec !== undefined) {
    parts.push(`Descanso: ${escapeHtml(ex.restSec)}s`);
  }

  return parts.join(" · ");
}

function fmtMaybeText(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s ? s : "—";
}

function toStringOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/* =========================
   Render: Routines + Share
========================= */
function renderRoutines() {
  if (!$.gymRoutinesList) return;

  const term = norm($.gymRoutineSearch?.value);
  const filtered = term ? routines.filter((r) => norm(r.name).includes(term)) : routines;

  $.gymRoutinesList.innerHTML = "";

  if (!filtered.length) {
    $.gymRoutinesEmpty?.classList.remove("d-none");
    return;
  }
  $.gymRoutinesEmpty?.classList.add("d-none");

  for (const r of filtered) {
    const isPublic = r.isPublic === true;

    const row = document.createElement("div");
    row.className = "list-group-item";

    row.innerHTML = `
      <div class="d-flex justify-content-between gap-2 flex-wrap">
        <div>
          <div class="fw-semibold">${escapeHtml(r.name || "—")}</div>
          <div class="text-muted small">${isPublic ? "🌐 Pública" : "🔒 Privada"}</div>
          ${r.description ? `<div class="small mt-1">${escapeHtml(r.description)}</div>` : ``}
        </div>

        <div class="d-flex gap-2 flex-wrap">
          ${
            isPublic
              ? `
                <a class="btn btn-sm btn-outline-secondary" href="${routineSharePath(r.id)}" target="_blank" rel="noopener">Ver</a>
                <button class="btn btn-sm btn-outline-primary" data-copy-routine="${escapeHtml(r.id)}">Copiar link</button>
              `
              : `
                ${_ctx.canEdit ? `<button class="btn btn-sm btn-outline-primary" data-make-routine-public="${escapeHtml(r.id)}">Hacer pública</button>` : ``}
              `
          }

          <button class="btn btn-sm btn-outline-secondary" data-preview-routine="${escapeHtml(r.id)}">Preview</button>
          ${_ctx.canEdit ? `<button class="btn btn-sm btn-primary" data-edit-routine="${escapeHtml(r.id)}">Editar</button>` : ``}
        </div>
      </div>

      <div class="mt-2 d-none" id="routinePreview_${escapeHtml(r.id)}"></div>
    `;

    $.gymRoutinesList.appendChild(row);
  }

  bindRoutineButtons();
}

function bindRoutineButtons() {
  $.gymRoutinesList?.querySelectorAll("[data-copy-routine]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-copy-routine");
      if (!id) return;
      try {
        await copyRoutineLink(id);
        const old = btn.textContent;
        btn.textContent = "Copiado ✅";
        setTimeout(() => (btn.textContent = old), 1200);
      } catch (e) {
        console.error(e);
        alert("No pude copiar el link.");
      }
    });
  });

  $.gymRoutinesList?.querySelectorAll("[data-make-routine-public]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-make-routine-public");
      if (!id) return;
      if (!_ctx.canEdit) return;

      btn.disabled = true;
      try {
        await updateDoc(doc(_ctx.db, COL_ROUTINES, id), {
          isPublic: true,
          updatedAt: serverTimestamp(),
        });
        await loadRoutinesAndRender();
      } catch (e) {
        console.error(e);
        alert("Error haciendo la rutina pública.");
      } finally {
        btn.disabled = false;
      }
    });
  });

  $.gymRoutinesList?.querySelectorAll("[data-preview-routine]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-preview-routine");
      if (!id) return;

      const box = document.getElementById(`routinePreview_${id}`);
      if (!box) return;

      const isHidden = box.classList.contains("d-none");
      if (!isHidden) {
        box.classList.add("d-none");
        box.innerHTML = "";
        return;
      }

      try {
        box.classList.remove("d-none");
        box.innerHTML = `<div class="text-muted small">Cargando preview…</div>`;

        const { routine, resolvedItems } = await loadRoutineResolved({ db: _ctx.db, routineId: id });
        box.innerHTML = renderRoutinePreview(routine, resolvedItems);
      } catch (e) {
        console.error(e);
        box.innerHTML = `<div class="text-danger small">Error cargando preview.</div>`;
      }
    });
  });

  $.gymRoutinesList?.querySelectorAll("[data-edit-routine]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit-routine");
      if (!id) return;
      if (!_ctx.canEdit) return;
      emitGymUI("gymUI:routine:edit", { id });
    });
  });
}

function renderRoutinePreview(_routine, items) {
  const rows = items
    .map(
      (it) => `
    <div class="border rounded p-2 mb-2">
      <div class="fw-semibold">${escapeHtml(it.order)}. ${escapeHtml(it.name)}</div>
      <div class="text-muted small">${escapeHtml(fmtItemSeries(it))}</div>
      ${it.notes ? `<div class="small mt-1">${escapeHtml(it.notes)}</div>` : ``}
      ${it.videoUrl ? `<a class="small" href="${escapeHtml(it.videoUrl)}" target="_blank" rel="noopener">Video</a>` : ``}
    </div>
  `
    )
    .join("");

  return `<div class="mt-2">${rows || `<div class="text-muted small">Sin ejercicios.</div>`}</div>`;
}

function fmtItemSeries(it) {
  const parts = [];
  const st = (it.seriesType || "reps").toString();

  if (st === "distance") {
    parts.push(`Distancia: ${it.distance ?? "—"} ${it.distanceUnit ?? ""}`.trim());
  } else {
    parts.push(`Sets: ${it.sets ?? "—"}`);
    parts.push(`Reps: ${fmtMaybeText(it.reps)}`);
  }

  if (it.restSec !== null && it.restSec !== undefined) {
    parts.push(`Descanso: ${it.restSec}s`);
  }

  return parts.join(" · ");
}

/* =========================
   Render: Plans (antes Weeks)
========================= */
function renderPlans() {
  if (!$.gymPlansList) return;

  const term = norm($.gymPlanSearch?.value);
  const filtered = term ? plans.filter((p) => norm(planTitle(p)).includes(term)) : plans;

  $.gymPlansList.innerHTML = "";

  if (!filtered.length) {
    $.gymPlansEmpty?.classList.remove("d-none");
    return;
  }
  $.gymPlansEmpty?.classList.add("d-none");

  for (const p of filtered) {
    const isPublic = p.isPublic === true;

    const item = document.createElement("div");
    item.className = "list-group-item";

    item.innerHTML = `
      <div class="d-flex justify-content-between gap-2 flex-wrap">
        <div>
          <div class="fw-semibold">${escapeHtml(planTitle(p))}</div>
          <div class="text-muted small">
            ${isPublic ? "🌐 Público" : "🔒 Privado"}
            ${p.monthKey ? ` · ${escapeHtml(p.monthKey)}` : ``}
          </div>
          ${p.description ? `<div class="small mt-1">${escapeHtml(p.description)}</div>` : ``}
        </div>

        <div class="d-flex gap-2 flex-wrap">
          ${
            isPublic
              ? `
                <a class="btn btn-sm btn-outline-secondary" href="${planSharePath(p.id)}" target="_blank" rel="noopener">Ver</a>
                <button class="btn btn-sm btn-outline-primary" data-copy-plan="${escapeHtml(p.id)}">Copiar link</button>
              `
              : `
                ${_ctx.canEdit ? `<button class="btn btn-sm btn-outline-primary" data-make-plan-public="${escapeHtml(p.id)}">Hacer público</button>` : ``}
              `
          }
          ${_ctx.canEdit ? `<button class="btn btn-sm btn-primary" data-edit-plan="${escapeHtml(p.id)}">Editar</button>` : ``}
        </div>
      </div>
    `;

    $.gymPlansList.appendChild(item);
  }

  bindPlanButtons();
}

function bindPlanButtons() {
  $.gymPlansList?.querySelectorAll("[data-copy-plan]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-copy-plan");
      if (!id) return;
      try {
        await copyPlanLink(id);
        const old = btn.textContent;
        btn.textContent = "Copiado ✅";
        setTimeout(() => (btn.textContent = old), 1200);
      } catch (e) {
        console.error(e);
        alert("No pude copiar el link del plan.");
      }
    });
  });

  $.gymPlansList?.querySelectorAll("[data-make-plan-public]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-make-plan-public");
      if (!id) return;
      if (!_ctx.canEdit) return;

      btn.disabled = true;
      try {
        await updateDoc(doc(_ctx.db, COL_PLANS, id), {
          isPublic: true,
          updatedAt: serverTimestamp(),
        });
        await loadPlansAndRender();
      } catch (e) {
        console.error(e);
        alert("Error haciendo el plan público.");
      } finally {
        btn.disabled = false;
      }
    });
  });

  $.gymPlansList?.querySelectorAll("[data-edit-plan]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit-plan");
      if (!id) return;
      if (!_ctx.canEdit) return;
      // mantenemos evento week:edit para no romper tu editor existente
      emitGymUI("gymUI:week:edit", { id });
    });
  });
}

function planTitle(p) {
  // title explícito, si no, name, si no, monthKey
  return (
    (p.title || "").trim() ||
    (p.name || "").trim() ||
    (p.monthKey ? `Plan de gimnasio – ${monthKeyToLabel(p.monthKey)}` : "Plan de gimnasio")
  );
}

function monthKeyToLabel(monthKey) {
  // "YYYY-MM" -> "Mes YYYY-MM" (simple, sin depender de locale)
  // Si querés nombres de meses en español, lo hago luego con un map.
  return `Mes ${monthKey}`;
}

/* =========================
   Share helpers
========================= */
function routineSharePath(id) {
  return `/gym_routine.html?id=${encodeURIComponent(id)}`;
}
function planSharePath(id) {
  return `/gym_plan.html?id=${encodeURIComponent(id)}`;
}

async function copyRoutineLink(routineId) {
  const url = `${window.location.origin}${routineSharePath(routineId)}`;
  await navigator.clipboard.writeText(url);
  return url;
}
async function copyPlanLink(planId) {
  const url = `${window.location.origin}${planSharePath(planId)}`;
  await navigator.clipboard.writeText(url);
  return url;
}

/* =========================
   Utils
========================= */
function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}
function toDateSafe(v) {
  const d = v?.toDate?.() ?? (v instanceof Date ? v : new Date(v || 0));
  return isNaN(d) ? new Date(0) : d;
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}