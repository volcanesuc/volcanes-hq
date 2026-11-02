// /js/public/pickup_view.js
// Página pública de un pickup: unirse (con cuenta, acompañantes o sin cuenta),
// subir comprobante, salirse antes de la hora límite y link privado para invitados.
import { auth } from "/js/auth/firebase.js";
import { loginWithGoogle } from "/js/auth/auth.js";
import { initPublicMinimalHeader } from "/js/components/public-minimal-header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import {
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  applyStrings,
  fmtDateTime,
  loadPickupSettings,
  money,
  t,
} from "/js/features/pickups/pickups_settings.js";

import {
  PAYMENT_STATUS,
  PICKUP_STATUS,
  REG_SOURCE,
  SPOT,
  buildPickupPublicUrl,
  canLeaveNow,
  computeCredits,
  computeMorosos,
  escapeHtml,
  getActiveTiers,
  getCancelDeadline,
  getPickupCapacity,
  getSpotMap,
  isApproved,
  isCancelledReg,
  isJoinOpen,
  norm,
  paymentBadge,
  personKeyFromId,
  personKeyFromUid,
  profileFromUserDoc,
  randomToken,
  regCashDue,
  regOwnerUid,
  regTierLabel,
  safeUrl,
  splitSpots,
  spotBadge,
  suggestTier,
  whatsappUrl,
} from "/js/features/pickups/pickups_shared.js";

import {
  claimRegistration,
  createRegistrations,
  leaveRegistration,
  loadPickup,
  loadPickupBySlug,
  loadPickupBySlugAnyVisibility,
  loadRegsByPayer,
  loadRegsByPersonKey,
  loadRegsForPickup,
  loadUserDoc,
  submitProof,
  uploadProof,
} from "/js/features/pickups/pickups_services.js";

const $ = (id) => document.getElementById(id);
const LINKS_STORAGE_KEY = "pickup_links";

const state = {
  settings: null,
  pickup: null,
  regs: [],
  spots: new Map(),
  user: null,          // usuario Firebase (puede ser anónimo)
  userDoc: null,       // users/{uid} si tiene cuenta
  payerKey: null,
  creditBalance: 0,
  isMoroso: false,
  isFirstTime: false,
  linkRegIds: new Set(),
  proofRegId: null,
  guestHistory: { personKey: null, credit: 0, moroso: false, firstTime: true },
};

/* =========================
   Mensajes
========================= */
function showError(msg) {
  $("pvError").textContent = msg;
  $("pvError").classList.remove("d-none");
  $("pvInfo").classList.add("d-none");
}

function showInfo(msg) {
  $("pvInfo").textContent = msg;
  $("pvInfo").classList.remove("d-none");
  $("pvError").classList.add("d-none");
}

function clearMessages() {
  $("pvError").classList.add("d-none");
  $("pvInfo").classList.add("d-none");
}

/* =========================
   Links privados guardados en este dispositivo
========================= */
function readSavedLinks() {
  try {
    return JSON.parse(localStorage.getItem(LINKS_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveLink(regId, key, pickupId) {
  try {
    const links = readSavedLinks();
    links[regId] = { key, pickupId };
    localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links));
  } catch {
    /* sin storage: el link igual funciona */
  }
}

/* =========================
   Helpers
========================= */
const isAccountUser = () => !!state.user && !state.user.isAnonymous;

function tierOptions(tiers, selectedId) {
  return tiers.map((tier) => `
    <option value="${escapeHtml(tier.id)}" ${tier.id === selectedId ? "selected" : ""}>
      ${escapeHtml(tier.label)} · ${escapeHtml(money(tier.amount))}
    </option>`).join("");
}

function findTier(id) {
  return getActiveTiers(state.pickup).find((x) => x.id === id) || null;
}

function sinpeText() {
  const p = state.settings.payment;
  if (!p.sinpeNumber) return "";
  return t("public.sinpeLine", { number: p.sinpeNumber, name: p.sinpeName });
}

function myRegs() {
  const uid = state.user?.uid;
  return state.regs.filter((r) =>
    (uid && (regOwnerUid(r) === uid || r.linkedUid === uid)) || state.linkRegIds.has(r.id)
  );
}

function myActiveSelfReg() {
  const uid = state.user?.uid;
  return state.regs.find((r) => r.linkedUid === uid && !isCancelledReg(r)) || null;
}

async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  state.user = cred.user;
  return cred.user;
}

async function reloadRegs() {
  state.regs = await loadRegsForPickup(state.pickup.id);
  state.spots = getSpotMap(state.pickup, state.regs);
}

// Calcula quién entra y quién queda en espera, y cuánto crédito se usa.
function buildJoinPlan(tiersForEntries, creditAvailable) {
  const cap = getPickupCapacity(state.pickup);
  const inCount = splitSpots(state.pickup, state.regs).inList.length;
  const spotsLeft = cap ? Math.max(0, cap - inCount) : Infinity;

  let creditLeft = creditAvailable;
  let cashTotal = 0;
  let creditUsed = 0;

  const items = tiersForEntries.map((tier, i) => {
    const spot = i < spotsLeft ? SPOT.IN : SPOT.WAITLIST;
    const amount = Number(tier?.amount || 0);
    let credit = 0;
    if (spot === SPOT.IN && amount > 0 && creditLeft > 0) {
      credit = Math.min(creditLeft, amount);
      creditLeft -= credit;
    }
    if (spot === SPOT.IN) cashTotal += amount - credit;
    creditUsed += credit;
    return { tier, spot, amount, credit };
  });

  const waitlistBlocked = items.some((x) => x.spot === SPOT.WAITLIST) && state.pickup.allowWaitlist === false;
  return { items, cashTotal, creditUsed, waitlistBlocked, allWaitlist: items.every((x) => x.spot === SPOT.WAITLIST) };
}

function paymentFieldsFor(item, hasProof) {
  if (item.amount <= 0) return { paymentStatus: PAYMENT_STATUS.NOT_REQUIRED, paymentMethod: null };
  if (item.spot === SPOT.WAITLIST) return { paymentStatus: PAYMENT_STATUS.PENDING, paymentMethod: null };
  if (item.amount - item.credit <= 0) return { paymentStatus: PAYMENT_STATUS.SUBMITTED, paymentMethod: "credit" };
  if (hasProof) return { paymentStatus: PAYMENT_STATUS.SUBMITTED, paymentMethod: item.credit > 0 ? "credit+sinpe" : "sinpe" };
  return { paymentStatus: PAYMENT_STATUS.PENDING, paymentMethod: null };
}

function totalText(plan) {
  if (plan.cashTotal <= 0 && plan.creditUsed > 0) return t("joinDialog.totalCovered");
  return t("joinDialog.total", { amount: money(plan.cashTotal) });
}

/* =========================
   Render
========================= */
function renderInfo() {
  const p = state.pickup;
  $("pvTitle").textContent = p.title || t("app.title");
  document.title = p.title || t("app.title");

  $("pvStartAt").textContent = fmtDateTime(p.startAt);

  const maps = safeUrl(p.mapsUrl);
  $("pvVenue").innerHTML = `
    <div class="fw-semibold">${escapeHtml(p.venueName || "—")}</div>
    ${p.venueAddress ? `<div class="small text-muted">${escapeHtml(p.venueAddress)}</div>` : ""}
    ${maps ? `<a href="${escapeHtml(maps)}" target="_blank" rel="noopener" class="small">${escapeHtml(t("public.openMap"))}</a>` : ""}
  `;

  const deadline = getCancelDeadline(p);
  $("pvDeadline").textContent = deadline
    ? `${fmtDateTime(deadline)}${canLeaveNow(p) ? "" : ` · ${t("public.deadlinePassed")}`}`
    : "—";

  $("pvNotesWrap").classList.toggle("d-none", !p.notes);
  $("pvNotes").innerHTML = escapeHtml(p.notes || "").replace(/\n/g, "<br>");

  const tiers = getActiveTiers(p);
  $("pvPricing").innerHTML = tiers.map((tier) => `
    <div class="list-group-item d-flex justify-content-between align-items-center">
      <span>${escapeHtml(tier.label)}</span>
      <strong>${escapeHtml(money(tier.amount))}</strong>
    </div>`).join("");

  const sinpe = sinpeText();
  $("pvPayInfo").classList.toggle("d-none", !sinpe && !state.settings.payment.instructions);
  $("pvSinpe").textContent = sinpe;
  $("pvPayInstructions").textContent = state.settings.payment.instructions || "";

  const status = norm(p.status);
  const banner = $("pvBanner");
  if (status === PICKUP_STATUS.CANCELLED) {
    banner.textContent = t("public.cancelledBanner");
    banner.classList.remove("d-none");
  } else if (!isJoinOpen(p)) {
    banner.textContent = t("public.closedBanner");
    banner.classList.remove("d-none");
  } else {
    banner.classList.add("d-none");
  }
}

function renderList() {
  const { inList, waitlist } = splitSpots(state.pickup, state.regs);
  const cap = getPickupCapacity(state.pickup);

  $("pvCapacity").textContent = cap
    ? t("public.capacityValue", { taken: inList.length, capacity: cap })
    : `${inList.length} · ${t("common.unlimited")}`;

  const row = (r) => `
    <li class="list-group-item d-flex justify-content-between align-items-center gap-2">
      <span class="me-auto ms-2">${escapeHtml(r.displayName || "—")}</span>
      <span class="small text-muted">${escapeHtml(regTierLabel(r))}</span>
    </li>`;

  $("pvList").innerHTML = inList.map(row).join("");
  $("pvListEmpty").classList.toggle("d-none", inList.length > 0);

  $("pvWaitWrap").classList.toggle("d-none", waitlist.length === 0);
  $("pvWaitList").innerHTML = waitlist.map(row).join("");
}

function renderMine() {
  const mine = myRegs();
  const card = $("pvMineCard");
  card.classList.toggle("d-none", mine.length === 0);

  const creditEl = $("pvCredit");
  creditEl.classList.toggle("d-none", !(state.creditBalance > 0));
  creditEl.textContent = t("mine.creditBalance", { amount: money(state.creditBalance) });

  const leaveOpen = canLeaveNow(state.pickup);

  $("pvMineList").innerHTML = mine.map((r) => {
    const spot = state.spots.get(r.id) || SPOT.CANCELLED;
    const cancelled = spot === SPOT.CANCELLED;
    const status = norm(r.paymentStatus || PAYMENT_STATUS.PENDING);
    const cash = regCashDue(r);
    const canUpload = !cancelled && cash > 0 && [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.REJECTED].includes(status);

    const notices = [];
    if (status === PAYMENT_STATUS.REJECTED && r.rejectReason) {
      notices.push(`<div class="small text-danger">${escapeHtml(t("mine.rejectedReason", { reason: r.rejectReason }))}</div>`);
    }
    if (spot === SPOT.IN && status === PAYMENT_STATUS.PENDING && cash > 0) {
      notices.push(`<div class="small text-warning-emphasis">${escapeHtml(t("mine.payNow"))}</div>`);
    }
    if (!cancelled && !leaveOpen) {
      notices.push(`<div class="small text-muted">${escapeHtml(t("mine.leaveBlocked"))}</div>`);
    }

    return `
      <div class="list-group-item">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <div class="fw-semibold">${escapeHtml(r.displayName || "—")}</div>
            <div class="small text-muted">${escapeHtml(regTierLabel(r))} · ${escapeHtml(money(r.amountDue))}</div>
          </div>
          <div class="d-flex gap-1 flex-wrap">
            <span class="badge ${spotBadge(spot)}">${escapeHtml(t(`status.spot.${spot}`))}</span>
            ${cancelled ? "" : `<span class="badge ${paymentBadge(status)}">${escapeHtml(t(`status.payment.${status}`))}</span>`}
          </div>
        </div>
        ${notices.join("")}
        ${cancelled ? "" : `
          <div class="d-flex gap-2 mt-2 flex-wrap">
            ${canUpload ? `<button type="button" class="btn btn-sm btn-primary" data-upload="${escapeHtml(r.id)}">
              ${escapeHtml(t(status === PAYMENT_STATUS.REJECTED ? "mine.reuploadProof" : "mine.uploadProof"))}</button>` : ""}
            ${leaveOpen ? `<button type="button" class="btn btn-sm btn-outline-danger" data-leave="${escapeHtml(r.id)}">${escapeHtml(t("mine.leave"))}</button>` : ""}
          </div>`}
      </div>`;
  }).join("");
}

function renderActions() {
  const s = state.settings;
  const p = state.pickup;
  const joinBtn = $("pvJoinBtn");
  const loginBtn = $("pvLoginBtn");
  const guestBtn = $("pvGuestBtn");
  const hint = $("pvActionsHint");

  hint.textContent = "";
  joinBtn.disabled = false;
  joinBtn.textContent = t("join.button");

  const open = isJoinOpen(p);
  $("pvActionsCard").classList.toggle("d-none", !open);
  if (!open) return;

  const full = splitSpots(p, state.regs).inList.length >= (getPickupCapacity(p) || Infinity);
  if (full && p.allowWaitlist === false) {
    joinBtn.classList.remove("d-none");
    joinBtn.disabled = true;
    loginBtn.classList.add("d-none");
    guestBtn.classList.add("d-none");
    hint.textContent = t("public.full");
    return;
  }
  if (full) hint.textContent = t("joinDialog.waitlistSubtitle");

  if (!isAccountUser()) {
    joinBtn.classList.add("d-none");
    loginBtn.classList.remove("d-none");
    guestBtn.classList.toggle("d-none", !s.allowGuests);
    return;
  }

  loginBtn.classList.add("d-none");
  joinBtn.classList.remove("d-none");

  if (state.userDoc?.onboardingComplete !== true) {
    joinBtn.textContent = t("join.completeProfile");
    guestBtn.classList.toggle("d-none", !s.allowGuests);
    return;
  }
  guestBtn.classList.add("d-none");

  if (s.blockMorosos && state.isMoroso) {
    joinBtn.disabled = true;
    hint.textContent = t("join.blockedMoroso");
    return;
  }

  if (myActiveSelfReg() && !s.allowCompanions) {
    joinBtn.disabled = true;
    joinBtn.textContent = t("join.alreadyIn");
  }
}

function renderAll() {
  renderInfo();
  renderList();
  renderMine();
  renderActions();
}

/* =========================
   Historial del usuario (crédito, morosidad, primera vez)
========================= */
async function loadHistoryFor(payerKey, legacyUid = null) {
  const history = await loadRegsByPayer(payerKey, legacyUid);
  const credit = computeCredits(history).get(payerKey)?.balance || 0;

  let moroso = false;
  if (state.settings.blockMorosos && history.length) {
    const ids = [...new Set(history.map((r) => r.pickupId))];
    const pickups = (await Promise.all(ids.map((id) => loadPickup(id).catch(() => null)))).filter(Boolean);
    moroso = computeMorosos(pickups, history).has(payerKey);
  }

  return { history, credit, moroso };
}

async function refreshAccountContext() {
  state.userDoc = null;
  state.payerKey = null;
  state.creditBalance = 0;
  state.isMoroso = false;
  state.isFirstTime = false;

  if (!state.user) return;

  if (isAccountUser()) {
    state.userDoc = await loadUserDoc(state.user.uid).catch(() => null);
    const idKey = await personKeyFromId(state.userDoc?.profile?.idNumber || state.userDoc?.idNumber);
    state.payerKey = idKey || personKeyFromUid(state.user.uid);
  } else {
    state.payerKey = myRegs()[0]?.payerKey || null;
  }

  if (!state.payerKey) return;

  try {
    const { history, credit, moroso } = await loadHistoryFor(state.payerKey, state.user.uid);
    state.creditBalance = credit;
    state.isMoroso = moroso;
    state.isFirstTime = !history.some((r) => r.personKey === state.payerKey && r.pickupId !== state.pickup.id);
  } catch (err) {
    console.warn("[pickup] historial no disponible:", err);
  }
}

/* =========================
   Unirme (con cuenta)
========================= */
function companionRowHtml(tiers, defaultTierId) {
  return `
    <div class="pk-companion" data-companion>
      <div class="row g-2">
        <div class="col-12 col-sm-6">
          <input class="form-control form-control-sm" data-c-name maxlength="80" placeholder="${escapeHtml(t("joinDialog.companionName"))}" />
        </div>
        <div class="col-12 col-sm-6">
          <input class="form-control form-control-sm" data-c-id maxlength="20" placeholder="${escapeHtml(t("joinDialog.companionId"))}" />
        </div>
        <div class="col-9">
          <select class="form-select form-select-sm" data-c-tier>${tierOptions(tiers, defaultTierId)}</select>
        </div>
        <div class="col-3 text-end">
          <button type="button" class="btn btn-sm btn-outline-danger" data-c-remove>${escapeHtml(t("joinDialog.remove"))}</button>
        </div>
      </div>
    </div>`;
}

function readJoinEntries() {
  const entries = [];
  if (!$("joinMeWrap").classList.contains("d-none")) {
    entries.push({ kind: "me", tier: findTier($("joinMeTier").value) });
  }
  document.querySelectorAll("#joinCompanions [data-companion]").forEach((row) => {
    entries.push({
      kind: "companion",
      name: row.querySelector("[data-c-name]").value.trim(),
      idNumber: row.querySelector("[data-c-id]").value.trim(),
      tier: findTier(row.querySelector("[data-c-tier]").value),
    });
  });
  return entries;
}

function updateJoinSummary() {
  const entries = readJoinEntries();
  const credit = $("joinUseCredit").checked ? state.creditBalance : 0;
  const plan = buildJoinPlan(entries.map((e) => e.tier), credit);

  $("joinSubtitle").textContent = plan.allWaitlist && entries.length
    ? t("joinDialog.waitlistSubtitle")
    : t("joinDialog.subtitle");
  $("joinProofWrap").classList.toggle("d-none", plan.cashTotal <= 0);
  $("joinTotal").textContent = entries.length ? totalText(plan) : "";
  return { entries, plan };
}

function openJoinDialog() {
  const tiers = getActiveTiers(state.pickup);
  const profile = profileFromUserDoc(state.userDoc, { pickup: state.pickup, isFirstTime: state.isFirstTime });
  const suggested = suggestTier(tiers, profile) || tiers[0];
  const guestDefault = (suggestTier(tiers, { isGuest: true }) || suggestTier(tiers, {}) || tiers[0])?.id;

  const alreadyIn = !!myActiveSelfReg();
  $("joinMeWrap").classList.toggle("d-none", alreadyIn);
  $("joinMeTier").innerHTML = tierOptions(tiers, suggested?.id);

  $("joinCompanionsWrap").classList.toggle("d-none", !state.settings.allowCompanions);
  $("joinCompanions").innerHTML = alreadyIn ? companionRowHtml(tiers, guestDefault) : "";
  $("joinAddCompanion").onclick = () => {
    $("joinCompanions").insertAdjacentHTML("beforeend", companionRowHtml(tiers, guestDefault));
    updateJoinSummary();
  };

  $("joinCreditWrap").classList.toggle("d-none", !(state.creditBalance > 0));
  $("joinUseCredit").checked = state.creditBalance > 0;
  $("joinUseCreditLabel").textContent = t("joinDialog.useCredit", { amount: money(state.creditBalance) });

  $("joinProof").value = "";
  $("joinSinpe").textContent = sinpeText();
  $("joinError").classList.add("d-none");

  updateJoinSummary();
  $("joinDialog").showModal();
}

async function submitJoin(ev) {
  ev.preventDefault();
  const errorEl = $("joinError");
  const fail = (msg) => { errorEl.textContent = msg; errorEl.classList.remove("d-none"); };
  errorEl.classList.add("d-none");

  const { entries, plan } = updateJoinSummary();
  if (!entries.length) return fail(t("joinDialog.errorTier"));
  if (entries.some((e) => !e.tier)) return fail(t("joinDialog.errorTier"));
  if (entries.some((e) => e.kind === "companion" && !e.name)) return fail(t("joinDialog.errorName"));
  if (plan.waitlistBlocked) return fail(t("public.full"));

  const file = $("joinProof").files?.[0] || null;
  if (plan.cashTotal > 0 && !file) return fail(t("joinDialog.errorProof"));

  showLoader();
  try {
    const proof = plan.cashTotal > 0 ? await uploadProof(file, state.pickup.id) : null;
    const u = state.userDoc || {};
    const myName = `${u.profile?.firstName || ""} ${u.profile?.lastName || ""}`.trim()
      || u.displayName || state.user.displayName || state.user.email || "—";

    const built = await Promise.all(entries.map(async (e, i) => {
      const item = plan.items[i];
      const pay = paymentFieldsFor(item, !!proof);
      const isMe = e.kind === "me";
      const personKey = isMe ? state.payerKey : (await personKeyFromId(e.idNumber)) || `${state.payerKey}:c${Date.now()}${i}`;
      const suggestedTier = isMe
        ? suggestTier(getActiveTiers(state.pickup), profileFromUserDoc(u, { pickup: state.pickup, isFirstTime: state.isFirstTime }))
        : null;

      return {
        pub: {
          source: isMe ? REG_SOURCE.USER : REG_SOURCE.COMPANION,
          displayName: isMe ? myName : e.name,
          linkedUid: isMe ? state.user.uid : null,
          companionOfName: isMe ? null : myName,
          personKey,
          payerKey: state.payerKey,
          tierId: e.tier.id,
          tierLabel: e.tier.label,
          tierSuggestedId: suggestedTier?.id || null,
          amountDue: item.amount,
          creditApplied: item.credit,
          ...pay,
        },
        priv: {
          phone: isMe ? (u.profile?.phone || u.phone || null) : null,
          idNumber: isMe ? (u.profile?.idNumber || null) : (e.idNumber || null),
          email: isMe ? (u.email || state.user.email || null) : null,
          proof: item.spot === SPOT.IN && pay.paymentStatus === PAYMENT_STATUS.SUBMITTED && proof ? proof : null,
        },
      };
    }));

    await createRegistrations({ pickup: state.pickup, entries: built });
    $("joinDialog").close();

    await reloadRegs();
    await refreshAccountContext();
    renderAll();
    showInfo(plan.allWaitlist ? t("joinDialog.successWaitlist") : t("joinDialog.success"));
  } catch (err) {
    console.error("[pickup] join error:", err);
    fail(err?.message || t("common.error"));
  } finally {
    hideLoader();
  }
}

/* =========================
   Unirme sin cuenta
========================= */
async function refreshGuestHistory() {
  const idNumber = $("guestId").value.trim();
  const personKey = await personKeyFromId(idNumber);
  const g = { personKey, credit: 0, moroso: false, firstTime: true };

  if (personKey) {
    try {
      const { history, credit, moroso } = await loadHistoryFor(personKey);
      g.credit = credit;
      g.moroso = moroso;
      g.firstTime = !history.some((r) => r.personKey === personKey);
    } catch (err) {
      console.warn("[pickup] historial invitado no disponible:", err);
    }
  }
  state.guestHistory = g;

  const tiers = getActiveTiers(state.pickup);
  const suggested = suggestTier(tiers, { isGuest: true, isFirstTime: g.firstTime }) || tiers[0];
  if (suggested && !$("guestTier").dataset.touched) $("guestTier").value = suggested.id;

  $("guestCreditWrap").classList.toggle("d-none", !(g.credit > 0));
  $("guestUseCredit").checked = g.credit > 0;
  $("guestUseCreditLabel").textContent = t("joinDialog.useCredit", { amount: money(g.credit) });
  updateGuestSummary();
}

function updateGuestSummary() {
  const tier = findTier($("guestTier").value);
  const credit = $("guestUseCredit").checked ? state.guestHistory.credit : 0;
  const plan = buildJoinPlan([tier], credit);
  $("guestSubtitle").textContent = plan.allWaitlist ? t("joinDialog.waitlistSubtitle") : t("guest.subtitle");
  $("guestProofWrap").classList.toggle("d-none", plan.cashTotal <= 0);
  $("guestTotal").textContent = totalText(plan);
  return { tier, plan };
}

function openGuestDialog() {
  const tiers = getActiveTiers(state.pickup);
  const suggested = suggestTier(tiers, { isGuest: true, isFirstTime: true }) || tiers[0];
  $("guestForm").reset();
  delete $("guestTier").dataset.touched;
  $("guestTier").innerHTML = tierOptions(tiers, suggested?.id);
  $("guestSinpe").textContent = sinpeText();
  $("guestError").classList.add("d-none");
  $("guestCreditWrap").classList.add("d-none");
  state.guestHistory = { personKey: null, credit: 0, moroso: false, firstTime: true };
  updateGuestSummary();
  $("guestDialog").showModal();
}

async function submitGuest(ev) {
  ev.preventDefault();
  const errorEl = $("guestError");
  const fail = (msg) => { errorEl.textContent = msg; errorEl.classList.remove("d-none"); };
  errorEl.classList.add("d-none");

  const name = $("guestName").value.trim();
  const phone = $("guestPhone").value.trim();
  const idNumber = $("guestId").value.trim();
  if (!name || !phone || !idNumber) return fail(t("guest.errorFields"));

  showLoader();
  try {
    await refreshGuestHistory();
    const g = state.guestHistory;
    if (state.settings.blockMorosos && g.moroso) return fail(t("join.blockedMoroso"));

    const { tier, plan } = updateGuestSummary();
    if (!tier) return fail(t("joinDialog.errorTier"));
    if (plan.waitlistBlocked) return fail(t("public.full"));

    const file = $("guestProof").files?.[0] || null;
    if (plan.cashTotal > 0 && !file) return fail(t("joinDialog.errorProof"));

    await ensureSignedIn();
    const proof = plan.cashTotal > 0 ? await uploadProof(file, state.pickup.id) : null;
    const item = plan.items[0];
    const pay = paymentFieldsFor(item, !!proof);
    const key = randomToken();

    const [regId] = await createRegistrations({
      pickup: state.pickup,
      guestKey: key,
      entries: [{
        pub: {
          source: REG_SOURCE.GUEST,
          displayName: name,
          linkedUid: null,
          companionOfName: null,
          personKey: g.personKey,
          payerKey: g.personKey,
          tierId: tier.id,
          tierLabel: tier.label,
          tierSuggestedId: (suggestTier(getActiveTiers(state.pickup), { isGuest: true, isFirstTime: g.firstTime }) || {}).id || null,
          amountDue: item.amount,
          creditApplied: item.credit,
          ...pay,
        },
        priv: {
          phone,
          idNumber,
          email: null,
          proof: pay.paymentStatus === PAYMENT_STATUS.SUBMITTED && proof ? proof : null,
        },
      }],
    });

    saveLink(regId, key, state.pickup.id);
    state.linkRegIds.add(regId);
    $("guestDialog").close();

    await reloadRegs();
    renderAll();
    showInfo(plan.allWaitlist ? t("joinDialog.successWaitlist") : t("joinDialog.success"));
    openLinkDialog(regId, key, phone);
  } catch (err) {
    console.error("[pickup] guest join error:", err);
    fail(err?.message || t("common.error"));
  } finally {
    hideLoader();
  }
}

function openLinkDialog(regId, key, phone) {
  const url = buildPickupPublicUrl(state.pickup, { regId, key, absolute: true });
  $("linkInput").value = url;
  $("linkWaBtn").href = whatsappUrl(
    phone,
    t("guest.shareText", { title: state.pickup.title, url }),
    state.settings.whatsappCountryCode
  );
  $("linkDialog").showModal();
}

/* =========================
   Comprobante / salirme
========================= */
function openProofDialog(regId) {
  const reg = state.regs.find((r) => r.id === regId);
  if (!reg) return;
  state.proofRegId = regId;
  $("proofForm").reset();
  $("proofSubtitle").textContent = `${reg.displayName} · ${money(regCashDue(reg))}`;
  $("proofSinpe").textContent = sinpeText();
  $("proofError").classList.add("d-none");
  $("proofDialog").showModal();
}

async function submitProofForm(ev) {
  ev.preventDefault();
  const file = $("proofFile").files?.[0] || null;
  if (!file) {
    $("proofError").textContent = t("joinDialog.errorProof");
    $("proofError").classList.remove("d-none");
    return;
  }

  showLoader();
  try {
    await ensureSignedIn();
    const proof = await uploadProof(file, state.pickup.id);
    await submitProof(state.proofRegId, proof);
    $("proofDialog").close();
    await reloadRegs();
    renderAll();
    showInfo(t("mine.proofSent"));
  } catch (err) {
    console.error("[pickup] proof error:", err);
    $("proofError").textContent = err?.message || t("common.error");
    $("proofError").classList.remove("d-none");
  } finally {
    hideLoader();
  }
}

async function leave(regId) {
  const reg = state.regs.find((r) => r.id === regId);
  if (!reg) return;
  if (!canLeaveNow(state.pickup)) return showError(t("mine.leaveBlocked"));

  const paid = isApproved(reg);
  if (!window.confirm(paid ? t("mine.leaveConfirmPaid") : t("mine.leaveConfirm"))) return;

  showLoader();
  try {
    await leaveRegistration(regId);
    await reloadRegs();
    await refreshAccountContext();
    renderAll();
    showInfo(paid
      ? t("mine.leftWithCredit", { amount: money(reg.paidAmount ?? reg.amountDue) })
      : t("mine.left"));
  } catch (err) {
    console.error("[pickup] leave error:", err);
    showError(t("common.error"));
  } finally {
    hideLoader();
  }
}

/* =========================
   Eventos
========================= */
function bindEvents() {
  document.querySelectorAll("dialog [data-close]").forEach((btn) =>
    btn.addEventListener("click", () => btn.closest("dialog").close())
  );

  $("pvShareBtn").addEventListener("click", async () => {
    const url = buildPickupPublicUrl(state.pickup, { absolute: true });
    try {
      if (navigator.share) await navigator.share({ title: state.pickup.title, url });
      else {
        await navigator.clipboard.writeText(url);
        showInfo(t("common.linkCopied"));
      }
    } catch {
      /* cancelado */
    }
  });

  $("pvLoginBtn").addEventListener("click", () => loginWithGoogle({
    dashboardPath: buildPickupPublicUrl(state.pickup),
    registerPath: "/public/register.html?google=1",
    memberStatusPath: buildPickupPublicUrl(state.pickup),
    landingPath: buildPickupPublicUrl(state.pickup),
  }));

  $("pvJoinBtn").addEventListener("click", () => {
    clearMessages();
    if (state.userDoc?.onboardingComplete !== true) {
      window.location.href = "/public/register.html";
      return;
    }
    openJoinDialog();
  });

  $("pvGuestBtn").addEventListener("click", () => {
    clearMessages();
    openGuestDialog();
  });

  $("joinForm").addEventListener("submit", submitJoin);
  $("joinForm").addEventListener("change", updateJoinSummary);
  $("joinCompanions").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-c-remove]");
    if (!btn) return;
    btn.closest("[data-companion]").remove();
    updateJoinSummary();
  });

  $("guestForm").addEventListener("submit", submitGuest);
  $("guestTier").addEventListener("change", () => {
    $("guestTier").dataset.touched = "1";
    updateGuestSummary();
  });
  $("guestUseCredit").addEventListener("change", updateGuestSummary);
  $("guestId").addEventListener("change", refreshGuestHistory);

  $("proofForm").addEventListener("submit", submitProofForm);

  $("linkCopyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("linkInput").value);
      $("linkCopyBtn").textContent = t("common.linkCopied");
    } catch {
      $("linkInput").select();
    }
  });

  $("pvMineList").addEventListener("click", (ev) => {
    const up = ev.target.closest("[data-upload]");
    if (up) return openProofDialog(up.getAttribute("data-upload"));
    const lv = ev.target.closest("[data-leave]");
    if (lv) return leave(lv.getAttribute("data-leave"));
  });
}

/* =========================
   Links privados (?reg=...&key=...) y guardados
========================= */
async function claimLinks() {
  const params = new URLSearchParams(window.location.search);
  const regId = params.get("reg");
  const key = params.get("key");

  const links = readSavedLinks();
  if (regId && key) links[regId] = { key, pickupId: state.pickup.id };

  const forThisPickup = Object.entries(links).filter(([, v]) => v?.pickupId === state.pickup.id);
  if (!forThisPickup.length) return;

  await ensureSignedIn();
  for (const [id, v] of forThisPickup) {
    const ok = await claimRegistration(id, v.key);
    if (ok) {
      state.linkRegIds.add(id);
      saveLink(id, v.key, state.pickup.id);
    }
  }
}

/* =========================
   Init
========================= */
(async function init() {
  let waitingForAuth = false;
  showLoader();
  try {
    state.settings = await loadPickupSettings();
    applyStrings();
    await initPublicMinimalHeader({ activeTab: "home", brandHref: "/index.html" });

    const slug = new URLSearchParams(window.location.search).get("slug")?.trim();
    if (!slug) return showError(t("public.missingSlug"));

    // esperar la sesión: los admins pueden ver borradores y pickups privados
    state.user = await new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u || null); });
    });
    const viewerDoc = isAccountUser() ? await loadUserDoc(state.user.uid).catch(() => null) : null;
    const isAdminViewer = norm(viewerDoc?.role) === "admin";

    state.pickup = await loadPickupBySlug(slug).catch(() => null)
      || (isAccountUser() ? await loadPickupBySlugAnyVisibility(slug) : null);

    const hidden = state.pickup && (norm(state.pickup.status) === PICKUP_STATUS.DRAFT || state.pickup.isPublic !== true);
    if (!state.pickup || (hidden && !isAdminViewer)) {
      $("pvActionsCard").classList.add("d-none");
      return showError(t(state.pickup ? "public.notPublished" : "public.notFound"));
    }

    await reloadRegs();
    bindEvents();
    await claimLinks().catch((err) => console.warn("[pickup] links:", err));
    await refreshAccountContext();
    renderAll();
    if (hidden) showInfo(t("public.adminPreview"));

    // cambios de sesión posteriores (login, invitado anónimo)
    let first = true;
    onAuthStateChanged(auth, async (user) => {
      if (first) { first = false; return; }
      state.user = user || null;
      await refreshAccountContext();
      renderAll();
    });
  } catch (err) {
    console.error("[pickup_view] init error:", err);
    showError(err?.message || t("common.error"));
    waitingForAuth = false;
  } finally {
    if (!waitingForAuth) hideLoader();
    document.documentElement.classList.remove("preload");
  }
})();
