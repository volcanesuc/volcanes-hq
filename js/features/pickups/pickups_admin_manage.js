// /js/features/pickups/pickups_admin_manage.js
// Admin > Gestionar: crear/editar pickups, revisar pagos, asistencia, agregar a mano, cancelar.
import { loadPartialOnce } from "/js/ui/loadPartial.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import {
  applyStrings,
  clubLocalInputToDate,
  dateToClubLocalInput,
  fmtDateTime,
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

export function initManage(context) {
  ctx = context;

  $("managePickupSearch").addEventListener("input", renderPickupList);
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
function renderPickupList() {
  const term = norm($("managePickupSearch").value);
  const items = ctx.getPickups().filter((p) => !term || norm(`${p.title} ${p.venueName}`).includes(term));

  $("managePickupList").innerHTML = items.map((p) => {
    const regs = ctx.getRegs().filter((r) => r.pickupId === p.id);
    const { inList } = splitSpots(p, regs);
    const toReview = regs.filter((r) => norm(r.paymentStatus) === PAYMENT_STATUS.SUBMITTED && norm(r.registrationStatus) !== "cancelled").length;
    return `
      <button type="button" class="list-group-item list-group-item-action pk-pickup-item ${p.id === selectedId ? "active" : ""}" data-pickup-id="${escapeHtml(p.id)}">
        <div class="d-flex justify-content-between gap-2">
          <span class="fw-semibold text-truncate">${escapeHtml(p.title || "—")}</span>
          <span class="badge ${pickupStatusBadge(p.status)}">${escapeHtml(t(`status.pickup.${norm(p.status) || "draft"}`))}</span>
        </div>
        <div class="small text-muted">${escapeHtml(fmtDateTime(p.startAt))} · ${inList.length}${p.capacity ? `/${p.capacity}` : ""}
          ${toReview ? ` · <span class="text-warning-emphasis">${toReview} ${escapeHtml(t("admin.kpiToReview"))}</span>` : ""}</div>
      </button>`;
  }).join("");
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

  const kpi = (label, value) => `
    <div class="col-6 col-md-3"><div class="card shadow-sm pk-kpi"><div class="card-body py-2">
      <div class="small text-muted">${escapeHtml(label)}</div><div class="h4 mb-0">${escapeHtml(value)}</div>
    </div></div></div>`;

  const row = (r, idx) => {
    const spot = spots.get(r.id);
    const status = norm(r.paymentStatus || PAYMENT_STATUS.PENDING);
    const phone = phoneOf(r);
    const credit = regCreditApplied(r);
    return `
      <tr data-reg-id="${escapeHtml(r.id)}">
        <td>${idx + 1}</td>
        <td class="pk-wrap">
          <div class="fw-semibold">${escapeHtml(r.displayName || "—")}</div>
          <div class="small text-muted">${escapeHtml([sourceNote(r), phone].filter(Boolean).join(" · "))}</div>
        </td>
        <td>
          <select class="form-select form-select-sm" data-act="tier" ${spot === SPOT.CANCELLED ? "disabled" : ""}>
            ${tiers.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === r.tierId ? "selected" : ""}>${escapeHtml(x.label)} · ${escapeHtml(money(x.amount))}</option>`).join("")}
            ${tiers.some((x) => x.id === r.tierId) ? "" : `<option selected>${escapeHtml(regTierLabel(r))}</option>`}
          </select>
          ${r.tierSuggestedId && r.tierSuggestedId !== r.tierId ? `<div class="small text-warning-emphasis">≠ ${escapeHtml(tiers.find((x) => x.id === r.tierSuggestedId)?.label || r.tierSuggestedId)}</div>` : ""}
        </td>
        <td><span class="badge ${spotBadge(spot)}">${escapeHtml(t(`status.spot.${spot}`))}</span></td>
        <td>
          <span class="badge ${paymentBadge(status)}">${escapeHtml(t(`status.payment.${status}`))}</span>
          <div class="small text-muted">${escapeHtml(money(r.amountDue))}${credit ? ` (−${escapeHtml(money(credit))})` : ""}</div>
        </td>
        <td>
          <select class="form-select form-select-sm" data-act="attendance" ${spot !== SPOT.IN ? "disabled" : ""}>
            <option value="" ${!r.attendance ? "selected" : ""}>${escapeHtml(t("status.attendance.unknown"))}</option>
            <option value="${ATTENDANCE.ATTENDED}" ${r.attendance === ATTENDANCE.ATTENDED ? "selected" : ""}>${escapeHtml(t("status.attendance.attended"))}</option>
            <option value="${ATTENDANCE.NO_SHOW}" ${r.attendance === ATTENDANCE.NO_SHOW ? "selected" : ""}>${escapeHtml(t("status.attendance.no_show"))}</option>
          </select>
        </td>
        <td>
          <div class="pk-actions">
            ${spot !== SPOT.CANCELLED ? `
              <button type="button" class="btn btn-sm ${status === PAYMENT_STATUS.SUBMITTED ? "btn-warning" : "btn-outline-secondary"}" data-act="review">
                ${escapeHtml(status === PAYMENT_STATUS.SUBMITTED ? t("admin.approve") : t("admin.markPaid"))}</button>
              <button type="button" class="btn btn-sm btn-outline-success" data-act="wa">${escapeHtml(t("common.whatsapp"))}</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-act="remove">${escapeHtml(t("admin.remove"))}</button>
            ` : ""}
            ${spot === SPOT.CANCELLED && isApproved(r) && r.creditRefunded !== true && (credits.get(regPayerKey(r))?.balance || 0) > 0 ? `
              <button type="button" class="btn btn-sm btn-outline-secondary" data-act="refund">${escapeHtml(t("admin.refundCredit"))}</button>` : ""}
          </div>
        </td>
      </tr>`;
  };

  const table = (list, offset = 0) => list.length ? `
    <div class="table-responsive">
      <table class="table table-sm align-middle pk-table">
        <thead><tr>
          <th>#</th><th>${escapeHtml(t("admin.colPlayer"))}</th><th>${escapeHtml(t("admin.colTier"))}</th>
          <th>${escapeHtml(t("admin.colSpot"))}</th><th>${escapeHtml(t("admin.colPayment"))}</th>
          <th>${escapeHtml(t("admin.colAttendance"))}</th><th>${escapeHtml(t("admin.colActions"))}</th>
        </tr></thead>
        <tbody>${list.map((r, i) => row(r, i + offset)).join("")}</tbody>
      </table>
    </div>` : "";

  $("manageDetail").innerHTML = `
    <div class="card shadow-sm mb-3">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <h2 class="h5 mb-1">${escapeHtml(p.title || "—")}</h2>
            <div class="small text-muted">${escapeHtml(fmtDateTime(p.startAt))} · ${escapeHtml(p.venueName || "")}</div>
          </div>
          <div class="pk-actions">
            <a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(buildPickupPublicUrl(p))}" target="_blank" rel="noopener">${escapeHtml(t("list.open"))}</a>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-act="copy">${escapeHtml(t("common.copyLink"))}</button>
            <button type="button" class="btn btn-sm btn-outline-primary" data-act="edit">${escapeHtml(t("admin.edit"))}</button>
            ${isCancelled ? "" : `
              <button type="button" class="btn btn-sm btn-primary" data-act="add">${escapeHtml(t("admin.addPlayer"))}</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-act="cancel">${escapeHtml(t("admin.cancelPickup"))}</button>`}
          </div>
        </div>
      </div>
    </div>

    <div class="row g-2 mb-3">
      ${kpi(t("admin.kpiIn"), `${inList.length}${p.capacity ? ` / ${p.capacity}` : ""}`)}
      ${kpi(t("admin.kpiWaitlist"), String(waitlist.length))}
      ${kpi(t("admin.kpiToReview"), String(toReview))}
      ${kpi(t("admin.kpiCollected"), money(collected))}
    </div>

    ${table(inList)}
    ${waitlist.length ? `<h3 class="h6 mt-3">${escapeHtml(t("public.waitlistTitle"))}</h3>${table(waitlist, inList.length)}` : ""}
    ${cancelled.length ? `
      <details class="mt-3">
        <summary class="small text-muted">${escapeHtml(t("status.spot.cancelled"))} (${cancelled.length})</summary>
        ${table(cancelled)}
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

async function onEditorSubmit(ev) {
  ev.preventDefault();
  const fail = (msg) => { $("peError").textContent = msg; $("peError").classList.remove("d-none"); };

  const startAt = clubLocalInputToDate($("peStartAt").value);
  if (!startAt) return fail(t("editor.errorStart"));
  const tiers = editor.tierEditor.read();
  if (!tiers.length) return fail(t("editor.errorTiers"));

  const title = $("peTitle").value.trim();
  const existing = ctx.getPickups().find((x) => x.id === editor.id);
  const slug = existing?.slug || `${slugify(title) || "pickup"}-${startAt.toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;

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
