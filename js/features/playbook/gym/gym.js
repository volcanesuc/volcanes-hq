// /js/features/playbook/gym/gym.js
import { APP_CONFIG } from "/js/config/config.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


/* =========================
   Collections
========================= */
const COL = APP_CONFIG.collections;
const COL_EXERCISES = COL.gymExercises;
const COL_ROUTINES = COL.gymRoutines;
const COL_PLANS = COL.gymPlans;

/* =========================
   State
========================= */
let $ = {};
let _ctx = {
  db: null,
  canEdit: false,
};

let exercises = [];
let routines  = [];
let plans     = [];

/* =========================
   Public API
========================= */
export async function initGymTab({ db, canEdit }) {
  _ctx = { db, canEdit };

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
  const snap = await getDocs(collection(_ctx.db, COL_EXERCISES));
  exercises = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.isActive !== false);

  exercises.sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
}

async function loadRoutines() {
  if (!_ctx.db) return;
  const snap = await getDocs(collection(_ctx.db, COL_ROUTINES));
  routines = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.isActive !== false);

  routines.sort((a, b) => toDateSafe(b.updatedAt) - toDateSafe(a.updatedAt));
}

async function loadPlans() {
  if (!_ctx.db) return;
  const snap = await getDocs(collection(_ctx.db, COL_PLANS));
  plans = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((x) => x.isActive !== false);

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

  ensureMediaModal();

  for (const ex of filtered) {
    const item = document.createElement("div");
    item.className = "list-group-item gym-exercise-row";

    const mediaUrl = safeUrl(ex.videoUrl || "");

    item.innerHTML = `
      <div class="gym-exercise-item d-flex justify-content-between align-items-center gap-2">
        <div
          class="gym-exercise-main flex-grow-1 min-w-0"
          ${_ctx.canEdit ? `data-edit-exercise="${escapeHtml(ex.id)}" style="cursor:pointer"` : ""}
        >
          <div class="fw-semibold text-truncate">${escapeHtml(ex.name || "—")}</div>
        </div>

        <div class="gym-exercise-actions d-flex align-items-center gap-2 flex-shrink-0">
          ${
            mediaUrl
              ? `<button
                  type="button"
                  class="btn btn-sm btn-outline-secondary"
                  data-open-media="${escapeHtml(mediaUrl)}"
                  data-media-title="${escapeHtml(ex.name || "Media")}"
                >
                  Ver
                </button>`
              : ``
          }

          ${
            _ctx.canEdit
              ? `<button class="btn btn-sm btn-primary" data-edit-exercise-btn="${escapeHtml(ex.id)}">Editar</button>`
              : ``
          }
        </div>
      </div>
    `;

    $.gymExercisesList.appendChild(item);
  }

  bindExerciseButtons();
  bindExerciseMediaButtons();
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


function bindExerciseMediaButtons() {
  $.gymExercisesList?.querySelectorAll("[data-open-media]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const rawUrl = btn.getAttribute("data-open-media");
      const title = btn.getAttribute("data-media-title") || "Media";

      if (!rawUrl) return;

      openMediaModal(rawUrl, title);
    });
  });
}

function ensureMediaModal() {
  if (document.getElementById("gymMediaModal")) return;

  const modal = document.createElement("div");
  modal.innerHTML = `
    <div class="modal fade" id="gymMediaModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="gymMediaModalTitle">Media</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>

          <div class="modal-body">
            <div id="gymMediaContainer"></div>
          </div>

          <div class="modal-footer justify-content-between">
            <a
              id="gymMediaOpenNewTab"
              class="btn btn-outline-secondary"
              href="#"
              target="_blank"
              rel="noopener"
            >
              Abrir en pestaña nueva
            </a>
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal.firstElementChild);

  const modalEl = document.getElementById("gymMediaModal");
  modalEl?.addEventListener("hidden.bs.modal", () => {
    const box = document.getElementById("gymMediaContainer");
    if (box) box.innerHTML = "";
  });
}

function openMediaModal(rawUrl, title = "Media") {
  ensureMediaModal();

  const cleanUrl = safeUrl(rawUrl);
  if (!cleanUrl) {
    window.open(rawUrl, "_blank", "noopener");
    return;
  }

  const titleEl = document.getElementById("gymMediaModalTitle");
  const box = document.getElementById("gymMediaContainer");
  const openNewTab = document.getElementById("gymMediaOpenNewTab");
  const modalEl = document.getElementById("gymMediaModal");

  if (!box || !modalEl) return;

  if (titleEl) titleEl.textContent = title || "Media";
  if (openNewTab) openNewTab.href = cleanUrl;

  const mediaType = detectMediaType(cleanUrl);
  box.innerHTML = renderMediaContent(mediaType, cleanUrl, title);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function detectMediaType(url) {
  const lower = url.toLowerCase();

  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|#|$)/i.test(lower)) {
    return "image";
  }

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (
      host.includes("gstatic.com") ||
      host.includes("googleusercontent.com") ||
      host.includes("imgur.com") ||
      host.includes("cloudinary.com")
    ) {
      return "image";
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host === "vimeo.com" ||
      host === "player.vimeo.com"
    ) {
      return "video";
    }
  } catch {}

  return "unknown";
}

function renderMediaContent(type, rawUrl, title = "Media") {
  if (type === "image") {
    return `
      <div class="text-center">
        <img
          src="${escapeHtml(rawUrl)}"
          alt="${escapeHtml(title)}"
          class="img-fluid rounded"
          style="max-height:75vh; width:auto;"
        />
      </div>
    `;
  }

  if (type === "video") {
    const embedUrl = toEmbeddableVideoUrl(rawUrl);

    if (embedUrl) {
      return `
        <div style="position:relative;width:100%;padding-top:56.25%;background:#000;border-radius:.5rem;overflow:hidden;">
          <iframe
            src="${escapeHtml(embedUrl)}"
            title="${escapeHtml(title)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            style="position:absolute;inset:0;width:100%;height:100%;border:0;"
          ></iframe>
        </div>
      `;
    }
  }

  return `
    <div>
      <div style="position:relative;width:100%;padding-top:56.25%;background:#f8f9fa;border-radius:.5rem;overflow:hidden;">
        <iframe
          src="${escapeHtml(rawUrl)}"
          title="${escapeHtml(title)}"
          style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;"
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
      <div class="text-muted small mt-2">
        Si no carga aquí, abrilo en pestaña nueva.
      </div>
    </div>
  `;
}

function toEmbeddableVideoUrl(url) {
  const clean = safeUrl(url);
  if (!clean) return "";

  try {
    const u = new URL(clean);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;
      if (u.pathname.startsWith("/embed/")) return clean;

      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      }
    }

    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "").trim();
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }

    if (host === "vimeo.com") {
      const id = u.pathname.replace(/\//g, "").trim();
      if (id) return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    }

    if (host === "player.vimeo.com" && u.pathname.startsWith("/video/")) {
      return clean;
    }

    if (host === "youtube-nocookie.com") {
      return clean;
    }

    return "";
  } catch {
    return "";
  }
}

function safeUrl(url) {
  const u = (url || "").toString().trim();
  if (!u) return "";

  if (!/^https?:\/\//i.test(u)) {
    try {
      return new URL(`https://${u}`).toString();
    } catch {
      return "";
    }
  }

  try {
    return new URL(u).toString();
  } catch {
    return "";
  }
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
    (p.monthKey ? `Plan de Gimnasio – ${monthKeyToLabel(p.monthKey)}` : "Plan de Gimnasio")
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