// /js/components/events_calendar.js
// Calendario mensual + lista de próximos eventos (pickups, torneos, ...).
//
// mountEventsCalendar(root, {
//   events: [{ id, kind, startDay: "YYYY-MM-DD", endDay?, title, meta?, href?, badgeHtml?, kindLabel? }],
//   todayKey: "YYYY-MM-DD", locale, weekdays: ["L","M",...],
//   labels: { upcoming, showAll, empty, dayEmpty, prevMonth, nextMonth, view },
//   formatDay: (dayKey) => "mié 4 nov",   // título de la lista al elegir un día
//   legend: [{ kind, label }],
// })

const MAX_SPAN_DAYS = 14;

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const pad = (n) => String(n).padStart(2, "0");

function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function daysOf(ev) {
  const out = [ev.startDay];
  const end = ev.endDay && ev.endDay > ev.startDay ? ev.endDay : ev.startDay;
  for (let k = ev.startDay; k < end && out.length < MAX_SPAN_DAYS; ) {
    k = addDays(k, 1);
    out.push(k);
  }
  return out;
}

function dayParts(dayKey, locale) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = Date.UTC(y, m - 1, d);
  const f = (opts) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(date).replace(".", "");
  return { weekday: f({ weekday: "short" }), day: pad(d), month: f({ month: "short" }) };
}

export function mountEventsCalendar(root, opts) {
  const {
    events = [],
    todayKey,
    locale = "es-CR",
    weekdays = ["L", "M", "K", "J", "V", "S", "D"],
    labels = {},
    formatDay = (k) => k,
    legend = [],
    listLimit = 10, // próximos sin día elegido: se muestran estos y un "Ver más"
  } = opts;

  const upcoming = events
    .filter((ev) => ev.startDay && (ev.endDay || ev.startDay) >= todayKey)
    .sort((a, b) => a.startDay.localeCompare(b.startDay) || String(a.sortKey || "").localeCompare(String(b.sortKey || "")));

  const byDay = new Map();
  upcoming.forEach((ev) => daysOf(ev).forEach((k) => byDay.set(k, [...(byDay.get(k) || []), ev])));

  const startKey = upcoming[0]?.startDay || todayKey;
  const state = {
    y: Number(startKey.slice(0, 4)),
    m: Number(startKey.slice(5, 7)) - 1,
    day: null,
    limit: listLimit,
  };

  root.innerHTML = `
    <div class="row g-4">
      <div class="col-12 col-lg-6">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-ec-prev aria-label="${esc(labels.prevMonth)}">‹</button>
          <div class="fw-semibold" data-ec-month>—</div>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-ec-next aria-label="${esc(labels.nextMonth)}">›</button>
        </div>
        <div class="pk-cal" data-ec-grid></div>
        ${legend.length ? `
          <div class="d-flex flex-wrap gap-3 mt-2 small text-muted">
            ${legend.map((l) => `<span class="d-inline-flex align-items-center gap-1"><i class="ec-dot ec-dot--${esc(l.kind)}"></i>${esc(l.label)}</span>`).join("")}
          </div>` : ""}
      </div>
      <div class="col-12 col-lg-6">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="fw-semibold" data-ec-list-title></div>
          <button class="btn btn-sm btn-link d-none" type="button" data-ec-all>${esc(labels.showAll)}</button>
        </div>
        <div class="d-grid gap-2" data-ec-list></div>
        <button class="btn btn-sm btn-outline-secondary w-100 mt-2 d-none" type="button" data-ec-more>${esc(labels.more || "+")}</button>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);

  function monthLabel() {
    const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
      .format(Date.UTC(state.y, state.m, 1));
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function renderGrid() {
    $("[data-ec-month]").textContent = monthLabel();
    const lead = (new Date(Date.UTC(state.y, state.m, 1)).getUTCDay() + 6) % 7; // lunes primero
    const daysInMonth = new Date(Date.UTC(state.y, state.m + 1, 0)).getUTCDate();

    const cells = weekdays.map((d) => `<div class="pk-cal__wd">${esc(d)}</div>`);
    for (let i = 0; i < lead; i++) cells.push(`<div class="pk-cal__day is-empty"></div>`);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${state.y}-${pad(state.m + 1)}-${pad(d)}`;
      const list = byDay.get(key) || [];
      const cls = [
        "pk-cal__day",
        list.length ? "has-events" : "",
        key === todayKey ? "is-today" : "",
        key === state.day ? "is-selected" : "",
        key < todayKey ? "is-past" : "",
      ].filter(Boolean).join(" ");
      const kinds = [...new Set(list.map((ev) => ev.kind))].slice(0, 3);
      cells.push(`
        <button type="button" class="${cls}" data-day="${key}" ${list.length ? "" : "disabled"}>
          <span class="pk-cal__num">${d}</span>
          ${kinds.length ? `<span class="pk-cal__dots">${kinds.map((k) => `<i class="ec-dot ec-dot--${esc(k)}"></i>`).join("")}</span>` : ""}
        </button>`);
    }
    $("[data-ec-grid]").innerHTML = cells.join("");
  }

  function cardHtml(ev) {
    const p = dayParts(ev.startDay, locale);
    const tag = ev.href ? "a" : "div";
    return `
      <${tag} class="card shadow-sm text-reset text-decoration-none pk-session ec-card--${esc(ev.kind)}" ${ev.href ? `href="${esc(ev.href)}"` : ""}>
        <div class="card-body d-flex gap-3 align-items-center">
          <div class="pk-session__date text-center">
            <div class="small text-uppercase">${esc(p.weekday)}</div>
            <div class="fs-4 fw-bold lh-1">${esc(p.day)}</div>
            <div class="small text-uppercase">${esc(p.month)}</div>
          </div>
          <div class="flex-grow-1 min-w-0">
            ${ev.kindLabel ? `<div class="small fw-semibold ec-kind ec-kind--${esc(ev.kind)}">${esc(ev.kindLabel)}</div>` : ""}
            <div class="fw-semibold text-truncate">${esc(ev.title)}</div>
            ${ev.meta ? `<div class="small text-muted">${esc(ev.meta)}</div>` : ""}
            ${ev.badgeHtml ? `<div class="mt-1">${ev.badgeHtml}</div>` : ""}
          </div>
          ${ev.href && labels.view ? `<span class="btn btn-sm btn-primary">${esc(labels.view)}</span>` : ""}
        </div>
      </${tag}>`;
  }

  function renderList() {
    const all = state.day ? byDay.get(state.day) || [] : upcoming;
    const list = state.day ? all : all.slice(0, state.limit);
    $("[data-ec-more]").classList.toggle("d-none", list.length >= all.length);
    $("[data-ec-all]").classList.toggle("d-none", !state.day);
    $("[data-ec-list-title]").textContent = state.day ? formatDay(state.day) : labels.upcoming || "";
    $("[data-ec-list]").innerHTML = list.length
      ? list.map(cardHtml).join("")
      : `<div class="text-muted small">${esc(state.day ? labels.dayEmpty : labels.empty)}</div>`;
  }

  $("[data-ec-prev]").onclick = () => {
    state.m -= 1;
    if (state.m < 0) { state.m = 11; state.y -= 1; }
    renderGrid();
  };
  $("[data-ec-next]").onclick = () => {
    state.m += 1;
    if (state.m > 11) { state.m = 0; state.y += 1; }
    renderGrid();
  };
  $("[data-ec-grid]").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-day]");
    if (!btn) return;
    const day = btn.getAttribute("data-day");
    state.day = state.day === day ? null : day;
    renderGrid();
    renderList();
  });
  $("[data-ec-more]").onclick = () => {
    state.limit += listLimit;
    renderList();
  };
  $("[data-ec-all]").onclick = () => {
    state.day = null;
    renderGrid();
    renderList();
  };

  renderGrid();
  renderList();
}
