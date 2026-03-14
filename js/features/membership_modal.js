// /js/features/membership_modal.js
import { db } from "../auth/firebase.js";
import { watchAuth } from "../auth/auth.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { recomputeMembershipRollup } from "./membership_rollup.js";

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  limit,
  updateDoc,
  doc,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================
   Collections
========================= */
const COL_USERS = "users";
const COL_PLANS = "subscription_plans";
const COL_MEMBERSHIPS = "memberships";
const COL_INSTALLMENTS = "membership_installments";

/* =========================
   DOM
========================= */
const seasonEl = document.getElementById("season");

const associateSearch = document.getElementById("associateSearch");
const associateMenu = document.getElementById("associateMenu");
const associateSelected = document.getElementById("associateSelected");
const btnNewAssociate = document.getElementById("btnNewAssociate");

const planSelect = document.getElementById("planSelect");
const planHint = document.getElementById("planHint");

const btnCreate = document.getElementById("btnCreate");
const btnClear = document.getElementById("btnClear");

const previewAssociate = document.getElementById("previewAssociate");
const previewAssociateContact = document.getElementById("previewAssociateContact");
const previewPlan = document.getElementById("previewPlan");
const previewPlanMeta = document.getElementById("previewPlanMeta");
const previewTotal = document.getElementById("previewTotal");
const previewInstallments = document.getElementById("previewInstallments");

const resultBox = document.getElementById("resultBox");
const payLinkText = document.getElementById("payLinkText");
const btnCopyLink = document.getElementById("btnCopyLink");
const btnOpenLink = document.getElementById("btnOpenLink");
const btnGoDetail = document.getElementById("btnGoDetail");

const btnClose = document.getElementById("btnClose");
const btnCancel = document.getElementById("btnCancel");

/* =========================
   State
========================= */
let users = [];
let plans = [];
let selectedUser = null;
let selectedPlan = null;
let _creating = false;

/* =========================
   postMessage helpers
========================= */
function post(type, detail) {
  window.parent.postMessage({ type, detail }, window.location.origin);
}

function close() {
  post("modal:close");
}

/* =========================
   Helpers
========================= */
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

function randomCode(len = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function mmddToIsoDate(season, mmdd) {
  if (!season || !/^\d{4}$/.test(season)) return null;
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return null;
  return `${season}-${mmdd}`;
}

function planDisplay(p) {
  const cur = p.currency || "CRC";
  const base = p.allowCustomAmount ? "Monto editable" : fmtMoney(p.totalAmount, cur);
  const cuotas = (p.installmentsTemplate || []).length;
  const cuotasTxt = p.allowPartial ? ` • ${cuotas} cuota(s)` : "";
  return `${p.name || "Plan"} — ${base}${cuotasTxt}`;
}

function setResultLink(mid, code) {
  const baseDir = window.location.href.replace(/\/[^/]+$/, "/");
  const url = `${baseDir}pages/admin/membership_pay.html?mid=${encodeURIComponent(mid)}&code=${encodeURIComponent(code)}`;

  resultBox.style.display = "block";
  payLinkText.textContent = url;
  btnOpenLink.href = url;
  btnGoDetail.href = `${baseDir}pages/admin/membership_detail.html?mid=${encodeURIComponent(mid)}`;
}

function clearResultLink() {
  resultBox.style.display = "none";
  payLinkText.textContent = "";
  btnOpenLink.removeAttribute("href");
  btnGoDetail.href = "#";
}

function durationHint(p) {
  const dm = Number(p.durationMonths || 0);
  const sp = p.startPolicy || "JAN_ONLY";

  if (!dm) return "";

  const dur =
    dm === 12 ? "12 meses" :
    dm === 6 ? "6 meses" :
    dm === 1 ? "1 mes" :
    `${dm} meses`;

  const start =
    dm === 1 ? "cualquier mes" :
    dm === 6 ? (sp === "JAN_OR_JUL" ? "enero o julio" : "enero") :
    "enero";

  return `Cubre ${dur}. Inicio permitido: ${start}.`;
}

function setCreating(on) {
  _creating = !!on;
  if (btnCreate) btnCreate.disabled = _creating;
  if (btnClear) btnClear.disabled = _creating;
}

function getUserProfile(u) {
  return u?.profile || {};
}

function getUserFullName(u) {
  const p = getUserProfile(u);
  return (
    p.fullName ||
    [p.firstName || "", p.lastName || ""].join(" ").trim() ||
    u?.displayName ||
    u?.email ||
    "—"
  );
}

function getUserPhone(u) {
  const p = getUserProfile(u);
  return p.phone || u?.phoneNumber || null;
}

function getUserEmail(u) {
  return u?.email || null;
}

function getUserSearchBlob(u) {
  const p = getUserProfile(u);
  return [
    getUserFullName(u),
    getUserEmail(u),
    getUserPhone(u),
    p.idNumber,
    u?.uid,
  ].map(norm).join(" ");
}

function buildUserSnapshot(u) {
  return {
    uid: u.uid || u.id,
    fullName: getUserFullName(u),
    email: getUserEmail(u),
    phone: getUserPhone(u),
  };
}

function buildPlanSnapshot(plan) {
  return {
    id: plan.id,
    name: plan.name || "",
    currency: plan.currency || "CRC",
    totalAmount: plan.totalAmount ?? null,
    allowCustomAmount: !!plan.allowCustomAmount,
    allowPartial: !!plan.allowPartial,
    requiresValidation: !!plan.requiresValidation,
    benefits: Array.isArray(plan.benefits) ? plan.benefits : [],
    tags: Array.isArray(plan.tags) ? plan.tags : [],
    durationMonths: Number(plan.durationMonths || 0),
    startPolicy: plan.startPolicy || "JAN_ONLY",
  };
}

/* =========================
   Load data
========================= */
watchAuth(async (user) => {
  if (!user) return;
  await boot();
});

async function boot() {
  showLoader?.("Cargando…");
  try {
    await Promise.all([loadUsers(), loadPlans()]);
    wireUI();
    renderPreview();
  } finally {
    hideLoader?.();
  }
}

function normalizeAssociationStatus(u = {}) {
  const raw = String(u.associationStatus || "").trim().toLowerCase();

  if (raw === "payment_validation_pending") return "pending";
  if (raw === "associated_active") return "active";
  if (raw === "associated_rejected") return "rejected";

  return raw || "";
}

async function loadUsers() {
  const snap = await getDocs(collection(db, COL_USERS));

  users = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.onboardingComplete === true)
    .filter((u) => !!getUserFullName(u))
    .filter((u) => normalizeAssociationStatus(u) !== "rejected")
    .sort((a, b) =>
      getUserFullName(a).localeCompare(getUserFullName(b), "es", { sensitivity: "base" })
    );
}

async function loadPlans() {
  const snap = await getDocs(collection(db, COL_PLANS));

  plans = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !p.archived && p.active !== false)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));

  planSelect.innerHTML =
    `<option value="">Seleccioná un plan…</option>` +
    plans.map((p) => `<option value="${p.id}">${planDisplay(p)}</option>`).join("");
}

/* =========================
   User picker UI
========================= */
function openMenu(items) {
  associateMenu.innerHTML = items.map((u) => {
    const email = getUserEmail(u) ? `<div class="text-muted small">${getUserEmail(u)}</div>` : "";
    const phone = getUserPhone(u) ? `<div class="text-muted small">${getUserPhone(u)}</div>` : "";
    const profile = getUserProfile(u);
    const idn = profile.idNumber ? `<div class="text-muted small">ID: ${profile.idNumber}</div>` : "";

    return `
      <div class="picklist-item" data-id="${u.id}">
        <div class="fw-bold">${getUserFullName(u)}</div>
        <div>${email}${phone}${idn}</div>
      </div>
    `;
  }).join("") || `<div class="p-3 text-muted">No hay resultados.</div>`;

  associateMenu.style.display = "block";
}

function closeMenu() {
  associateMenu.style.display = "none";
}

function selectUserById(id) {
  const u = users.find((x) => x.id === id);
  if (!u) return;

  selectedUser = u;
  associateSearch.value = getUserFullName(u);
  associateSelected.textContent = `Seleccionado: ${getUserFullName(u)}`;
  closeMenu();
  renderPreview();
}

/* =========================
   UI wiring
========================= */
function wireUI() {
  btnClose?.addEventListener("click", close);
  btnCancel?.addEventListener("click", close);

  btnNewAssociate?.addEventListener("click", () => {
    alert("Ahora las membresías se crean sobre usuarios existentes. Primero crea/aprueba el usuario en Admin.");
  });

  associateSearch.addEventListener("input", () => {
    const q = norm(associateSearch.value);
    if (!q) {
      closeMenu();
      return;
    }

    const matches = users
      .filter((u) => getUserSearchBlob(u).includes(q))
      .slice(0, 20);

    openMenu(matches);
  });

  associateSearch.addEventListener("focus", () => {
    const q = norm(associateSearch.value);
    if (!q) return;

    const matches = users
      .filter((u) => getUserSearchBlob(u).includes(q))
      .slice(0, 20);

    openMenu(matches);
  });

  document.addEventListener("click", (e) => {
    const inside = e.target.closest(".picklist");
    if (!inside) closeMenu();
  });

  associateMenu.addEventListener("click", (e) => {
    const item = e.target.closest(".picklist-item");
    if (!item) return;
    selectUserById(item.dataset.id);
  });

  planSelect.addEventListener("change", () => {
    const pid = planSelect.value || "";
    selectedPlan = plans.find((p) => p.id === pid) || null;
    renderPreview();
  });

  seasonEl.addEventListener("input", renderPreview);

  btnClear.addEventListener("click", () => {
    selectedUser = null;
    selectedPlan = null;
    associateSearch.value = "";
    associateSelected.textContent = "Ninguno seleccionado";
    planSelect.value = "";
    seasonEl.value = seasonEl.value || "2026";
    clearResultLink();
    renderPreview();
  });

  btnCopyLink.addEventListener("click", async () => {
    const txt = payLinkText.textContent || "";
    if (!txt) return;

    try {
      await navigator.clipboard.writeText(txt);
      alert("✅ Link copiado");
    } catch {
      prompt("Copiá el link:", txt);
    }
  });

  btnCreate.addEventListener("click", createMembership);

  window.addEventListener("message", async (ev) => {
    if (ev.origin !== window.location.origin) return;
    const msg = ev.data || {};

    if (msg.type === "user:saved") {
      await loadUsers();
      const savedId = msg.detail?.id || null;
      if (savedId && users.some((u) => u.id === savedId)) {
        selectUserById(savedId);
      }
    }
  });
}

/* =========================
   Preview
========================= */
function renderPreview() {
  if (selectedUser) {
    previewAssociate.textContent = getUserFullName(selectedUser);
    const parts = [
      getUserEmail(selectedUser) || null,
      getUserPhone(selectedUser) || null,
    ].filter(Boolean);
    previewAssociateContact.textContent = parts.length ? parts.join(" • ") : "—";
  } else {
    previewAssociate.textContent = "—";
    previewAssociateContact.textContent = "—";
  }

  if (selectedPlan) {
    previewPlan.textContent = selectedPlan.name || "—";
    const cur = selectedPlan.currency || "CRC";
    const total = selectedPlan.allowCustomAmount ? "Monto editable" : fmtMoney(selectedPlan.totalAmount, cur);
    const flags = [
      selectedPlan.allowPartial ? "Permite cuotas" : "Pago único",
      selectedPlan.requiresValidation ? "Requiere validación" : "Sin validación",
    ];
    previewPlanMeta.textContent = `${total} • ${flags.join(" • ")}`;
    planHint.textContent = durationHint(selectedPlan);
  } else {
    previewPlan.textContent = "—";
    previewPlanMeta.textContent = "—";
    planHint.textContent = "";
  }

  const season = (seasonEl.value || "").trim();

  if (!selectedPlan) {
    previewTotal.textContent = "—";
    previewInstallments.innerHTML = `<tr><td colspan="3" class="text-muted">—</td></tr>`;
    return;
  }

  const cur = selectedPlan.currency || "CRC";
  const installments = Array.isArray(selectedPlan.installmentsTemplate)
    ? selectedPlan.installmentsTemplate
    : [];

  let totalAmount = selectedPlan.totalAmount ?? null;
  if (!selectedPlan.allowCustomAmount && (totalAmount === null || totalAmount === undefined)) {
    totalAmount = installments.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
  }

  previewTotal.textContent = selectedPlan.allowCustomAmount
    ? "Editable"
    : fmtMoney(totalAmount, cur);

  if (!selectedPlan.allowPartial || installments.length === 0) {
    previewInstallments.innerHTML = `<tr><td colspan="3" class="text-muted">Sin cuotas (pago único)</td></tr>`;
    return;
  }

  const rows = installments
    .slice()
    .sort((a, b) => (a.n || 0) - (b.n || 0))
    .map((x) => {
      const dueIso = mmddToIsoDate(season, x.dueMonthDay);
      const dueTxt = dueIso || (x.dueMonthDay || "—");
      return `
        <tr>
          <td class="fw-bold">${x.n ?? "—"}</td>
          <td>${dueTxt}</td>
          <td>${fmtMoney(x.amount, cur)}</td>
        </tr>
      `;
    })
    .join("");

  previewInstallments.innerHTML = rows || `<tr><td colspan="3" class="text-muted">—</td></tr>`;
}

/* =========================
   Duplicate protection
========================= */
async function findExistingMembership({ userId, season }) {
  const q = query(
    collection(db, COL_MEMBERSHIPS),
    where("userId", "==", userId),
    where("season", "==", season),
    limit(5)
  );

  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!list.length) return null;

  const rank = (st) => {
    const s = (st || "pending").toLowerCase();
    if (s === "active") return 6;
    if (s === "validated") return 5;
    if (s === "paid") return 4;
    if (s === "partial") return 3;
    if (s === "submitted") return 2.5;
    if (s === "pending") return 2;
    if (s === "rejected") return 1;
    return 0;
  };

  const ts = (x) => {
    const u = x.updatedAt?.toMillis ? x.updatedAt.toMillis() : 0;
    const c = x.createdAt?.toMillis ? x.createdAt.toMillis() : 0;
    return Math.max(u, c);
  };

  list.sort((a, b) => {
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (rb !== ra) return rb - ra;
    return ts(b) - ts(a);
  });

  return list[0];
}

/* =========================
   Create membership
========================= */
async function createMembership() {
  if (_creating) return;

  const season = (seasonEl.value || "").trim();

  if (!/^\d{4}$/.test(season) && season !== "all") {
    return alert("Temporada inválida. Usá 2026 (YYYY) o 'all'.");
  }

  if (!selectedUser) return alert("Seleccioná un usuario.");
  if (!selectedPlan) return alert("Seleccioná un plan.");

  setCreating(true);
  showLoader?.("Verificando…");

  try {
    const userId = selectedUser.uid || selectedUser.id;

    if (season !== "all") {
      const existing = await findExistingMembership({ userId, season });

      if (existing) {
        hideLoader?.();

        if (existing.payCode) setResultLink(existing.id, existing.payCode);
        else clearResultLink();

        alert(
          `⚠️ Ya existe una membresía para este usuario en ${season}.\n\n` +
          `Se usará la existente: ${existing.id}\n` +
          `Estado: ${existing.status || "pending"}\n\n` +
          `Si necesitás cambiar plan o corregir datos, abrí el detalle.`
        );

        const baseDir = window.location.href.replace(/\/[^/]+$/, "/");
        window.open(
          `${baseDir}pages/admin/membership_detail.html?mid=${encodeURIComponent(existing.id)}`,
          "_blank",
          "noopener"
        );

        post("membership:created", {
          id: existing.id,
          userId,
          season,
          existed: true,
        });

        return;
      }
    }

    showLoader?.("Creando membresía…");

    const planSnap = buildPlanSnapshot(selectedPlan);
    const userSnap = buildUserSnapshot(selectedUser);
    const installmentsTemplate = Array.isArray(selectedPlan.installmentsTemplate)
      ? selectedPlan.installmentsTemplate
      : [];

    let totalAmount = selectedPlan.totalAmount ?? null;
    if (!planSnap.allowCustomAmount && (totalAmount === null || totalAmount === undefined)) {
      totalAmount = installmentsTemplate.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    }

    const payCode = randomCode(7);

    const membershipDoc = await addDoc(collection(db, COL_MEMBERSHIPS), {
      userId,
      userSnapshot: userSnap,

      // compat temporal
      associateId: null,
      associateSnapshot: null,

      season,
      planId: planSnap.id,
      planSnapshot: planSnap,

      status: "pending",
      totalAmount: planSnap.allowCustomAmount ? null : (totalAmount ?? null),
      currency: planSnap.currency,

      payCode,
      payLinkEnabled: true,
      payLinkDisabledReason: null,

      installmentsTotal: planSnap.allowPartial ? installmentsTemplate.length : 0,
      installmentsSettled: 0,
      installmentsPending: planSnap.allowPartial ? installmentsTemplate.length : 0,
      nextUnpaidN: planSnap.allowPartial ? 1 : null,
      nextUnpaidDueDate: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const mid = membershipDoc.id;

    if (planSnap.allowPartial && installmentsTemplate.length) {
      const sorted = installmentsTemplate.slice().sort((a, b) => (a.n || 0) - (b.n || 0));

      for (const it of sorted) {
        const dueIso = season === "all" ? null : mmddToIsoDate(season, it.dueMonthDay);

        await addDoc(collection(db, COL_INSTALLMENTS), {
          membershipId: mid,
          season,
          planId: planSnap.id,

          n: Number(it.n || 0),
          dueMonthDay: it.dueMonthDay || null,
          dueDate: dueIso,
          amount: Number(it.amount || 0),

          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    try {
      await recomputeMembershipRollup(mid);
    } catch (e) {
      console.warn("No se pudo calcular rollup", e?.code || e);
    }

    try {
      await updateDoc(doc(db, COL_USERS, userId), {
        membershipIds: arrayUnion(mid),
        currentMembership: {
          membershipId: mid,
          season,
          planId: planSnap.id,
          label: `${planSnap.name || "Membresía"} ${season}`,
          status: "pending",
        },
        associationStatus: "pending",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("No se pudo actualizar summary en users", e?.code || e);
    }

    hideLoader?.();

    alert("✅ Membresía creada");
    setResultLink(mid, payCode);

    post("membership:created", { id: mid, userId, season });
  } catch (e) {
    console.error(e);
    alert("❌ Error: " + (e?.message || e));
  } finally {
    hideLoader?.();
    setCreating(false);
  }
}