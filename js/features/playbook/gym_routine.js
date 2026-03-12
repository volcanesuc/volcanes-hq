// /js/features/playbook/gym_routine.js
// ✅ Viewer público para RUTINA
// ✅ URL: /gym_routine.html?id=<ROUTINE_ID>
// ✅ Lee gym_routines/{id} y resuelve exerciseItems[] con defaults de gym_exercises cuando vienen null
// ✅ Muestra en accordion los ejercicios con sets/reps/rest (o distance), notas y media in-app
// ✅ Si rutina isPublic != true => muestra "Privada"
// ✅ Botón "Ver" siempre del mismo tamaño, activo si hay media, deshabilitado si no
// ✅ Soporta imágenes, gifs, YouTube, Vimeo y fallback a iframe
//
// Requiere IDs en HTML:
// - #weekTitle
// - #weekDates
// - #weekBadge
// - #alertBox
// - #weekAccordion
// - #shareRoutineBtn
// - body.loading (opcional)

import { db } from "/js/auth/firebase.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { initPublicMinimalHeader } from "/js/components/public-minimal-header.js";
import { openMediaViewerModal } from "/js/ui/media_viewer_modal.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Params
========================= */
const params = new URLSearchParams(window.location.search);
const routineId = params.get("id");

/* =========================
   DOM
========================= */
const $ = {
  title: document.getElementById("weekTitle"),
  dates: document.getElementById("weekDates"),
  badge: document.getElementById("weekBadge"),
  alertBox: document.getElementById("alertBox"),
  acc: document.getElementById("weekAccordion"),
  shareBtn: document.getElementById("shareRoutineBtn"),
};

if (!routineId) {
  showAlert("Falta parámetro id en el link.", "warning");
  throw new Error("Missing id");
}

/* =========================
   Init
========================= */
await boot();

/* =========================
   Boot
========================= */
async function boot() {
  showLoaderSafe();
  try {
    await initPublicMinimalHeader({
      activeTab: "home",
      brandHref: "/index.html",
    });

    const { routine, items } = await loadRoutineResolved({ routineId });

    setPublicHeaderMode(routine.isPublic === true);

    $.title.textContent = routine.name || "Rutina de gimnasio";
    $.dates.textContent = routine.description || "—";

    if (routine.isPublic === true) {
      $.badge.className = "badge text-bg-success";
      $.badge.textContent = "PUBLIC";
      clearAlert();
    } else {
      $.badge.className = "badge text-bg-warning";
      $.badge.textContent = "PRIVATE";
      showAlert("Esta rutina es privada.", "warning");
    }

    wireShareButton();
    renderAccordion(items);
    injectRoutineViewStyles();
  } catch (e) {
    console.error("[gym_routine] boot error:", e);
    showAlert("Error cargando rutina. Ver consola.", "danger");
    $.acc.innerHTML = "";
  } finally {
    hideLoaderSafe();
    document.body.classList.remove("loading");
  }
}

function setPublicHeaderMode(isPublic) {
  const header = document.getElementById("app-header");
  if (!header) return;

  if (isPublic) {
    document.body.classList.add("public-view");
    header.classList.add("public-view");
  } else {
    document.body.classList.remove("public-view");
    header.classList.remove("public-view");
  }
}

/* =========================
   Data: load + resolve defaults
========================= */
function fmtToStringOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

async function loadRoutineResolved({ routineId }) {
  const rSnap = await getDoc(doc(db, "gym_routines", routineId));
  if (!rSnap.exists()) throw new Error("Rutina no existe");

  const routine = { id: rSnap.id, ...rSnap.data() };

  const rawItems = Array.isArray(routine.exerciseItems) ? routine.exerciseItems.slice() : [];
  rawItems.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

  const exSnaps = await Promise.all(
    rawItems.map((it) =>
      it?.exerciseId ? getDoc(doc(db, "gym_exercises", it.exerciseId)) : Promise.resolve(null)
    )
  );

  const items = rawItems.map((it, idx) => {
    const exSnap = exSnaps[idx];
    const ex = exSnap && exSnap.exists() ? { id: exSnap.id, ...exSnap.data() } : null;

    const pick = (overrideVal, baseVal) =>
      overrideVal === null || overrideVal === undefined ? baseVal : overrideVal;

    const pickNotes = (overrideNotes, baseNotes) => {
      const o = (overrideNotes ?? "").toString().trim();
      if (o) return o;
      return (baseNotes ?? "").toString().trim();
    };

    return {
      order: it.order ?? (idx + 1),
      exerciseId: it.exerciseId || null,

      name: ex?.name || "—",
      mediaUrl: ex?.mediaUrl || ex?.videoUrl || "",
      bodyParts: Array.isArray(ex?.bodyParts) ? ex.bodyParts : [],

      seriesType: pick(it.seriesType, ex?.seriesType ?? "reps"),
      sets: pick(it.sets, ex?.sets ?? null),
      reps: fmtToStringOrNull(pick(it.reps, ex?.reps ?? null)),
      restSec: pick(it.restSec, ex?.restSec ?? null),
      distance: pick(it.distance, ex?.distance ?? null),
      distanceUnit: pick(it.distanceUnit, ex?.distanceUnit ?? null),

      notes: pickNotes(it.notes, ex?.notes),

      _exerciseMissing: !ex,
    };
  });

  return { routine, items };
}

/* =========================
   Share
========================= */
function wireShareButton() {
  if (!$.shareBtn) return;

  $.shareBtn.addEventListener("click", async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title || "Rutina",
          text: $.title?.textContent || "Rutina",
          url,
        });
        return;
      } catch {
        // cancelado por usuario
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toastShare("Link copiado ✅");
    } catch {
      toastShare("No pude copiar el link.", true);
    }
  });
}

function toastShare(msg, isError = false) {
  if (!$.shareBtn) return;
  const old = $.shareBtn.textContent;
  $.shareBtn.textContent = msg;
  $.shareBtn.classList.toggle("btn-outline-primary", !isError);
  $.shareBtn.classList.toggle("btn-outline-danger", isError);
  setTimeout(() => {
    $.shareBtn.textContent = old;
    $.shareBtn.classList.add("btn-outline-primary");
    $.shareBtn.classList.remove("btn-outline-danger");
  }, 1200);
}

/* =========================
   Render
========================= */
function renderAccordion(items) {
  if (!$.acc) return;
  $.acc.innerHTML = "";

  if (!items.length) {
    $.acc.innerHTML = `
      <div class="text-muted small">
        No hay ejercicios en esta rutina.
      </div>
    `;
    return;
  }

  items.forEach((it, idx) => {
    const id = `ex_${idx}_${safeId(it.exerciseId || idx)}`;
    const title = `${it.order}. ${it.name || "—"}`;
    const seriesLine = fmtSeriesLine(it);
    const hasMedia = !!safeUrl(it.mediaUrl || "");

    const mediaBtn = `
      <button
        class="btn btn-sm routine-media-btn ${hasMedia ? "btn-outline-primary" : "btn-outline-secondary"}"
        type="button"
        ${hasMedia ? `data-open-media="${escapeHtml(it.mediaUrl)}" data-media-title="${escapeHtml(it.name || "Media")}"` : "disabled"}
      >
        Ver
      </button>
    `;

    const missing = it._exerciseMissing
      ? `<span class="badge text-bg-warning ms-2">Ejercicio no existe</span>`
      : "";

    const bodyPartsHtml = it.bodyParts?.length
      ? it.bodyParts.map((t) => `<span class="badge text-bg-light me-1 mb-1">${escapeHtml(t)}</span>`).join("")
      : `<span class="text-muted small">—</span>`;

    const notesHtml = it.notes
      ? `<div class="small">${escapeHtml(it.notes)}</div>`
      : `<div class="text-muted small">—</div>`;

    const itemEl = document.createElement("div");
    itemEl.className = "accordion-item";

    itemEl.innerHTML = `
      <h2 class="accordion-header d-flex align-items-stretch gap-2" id="${id}_h">
        <button
          class="accordion-button collapsed flex-grow-1"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#${id}_c"
          aria-expanded="false"
          aria-controls="${id}_c"
        >
          <div class="w-100">
            <div class="fw-semibold">${escapeHtml(title)}${missing}</div>
            <div class="text-muted small mt-1">${escapeHtml(seriesLine)}</div>
          </div>
        </button>

        <div class="d-flex align-items-center pe-2">
          ${mediaBtn}
        </div>
      </h2>

      <div
        id="${id}_c"
        class="accordion-collapse collapse"
        aria-labelledby="${id}_h"
        data-bs-parent="#weekAccordion"
      >
        <div class="accordion-body">
          <div class="mb-2">
            <div class="small text-muted mb-1">Partes del cuerpo</div>
            <div>${bodyPartsHtml}</div>
          </div>

          <div>
            <div class="small text-muted mb-1">Notas</div>
            ${notesHtml}
          </div>
        </div>
      </div>
    `;

    $.acc.appendChild(itemEl);
  });

  bindRoutineMediaButtons();
}

function fmtSeriesLine(it) {
  const st = (it.seriesType || "reps").toString();
  const parts = [];

  if (st === "distance") {
    const dist = it.distance ?? "—";
    const unit = it.distanceUnit ?? "";
    parts.push(`Distancia: ${dist} ${unit}`.trim());
  } else {
    parts.push(`Sets: ${it.sets ?? "—"}`);
    parts.push(`Reps: ${it.reps ?? "—"}`);
  }

  if (it.restSec !== null && it.restSec !== undefined) {
    parts.push(`Descanso: ${it.restSec}s`);
  }

  return parts.join(" · ");
}

/* =========================
   Media modal
========================= */
function bindRoutineMediaButtons() {
  $.acc?.querySelectorAll("[data-open-media]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const rawUrl = btn.getAttribute("data-open-media");
      const title = btn.getAttribute("data-media-title") || "Media";
      if (!rawUrl) return;

      openMediaViewerModal(rawUrl, { title });
    });
  });
}

/* =========================
   Alerts / Loader
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

function showLoaderSafe() {
  try { showLoader(); } catch {}
}

function hideLoaderSafe() {
  try { hideLoader(); } catch {}
}

/* =========================
   Styles
========================= */
function injectRoutineViewStyles() {
  if (document.getElementById("gymRoutineInjectedStyles")) return;

  const style = document.createElement("style");
  style.id = "gymRoutineInjectedStyles";
  style.textContent = `
    .routine-media-btn {
      width: 88px;
      text-align: center;
      white-space: nowrap;
    }

    @media (max-width: 767.98px) {
      .routine-media-btn {
        width: 72px;
      }
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   Utils
========================= */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeId(x) {
  return String(x ?? "").replaceAll(/[^a-zA-Z0-9_-]/g, "_");
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