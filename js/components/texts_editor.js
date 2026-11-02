// /js/components/texts_editor.js
// Editor de Ajustes > Textos: todas las pantallas, guarda en club_config/texts.
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
import { HTML_SOURCES, NAMESPACE_LABELS } from "/js/strings/all_strings.js";

const S = defineStrings("textsEditor", "Ajustes: editor de textos", {
  title: "Textos",
  hint: "Cambiá cualquier texto de la app para este club. Dejá un campo vacío para usar el texto por defecto. Las palabras entre {llaves} se reemplazan solas: dejalas igual.",
  section: "Pantalla",
  allSections: "Todas las pantallas",
  search: "Buscar texto…",
  onlyChanged: "Solo modificados",
  colKey: "Llave",
  colText: "Texto",
  defaultLabel: "Por defecto:",
  reset: "Usar default",
  save: "Guardar textos",
  saving: "Guardando…",
  saved: "Textos guardados. Recargá las otras páginas para verlos.",
  error: "No se pudieron guardar los textos.",
  loading: "Cargando textos…",
  changedCount: "{n} modificados",
  empty: "No hay textos que coincidan.",
  unsaved: "Tenés cambios sin guardar.",
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

/**
 * @param {HTMLElement} container
 * @param {{ section?: string, legacy?: Record<string, Record<string,string>>, onSaved?: Function }} opts
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

  const sections = [...registry.entries()]
    .map(([ns, info]) => ({ ns, label: NAMESPACE_LABELS[ns] || info.label || ns }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  let current = sections.some((s) => s.ns === section) ? section : "";
  let dirty = false;

  container.innerHTML = `
    <div class="card shadow-sm mb-3"><div class="card-body">
      <div class="mb-3">
        <h2 class="h6 mb-1">${escapeHtml(S.title)}</h2>
        <div class="small text-muted">${escapeHtml(S.hint)}</div>
      </div>
      <div class="row g-2 align-items-center mb-2">
        <div class="col-12 col-md-4">
          <select class="form-select form-select-sm" data-te-section aria-label="${escapeHtml(S.section)}">
            <option value="">${escapeHtml(S.allSections)}</option>
            ${sections.map((s) => `<option value="${escapeHtml(s.ns)}">${escapeHtml(s.label)}</option>`).join("")}
          </select>
        </div>
        <div class="col-12 col-md-4">
          <input class="form-control form-control-sm" data-te-search placeholder="${escapeHtml(S.search)}" />
        </div>
        <div class="col-12 col-md-4 d-flex align-items-center gap-3 justify-content-md-end">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" id="teOnlyChanged" data-te-changed />
            <label class="form-check-label small" for="teOnlyChanged">${escapeHtml(S.onlyChanged)}</label>
          </div>
          <span class="badge text-bg-secondary" data-te-count></span>
        </div>
      </div>
      <div class="table-responsive" style="max-height: 62vh;">
        <table class="table table-sm align-middle mb-0 te-table">
          <tbody data-te-rows></tbody>
        </table>
      </div>
      <div class="d-flex justify-content-between align-items-center gap-2 mt-3 flex-wrap">
        <div class="small" data-te-status></div>
        <button type="button" class="btn btn-primary" data-te-save>${escapeHtml(S.save)}</button>
      </div>
    </div></div>
  `;

  const $ = (sel) => container.querySelector(sel);
  const rowsEl = $("[data-te-rows]");
  const statusEl = $("[data-te-status]");
  $("[data-te-section]").value = current;

  function setStatus(text, kind = "muted") {
    statusEl.className = `small text-${kind}`;
    statusEl.textContent = text || "";
  }

  function updateCount() {
    const n = Object.values(edits).filter((v) => typeof v === "string" && v.trim()).length;
    $("[data-te-count]").textContent = fmt(S.changedCount, { n });
  }

  function render() {
    const term = $("[data-te-search]").value.trim().toLowerCase();
    const onlyChanged = $("[data-te-changed]").checked;
    const list = current ? sections.filter((s) => s.ns === current) : sections;
    const html = [];

    for (const { ns, label } of list) {
      const defaults = registry.get(ns)?.defaults || {};
      const rows = Object.keys(defaults)
        .map((k) => ({ key: `${ns}.${k}`, def: defaults[k] }))
        .filter(({ key, def }) => {
          const val = edits[key] || "";
          if (onlyChanged && !val.trim()) return false;
          if (!term) return true;
          return `${key} ${def} ${val}`.toLowerCase().includes(term);
        });
      if (!rows.length) continue;
      if (!current) html.push(`<tr class="table-light"><th colspan="2" class="small">${escapeHtml(label)}</th></tr>`);
      for (const { key, def } of rows) {
        const val = edits[key] || "";
        const rowsCount = Math.min(4, Math.max(1, Math.ceil(Math.max(def.length, val.length) / 70)));
        html.push(`
          <tr data-key="${escapeHtml(key)}">
            <td class="small text-muted" style="width: 28%; word-break: break-word;"><code>${escapeHtml(key.slice(ns.length + 1))}</code></td>
            <td>
              <textarea class="form-control form-control-sm" rows="${rowsCount}" data-te-input="${escapeHtml(key)}"
                placeholder="${escapeHtml(def)}">${escapeHtml(val)}</textarea>
              <div class="small text-muted mt-1 d-flex justify-content-between gap-2">
                <span>${escapeHtml(S.defaultLabel)} ${escapeHtml(def)}</span>
                <button type="button" class="btn btn-link btn-sm p-0 ${val ? "" : "d-none"}" data-te-reset="${escapeHtml(key)}">${escapeHtml(S.reset)}</button>
              </div>
            </td>
          </tr>`);
      }
    }

    rowsEl.innerHTML = html.length ? html.join("") : `<tr><td class="text-muted small py-3">${escapeHtml(S.empty)}</td></tr>`;
    updateCount();
  }

  $("[data-te-section]").onchange = (ev) => {
    current = ev.target.value;
    render();
  };
  $("[data-te-search]").oninput = render;
  $("[data-te-changed]").onchange = render;

  rowsEl.addEventListener("input", (ev) => {
    const key = ev.target.getAttribute?.("data-te-input");
    if (!key) return;
    edits[key] = ev.target.value;
    ev.target.closest("tr").querySelector("[data-te-reset]")?.classList.toggle("d-none", !ev.target.value);
    dirty = true;
    setStatus(S.unsaved, "warning");
    updateCount();
  });

  rowsEl.addEventListener("click", (ev) => {
    const key = ev.target.getAttribute?.("data-te-reset");
    if (!key) return;
    edits[key] = "";
    const input = rowsEl.querySelector(`[data-te-input="${CSS.escape(key)}"]`);
    if (input) input.value = "";
    ev.target.classList.add("d-none");
    dirty = true;
    setStatus(S.unsaved, "warning");
    updateCount();
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
