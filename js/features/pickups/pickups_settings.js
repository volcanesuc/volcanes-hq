// /js/features/pickups/pickups_settings.js
// Ajustes por club (club_config/pickups) + textos + formateo con zona horaria del club.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { PICKUP_STRINGS } from "/js/strings/pickups_strings.js";
import { getOverride, registerStrings } from "/js/core/texts.js";

registerStrings("pickups", "Pickups", PICKUP_STRINGS);

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_CLUB_CONFIG = APP_CONFIG.collections.club_config;
const DEFAULTS = APP_CONFIG.pickups || {};
const SETTINGS_DOC_ID = DEFAULTS.settingsDocId || "pickups";

let settings = buildSettings({});

function buildSettings(remote = {}) {
  return {
    timezone: remote.timezone || DEFAULTS.timezone || "America/Costa_Rica",
    locale: remote.locale || DEFAULTS.locale || "es-CR",
    currencyCode: remote.currencyCode || DEFAULTS.currencyCode || "CRC",
    currencySymbol: remote.currencySymbol ?? DEFAULTS.currencySymbol ?? "₡",

    defaultCapacity: num(remote.defaultCapacity, DEFAULTS.defaultCapacity ?? 0),
    defaultCancellationHours: num(remote.defaultCancellationHours, DEFAULTS.defaultCancellationHours ?? 6),
    allowWaitlistByDefault: bool(remote.allowWaitlistByDefault, DEFAULTS.allowWaitlistByDefault ?? true),
    noShowMustPayByDefault: bool(remote.noShowMustPayByDefault, DEFAULTS.noShowMustPayByDefault ?? true),
    blockMorosos: bool(remote.blockMorosos, DEFAULTS.blockMorosos ?? false),
    allowGuests: bool(remote.allowGuests, DEFAULTS.allowGuests ?? true),
    allowCompanions: bool(remote.allowCompanions, DEFAULTS.allowCompanions ?? true),

    payment: {
      sinpeNumber: remote.payment?.sinpeNumber || "",
      sinpeName: remote.payment?.sinpeName || "",
      instructions: remote.payment?.instructions || "",
    },

    whatsappCountryCode: String(remote.whatsappCountryCode || DEFAULTS.whatsappCountryCode || ""),
    postToFinance: bool(remote.postToFinance, DEFAULTS.postToFinance ?? true),
    financeCategory: remote.financeCategory || DEFAULTS.financeCategory || "pickup",

    pricingTiers: Array.isArray(remote.pricingTiers) && remote.pricingTiers.length
      ? remote.pricingTiers
      : (DEFAULTS.pricingTiers || []),

    venues: Array.isArray(remote.venues) ? remote.venues : [],

    strings: remote.strings && typeof remote.strings === "object" ? remote.strings : {},
  };
}

function num(v, fallback) {
  const n = Number(v);
  return v === undefined || v === null || v === "" || !Number.isFinite(n) ? fallback : n;
}

function bool(v, fallback) {
  return typeof v === "boolean" ? v : fallback;
}

/* =========================
   Load / save
========================= */
export async function loadPickupSettings() {
  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, SETTINGS_DOC_ID));
    settings = buildSettings(snap.exists() ? snap.data() : {});
  } catch (err) {
    console.warn("[pickups] No se pudieron cargar ajustes, usando defaults:", err);
    settings = buildSettings({});
  }
  return settings;
}

export async function savePickupSettings(next, uid = null) {
  const payload = { ...next, updatedAt: serverTimestamp(), updatedByUid: uid };
  await setDoc(doc(db, COL_CLUB_CONFIG, SETTINGS_DOC_ID), payload, { merge: false });
  settings = buildSettings(next);
  return settings;
}

export function getPickupSettings() {
  return settings;
}

/* =========================
   Textos
========================= */
// Orden: Ajustes > Textos (club_config/texts) > textos viejos de club_config/pickups > default.
export function t(key, vars = {}) {
  const override = getOverride(`pickups.${key}`) ?? settings.strings?.[key];
  const base = typeof override === "string" && override.trim() ? override : PICKUP_STRINGS[key];
  const text = base ?? key;
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : ""));
}

export function getAllStringKeys() {
  return Object.keys(PICKUP_STRINGS);
}

export function getDefaultString(key) {
  return PICKUP_STRINGS[key] ?? "";
}

// Aplica textos a elementos con data-t="key" (textContent) y data-t-placeholder="key".
export function applyStrings(root = document) {
  root.querySelectorAll("[data-t]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-t"));
  });
  root.querySelectorAll("[data-t-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-t-placeholder")));
  });
}

/* =========================
   Formato (zona horaria y moneda del club)
========================= */
export function money(value) {
  const n = Number(value || 0);
  const formatted = n.toLocaleString(settings.locale, { maximumFractionDigits: 2 });
  return `${settings.currencySymbol}${formatted}`;
}

function toDate(value) {
  if (!value) return null;
  const d = value?.toDate?.() ?? (value instanceof Date ? value : new Date(value));
  return isNaN(d) ? null : d;
}

function fmt(value, options) {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone, ...options }).format(d);
}

export function fmtDate(value) {
  return fmt(value, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

export function fmtTime(value) {
  return fmt(value, { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(value) {
  return fmt(value, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Partes de fecha en la zona del club.
function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

// "2026-11-02T18:30" (hora local del club) -> Date (UTC real).
export function clubLocalInputToDate(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // dos pasadas para cubrir cambios de horario
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), settings.timezone);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += asUtc - shown;
  }
  return new Date(guess);
}

// Date -> "2026-11-02T18:30" en hora local del club (para <input type="datetime-local">).
export function dateToClubLocalInput(value) {
  const d = toDate(value);
  if (!d) return "";
  const p = zonedParts(d, settings.timezone);
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

// Date -> "2026-11-02" en hora local del club.
export function dateToClubDay(value) {
  return dateToClubLocalInput(value).slice(0, 10);
}
