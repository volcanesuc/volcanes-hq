// /js/features/association/membership_detail.js
import { db } from "/js/auth/firebase.js";
import { watchAuth, logout } from "/js/auth/auth.js";
import { loadHeader } from "/js/components/header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { recomputeMembershipRollup } from "/js/features/membership_rollup.js";
import { APP_CONFIG } from "/js/config/config.js";

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

loadHeader("admin");
document.getElementById("logoutBtn")?.addEventListener("click", logout);

/* =========================
   Collections
========================= */
const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_MEMBERSHIPS = COL.memberships;
const COL_INSTALLMENTS = COL.membershipInstallments;
const COL_SUBMISSIONS = COL.membershipPaymentSubmissions;
const COL_PLANS = COL.subscriptionPlans;

/* =========================
   Params
========================= */
const params = new URLSearchParams(window.location.search);
const mid = params.get("mid");

/* =========================
   DOM
========================= */
const alertBox = document.getElementById("alertBox");

const assocName = document.getElementById("assocName");
const assocContact = document.getElementById("assocContact");
const planName = document.getElementById("planName");
const planMeta = document.getElementById("planMeta");

const midText = document.getElementById("midText");
const seasonText = document.getElementById("seasonText");
const statusBadge = document.getElementById("statusBadge");

const btnRefresh = document.getElementById("btnRefresh");
const btnCopyPayLink = document.getElementById("btnCopyPayLink");
const btnOpenPayLink = document.getElementById("btnOpenPayLink");

const btnDisablePayLink = document.getElementById("btnDisablePayLink");
const btnEnablePayLink = document.getElementById("btnEnablePayLink");

const installmentsCount = document.getElementById("installmentsCount");
const installmentsTbody = document.getElementById("installmentsTbody");

const subsCount = document.getElementById("subsCount");
const subsTbody = document.getElementById("subsTbody");

/* Reject modal */
const rejectModalEl = document.getElementById("rejectModal");
const rejectModal = rejectModalEl ? new bootstrap.Modal(rejectModalEl) : null;
const rejectNote = document.getElementById("rejectNote");
const rejectSid = document.getElementById("rejectSid");
const btnConfirmReject = document.getElementById("btnConfirmReject");

/* =========================
   State
========================= */
let membership = null;
let plan = null;
let installments = [];
let submissions = [];

/* =========================
   Helpers
========================= */
function showAlert(msg, type = "warning") {
  if (!alertBox) return alert(msg);
  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove("d-none");
}

function hideAlert() {
  alertBox?.classList.add("d-none");
}

function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function fmtMoney(n, cur = "CRC") {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  }).format(v);
}

function badge(text, cls = "") {
  return `<span class="badge-soft ${cls}">${text}</span>`;
}

function normalizeMembershipStatus(status) {
  const s = String(status || "pending").toLowerCase();

  if (s === "validated" || s === "paid") return "active";
  if (s === "active") return "active";
  if (s === "partial") return "partial";
  if (s === "rejected") return "rejected";
  return "pending";
}

function statusBadgeHtml(st) {
  const s = normalizeMembershipStatus(st);

  if (s === "active") return badge("Activa", "green");
  if (s === "partial") return badge("Parcial", "yellow");
  if (s === "rejected") return badge("Rechazada", "red");
  return badge("Pendiente", "gray");
}

function toDateText(ts) {
  if (!ts) return "—";

  if (typeof ts?.toDate === "function") {
    const d = ts.toDate();
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("es-CR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
    const [y, m, d] = ts.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("es-CR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    }
  }

  const d = new Date(ts);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCurrency() {
  return membership?.currency || plan?.currency || "CRC";
}

function payUrl(membershipId, code) {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/[^/]+$/, "/")}`;
  return `${base}pages/admin/membership_pay.html?mid=${encodeURIComponent(membershipId)}&code=${encodeURIComponent(code || "")}`;
}

function getInstallmentById(id) {
  return installments.find((x) => x.id === id) || null;
}

function isSettledInstallmentStatus(st) {
  const s = (st || "pending").toString().toLowerCase();
  return s === "validated" || s === "paid" || s === "active";
}

function getMemberSnapshot(m) {
  return m?.userSnapshot || {};
}

function getMemberUid(m) {
  return m?.userId || m?.userSnapshot?.uid || null;
}

function getPlanLabel() {
  return `${plan?.name || "Membresía"} ${membership?.season || ""}`.trim();
}

function getCoverageStartValue(m) {
  return m?.coverageStartDate || m?.startDate || null;
}

function getCoverageEndValue(m) {
  return m?.coverageEndDate || m?.endDate || null;
}

function getCoverageText(m) {
  const start = toDateText(getCoverageStartValue(m));
  const end = toDateText(getCoverageEndValue(m));

  if (start === "—" && end === "—") return "—";
  if (start !== "—" && end !== "—") return `${start} → ${end}`;
  return start !== "—" ? start : end;
}

function getSubmissionInstallmentIds(sub) {
  const out = [];

  const arr = sub?.selectedInstallmentIds;
  if (Array.isArray(arr)) {
    for (const x of arr) if (x) out.push(String(x));
  }

  if (sub?.installmentId) out.push(String(sub.installmentId));

  return [...new Set(out.filter(Boolean))];
}

function shouldEnablePayLinkAfterDecision() {
  if (!installments.length) return false;
  return installments.some((it) => !isSettledInstallmentStatus(it.status));
}

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (typeof ts?.toDate === "function") {
      const d = ts.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof ts === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ts)) {
      const [y, m, d] = ts.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addMonthsClamped(baseDate, months) {
  const d = new Date(baseDate);
  const originalDay = d.getDate();

  d.setMonth(d.getMonth() + Number(months || 0));

  if (d.getDate() !== originalDay) {
    d.setDate(0);
  }

  return d;
}

function subtractDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() - Number(days || 0));
  return d;
}

function resolveMembershipBaseDate(m, sub) {
  return tsToDate(m?.createdAt) || tsToDate(sub?.createdAt) || new Date();
}

function computeCoverageDates({ membership: m, submission: sub, plan: p }) {
  const durationMonths = Number(p?.durationMonths || 0);
  const startPolicy = String(p?.startPolicy || "paid_date").trim().toLowerCase();
  const season = Number(m?.season || p?.season || 0);

  if (!durationMonths || !["jan", "paid_date"].includes(startPolicy)) {
    return { coverageStartDate: null, coverageEndDate: null };
  }

  let startDate = null;

  if (startPolicy === "jan") {
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      return { coverageStartDate: null, coverageEndDate: null };
    }
    startDate = new Date(season, 0, 1);
  } else {
    startDate = resolveMembershipBaseDate(m, sub);
  }

  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
    return { coverageStartDate: null, coverageEndDate: null };
  }

  const nextCycleDate = addMonthsClamped(startDate, durationMonths);
  const endDate = subtractDays(nextCycleDate, 1);

  return {
    coverageStartDate: toYmd(startDate),
    coverageEndDate: toYmd(endDate),
  };
}

/* =========================
   Sync user
========================= */
async function syncUserMembershipStatus() {
  const uid = getMemberUid(membership);
  if (!uid) return;

  const normalizedStatus = normalizeMembershipStatus(membership?.status);

  let associationStatus = null;
  if (normalizedStatus === "active") associationStatus = "active";
  else if (normalizedStatus === "rejected") associationStatus = "rejected";
  else associationStatus = "pending";

  try {
    await updateDoc(doc(db, COL_USERS, uid), {
      currentMembership: {
        membershipId: membership.id,
        season: membership.season || null,
        planId: membership.planId || plan?.id || null,
        label: getPlanLabel(),
        status: normalizedStatus,
        installmentsTotal: membership.installmentsTotal ?? 0,
        installmentsSettled: membership.installmentsSettled ?? 0,
        installmentsPending: membership.installmentsPending ?? 0,
        nextUnpaidN: membership.nextUnpaidN ?? null,
        nextUnpaidDueDate: membership.nextUnpaidDueDate ?? null,
        coverageStartDate: membership.coverageStartDate || null,
        coverageEndDate: membership.coverageEndDate || null,
      },
      associationStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("No se pudo sincronizar currentMembership/associationStatus en users", e?.code || e);
  }
}

/* =========================
   Status reconcile
========================= */
function computeMembershipStatus() {
  const requiresValidation = plan?.requiresValidation !== false;

  const subStatuses = submissions.map((s) => norm(s.status || "pending"));
  const anySubValidated = subStatuses.some((s) => s === "validated" || s === "approved");
  const anySubPaidOrValidated = subStatuses.some((s) => s === "paid" || s === "validated" || s === "approved");

  if (installments.length) {
    const sts = installments.map((i) => norm(i.status || "pending"));

    const anySettled = sts.some((s) => s === "paid" || s === "validated" || s === "active");
    const allValidated = sts.every((s) => s === "validated" || s === "active");
    const allSettled = sts.every((s) => s === "paid" || s === "validated" || s === "active");

    if (!anySettled) return "pending";

    if (requiresValidation) {
      return allValidated ? "active" : "partial";
    }

    return allSettled ? "active" : "partial";
  }

  if (!subStatuses.length) return "pending";

  if (requiresValidation) {
    return anySubValidated ? "active" : "pending";
  }

  return anySubPaidOrValidated ? "active" : "pending";
}

async function reconcileMembershipStatus() {
  const next = normalizeMembershipStatus(computeMembershipStatus());
  const curr = normalizeMembershipStatus(membership?.status);

  if (next === curr) {
    membership.status = next;
    return;
  }

  await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
    status: next,
    updatedAt: serverTimestamp(),
  });

  membership.status = next;
  await syncUserMembershipStatus();
}

/* =========================
   Loaders
========================= */
async function loadMembership() {
  const snap = await getDoc(doc(db, COL_MEMBERSHIPS, mid));
  if (!snap.exists()) throw new Error("membership_not_found");
  membership = { id: snap.id, ...snap.data() };
}

async function loadPlan() {
  plan = null;
  const pid = membership?.planId || membership?.planSnapshot?.id || null;

  if (!pid) {
    plan = membership?.planSnapshot || null;
    return;
  }

  const snap = await getDoc(doc(db, COL_PLANS, pid));
  if (snap.exists()) {
    plan = { id: snap.id, ...snap.data() };
    return;
  }

  plan = membership?.planSnapshot || null;
}

async function loadInstallments() {
  const q = query(collection(db, COL_INSTALLMENTS), where("membershipId", "==", mid));
  const snap = await getDocs(q);
  installments = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.n || 0) - (b.n || 0));
}

async function loadSubmissions() {
  const q = query(collection(db, COL_SUBMISSIONS), where("membershipId", "==", mid));
  const snap = await getDocs(q);
  submissions = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.data()?.createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
      const tb = b.data()?.createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
      return tb - ta;
    });
}

/* =========================
   Render
========================= */
function render() {
  if (!membership) return;

  const a = getMemberSnapshot(membership);
  const cur = getCurrency();

  assocName.textContent = a.displayName || "—";
  assocContact.textContent = [a.email || null, a.phone || null].filter(Boolean).join(" • ") || "—";

  planName.textContent = plan?.name || "—";

  const totalTxt = plan?.allowCustomAmount
    ? "Monto editable"
    : fmtMoney(membership.totalAmount ?? plan?.totalAmount ?? plan?.amount, cur);

  const coverageTxt = getCoverageText(membership);
  const metaBits = [
    totalTxt,
    plan?.allowPartial ? "Cuotas" : "Pago único",
    plan?.requiresValidation ? "Validación admin" : "Sin validación",
    `Cobertura: ${coverageTxt}`,
  ];

  planMeta.textContent = metaBits.join(" • ");

  midText.textContent = membership.id || mid;
  seasonText.textContent = membership.season || "—";
  statusBadge.innerHTML = statusBadgeHtml(membership.status);

  const url = payUrl(mid, membership.payCode || "");
  if (btnOpenPayLink) btnOpenPayLink.href = url;

  if (btnCopyPayLink) {
    btnCopyPayLink.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        alert("✅ Link copiado");
      } catch {
        prompt("Copiá el link:", url);
      }
    };
  }

  const enabled = membership.payLinkEnabled !== false;
  if (btnDisablePayLink) btnDisablePayLink.style.display = enabled ? "inline-block" : "none";
  if (btnEnablePayLink) btnEnablePayLink.style.display = enabled ? "none" : "inline-block";

  renderInstallments();
  renderSubmissions();
}

function renderInstallments() {
  const cur = getCurrency();
  if (installmentsCount) installmentsCount.textContent = `${installments.length} cuota(s)`;

  if (!installments.length) {
    installmentsTbody.innerHTML = `<tr><td colspan="4" class="text-muted">Este plan no tiene cuotas (pago único).</td></tr>`;
    return;
  }

  installmentsTbody.innerHTML = installments
    .map((it) => {
      const due = it.dueDate || (it.dueMonthDay ? `${membership.season}-${it.dueMonthDay}` : "—");
      const st = norm(it.status || "pending");

      return `
        <tr>
          <td class="fw-bold">${it.n ?? "—"}</td>
          <td>${due}</td>
          <td style="white-space:nowrap;">${fmtMoney(it.amount, cur)}</td>
          <td>${statusBadgeHtml(st)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSubmissions() {
  const cur = getCurrency();
  if (subsCount) subsCount.textContent = `${submissions.length} envío(s)`;

  if (!submissions.length) {
    subsTbody.innerHTML = `<tr><td colspan="5" class="text-muted">Aún no hay comprobantes enviados.</td></tr>`;
    return;
  }

  subsTbody.innerHTML = submissions
    .map((s) => {
      const st = norm(s.status || "pending");
      const when = toDateText(s.createdAt);

      const ids = getSubmissionInstallmentIds(s);
      let itLabel = "General";

      if (ids.length === 1) {
        const it = getInstallmentById(ids[0]);
        itLabel = it ? `Cuota #${it.n}` : "Cuota (1)";
      } else if (ids.length > 1) {
        const labels = ids
          .map((id) => getInstallmentById(id))
          .filter(Boolean)
          .map((it) => `#${it.n}`);
        itLabel = labels.length ? `Cuotas ${labels.join(", ")}` : `Cuotas (${ids.length})`;
      }

      const fileLink = s.fileUrl
        ? `<a class="btn btn-sm btn-outline-dark" href="${s.fileUrl}" target="_blank" rel="noreferrer">Ver</a>`
        : `<span class="text-muted">—</span>`;

      const detail = `
        <div class="fw-bold">${s.payerName || "—"}</div>
        <div class="small text-muted">${itLabel} • ${s.method || "—"}</div>
        ${s.note ? `<div class="small text-muted">Nota: ${s.note}</div>` : ""}
        ${s.adminNote ? `<div class="small text-danger">Admin: ${s.adminNote}</div>` : ""}
        <div class="mt-1">${fileLink}</div>
      `;

      const locked = st === "validated" || st === "approved" || st === "rejected";
      const actions = `
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-success" data-action="validated" data-sid="${s.id}" ${locked ? "disabled" : ""}>
            Validar
          </button>
          <button class="btn btn-outline-danger" data-action="reject" data-sid="${s.id}" ${locked ? "disabled" : ""}>
            Rechazar
          </button>
        </div>
      `;

      return `
        <tr>
          <td style="white-space:nowrap;">${when}</td>
          <td>${detail}</td>
          <td style="white-space:nowrap;">${fmtMoney(s.amountReported, cur)}</td>
          <td>${statusBadgeHtml(st)}</td>
          <td class="text-end">${actions}</td>
        </tr>
      `;
    })
    .join("");
}

/* =========================
   Actions (submissions)
========================= */
subsTbody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const sid = btn.dataset.sid;
  const sub = submissions.find((x) => x.id === sid);
  if (!sub) return;

  const st = norm(sub.status || "pending");
  if (st === "validated" || st === "approved" || st === "rejected") return;

  if (action === "reject") {
    if (!rejectModal) return;
    rejectSid.value = sid;
    rejectNote.value = "";
    rejectModal.show();
    return;
  }

  if (action === "validated") {
    await setSubmissionStatus(sub, "validated");
  }
});

btnConfirmReject?.addEventListener("click", async () => {
  const sid = rejectSid.value;
  const sub = submissions.find((x) => x.id === sid);
  if (!sub) return;

  const noteTxt = (rejectNote.value || "").trim();
  await setSubmissionStatus(sub, "rejected", noteTxt || "Rechazado por admin");
  rejectModal?.hide();
});

/* =========================
   Set submission status
========================= */
async function setSubmissionStatus(sub, newStatus, adminNote = null) {
  const label =
    newStatus === "validated"
      ? "Validando…"
      : newStatus === "rejected"
        ? "Rechazando…"
        : "Actualizando…";

  showLoader?.(label);

  try {
    await updateDoc(doc(db, COL_SUBMISSIONS, sub.id), {
      status: newStatus,
      adminNote: adminNote ?? null,
      decidedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const ids = getSubmissionInstallmentIds(sub);

    if (ids.length) {
      const newInstStatus = newStatus === "validated" ? "validated" : "pending";

      for (const iid of ids) {
        try {
          await updateDoc(doc(db, COL_INSTALLMENTS, iid), {
            status: newInstStatus,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("No se pudo actualizar installment", iid, e?.code || e);
        }
      }
    }

    await loadInstallments();
    await loadSubmissions();

    await recomputeMembershipRollup(mid);
    await loadMembership();
    await loadPlan();
    await reconcileMembershipStatus();

    if (newStatus === "validated") {
      const alreadyHasCoverage =
        !!membership?.coverageStartDate && !!membership?.coverageEndDate;

      const enableAgain = shouldEnablePayLinkAfterDecision();
      const reason = enableAgain ? null : "Pago(s) validado(s).";

      const updates = {
        lastPaymentSubmissionId: sub.id,
        lastPaymentAt: serverTimestamp(),
        validatedAt: serverTimestamp(),
        payLinkEnabled: enableAgain,
        payLinkDisabledReason: reason,
        updatedAt: serverTimestamp(),
      };

      if (!alreadyHasCoverage) {
        const coverage = computeCoverageDates({
          membership,
          submission: sub,
          plan,
        });

        if (coverage.coverageStartDate) updates.coverageStartDate = coverage.coverageStartDate;
        if (coverage.coverageEndDate) updates.coverageEndDate = coverage.coverageEndDate;
      }

      await updateDoc(doc(db, COL_MEMBERSHIPS, mid), updates);
    } else if (newStatus === "rejected") {
      await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
        payLinkEnabled: true,
        payLinkDisabledReason: null,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await loadMembership();
    await loadPlan();
    await loadInstallments();
    await loadSubmissions();

    await recomputeMembershipRollup(mid);
    await loadMembership();
    await loadPlan();
    await reconcileMembershipStatus();
    await syncUserMembershipStatus();

    render();
    alert("✅ Actualizado");
  } catch (e) {
    console.error(e);
    alert("❌ Error actualizando: " + (e?.message || e));
  } finally {
    hideLoader?.();
  }
}

/* =========================
   Pay link controls (ADMIN)
========================= */
btnDisablePayLink?.addEventListener("click", async () => {
  if (!confirm("¿Bloquear el link de pago?")) return;

  showLoader?.("Bloqueando…");
  try {
    await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
      payLinkEnabled: false,
      payLinkDisabledReason: "Link bloqueado por admin.",
      updatedAt: serverTimestamp(),
    });

    await loadMembership();
    await loadPlan();
    render();
    alert("✅ Link bloqueado");
  } catch (e) {
    console.error(e);
    alert("❌ Error bloqueando link: " + (e?.message || e));
  } finally {
    hideLoader?.();
  }
});

btnEnablePayLink?.addEventListener("click", async () => {
  if (!confirm("¿Habilitar el link de pago nuevamente?")) return;

  showLoader?.("Habilitando…");
  try {
    await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
      payLinkEnabled: true,
      payLinkDisabledReason: null,
      updatedAt: serverTimestamp(),
    });

    await loadMembership();
    await loadPlan();
    render();
    alert("✅ Link habilitado");
  } catch (e) {
    console.error(e);
    alert("❌ Error habilitando link: " + (e?.message || e));
  } finally {
    hideLoader?.();
  }
});

/* =========================
   Boot
========================= */
btnRefresh?.addEventListener("click", async () => {
  await refreshAll();
});

watchAuth(async (user) => {
  if (!user) return;

  if (!mid) {
    showAlert("Falta el parámetro mid en la URL.", "danger");
    return;
  }

  await refreshAll();
});

async function refreshAll() {
  showLoader?.("Cargando membresía…");
  try {
    await loadMembership();
    await loadPlan();
    await loadInstallments();
    await loadSubmissions();

    await recomputeMembershipRollup(mid);
    await loadMembership();
    await loadPlan();
    await reconcileMembershipStatus();
    await syncUserMembershipStatus();

    render();
    hideAlert();
  } catch (e) {
    console.error(e);
    showAlert("No se pudo cargar la membresía.", "danger");
  } finally {
    hideLoader?.();
  }
}