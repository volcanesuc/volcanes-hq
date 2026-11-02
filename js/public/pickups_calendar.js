// /js/public/pickups_calendar.js
// Página pública de pickups: qué es, cómo funciona, calendario de próximos y preguntas.
import { initPublicMinimalHeader } from "/js/components/public-minimal-header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { mountEventsCalendar } from "/js/components/events_calendar.js";
import { calendarOptions, loadUpcomingPickupEvents } from "/js/features/pickups/pickups_events.js";
import {
  applyStrings,
  getPickupSettings,
  loadPickupSettings,
  pageText,
  richText,
  t,
} from "/js/features/pickups/pickups_settings.js";
import { escapeHtml, whatsappUrl } from "/js/features/pickups/pickups_shared.js";

const $ = (id) => document.getElementById(id);

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
(async function init() {
  showLoader();
  try {
    await loadPickupSettings();
    applyStrings();
    document.title = t("calendar.pageTitle");
    await initPublicMinimalHeader({ activeTab: "home", brandHref: "/index.html" });

    renderAbout();

    let events = [];
    try {
      events = (await loadUpcomingPickupEvents()).map((ev) => ({ ...ev, kindLabel: "" }));
    } catch (err) {
      console.error("[pickups_calendar] load error:", err);
    }
    mountEventsCalendar($("pcCalendar"), { ...calendarOptions(), events });
  } finally {
    hideLoader();
    document.documentElement.classList.remove("preload");
  }
})();
