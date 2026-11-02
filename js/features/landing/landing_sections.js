// /js/features/landing/landing_sections.js
// Secciones nuevas del landing: calendario, cómo unirte, números, galería, patrocinadores,
// orden de secciones y SEO. Todo sale de club_config/landing (con defaults en Textos).
import { auth } from "/js/auth/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { mountEventsCalendar } from "/js/components/events_calendar.js";
import { openMediaViewerModal } from "/js/ui/media_viewer_modal.js";
import { LX, lxf } from "/js/strings/screens/landing.js";
import { LEGACY_TOGGLES, sectionOrder } from "/js/features/landing/landing_data.js";
import { countMyPendingPhotos, openGalleryUpload } from "/js/components/gallery_upload.js";

const $ = (id) => document.getElementById(id);

// Defaults de secciones nuevas cuando el club todavía no las configuró
const NEW_SECTION_DEFAULTS = {
  calendar: { enabled: true },
  join: { enabled: true },
  stats: { enabled: false },
  sponsors: { enabled: false },
  gallery: { enabled: false, allowUploads: true },
};

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("/")) return s;
  return `https://${s}`;
}

const pick = (value, fallback) => (String(value ?? "").trim() ? value : fallback);

export function sectionConfig(landing = {}, id) {
  return { ...(NEW_SECTION_DEFAULTS[id] || {}), ...(landing.sections?.[id] || {}) };
}

function show(el, visible) {
  el?.classList.toggle("d-none", !visible);
}

/* =========================
   Orden
========================= */
export function applySectionOrder(landing = {}) {
  const main = $("landingMain");
  if (!main) return;
  sectionOrder(landing).forEach((id) => {
    const el = main.querySelector(`[data-section="${id}"]`);
    if (el) main.appendChild(el);
  });
}

/* =========================
   Botones de la portada
========================= */
function renderHeroActions(landing) {
  const cfg = landing.sections?.hero || {};
  const buttons = [
    { label: pick(cfg.ctaPrimaryLabel, LX.heroCtaPrimary), url: pick(cfg.ctaPrimaryUrl, "/public/register.html"), cls: "landing-btn" },
    { label: pick(cfg.ctaSecondaryLabel, LX.heroCtaSecondary), url: pick(cfg.ctaSecondaryUrl, "#calendarSection"), cls: "landing-btn landing-btn-whatsapp" },
  ].filter((b) => b.label.trim() !== "-");
  // el link al calendario solo si el calendario está prendido
  const calendarOn = sectionConfig(landing, "calendar").enabled;
  $("heroActions").innerHTML = buttons
    .filter((b) => b.url !== "#calendarSection" || calendarOn)
    .map((b) => {
      const url = b.url.startsWith("#") ? b.url : safeUrl(b.url);
      const external = /^https?:/i.test(url) && !url.startsWith(window.location.origin);
      return `<a class="${b.cls}" href="${esc(url)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ""}>${esc(b.label)}</a>`;
    })
    .join("");
}

/* =========================
   Cómo unirte
========================= */
function renderJoin(landing) {
  const cfg = sectionConfig(landing, "join");
  const section = $("joinSection");
  const steps = (Array.isArray(cfg.steps) && cfg.steps.length
    ? cfg.steps
    : [1, 2, 3].map((n) => ({ title: LX[`joinStep${n}Title`], text: LX[`joinStep${n}Text`] })))
    .filter((s) => String(s.title || "").trim());

  show(section, cfg.enabled && steps.length > 0);
  if (!cfg.enabled) return;

  $("joinTitle").textContent = pick(cfg.title, LX.joinTitle);
  $("joinSubtitle").textContent = pick(cfg.subtitle, LX.joinSubtitle);
  $("joinSteps").innerHTML = steps.map((s) => `
    <div class="join-step">
      <h3>${esc(s.title)}</h3>
      ${s.text ? `<p>${esc(s.text)}</p>` : ""}
    </div>`).join("");

  const registerLabel = pick(cfg.registerLabel, LX.joinRegister);
  const pickupsLabel = pick(cfg.pickupsLabel, LX.joinPickups);
  $("joinCtas").innerHTML = `
    ${registerLabel !== "-" ? `<a class="landing-btn" href="/public/register.html">${esc(registerLabel)}</a>` : ""}
    ${pickupsLabel !== "-" ? `<a class="landing-btn landing-btn-whatsapp" href="/public/pickups.html">${esc(pickupsLabel)}</a>` : ""}`;
}

/* =========================
   Números
========================= */
function renderStats(landing) {
  const cfg = sectionConfig(landing, "stats");
  const items = (cfg.items || []).filter((i) => String(i.value || "").trim() || String(i.label || "").trim());
  show($("statsSection"), cfg.enabled && items.length > 0);
  if (!cfg.enabled || !items.length) return;

  $("statsTitle").textContent = pick(cfg.title, LX.statsTitle);
  $("statsGrid").innerHTML = items.map((i) => `
    <div class="stat-item">
      <div class="stat-item__value">${esc(i.value)}</div>
      <div class="stat-item__label">${esc(i.label)}</div>
    </div>`).join("");
}

/* =========================
   Patrocinadores
========================= */
function renderSponsors(landing) {
  const cfg = sectionConfig(landing, "sponsors");
  const items = (cfg.items || []).filter((i) => i.logoUrl || String(i.name || "").trim());
  show($("sponsorsSection"), cfg.enabled && items.length > 0);
  if (!cfg.enabled || !items.length) return;

  $("sponsorsTitle").textContent = pick(cfg.title, LX.sponsorsTitle);
  $("sponsorsSubtitle").textContent = pick(cfg.subtitle, LX.sponsorsSubtitle);
  $("sponsorsGrid").innerHTML = items.map((i) => {
    const inner = i.logoUrl ? `<img src="${esc(i.logoUrl)}" alt="${esc(i.name || "")}" loading="lazy" />` : esc(i.name);
    const url = safeUrl(i.url);
    return url
      ? `<a class="sponsor" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(i.name || "")}">${inner}</a>`
      : `<span class="sponsor" title="${esc(i.name || "")}">${inner}</span>`;
  }).join("");
}

/* =========================
   Galería
========================= */
let galleryCfg = {};
let galleryUser = null;
let galleryBound = false;

function renderGallery(landing, photos = []) {
  galleryCfg = sectionConfig(landing, "gallery");
  const section = $("gallerySection");
  show(section, galleryCfg.enabled);
  if (!galleryCfg.enabled) return;

  $("galleryTitle").textContent = pick(galleryCfg.title, LX.galleryTitle);
  $("gallerySubtitle").textContent = pick(galleryCfg.subtitle, LX.gallerySubtitle);

  $("galleryGrid").innerHTML = photos.map((p, i) => `
    <button type="button" class="gallery-item" data-photo="${i}">
      <img src="${esc(p.url)}" alt="${esc(p.caption || "")}" loading="lazy" />
      ${p.caption || p.uploaderName ? `<span class="gallery-item__caption">${esc(p.caption || lxf(LX.galleryBy, { name: p.uploaderName }))}</span>` : ""}
    </button>`).join("");
  $("galleryEmpty").textContent = LX.galleryEmpty;
  show($("galleryEmpty"), photos.length === 0);

  $("galleryGrid").onclick = (ev) => {
    const btn = ev.target.closest("[data-photo]");
    if (!btn) return;
    const p = photos[Number(btn.getAttribute("data-photo"))];
    if (p) openMediaViewerModal(p.url, { title: p.caption || pick(galleryCfg.title, LX.galleryTitle) });
  };

  bindGalleryUpload();
  renderGalleryUploadButton();
}

function renderGalleryUploadButton() {
  const btn = $("galleryUploadBtn");
  if (!btn) return;
  const allowed = galleryCfg.enabled && galleryCfg.allowUploads !== false;
  show(btn, allowed);
  if (!allowed) return;
  const signedIn = !!galleryUser && !galleryUser.isAnonymous;
  $("galleryUploadLabel").textContent = signedIn ? LX.galleryUpload : LX.galleryLoginToUpload;
  btn.dataset.mode = signedIn ? "upload" : "login";
}

async function refreshMyPending() {
  const el = $("galleryMine");
  if (!galleryUser || galleryUser.isAnonymous) return show(el, false);
  const n = await countMyPendingPhotos(galleryUser.uid);
  el.textContent = lxf(LX.galleryMine, { n });
  show(el, n > 0);
}

function bindGalleryUpload() {
  if (galleryBound) return;
  galleryBound = true;

  onAuthStateChanged(auth, (user) => {
    galleryUser = user;
    renderGalleryUploadButton();
    refreshMyPending();
  });

  $("galleryUploadBtn").onclick = () => {
    if ($("galleryUploadBtn").dataset.mode === "upload") return openGalleryUpload({ onDone: refreshMyPending });
    const login = document.getElementById("googleLoginBtn");
    if (login) login.click();
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

/* =========================
   Calendario
========================= */
let calendarStarted = false;

async function renderCalendar(landing, { loadTournaments }) {
  const cfg = sectionConfig(landing, "calendar");
  show($("calendarSection"), cfg.enabled);
  if (!cfg.enabled) return;

  $("calendarTitle").textContent = pick(cfg.title, LX.calendarTitle);
  $("calendarSubtitle").textContent = pick(cfg.subtitle, LX.calendarSubtitle);
  if (calendarStarted) return;
  calendarStarted = true;

  // se carga aparte: el resto del landing no espera a los pickups
  const [{ loadPickupSettings }, { calendarOptions, loadUpcomingPickupEvents }] = await Promise.all([
    import("/js/features/pickups/pickups_settings.js"),
    import("/js/features/pickups/pickups_events.js"),
  ]);
  await loadPickupSettings();

  const [pickups, tournaments] = await Promise.all([
    loadUpcomingPickupEvents({ withSpots: false }).catch(() => []),
    loadTournaments().catch(() => []),
  ]);

  const base = calendarOptions();
  mountEventsCalendar($("landingCalendar"), {
    ...base,
    events: [
      ...pickups.map((ev) => ({ ...ev, kindLabel: LX.kindPickup })),
      ...tournaments.map((ev) => ({ ...ev, kindLabel: LX.kindTournament })),
    ],
    labels: { ...base.labels, upcoming: pick(cfg.title, LX.calendarTitle), empty: LX.calendarEmpty },
    legend: tournaments.length
      ? [{ kind: "pickup", label: LX.kindPickup }, { kind: "tournament", label: LX.kindTournament }]
      : [],
  });
}

/* =========================
   SEO
========================= */
function setMeta(selector, attr, value) {
  if (!value) return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    const [, key, name] = selector.match(/\[(\w+)="([^"]+)"\]/) || [];
    if (key) el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function applySeo(landing, fallbackDescription) {
  const seo = landing.seo || {};
  if (seo.title) document.title = seo.title;
  const description = seo.description || fallbackDescription || "";
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:title"]', "content", seo.title || document.title);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:image"]', "content", seo.imageUrl);
}

/* =========================
   Todo junto
========================= */
export function renderNewSections(data, { loadTournaments, heroDescription } = {}) {
  const landing = data.docs?.landing || {};
  renderHeroActions(landing);
  renderJoin(landing);
  renderStats(landing);
  renderSponsors(landing);
  renderGallery(landing, data.photos || []);
  renderCalendar(landing, { loadTournaments }).catch((err) => console.warn("[landing] calendario:", err));
  applySectionOrder(landing);
  applySeo(landing, heroDescription);
}

// Secciones viejas: visibles si su switch de index_settings está prendido.
export function legacyEnabled(indexSettings = {}, id) {
  const key = LEGACY_TOGGLES[id];
  return key ? indexSettings[key] === true : true;
}
