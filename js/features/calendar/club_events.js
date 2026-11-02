// /js/features/calendar/club_events.js
// Eventos del club para los calendarios (dashboard e inicio): pickups, torneos y entrenamientos.
// Cada fuente se carga aparte: si las reglas no dejan leer una, el calendario sigue con las demás.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { loadPickupSettings } from "/js/features/pickups/pickups_settings.js";
import { calendarOptions, loadUpcomingPickupEvents } from "/js/features/pickups/pickups_events.js";
import { CX } from "/js/strings/screens/club_events.js";

const COL = APP_CONFIG.collections;
const SCHEDULE_WEEKS = 8;

/* =========================
   Fechas
========================= */
const pad = (n) => String(n).padStart(2, "0");

export function toDayKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.trim().replaceAll("/", "-").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }
  const d = value?.toDate?.() || (value instanceof Date ? value : null);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
}

function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { key: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`, weekday: dt.getUTCDay() };
}

// "Martes y Jueves", "Domingos", "sábado", "Sat" -> [2, 4] (0 = domingo)
const WEEKDAYS = [
  ["domingo", "sunday", "sun", "dom"],
  ["lunes", "monday", "mon", "lun"],
  ["martes", "tuesday", "tue", "mar"],
  ["miercoles", "wednesday", "wed", "mie"],
  ["jueves", "thursday", "thu", "jue"],
  ["viernes", "friday", "fri", "vie"],
  ["sabado", "saturday", "sat", "sab"],
];

export function parseWeekdays(text) {
  const words = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => w.replace(/s$/, "")); // "domingos" -> "domingo"
  const out = new Set();
  words.forEach((w) => {
    WEEKDAYS.forEach((names, i) => {
      if (names.some((n) => w === n || w === n.replace(/s$/, ""))) out.add(i);
    });
  });
  return [...out];
}

/* =========================
   Entrenamientos
========================= */
// Horario semanal de club_config/trainings: { blocks: [{ name, schedule: [{ day, time }] }] }
export function scheduleEvents(trainingsDoc = {}, { todayKey, weeks = SCHEDULE_WEEKS, href = "" } = {}) {
  const blocks = Array.isArray(trainingsDoc.blocks) ? trainingsDoc.blocks : [];
  const slots = [];
  blocks.forEach((block) => {
    (Array.isArray(block.schedule) ? block.schedule : []).forEach((item) => {
      parseWeekdays(item.day).forEach((weekday) => slots.push({ weekday, name: block.name || CX.training, time: item.time || "" }));
    });
  });
  if (!slots.length || !todayKey) return [];

  const events = [];
  for (let i = 0; i < weeks * 7; i++) {
    const { key, weekday } = addDays(todayKey, i);
    slots.filter((s) => s.weekday === weekday).forEach((s, j) => {
      events.push({
        id: `schedule:${key}:${j}:${s.name}`,
        kind: "training",
        kindLabel: CX.kindTraining,
        startDay: key,
        sortKey: s.time,
        title: s.name,
        meta: s.time,
        href,
        scheduled: true,
      });
    });
  }
  return events;
}

// Entrenamientos con fecha (colección trainings, Historial de entrenamientos)
export function trainingDocEvents(list = [], { href = "" } = {}) {
  return list
    .filter((t) => t.active !== false)
    .map((t) => {
      const startDay = toDayKey(t.date);
      if (!startDay) return null;
      return {
        id: `training:${t.id}`,
        kind: "training",
        kindLabel: CX.kindTraining,
        startDay,
        title: t.title || t.name || CX.training,
        meta: t.summary ? String(t.summary).slice(0, 90) : "",
        href,
      };
    })
    .filter(Boolean);
}

/* =========================
   Torneos
========================= */
export function tournamentEvents(list = [], { hrefFor = () => "", metaFor = (t) => t.location || "", badgeFor = () => "" } = {}) {
  return list
    .map((t) => {
      const startDay = toDayKey(t.dateStart);
      if (!startDay) return null;
      return {
        id: `tournament:${t.id}`,
        kind: "tournament",
        kindLabel: CX.kindTournament,
        startDay,
        endDay: toDayKey(t.dateEnd) || startDay,
        title: t.name || CX.tournament,
        meta: metaFor(t),
        href: hrefFor(t),
        badgeHtml: badgeFor(t),
      };
    })
    .filter(Boolean);
}

/* =========================
   Cargar todo
========================= */
async function safe(promise) {
  try {
    return await promise;
  } catch (err) {
    console.warn("[calendar] fuente no disponible:", err?.code || err?.message || err);
    return null;
  }
}

/**
 * @param {{
 *   tournaments?: Array,            // ya cargados (si no, se leen)
 *   trainings?: Array,              // entrenamientos ya cargados (colección trainings)
 *   includeTrainingDocs?: boolean,  // si no vienen, leer la colección trainings (requiere sesión)
 *   trainingHref?: string,
 *   tournamentHref?: (t) => string,
 *   tournamentMeta?: (t) => string,
 *   tournamentBadge?: (t) => string,
 *   publicLanding?: boolean,        // en el inicio se respeta showOnLanding
 * }} opts
 */
export async function loadClubCalendarEvents(opts = {}) {
  await loadPickupSettings();
  const base = calendarOptions();

  const [pickups, tournamentsList, scheduleSnap, trainingsList] = await Promise.all([
    safe(loadUpcomingPickupEvents({ withSpots: false })),
    opts.tournaments ? Promise.resolve(opts.tournaments) : safe(getDocs(collection(db, COL.tournaments)).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    safe(getDoc(doc(db, COL.club_config, "trainings"))),
    opts.trainings
      ? Promise.resolve(opts.trainings)
      : opts.includeTrainingDocs
        ? safe(getDocs(collection(db, COL.trainings)).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))))
        : Promise.resolve(null),
  ]);

  let tournaments = tournamentsList || [];
  if (opts.publicLanding) tournaments = tournaments.filter((t) => t.showOnLanding !== false);

  const dated = trainingDocEvents(trainingsList || [], { href: opts.trainingHref || "" });
  const datedDays = new Set(dated.map((e) => e.startDay));
  const scheduled = scheduleEvents(scheduleSnap?.exists?.() ? scheduleSnap.data() : {}, { todayKey: base.todayKey, href: opts.trainingHref || "" })
    // si ese día ya hay un entrenamiento registrado, se muestra ese
    .filter((e) => !datedDays.has(e.startDay));

  const events = [
    ...(pickups || []).map((e) => ({ ...e, kindLabel: CX.kindPickup })),
    ...tournamentEvents(tournaments, { hrefFor: opts.tournamentHref, metaFor: opts.tournamentMeta, badgeFor: opts.tournamentBadge }),
    ...dated,
    ...scheduled,
  ];

  const kinds = new Set(events.map((e) => e.kind));
  const legend = [
    { kind: "training", label: CX.kindTraining },
    { kind: "pickup", label: CX.kindPickup },
    { kind: "tournament", label: CX.kindTournament },
  ].filter((l) => kinds.has(l.kind));

  return { base, events, legend };
}
