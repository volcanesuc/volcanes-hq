// /js/features/pickups/pickups_admin_manage.js
// Admin > Gestionar: crear/editar pickups, revisar pagos, asistencia, agregar a mano, cancelar.
import { loadPartialOnce } from "/js/ui/loadPartial.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import {
  applyStrings,
  clubLocalInputToDate,
  dateToClubLocalInput,
  fmtDateTime,
  fmtWith,
  getPickupSettings,
  money,
  t,
} from "/js/features/pickups/pickups_settings.js";

import {
  ATTENDANCE,
  PAYMENT_STATUS,
  PICKUP_STATUS,
  REG_SOURCE,
  SPOT,
  buildPickupPublicUrl,
  computeCredits,
  hasStarted,
  escapeHtml,
  getActiveTiers,
  getSpotMap,
  isApproved,
  norm,
  paymentBadge,
  personKeyFromId,
  pickupStatusBadge,
  regCashDue,
  regCreditApplied,
  regPayerKey,
  regTierLabel,
  safeUrl,
  slugify,
  splitSpots,
  spotBadge,
  whatsappUrl,
} from "/js/features/pickups/pickups_shared.js";

import {
  addManualRegistration,
  approvePayment,
  cancelPickup,
  loadGuestKey,
  loadRegPrivate,
  refundCredit,
  rejectPayment,
  removeRegistration,
  savePickup,
  updateReg,
} from "/js/features/pickups/pickups_services.js";

import { mountTierEditor } from "/js/features/pickups/pickups_admin_ui.js";

const $ = (id) => document.getElementById(id);

let ctx = null;
let selectedId = null;
let privateByReg = new Map();
let reviewRegId = null;
let editor = { id: null, tierEditor: null, modal: null };
let when = "upcoming"; // upcoming | past | all

const WHEN = [
  { id: "upcoming", key: "admin.whenUpcoming" },
  { id: "past", key: "admin.whenPast" },
  { id: "all", key: "admin.whenAll" },
];

export function initManage(context) {
  ctx = context;

  $("managePickupSearch").addEventListener("input", renderPickupList);
  $("manageWhen").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-when]");
    if (!b) return;
    when = b.getAttribute("data-when");
    renderPickupList();
  });
  $("managePickupList").addEventListener("click", (ev) => {
    const item = ev.target.closest("[data-pickup-id]");
    if (item) selectPickup(item.getAttribute("data-pickup-id"));
  });
  $("manageDetail").addEventListener("click", onDetailClick);
  $("manageDetail").addEventListener("change", onDetailChange);

  $("openCreatePickupBtn").addEventListener("click", () => openEditor(null));

  document.querySelectorAll("dialog [data-close]").forEach((btn) =>
    btn.addEventListener("click", () => btn.closest("dialog").close())
  );
  $("reviewApproveBtn").addEventListener("click", onReviewApprove);
  $("reviewRejectBtn").addEventListener("click", onReviewReject);
  $("manualForm").addEventListener("submit", onManualSubmit);
}

export function renderManage() {
  renderPickupList();
  if (selectedId) renderDetail();
}

/* =========================
   Lista de pickups
========================= */
// Próximos: no empezaron (o empezaron hace menos de 6 h) y no están cancelados/finalizados.
function isUpcoming(p) {
  const status = norm(p.status);
  if ([PICKUP_STATUS.CANCELLED, PICKUP_STATUS.FINISHED].includes(status)) return false;
  const start = p.startAt?.toDate?.() || null;
  return !start || !hasStarted(p) || Date.now() - start.getTime() < 6 * 3600e3;
}

function inWhen(p) {
  if (when === "all") return true;
  return when === "upcoming" ? isUpcoming(p) : !isUpcoming(p);
}

function renderPickupList() {
  const term = norm($("managePickupSearch").value);
  const all = ctx.getPickups();
  const ts = (p) => p.startAt?.toMillis?.() || 0;

  $("manageWhen").innerHTML = WHEN.map((w) => `
    <button type="button" class="ui-seg__item ${w.id === when ? "is-active" : ""}" data-when="${w.id}">
      ${escapeHtml(t(w.key))} <span class="ui-chip__n">${all.filter((p) => w.id === "all" || (w.id === "upcoming" ? isUpcoming(p) : !isUpcoming(p))).length}</span>
    </button>`).join("");

  const items = all
    .filter(inWhen)
    .filter((p) => !term || norm(`${p.title} ${p.venueName}`).includes(term))
    // próximos: el más cercano primero; pasados: el más reciente primero
    .sort((a, b) => (when === "upcoming" ? ts(a) - ts(b) : ts(b) - ts(a)));

  $("managePickupList").innerHTML = items.length ? items.map((p) => {
    const regs = ctx.getRegs().filter((r) => r.pickupId === p.id);
    const { inList, waitlist } = splitSpots(p, regs);
    const cap = Number(p.capacity || 0);
    const pct = cap ? Math.min(100, Math.round((inList.length / cap) * 100)) : 0;
    const toReview = regs.filter((r) => norm(r.paymentStatus) === PAYMENT_STATUS.SUBMITTED && norm(r.registrationStatus) !== "cancelled").length;
    const status = norm(p.status) || "draft";
    return `
      <button type="button" class="pkm-item ${p.id === selectedId ? "is-active" : ""}" data-pickup-id="${escapeHtml(p.id)}">
        <div class="pkm-date">
          <b>${escapeHtml(fmtWith(p.startAt, { day: "2-digit" }))}</b>
          <span>${escapeHtml(fmtWith(p.startAt, { month: "short" }).replace(".", ""))}</span>
        </div>
        <div class="pkm-item__main">
          <div class="pkm-item__top">
            <span class="pkm-item__title">${escapeHtml(p.title || "—")}</span>
            <span class="pkm-status pkm-status--${escapeHtml(status)}">${escapeHtml(t(`status.pickup.${status}`))}${p.isPublic === true ? "" : " · 🔒"}</span>
          </div>
          <div class="pkm-item__meta">${escapeHtml(fmtWith(p.startAt, { weekday: "short", hour: "2-digit", minute: "2-digit" }))}${p.venueName ? ` · ${escapeHtml(p.venueName)}` : ""}</div>
          <div class="pkm-cap">
            ${cap ? `<div class="pkm-bar"><i style="width:${pct}%"></i></div>` : ""}
            <span>${inList.length}${cap ? ` / ${cap}` : ""}${waitlist.length ? ` · +${waitlist.length}` : ""}</span>
            ${toReview ? `<span class="pkm-flag">${toReview} ${escapeHtml(t("admin.kpiToReview"))}</span>` : ""}
          </div>
        </div>
      </button>`;
  }).join("") : `<div class="ui-empty">${escapeHtml(t("admin.noPickups"))}</div>`;
}

async function selectPickup(id) {
  selectedId = id;
  renderPickupList();
  showLoader();
  try {
    const regs = ctx.getRegs().filter((r) => r.pickupId === id);
    const entries = await Promise.all(regs.map(async (r) => [r.id, await loadRegPrivate(r.id)]));
    privateByReg = new Map(entries);
  } finally {
    hideLoader();
  }
  renderDetail();
}

/* =========================
   Detalle
========================= */
function selectedPickup() {
  return ctx.getPickups().find((p) => p.id === selectedId) || null;
}

function phoneOf(reg) {
  const own = privateByReg.get(reg.id)?.phone;
  if (own) return own;
  // acompañantes: el teléfono es el de quien pagó
  const payer = ctx.getRegs().find((r) => regPayerKey(r) === regPayerKey(reg) && r.id !== reg.id && privateByReg.get(r.id)?.phone);
  return payer ? privateByReg.get(payer.id).phone : "";
}

function sourceNote(r) {
  if (r.source === REG_SOURCE.GUEST) return t("admin.guest");
  if (r.source === REG_SOURCE.COMPANION) return t("admin.companionOf", { name: r.companionOfName || "—" });
  if (r.source === REG_SOURCE.MANUAL) return t("admin.manual");
  return "";
}

function renderDetail() {
  const p = selectedPickup();
  $("manageEmpty").classList.toggle("d-none", !!p);
  $("manageDetail").classList.toggle("d-none", !p);
  if (!p) return;

  const regs = ctx.getRegs().filter((r) => r.pickupId === p.id);
  const spots = getSpotMap(p, regs);
  const { inList, waitlist } = splitSpots(p, regs);
  const cancelled = regs.filter((r) => spots.get(r.id) === SPOT.CANCELLED);
  const tiers = getActiveTiers(p);
  const credits = computeCredits(ctx.getRegs());

  const toReview = regs.filter((r) => spots.get(r.id) !== SPOT.CANCELLED && norm(r.paymentStatus) === PAYMENT_STATUS.SUBMITTED).length;
  const collected = regs.filter(isApproved).reduce((s, r) => s + regCashDue(r), 0);
  const isCancelled = norm(p.status) === PICKUP_STATUS.CANCELLED;

  const stat = (label, value, hot = false) => `
    <div class="pkm-stat ${hot ? "is-hot" : ""}">
      <div class="pkm-stat__value">${escapeHtml(value)}</div>
      <div class="pkm-stat__label">${escapeHtml(label)}</div>
    </div>`;

  const initial = (name) => escapeHtml(String(name || "?").trim().charAt(0).toUpperCase() || "?");

  const row = (r, idx) => {
    const spot = spots.get(r.id);
    const status = norm(r.paymentStatus || PAYMENT_STATUS.PENDING);
    const phone = phoneOf(r);
    const credit = regCreditApplied(r);
    const cancelledRow = spot === SPOT.CANCELLED;
    return `
      <div class="pkm-reg ${cancelledRow ? "is-cancelled" : ""}" data-reg-id="${escapeHtml(r.id)}">
        <div class="pkm-reg__who">
          <span class="pkm-reg__n">${idx + 1}</span>
          <span class="pkm-avatar">${initial(r.displayName)}</span>
          <div class="min-w-0">
            <div class="pkm-reg__name">${escapeHtml(r.displayName || "—")}</div>
            <div class="pkm-reg__sub">${escapeHtml([sourceNote(r), phone].filter(Boolean).join(" · ")) || "&nbsp;"}</div>
          </div>
        </div>

        <div class="pkm-reg__tier">
          <select class="form-select form-select-sm" data-act="tier" ${cancelledRow ? "disabled" : ""} aria-label="${escapeHtml(t("admin.colTier"))}">
            ${tiers.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === r.tierId ? "selected" : ""}>${escapeHtml(x.label)} · ${escapeHtml(money(x.amount))}</option>`).join("")}
            ${tiers.some((x) => x.id === r.tierId) ? "" : `<option selected>${escapeHtml(regTierLabel(r))}</option>`}
          </select>
          ${r.tierSuggestedId && r.tierSuggestedId !== r.tierId ? `<div class="small text-warning-emphasis">≠ ${escapeHtml(tiers.find((x) => x.id === r.tierSuggestedId)?.label || r.tierSuggestedId)}</div>` : ""}
        </div>

        <div class="pkm-reg__pay">
          <span class="badge ${paymentBadge(status)}">${escapeHtml(t(`status.payment.${status}`))}</span>
          <span class="pkm-reg__amount">${escapeHtml(money(r.amountDue))}${credit ? ` (−${escapeHtml(money(credit))})` : ""}</span>
        </div>

        <div class="pkm-reg__att">
          <select class="form-select form-select-sm" data-act="attendance" ${spot !== SPOT.IN ? "disabled" : ""} aria-label="${escapeHtml(t("admin.colAttendance"))}">
            <option value="" ${!r.attendance ? "selected" : ""}>${escapeHtml(t("status.attendance.unknown"))}</option>
            <option value="${ATTENDANCE.ATTENDED}" ${r.attendance === ATTENDANCE.ATTENDED ? "selected" : ""}>${escapeHtml(t("status.attendance.attended"))}</option>
            <option value="${ATTENDANCE.NO_SHOW}" ${r.attendance === ATTENDANCE.NO_SHOW ? "selected" : ""}>${escapeHtml(t("status.attendance.no_show"))}</option>
          </select>
        </div>

        <div class="pkm-reg__actions">
          ${!cancelledRow ? `
            <button type="button" class="btn btn-sm ${status === PAYMENT_STATUS.SUBMITTED ? "btn-warning" : "btn-outline-secondary"}" data-act="review">
              ${escapeHtml(status === PAYMENT_STATUS.SUBMITTED ? t("admin.approve") : t("admin.markPaid"))}</button>
            <button type="button" class="btn btn-sm btn-outline-success" data-act="wa" title="${escapeHtml(t("common.whatsapp"))}"><i class="bi bi-whatsapp"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-act="remove" title="${escapeHtml(t("admin.remove"))}"><i class="bi bi-trash3"></i></button>
          ` : ""}
          ${cancelledRow && isApproved(r) && r.creditRefunded !== true && (credits.get(regPayerKey(r))?.balance || 0) > 0 ? `
            <button type="button" class="btn btn-sm btn-outline-secondary" data-act="refund">${escapeHtml(t("admin.refundCredit"))}</button>` : ""}
        </div>
      </div>`;
  };

  const group = (title, list, offset = 0, extraClass = "") => `
    <section class="pkm-group ${extraClass}">
      <h3 class="pkm-group__title">${escapeHtml(title)} <span class="ui-chip__n">${list.length}</span></h3>
      ${list.length ? `<div class="pkm-regs">${list.map((r, i) => row(r, i + offset)).join("")}</div>`
        : `<div class="pkm-group__empty">${escapeHtml(t("admin.noRegs"))}</div>`}
    </section>`;

  const status = norm(p.status) || "draft";
  $("manageDetail").innerHTML = `
    <section class="pkm-hero">
      <div class="pkm-hero__top">
        <div class="min-w-0">
          <span class="pkm-status pkm-status--${escapeHtml(status)} pkm-status--light">${escapeHtml(t(`status.pickup.${status}`))}${p.isPublic === true ? "" : " · 🔒"}</span>
          <h2 class="pkm-hero__title">${escapeHtml(p.title || "—")}</h2>
          <div class="pkm-hero__meta">
            <span><i class="bi bi-calendar-event"></i> ${escapeHtml(fmtDateTime(p.startAt))}</span>
            ${p.venueName ? `<span><i class="bi bi-geo-alt"></i> ${escapeHtml(p.venueName)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="pkm-hero__actions">
        <a class="btn btn-sm btn-light" href="${escapeHtml(buildPickupPublicUrl(p))}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>${escapeHtml(t("list.open"))}</a>
        <button type="button" class="btn btn-sm btn-outline-light" data-act="copy"><i class="bi bi-link-45deg me-1"></i>${escapeHtml(t("common.copyLink"))}</button>
        <button type="button" class="btn btn-sm btn-outline-light" data-act="edit"><i class="bi bi-pencil me-1"></i>${escapeHtml(t("admin.edit"))}</button>
        ${isCancelled ? "" : `
          <button type="button" class="btn btn-sm btn-light" data-act="add"><i class="bi bi-person-plus me-1"></i>${escapeHtml(t("admin.addPlayer"))}</button>
          <button type="button" class="btn btn-sm btn-outline-light pkm-danger" data-act="cancel">${escapeHtml(t("admin.cancelPickup"))}</button>`}
      </div>
    </section>

    <div class="pkm-stats">
      ${stat(t("admin.kpiIn"), `${inList.length}${p.capacity ? ` / ${p.capacity}` : ""}`)}
      ${stat(t("admin.kpiWaitlist"), String(waitlist.length))}
      ${stat(t("admin.kpiToReview"), String(toReview), toReview > 0)}
      ${stat(t("admin.kpiCollected"), money(collected))}
    </div>

    ${group(t("admin.inListTitle"), inList)}
    ${waitlist.length ? group(t("public.waitlistTitle"), waitlist, inList.length) : ""}
    ${cancelled.length ? `
      <details class="pkm-group pkm-group--cancelled">
        <summary class="pkm-group__title">${escapeHtml(t("status.spot.cancelled"))} <span class="ui-chip__n">${cancelled.length}</span></summary>
        <div class="pkm-regs">${cancelled.map((r, i) => row(r, i)).join("")}</div>
      </details>` : ""}
  `;
}

/* =========================
   Acciones del detalle
========================= */
async function run(fn, okMsg) {
  showLoader();
  try {
    await fn();
    await ctx.reload();
    if (okMsg) ctx.alert(okMsg, "success");
  } catch (err) {
    console.error("[pickups admin]", err);
    ctx.alert(err?.message || t("common.error"), "danger");
  } finally {
    hideLoader();
  }
}

async function waLinkFor(reg, template, extra = {}) {
  const p = selectedPickup();
  const key = reg.source === REG_SOURCE.GUEST ? await loadGuestKey(reg.id) : null;
  const url = buildPickupPublicUrl(p, { regId: key ? reg.id : "", key: key || "", absolute: true });
  const text = t(template, {
    name: reg.displayName,
    title: p.title,
    date: fmtDateTime(p.startAt),
    amount: money(regCashDue(reg)),
    reason: reg.rejectReason || "",
    url,
    ...extra,
  });
  return whatsappUrl(phoneOf(reg), text, getPickupSettings().whatsappCountryCode);
}

async function onDetailClick(ev) {
  const btn = ev.target.closest("[data-act]");
  if (!btn || btn.tagName === "SELECT") return;
  const act = btn.getAttribute("data-act");
  const p = selectedPickup();
  const regId = btn.closest("[data-reg-id]")?.getAttribute("data-reg-id");
  const reg = ctx.getRegs().find((r) => r.id === regId);

  if (act === "copy") {
    try {
      await navigator.clipboard.writeText(buildPickupPublicUrl(p, { absolute: true }));
      ctx.alert(t("common.linkCopied"), "success");
    } catch { /* sin permiso de clipboard */ }
  }
  if (act === "edit") openEditor(p);
  if (act === "add") openManualDialog();
  if (act === "cancel" && window.confirm(t("admin.cancelPickupConfirm"))) {
    await run(() => cancelPickup(p, ctx.getRegs().filter((r) => r.pickupId === p.id)));
  }
  if (act === "review" && reg) openReviewDialog(reg);
  if (act === "remove" && reg && window.confirm(t("admin.removeConfirm", { name: reg.displayName }))) {
    await run(() => removeRegistration(reg.id));
  }
  if (act === "wa" && reg) {
    const status = norm(reg.paymentStatus);
    const template = status === PAYMENT_STATUS.REJECTED ? "wa.rejected" : "wa.pending";
    // abrir la pestaña antes del await para que el navegador no la bloquee
    const win = window.open("about:blank", "_blank");
    const url = await waLinkFor(reg, template);
    if (win) win.location.href = url;
    else window.location.href = url;
  }
  if (act === "refund" && reg && window.confirm(t("admin.refundCreditConfirm", { name: reg.displayName }))) {
    const balance = computeCredits(ctx.getRegs()).get(regPayerKey(reg))?.balance || 0;
    const amount = Math.min(Number(reg.paidAmount || 0), balance);
    await run(() => refundCredit(reg, p, amount));
  }
}

async function onDetailChange(ev) {
  const sel = ev.target.closest("select[data-act]");
  if (!sel) return;
  const regId = sel.closest("[data-reg-id]")?.getAttribute("data-reg-id");
  const act = sel.getAttribute("data-act");

  if (act === "attendance") {
    await run(() => updateReg(regId, { attendance: sel.value || null }));
  }
  if (act === "tier") {
    const tier = getActiveTiers(selectedPickup()).find((x) => x.id === sel.value);
    if (tier) await run(() => updateReg(regId, { tierId: tier.id, tierLabel: tier.label, amountDue: Number(tier.amount || 0) }));
  }
}

/* =========================
   Revisar pago
========================= */
function openReviewDialog(reg) {
  reviewRegId = reg.id;
  const p = selectedPickup();
  const priv = privateByReg.get(reg.id) || {};
  const proofUrl = priv.proof?.downloadURL || reg.paymentProof?.downloadURL || "";

  $("reviewTitle").textContent = reg.displayName || "—";
  $("reviewSubtitle").textContent = `${regTierLabel(reg)} · ${money(regCashDue(reg))}`;
  $("reviewProof").innerHTML = proofUrl
    ? `<a href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(proofUrl)}" alt="" class="img-fluid rounded border" style="max-height: 50vh;"></a>`
    : `<div class="small text-muted">${escapeHtml(t("status.payment.pending"))}</div>`;

  $("reviewTier").innerHTML = getActiveTiers(p).map((x) =>
    `<option value="${escapeHtml(x.id)}" ${x.id === reg.tierId ? "selected" : ""}>${escapeHtml(x.label)} · ${escapeHtml(money(x.amount))}</option>`).join("");
  $("reviewMethod").value = proofUrl ? "sinpe" : "efectivo";
  $("reviewReason").value = "";
  $("reviewError").classList.add("d-none");
  $("reviewWaBtn").classList.add("d-none");
  $("reviewApproveBtn").textContent = proofUrl ? t("admin.approve") : t("admin.markPaid");
  $("reviewDialog").showModal();
}

function reviewReg() {
  return ctx.getRegs().find((r) => r.id === reviewRegId);
}

async function onReviewApprove() {
  let reg = reviewReg();
  const p = selectedPickup();
  if (!reg) return;

  const tier = getActiveTiers(p).find((x) => x.id === $("reviewTier").value);
  showLoader();
  try {
    if (tier && tier.id !== reg.tierId) {
      const patch = { tierId: tier.id, tierLabel: tier.label, amountDue: Number(tier.amount || 0) };
      await updateReg(reg.id, patch);
      reg = { ...reg, ...patch };
    }
    await approvePayment(reg, p, $("reviewMethod").value);
    $("reviewDialog").close();
    await ctx.reload();
    ctx.alert(t("admin.approved"), "success");
  } catch (err) {
    console.error(err);
    $("reviewError").textContent = err?.message || t("common.error");
    $("reviewError").classList.remove("d-none");
  } finally {
    hideLoader();
  }
}

async function onReviewReject() {
  const reg = reviewReg();
  if (!reg) return;
  const reason = $("reviewReason").value.trim();

  showLoader();
  try {
    await rejectPayment(reg, reason);
    await ctx.reload();
    const updated = { ...reg, rejectReason: reason };
    $("reviewWaBtn").href = await waLinkFor(updated, "wa.rejected");
    $("reviewWaBtn").classList.remove("d-none");
    ctx.alert(t("admin.rejected"), "warning");
  } catch (err) {
    console.error(err);
    $("reviewError").textContent = err?.message || t("common.error");
    $("reviewError").classList.remove("d-none");
  } finally {
    hideLoader();
  }
}

/* =========================
   Agregar jugador manual
========================= */
function openManualDialog() {
  const tiers = getActiveTiers(selectedPickup());
  $("manualForm").reset();
  $("manualTier").innerHTML = tiers.map((x) =>
    `<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)} · ${escapeHtml(money(x.amount))}</option>`).join("");
  $("manualError").classList.add("d-none");
  $("manualDialog").showModal();
}

async function onManualSubmit(ev) {
  ev.preventDefault();
  const p = selectedPickup();
  const name = $("manualName").value.trim();
  const tier = getActiveTiers(p).find((x) => x.id === $("manualTier").value);
  if (!name || !tier) {
    $("manualError").textContent = t("joinDialog.errorName");
    $("manualError").classList.remove("d-none");
    return;
  }

  const idNumber = $("manualId").value.trim();
  const personKey = (await personKeyFromId(idNumber)) || `manual:${Date.now()}`;
  const paid = $("manualPaid").checked;
  const amount = Number(tier.amount || 0);

  showLoader();
  try {
    const regId = await addManualRegistration({
      pickup: p,
      pub: {
        source: REG_SOURCE.MANUAL,
        displayName: name,
        linkedUid: null,
        companionOfName: null,
        personKey,
        payerKey: personKey,
        tierId: tier.id,
        tierLabel: tier.label,
        tierSuggestedId: null,
        amountDue: amount,
        paymentStatus: amount <= 0 ? PAYMENT_STATUS.NOT_REQUIRED : PAYMENT_STATUS.PENDING,
        paymentMethod: null,
      },
      priv: { phone: $("manualPhone").value.trim() || null, idNumber: idNumber || null },
    });

    if (paid && amount > 0) {
      await approvePayment({ id: regId, pickupId: p.id, displayName: name, tierLabel: tier.label, amountDue: amount, creditApplied: 0 }, p, $("manualMethod").value);
    }

    $("manualDialog").close();
    await ctx.reload();
    await selectPickup(p.id);
  } catch (err) {
    console.error(err);
    $("manualError").textContent = err?.message || t("common.error");
    $("manualError").classList.remove("d-none");
  } finally {
    hideLoader();
  }
}

/* =========================
   Editor de pickup
========================= */
async function ensureEditor() {
  if (editor.modal) return;
  const el = await loadPartialOnce("/partials/pickup_editor_modal.html");
  applyStrings(el);
  editor.modal = new window.bootstrap.Modal(el);

  $("peStatus").innerHTML = Object.values(PICKUP_STATUS)
    .map((s) => `<option value="${s}">${escapeHtml(t(`status.pickup.${s}`))}</option>`).join("");

  $("peVenue").addEventListener("change", () => {
    const v = getPickupSettings().venues.find((x) => x.id === $("peVenue").value);
    if (!v) return;
    $("peVenueName").value = v.name || "";
    $("peVenueAddress").value = v.address || "";
    $("peMapsUrl").value = v.mapsUrl || "";
    $("peCapacity").value = Number(v.capacity || 0);
    if (typeof v.allowWaitlist === "boolean") $("peAllowWaitlist").checked = v.allowWaitlist;
  });

  $("pickupEditorForm").addEventListener("submit", onEditorSubmit);
}

async function openEditor(pickup) {
  await ensureEditor();
  const s = getPickupSettings();
  editor.id = pickup?.id || null;

  $("peHeading").textContent = t(pickup ? "editor.edit" : "editor.new");
  $("peTzHint").textContent = s.timezone;
  $("peError").classList.add("d-none");

  $("peVenue").innerHTML = [
    `<option value="">${escapeHtml(t("editor.venueCustom"))}</option>`,
    ...s.venues.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`),
  ].join("");

  const p = pickup || {};
  $("peTitle").value = p.title || "";
  $("peSlug").value = p.slug || "";
  // pickup nuevo: el link sigue al título hasta que lo editen a mano
  $("peSlug").dataset.touched = pickup ? "1" : "";
  $("peSlug").oninput = () => { $("peSlug").dataset.touched = "1"; };
  $("peTitle").oninput = () => {
    if (!$("peSlug").dataset.touched) $("peSlug").value = slugify($("peTitle").value);
  };
  $("peStatus").value = p.status || PICKUP_STATUS.DRAFT;
  $("peStartAt").value = dateToClubLocalInput(p.startAt);
  $("peEndAt").value = dateToClubLocalInput(p.endAt);
  $("peVenue").value = p.venueId || "";
  $("peVenueName").value = p.venueName || "";
  $("peVenueAddress").value = p.venueAddress || "";
  $("peMapsUrl").value = p.mapsUrl || "";
  $("peCapacity").value = p.capacity ?? s.defaultCapacity;
  $("peCancelHours").value = p.cancellationHours ?? p.rules?.cancellationDeadlineHours ?? s.defaultCancellationHours;
  $("peAllowWaitlist").checked = p.allowWaitlist ?? s.allowWaitlistByDefault;
  $("peNoShowMustPay").checked = p.noShowMustPay ?? s.noShowMustPayByDefault;
  $("peIsPublic").checked = p.isPublic ?? true;
  $("peNotes").value = p.notes || "";

  if (!pickup && s.venues.length === 1) {
    $("peVenue").value = s.venues[0].id;
    $("peVenue").dispatchEvent(new Event("change"));
  }

  const tiers = pickup ? (p.pricingTiers || []) : s.pricingTiers;
  editor.tierEditor = mountTierEditor($("peTiers"), $("peAddTier"), tiers);

  editor.modal.show();
}

// "pickup-jueves", y si ya existe: "pickup-jueves-2", "pickup-jueves-3"...
function uniqueSlug(base, ownId) {
  const taken = new Set(ctx.getPickups().filter((x) => x.id !== ownId).map((x) => x.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

async function onEditorSubmit(ev) {
  ev.preventDefault();
  const fail = (msg) => { $("peError").textContent = msg; $("peError").classList.remove("d-none"); };

  const startAt = clubLocalInputToDate($("peStartAt").value);
  if (!startAt) return fail(t("editor.errorStart"));
  const tiers = editor.tierEditor.read();
  if (!tiers.length) return fail(t("editor.errorTiers"));

  const title = $("peTitle").value.trim();
  const slug = uniqueSlug(slugify($("peSlug").value) || slugify(title) || "pickup", editor.id);

  const data = {
    title,
    slug,
    status: $("peStatus").value,
    isPublic: $("peIsPublic").checked,
    venueId: $("peVenue").value || null,
    venueName: $("peVenueName").value.trim(),
    venueAddress: $("peVenueAddress").value.trim(),
    mapsUrl: safeUrl($("peMapsUrl").value),
    startAt,
    endAt: clubLocalInputToDate($("peEndAt").value),
    capacity: Math.max(0, Number($("peCapacity").value || 0)),
    cancellationHours: Math.max(0, Number($("peCancelHours").value || 0)),
    allowWaitlist: $("peAllowWaitlist").checked,
    noShowMustPay: $("peNoShowMustPay").checked,
    pricingTiers: tiers,
    notes: $("peNotes").value.trim(),
  };

  showLoader();
  try {
    const id = await savePickup(editor.id, data);
    editor.modal.hide();
    await ctx.reload();
    await selectPickup(id);
    ctx.alert(t("common.saved"), "success");
  } catch (err) {
    console.error(err);
    fail(err?.message || t("common.error"));
  } finally {
    hideLoader();
  }
}
