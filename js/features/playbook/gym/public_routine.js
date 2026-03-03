c
// ✅ Vista pública de una rutina (gym_routines)
// ✅ Si routine.exerciseItems trae nulls, usa defaults del ejercicio (gym_exercises)
// ✅ Si rutina no es pública -> muestra aviso
//
// URL esperada:
//   /gym_routine.html?id=<ROUTINE_ID>
//
// Requiere en HTML:
//   <main id="root" class="container py-4">Cargando…</main>
//
// NOTA:
// - Esto asume que tus reglas de Firestore permiten leer:
//   - gym_routines cuando isPublic == true
//   - gym_exercises (o al menos los ejercicios referenciados)
// - Si NO querés hacer gym_exercises público, decime y lo ajusto para usar "snapshot" embebido en la rutina.

import { db } from "/js/auth/firebase.js";

import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const root = document.getElementById("root");

const params = new URLSearchParams(window.location.search);
const routineId = params.get("id");

if (!routineId) {
  root.innerHTML = `
    <div class="alert alert-warning">
      Falta parámetro <b>id</b> en el link.
    </div>
  `;
  throw new Error("Missing id");
}

try {
  const { routine, resolvedItems } = await loadRoutineResolved({ db, routineId });

  if (routine.isPublic !== true) {
    root.innerHTML = `
      <div class="alert alert-warning">
        Esta rutina es privada.
      </div>
    `;
  } else {
    root.innerHTML = renderRoutine(routine, resolvedItems);
    bindCopyButton(routineId);
  }
} catch (e) {
  console.error("[public_routine] error:", e);
  root.innerHTML = `
    <div class="alert alert-danger">
      Error cargando rutina.
    </div>
  `;
}

/* =========================
   Resolver: routine.exerciseItems + defaults from gym_exercises
========================= */
async function loadRoutineResolved({ db, routineId }) {
  const rSnap = await getDoc(doc(db, "gym_routines", routineId));
  if (!rSnap.exists()) throw new Error("Rutina no existe");

  const routine = { id: rSnap.id, ...rSnap.data() };

  const items = Array.isArray(routine.exerciseItems) ? routine.exerciseItems.slice() : [];
  items.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

  // traer ejercicios por id (Promise.all)
  const exerciseSnaps = await Promise.all(
    items.map(it => it?.exerciseId ? getDoc(doc(db, "gym_exercises", it.exerciseId)) : Promise.resolve(null))
  );

  const resolvedItems = items.map((it, idx) => {
    const exSnap = exerciseSnaps[idx];
    const ex = exSnap && exSnap.exists() ? { id: exSnap.id, ...exSnap.data() } : null;

    const pick = (overrideVal, baseVal) =>
      (overrideVal === null || overrideVal === undefined) ? baseVal : overrideVal;

    const pickNotes = (overrideNotes, baseNotes) => {
      const o = (overrideNotes ?? "").toString().trim();
      if (o) return o;
      return (baseNotes ?? "").toString().trim();
    };

    return {
      order: it.order ?? (idx + 1),
      exerciseId: it.exerciseId || null,

      // display
      name: ex?.name || "—",
      videoUrl: ex?.videoUrl || "",
      bodyParts: Array.isArray(ex?.bodyParts) ? ex.bodyParts : [],

      // series fields: si item trae null -> defaults del exercise
      seriesType: pick(it.seriesType, ex?.seriesType ?? "reps"),
      sets: pick(it.sets, ex?.sets ?? null),
      reps: pick(it.reps, ex?.reps ?? null),
      restSec: pick(it.restSec, ex?.restSec ?? null),
      distance: pick(it.distance, ex?.distance ?? null),
      distanceUnit: pick(it.distanceUnit, ex?.distanceUnit ?? null),

      // notes: si item.notes == "" usa ex.notes
      notes: pickNotes(it.notes, ex?.notes),

      _exerciseMissing: !ex,
      _rawExercise: ex,
    };
  });

  return { routine, resolvedItems };
}

/* =========================
   Render
========================= */
function renderRoutine(r, items) {
  const shareUrl = `${window.location.origin}/gym_routine.html?id=${encodeURIComponent(r.id)}`;

  return `
    <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3">
      <div>
        <h1 class="h4 mb-1">${escapeHtml(r.name || "Rutina")}</h1>
        ${r.description ? `<div class="text-muted">${escapeHtml(r.description)}</div>` : `<div class="text-muted">—</div>`}
      </div>

      <div class="d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm" id="copyLinkBtn">Copiar link</button>
      </div>
    </div>

    <div class="text-muted small mb-3">
      Link: <span class="font-monospace">${escapeHtml(shareUrl)}</span>
    </div>

    <div class="list-group">
      ${
        items.length
          ? items.map(it => renderExerciseItem(it)).join("")
          : `<div class="list-group-item"><span class="text-muted">Sin ejercicios.</span></div>`
      }
    </div>

    <div class="text-muted small mt-3">
      *Si la rutina guarda sets/reps/rest en <code>null</code>, se usan los defaults del ejercicio.
    </div>
  `;
}

function renderExerciseItem(it) {
  const tags = it.bodyParts?.length
    ? it.bodyParts.map(t => `<span class="badge text-bg-light me-1">${escapeHtml(t)}</span>`).join("")
    : "";

  const seriesLine = fmtSeriesLine(it);

  return `
    <div class="list-group-item">
      <div class="d-flex justify-content-between gap-2 flex-wrap">
        <div style="min-width:260px;">
          <div class="fw-semibold">
            ${escapeHtml(it.order)}. ${escapeHtml(it.name)}
            ${
              it._exerciseMissing
                ? `<span class="badge text-bg-warning ms-2">Ejercicio no existe</span>`
                : ``
            }
          </div>

          ${tags ? `<div class="mt-1">${tags}</div>` : ``}

          <div class="text-muted small mt-1">${escapeHtml(seriesLine)}</div>

          ${it.notes ? `<div class="small mt-2">${escapeHtml(it.notes)}</div>` : ``}
        </div>

        <div class="d-flex gap-2 align-items-start">
          ${it.videoUrl ? `<a class="btn btn-outline-secondary btn-sm" href="${escapeHtml(it.videoUrl)}" target="_blank" rel="noopener">Video</a>` : ``}
        </div>
      </div>
    </div>
  `;
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
   Actions
========================= */
function bindCopyButton(routineId) {
  const btn = document.getElementById("copyLinkBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const url = `${window.location.origin}/gym_routine.html?id=${encodeURIComponent(routineId)}`;
    try {
      await navigator.clipboard.writeText(url);
      const old = btn.textContent;
      btn.textContent = "Copiado ✅";
      setTimeout(() => (btn.textContent = old), 1200);
    } catch (e) {
      alert("No pude copiar el link.\n" + url);
    }
  });
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