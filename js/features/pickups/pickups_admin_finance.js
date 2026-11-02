// /js/features/pickups/pickups_admin_finance.js
// Admin > Finanzas: totales de todos los pickups, morosos y créditos.
import {
  dateToClubDay,
  fmtDate,
  getPickupSettings,
  money,
  t,
} from "/js/features/pickups/pickups_settings.js";

import {
  PICKUP_STATUS,
  REG_SOURCE,
  SPOT,
  computeCredits,
  computeMorosos,
  escapeHtml,
  getSpotMap,
  isApproved,
  norm,
  regCashDue,
  regPayerKey,
  whatsappUrl,
} from "/js/features/pickups/pickups_shared.js";

import { loadRegPrivate } from "/js/features/pickups/pickups_services.js";

let ctx = null;
let root = null;
const filters = { from: "", to: "" };

export function initFinance(context) {
  ctx = context;
  root = document.getElementById("financeRoot");

  root.addEventListener("change", (ev) => {
    if (ev.target.id === "finFrom") filters.from = ev.target.value;
    if (ev.target.id === "finTo") filters.to = ev.target.value;
    if (ev.target.id === "finFrom" || ev.target.id === "finTo") renderFinance();
  });

  root.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-remind]");
    if (!btn) return;
    const win = window.open("about:blank", "_blank");
    const url = await reminderUrl(btn.getAttribute("data-remind"));
    if (win) win.location.href = url;
  });
}

function inRange(p) {
  const day = dateToClubDay(p.startAt);
  if (filters.from && day < filters.from) return false;
  if (filters.to && day > filters.to) return false;
  return true;
}

// Nombre de quien paga: el titular (no el acompañante).
function payerName(regs) {
  const main = regs.find((r) => r.source !== REG_SOURCE.COMPANION) || regs[0];
  return main?.source === REG_SOURCE.COMPANION ? (main.companionOfName || main.displayName) : (main?.displayName || "—");
}

async function reminderUrl(payerKey) {
  const morosos = computeMorosos(ctx.getPickups(), ctx.getRegs());
  const m = morosos.get(payerKey);
  const regs = ctx.getRegs().filter((r) => regPayerKey(r) === payerKey);

  let phone = "";
  for (const r of regs.filter((x) => x.source !== REG_SOURCE.COMPANION)) {
    phone = (await loadRegPrivate(r.id))?.phone || "";
    if (phone) break;
  }

  const s = getPickupSettings();
  const games = (m?.items || []).map((x) => `${x.pickup.title} ${fmtDate(x.pickup.startAt)}`).join(", ");
  const text = t("wa.reminder", {
    name: payerName(regs),
    amount: money(m?.owed || 0),
    games,
    sinpe: [s.payment.sinpeNumber, s.payment.sinpeName].filter(Boolean).join(" · "),
  });
  return whatsappUrl(phone, text, s.whatsappCountryCode);
}

export function renderFinance() {
  if (!root) return;

  const pickups = ctx.getPickups().filter(inRange);
  const allRegs = ctx.getRegs();
  const ids = new Set(pickups.map((p) => p.id));
  const regs = allRegs.filter((r) => ids.has(r.pickupId));

  const rows = pickups.map((p) => {
    const list = regs.filter((r) => r.pickupId === p.id);
    const spots = getSpotMap(p, list);
    const inRegs = list.filter((r) => spots.get(r.id) === SPOT.IN);
    const cancelledPickup = norm(p.status) === PICKUP_STATUS.CANCELLED;

    const expected = cancelledPickup ? 0 : inRegs.reduce((s, r) => s + regCashDue(r), 0);
    // dinero que entró (incluye a quienes luego se salieron y quedaron con crédito)
    const collected = list.filter(isApproved).reduce((s, r) => s + regCashDue(r), 0);
    const pending = cancelledPickup ? 0 : inRegs.filter((r) => !isApproved(r)).reduce((s, r) => s + regCashDue(r), 0);
    return { p, players: inRegs.length, expected, collected, pending };
  });

  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const morosos = [...computeMorosos(pickups, regs).values()].sort((a, b) => b.owed - a.owed);
  const credits = [...computeCredits(allRegs).values()].filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);

  const kpi = (label, value) => `
    <div class="col-6 col-lg"><div class="card shadow-sm pk-kpi"><div class="card-body py-2">
      <div class="small text-muted">${escapeHtml(label)}</div><div class="h4 mb-0">${escapeHtml(value)}</div>
    </div></div></div>`;

  root.innerHTML = `
    <div class="d-flex flex-wrap gap-2 align-items-end mb-3">
      <div>
        <label class="form-label small mb-0" for="finFrom">${escapeHtml(t("finance.from"))}</label>
        <input type="date" id="finFrom" class="form-control form-control-sm" value="${escapeHtml(filters.from)}" />
      </div>
      <div>
        <label class="form-label small mb-0" for="finTo">${escapeHtml(t("finance.to"))}</label>
        <input type="date" id="finTo" class="form-control form-control-sm" value="${escapeHtml(filters.to)}" />
      </div>
    </div>

    <div class="row g-2 mb-4">
      ${kpi(t("finance.kpiExpected"), money(sum("expected")))}
      ${kpi(t("finance.kpiCollected"), money(sum("collected")))}
      ${kpi(t("finance.kpiPending"), money(sum("pending")))}
      ${kpi(t("finance.kpiMorosos"), `${morosos.length} · ${money(morosos.reduce((s, m) => s + m.owed, 0))}`)}
      ${kpi(t("finance.kpiCredits"), money(credits.reduce((s, c) => s + c.balance, 0)))}
    </div>

    <div class="card shadow-sm mb-4"><div class="card-body">
      <h2 class="h6 mb-3">${escapeHtml(t("finance.byPickup"))}</h2>
      <div class="table-responsive">
        <table class="table table-sm align-middle pk-table">
          <thead><tr>
            <th>${escapeHtml(t("finance.colPickup"))}</th><th>${escapeHtml(t("finance.colDate"))}</th>
            <th class="text-end">${escapeHtml(t("finance.colPlayers"))}</th><th class="text-end">${escapeHtml(t("finance.colExpected"))}</th>
            <th class="text-end">${escapeHtml(t("finance.colCollected"))}</th><th class="text-end">${escapeHtml(t("finance.colPending"))}</th>
          </tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td class="pk-wrap">${escapeHtml(r.p.title || "—")} ${norm(r.p.status) === PICKUP_STATUS.CANCELLED ? `<span class="badge text-bg-danger">${escapeHtml(t("status.pickup.cancelled"))}</span>` : ""}</td>
                <td>${escapeHtml(fmtDate(r.p.startAt))}</td>
                <td class="text-end">${r.players}</td>
                <td class="text-end">${escapeHtml(money(r.expected))}</td>
                <td class="text-end">${escapeHtml(money(r.collected))}</td>
                <td class="text-end">${escapeHtml(money(r.pending))}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div></div>

    <div class="row g-3">
      <div class="col-12 col-lg-7">
        <div class="card shadow-sm"><div class="card-body">
          <h2 class="h6 mb-3">${escapeHtml(t("finance.morosos"))}</h2>
          ${morosos.length ? `
            <div class="table-responsive"><table class="table table-sm align-middle pk-table">
              <thead><tr><th>${escapeHtml(t("finance.colPerson"))}</th><th class="text-end">${escapeHtml(t("finance.colOwed"))}</th><th>${escapeHtml(t("finance.colGames"))}</th><th></th></tr></thead>
              <tbody>
                ${morosos.map((m) => `
                  <tr>
                    <td class="pk-wrap">${escapeHtml(payerName(m.items.map((x) => x.reg)))}</td>
                    <td class="text-end fw-semibold">${escapeHtml(money(m.owed))}</td>
                    <td class="pk-wrap small">${m.items.map((x) => `${escapeHtml(x.pickup.title)} · ${escapeHtml(fmtDate(x.pickup.startAt))}${x.reg.source === REG_SOURCE.COMPANION ? ` (${escapeHtml(x.reg.displayName)})` : ""}`).join("<br>")}</td>
                    <td><button type="button" class="btn btn-sm btn-outline-success" data-remind="${escapeHtml(m.payerKey)}">${escapeHtml(t("finance.remind"))}</button></td>
                  </tr>`).join("")}
              </tbody>
            </table></div>` : `<div class="small text-muted">${escapeHtml(t("finance.morososEmpty"))}</div>`}
        </div></div>
      </div>

      <div class="col-12 col-lg-5">
        <div class="card shadow-sm"><div class="card-body">
          <h2 class="h6 mb-3">${escapeHtml(t("finance.credits"))}</h2>
          ${credits.length ? `
            <div class="table-responsive"><table class="table table-sm align-middle pk-table">
              <thead><tr><th>${escapeHtml(t("finance.colPerson"))}</th><th class="text-end">${escapeHtml(t("finance.colCredit"))}</th></tr></thead>
              <tbody>
                ${credits.map((c) => `
                  <tr>
                    <td class="pk-wrap">${escapeHtml(payerName(allRegs.filter((r) => regPayerKey(r) === c.payerKey)))}</td>
                    <td class="text-end fw-semibold">${escapeHtml(money(c.balance))}</td>
                  </tr>`).join("")}
              </tbody>
            </table></div>` : `<div class="small text-muted">${escapeHtml(t("finance.creditsEmpty"))}</div>`}
        </div></div>
      </div>
    </div>
  `;
}
