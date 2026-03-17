// /js/features/association/membership_assignment_manual.js

import { db } from "/js/auth/firebase.js";
import { watchAuth } from "/js/auth/auth.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import { APP_CONFIG } from "/js/config/config.js";
import { recomputeMembershipRollup } from "/js/features/membership_rollup.js";

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
const COL = APP_CONFIG.collections;

const COL_USERS = COL.users;
const COL_PLANS = COL.subscriptionPlans;
const COL_MEMBERSHIPS = COL.memberships;
const COL_INSTALLMENTS = COL.membershipInstallments;

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

function normalizeSeasonYear(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < 2000 || n > 2100) return null;
  return n;
}

function normalizeSeasonString(value) {
  const n = normalizeSeasonYear(value);
  return n ? String(n) : null;
}

function mmddToIsoDate(season, mmdd) {
  const year = Number(season);
  if (!Number.isInteger(year)) return null;
  if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return null;
  return `${year}-${mmdd}`;
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
  const sp = String(p.startPolicy || "paid_date").toLowerCase();

  if (!dm) return "";

  const dur =
    dm === 12 ? "12 meses"
    : dm === 6 ? "6 meses"
    : dm === 1 ? "1 mes"
    : `${dm} meses`;

  const start = sp === "jan" ? "enero" : "fecha de pago";

  return `Cubre ${dur}. Inicio: ${start}.`;
}

function setCreating(on) {
  _creating = !!on;
  if (btnCreate) btnCreate.disabled = _creating;
  if (btnClear) btnClear.disabled = _creating;
}

function getUserProfile(u) {
  return u?.profile || {};
}

function buildDisplayName(firstName, lastName) {
  return [firstName, lastName]
    .map((x) => (x || "").toString().trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getUserDisplayName(u) {
  const p = getUserProfile(u);
  return (
    buildDisplayName(p.firstName, p.lastName) ||
    u?.displayName ||
    p.displayName ||
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
    getUserDisplayName(u),
    getUserEmail(u),
    getUserPhone(u),
    p.idNumber,
    u?.uid,
    u?.id,
  ].map(norm).join(" ");
}

function buildUserSnapshot(u) {
  const p = getUserProfile(u);

  return {
    uid: u.uid || u.id,
    firstName: p.firstName || null,
    lastName: p.lastName || null,
    displayName: getUserDisplayName(u),
    email: getUserEmail(u),
    phone: getUserPhone(u),
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
  return String(u.associationStatus || "").trim().toLowerCase() || "";
}

async function loadUsers() {
  const snap = await getDocs(collection(db, COL_USERS));

  users = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.onboardingComplete === true)
    .filter((u) => !!getUserDisplayName(u))
    .filter((u) => normalizeAssociationStatus(u) !== "rejected")
    .sort((a, b) =>
      getUserDisplayName(a).localeCompare(getUserDisplayName(b), "es", { sensitivity: "base" })
    );
}

async function loadPlans() {
  const snap = await getDocs(collection(db, COL_PLANS));

  plans = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !p.archived && p.active !== false)
    .sort((a, b) => {
      const bySeason = Number(b.season || 0) - Number(a.season || 0);
      if (bySeason !== 0) return bySeason;
      return (a.name || "").localeCompare(b.name || "", "es");
    });

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
        <div class="fw-bold">${getUserDisplayName(u)}</div>
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
  associateSearch.value = getUserDisplayName(u);
  associateSelected.textContent = `Seleccionado: ${getUserDisplayName(u)}`;
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
    seasonEl.value = String(new Date().getFullYear());
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
    previewAssociate.textContent = getUserDisplayName(selectedUser);
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

  const season = normalizeSeasonString(seasonEl.value);

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
      const dueIso = season ? mmddToIsoDate(season, x.dueMonthDay) : null;
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
  const qRef = query(
    collection(db, COL_MEMBERSHIPS),
    where("userId", "==", userId),
    where("season", "==", season),
    limit(5)
  );

  const snap = await getDocs(qRef);
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

  const season = normalizeSeasonString(seasonEl.value);

  if (!season) {
    return alert("Temporada inválida. Usá un año válido, por ejemplo 2026.");
  }

  if (!selectedUser) return alert("Seleccioná un usuario.");
  if (!selectedPlan) return alert("Seleccioná un plan.");

  setCreating(true);
  showLoader?.("Verificando…");

  try {
    const userId = selectedUser.uid || selectedUser.id;
    const userDocId = selectedUser.id || selectedUser.uid;

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

    showLoader?.("Creando membresía…");

    const userSnap = buildUserSnapshot(selectedUser);
    const installmentsTemplate = Array.isArray(selectedPlan.installmentsTemplate)
      ? selectedPlan.installmentsTemplate
      : [];

    let totalAmount = selectedPlan.totalAmount ?? null;
    if (!selectedPlan.allowCustomAmount && (totalAmount === null || totalAmount === undefined)) {
      totalAmount = installmentsTemplate.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    }

    const payCode = randomCode(7);

    const membershipPayload = {
      userId,
      userSnapshot: userSnap,

      planId: selectedPlan.id,
      season,

      status: "pending",
      payCode,
      payLinkEnabled: true,
      payLinkDisabledReason: null,

      installmentsTotal: selectedPlan.allowPartial ? installmentsTemplate.length : 0,
      installmentsSettled: 0,
      installmentsPending: selectedPlan.allowPartial ? installmentsTemplate.length : 0,
      nextUnpaidN: selectedPlan.allowPartial ? 1 : null,
      nextUnpaidDueDate: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const membershipDoc = await addDoc(collection(db, COL_MEMBERSHIPS), membershipPayload);
    const mid = membershipDoc.id;

    if (selectedPlan.allowPartial && installmentsTemplate.length) {
      const sorted = installmentsTemplate
        .slice()
        .sort((a, b) => (a.n || 0) - (b.n || 0));

      for (const it of sorted) {
        const dueIso = mmddToIsoDate(season, it.dueMonthDay);

        await addDoc(collection(db, COL_INSTALLMENTS), {
          membershipId: mid,
          season,
          planId: selectedPlan.id,

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
      await updateDoc(doc(db, COL_USERS, userDocId), {
        membershipIds: arrayUnion(mid),
        currentMembership: {
          membershipId: mid,
          season,
          planId: selectedPlan.id,
          label: `${selectedPlan.name || "Membresía"} ${season}`,
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