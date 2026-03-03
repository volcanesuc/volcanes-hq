// js/features/membership_detail.js
import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { loadHeader } from "../components/header.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { recomputeMembershipRollup } from "./membership_rollup.js";

import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

loadHeader("admin");
document.getElementById("logoutBtn")?.addEventListener("click", logout);

/* =========================
   Collections
========================= */
const COL_MEMBERSHIPS = "memberships";
const COL_INSTALLMENTS = "membership_installments";
const COL_SUBMISSIONS = "membership_payment_submissions";

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

function fmtMoney(n, cur = "CRC") {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0
  }).format(v);
}

function badge(text, cls = "") {
  return `<span class="badge-soft ${cls}">${text}</span>`;
}

function statusBadgeHtml(st) {
  const s = (st || "pending").toLowerCase();
  if (s === "validated") return badge("Validado", "green");
  if (s === "paid") return badge("Pagado", "green");
  if (s === "partial") return badge("Parcial", "yellow");
  if (s === "submitted") return badge("En revisión", "yellow");
  if (s === "rejected") return badge("Rechazado", "red");
  if (s === "inactive") return badge("Inactivo", "gray");
  return badge("Pendiente", "gray");
}

function toDateText(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getCurrency() {
  return membership?.currency || membership?.planSnapshot?.currency || "CRC";
}

function payUrl(mid, code) {
  const base = `${window.location.origin}${window.location.pathname.replace(/\/[^/]+$/, "/")}`;
  return `${base}pages/admin/membership_pay.html?mid=${encodeURIComponent(mid)}&code=${encodeURIComponent(code || "")}`;
}

function getInstallmentById(id) {
  return installments.find((x) => x.id === id) || null;
}

function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function isSettledInstallmentStatus(st) {
  const s = (st || "pending").toString().toLowerCase();
  return s === "validated" || s === "paid";
}

/**
 * IDs de cuotas desde submission:
 * - prioridad: selectedInstallmentIds (multi)
 * - fallback: installmentId (single legacy)
 * Devuelve ids únicos.
 */
function getSubmissionInstallmentIds(sub) {
  const out = [];

  const arr = sub?.selectedInstallmentIds;
  if (Array.isArray(arr)) {
    for (const x of arr) if (x) out.push(String(x));
  }
  if (sub?.installmentId) out.push(String(sub.installmentId));

  return [...new Set(out.filter(Boolean))];
}

/**
 * ✅ Si hay cuotas y queda al menos 1 cuota pendiente => habilitar link
 * Si no hay cuotas => normalmente pago único => false
 */
function shouldEnablePayLinkAfterDecision() {
  if (!installments.length) return false;
  return installments.some((it) => !isSettledInstallmentStatus(it.status));
}

/* =========================
   Status reconcile (IMPORTANT)
   - Si HAY cuotas: status se decide por cuotas (no por submissions)
   - submitted: si hay al menos 1 submission pending => submitted
   - partial: si hay algo pagado/validado pero no todo settle/validado
========================= */
function computeMembershipStatus() {
  const p = membership?.planSnapshot || {};
  const requiresValidation = !!p.requiresValidation;

  // si hay algún submission pendiente, lo marcamos como "submitted"
  const hasPendingSubmission = submissions.some((s) => norm(s.status || "pending") === "pending");

  if (installments.length) {
    const sts = installments.map((i) => norm(i.status || "pending"));

    const anySettled = sts.some((s) => s === "paid" || s === "validated");
    const allValidated = sts.every((s) => s === "validated");
    const allSettled = sts.every((s) => s === "paid" || s === "validated");

    if (!anySettled) {
      // si todavía no hay ninguna cuota settled, pero hay submission pendiente => "submitted"
      return hasPendingSubmission ? "submitted" : "pending";
    }

    if (requiresValidation) {
      // con validación: solo "validated" si TODAS las cuotas están validated
      return allValidated ? "validated" : (hasPendingSubmission ? "submitted" : "partial");
    }

    // sin validación: "paid" si TODAS están paid/validated
    return allSettled ? "paid" : (hasPendingSubmission ? "submitted" : "partial");
  }

  // sin cuotas: por submissions
  const subStatuses = submissions.map((s) => norm(s.status || "pending"));
  if (!subStatuses.length) return "pending";
  if (hasPendingSubmission) return "submitted";

  if (requiresValidation) return subStatuses.includes("validated") ? "validated" : "pending";
  return (subStatuses.includes("paid") || subStatuses.includes("validated")) ? "paid" : "pending";
}

async function reconcileMembershipStatus() {
  const next = computeMembershipStatus();
  const curr = norm(membership?.status || "pending");
  if (next === curr) return;

  await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
    status: next,
    updatedAt: serverTimestamp()
  });
  membership.status = next;
}

/* =========================
   Loaders
========================= */
async function loadMembership() {
  const snap = await getDoc(doc(db, COL_MEMBERSHIPS, mid));
  if (!snap.exists()) throw new Error("membership_not_found");
  membership = { id: snap.id, ...snap.data() };
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
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
}

/* =========================
   Render
========================= */
function render() {
  if (!membership) return;

  const a = membership.associateSnapshot || {};
  const p = membership.planSnapshot || {};
  const cur = getCurrency();

  assocName.textContent = a.fullName || "—";
  assocContact.textContent = [a.email || null, a.phone || null].filter(Boolean).join(" • ") || "—";

  planName.textContent = p.name || "—";
  const totalTxt = p.allowCustomAmount
    ? "Monto editable"
    : fmtMoney(membership.totalAmount ?? p.totalAmount, cur);

  planMeta.textContent = `${totalTxt} • ${p.allowPartial ? "Cuotas" : "Pago único"} • ${p.requiresValidation ? "Validación admin" : "Sin validación"}`;

  midText.textContent = membership.id || mid;
  seasonText.textContent = membership.season || "—";
  statusBadge.innerHTML = statusBadgeHtml(membership.status);

  // Pay link UI
  const url = payUrl(mid, membership.payCode || "");
  btnOpenPayLink.href = url;

  btnCopyPayLink.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert("✅ Link copiado");
    } catch {
      prompt("Copiá el link:", url);
    }
  };

  const enabled = membership.payLinkEnabled !== false;
  btnDisablePayLink && (btnDisablePayLink.style.display = enabled ? "inline-block" : "none");
  btnEnablePayLink && (btnEnablePayLink.style.display = enabled ? "none" : "inline-block");

  renderInstallments();
  renderSubmissions();
}

function renderInstallments() {
  const cur = getCurrency();
  installmentsCount.textContent = `${installments.length} cuota(s)`;

  if (!installments.length) {
    installmentsTbody.innerHTML = `<tr><td colspan="4" class="text-muted">Este plan no tiene cuotas (pago único).</td></tr>`;
    return;
  }

  installmentsTbody.innerHTML = installments.map((it) => {
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
  }).join("");
}

function renderSubmissions() {
  const cur = getCurrency();
  subsCount.textContent = `${submissions.length} envío(s)`;

  if (!submissions.length) {
    subsTbody.innerHTML = `<tr><td colspan="5" class="text-muted">Aún no hay comprobantes enviados.</td></tr>`;
    return;
  }

  subsTbody.innerHTML = submissions.map((s) => {
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

    const locked = st === "validated" || st === "rejected";
    const actions = `
      <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-outline-secondary" data-action="paid" data-sid="${s.id}" ${locked ? "disabled" : ""}>
          Pagado
        </button>
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
  }).join("");
}

/* =========================
   Actions (submissions)
========================= */
subsTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const sid = btn.dataset.sid;
  const sub = submissions.find((x) => x.id === sid);
  if (!sub) return;

  const st = norm(sub.status || "pending");
  if (st === "validated" || st === "rejected") return;

  if (action === "reject") {
    if (!rejectModal) return;
    rejectSid.value = sid;
    rejectNote.value = "";
    rejectModal.show();
    return;
  }

  if (action === "paid") {
    await setSubmissionStatus(sub, "paid");
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
   Set submission status (single o multi)
========================= */
async function setSubmissionStatus(sub, newStatus, adminNote = null) {
  const label =
    newStatus === "paid" ? "Marcando pagado…" :
    newStatus === "validated" ? "Validando…" :
    newStatus === "rejected" ? "Rechazando…" : "Actualizando…";

  showLoader?.(label);

  try {
    // 1) Update submission
    await updateDoc(doc(db, COL_SUBMISSIONS, sub.id), {
      status: newStatus,
      adminNote: adminNote ?? null,
      decidedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 2) Update installments (single o multi)
    const ids = getSubmissionInstallmentIds(sub);

    if (ids.length) {
      const newInstStatus =
        newStatus === "validated" ? "validated" :
        newStatus === "paid" ? "paid" :
        "pending";

      for (const iid of ids) {
        try {
          await updateDoc(doc(db, COL_INSTALLMENTS, iid), {
            status: newInstStatus,
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.warn("No se pudo actualizar installment", iid, e?.code || e);
        }
      }
    }

    // 3) Reload (para decidir si quedan cuotas)
    await loadInstallments();
    await loadSubmissions();
    console.log("MID", mid);
    console.table(installments.map(i => ({
      id: i.id,
      n: i.n,
      dueDate: i.dueDate,
      membershipId: i.membershipId,
      status: i.status
    })));
    await recomputeMembershipRollup(mid);
    await loadMembership(); // refrescar membership con los rollups guardados

    // ✅ status consistente con cuotas
    await reconcileMembershipStatus();

    // 4) Membership metadata + pay link rules
    if (newStatus === "validated" || newStatus === "paid") {
      const enableAgain = shouldEnablePayLinkAfterDecision();
      const reason = enableAgain
        ? null
        : (newStatus === "validated" ? "Pago(s) validado(s)." : "Pago registrado.");

      await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
        lastPaymentSubmissionId: sub.id,
        lastPaymentAt: serverTimestamp(),
        ...(newStatus === "validated" ? { validatedAt: serverTimestamp() } : {}),

        payLinkEnabled: enableAgain,
        payLinkDisabledReason: reason,

        updatedAt: serverTimestamp()
      });

      membership.payLinkEnabled = enableAgain;
      membership.payLinkDisabledReason = reason;

    } else if (newStatus === "rejected") {
      await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
        payLinkEnabled: true,
        payLinkDisabledReason: null,
        updatedAt: serverTimestamp()
      });
      membership.payLinkEnabled = true;
      membership.payLinkDisabledReason = null;
    }

    await loadMembership();
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
      updatedAt: serverTimestamp()
    });

    await loadMembership();
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
      updatedAt: serverTimestamp()
    });

    await loadMembership();
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
    await loadInstallments();
    await loadSubmissions();

    await recomputeMembershipRollup(mid);
    await loadMembership(); // trae installmentsTotal/nextUnpaidDueDate ya guardados
    await reconcileMembershipStatus();

    render();
    hideAlert();
  } catch (e) {
    console.error(e);
    showAlert("No se pudo cargar la membresía.", "danger");
  } finally {
    hideLoader?.();
  }
}

