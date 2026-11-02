// /js/core/texts.js
// Textos editables por club (club_config/texts).
//
// - JS:   export const S = defineStrings("home", "Inicio", { hero: { title: "..." } });
//         S.hero.title ya trae el texto del club. Con variables: fmt(S.x, { n: 3 }).
// - HTML: <h1 data-tx="home.heroTitle">Texto por defecto</h1>
//         data-tx-placeholder / data-tx-title / data-tx-aria-label para atributos.
//         El texto que está en el HTML es el default (Ajustes > Textos lo lee de ahí).
//
// Los overrides se cargan antes de que corra cualquier módulo que importe este archivo
// (top-level await), con cache en localStorage para no esperar a Firestore en cada página.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_CLUB_CONFIG = APP_CONFIG.collections?.club_config || "club_config";
const TEXTS_DOC_ID = "texts";
const CACHE_KEY = `club_texts:${APP_CONFIG.firebase?.projectId || "app"}`;
const CACHE_FRESH_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

export const TEXT_ATTRS = ["placeholder", "title", "aria-label"];

const registry = new Map(); // ns -> { label, defaults: { "a.b": "..." } }

let overrides = {};

/* =========================
   Carga inicial
========================= */
function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.strings === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(strings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), strings }));
  } catch {
    /* sin storage: seguimos sin cache */
  }
}

async function fetchOverrides() {
  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, TEXTS_DOC_ID));
    const strings = snap.exists() ? cleanMap(snap.data()?.strings) : {};
    writeCache(strings);
    return strings;
  } catch (err) {
    console.warn("[texts] No se pudieron cargar los textos del club:", err?.code || err);
    return null;
  }
}

function cleanMap(map) {
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

const cached = readCache();
const pending = fetchOverrides();

if (cached && Date.now() - (cached.at || 0) < CACHE_FRESH_MS) {
  overrides = cached.strings;
} else {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS));
  overrides = (await Promise.race([pending, timeout])) || cached?.strings || {};
}

/* =========================
   API
========================= */
export function getOverride(key) {
  return overrides[key];
}

export function getOverrides() {
  return { ...overrides };
}

// Reemplaza {nombre} por vars.nombre.
export function fmt(text, vars = {}) {
  return String(text ?? "").replace(/\{(\w+)\}/g, (m, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ""
  );
}

// Texto por llave completa ("home.hero.title"), con fallback.
export function tx(key, fallback = "", vars) {
  const text = overrides[key] ?? lookupDefault(key) ?? fallback;
  return vars ? fmt(text, vars) : text;
}

function lookupDefault(fullKey) {
  const dot = fullKey.indexOf(".");
  if (dot < 0) return undefined;
  return registry.get(fullKey.slice(0, dot))?.defaults[fullKey.slice(dot + 1)];
}

// Registra los textos de una pantalla y devuelve el mismo objeto con los del club aplicados.
// Solo se reemplazan hojas string; números, arrays de objetos, etc. se recorren igual.
export function defineStrings(ns, label, obj, { skip = [] } = {}) {
  const defaults = {};
  walk(obj, "", (path, value, parent, prop) => {
    const parts = path.split(".");
    if (skip.some((s) => parts.includes(s))) return;
    defaults[path] = value;
    const o = overrides[`${ns}.${path}`];
    if (typeof o === "string") parent[prop] = o;
  });
  registerStrings(ns, label, defaults);
  return obj;
}

// Para módulos que ya tienen un mapa plano ("a.b": "texto").
export function registerStrings(ns, label, flatDefaults) {
  const prev = registry.get(ns);
  registry.set(ns, {
    label: label || prev?.label || ns,
    defaults: { ...(prev?.defaults || {}), ...flatDefaults },
  });
}

function walk(node, prefix, visit) {
  if (!node || typeof node !== "object") return;
  for (const prop of Object.keys(node)) {
    const value = node[prop];
    const path = prefix ? `${prefix}.${prop}` : prop;
    if (typeof value === "string") visit(path, value, node, prop);
    else if (value && typeof value === "object") walk(value, path, visit);
  }
}

export function getRegistry() {
  return registry;
}

/* =========================
   HTML
========================= */
export function applyTexts(root = document) {
  if (!root?.querySelectorAll) return;
  const nodes = [...root.querySelectorAll("[data-tx]")];
  if (root.matches?.("[data-tx]")) nodes.push(root);
  for (const el of nodes) {
    const v = overrides[el.getAttribute("data-tx")];
    if (typeof v === "string") el.textContent = v;
  }
  for (const attr of TEXT_ATTRS) {
    root.querySelectorAll(`[data-tx-${attr}]`).forEach((el) => {
      const v = overrides[el.getAttribute(`data-tx-${attr}`)];
      if (typeof v === "string") el.setAttribute(attr, v);
    });
  }
}

// Lee los textos por defecto de un HTML (para el editor).
export function harvestHtmlTexts(html) {
  const out = {};
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("[data-tx]").forEach((el) => {
    out[el.getAttribute("data-tx")] = el.textContent.trim().replace(/\s+/g, " ");
  });
  for (const attr of TEXT_ATTRS) {
    parsed.querySelectorAll(`[data-tx-${attr}]`).forEach((el) => {
      out[el.getAttribute(`data-tx-${attr}`)] = el.getAttribute(attr) || "";
    });
  }
  return out;
}

/* =========================
   Guardar (admin)
========================= */
export async function saveTextOverrides(strings, uid = null) {
  const clean = cleanMap(strings);
  await setDoc(doc(db, COL_CLUB_CONFIG, TEXTS_DOC_ID), {
    strings: clean,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
  });
  overrides = clean;
  writeCache(clean);
  return clean;
}

export async function reloadTextOverrides() {
  const fresh = await fetchOverrides();
  if (fresh) overrides = fresh;
  return getOverrides();
}

/* =========================
   Auto-aplicar
========================= */
// Los scripts module corren con el DOM ya parseado.
applyTexts(document);
// Modales/partials que llegan después.
if (typeof MutationObserver !== "undefined" && document.body) {
  new MutationObserver((records) => {
    if (!Object.keys(overrides).length) return;
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && (n.hasAttribute?.("data-tx") || n.querySelector?.("[data-tx], [data-tx-placeholder], [data-tx-title], [data-tx-aria-label]"))) {
          applyTexts(n);
        }
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
