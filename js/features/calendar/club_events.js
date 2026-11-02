// /js/features/calendar/club_events.js
// Eventos del club para los calendarios (dashboard e inicio), todos desde Firebase:
// pickups publicados, torneos (colección tournaments) y entrenamientos (colección trainings).
// Cada fuente se carga aparte: si las reglas no dejan leer una, el calendario sigue con las demás.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { loadPickupSettings } from "/js/features/pickups/pickups_settings.js";
import { calendarOptions, loadUpcomingPickupEvents } from "/js/features/pickups/pickups_events.js";
import { CX } from "/js/strings/screens/club_events.js";
import { loadPublicEvents } from "/js/features/calendar/public_events.js";

const COL = APP_CONFIG.collections;

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

// Entrenamientos con fecha (colección trainings, Historial de entrenamientos)
export function trainingEvents(list = [], { href = "" } = {}) {
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
        meta: [t.time, t.location].filter(Boolean).join(" · ") || (t.summary ? String(t.summary).slice(0, 90) : ""),
        href,
      };
    })
    .filter(Boolean);
}

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

async function safe(promise) {
  try {
    return await promise;
  } catch (err) {
    console.warn("[calendar] fuente no disponible:", err?.code || err?.message || err);
    return null;
  }
}

const readAll = (col) => getDocs(collection(db, col)).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })));

/**
 * @param {{
 *   tournaments?: Array,  // ya cargados (si no, se leen)
 *   trainings?: Array,    // ya cargados (si no, se leen)
 *   trainingHref?: string,
 *   tournamentHref?: (t) => string,
 *   tournamentMeta?: (t) => string,
 *   tournamentBadge?: (t) => string,
 *   publicLanding?: boolean, // inicio: torneos y entrenamientos salen de public_events (lectura pública)
 * }} opts
 */
export async function loadClubCalendarEvents(opts = {}) {
  await loadPickupSettings();
  const base = calendarOptions();

  if (opts.publicLanding) return loadPublicCalendar(base, opts);

  const [pickups, tournamentsList, trainingsList] = await Promise.all([
    safe(loadUpcomingPickupEvents({ withSpots: false })),
    opts.tournaments ? Promise.resolve(opts.tournaments) : safe(readAll(COL.tournaments)),
    opts.trainings ? Promise.resolve(opts.trainings) : safe(readAll(COL.trainings)),
  ]);

  const tournaments = tournamentsList || [];

  const events = [
    ...(pickups || []).map((e) => ({ ...e, kindLabel: CX.kindPickup })),
    ...tournamentEvents(tournaments, { hrefFor: opts.tournamentHref, metaFor: opts.tournamentMeta, badgeFor: opts.tournamentBadge }),
    ...trainingEvents(trainingsList || [], { href: opts.trainingHref || "" }),
  ];

  return { base, events, legend: legendFor(events) };
}

// Inicio: pickups + public_events (sin fees ni asistencia)
async function loadPublicCalendar(base, opts) {
  const [pickups, published] = await Promise.all([
    safe(loadUpcomingPickupEvents({ withSpots: false })),
    safe(loadPublicEvents()),
  ]);

  const events = [
    ...(pickups || []).map((e) => ({ ...e, kindLabel: CX.kindPickup })),
    ...(published || []).map((p) => ({
      id: p.id,
      kind: p.kind === "training" ? "training" : "tournament",
      kindLabel: p.kind === "training" ? CX.kindTraining : CX.kindTournament,
      startDay: p.startDay,
      endDay: p.endDay || p.startDay,
      sortKey: p.time || "",
      title: p.title || (p.kind === "training" ? CX.training : CX.tournament),
      meta: [p.time, p.location].filter(Boolean).join(" · "),
      href: p.kind === "tournament" && opts.tournamentHref ? opts.tournamentHref({ officialUrl: p.url }) : (p.kind === "training" ? opts.trainingHref || "" : ""),
    })),
  ].filter((e) => e.startDay);

  return { base, events, legend: legendFor(events) };
}

function legendFor(events) {
  const kinds = new Set(events.map((e) => e.kind));
  return [
    { kind: "training", label: CX.kindTraining },
    { kind: "pickup", label: CX.kindPickup },
    { kind: "tournament", label: CX.kindTournament },
  ].filter((l) => kinds.has(l.kind));
}
