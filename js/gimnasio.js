// js/gimnasio.js
// Entrenar › Gimnasio: planes de gimnasio → sus rutinas → los ejercicios de cada rutina.
// Quien puede editar el playbook (admin, coach, staff, content editor) edita desde acá con los
// mismos modales de siempre (gym_editors.js).
import { db } from "./auth/firebase.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import { initGymEditors } from "./features/playbook/gym/gym_editors.js";
import { muscleLabel } from "./features/gym/exercise_catalog.js";
import { doseText, escapeHtml, loadGymData, norm, resolveRoutineItems, safeUrl } from "./features/gym/gym_data.js";
import { TX, txf } from "/js/strings/screens/gimnasio.js";

const $ = (id) => document.getElementById(id);

const state = {
  canEdit: false,
  plans: [],
  routines: [],
  exercises: [],
  exercisesById: new Map(),
  routinesById: new Map(),
};

function editBtn(kind, id) {
  if (!state.canEdit) return "";
  return `<button type="button" class="btn btn-sm btn-outline-secondary gx-edit" data-edit="${kind}" data-id="${escapeHtml(id)}" title="${escapeHtml(TX.editar)}">
    <i class="bi bi-pencil"></i>
  </button>`;
}

function exerciseRow(item) {
  const video = safeUrl(item.videoUrl);
  const name = item.exercise ? item.name : TX.ejercicioBorrado;
  const meta = [doseText(item), item.restSec ? txf(TX.descanso, { sec: item.restSec }) : ""].filter(Boolean).join(" · ");
  return `
    <li class="gx-ex">
      <div class="gx-ex__main">
        <div class="gx-ex__name">
          ${state.canEdit && item.exerciseId
            ? `<button type="button" class="gx-ex__link" data-edit="exercise" data-id="${escapeHtml(item.exerciseId)}">${escapeHtml(name)}</button>`
            : escapeHtml(name)}
        </div>
        ${meta ? `<div class="gx-ex__dose">${escapeHtml(meta)}</div>` : ""}
        ${item.notes ? `<div class="gx-ex__notes">${escapeHtml(item.notes)}</div>` : ""}
        ${item.muscles.length ? `<div class="gx-tags">${item.muscles.map((m) => `<span>${escapeHtml(muscleLabel(m))}</span>`).join("")}</div>` : ""}
      </div>
      ${video ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(video)}" target="_blank" rel="noopener"><i class="bi bi-play-circle me-1"></i>${escapeHtml(TX.video)}</a>` : ""}
    </li>`;
}

function routineBlock(routine, label = "") {
  const items = resolveRoutineItems(routine, state.exercisesById);
  return `
    <details class="gx-routine">
      <summary>
        <i class="bi bi-chevron-right gx-routine__chev"></i>
        <div class="gx-routine__title">
          ${label ? `<span class="gx-routine__label">${escapeHtml(label)}</span>` : ""}
          <span>${escapeHtml(routine.name || "—")}</span>
        </div>
        <span class="gx-routine__count">${escapeHtml(txf(TX.nEjercicios, { n: items.length }))}</span>
        ${editBtn("routine", routine.id)}
      </summary>
      ${routine.description ? `<p class="gx-routine__desc">${escapeHtml(routine.description)}</p>` : ""}
      ${items.length
        ? `<ol class="gx-exlist">${items.map(exerciseRow).join("")}</ol>`
        : `<div class="gx-empty-inline">${escapeHtml(TX.rutinaSinEjercicios)}</div>`}
    </details>`;
}

function planCard(plan, term) {
  const slots = (Array.isArray(plan.slots) ? plan.slots.slice() : [])
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((s) => ({ ...s, routine: state.routinesById.get(s.routineId) }))
    .filter((s) => s.routine);

  const planMatch = !term || norm(`${plan.title} ${plan.monthKey}`).includes(term);
  const visibleSlots = planMatch ? slots : slots.filter((s) => norm(`${s.label} ${s.routine.name}`).includes(term));
  if (!visibleSlots.length && !planMatch) return "";

  return `
    <section class="gx-plan">
      <header class="gx-plan__head">
        <div>
          <h2 class="gx-plan__title">${escapeHtml(plan.title || plan.monthKey || "—")}</h2>
          <div class="gx-plan__meta">
            ${plan.monthKey ? `<span>${escapeHtml(plan.monthKey)}</span>` : ""}
            <span>${escapeHtml(txf(TX.nRutinas, { n: slots.length }))}</span>
            ${plan.isPublic ? `<span class="gx-badge">${escapeHtml(TX.publico)}</span>` : ""}
          </div>
        </div>
        <div class="d-flex gap-2">
          <a class="btn btn-sm btn-outline-secondary" href="/gym_plan.html?id=${encodeURIComponent(plan.id)}" title="${escapeHtml(TX.verPlan)}"><i class="bi bi-box-arrow-up-right"></i></a>
          ${editBtn("plan", plan.id)}
        </div>
      </header>
      <div class="gx-plan__body">
        ${visibleSlots.map((s) => routineBlock(s.routine, s.label)).join("") || `<div class="gx-empty-inline">—</div>`}
      </div>
    </section>`;
}

function render() {
  const term = norm($("gxSearch").value);
  const inPlans = new Set(state.plans.flatMap((p) => (p.slots || []).map((s) => s.routineId)));

  const plansHtml = state.plans.map((p) => planCard(p, term)).join("");
  const loose = state.routines
    .filter((r) => !inPlans.has(r.id))
    .filter((r) => !term || norm(r.name).includes(term));

  const looseHtml = loose.length
    ? `<section class="gx-plan gx-plan--loose">
        <header class="gx-plan__head"><h2 class="gx-plan__title">${escapeHtml(TX.rutinasSueltas)}</h2></header>
        <div class="gx-plan__body">${loose.map((r) => routineBlock(r)).join("")}</div>
      </section>`
    : "";

  const html = plansHtml + looseHtml;
  $("gxPlans").innerHTML = html || `<div class="ui-empty">${escapeHtml(term ? TX.sinResultados : TX.sinPlanes)}</div>`;
}

async function reload() {
  const data = await loadGymData();
  Object.assign(state, data);
  state.exercisesById = new Map(data.exercises.map((e) => [e.id, e]));
  state.routinesById = new Map(data.routines.map((r) => [r.id, r]));
  render();
}

function applyTexts() {
  document.title = TX.titulo;
  $("gxTitle").textContent = TX.titulo;
  $("gxSubtitle").textContent = TX.subtitulo;
  $("gxSearch").placeholder = TX.buscarPlan;
  $("gxExercisesBtn").querySelector("span").textContent = state.canEdit ? TX.gestionarEjercicios : TX.verEjercicios;
  $("gxNewRoutineBtn").querySelector("span").textContent = TX.nuevaRutina;
  $("gxNewPlanBtn").querySelector("span").textContent = TX.nuevoPlan;
  $("gxNewRoutineBtn").classList.toggle("d-none", !state.canEdit);
  $("gxNewPlanBtn").classList.toggle("d-none", !state.canEdit);
}

// Editar: los modales de gym_editors.js escuchan estos eventos.
const EDIT_EVENTS = { exercise: "gymUI:exercise:edit", routine: "gymUI:routine:edit", plan: "gymUI:week:edit" };

function bindEvents() {
  $("gxSearch").addEventListener("input", render);

  $("gxPlans").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn || !state.canEdit) return;
    e.preventDefault(); // que el botón dentro de <summary> no abra/cierre la rutina
    window.dispatchEvent(new CustomEvent(EDIT_EVENTS[btn.dataset.edit], { detail: { id: btn.dataset.id } }));
  });

  $("gxNewRoutineBtn").addEventListener("click", () => window.dispatchEvent(new Event("gymUI:routine:new")));
  $("gxNewPlanBtn").addEventListener("click", () => window.dispatchEvent(new Event("gymUI:week:new")));

  for (const ev of ["gym:changed", "gym:exercisesChanged", "gym:routinesChanged", "gym:weeksChanged", "gym:plansChanged"]) {
    window.addEventListener(ev, () => reload().catch((err) => console.error("[gimnasio] reload", err)));
  }
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
    console.error("[gimnasio] init", err);
  } finally {
    hideLoader();
  }
}
