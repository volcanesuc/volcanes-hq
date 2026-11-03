// /js/features/pickups/pickups_shared.js
// Lógica pura de Pickups (sin Firestore ni DOM): cupos, tarifas, créditos, morosos.
import { associationStatusOf, playerStatusOf } from "/js/core/me.js";
import { APP_CONFIG } from "/js/config/config.js";

export const PICKUP_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CLOSED: "closed",
  FINISHED: "finished",
  CANCELLED: "cancelled",
};

// El cupo (confirmado / lista de espera) NO se guarda: se calcula por orden de llegada.
// Así, cuando alguien se sale, el siguiente sube solo.
export const REG_STATUS = {
  ACTIVE: "active",
  CANCELLED: "cancelled",
};

export const SPOT = {
  IN: "in",
  WAITLIST: "waitlist",
  CANCELLED: "cancelled",
};

export const ATTENDANCE = {
  ATTENDED: "attended",
  NO_SHOW: "no_show",
};

export const PAYMENT_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const REG_SOURCE = {
  USER: "user",
  COMPANION: "companion",
  GUEST: "guest",
  MANUAL: "manual",
};

export const TIER_RULES = ["any", "minor", "associate", "non_associate", "player", "first_time", "guest"];

/* =========================
   Utils
========================= */
export function norm(s) {
  return String(s || "").trim().toLowerCase();
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function safeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

export function toDateSafe(value) {
  if (!value) return null;
  const d = value?.toDate?.() ?? (value instanceof Date ? value : new Date(value));
  return isNaN(d) ? null : d;
}

export function randomToken(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeIdNumber(id) {
  return String(id || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// Clave de persona a partir de la cédula. Se guarda hasheada porque la lista es pública.
export async function personKeyFromId(idNumber) {
  const clean = normalizeIdNumber(idNumber);
  if (!clean) return null;
  const salt = APP_CONFIG?.club?.id || "club";
  const data = new TextEncoder().encode(`${salt}:${clean}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  return `id:${hex.slice(0, 32)}`;
}

export function personKeyFromUid(uid) {
  return uid ? `uid:${uid}` : null;
}

export function whatsappUrl(phone, text, countryCode = "") {
  let digits = String(phone || "").replace(/\D/g, "");
  const cc = String(countryCode || "").replace(/\D/g, "");
  if (cc && digits.length <= 8 && !digits.startsWith(cc)) digits = cc + digits;
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text || "")}`;
}

export function buildPickupPublicUrl(pickup, { regId = "", key = "", absolute = false } = {}) {
  const slug = pickup?.slug || pickup?.id || "";
  const params = new URLSearchParams({ slug });
  if (regId) params.set("reg", regId);
  if (key) params.set("key", key);
  const path = `/public/pickup.html?${params.toString()}`;
  return absolute ? `${window.location.origin}${path}` : path;
}

/* =========================
   Registros (compat con versión anterior)
========================= */
export function regOwnerUid(r) {
  return r?.ownerUid || r?.uid || null;
}

export function regPayerKey(r) {
  return r?.payerKey || personKeyFromUid(regOwnerUid(r)) || r?.id;
}

export function regPersonKey(r) {
  return r?.personKey || regPayerKey(r);
}

export function regTierLabel(r) {
  return r?.tierLabel || r?.pricingTierLabel || "—";
}

export function regAmountDue(r) {
  return Number(r?.amountDue || 0);
}

export function regCreditApplied(r) {
  return Number(r?.creditApplied || 0);
}

// Lo que hay que pagar en dinero (sin el crédito usado).
export function regCashDue(r) {
  return Math.max(0, regAmountDue(r) - regCreditApplied(r));
}

export function isCancelledReg(r) {
  return norm(r?.registrationStatus) === REG_STATUS.CANCELLED;
}

export function isApproved(r) {
  return norm(r?.paymentStatus) === PAYMENT_STATUS.APPROVED;
}

export function isPaidOrFree(r) {
  return isApproved(r) || regAmountDue(r) <= 0 || norm(r?.paymentStatus) === PAYMENT_STATUS.NOT_REQUIRED;
}

function createdMs(r) {
  return toDateSafe(r?.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

// Orden de llegada; joinOrder desempata inscripciones del mismo envío (yo + acompañantes).
function byArrival(a, b) {
  return createdMs(a) - createdMs(b) || Number(a.joinOrder || 0) - Number(b.joinOrder || 0);
}

/* =========================
   Pickup: cupo, hora límite
========================= */
export function getPickupCapacity(pickup) {
  const n = Number(pickup?.capacity ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getCancelDeadline(pickup) {
  const start = toDateSafe(pickup?.startAt);
  if (!start) return null;
  const hours = Number(pickup?.cancellationHours ?? pickup?.rules?.cancellationDeadlineHours ?? 0);
  return new Date(start.getTime() - hours * 3600 * 1000);
}

export function canLeaveNow(pickup, now = new Date()) {
  const deadline = getCancelDeadline(pickup);
  return !deadline || now < deadline;
}

export function hasStarted(pickup, now = new Date()) {
  const start = toDateSafe(pickup?.startAt);
  return !!start && now >= start;
}

export function isJoinOpen(pickup, now = new Date()) {
  return norm(pickup?.status) === PICKUP_STATUS.PUBLISHED && !hasStarted(pickup, now);
}

// Divide los registros activos en confirmados y lista de espera, por orden de llegada.
export function splitSpots(pickup, regs = []) {
  const active = regs
    .filter((r) => r.pickupId === pickup?.id && !isCancelledReg(r))
    .sort(byArrival);

  const cap = getPickupCapacity(pickup);
  if (!cap) return { inList: active, waitlist: [] };
  return { inList: active.slice(0, cap), waitlist: active.slice(cap) };
}

export function getSpotMap(pickup, regs = []) {
  const map = new Map();
  const { inList, waitlist } = splitSpots(pickup, regs);
  inList.forEach((r) => map.set(r.id, SPOT.IN));
  waitlist.forEach((r) => map.set(r.id, SPOT.WAITLIST));
  regs.filter((r) => r.pickupId === pickup?.id && isCancelledReg(r)).forEach((r) => map.set(r.id, SPOT.CANCELLED));
  return map;
}

export function isFull(pickup, regs = []) {
  const cap = getPickupCapacity(pickup);
  if (!cap) return false;
  return splitSpots(pickup, regs).inList.length >= cap;
}

/* =========================
   Tarifas
========================= */
export function getActiveTiers(pickup) {
  const tiers = Array.isArray(pickup?.pricingTiers) ? pickup.pricingTiers : [];
  return tiers.filter((x) => x && x.active !== false);
}

export function isMinorAt(birthDate, at = new Date()) {
  const b = toDateSafe(birthDate);
  if (!b) return false;
  const adult = new Date(b);
  adult.setFullYear(adult.getFullYear() + 18);
  return at < adult;
}

// profile: { isMinor, isAssociate, isPlayer, isFirstTime, isGuest }
export function tierMatches(tier, profile = {}) {
  switch (norm(tier?.rule)) {
    case "minor": return profile.isMinor === true;
    case "associate": return profile.isAssociate === true && !profile.isMinor;
    case "non_associate": return !profile.isAssociate && !profile.isMinor;
    case "player": return profile.isPlayer === true;
    case "first_time": return profile.isFirstTime === true;
    case "guest": return profile.isGuest === true;
    default: return false;
  }
}

// Primera tarifa cuya regla aplica (el orden de la lista define la prioridad).
export function suggestTier(tiers = [], profile = {}) {
  return tiers.find((t) => tierMatches(t, profile)) || null;
}

export function profileFromUserDoc(userDoc = {}, { pickup = null, isFirstTime = false } = {}) {
  const birth = userDoc?.profile?.birthDate ?? userDoc?.birthDate ?? userDoc?.profile?.birthday ?? userDoc?.birthday;
  return {
    isMinor: isMinorAt(birth, toDateSafe(pickup?.startAt) || new Date()),
    isAssociate: associationStatusOf(userDoc) === "active",
    isPlayer: playerStatusOf(userDoc) === "active",
    isFirstTime,
    isGuest: false,
  };
}

/* =========================
   Créditos
   ganado  = pagos aprobados de inscripciones canceladas (salió a tiempo o pickup cancelado)
   gastado = crédito usado en inscripciones vigentes o ya pagadas
========================= */
export function computeCredits(regs = []) {
  const byPayer = new Map();
  const entry = (key) => {
    if (!byPayer.has(key)) byPayer.set(key, { payerKey: key, earned: 0, spent: 0, balance: 0, regs: [] });
    return byPayer.get(key);
  };

  for (const r of regs) {
    const key = regPayerKey(r);
    const cancelled = isCancelledReg(r);
    const approved = isApproved(r);

    if (cancelled && approved && r.creditRefunded !== true) {
      const e = entry(key);
      e.earned += Number(r.paidAmount ?? regAmountDue(r));
      e.regs.push(r);
    }

    const used = regCreditApplied(r);
    if (used > 0) {
      const releases = norm(r.paymentStatus) === PAYMENT_STATUS.REJECTED || (cancelled && !approved);
      if (!releases) entry(key).spent += used;
    }
  }

  byPayer.forEach((e) => { e.balance = Math.max(0, e.earned - e.spent); });
  return byPayer;
}

export function creditBalanceFor(regs = [], payerKey) {
  return computeCredits(regs).get(payerKey)?.balance || 0;
}

/* =========================
   Morosos: estuvo en el juego (o no llegó y la regla dice que paga) y no ha pagado.
========================= */
export function owesMoney(pickup, reg, spot, now = new Date()) {
  if (!pickup || !reg) return false;
  if (norm(pickup.status) === PICKUP_STATUS.CANCELLED) return false;
  if (spot !== SPOT.IN) return false;
  if (!hasStarted(pickup, now)) return false;
  if (isPaidOrFree(reg)) return false;

  if (norm(reg.attendance) === ATTENDANCE.NO_SHOW) {
    return pickup.noShowMustPay !== false;
  }
  return true;
}

export function computeMorosos(pickups = [], regs = [], now = new Date()) {
  const byPayer = new Map();
  const regsByPickup = groupBy(regs, (r) => r.pickupId);

  for (const p of pickups) {
    const list = regsByPickup.get(p.id) || [];
    const spots = getSpotMap(p, list);

    for (const r of list) {
      if (!owesMoney(p, r, spots.get(r.id), now)) continue;
      const key = regPayerKey(r);
      if (!byPayer.has(key)) byPayer.set(key, { payerKey: key, owed: 0, items: [] });
      const e = byPayer.get(key);
      e.owed += regCashDue(r);
      e.items.push({ pickup: p, reg: r });
    }
  }
  return byPayer;
}

export function groupBy(items = [], fn) {
  const map = new Map();
  for (const it of items) {
    const k = fn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
}

/* =========================
   Badges (Bootstrap)
========================= */
export function pickupStatusBadge(status) {
  const s = norm(status);
  if (s === PICKUP_STATUS.PUBLISHED) return "text-bg-success";
  if (s === PICKUP_STATUS.CLOSED) return "text-bg-warning";
  if (s === PICKUP_STATUS.CANCELLED) return "text-bg-danger";
  if (s === PICKUP_STATUS.FINISHED) return "text-bg-secondary";
  return "text-bg-dark";
}

export function paymentBadge(status) {
  const s = norm(status);
  if (s === PAYMENT_STATUS.APPROVED) return "text-bg-success";
  if (s === PAYMENT_STATUS.SUBMITTED) return "text-bg-warning";
  if (s === PAYMENT_STATUS.REJECTED) return "text-bg-danger";
  if (s === PAYMENT_STATUS.NOT_REQUIRED) return "text-bg-secondary";
  return "text-bg-dark";
}

export function spotBadge(spot) {
  if (spot === SPOT.IN) return "text-bg-success";
  if (spot === SPOT.WAITLIST) return "text-bg-info";
  return "text-bg-secondary";
}
