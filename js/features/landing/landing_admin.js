// /js/features/landing/landing_admin.js
// Admin > Landing settings: orden/visibilidad, botones de portada, secciones nuevas,
// galería (moderación), tema del club y SEO.
import { getTheme, saveTheme } from "/js/core/theme.js";
import { auth } from "/js/auth/firebase.js";
import { LA, LX, lxf } from "/js/strings/screens/landing.js";
import {
  LEGACY_TOGGLES,
  SECTION_IDS,
  deletePhoto,
  listPhotosByStatus,
  loadIndexSettings,
  loadLandingConfig,
  saveIndexToggles,
  saveLandingConfig,
  sectionOrder,
  setPhotoStatus,
  uploadClubAsset,
  uploadGalleryPhoto,
} from "/js/features/landing/landing_data.js";
import { heroTitleList, sectionConfig } from "/js/features/landing/landing_sections.js";

const SECTION_LABEL = {
  hero: () => LA.sectionHero,
  calendar: () => LA.sectionCalendar,
  trainings: () => LA.sectionTrainings,
  join: () => LA.sectionJoin,
  featured: () => LA.sectionFeatured,
  stats: () => LA.sectionStats,
  events: () => LA.sectionEvents,
  honors: () => LA.sectionHonors,
  gallery: () => LA.sectionGallery,
  uniforms: () => LA.sectionUniforms,
  sponsors: () => LA.sectionSponsors,
};

let root = null;
let landing = {};
let indexSettings = {};

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const q = (sel) => root.querySelector(sel);

function card(id, title, hint, body) {
  return `
    <section class="card shadow-sm mt-4 admin-inner-card" id="${id}">
      <div class="card-body">
        <h2 class="h5 mb-1">${esc(title)}</h2>
        ${hint ? `<p class="text-muted small mb-3">${esc(hint)}</p>` : ""}
        ${body}
      </div>
    </section>`;
}

function input(id, label, value, { placeholder = "", type = "text", col = "col-12 col-md-6" } = {}) {
  return `
    <div class="${col}">
      <label class="form-label small" for="${id}">${esc(label)}</label>
      <input class="form-control" id="${id}" type="${type}" value="${esc(value ?? "")}" placeholder="${esc(placeholder)}" />
    </div>`;
}

function textarea(id, label, value, placeholder = "") {
  return `
    <div class="col-12">
      <label class="form-label small" for="${id}">${esc(label)}</label>
      <textarea class="form-control" id="${id}" rows="2" placeholder="${esc(placeholder)}">${esc(value ?? "")}</textarea>
    </div>`;
}

function saveRow(id) {
  return `
    <div class="col-12 d-flex align-items-center gap-3 mt-2">
      <button type="button" class="btn btn-primary" data-save="${id}"><i class="bi bi-save me-1"></i>${esc(LA.save)}</button>
      <span class="small" data-status="${id}"></span>
    </div>`;
}

function setStatus(id, ok, msg) {
  const el = root.querySelector(`[data-status="${id}"]`);
  if (!el) return;
  el.className = `small ${ok ? "text-success" : "text-danger"}`;
  el.textContent = msg || (ok ? LA.saved : LA.error);
  if (ok) setTimeout(() => { if (el.textContent === (msg || LA.saved)) el.textContent = ""; }, 2500);
}

const val = (id) => (q(`#${id}`)?.value || "").trim();

/* =========================
   Listas editables (pasos, números, patrocinadores)
========================= */
function listEditor(id, rows, fields) {
  const rowHtml = (row = {}) => `
    <div class="row g-2 align-items-end mb-2" data-row>
      ${fields.map((f) => f.type === "image"
        ? `<div class="${f.col}">
            <div class="d-flex align-items-center gap-2">
              <img class="rounded border bg-white" data-preview style="width:56px;height:40px;object-fit:contain;${row[f.key] ? "" : "display:none;"}" src="${esc(row[f.key] || "")}" alt="" />
              <input type="hidden" data-key="${f.key}" value="${esc(row[f.key] || "")}" />
              <input class="form-control form-control-sm" type="file" accept="image/*" data-upload="${f.key}" />
            </div>
          </div>`
        : `<div class="${f.col}">
            <input class="form-control form-control-sm" data-key="${f.key}" placeholder="${esc(f.label)}" value="${esc(row[f.key] || "")}" />
          </div>`).join("")}
      <div class="col-auto">
        <button type="button" class="btn btn-sm btn-outline-danger" data-remove-row title="${esc(LA.remove)}"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>`;

  setTimeout(() => {
    const wrap = q(`#${id}`);
    wrap.innerHTML = (rows.length ? rows : [{}]).map(rowHtml).join("");
    q(`[data-add-row="${id}"]`).onclick = () => wrap.insertAdjacentHTML("beforeend", rowHtml());
    wrap.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-remove-row]")) ev.target.closest("[data-row]").remove();
    });
    wrap.addEventListener("change", async (ev) => {
      const fileInput = ev.target.closest("[data-upload]");
      if (!fileInput?.files?.[0]) return;
      const row = fileInput.closest("[data-row]");
      fileInput.disabled = true;
      try {
        const url = await uploadClubAsset(fileInput.files[0], id);
        row.querySelector(`[data-key="${fileInput.dataset.upload}"]`).value = url;
        const img = row.querySelector("[data-preview]");
        img.src = url;
        img.style.display = "";
      } catch (err) {
        console.error(err);
        alert(`${LA.error} ${err?.code || ""}`);
      } finally {
        fileInput.disabled = false;
        fileInput.value = "";
      }
    });
  });

  return `
    <div class="col-12">
      <div id="${id}"></div>
      <button type="button" class="btn btn-sm btn-outline-primary" data-add-row="${id}">${esc(LA.add)}</button>
    </div>`;
}

function readList(id, keys) {
  return [...q(`#${id}`).querySelectorAll("[data-row]")]
    .map((row) => Object.fromEntries(keys.map((k) => [k, (row.querySelector(`[data-key="${k}"]`)?.value || "").trim()])))
    .filter((item) => keys.some((k) => item[k]));
}

/* =========================
   Secciones: orden + visibilidad
========================= */
function isOn(id) {
  if (id === "hero") return true;
  if (LEGACY_TOGGLES[id]) return indexSettings[LEGACY_TOGGLES[id]] === true;
  return sectionConfig(landing, id).enabled === true;
}

function orderCard() {
  return card("laOrder", LA.orderTitle, LA.orderHint, `
    <ul class="list-group mb-2" id="laOrderList">
      ${sectionOrder(landing).map((id) => `
        <li class="list-group-item d-flex align-items-center gap-2" data-id="${id}">
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-secondary" data-move="-1" title="${esc(LA.up)}"><i class="bi bi-arrow-up"></i></button>
            <button type="button" class="btn btn-outline-secondary" data-move="1" title="${esc(LA.down)}"><i class="bi bi-arrow-down"></i></button>
          </div>
          <span class="flex-grow-1 fw-semibold">${esc(SECTION_LABEL[id]?.() || id)}</span>
          ${id === "hero"
            ? `<span class="small text-muted">${esc(LA.alwaysOn)}</span>`
            : `<div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" data-toggle="${id}" ${isOn(id) ? "checked" : ""} /></div>`}
        </li>`).join("")}
    </ul>
    <div class="row">${saveRow("order")}</div>`);
}

function bindOrder() {
  q("#laOrderList").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-move]");
    if (!btn) return;
    const li = btn.closest("li");
    if (btn.dataset.move === "-1" && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
    if (btn.dataset.move === "1" && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
  });
}

async function saveOrder() {
  const order = [...q("#laOrderList").children].map((li) => li.dataset.id);
  const toggles = {};
  const sections = { ...(landing.sections || {}) };
  q("#laOrderList").querySelectorAll("[data-toggle]").forEach((chk) => {
    const id = chk.dataset.toggle;
    if (LEGACY_TOGGLES[id]) toggles[LEGACY_TOGGLES[id]] = chk.checked;
    else sections[id] = { ...(sections[id] || {}), enabled: chk.checked };
  });
  await Promise.all([saveLandingConfig({ order, sections }), saveIndexToggles(toggles)]);
  landing.order = order;
  landing.sections = sections;
  Object.assign(indexSettings, toggles);
  // el formulario viejo de visibilidad (si existe) queda en sync
  Object.entries(toggles).forEach(([key, on]) => {
    const map = { show_trainings: "idxShowTrainings", show_events: "idxShowEvents", show_honors: "idxShowHonors", show_uniforms: "idxShowUniforms", show_featured_activity: "idxShowFeaturedActivity" };
    const el = document.getElementById(map[key]);
    if (el) el.checked = on;
  });
}

/* =========================
   Cards de contenido
========================= */
function sec(id) {
  return landing.sections?.[id] || {};
}

function heroCard() {
  const h = sec("hero");
  const titles = heroTitleList(landing, "");
  return card("laHero", LA.heroCard, LA.heroCtaHint, `
    <div class="row g-3">
      <div class="col-12 col-md-9">
        <label class="form-label small" for="laHeroTitles">${esc(LA.heroTitles)}</label>
        <textarea class="form-control" id="laHeroTitles" rows="7">${esc(titles.join("\n\n"))}</textarea>
        <div class="form-text">${esc(LA.heroTitlesHint)}</div>
      </div>
      ${input("laHeroInterval", LA.heroInterval, h.intervalSec || "", { type: "number", placeholder: "4", col: "col-6 col-md-3" })}
      ${input("laHeroP1", `${LA.ctaPrimary} · ${LA.ctaLabel}`, h.ctaPrimaryLabel, { placeholder: LX.heroCtaPrimary })}
      ${input("laHeroP2", `${LA.ctaPrimary} · ${LA.ctaUrl}`, h.ctaPrimaryUrl, { placeholder: "/public/register.html" })}
      ${input("laHeroS1", `${LA.ctaSecondary} · ${LA.ctaLabel}`, h.ctaSecondaryLabel, { placeholder: LX.heroCtaSecondary })}
      ${input("laHeroS2", `${LA.ctaSecondary} · ${LA.ctaUrl}`, h.ctaSecondaryUrl, { placeholder: "#calendarSection" })}
      ${saveRow("hero")}
    </div>`);
}

function titleFields(prefix, cfg, defTitle, defSubtitle) {
  return `
    ${input(`${prefix}Title`, LA.title, cfg.title, { placeholder: defTitle })}
    ${defSubtitle !== undefined ? input(`${prefix}Subtitle`, LA.subtitle, cfg.subtitle, { placeholder: defSubtitle }) : ""}`;
}

function calendarCard() {
  return card("laCalendar", LA.calendarCard, LA.calendarHint, `
    <div class="row g-3">
      ${titleFields("laCal", sec("calendar"), LX.calendarTitle, LX.calendarSubtitle)}
      ${input("laCalCtaText", LA.calendarCtaTextLabel, sec("calendar").ctaText, { placeholder: LX.calendarCtaText })}
      ${input("laCalCtaBtn", LA.calendarCtaButtonLabel, sec("calendar").ctaButton, { placeholder: LX.calendarCtaButton })}
      ${saveRow("calendar")}
    </div>`);
}

function joinCard() {
  const j = sec("join");
  const steps = Array.isArray(j.steps) && j.steps.length
    ? j.steps
    : [1, 2, 3].map((n) => ({ title: LX[`joinStep${n}Title`], text: LX[`joinStep${n}Text`] }));
  return card("laJoin", LA.joinCard, LA.defaultHint, `
    <div class="row g-3">
      ${titleFields("laJoin", j, LX.joinTitle, LX.joinSubtitle)}
      <div class="col-12"><div class="fw-semibold small">${esc(LA.joinSteps)}</div></div>
      ${listEditor("laJoinSteps", steps, [
        { key: "title", label: LA.stepTitle, col: "col-12 col-md-4" },
        { key: "text", label: LA.stepText, col: "col" },
      ])}
      ${input("laJoinReg", LA.registerLabel, j.registerLabel, { placeholder: LX.joinRegister })}
      ${input("laJoinPick", LA.pickupsLabel, j.pickupsLabel, { placeholder: LX.joinPickups })}
      ${saveRow("join")}
    </div>`);
}

function statsCard() {
  const s = sec("stats");
  return card("laStats", LA.statsCard, LA.statsHint, `
    <div class="row g-3">
      ${titleFields("laStats", s, LX.statsTitle)}
      ${listEditor("laStatsItems", s.items || [], [
        { key: "value", label: LA.statValue, col: "col-4 col-md-3" },
        { key: "label", label: LA.statLabel, col: "col" },
      ])}
      ${saveRow("stats")}
    </div>`);
}

function sponsorsCard() {
  const s = sec("sponsors");
  return card("laSponsors", LA.sponsorsCard, "", `
    <div class="row g-3">
      ${titleFields("laSp", s, LX.sponsorsTitle, LX.sponsorsSubtitle)}
      ${listEditor("laSpItems", s.items || [], [
        { key: "logoUrl", label: LA.sponsorLogo, col: "col-12 col-md-5", type: "image" },
        { key: "name", label: LA.sponsorName, col: "col-6 col-md-3" },
        { key: "url", label: LA.sponsorUrl, col: "col" },
      ])}
      ${saveRow("sponsors")}
    </div>`);
}

function galleryCard() {
  const g = sectionConfig(landing, "gallery");
  return card("laGallery", LA.galleryCard, "", `
    <div class="row g-3">
      ${titleFields("laGal", g, LX.galleryTitle, LX.gallerySubtitle)}
      <div class="col-12">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="laGalUploads" ${g.allowUploads !== false ? "checked" : ""} />
          <label class="form-check-label" for="laGalUploads">${esc(LA.allowUploads)}</label>
        </div>
      </div>
      ${saveRow("gallery")}
      <div class="col-12"><hr class="my-1" /></div>
      <div class="col-12">
        <label class="form-label small" for="laGalAdminUpload">${esc(LA.adminUpload)}</label>
        <input class="form-control form-control-sm" id="laGalAdminUpload" type="file" accept="image/*" multiple />
        <div class="small mt-1" data-status="galUpload"></div>
      </div>
      <div class="col-12">
        <div class="fw-semibold small mb-2" id="laPendingTitle"></div>
        <div class="la-photos" id="laPending"></div>
      </div>
      <div class="col-12">
        <div class="fw-semibold small mb-2" id="laApprovedTitle"></div>
        <div class="la-photos" id="laApproved"></div>
      </div>
    </div>`);
}

let photos = { pending: [], approved: [] };

function photoTile(p, kind) {
  return `
    <div class="la-photo">
      <img src="${esc(p.url)}" alt="" loading="lazy" />
      <div class="la-photo__meta small text-truncate" title="${esc(p.caption || "")}">${esc(p.uploaderName || "")}${p.caption ? ` · ${esc(p.caption)}` : ""}</div>
      <div class="d-flex gap-1">
        ${kind === "pending" ? `
          <button type="button" class="btn btn-sm btn-success flex-fill" data-photo-act="approve" data-id="${p.id}">${esc(LA.approve)}</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-photo-act="reject" data-id="${p.id}" title="${esc(LA.reject)}"><i class="bi bi-x-lg"></i></button>`
        : `<button type="button" class="btn btn-sm btn-outline-secondary flex-fill" data-photo-act="reject" data-id="${p.id}">${esc(LA.reject)}</button>`}
        <button type="button" class="btn btn-sm btn-outline-danger" data-photo-act="delete" data-id="${p.id}" title="${esc(LA.delete)}"><i class="bi bi-trash"></i></button>
      </div>
    </div>`;
}

async function refreshPhotos() {
  try {
    const [pending, approved] = await Promise.all([listPhotosByStatus("pending"), listPhotosByStatus("approved")]);
    photos = { pending, approved };
  } catch (err) {
    console.warn("[landing admin] fotos:", err);
  }
  q("#laPendingTitle").textContent = lxf(LA.pendingTitle, { n: photos.pending.length });
  q("#laApprovedTitle").textContent = lxf(LA.approvedTitle, { n: photos.approved.length });
  q("#laPending").innerHTML = photos.pending.length
    ? photos.pending.map((p) => photoTile(p, "pending")).join("")
    : `<div class="text-muted small">${esc(LA.noPending)}</div>`;
  q("#laApproved").innerHTML = photos.approved.map((p) => photoTile(p, "approved")).join("");
}

function bindGallery() {
  q("#laGallery").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-photo-act]");
    if (!btn) return;
    const all = [...photos.pending, ...photos.approved];
    const photo = all.find((p) => p.id === btn.dataset.id);
    if (!photo) return;
    btn.disabled = true;
    try {
      if (btn.dataset.photoAct === "approve") await setPhotoStatus(photo.id, "approved");
      if (btn.dataset.photoAct === "reject") await setPhotoStatus(photo.id, "rejected");
      if (btn.dataset.photoAct === "delete") {
        if (!confirm(LA.deleteConfirm)) return;
        await deletePhoto(photo);
      }
      await refreshPhotos();
    } catch (err) {
      console.error(err);
      alert(`${LA.error} ${err?.code || ""}`);
    } finally {
      btn.disabled = false;
    }
  });

  q("#laGalAdminUpload").addEventListener("change", async (ev) => {
    const files = [...ev.target.files];
    if (!files.length) return;
    ev.target.disabled = true;
    try {
      for (const [i, f] of files.entries()) {
        setStatus("galUpload", true, lxf(LX.galleryUploading, { n: i + 1, total: files.length }));
        await uploadGalleryPhoto(f, { approved: true, uploaderName: auth.currentUser?.displayName || "" });
      }
      setStatus("galUpload", true);
      await refreshPhotos();
    } catch (err) {
      console.error(err);
      setStatus("galUpload", false, `${LA.error} ${err?.code || err?.message || ""}`);
    } finally {
      ev.target.disabled = false;
      ev.target.value = "";
    }
  });
}

/* =========================
   Tema
========================= */
function imageField(id, label, url) {
  return `
    <div class="col-12 col-md-6">
      <label class="form-label small" for="${id}File">${esc(label)}</label>
      <div class="d-flex align-items-center gap-2">
        <img id="${id}Preview" class="rounded border bg-light" style="width:64px;height:44px;object-fit:contain;${url ? "" : "display:none;"}" src="${esc(url || "")}" alt="" />
        <input type="hidden" id="${id}" value="${esc(url || "")}" />
        <input class="form-control form-control-sm" id="${id}File" type="file" accept="image/*" />
        <button type="button" class="btn btn-sm btn-outline-secondary" data-clear-image="${id}" title="${esc(LA.removeImage)}"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>`;
}

function bindImageField(id, prefix) {
  q(`#${id}File`).addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    ev.target.disabled = true;
    try {
      const url = await uploadClubAsset(file, prefix);
      q(`#${id}`).value = url;
      q(`#${id}Preview`).src = url;
      q(`#${id}Preview`).style.display = "";
    } catch (err) {
      console.error(err);
      alert(`${LA.error} ${err?.code || ""}`);
    } finally {
      ev.target.disabled = false;
      ev.target.value = "";
    }
  });
  q(`[data-clear-image="${id}"]`).addEventListener("click", () => {
    q(`#${id}`).value = "";
    q(`#${id}Preview`).style.display = "none";
  });
}

function themeCard() {
  const t = getTheme();
  const color = (id, label, value, fallback) => `
    <div class="col-6 col-md-3">
      <label class="form-label small" for="${id}">${esc(label)}</label>
      <input class="form-control form-control-color w-100" id="${id}" type="color" value="${esc(value || fallback)}" />
    </div>`;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return card("laTheme", LA.themeCard, LA.themeHint, `
    <div class="row g-3">
      ${color("laPrimary", LA.primary, t.primary, /^#[0-9a-f]{6}$/i.test(cssVar("--theme-primary")) ? cssVar("--theme-primary") : "#19473f")}
      ${color("laAccent", LA.accent, t.accent, /^#[0-9a-f]{6}$/i.test(cssVar("--theme-accent")) ? cssVar("--theme-accent") : "#e8ce26")}
      <div class="col-12 col-md-6"></div>
      ${imageField("laLogo", LA.logo, t.logoUrl)}
      ${imageField("laFavicon", LA.favicon, t.faviconUrl)}
      <div class="col-12">
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="laLogoText" ${t.logoShowText !== false ? "checked" : ""} />
          <label class="form-check-label" for="laLogoText">${esc(LA.logoShowText)}</label>
        </div>
      </div>
      ${saveRow("theme")}
    </div>`);
}

/* =========================
   SEO
========================= */
function seoCard() {
  const s = landing.seo || {};
  return card("laSeo", LA.seoCard, LA.seoHint, `
    <div class="row g-3">
      ${input("laSeoTitle", LA.seoTitle, s.title, { placeholder: document.title })}
      ${imageField("laSeoImage", LA.seoImage, s.imageUrl)}
      ${textarea("laSeoDesc", LA.seoDescription, s.description)}
      ${saveRow("seo")}
      <div class="col-12">
        <div class="fw-semibold small">${esc(LA.seoTagsTitle)}</div>
        <div class="text-muted small mb-1">${esc(LA.seoTagsHint)}</div>
        <textarea class="form-control form-control-sm font-monospace" id="laSeoTags" rows="5" readonly></textarea>
        <button type="button" class="btn btn-sm btn-outline-secondary mt-1" id="laSeoCopy">${esc(LA.copy)}</button>
      </div>
    </div>`);
}

function updateSeoTags() {
  const e = (v) => String(v || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const title = val("laSeoTitle") || document.title;
  const desc = val("laSeoDesc");
  const img = val("laSeoImage");
  q("#laSeoTags").value = [
    `<meta property="og:title" content="${e(title)}" />`,
    desc ? `<meta property="og:description" content="${e(desc)}" />` : "",
    desc ? `<meta name="description" content="${e(desc)}" />` : "",
    img ? `<meta property="og:image" content="${e(img)}" />` : "",
    `<meta property="og:type" content="website" />`,
  ].filter(Boolean).join("\n");
}

/* =========================
   Guardar
========================= */
async function saveSection(id, patch) {
  const sections = { ...(landing.sections || {}) };
  sections[id] = { ...(sections[id] || {}), ...patch };
  await saveLandingConfig({ sections });
  landing.sections = sections;
}

const SAVERS = {
  order: saveOrder,
  hero: () => saveSection("hero", {
    titles: String(q("#laHeroTitles").value || "")
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean),
    intervalSec: Math.min(30, Math.max(2, Number(val("laHeroInterval")) || 4)),
    ctaPrimaryLabel: val("laHeroP1"),
    ctaPrimaryUrl: val("laHeroP2"),
    ctaSecondaryLabel: val("laHeroS1"),
    ctaSecondaryUrl: val("laHeroS2"),
  }),
  calendar: () => saveSection("calendar", {
    title: val("laCalTitle"),
    subtitle: val("laCalSubtitle"),
    ctaText: val("laCalCtaText"),
    ctaButton: val("laCalCtaBtn"),
  }),
  join: () => saveSection("join", {
    title: val("laJoinTitle"),
    subtitle: val("laJoinSubtitle"),
    steps: readList("laJoinSteps", ["title", "text"]),
    registerLabel: val("laJoinReg"),
    pickupsLabel: val("laJoinPick"),
  }),
  stats: () => saveSection("stats", { title: val("laStatsTitle"), items: readList("laStatsItems", ["value", "label"]) }),
  sponsors: () => saveSection("sponsors", {
    title: val("laSpTitle"),
    subtitle: val("laSpSubtitle"),
    items: readList("laSpItems", ["logoUrl", "name", "url"]),
  }),
  gallery: () => saveSection("gallery", {
    title: val("laGalTitle"),
    subtitle: val("laGalSubtitle"),
    allowUploads: q("#laGalUploads").checked,
  }),
  theme: () => saveTheme({
    primary: val("laPrimary"),
    accent: val("laAccent"),
    logoUrl: val("laLogo"),
    faviconUrl: val("laFavicon"),
    logoShowText: q("#laLogoText").checked,
  }, auth.currentUser?.uid || null),
  seo: async () => {
    const seo = { title: val("laSeoTitle"), description: val("laSeoDesc"), imageUrl: val("laSeoImage") };
    await saveLandingConfig({ seo });
    landing.seo = seo;
  },
};

/* =========================
   Montaje
========================= */
export async function mountLandingAdmin(container) {
  root = container;
  [landing, indexSettings] = await Promise.all([
    loadLandingConfig().catch(() => ({})),
    loadIndexSettings().catch(() => ({})),
  ]);

  root.innerHTML = [
    orderCard(),
    heroCard(),
    calendarCard(),
    joinCard(),
    statsCard(),
    sponsorsCard(),
    galleryCard(),
    themeCard(),
    seoCard(),
  ].join("");

  bindOrder();
  bindGallery();
  bindImageField("laLogo", "logo");
  bindImageField("laFavicon", "favicon");
  bindImageField("laSeoImage", "share");
  ["laSeoTitle", "laSeoDesc"].forEach((id) => q(`#${id}`).addEventListener("input", updateSeoTags));
  q("#laSeoImageFile").addEventListener("change", () => setTimeout(updateSeoTags, 1500));
  q("#laSeoCopy").addEventListener("click", async () => {
    updateSeoTags();
    try {
      await navigator.clipboard.writeText(q("#laSeoTags").value);
      q("#laSeoCopy").textContent = LA.copied;
    } catch {
      q("#laSeoTags").select();
    }
  });
  updateSeoTags();

  root.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-save]");
    if (!btn) return;
    const id = btn.dataset.save;
    btn.disabled = true;
    try {
      await SAVERS[id]();
      setStatus(id, true);
    } catch (err) {
      console.error(err);
      setStatus(id, false, `${LA.error} ${err?.code || ""}`);
    } finally {
      btn.disabled = false;
    }
  });

  refreshPhotos();
}

export { SECTION_IDS };
