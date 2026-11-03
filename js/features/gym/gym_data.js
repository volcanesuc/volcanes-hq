// /js/features/gym/gym_data.js
// Carga de planes, rutinas y ejercicios de gimnasio (una lectura por colección) y helpers de texto.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { musclesOf } from "/js/features/gym/exercise_catalog.js";

const COL = APP_CONFIG.collections;

const byName = (a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""), "es");

async function loadActive(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.isActive !== false);
}

export async function loadExercises() {
  return (await loadActive(COL.gymExercises)).map((e) => ({ ...e, muscles: musclesOf(e) })).sort(byName);
}

export async function loadGymData() {
  const [plans, routines, exercises] = await Promise.all([
    loadActive(COL.gymPlans),
    loadActive(COL.gymRoutines),
    loadExercises(),
  ]);

  // planes: el mes más reciente primero
  plans.sort((a, b) => String(b.monthKey || "").localeCompare(String(a.monthKey || "")) || byName(a, b));
  routines.sort(byName);
  return { plans, routines, exercises };
}

// Ítems de una rutina con los datos del ejercicio; lo que la rutina define pisa al ejercicio.
export function resolveRoutineItems(routine, exercisesById) {
  const items = Array.isArray(routine?.exerciseItems) ? routine.exerciseItems.slice() : [];
  items.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
  const pick = (o, base) => (o === null || o === undefined || o === "" ? base : o);

  return items.map((it) => {
    const ex = exercisesById.get(it.exerciseId) || null;
    return {
      exerciseId: it.exerciseId || null,
      exercise: ex,
      name: ex?.name || "",
      muscles: ex?.muscles || [],
      videoUrl: ex?.videoUrl || "",
      seriesType: pick(it.seriesType, ex?.seriesType || "reps"),
      sets: pick(it.sets, ex?.sets ?? null),
      reps: pick(it.reps, ex?.reps ?? null),
      restSec: pick(it.restSec, ex?.restSec ?? null),
      distance: pick(it.distance, ex?.distance ?? null),
      distanceUnit: pick(it.distanceUnit, ex?.distanceUnit ?? ""),
      notes: String(it.notes || ex?.notes || "").trim(),
    };
  });
}

// "4 × 6", "3 × 400 m", "4 series"
export function doseText(item) {
  const sets = item.sets ? `${item.sets} × ` : "";
  if (item.seriesType === "distance") {
    return item.distance ? `${sets}${item.distance} ${item.distanceUnit || ""}`.trim() : sets.replace(" × ", " series");
  }
  if (item.reps) return `${sets}${item.reps}`;
  return item.sets ? `${item.sets} series` : "";
}

export function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function safeUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

export function norm(v) {
  return String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
