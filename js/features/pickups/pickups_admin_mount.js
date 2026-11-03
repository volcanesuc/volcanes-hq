// /js/features/pickups/pickups_admin_mount.js
// Finanzas y Ajustes de pickups fuera de la página de Pickups (Gestión › Dinero y Ajustes).
// Mismo contrato que los módulos de asociación: mount(container, cfg).
import {
  applyStrings,
  loadPickupSettings,
} from "/js/features/pickups/pickups_settings.js";
import { loadAllPickups, loadAllRegs } from "/js/features/pickups/pickups_services.js";
import { setAlert } from "/js/features/pickups/pickups_admin_ui.js";
import { initFinance, renderFinance } from "/js/features/pickups/pickups_admin_finance.js";
import { initSettings, renderSettings } from "/js/features/pickups/pickups_admin_settings.js";

const state = { pickups: [], regs: [] };

function buildCtx(alertEl, onReload) {
  return {
    getPickups: () => state.pickups,
    getRegs: () => state.regs,
    reload: async () => {
      await loadPickupSettings();
      await onReload?.();
    },
    alert: (msg, type = "info") => setAlert(alertEl, msg, type),
  };
}

async function loadData() {
  const [pickups, regs] = await Promise.all([loadAllPickups(), loadAllRegs()]);
  state.pickups = pickups;
  state.regs = regs;
}

export async function mountFinance(container) {
  container.innerHTML = `
    <div class="alert d-none" id="pickupsAdminAlert" role="alert"></div>
    <div id="financeRoot"></div>`;

  await loadPickupSettings();
  await loadData();

  const ctx = buildCtx(container.querySelector("#pickupsAdminAlert"), async () => {
    await loadData();
    renderFinance();
  });
  initFinance(ctx);
  renderFinance();
  applyStrings(container);
}

export async function mountSettings(container) {
  container.innerHTML = `
    <div class="alert d-none" id="pickupsAdminAlert" role="alert"></div>
    <div id="settingsRoot"></div>`;

  await loadPickupSettings();

  // onSave ya vuelve a dibujar el formulario después de reload().
  const ctx = buildCtx(container.querySelector("#pickupsAdminAlert"), async () => applyStrings(container));
  initSettings(ctx);
  renderSettings();
  applyStrings(container);
}
