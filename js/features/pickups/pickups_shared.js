// /js/features/pickups/pickups_shared.js
import { APP_CONFIG } from "/js/config/config.js";

export const PICKUP_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CLOSED: "closed",
  FINISHED: "finished",
  CANCELLED: "cancelled",
};

export const REG_STATUS = {
  REGISTERED: "registered",
  WAITLIST: "waitlist",
  CANCELLED: "cancelled",
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
    .replace(/[\u0300-\u036f]/g, "")
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

export function fmtDate(value) {
  const d = toDateSafe(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function fmtTime(value) {
  const d = toDateSafe(value);
  if (!d) return "—";
  return d.toLocaleTimeString("es-CR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateTime(value) {
  const d = toDateSafe(value);
  if (!d) return "—";
  return d.toLocaleString("es-CR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildPickupPublicUrl(pickup) {
  const slug = pickup?.slug || pickup?.id || "";
  return `/public/pickup.html?slug=${encodeURIComponent(slug)}`;
}

export function getPickupCapacity(pickup) {
  const n = Number(pickup?.capacity ?? APP_CONFIG?.pickups?.defaultCapacity ?? 50);
  return Number.isFinite(n) ? n : 50;
}

export function isUnlimitedPickup(pickup) {
  return getPickupCapacity(pickup) === 0;
}

export function countActiveRegistrations(regs = []) {
  return regs.filter((r) =>
    [REG_STATUS.REGISTERED, REG_STATUS.WAITLIST, REG_STATUS.ATTENDED].includes(norm(r.registrationStatus))
  ).length;
}

export function countConfirmedRegistrations(regs = []) {
  return regs.filter((r) => norm(r.registrationStatus) === REG_STATUS.REGISTERED).length;
}

export function countWaitlistRegistrations(regs = []) {
  return regs.filter((r) => norm(r.registrationStatus) === REG_STATUS.WAITLIST).length;
}

export function canUserUsePickups(userData = {}) {
  if (userData?.canUsePickups === true) return true;

  const playerStatus = norm(userData?.playerStatus);
  const associationStatus = norm(userData?.associationStatus);

  if (userData?.isPlayerActive === true) return true;
  if (playerStatus === "active") return true;
  if (associationStatus === "active") return true;
  if (associationStatus === "pending") return true;

  return false;
}

export function getPickupTierOptions(pickup = {}) {
  const tiers = Array.isArray(pickup?.pricingTiers) ? pickup.pricingTiers : [];
  return tiers.filter((x) => x && x.active !== false);
}

export function getDefaultPickupPayload() {
  const cap = APP_CONFIG?.pickups?.defaultCapacity ?? 50;
  const cancelHours = APP_CONFIG?.pickups?.defaultCancellationHours ?? 6;

  return {
    title: "",
    slug: "",
    status: PICKUP_STATUS.DRAFT,
    isPublic: true,

    venueName: "",
    venueAddress: "",
    mapsUrl: "",

    startAt: "",
    endAt: "",

    capacity: cap,
    allowWaitlist: APP_CONFIG?.pickups?.allowWaitlistByDefault !== false,

    rules: {
      cancellationDeadlineHours: cancelHours,
      requiresPaymentProof: true,
      allowPublicList: true,
    },

    pricingTiers: [
      { id: "member", label: "Miembro", amount: 2500, active: true },
      { id: "first_time", label: "Primera vez", amount: 0, active: true },
      { id: "minor", label: "Menor de edad", amount: 2000, active: true },
      { id: "guest", label: "Invitado", amount: 3000, active: true },
    ],

    notes: "",
  };
}

export function parsePricingTiersInput(text) {
  const rows = String(text || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const out = [];

  for (const row of rows) {
    const [labelRaw, amountRaw] = row.split("|").map((x) => x.trim());
    if (!labelRaw) continue;

    const id = slugify(labelRaw);
    const amount = Number(amountRaw || 0);

    out.push({
      id,
      label: labelRaw,
      amount: Number.isFinite(amount) ? amount : 0,
      active: true,
    });
  }

  return out;
}

export function pricingTiersToTextarea(tiers = []) {
  if (!Array.isArray(tiers)) return "";
  return tiers
    .map((t) => `${t?.label || ""} | ${Number(t?.amount || 0)}`)
    .join("\n");
}

export function canCancelWithoutPenalty(pickup = {}, now = new Date()) {
  const start = toDateSafe(pickup?.startAt);
  if (!start) return true;

  const hours = Number(pickup?.rules?.cancellationDeadlineHours ?? 6);
  const deadline = new Date(start.getTime() - hours * 60 * 60 * 1000);
  return now <= deadline;
}

export function getStatusBadge(status) {
  const s = norm(status);

  if (s === PICKUP_STATUS.PUBLISHED) return "text-bg-success";
  if (s === PICKUP_STATUS.CLOSED) return "text-bg-warning";
  if (s === PICKUP_STATUS.CANCELLED) return "text-bg-danger";
  if (s === PICKUP_STATUS.FINISHED) return "text-bg-secondary";
  return "text-bg-dark";
}

export function getPaymentBadge(status) {
  const s = norm(status);
  if (s === PAYMENT_STATUS.APPROVED) return "text-bg-success";
  if (s === PAYMENT_STATUS.SUBMITTED) return "text-bg-warning";
  if (s === PAYMENT_STATUS.REJECTED) return "text-bg-danger";
  if (s === PAYMENT_STATUS.NOT_REQUIRED) return "text-bg-secondary";
  return "text-bg-dark";
}