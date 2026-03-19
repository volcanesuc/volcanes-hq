import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { $ } from "./register_dom.js";
import { setPlansById } from "./register_state.js";
import {
  esc,
  fmtMoney,
  updateSubmitState,
} from "./register_ui.js";
import {
  planAmount,
  validateProofFile,
} from "./register_services.js";
import {
  clearProofStatus,
  setProofStatus,
} from "./register_ui.js";

const COL = APP_CONFIG.collections;
const COL_PLANS = COL.subscriptionPlans;

export async function loadPlans() {
  const snap = await getDocs(collection(db, COL_PLANS));
  const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activePlans = plans.filter((p) => p.isActive !== false);

  setPlansById(new Map(activePlans.map((p) => [p.id, p])));

  if ($.planId) {
    $.planId.innerHTML =
      `<option value="">Seleccionar…</option>` +
      activePlans
        .map((p) => {
          const amt = planAmount(p);
          const label = `${p.name || "Plan"} — ${fmtMoney(amt, p.currency || "CRC")}`;
          return `<option value="${esc(p.id)}">${esc(label)}</option>`;
        })
        .join("");
  }

  if ($.planMeta) $.planMeta.textContent = "";
}

export function bindPlanUI(plansByIdRef) {
  $.planId?.addEventListener("change", () => {
    const p = plansByIdRef().get($.planId.value);

    if (!p) {
      if ($.planMeta) $.planMeta.textContent = "";
      updateSubmitState();
      return;
    }

    const parts = [];
    if (p.description) parts.push(p.description);

    const amt = planAmount(p);
    if (amt != null) parts.push(`Monto: ${fmtMoney(amt, p.currency || "CRC")}`);

    if ($.planMeta) $.planMeta.textContent = parts.join(" • ");
    updateSubmitState();
  });

  $.proofFile?.addEventListener("change", () => {
    const file = $.proofFile.files?.[0] || null;

    if (!file) {
      clearProofStatus();
      updateSubmitState();
      return;
    }

    try {
      validateProofFile(file);
      const kb = Math.round(file.size / 1024);
      setProofStatus(`Archivo listo: ${file.name} (${kb} KB)`, "muted", false);
    } catch (e) {
      setProofStatus(e.message || "Archivo inválido.", "danger", false);
    }

    updateSubmitState();
  });
}