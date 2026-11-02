// /js/core/theme.js
// Tema del club desde Firebase (club_config/theme): colores, logo y favicon.
// Se aplica apenas se importa (con cache) y se refresca en segundo plano.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_CLUB_CONFIG = APP_CONFIG.collections?.club_config || "club_config";
const THEME_DOC_ID = "theme";
const CACHE_KEY = `club_theme:${APP_CONFIG.firebase?.projectId || "app"}`;

let theme = readCache() || {};

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value || {}));
  } catch {
    /* sin storage */
  }
}

const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ""));

// mezcla un color con blanco (amount > 0) o negro (amount < 0)
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const a = Math.abs(amount);
  const mix = (c) => Math.round(c + (target - c) * a);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function getTheme() {
  return { ...theme };
}

export function applyTheme(t = theme) {
  const root = document.documentElement.style;
  if (isHex(t.primary)) {
    root.setProperty("--theme-primary", t.primary);
    root.setProperty("--theme-primary-dark", shade(t.primary, -0.15));
    root.setProperty("--theme-primary-light", shade(t.primary, 0.15));
  }
  if (isHex(t.accent)) root.setProperty("--theme-accent", t.accent);

  if (t.faviconUrl) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = t.faviconUrl;
  }
  if (isHex(t.primary)) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = t.primary;
  }
}

// Logo en el header: imagen si hay logoUrl, si no el texto del club.
export function logoHtml(text) {
  const safe = String(text || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  if (!theme.logoUrl) return safe;
  const url = String(theme.logoUrl).replace(/"/g, "&quot;");
  return `<img class="club-logo-img" src="${url}" alt="${safe}" />${theme.logoShowText === false ? "" : `<span class="club-logo-text">${safe}</span>`}`;
}

export async function saveTheme(next, uid = null) {
  const clean = {
    primary: isHex(next.primary) ? next.primary : null,
    accent: isHex(next.accent) ? next.accent : null,
    logoUrl: next.logoUrl || null,
    faviconUrl: next.faviconUrl || null,
    logoShowText: next.logoShowText !== false,
  };
  await setDoc(doc(db, COL_CLUB_CONFIG, THEME_DOC_ID), { ...clean, updatedAt: serverTimestamp(), updatedByUid: uid });
  theme = clean;
  writeCache(clean);
  applyTheme(clean);
  return clean;
}

applyTheme(theme);

getDoc(doc(db, COL_CLUB_CONFIG, THEME_DOC_ID))
  .then((snap) => {
    const fresh = snap.exists() ? snap.data() : {};
    delete fresh.updatedAt;
    const changed = JSON.stringify(fresh) !== JSON.stringify(theme);
    theme = fresh;
    writeCache(fresh);
    if (changed) {
      applyTheme(fresh);
      window.dispatchEvent(new CustomEvent("club-theme:changed", { detail: fresh }));
    }
  })
  .catch((err) => console.warn("[theme] no se pudo cargar:", err?.code || err));
