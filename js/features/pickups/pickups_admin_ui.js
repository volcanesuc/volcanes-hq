// /js/features/pickups/pickups_admin_ui.js
// Piezas de UI compartidas entre el editor de pickup y Ajustes.
import { t } from "/js/features/pickups/pickups_settings.js";
import { TIER_RULES, escapeHtml, slugify } from "/js/features/pickups/pickups_shared.js";

function tierRowHtml(tier = {}) {
  const rule = tier.rule || "any";
  return `
    <div class="row g-2 align-items-center" data-tier-row data-tier-id="${escapeHtml(tier.id || "")}">
      <div class="col-12 col-md-4">
        <input class="form-control form-control-sm" data-tier-label maxlength="60"
          placeholder="${escapeHtml(t("settings.tierLabel"))}" value="${escapeHtml(tier.label || "")}" />
      </div>
      <div class="col-5 col-md-2">
        <input class="form-control form-control-sm" data-tier-amount type="number" min="0" step="any"
          placeholder="${escapeHtml(t("settings.tierAmount"))}" value="${escapeHtml(tier.amount ?? "")}" />
      </div>
      <div class="col-7 col-md-4">
        <select class="form-select form-select-sm" data-tier-rule aria-label="${escapeHtml(t("settings.tierRule"))}">
          ${TIER_RULES.map((r) => `<option value="${r}" ${r === rule ? "selected" : ""}>${escapeHtml(t(`tierRule.${r}`))}</option>`).join("")}
        </select>
      </div>
      <div class="col-12 col-md-2 d-flex gap-1 justify-content-end">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-tier-up title="↑">↑</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-tier-remove>✕</button>
      </div>
    </div>`;
}

// Editor de tarifas (N tarifas, ordenables; el orden define la prioridad de reglas).
export function mountTierEditor(container, addButton, tiers = []) {
  container.innerHTML = tiers.map(tierRowHtml).join("");

  addButton.onclick = () => container.insertAdjacentHTML("beforeend", tierRowHtml({ amount: 0, rule: "any" }));

  container.onclick = (ev) => {
    const row = ev.target.closest("[data-tier-row]");
    if (!row) return;
    if (ev.target.closest("[data-tier-remove]")) row.remove();
    if (ev.target.closest("[data-tier-up]") && row.previousElementSibling) {
      row.parentNode.insertBefore(row, row.previousElementSibling);
    }
  };

  return {
    read() {
      const used = new Set();
      return [...container.querySelectorAll("[data-tier-row]")]
        .map((row) => {
          const label = row.querySelector("[data-tier-label]").value.trim();
          if (!label) return null;
          let id = row.getAttribute("data-tier-id") || slugify(label) || "tier";
          while (used.has(id)) id = `${id}-2`;
          used.add(id);
          return {
            id,
            label,
            amount: Math.max(0, Number(row.querySelector("[data-tier-amount]").value || 0)),
            rule: row.querySelector("[data-tier-rule]").value || "any",
            active: true,
          };
        })
        .filter(Boolean);
    },
  };
}

export function setAlert(el, msg, type = "info") {
  if (!el) return;
  if (!msg) {
    el.classList.add("d-none");
    return;
  }
  el.className = `alert alert-${type}`;
  el.textContent = msg;
}
