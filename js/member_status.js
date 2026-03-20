//js/member_status.js
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

function setText(el, value) {
  if (!el) return;
  el.textContent = value ?? "—";
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
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
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

function daysBetweenNowAnd(dateValue) {
  const d = asDate(dateValue);
  if (!d) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  return Math.round((target - startOfToday) / 86400000);
}

function getCurrentMembership(userData) {
  return userData?.currentMembership || null;
}

function getCoverageStart(cm) {
  return cm?.coverageStartDate || cm?.startDate || null;
}

function getCoverageEnd(cm) {
  return cm?.coverageEndDate || cm?.endDate || null;
}

function getMembershipCoverageDates(currentMembership) {
  return {
    startDate: asDate(getCoverageStart(currentMembership)),
    endDate: asDate(getCoverageEnd(currentMembership)),
  };
}

function clearMembershipFields() {
  setText(els.membershipPlan, "—");
  setText(els.membershipSeason, "—");
  setText(els.membershipCode, "—");
  setText(els.membershipStart, "—");
  setText(els.membershipEnd, "—");
  setText(els.membershipAmount, "—");
}

function getPlanAmount(plan) {
  if (!plan) return null;
  const raw = plan.totalAmount ?? plan.amount ?? null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function fillMembershipFields({ membership, currentMembership, plan }) {
  const coverage = getMembershipCoverageDates(currentMembership);

  setText(
    els.membershipPlan,
    plan?.name ||
      currentMembership?.label ||
      "—"
  );

  setText(
    els.membershipSeason,
    currentMembership?.season ??
      membership?.season ??
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
      getPlanAmount(plan),
      plan?.currency || "CRC"
    )
  );
}

function setPendingUI({ membership, currentMembership, plan }) {
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

  fillMembershipFields({ membership, currentMembership, plan });

  if (els.membershipSummaryText) {
    const submittedAt = membership?.createdAt || null;
    els.membershipSummaryText.textContent = submittedAt
      ? `Tu solicitud fue registrada el ${fmtDate(submittedAt)}. La cobertura se mostrará cuando la membresía sea aprobada.`
      : "Tu solicitud fue recibida. La cobertura se mostrará cuando la membresía sea aprobada.";
  }

  const coverage = getMembershipCoverageDates(currentMembership);

  if (!coverage.startDate) {
    setText(els.membershipStart, "Se asignará al aprobarse");
  }

  if (!coverage.endDate) {
    setText(els.membershipEnd, "Se asignará al aprobarse");
  }
}

function setActiveUI({ membership, currentMembership, plan }) {
  document.body.dataset.status = "active";

  const coverage = getMembershipCoverageDates(currentMembership);
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
    if (endDate && daysLeft !== null && daysLeft >= 0) {
      els.statusMessage.textContent =
        daysLeft === 0
          ? `Tu membresía está activa y vence hoy, ${fmtDate(endDate)}.`
          : `Tu membresía está activa hasta el ${fmtDate(endDate)}.`;
    } else if (endDate) {
      els.statusMessage.textContent = `Tu membresía fue activada y su cobertura llegó hasta el ${fmtDate(endDate)}.`;
    } else {
      els.statusMessage.textContent =
        "Tu pago fue validado correctamente y tu membresía ya se encuentra activa.";
    }
  }

  fillMembershipFields({ membership, currentMembership, plan });

  if (els.membershipSummaryText) {
    if (coverage.startDate && coverage.endDate) {
      els.membershipSummaryText.textContent = `Tu membresía cubre del ${fmtDate(coverage.startDate)} al ${fmtDate(coverage.endDate)}.`;
    } else {
      els.membershipSummaryText.textContent =
        "Tu membresía está activa. La cobertura detallada todavía no está disponible.";
    }
  }
}

function setRejectedUI({ membership, currentMembership, plan }) {
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

  fillMembershipFields({ membership, currentMembership, plan });

  if (els.membershipSummaryText) {
    els.membershipSummaryText.textContent =
      "Tu pago o tu comprobante requieren revisión administrativa antes de poder activar la membresía.";
  }
}

function setFallbackUI({ membership, currentMembership, plan }) {
  document.body.dataset.status = "unknown";

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

  fillMembershipFields({ membership, currentMembership, plan });

  if (els.membershipSummaryText) {
    els.membershipSummaryText.textContent =
      "Estamos mostrando la información disponible actualmente en tu cuenta.";
  }
}

function resolveStatus(userData, membership) {
  const associationStatus = String(userData?.associationStatus || "").trim().toLowerCase();
  const membershipStatus = String(membership?.status || "").trim().toLowerCase();

  if (membershipStatus === "active" || associationStatus === "active") {
    return "active";
  }

  if (
    membershipStatus === "pending" ||
    membershipStatus === "partial" ||
    membershipStatus === "submitted" ||
    membershipStatus === "validating" ||
    associationStatus === "pending"
  ) {
    return "pending";
  }

  if (
    membershipStatus === "rejected" ||
    associationStatus === "rejected"
  ) {
    return "rejected";
  }

  return "unknown";
}

async function loadPlan(planId) {
  if (!planId) return null;

  const planSnap = await getDoc(doc(db, "subscription_plans", planId));
  if (!planSnap.exists()) return null;

  return { id: planSnap.id, ...planSnap.data() };
}

async function loadMemberStatus(uid) {
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) {
    throw new Error("No se encontró la cuenta del usuario.");
  }

  const userData = userSnap.data() || {};
  const associationStatus = String(userData?.associationStatus || "").trim().toLowerCase();
  const currentMembership = getCurrentMembership(userData);

  if (associationStatus !== "active" && !currentMembership?.membershipId) {
    window.location.replace("/index.html");
    return;
  }

  if (!currentMembership?.membershipId) {
    clearMembershipFields();
    setFallbackUI({ membership: null, currentMembership, plan: null });

    showAlert(
      "Todavía no encontramos una membresía asociada a esta cuenta. Si acabas de registrarte, vuelve a intentarlo en unos segundos.",
      "warning"
    );
    return;
  }

  const membershipSnap = await getDoc(doc(db, "memberships", currentMembership.membershipId));
  if (!membershipSnap.exists()) {
    clearMembershipFields();
    setFallbackUI({ membership: null, currentMembership, plan: null });

    showAlert("No se encontró el detalle de la membresía asociada a tu cuenta.", "warning");
    return;
  }

  const membership = { id: membershipSnap.id, ...membershipSnap.data() };
  const plan = await loadPlan(membership?.planId || currentMembership?.planId || null);
  const resolvedStatus = resolveStatus(userData, membership);

  if (resolvedStatus === "active") {
    setActiveUI({ membership, currentMembership, plan });
    return;
  }

  if (resolvedStatus === "pending") {
    setPendingUI({ membership, currentMembership, plan });
    return;
  }

  if (resolvedStatus === "rejected") {
    setRejectedUI({ membership, currentMembership, plan });
    return;
  }

  setFallbackUI({ membership, currentMembership, plan });
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
