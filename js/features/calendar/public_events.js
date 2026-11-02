// /js/features/calendar/public_events.js
// Copia pública y mínima de torneos y entrenamientos para el calendario del inicio.
// tournaments y trainings tienen datos privados (fees, asistencia), así que el inicio
// (visitantes sin sesión) lee solo public_events: { kind, title, startDay, endDay, location, time, url }.
// Se actualiza al guardar un torneo o entrenamiento; Admin > Landing tiene "Sincronizar" para rehacerla.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
export const COL_PUBLIC_EVENTS = COL.publicEvents || "public_events";

const pad = (n) => String(n).padStart(2, "0");

function dayKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.trim().replaceAll("/", "-").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }
  const d = value?.toDate?.() || (value instanceof Date ? value : null);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
}

const publicId = (kind, id) => `${kind}_${id}`;

// null = no se publica (sin fecha, oculto del inicio o inactivo)
function tournamentToPublic(id, t = {}) {
  const startDay = dayKey(t.dateStart);
  if (!startDay || t.showOnLanding === false) return null;
  return {
    kind: "tournament",
    sourceId: id,
    title: String(t.name || "").slice(0, 120),
    startDay,
    endDay: dayKey(t.dateEnd) || startDay,
    location: String(t.location || "").slice(0, 160),
    time: "",
    url: String(t.officialUrl || "").slice(0, 300),
  };
}

function trainingToPublic(id, t = {}) {
  const startDay = dayKey(t.date);
  if (!startDay || t.active === false || t.showOnLanding === false) return null;
  return {
    kind: "training",
    sourceId: id,
    title: String(t.title || t.name || "").slice(0, 120),
    startDay,
    endDay: startDay,
    location: String(t.location || "").slice(0, 160),
    time: String(t.time || "").slice(0, 60),
    url: "",
  };
}

async function upsert(kind, id, data) {
  const ref = doc(db, COL_PUBLIC_EVENTS, publicId(kind, id));
  if (!data) return deleteDoc(ref).catch(() => null);
  return setDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

// No frena el guardado principal si falla (p. ej. reglas sin publicar todavía).
async function quiet(fn) {
  try {
    await fn();
  } catch (err) {
    console.warn("[public_events] no se pudo actualizar:", err?.code || err?.message || err);
  }
}

export const syncTournamentPublic = (id, data) => quiet(() => upsert("tournament", id, tournamentToPublic(id, data)));
export const removeTournamentPublic = (id) => quiet(() => upsert("tournament", id, null));
export const syncTrainingPublic = (id, data) => quiet(() => upsert("training", id, trainingToPublic(id, data)));

// Rehace toda la colección desde tournaments y trainings (botón en Admin).
export async function rebuildPublicEvents() {
  const [tSnap, trSnap, pubSnap] = await Promise.all([
    getDocs(collection(db, COL.tournaments)),
    getDocs(collection(db, COL.trainings)),
    getDocs(collection(db, COL_PUBLIC_EVENTS)),
  ]);

  const next = new Map();
  tSnap.docs.forEach((d) => {
    const data = tournamentToPublic(d.id, d.data());
    if (data) next.set(publicId("tournament", d.id), data);
  });
  trSnap.docs.forEach((d) => {
    const data = trainingToPublic(d.id, d.data());
    if (data) next.set(publicId("training", d.id), data);
  });

  const ops = [];
  next.forEach((data, id) => ops.push((b) => b.set(doc(db, COL_PUBLIC_EVENTS, id), { ...data, updatedAt: serverTimestamp() })));
  pubSnap.docs.filter((d) => !next.has(d.id)).forEach((d) => ops.push((b) => b.delete(d.ref)));

  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  return { published: next.size, removed: ops.length - next.size };
}

export async function loadPublicEvents() {
  const snap = await getDocs(collection(db, COL_PUBLIC_EVENTS));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
