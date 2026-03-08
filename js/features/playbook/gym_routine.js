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
import { guardPage } from "/js/page-guard.js";
import { loadHeader } from "/js/components/header.js";

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
const { redirected } = await guardPage("gym_routine");
if (!redirected) {
  await boot();
}

/* =========================
   Boot
========================= */
async function boot() {
  showLoaderSafe();
  try {
    const { routine, items } = await loadRoutineResolved({ routineId });

    await loadHeader("playbook", { enabledTabs: {} });
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

  ensureRoutineMediaModal();

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

      openRoutineMediaModal(rawUrl, title);
    });
  });
}

function ensureRoutineMediaModal() {
  if (document.getElementById("routineMediaModal")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal fade" id="routineMediaModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="routineMediaModalTitle">Media</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>

          <div class="modal-body">
            <div id="routineMediaContainer"></div>
          </div>

          <div class="modal-footer justify-content-between">
            <a
              id="routineMediaOpenNewTab"
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

  document.body.appendChild(wrap.firstElementChild);

  const modalEl = document.getElementById("routineMediaModal");
  modalEl?.addEventListener("hidden.bs.modal", () => {
    const box = document.getElementById("routineMediaContainer");
    if (box) box.innerHTML = "";
  });
}

function openRoutineMediaModal(rawUrl, title = "Media") {
  ensureRoutineMediaModal();

  const cleanUrl = safeUrl(rawUrl);
  if (!cleanUrl) {
    window.open(rawUrl, "_blank", "noopener");
    return;
  }

  const titleEl = document.getElementById("routineMediaModalTitle");
  const box = document.getElementById("routineMediaContainer");
  const openNewTab = document.getElementById("routineMediaOpenNewTab");
  const modalEl = document.getElementById("routineMediaModal");

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