// /js/features/pickups/my_pickups.js
// "Mis pickups": los pickups a los que me anoté (con mi cuenta o con mi cédula) y mi crédito.
// Se muestra en la página pública de pickups cuando hay sesión.
import { fmtDateTime, money, t } from "/js/features/pickups/pickups_settings.js";
import {
  SPOT,
  buildPickupPublicUrl,
  computeCredits,
  escapeHtml,
  getSpotMap,
  norm,
  paymentBadge,
  personKeyFromId,
  personKeyFromUid,
  regTierLabel,
  spotBadge,
} from "/js/features/pickups/pickups_shared.js";
import {
  loadPickup,
  loadRegsByPayer,
  loadRegsForPickup,
  loadRegsOwnedBy,
  loadUserDoc,
} from "/js/features/pickups/pickups_services.js";

// Mis inscripciones + los pickups y las inscripciones de esos pickups (para saber si quedé en lista o en espera).
export async function loadMyPickups(uid) {
  if (!uid) return { regs: [], pickups: [], allRegs: [], payerKey: null };

  const userDoc = await loadUserDoc(uid).catch(() => null);
  const payerKey = (await personKeyFromId(userDoc?.profile?.idNumber)) || personKeyFromUid(uid);

  const jobs = [loadRegsOwnedBy(uid)];
  if (payerKey) jobs.push(loadRegsByPayer(payerKey, uid));
  const byId = new Map();
  (await Promise.all(jobs.map((j) => j.catch(() => [])))).flat().forEach((r) => byId.set(r.id, r));
  const regs = [...byId.values()];

  const pickupIds = [...new Set(regs.map((r) => r.pickupId))];
  const [pickups, perPickup] = await Promise.all([
    Promise.all(pickupIds.map((id) => loadPickup(id).catch(() => null))),
    Promise.all(pickupIds.map((id) => loadRegsForPickup(id).catch(() => []))),
  ]);

  return { regs, pickups: pickups.filter(Boolean), allRegs: perPickup.flat(), payerKey };
}

export function renderMyPickups({ regs, pickups, allRegs, payerKey }, { list, empty, credit }) {
  const byPickup = new Map(pickups.map((p) => [p.id, p]));
  const balance = payerKey ? computeCredits(regs).get(payerKey)?.balance || 0 : 0;

  if (credit) {
    credit.classList.toggle("d-none", !(balance > 0));
    credit.textContent = t("mine.creditBalance", { amount: money(balance) });
  }

  const items = regs
    .map((r) => ({ r, p: byPickup.get(r.pickupId) }))
    .filter((x) => x.p)
    .sort((a, b) => (b.p.startAt?.toMillis?.() || 0) - (a.p.startAt?.toMillis?.() || 0));

  empty?.classList.toggle("d-none", items.length > 0);
  list.innerHTML = items.map(({ r, p }) => {
    const spot = getSpotMap(p, allRegs.filter((x) => x.pickupId === p.id)).get(r.id) || SPOT.CANCELLED;
    const status = norm(r.paymentStatus || "pending");
    return `
      <a class="list-group-item list-group-item-action" href="${escapeHtml(buildPickupPublicUrl(p))}">
        <div class="d-flex justify-content-between flex-wrap gap-2">
          <div>
            <div class="fw-semibold">${escapeHtml(p.title || "—")} · ${escapeHtml(r.displayName || "")}</div>
            <div class="small text-muted">${escapeHtml(fmtDateTime(p.startAt))} · ${escapeHtml(regTierLabel(r))} · ${escapeHtml(money(r.amountDue))}</div>
          </div>
          <div class="d-flex gap-1 align-items-start">
            <span class="badge ${spotBadge(spot)}">${escapeHtml(t(`status.spot.${spot}`))}</span>
            ${spot === SPOT.CANCELLED ? "" : `<span class="badge ${paymentBadge(status)}">${escapeHtml(t(`status.payment.${status}`))}</span>`}
          </div>
        </div>
      </a>`;
  }).join("");

  return items.length;
}
