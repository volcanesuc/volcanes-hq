// /js/public/pickups_calendar.js
// Página pública de pickups: qué es, cómo funciona, calendario de próximos y preguntas.
import { initPublicMinimalHeader } from "/js/components/public-minimal-header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import {
  applyStrings,
  dateToClubDay,
  fmtDate,
  fmtTime,
  getPickupSettings,
  loadPickupSettings,
  pageText,
  richText,
  t,
} from "/js/features/pickups/pickups_settings.js";
import {
  PICKUP_STATUS,
  buildPickupPublicUrl,
  escapeHtml,
  getPickupCapacity,
  isJoinOpen,
  norm,
  splitSpots,
  whatsappUrl,
} from "/js/features/pickups/pickups_shared.js";
import { loadPublicPickups, loadRegsForPickup } from "/js/features/pickups/pickups_services.js";

const $ = (id) => document.getElementById(id);

const state = {
  pickups: [], // próximos, con { _day, _taken }
  month: null, // { y, m } (m 0-11)
  day: null, // "YYYY-MM-DD" seleccionado
};

// Un texto en "-" (o vacío) oculta la tarjeta / pregunta.
const shown = (text) => text && text.trim() && text.trim() !== "-";

/* =========================
   Secciones de texto
========================= */
function renderAbout() {
  const s = getPickupSettings();
  $("pcAbout").innerHTML = richText(pageText("aboutPickup", "calendar.aboutBody", { hours: s.defaultCancellationHours }));

  const contact = s.contact?.whatsapp || s.payment.sinpeNumber;
  if (contact) {
    $("pcContact").href = whatsappUrl(contact, t("wa.contact"), s.whatsappCountryCode);
    $("pcContact").classList.remove("d-none");
  }

  const cards = [1, 2, 3, 4]
    .map((n) => ({ n, title: t(`calendar.how${n}Title`), body: t(`calendar.how${n}Body`) }))
    .filter((c) => shown(c.title));
  $("pcHowWrap").classList.toggle("d-none", !cards.length);
  $("pcHow").innerHTML = cards.map((c) => `
    <div class="col-12 col-sm-6 col-lg-3">
      <div class="card h-100 shadow-sm pk-how">
        <div class="card-body">
          <div class="pk-how__n">${c.n}</div>
          <div class="fw-semibold mb-1">${escapeHtml(c.title)}</div>
          <div class="small text-muted">${shown(c.body) ? escapeHtml(c.body) : ""}</div>
        </div>
      </div>
    </div>`).join("");

  const faqs = [1, 2, 3, 4]
    .map((n) => ({ q: t(`calendar.faq${n}Q`), a: t(`calendar.faq${n}A`) }))
    .filter((f) => shown(f.q));
  $("pcFaqWrap").classList.toggle("d-none", !faqs.length);
  $("pcFaq").innerHTML = faqs.map((f) => `
    <details class="card shadow-sm pk-faq">
      <summary class="card-body fw-semibold">${escapeHtml(f.q)}</summary>
      <div class="px-3 pb-3 small">${shown(f.a) ? richText(f.a) : ""}</div>
    </details>`).join("");
}

/* =========================
   Calendario
========================= */
function monthLabel({ y, m }) {
  const locale = getPickupSettings().locale || "es-CR";
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, m, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function renderCalendar() {
  const { y, m } = state.month;
  $("pcMonth").textContent = monthLabel(state.month);

  const byDay = new Map();
  state.pickups.forEach((p) => byDay.set(p._day, [...(byDay.get(p._day) || []), p]));

  const today = dateToClubDay(new Date());
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // lunes primero
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  const weekdays = t("calendar.weekdays").split(",").map((d) => d.trim());
  const cells = weekdays.map((d) => `<div class="pk-cal__wd">${escapeHtml(d)}</div>`);
  for (let i = 0; i < lead; i++) cells.push(`<div class="pk-cal__day is-empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = byDay.get(key) || [];
    const cls = [
      "pk-cal__day",
      list.length ? "has-events" : "",
      key === today ? "is-today" : "",
      key === state.day ? "is-selected" : "",
      key < today ? "is-past" : "",
    ].filter(Boolean).join(" ");
    cells.push(`
      <button type="button" class="${cls}" data-day="${key}" ${list.length ? "" : "disabled"}>
        <span class="pk-cal__num">${d}</span>
        ${list.length ? `<span class="pk-cal__dots">${list.slice(0, 3).map(() => "<i></i>").join("")}</span>` : ""}
      </button>`);
  }
  $("pcCal").innerHTML = cells.join("");
}

// "sáb, 05 dic 2026" -> { weekday: "sáb", month: "dic" }
function dateParts(value) {
  const words = fmtDate(value).replace(/[,.]/g, "").split(/\s+/);
  return { weekday: words[0] || "", month: words[2] || "" };
}

function spotsBadge(p) {
  const cap = getPickupCapacity(p);
  if (!cap) return "";
  const left = cap - p._taken;
  if (left > 0) return `<span class="badge text-bg-success">${escapeHtml(t("calendar.spotsLeft", { left, taken: p._taken, capacity: cap }))}</span>`;
  return `<span class="badge text-bg-warning">${escapeHtml(t(p.allowWaitlist === false ? "calendar.fullClosed" : "calendar.full"))}</span>`;
}

function renderList() {
  const list = state.day ? state.pickups.filter((p) => p._day === state.day) : state.pickups;
  $("pcShowAll").classList.toggle("d-none", !state.day);
  $("pcListTitle").textContent = state.day ? fmtDate(list[0]?.startAt || state.day) : t("calendar.upcomingTitle");

  if (!list.length) {
    $("pcList").innerHTML = `<div class="text-muted small">${escapeHtml(t(state.day ? "calendar.dayEmpty" : "calendar.empty"))}</div>`;
    return;
  }

  $("pcList").innerHTML = list.map((p) => `
    <a class="card shadow-sm text-reset text-decoration-none pk-session" href="${escapeHtml(buildPickupPublicUrl(p))}">
      <div class="card-body d-flex gap-3 align-items-center">
        <div class="pk-session__date text-center">
          <div class="small text-uppercase">${escapeHtml(dateParts(p.startAt).weekday)}</div>
          <div class="fs-4 fw-bold lh-1">${escapeHtml(p._day.slice(8, 10))}</div>
          <div class="small text-uppercase">${escapeHtml(dateParts(p.startAt).month)}</div>
        </div>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold text-truncate">${escapeHtml(p.title || t("app.title"))}</div>
          <div class="small text-muted">${escapeHtml(fmtTime(p.startAt))}${p.venueName ? ` · ${escapeHtml(p.venueName)}` : ""}</div>
          <div class="mt-1">${spotsBadge(p)}</div>
        </div>
        <span class="btn btn-sm btn-primary">${escapeHtml(t("calendar.view"))}</span>
      </div>
    </a>`).join("");
}

function render() {
  renderCalendar();
  renderList();
}

function bindEvents() {
  $("pcPrev").onclick = () => {
    const { y, m } = state.month;
    state.month = m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 };
    renderCalendar();
  };
  $("pcNext").onclick = () => {
    const { y, m } = state.month;
    state.month = m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 };
    renderCalendar();
  };
  $("pcCal").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-day]");
    if (!btn) return;
    const day = btn.getAttribute("data-day");
    state.day = state.day === day ? null : day;
    render();
  });
  $("pcShowAll").onclick = () => {
    state.day = null;
    render();
  };
}

async function loadUpcoming() {
  const all = await loadPublicPickups();
  const upcoming = all.filter((p) => norm(p.status) === PICKUP_STATUS.PUBLISHED && isJoinOpen(p));
  await Promise.all(upcoming.slice(0, 40).map(async (p) => {
    try {
      p._taken = splitSpots(p, await loadRegsForPickup(p.id)).inList.length;
    } catch {
      p._taken = 0;
    }
  }));
  upcoming.forEach((p) => {
    p._day = dateToClubDay(p.startAt);
    p._taken ??= 0;
  });
  return upcoming;
}

(async function init() {
  showLoader();
  try {
    await loadPickupSettings();
    applyStrings();
    document.title = t("calendar.pageTitle");
    await initPublicMinimalHeader({ activeTab: "home", brandHref: "/index.html" });

    renderAbout();
    bindEvents();

    try {
      state.pickups = await loadUpcoming();
    } catch (err) {
      console.error("[pickups_calendar] load error:", err);
      state.pickups = [];
    }

    const startDay = state.pickups[0]?._day || dateToClubDay(new Date());
    state.month = { y: Number(startDay.slice(0, 4)), m: Number(startDay.slice(5, 7)) - 1 };
    render();
  } finally {
    hideLoader();
    document.documentElement.classList.remove("preload");
  }
})();
