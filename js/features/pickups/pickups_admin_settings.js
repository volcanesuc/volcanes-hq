// /js/features/pickups/pickups_admin_settings.js
// Admin > Ajustes: zona horaria, reglas por defecto, SINPE, tarifas, canchas y textos del club.
import { auth } from "/js/auth/firebase.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import { mountTextsEditor } from "/js/components/texts_editor.js";
import {
  applyStrings,
  getPickupSettings,
  savePickupSettings,
  t,
} from "/js/features/pickups/pickups_settings.js";

import { escapeHtml, slugify } from "/js/features/pickups/pickups_shared.js";
import { mountTierEditor } from "/js/features/pickups/pickups_admin_ui.js";

let ctx = null;
let root = null;
let tierEditor = null;

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["America/Costa_Rica", "America/Mexico_City", "America/Bogota", "America/New_York", "Europe/Madrid", "UTC"];
  }
})();

const field = (id, labelKey, input) => `
  <div class="col-12 col-md-6 col-lg-4">
    <label class="form-label small" for="${id}">${escapeHtml(t(labelKey))}</label>
    ${input}
  </div>`;

// Texto largo de página pública; el placeholder muestra el default.
const pageField = (id, labelKey, value, defaultKey) => `
  <div class="col-12">
    <label class="form-label small" for="${id}">${escapeHtml(t(labelKey))}</label>
    <textarea id="${id}" class="form-control form-control-sm" rows="5"
      placeholder="${escapeHtml(t(defaultKey, { hours: "{hours}" }))}">${escapeHtml(value || "")}</textarea>
  </div>`;

const toggle = (id, labelKey, checked) => `
  <div class="col-12 col-md-6">
    <div class="form-check form-switch">
      <input class="form-check-input" type="checkbox" id="${id}" ${checked ? "checked" : ""} />
      <label class="form-check-label" for="${id}">${escapeHtml(t(labelKey))}</label>
    </div>
  </div>`;

function venueRowHtml(v = {}) {
  return `
    <div class="row g-2 align-items-center" data-venue-row data-venue-id="${escapeHtml(v.id || "")}">
      <div class="col-12 col-md-3"><input class="form-control form-control-sm" data-v-name placeholder="${escapeHtml(t("settings.venueName"))}" value="${escapeHtml(v.name || "")}" /></div>
      <div class="col-12 col-md-3"><input class="form-control form-control-sm" data-v-address placeholder="${escapeHtml(t("settings.venueAddress"))}" value="${escapeHtml(v.address || "")}" /></div>
      <div class="col-12 col-md-2"><input class="form-control form-control-sm" data-v-maps placeholder="${escapeHtml(t("settings.venueMaps"))}" value="${escapeHtml(v.mapsUrl || "")}" /></div>
      <div class="col-5 col-md-2"><input class="form-control form-control-sm" data-v-capacity type="number" min="0" placeholder="${escapeHtml(t("settings.venueCapacity"))}" value="${escapeHtml(v.capacity ?? "")}" /></div>
      <div class="col-5 col-md-1">
        <div class="form-check" title="${escapeHtml(t("settings.venueWaitlist"))}">
          <input class="form-check-input" type="checkbox" data-v-waitlist ${v.allowWaitlist !== false ? "checked" : ""} aria-label="${escapeHtml(t("settings.venueWaitlist"))}" />
        </div>
      </div>
      <div class="col-2 col-md-1 text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-v-remove>✕</button></div>
    </div>`;
}

export function initSettings(context) {
  ctx = context;
  root = document.getElementById("settingsRoot");
}

export function renderSettings() {
  if (!root) return;
  const s = getPickupSettings();

  root.innerHTML = `
    <form id="settingsForm" novalidate>
      <div class="card shadow-sm mb-3"><div class="card-body">
        <h2 class="h6 mb-3">${escapeHtml(t("settings.general"))}</h2>
        <div class="row g-3">
          ${field("stTimezone", "settings.timezone", `<select id="stTimezone" class="form-select form-select-sm">${TIMEZONES.map((z) => `<option ${z === s.timezone ? "selected" : ""}>${escapeHtml(z)}</option>`).join("")}</select>`)}
          ${field("stLocale", "settings.locale", `<input id="stLocale" class="form-control form-control-sm" value="${escapeHtml(s.locale)}" />`)}
          ${field("stCurrencySymbol", "settings.currencySymbol", `<input id="stCurrencySymbol" class="form-control form-control-sm" value="${escapeHtml(s.currencySymbol)}" />`)}
          ${field("stCurrencyCode", "settings.currencyCode", `<input id="stCurrencyCode" class="form-control form-control-sm" value="${escapeHtml(s.currencyCode)}" />`)}
          ${field("stDeadline", "settings.deadlineHours", `<input id="stDeadline" type="number" min="0" step="0.5" class="form-control form-control-sm" value="${escapeHtml(s.defaultCancellationHours)}" />`)}
          ${field("stCapacity", "settings.defaultCapacity", `<input id="stCapacity" type="number" min="0" class="form-control form-control-sm" value="${escapeHtml(s.defaultCapacity)}" />`)}
          ${toggle("stWaitlist", "settings.allowWaitlist", s.allowWaitlistByDefault)}
          ${toggle("stNoShow", "settings.noShowMustPay", s.noShowMustPayByDefault)}
          ${toggle("stBlockMorosos", "settings.blockMorosos", s.blockMorosos)}
          ${toggle("stGuests", "settings.allowGuests", s.allowGuests)}
          ${toggle("stCompanions", "settings.allowCompanions", s.allowCompanions)}
        </div>
      </div></div>

      <div class="card shadow-sm mb-3"><div class="card-body">
        <h2 class="h6 mb-3">${escapeHtml(t("settings.payment"))}</h2>
        <div class="row g-3">
          ${field("stSinpeNumber", "settings.sinpeNumber", `<input id="stSinpeNumber" class="form-control form-control-sm" value="${escapeHtml(s.payment.sinpeNumber)}" />`)}
          ${field("stSinpeName", "settings.sinpeName", `<input id="stSinpeName" class="form-control form-control-sm" value="${escapeHtml(s.payment.sinpeName)}" />`)}
          ${field("stWaCountry", "settings.whatsappCountry", `<input id="stWaCountry" class="form-control form-control-sm" value="${escapeHtml(s.whatsappCountryCode)}" />`)}
          <div class="col-12">
            <label class="form-label small" for="stInstructions">${escapeHtml(t("settings.paymentInstructions"))}</label>
            <textarea id="stInstructions" class="form-control form-control-sm" rows="2">${escapeHtml(s.payment.instructions)}</textarea>
          </div>
          ${toggle("stPostFinance", "settings.postToFinance", s.postToFinance)}
          ${field("stFinanceCategory", "settings.financeCategory", `<input id="stFinanceCategory" class="form-control form-control-sm" value="${escapeHtml(s.financeCategory)}" />`)}
        </div>
      </div></div>

      <div class="card shadow-sm mb-3"><div class="card-body">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-1">
          <h2 class="h6 mb-0">${escapeHtml(t("settings.publicPage"))}</h2>
          <div class="d-flex gap-2 flex-wrap">
            <a class="btn btn-sm btn-outline-secondary" href="/public/pickup_policy.html" target="_blank" rel="noopener">${escapeHtml(t("settings.viewPolicy"))}</a>
            <a class="btn btn-sm btn-outline-secondary" href="/public/pickups.html" target="_blank" rel="noopener">${escapeHtml(t("settings.viewCalendar"))}</a>
          </div>
        </div>
        <div class="small text-muted mb-3">${escapeHtml(t("settings.publicPageHint"))}</div>
        <div class="row g-3">
          ${field("stContactWa", "settings.contactWhatsapp", `<input id="stContactWa" class="form-control form-control-sm" type="tel" value="${escapeHtml(s.contact.whatsapp)}" placeholder="${escapeHtml(s.payment.sinpeNumber)}" />`)}
          ${pageField("stAboutPickup", "settings.aboutPickup", s.pages.aboutPickup, "calendar.aboutBody")}
          ${pageField("stPolicyCancellation", "settings.policyCancellation", s.pages.policyCancellation, "policy.cancellationBody")}
          ${pageField("stPolicyRefunds", "settings.policyRefunds", s.pages.policyRefunds, "policy.refundsBody")}
        </div>
        <div class="small text-muted mt-2">${escapeHtml(t("settings.moreTexts"))}</div>
      </div></div>

      <div class="card shadow-sm mb-3"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <h2 class="h6 mb-0">${escapeHtml(t("settings.tiers"))}</h2>
          <button type="button" class="btn btn-sm btn-outline-primary" id="stAddTier">${escapeHtml(t("settings.addTier"))}</button>
        </div>
        <div class="small text-muted mb-2">${escapeHtml(t("settings.tiersHint"))}</div>
        <div id="stTiers" class="d-grid gap-2"></div>
      </div></div>

      <div class="card shadow-sm mb-3"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h2 class="h6 mb-0">${escapeHtml(t("settings.venues"))}</h2>
          <button type="button" class="btn btn-sm btn-outline-primary" id="stAddVenue">${escapeHtml(t("settings.addVenue"))}</button>
        </div>
        <div id="stVenues" class="d-grid gap-2">${s.venues.map(venueRowHtml).join("")}</div>
      </div></div>

      <div class="d-flex justify-content-end mb-4">
        <button type="submit" class="btn btn-primary">${escapeHtml(t("common.save"))}</button>
      </div>
    </form>
    <div id="stTexts"></div>
  `;

  tierEditor = mountTierEditor(root.querySelector("#stTiers"), root.querySelector("#stAddTier"), s.pricingTiers);

  root.querySelector("#stAddVenue").onclick = () =>
    root.querySelector("#stVenues").insertAdjacentHTML("beforeend", venueRowHtml({ allowWaitlist: true }));
  root.querySelector("#stVenues").onclick = (ev) => {
    if (ev.target.closest("[data-v-remove]")) ev.target.closest("[data-venue-row]").remove();
  };

  mountTextsEditor(root.querySelector("#stTexts"), {
    section: "pickups",
    legacy: { pickups: s.strings },
    onSaved: () => applyStrings(),
  });

  root.querySelector("#settingsForm").onsubmit = onSave;
}

function readVenues() {
  const used = new Set();
  return [...root.querySelectorAll("[data-venue-row]")]
    .map((row) => {
      const name = row.querySelector("[data-v-name]").value.trim();
      if (!name) return null;
      let id = row.getAttribute("data-venue-id") || slugify(name) || "venue";
      while (used.has(id)) id = `${id}-2`;
      used.add(id);
      return {
        id,
        name,
        address: row.querySelector("[data-v-address]").value.trim(),
        mapsUrl: row.querySelector("[data-v-maps]").value.trim(),
        capacity: Math.max(0, Number(row.querySelector("[data-v-capacity]").value || 0)),
        allowWaitlist: row.querySelector("[data-v-waitlist]").checked,
      };
    })
    .filter(Boolean);
}

async function onSave(ev) {
  ev.preventDefault();
  const v = (id) => root.querySelector(`#${id}`).value.trim();
  const c = (id) => root.querySelector(`#${id}`).checked;

  const next = {
    timezone: v("stTimezone"),
    locale: v("stLocale") || "es-CR",
    currencySymbol: v("stCurrencySymbol"),
    currencyCode: v("stCurrencyCode") || "CRC",
    defaultCancellationHours: Math.max(0, Number(v("stDeadline") || 0)),
    defaultCapacity: Math.max(0, Number(v("stCapacity") || 0)),
    allowWaitlistByDefault: c("stWaitlist"),
    noShowMustPayByDefault: c("stNoShow"),
    blockMorosos: c("stBlockMorosos"),
    allowGuests: c("stGuests"),
    allowCompanions: c("stCompanions"),
    payment: {
      sinpeNumber: v("stSinpeNumber"),
      sinpeName: v("stSinpeName"),
      instructions: v("stInstructions"),
    },
    whatsappCountryCode: v("stWaCountry"),
    contact: { whatsapp: v("stContactWa") },
    pages: {
      aboutPickup: v("stAboutPickup"),
      policyCancellation: v("stPolicyCancellation"),
      policyRefunds: v("stPolicyRefunds"),
    },
    postToFinance: c("stPostFinance"),
    financeCategory: v("stFinanceCategory") || "pickup",
    pricingTiers: tierEditor.read(),
    venues: readVenues(),
    // Los textos ahora se guardan en club_config/texts (editor de abajo); estos quedan como respaldo.
    strings: getPickupSettings().strings,
  };

  showLoader();
  try {
    await savePickupSettings(next, auth.currentUser?.uid || null);
    applyStrings();
    await ctx.reload();
    renderSettings();
    ctx.alert(t("common.saved"), "success");
  } catch (err) {
    console.error(err);
    ctx.alert(err?.message || t("common.error"), "danger");
  } finally {
    hideLoader();
  }
}
