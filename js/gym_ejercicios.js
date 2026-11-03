// js/gym_ejercicios.js
// Entrenar › Gimnasio › Ejercicios: todos los ejercicios con filtros por músculo y equipo.
// Quien edita el playbook puede crear/editar ejercicios e importar el catálogo base.
import { auth, db } from "./auth/firebase.js";
import { APP_CONFIG } from "./config/config.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import { initGymEditors } from "./features/playbook/gym/gym_editors.js";
import {
  EQUIPMENT,
  EXERCISE_CATALOG,
  MUSCLES,
  exerciseKey,
  muscleLabel,
} from "./features/gym/exercise_catalog.js";
import { escapeHtml, loadExercises, norm, safeUrl } from "./features/gym/gym_data.js";
import { collection, doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX, txf } from "/js/strings/screens/gimnasio.js";

const COL_EXERCISES = APP_CONFIG.collections.gymExercises;
const $ = (id) => document.getElementById(id);

const state = {
  canEdit: false,
  exercises: [],
  muscle: "all",
};

/* =========================
   Render
========================= */
function matchesMuscle(ex, muscle) {
  if (muscle === "all") return true;
  if (muscle === "none") return !ex.muscles.length;
  return ex.muscles.includes(muscle);
}

function baseList() {
  const term = norm($("exSearch").value);
  const equipment = $("exEquipment").value;
  return state.exercises.filter((ex) => {
    if (equipment && (ex.equipment || "") !== equipment) return false;
    if (term && !norm(`${ex.name} ${ex.muscles.map(muscleLabel).join(" ")}`).includes(term)) return false;
    return true;
  });
}

function renderChips(base) {
  const chips = [
    { id: "all", label: TX.todos },
    ...MUSCLES.map((m) => ({ id: m.id, label: m.label })),
    { id: "none", label: TX.sinMusculo },
  ];
  $("exMuscles").innerHTML = chips
    .map((c) => ({ ...c, n: base.filter((ex) => matchesMuscle(ex, c.id)).length }))
    .filter((c) => c.id === "all" || c.id === state.muscle || c.n > 0)
    .map((c) => `<button type="button" class="ui-chip ${c.id === state.muscle ? "is-active" : ""}" data-muscle="${c.id}">
      ${escapeHtml(c.label)} <span class="ui-chip__n">${c.n}</span></button>`)
    .join("");
}

function card(ex) {
  const video = safeUrl(ex.videoUrl);
  const primary = ex.primaryMuscle && ex.muscles.includes(ex.primaryMuscle) ? ex.primaryMuscle : ex.muscles[0];
  return `
    <article class="gx-card">
      <div class="gx-card__top">
        <h3 class="gx-card__name">${escapeHtml(ex.name || "—")}</h3>
        ${state.canEdit ? `<button type="button" class="btn btn-sm btn-outline-secondary gx-edit" data-edit-exercise="${escapeHtml(ex.id)}" title="${escapeHtml(TX.editar)}"><i class="bi bi-pencil"></i></button>` : ""}
      </div>
      ${ex.muscles.length
        ? `<div class="gx-tags">${ex.muscles.map((m) => `<span class="${m === primary ? "is-primary" : ""}">${escapeHtml(muscleLabel(m))}</span>`).join("")}</div>`
        : ""}
      <div class="gx-card__foot">
        <span class="gx-card__equip">${escapeHtml(EQUIPMENT[ex.equipment] || "")}</span>
        ${video ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(video)}" target="_blank" rel="noopener"><i class="bi bi-play-circle me-1"></i>${escapeHtml(TX.video)}</a>` : ""}
      </div>
    </article>`;
}

function render() {
  const base = baseList();
  renderChips(base);
  const list = base.filter((ex) => matchesMuscle(ex, state.muscle));
  $("exCount").textContent = txf(TX.nEjerciciosTotal, { n: list.length });
  $("exGrid").innerHTML = list.length ? list.map(card).join("") : `<div class="ui-empty">${escapeHtml(TX.sinEjercicios)}</div>`;
  updateImportButton();
}

/* =========================
   Importar catálogo base
========================= */
function missingFromCatalog() {
  const have = new Set(state.exercises.map((e) => exerciseKey(e.name)));
  return EXERCISE_CATALOG.filter((c) => !have.has(exerciseKey(c.name)));
}

function updateImportButton() {
  const btn = $("exImportBtn");
  if (!state.canEdit) return btn.classList.add("d-none");
  const n = missingFromCatalog().length;
  btn.classList.toggle("d-none", n === 0);
  btn.querySelector("span").textContent = `${TX.importar} (${n})`;
}

function setAlert(msg, type = "info") {
  const el = $("exAlert");
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.toggle("d-none", !msg);
}

async function importCatalog() {
  const missing = missingFromCatalog();
  if (!missing.length) return setAlert(TX.importarNada, "info");
  if (!window.confirm(txf(TX.importarConfirm, { n: missing.length }))) return;

  const uid = auth.currentUser?.uid || null;
  showLoader(TX.importando);
  try {
    for (let i = 0; i < missing.length; i += 400) {
      const batch = writeBatch(db);
      for (const c of missing.slice(i, i + 400)) {
        batch.set(doc(collection(db, COL_EXERCISES)), {
          name: c.name,
          primaryMuscle: c.primaryMuscle,
          bodyParts: c.bodyParts,
          equipment: c.equipment,
          seriesType: "reps",
          sets: null,
          reps: null,
          restSec: null,
          distance: null,
          distanceUnit: null,
          notes: null,
          videoUrl: null,
          isActive: true,
          source: "catalog",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uid,
          updatedBy: uid,
        });
      }
      await batch.commit();
    }
    await reload();
    setAlert(txf(TX.importados, { n: missing.length }), "success");
  } catch (err) {
    console.error("[gym_ejercicios] import", err);
    setAlert(txf(TX.importarError, { err: err?.code || err?.message || err }), "danger");
  } finally {
    hideLoader();
  }
}

/* =========================
   Init
========================= */
async function reload() {
  state.exercises = await loadExercises();
  render();
}

function applyTexts() {
  document.title = TX.ejerciciosTitulo;
  $("exTitle").textContent = TX.ejerciciosTitulo;
  $("exSubtitle").textContent = TX.ejerciciosSub;
  $("exBack").textContent = TX.volver;
  $("exSearch").placeholder = TX.buscarEjercicio;
  $("exNewBtn").querySelector("span").textContent = TX.nuevoEjercicio;
  $("exNewBtn").classList.toggle("d-none", !state.canEdit);
  $("exEquipment").innerHTML = `<option value="">${escapeHtml(TX.todoEquipo)}</option>` +
    Object.entries(EQUIPMENT).map(([id, label]) => `<option value="${id}">${escapeHtml(label)}</option>`).join("");
}

function bindEvents() {
  $("exSearch").addEventListener("input", render);
  $("exEquipment").addEventListener("change", render);
  $("exMuscles").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-muscle]");
    if (!chip) return;
    state.muscle = chip.dataset.muscle;
    render();
  });
  $("exGrid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit-exercise]");
    if (!btn || !state.canEdit) return;
    window.dispatchEvent(new CustomEvent("gymUI:exercise:edit", { detail: { id: btn.dataset.editExercise } }));
  });
  $("exNewBtn").addEventListener("click", () => window.dispatchEvent(new Event("gymUI:exercise:new")));
  $("exImportBtn").addEventListener("click", importCatalog);
  window.addEventListener("gym:exercisesChanged", () => reload().catch((err) => console.error(err)));
}

showLoader(TX.cargando);

const { cfg, redirected } = await guardPage("gym");

if (redirected) {
  hideLoader();
} else {
  try {
    await loadHeader("gym", cfg);
    state.canEdit = cfg?.caps?.canEditPlaybook === true;
    applyTexts();
    bindEvents();
    await reload();
    if (state.canEdit) await initGymEditors({ db, canEdit: true, modalMountId: "modalMount" });
  } catch (err) {
    console.error("[gym_ejercicios] init", err);
  } finally {
    hideLoader();
  }
}
