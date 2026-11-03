// /js/components/texts_editor.js
// Editor de Ajustes > Textos: los textos de la app agrupados por pantalla (como el menú)
// y, dentro de cada pantalla, en cards por sección. Guarda solo lo cambiado en club_config/texts.
import { auth } from "/js/auth/firebase.js";
import {
  defineStrings,
  fmt,
  getOverrides,
  getRegistry,
  harvestHtmlTexts,
  registerStrings,
  saveTextOverrides,
} from "/js/core/texts.js";
import { HTML_SOURCES, NAMESPACE_LABELS, TEXT_SCREENS } from "/js/strings/all_strings.js";

const S = defineStrings("textsEditor", "Ajustes: editor de textos", {
  title: "Textos",
  hint: "Elegí una pantalla y cambiá lo que quieras. Dejá un campo vacío para usar el texto original. Las palabras entre {llaves} se reemplazan solas: dejalas igual.",
  search: "Buscar en todas las pantallas…",
  onlyChanged: "Solo modificados",
  screens: "Pantallas",
  others: "Otros",
  original: "Original",
  yourText: "Tu texto",
  changed: "Cambiado",
  reset: "Volver al original",
  save: "Guardar textos",
  saving: "Guardando…",
  saved: "Textos guardados. Recargá las otras páginas para verlos.",
  error: "No se pudieron guardar los textos.",
  loading: "Cargando textos…",
  changedCount: "{n} modificados",
  textsCount: "{n} textos",
  empty: "No hay textos que coincidan.",
  unsaved: "Tenés cambios sin guardar.",
  resultsFor: "Resultados en todas las pantallas",
  pageSection: "Lo que se ve al abrir la pantalla.",
  modalSection: "Ventana que se abre desde esta pantalla.",
  messagesSection: "Mensajes, botones y avisos que aparecen al usarla.",
  messages: "Mensajes y botones",
});

let htmlLoaded = null;
let hasUnsaved = () => false;

window.addEventListener("beforeunload", (ev) => {
  if (hasUnsaved()) {
    ev.preventDefault();
    ev.returnValue = "";
  }
});

// Lee los textos de los HTML (el texto del HTML es el default).
function loadHtmlDefaults() {
  if (htmlLoaded) return htmlLoaded;
  htmlLoaded = Promise.all(
    HTML_SOURCES.map(async (file) => {
      try {
        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) return;
        const byNs = {};
        for (const [key, value] of Object.entries(harvestHtmlTexts(await res.text()))) {
          const dot = key.indexOf(".");
          if (dot < 0) continue;
          const ns = key.slice(0, dot);
          (byNs[ns] ||= {})[key.slice(dot + 1)] = value;
        }
        for (const [ns, defaults] of Object.entries(byNs)) registerStrings(ns, NAMESPACE_LABELS[ns], defaults);
      } catch (err) {
        console.warn("[texts] No se pudo leer", file, err);
      }
    })
  );
  return htmlLoaded;
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pantallas con sus secciones (namespaces que existen en el registro). Lo que sobra va a "Otros".
function buildScreens(registry) {
  const used = new Set();
  const screens = TEXT_SCREENS.map((s) => {
    const ns = s.ns.filter((n) => registry.has(n));
    ns.forEach((n) => used.add(n));
    return { ...s, ns };
  });
  const rest = [...registry.keys()].filter((n) => !used.has(n)).sort();
  if (rest.length) screens.push({ id: "otros", group: S.others, label: S.others, ns: rest });
  return screens.filter((s) => s.ns.length);
}

// "header.logoText" → "header › logo text": pista de dónde va el texto cuando dos originales son iguales.
function keyHint(key) {
  return key
    .split(".")
    .slice(1)
    .map((part) => part.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/_/g, " ").toLowerCase())
    .join(" › ");
}

function sectionMeta(ns, registry) {
  const isHtml = ns.startsWith("html_");
  const label = NAMESPACE_LABELS[ns] || (isHtml ? registry.get(ns)?.label || ns : `${S.messages} · ${registry.get(ns)?.label || ns}`);
  const isModal = /ventana|modal/i.test(label);
  const hint = isModal ? S.modalSection : isHtml ? S.pageSection : S.messagesSection;
  return { label, hint, order: isHtml && !isModal ? 0 : isModal ? 2 : 1 };
}

/**
 * @param {HTMLElement} container
 * @param {{ section?: string, legacy?: Record<string, Record<string,string>>, onSaved?: Function }} opts
 *   section: si viene un namespace, el editor queda fijo en la pantalla que lo contiene (sin menú lateral).
 *   legacy: textos guardados en otro lado antes ({ pickups: { "key": "texto" } }), se precargan.
 */
export async function mountTextsEditor(container, { section = "", legacy = {}, onSaved } = {}) {
  container.innerHTML = `<div class="text-muted small py-3">${escapeHtml(S.loading)}</div>`;
  await loadHtmlDefaults();

  const registry = getRegistry();
  const edits = getOverrides();
  for (const [ns, map] of Object.entries(legacy || {})) {
    for (const [k, v] of Object.entries(map || {})) {
      if (typeof v === "string" && v.trim() && edits[`${ns}.${k}`] === undefined) edits[`${ns}.${k}`] = v;
    }
  }

  const screens = buildScreens(registry);
  const locked = section ? screens.find((s) => s.ns.includes(section)) : null;
  let current = locked?.id || screens[0]?.id || "";
  let dirty = false;

  const isChanged = (key) => typeof edits[key] === "string" && edits[key].trim() !== "";
  const keysOf = (ns) => Object.keys(registry.get(ns)?.defaults || {}).map((k) => `${ns}.${k}`);
  const changedIn = (screen) => screen.ns.reduce((n, ns) => n + keysOf(ns).filter(isChanged).length, 0);

  container.innerHTML = `
    <div class="te">
      <div class="te-intro">
        <h2 class="h5 mb-1">${escapeHtml(S.title)}</h2>
        <p class="small text-muted mb-0">${escapeHtml(S.hint)}</p>
      </div>

      <div class="te-layout ${locked ? "te-layout--locked" : ""}">
        ${locked ? "" : `
          <aside class="te-nav">
            <select class="form-select d-lg-none mb-2" data-te-screen-select aria-label="${escapeHtml(S.screens)}"></select>
            <nav class="te-nav__list d-none d-lg-block" data-te-screen-list aria-label="${escapeHtml(S.screens)}"></nav>
          </aside>`}

        <div class="te-main">
          <div class="ui-filterbar mb-3">
            <div class="ui-search">
              <i class="bi bi-search"></i>
              <input type="search" class="form-control" data-te-search placeholder="${escapeHtml(S.search)}" />
            </div>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="teOnlyChanged" data-te-changed />
              <label class="form-check-label small" for="teOnlyChanged">${escapeHtml(S.onlyChanged)}</label>
            </div>
          </div>
          <div data-te-cards></div>
        </div>
      </div>

      <div class="te-savebar">
        <div class="small" data-te-status></div>
        <span class="ui-chip" data-te-count></span>
        <button type="button" class="btn btn-primary" data-te-save>${escapeHtml(S.save)}</button>
      </div>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);
  const cardsEl = $("[data-te-cards]");
  const statusEl = $("[data-te-status]");

  function setStatus(text, kind = "muted") {
    statusEl.className = `small text-${kind}`;
    statusEl.textContent = text || "";
  }

  function updateCount() {
    const n = Object.keys(edits).filter(isChanged).length;
    $("[data-te-count]").textContent = fmt(S.changedCount, { n });
  }

  function renderNav() {
    if (locked) return;
    const list = $("[data-te-screen-list]");
    const select = $("[data-te-screen-select]");
    let lastGroup = "";
    const items = [];
    const options = [];
    for (const s of screens) {
      if (s.group !== lastGroup) {
        if (lastGroup) options.push("</optgroup>");
        items.push(`<div class="te-nav__group">${escapeHtml(s.group)}</div>`);
        options.push(`<optgroup label="${escapeHtml(s.group)}">`);
        lastGroup = s.group;
      }
      const n = changedIn(s);
      items.push(`
        <button type="button" class="te-nav__item ${s.id === current ? "is-active" : ""}" data-te-screen="${s.id}">
          <span>${escapeHtml(s.label)}</span>
          ${n ? `<span class="ui-chip__n">${n}</span>` : ""}
        </button>`);
      options.push(`<option value="${s.id}" ${s.id === current ? "selected" : ""}>${escapeHtml(s.label)}${n ? ` (${n})` : ""}</option>`);
    }
    options.push("</optgroup>");
    list.innerHTML = items.join("");
    select.innerHTML = options.join("");
  }

  function rowHtml(key, def) {
    const val = edits[key] || "";
    const lines = Math.min(4, Math.max(1, Math.ceil(Math.max(def.length, val.length) / 60)));
    return `
      <div class="te-row ${isChanged(key) ? "is-changed" : ""}" data-key="${escapeHtml(key)}">
        <div class="te-row__original">
          <div class="te-row__label">${escapeHtml(S.original)}</div>
          <div class="te-row__text">${escapeHtml(def) || "—"}</div>
          <div class="te-row__key" title="${escapeHtml(key)}">${escapeHtml(keyHint(key))}</div>
        </div>
        <div class="te-row__edit">
          <textarea class="form-control form-control-sm" rows="${lines}" data-te-input="${escapeHtml(key)}"
            placeholder="${escapeHtml(def)}" aria-label="${escapeHtml(S.yourText)}">${escapeHtml(val)}</textarea>
          <div class="te-row__foot">
            <span class="te-row__badge">${escapeHtml(S.changed)}</span>
            <button type="button" class="btn btn-link btn-sm p-0" data-te-reset="${escapeHtml(key)}">${escapeHtml(S.reset)}</button>
          </div>
        </div>
      </div>`;
  }

  function sectionCard(ns, rows, screenLabel = "") {
    const meta = sectionMeta(ns, registry);
    return `
      <section class="te-card">
        <header class="te-card__head">
          <div>
            ${screenLabel ? `<div class="te-card__screen">${escapeHtml(screenLabel)}</div>` : ""}
            <h3 class="te-card__title">${escapeHtml(meta.label)}</h3>
            <div class="te-card__hint">${escapeHtml(meta.hint)}</div>
          </div>
          <span class="te-card__count">${escapeHtml(fmt(S.textsCount, { n: rows.length }))}</span>
        </header>
        <div class="te-card__rows">${rows.map(({ key, def }) => rowHtml(key, def)).join("")}</div>
      </section>`;
  }

  function rowsFor(ns, term, onlyChanged) {
    const defaults = registry.get(ns)?.defaults || {};
    return Object.keys(defaults)
      .map((k) => ({ key: `${ns}.${k}`, def: defaults[k] }))
      .filter(({ key, def }) => {
        if (onlyChanged && !isChanged(key)) return false;
        if (!term) return true;
        return `${key} ${def} ${edits[key] || ""}`.toLowerCase().includes(term);
      });
  }

  function renderCards() {
    const term = $("[data-te-search]").value.trim().toLowerCase();
    const onlyChanged = $("[data-te-changed]").checked;
    // Con búsqueda se busca en todas las pantallas; si no, solo en la elegida.
    const global = !!term && !locked;
    const list = global ? screens : screens.filter((s) => s.id === current);
    const cards = [];

    for (const screen of list) {
      const sections = screen.ns
        .map((ns) => ({ ns, rows: rowsFor(ns, term, onlyChanged), order: sectionMeta(ns, registry).order }))
        .filter((s) => s.rows.length)
        .sort((a, b) => a.order - b.order);
      for (const { ns, rows } of sections) {
        cards.push(sectionCard(ns, rows, global ? `${screen.group} › ${screen.label}` : ""));
      }
    }

    cardsEl.innerHTML = cards.length
      ? `${global ? `<div class="te-results">${escapeHtml(S.resultsFor)}</div>` : ""}${cards.join("")}`
      : `<div class="ui-empty">${escapeHtml(S.empty)}</div>`;
    updateCount();
  }

  function render() {
    renderNav();
    renderCards();
  }

  function selectScreen(id) {
    current = id;
    $("[data-te-search]").value = "";
    render();
  }

  container.addEventListener("click", (ev) => {
    const screenBtn = ev.target.closest("[data-te-screen]");
    if (screenBtn) {
      selectScreen(screenBtn.dataset.teScreen);
      return;
    }

    const key = ev.target.getAttribute?.("data-te-reset");
    if (!key) return;
    edits[key] = "";
    const row = ev.target.closest(".te-row");
    row.querySelector("[data-te-input]").value = "";
    row.classList.remove("is-changed");
    dirty = true;
    setStatus(S.unsaved, "warning");
    updateCount();
    renderNav();
  });

  $("[data-te-screen-select]")?.addEventListener("change", (ev) => selectScreen(ev.target.value));
  $("[data-te-search]").addEventListener("input", renderCards);
  $("[data-te-changed]").addEventListener("change", renderCards);

  cardsEl.addEventListener("input", (ev) => {
    const key = ev.target.getAttribute?.("data-te-input");
    if (!key) return;
    edits[key] = ev.target.value;
    ev.target.closest(".te-row").classList.toggle("is-changed", isChanged(key));
    dirty = true;
    setStatus(S.unsaved, "warning");
    updateCount();
  });

  // los contadores del menú se actualizan al salir del campo (no en cada tecla)
  cardsEl.addEventListener("focusout", (ev) => {
    if (ev.target.hasAttribute?.("data-te-input")) renderNav();
  });

  $("[data-te-save]").onclick = async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = S.saving;
    try {
      await saveTextOverrides(edits, auth.currentUser?.uid || null);
      dirty = false;
      setStatus(S.saved, "success");
      onSaved?.();
    } catch (err) {
      console.error(err);
      setStatus(`${S.error} ${err?.code || err?.message || ""}`, "danger");
    } finally {
      btn.disabled = false;
      btn.textContent = S.save;
    }
  };

  hasUnsaved = () => dirty && container.isConnected;

  render();
}
