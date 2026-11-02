// /js/features/pickups/pickups_events.js
// Próximos pickups públicos como eventos para el calendario (página pública y dashboard).
import { dateToClubDay, fmtDate, fmtTime, getPickupSettings, t } from "/js/features/pickups/pickups_settings.js";
import {
  PICKUP_STATUS,
  buildPickupPublicUrl,
  escapeHtml,
  getPickupCapacity,
  isJoinOpen,
  norm,
  splitSpots,
} from "/js/features/pickups/pickups_shared.js";
import { loadPublicPickups, loadRegsForPickup } from "/js/features/pickups/pickups_services.js";

function spotsBadge(p, taken) {
  const cap = getPickupCapacity(p);
  if (!cap) return "";
  const left = cap - taken;
  if (left > 0) return `<span class="badge text-bg-success">${escapeHtml(t("calendar.spotsLeft", { left, taken, capacity: cap }))}</span>`;
  return `<span class="badge text-bg-warning">${escapeHtml(t(p.allowWaitlist === false ? "calendar.fullClosed" : "calendar.full"))}</span>`;
}

// withSpots: lee las inscripciones de cada pickup para mostrar cupos (1 lectura por pickup).
export async function loadUpcomingPickupEvents({ withSpots = true, max = 40 } = {}) {
  const all = await loadPublicPickups();
  const upcoming = all
    .filter((p) => norm(p.status) === PICKUP_STATUS.PUBLISHED && isJoinOpen(p))
    .slice(0, max);

  const taken = new Map();
  if (withSpots) {
    await Promise.all(upcoming.map(async (p) => {
      try {
        taken.set(p.id, splitSpots(p, await loadRegsForPickup(p.id)).inList.length);
      } catch {
        taken.set(p.id, 0);
      }
    }));
  }

  return upcoming.map((p) => ({
    id: `pickup:${p.id}`,
    kind: "pickup",
    kindLabel: t("calendar.kindPickup"),
    startDay: dateToClubDay(p.startAt),
    sortKey: String(p.startAt?.toMillis?.() ?? "").padStart(15, "0"),
    title: p.title || t("app.title"),
    meta: [fmtTime(p.startAt), p.venueName].filter(Boolean).join(" · "),
    href: buildPickupPublicUrl(p),
    badgeHtml: withSpots ? spotsBadge(p, taken.get(p.id) || 0) : "",
  }));
}

// Etiquetas comunes del calendario (pickups_strings), también las usa el dashboard.
export function calendarOptions() {
  const s = getPickupSettings();
  return {
    todayKey: dateToClubDay(new Date()),
    locale: s.locale || "es-CR",
    weekdays: t("calendar.weekdays").split(",").map((d) => d.trim()),
    formatDay: (key) => fmtDate(`${key}T12:00:00Z`),
    labels: {
      upcoming: t("calendar.upcomingTitle"),
      showAll: t("calendar.showAll"),
      empty: t("calendar.empty"),
      dayEmpty: t("calendar.dayEmpty"),
      prevMonth: t("calendar.prevMonth"),
      nextMonth: t("calendar.nextMonth"),
      view: t("calendar.view"),
      more: t("calendar.more"),
      less: t("calendar.less"),
    },
  };
}
