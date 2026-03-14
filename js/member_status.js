import { db, auth } from "/js/auth/firebase.js";
import { logout } from "/js/auth/auth.js";
import { loadHeader } from "/js/components/header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const els = {
  statusIcon: $("statusIcon"),
  statusTitle: $("statusTitle"),
  statusBadge: $("statusBadge"),
  statusMessage: $("statusMessage"),
  membershipPlan: $("membershipPlan"),
  membershipSeason: $("membershipSeason"),
  membershipCode: $("membershipCode"),
  membershipStart: $("membershipStart"),
  membershipEnd: $("membershipEnd"),
  membershipAmount: $("membershipAmount"),
  membershipSummaryText: $("membershipSummaryText"),
  refreshBtn: $("refreshBtn"),
  logoutBtn: $("logoutBtn"),
  statusAlert: $("statusAlert"),
};

function releaseUI() {
  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
}

function showAlert(msg, type = "warning") {
  if (!els.statusAlert) return;
  els.statusAlert.className = `alert alert-${type} mt-4 mb-0`;
  els.statusAlert.textContent = msg || "Ocurrió un error.";
  els.statusAlert.classList.remove("d-none");
}

function hideAlert() {
  els.statusAlert?.classList.add("d-none");
}

function fmtMoney(amount, currency = "CRC") {
  const n = Number(amount);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency,
  }).format(n);
}

function asDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value) {
  const d = asDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "long",
  }).format(d);
}

//Helpers to calculate duration of membership
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function endOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0);
}

function inferCoverageDates(membership, plan) {
  const durationMonths = Number(plan?.durationMonths || 0);
  const startPolicy = String(plan?.startPolicy || "").trim().toLowerCase();

  const startRaw = membership?.coverageStartDate || null;
  const endRaw = membership?.coverageEndDate || null;

  if (!durationMonths || !["jan", "paid_date"].includes(startPolicy)) {
    return { startDate: null, endDate: null };
  }

  if (!startRaw || !endRaw) {
    return { startDate: null, endDate: null };
  }

  const startDate = new Date(startRaw);
  const endDate = new Date(endRaw);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { startDate: null, endDate: null };
  }

  return { startDate, endDate };
}

function getMembershipCoverageDates(membership) {
  const explicitStart = asDate(membership?.startDate || membership?.activatedAt || null);
  const explicitEnd = asDate(membership?.endDate || membership?.expiresAt || null);

  if (explicitStart || explicitEnd) {
    return {
      startDate: explicitStart,
      endDate: explicitEnd,
      inferred: false,
    };
  }

  const inferred = inferCoverageDates(membership);

  return {
    startDate: inferred.startDate,
    endDate: inferred.endDate,
    inferred: !!(inferred.startDate || inferred.endDate),
  };
}

function daysBetweenNowAnd(dateValue) {
  const d = asDate(dateValue);
  if (!d) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  return Math.round((target - startOfToday) / 86400000);
}

function setText(el, value) {
  if (!el) return;
  el.textContent = value ?? "—";
}

function clearMembershipFields() {
  setText(els.membershipPlan, "—");
  setText(els.membershipSeason, "—");
  setText(els.membershipCode, "—");
  setText(els.membershipStart, "—");
  setText(els.membershipEnd, "—");
  setText(els.membershipAmount, "—");
}

function fillMembershipFields({ membership, currentMembership }) {
  const coverage = getMembershipCoverageDates(membership);

  setText(
    els.membershipPlan,
    membership?.planSnapshot?.name ||
      currentMembership?.label ||
      "—"
  );

  setText(
    els.membershipSeason,
    membership?.season ||
      currentMembership?.season ||
      "—"
  );

  setText(
    els.membershipCode,
    membership?.payCode || "Pendiente"
  );

  setText(
    els.membershipStart,
    fmtDate(coverage.startDate)
  );

  setText(
    els.membershipEnd,
    fmtDate(coverage.endDate)
  );

  setText(
    els.membershipAmount,
    fmtMoney(
      membership?.totalAmount ?? membership?.planSnapshot?.totalAmount,
      membership?.currency || membership?.planSnapshot?.currency || "CRC"
    )
  );
}

function setPendingUI({ membership, currentMembership }) {
  document.body.dataset.status = "pending";
  if (els.statusIcon) {
    els.statusIcon.className = "bi bi-hourglass-split";
  }

  if (els.statusTitle) {
    els.statusTitle.textContent = "Pago en validación";
  }

  if (els.statusBadge) {
    els.statusBadge.className = "badge text-bg-warning";
    els.statusBadge.textContent = "Pendiente";
  }

  if (els.statusMessage) {
    els.statusMessage.textContent =
      "Ya recibimos tu solicitud y tu comprobante de pago. Estamos validando la información antes de activar tu membresía.";
  }

  fillMembershipFields({ membership, currentMembership });

  if (els.membershipSummaryText) {
    const submittedAt = membership?.createdAt || null;
    els.membershipSummaryText.textContent = submittedAt
      ? `Tu solicitud fue registrada el ${fmtDate(submittedAt)}. La fecha de vencimiento se mostrará cuando la membresía sea aprobada.`
      : "Tu solicitud fue recibida. La fecha de vencimiento se mostrará cuando la membresía sea aprobada.";
  }

  const coverage = getMembershipCoverageDates(membership);

  if (!coverage.startDate) {
    setText(els.membershipStart, "Se asignará al aprobarse");
  }

  if (!coverage.endDate) {
    setText(els.membershipEnd, "Se asignará al aprobarse");
  }
}

function setActiveUI({ membership, currentMembership }) {
  document.body.dataset.status = "active";
  const coverage = getMembershipCoverageDates(membership);
  const endDate = coverage.endDate || null;
  const daysLeft = daysBetweenNowAnd(endDate);

  if (els.statusIcon) {
    els.statusIcon.className = "bi bi-check-circle-fill";
  }

  if (els.statusTitle) {
    els.statusTitle.textContent = "Membresía activa";
  }

  if (els.statusBadge) {
    els.statusBadge.className = "badge text-bg-success";
    els.statusBadge.textContent = "Activa";
  }

  if (els.statusMessage) {
    els.statusMessage.textContent = endDate
      ? `Tu pago fue validado correctamente y tu membresía está activa hasta el ${fmtDate(endDate)}.`
      : "Tu pago fue validado correctamente y tu membresía ya se encuentra activa.";
  }

  fillMembershipFields({ membership, currentMembership });

  if (els.membershipSummaryText) {
    const submittedAt = membership?.createdAt || null;
    const coverage = getMembershipCoverageDates(membership);

    if (coverage.startDate && coverage.endDate) {
      els.membershipSummaryText.textContent = submittedAt
        ? `Tu solicitud fue registrada el ${fmtDate(submittedAt)}. Si se aprueba, esta membresía cubrirá del ${fmtDate(coverage.startDate)} al ${fmtDate(coverage.endDate)}.`
        : `Si se aprueba, esta membresía cubrirá del ${fmtDate(coverage.startDate)} al ${fmtDate(coverage.endDate)}.`;
    } else {
      els.membershipSummaryText.textContent = submittedAt
        ? `Tu solicitud fue registrada el ${fmtDate(submittedAt)}. La fecha de vencimiento se mostrará cuando la membresía sea aprobada.`
        : "Tu solicitud fue recibida. La fecha de vencimiento se mostrará cuando la membresía sea aprobada.";
    }
  }
}

function setRejectedUI({ membership, currentMembership }) {
  document.body.dataset.status = "rejected";
  if (els.statusIcon) {
    els.statusIcon.className = "bi bi-exclamation-triangle-fill";
  }

  if (els.statusTitle) {
    els.statusTitle.textContent = "Solicitud observada";
  }

  if (els.statusBadge) {
    els.statusBadge.className = "badge text-bg-danger";
    els.statusBadge.textContent = "Requiere revisión";
  }

  if (els.statusMessage) {
    els.statusMessage.textContent =
      "No pudimos validar tu solicitud con la información actual. Comunícate con el club para más detalle.";
  }

  fillMembershipFields({ membership, currentMembership });

  if (els.membershipSummaryText) {
    els.membershipSummaryText.textContent =
      "Tu pago o tu comprobante requieren revisión administrativa antes de poder activar la membresía.";
  }
}

function setFallbackUI({ membership, currentMembership }) {
  if (els.statusIcon) {
    els.statusIcon.className = "bi bi-person-badge-fill";
  }

  if (els.statusTitle) {
    els.statusTitle.textContent = "Estado de membresía";
  }

  if (els.statusBadge) {
    els.statusBadge.className = "badge text-bg-secondary";
    els.statusBadge.textContent = "Sin confirmar";
  }

  if (els.statusMessage) {
    els.statusMessage.textContent =
      "Todavía no pudimos determinar con claridad el estado actual de tu membresía.";
  }

  fillMembershipFields({ membership, currentMembership });

  if (els.membershipSummaryText) {
    els.membershipSummaryText.textContent =
      "Estamos mostrando la información disponible actualmente en tu cuenta.";
  }
}

function resolveStatus(userData, membership) {
  const associationStatus = String(userData?.associationStatus || "").trim().toLowerCase();
  const membershipStatus = String(membership?.status || "").trim().toLowerCase();

  if (membershipStatus === "active" || associationStatus === "associated_active") {
    return "active";
  }

  if (
    membershipStatus === "pending" ||
    associationStatus === "payment_validation_pending"
  ) {
    return "pending";
  }

  if (
    membershipStatus === "rejected" ||
    associationStatus === "associated_rejected"
  ) {
    return "rejected";
  }

  return "unknown";
}

async function loadMemberStatus(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) {
    throw new Error("No se encontró la cuenta del usuario.");
  }

  const userData = userSnap.data() || {};
  const wantsPlayer = userData?.registration?.wantsPlayer === true;

  if (wantsPlayer) {
    window.location.replace("/index.html");
    return;
  }

  const currentMembership = userData.currentMembership || null;

  if (!currentMembership?.membershipId) {
    clearMembershipFields();
    setFallbackUI({ membership: null, currentMembership });

    showAlert(
      "Todavía no encontramos una membresía asociada a esta cuenta. Si acabas de registrarte, vuelve a intentarlo en unos segundos.",
      "warning"
    );
    return;
  }

  const membershipSnap = await getDoc(doc(db, "memberships", currentMembership.membershipId));
  if (!membershipSnap.exists()) {
    clearMembershipFields();
    setFallbackUI({ membership: null, currentMembership });

    showAlert("No se encontró el detalle de la membresía asociada a tu cuenta.", "warning");
    return;
  }

  const membership = { id: membershipSnap.id, ...membershipSnap.data() };
  const resolvedStatus = resolveStatus(userData, membership);

  if (resolvedStatus === "active") {
    setActiveUI({ membership, currentMembership });
    return;
  }

  if (resolvedStatus === "pending") {
    setPendingUI({ membership, currentMembership });
    return;
  }

  if (resolvedStatus === "rejected") {
    setRejectedUI({ membership, currentMembership });
    return;
  }

  setFallbackUI({ membership, currentMembership });
  showAlert(
    "El estado actual de tu membresía todavía no está completamente definido en el sistema.",
    "warning"
  );
}

async function init() {
  document.body.dataset.status = "loading";
  showLoader("Cargando estado de membresía…");
  hideAlert();

  try {
    await loadHeader("home", { enabledTabs: {} });

    onAuthStateChanged(auth, async (user) => {
      try {
        if (!user?.uid) {
          window.location.replace("/index.html");
          return;
        }

        await loadMemberStatus(user.uid);
      } catch (e) {
        console.error("member_status init error", e);
        showAlert(e?.message || "No se pudo cargar el estado de tu membresía.", "danger");
      } finally {
        hideLoader();
        releaseUI();
      }
    });
  } catch (e) {
    console.error(e);
    showAlert("No se pudo inicializar la página.", "danger");
    hideLoader();
    releaseUI();
  }
}

els.refreshBtn?.addEventListener("click", () => window.location.reload());

els.logoutBtn?.addEventListener("click", async () => {
  try {
    showLoader("Cerrando sesión…");
    await logout();
    window.location.replace("/index.html");
  } catch (e) {
    console.error(e);
    hideLoader();
  }
});

init();