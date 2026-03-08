// //js\auth\register.js
import { db, auth, storage } from "./firebase.js";
import { loginWithGoogle, logout } from "./auth.js";
import { loadHeader } from "../components/header.js";
import { APP_CONFIG } from "../config/config.js";
import { showLoader, hideLoader, updateLoaderMessage } from "/js/ui/loader.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref as sRef,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

function releaseUI() {
  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
}

releaseUI(); // ✅ apenas carga el módulo, mostramos la página

const url = new URL(location.href);
const created = url.searchParams.get("created"); // "0" o "1" o null

if (created === "0") {
  // No hagás nada especial, pero asegurá UI visible.
  releaseUI();
}

if (created === "1") {
  // si querés: showAlert("Cuenta creada. Completá el formulario para terminar.", "success");
  releaseUI();
}

// ✅ si algo se queda colgado o tarda, igual mostramos la UI
setTimeout(releaseUI, 2000);

// ✅ si pasa algo raro en runtime, no quedamos pegados
window.addEventListener("error", releaseUI);
window.addEventListener("unhandledrejection", releaseUI);

/* =========================
   Config / Collections
========================= */
const COL = APP_CONFIG.collections;

const COL_PLANS = COL.subscriptionPlans;
const COL_ASSOC = COL.associates;
const COL_PLAYERS = COL.players;
const COL_MEMBERSHIPS = COL.memberships;
const COL_INSTALLMENTS = COL.membershipInstallments;
const COL_SUBMISSIONS = COL.membershipPaymentSubmissions;

// Config doc
const CFG_DOC = doc(db, "club_config", "public_registration");

/* =========================
   DOM
========================= */
const $ = {
  alertBox: document.getElementById("alertBox"),
  form: document.getElementById("registerForm"),
  submitBtn: document.getElementById("submitBtn"),
  logoutBtn: document.getElementById("logoutBtn"),

  firstName: document.getElementById("firstName"),
  lastName: document.getElementById("lastName"),
  birthDate: document.getElementById("birthDate"),
  idType: document.getElementById("idType"),
  idNumber: document.getElementById("idNumber"),
  email: document.getElementById("email"),

  phone: document.getElementById("phone"),
  payerName: document.getElementById("payerName"),
  payMethod: document.getElementById("payMethod"),

  province: document.getElementById("province"),
  canton: document.getElementById("canton"),

  planId: document.getElementById("planId"),
  planMeta: document.getElementById("planMeta"),
  proofFile: document.getElementById("proofFile"),

  declarationWrap: document.getElementById("declarationWrap"),
  infoDeclaration: document.getElementById("infoDeclaration"),
  infoDeclarationLabel: document.getElementById("infoDeclarationLabel"),

  termsWrap: document.getElementById("termsWrap"),
  termsAccepted: document.getElementById("termsAccepted"),
  termsLink: document.getElementById("termsLink"),
};

let PUBLIC_CFG = { enableMembershipPayment: true, requireTerms: false, requireInfoDeclaration: false };

function isVisible(el) {
  if (!el) return false;
  // visible en DOM + no oculto por d-none + no hidden + no display none
  if (el.classList?.contains("d-none")) return false;
  if (el.hidden) return false;
  return !!(el.offsetParent || el.getClientRects().length);
}

function hasValue(el) {
  if (!el) return false;
  if (el.type === "checkbox") return !!el.checked;
  if (el.type === "file") return (el.files?.length || 0) > 0;
  return String(el.value || "").trim().length > 0;
}

function setSubmitEnabled(enabled) {
  if (!$.submitBtn) return;
  $.submitBtn.disabled = !enabled;
  $.submitBtn.classList.toggle("disabled", !enabled); // opcional (Bootstrap style)
}

function computeFormComplete() {
  // básicos siempre
  const requiredEls = [
    $.firstName,
    $.lastName,
    $.birthDate,
    $.idType,
    $.idNumber,
    $.email,
    $.province,
    $.canton,
  ];

  // por config: consentimientos
  if (PUBLIC_CFG.requireInfoDeclaration) requiredEls.push($.infoDeclaration);
  if (PUBLIC_CFG.requireTerms) requiredEls.push($.termsAccepted);

  // por config: pago
  if (PUBLIC_CFG.enableMembershipPayment) {
    requiredEls.push($.planId, $.proofFile);
  }

  // Solo consideramos los elementos visibles
  return requiredEls
    .filter((el) => isVisible(el))
    .every((el) => hasValue(el));
}

function updateSubmitState() {
  const ok = computeFormComplete();
  setSubmitEnabled(ok);
}

/* =========================
   Helpers
========================= */
function showAlert(msg, type = "danger") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.textContent = msg;
  $.alertBox.classList.remove("d-none");
}

function hideAlert() {
  $.alertBox?.classList.add("d-none");
}

function setLoading(isLoading) {
  document.body.classList.toggle("loading", isLoading);
  if ($.submitBtn) $.submitBtn.disabled = isLoading;
  if ($.logoutBtn) $.logoutBtn.disabled = isLoading;
}

function norm(s) {
  return (s || "").toString().trim();
}

function cleanIdNum(s) {
  return norm(s).replace(/\s+/g, "");
}

function normLower(s) {
  return norm(s).toLowerCase();
}

function fmtMoney(n, cur = "CRC") {
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: cur }).format(v);
}

function makePayCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function safeSeasonFromToday() {
  return String(new Date().getFullYear());
}

function setRequired(el, required) {
  if (!el) return;
  if (required) el.setAttribute("required", "required");
  else el.removeAttribute("required");
}

function setEnabled(el, enabled) {
  if (!el) return;
  el.disabled = !enabled;
}

/* =========================
   Debug helpers
========================= */
function firebaseErrMsg(e) {
  const code = e?.code ? String(e.code) : "";
  if (code.includes("permission-denied")) return "Permisos insuficientes (rules).";
  if (code.includes("unauthenticated")) return "No hay sesión (login) activa.";
  if (code.includes("failed-precondition")) return "Falta un índice o precondición en Firestore.";
  return e?.message ? e.message : "Error desconocido.";
}

async function step(name, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${name}`);
    return r;
  } catch (e) {
    console.error(`❌ ${name}`, e);
    throw new Error(`${name}: ${firebaseErrMsg(e)}`);
  }
}

/* =========================
   Role / Access helpers (safe)
========================= */
async function hasActiveRole(uid) {
  try {
    const roleRef = doc(db, "user_roles", uid);
    const snap = await getDoc(roleRef);
    if (!snap.exists()) return false;
    const r = snap.data();
    return r?.active === true;
  } catch (e) {
    // si rules bloquean, NO dejamos negro; solo asumimos "no tiene rol"
    console.warn("hasActiveRole failed:", e);
    return false;
  }
}

// crea user_roles/{uid} SOLO si no existe (viewer por defecto)
export async function ensureRole(uid) {
  const ref = doc(db, "user_roles", uid);
  const snap = await getDoc(ref);

  // si ya existe, no tocarlo (puede ser admin)
  if (snap.exists()) return snap.data();

  const payload = {
    role: "viewer",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload);
  return payload;
}

/* =========================
   Ensure users/{uid} exists (new Google users)
========================= */
async function ensureUserDoc(uid, email) {
  const uref = doc(db, "users", uid);
  const usnap = await getDoc(uref).catch(() => null);

  const payload = {
    email: email || null,
    updatedAt: serverTimestamp(),
  };
  if (!usnap?.exists?.()) payload.createdAt = serverTimestamp();

  // merge para no pisar cosas
  await setDoc(uref, payload, { merge: true });
}

/* =========================
   Costa Rica: Provincia/Cantón
========================= */
const CR = {
  "San José": [
    "San José",
    "Escazú",
    "Desamparados",
    "Puriscal",
    "Tarrazú",
    "Aserrí",
    "Mora",
    "Goicoechea",
    "Santa Ana",
    "Alajuelita",
    "Vásquez de Coronado",
    "Acosta",
    "Tibás",
    "Moravia",
    "Montes de Oca",
    "Turrubares",
    "Dota",
    "Curridabat",
    "Pérez Zeledón",
    "León Cortés Castro"
  ],

  "Alajuela": [
    "Alajuela",
    "San Ramón",
    "Grecia",
    "San Mateo",
    "Atenas",
    "Naranjo",
    "Palmares",
    "Poás",
    "Orotina",
    "San Carlos",
    "Zarcero",
    "Sarchí",
    "Upala",
    "Los Chiles",
    "Guatuso",
    "Río Cuarto"
  ],

  "Cartago": [
    "Cartago",
    "Paraíso",
    "La Unión",
    "Jiménez",
    "Turrialba",
    "Alvarado",
    "Oreamuno",
    "El Guarco"
  ],

  "Heredia": [
    "Heredia",
    "Barva",
    "Santo Domingo",
    "Santa Bárbara",
    "San Rafael",
    "San Isidro",
    "Belén",
    "Flores",
    "San Pablo",
    "Sarapiquí"
  ],

  "Guanacaste": [
    "Liberia",
    "Nicoya",
    "Santa Cruz",
    "Bagaces",
    "Carrillo",
    "Cañas",
    "Abangares",
    "Tilarán",
    "Nandayure",
    "La Cruz",
    "Hojancha"
  ],

  "Puntarenas": [
    "Puntarenas",
    "Esparza",
    "Buenos Aires",
    "Montes de Oro",
    "Osa",
    "Quepos",
    "Golfito",
    "Coto Brus",
    "Parrita",
    "Corredores",
    "Garabito"
  ],

  "Limón": [
    "Limón",
    "Pococí",
    "Siquirres",
    "Talamanca",
    "Matina",
    "Guácimo"
  ]
};

function fillProvinceCanton() {
  const provinces = Object.keys(CR);

  if ($.province) {
    $.province.innerHTML =
      `<option value="">Seleccionar…</option>` +
      provinces.map((p) => `<option value="${p}">${p}</option>`).join("");
  }

  if ($.canton) $.canton.innerHTML = `<option value="">Seleccionar…</option>`;

  $.province?.addEventListener("change", () => {
    const p = $.province.value;
    const cantons = CR[p] || [];
    if ($.canton) {
      $.canton.innerHTML =
        `<option value="">Seleccionar…</option>` +
        cantons.map((c) => `<option value="${c}">${c}</option>`).join("");
    }
  });
}

/* =========================
   Header: sin tabs aquí (evita flash)
========================= */
loadHeader("home", { enabledTabs: {} });

/* =========================
   Auth UI
========================= */

$.logoutBtn?.addEventListener("click", async () => {
  try {
    showLoader("Cargando…");
    await logout();
  } finally {
    hideLoader();
  }
});

// IMPORTANT: no más “pantalla negra” por errores aquí
onAuthStateChanged(auth, async (user) => {
  showLoader("Cargando…");
  try {
    // si ya tiene rol activo -> dashboard
    if (user?.uid && (await hasActiveRole(user.uid))) {
      window.location.replace("../dashboard.html");
      return;
    }

    // prefill email
    if (user?.email && $.email) {
      $.email.value = user.email;
      $.email.readOnly = true;
      $.logoutBtn?.classList.remove("d-none");
    } else {
      if ($.email) $.email.readOnly = false;
      $.logoutBtn?.classList.add("d-none");
    }
  } catch (e) {
    console.warn("onAuthStateChanged handler failed:", e);
    // seguimos igual, solo evitamos crash
  } finally {
    hideLoader();
    releaseUI(); 
  }
});

/* =========================
   Config (booleans + textos)
========================= */
async function loadPublicRegConfig() {
  const snap = await getDoc(CFG_DOC);
  const cfg = snap.exists() ? snap.data() : {};

  const requireInfoDeclaration = cfg.requireInfoDeclaration === true;
  const infoDeclarationText = cfg.infoDeclarationText || null;

  const enableMembershipPayment = cfg.enableMembershipPayment !== false;

  const requireTerms = cfg.requireTerms === true;
  const termsUrl = cfg.termsUrl || null;

  //Pago: si está deshabilitado, ocultar + desactivar + quitar required
  const paymentSection = document.getElementById("paymentSection");
  if (!enableMembershipPayment) {
    paymentSection?.classList.add("d-none");

    // deshabilitar inputs para que HTML validation no moleste
    setEnabled($.planId, false);
    setEnabled($.proofFile, false);

    // quitar required por si lo tienen en el HTML
    setRequired($.planId, false);
    setRequired($.proofFile, false);

    // opcional: limpiar valores
    if ($.planId) $.planId.value = "";
    if ($.proofFile) $.proofFile.value = "";
    if ($.planMeta) $.planMeta.textContent = "";
  } else {
    paymentSection?.classList.remove("d-none");
    setEnabled($.planId, true);
    setEnabled($.proofFile, true);
    // si querés, volverlos required:
    setRequired($.planId, true);
    setRequired($.proofFile, true);
  }

  //Declaración: si no aplica, deshabilitar + quitar required
  if (!requireInfoDeclaration) {
    setEnabled($.infoDeclaration, false);
    setRequired($.infoDeclaration, false);
  } else {
    setEnabled($.infoDeclaration, true);
    setRequired($.infoDeclaration, true);
  }

  //Términos: si no aplica, deshabilitar + quitar required
  if (!requireTerms) {
    setEnabled($.termsAccepted, false);
    setRequired($.termsAccepted, false);
  } else {
    setEnabled($.termsAccepted, true);
    setRequired($.termsAccepted, true);
  }

  if ($.declarationWrap && $.infoDeclaration && $.infoDeclarationLabel) {
    if (requireInfoDeclaration) {
      $.declarationWrap.classList.remove("d-none");
      if (infoDeclarationText) $.infoDeclarationLabel.textContent = infoDeclarationText;
    } else {
      $.declarationWrap.classList.add("d-none");
      $.infoDeclaration.checked = false;
    }
  }

  if ($.termsWrap && $.termsAccepted && $.termsLink) {
    if (requireTerms) {
      $.termsWrap.classList.remove("d-none");
      $.termsLink.href = termsUrl || "#";
      $.termsLink.style.display = termsUrl ? "inline" : "none";
    } else {
      $.termsWrap.classList.add("d-none");
      $.termsAccepted.checked = false;
    }
  }

  PUBLIC_CFG = { enableMembershipPayment, requireTerms, requireInfoDeclaration };

   updateSubmitState();
  return { requireInfoDeclaration, requireTerms, termsUrl, enableMembershipPayment};
}

/* =========================
   Plans
========================= */
let plansById = new Map();

function planAmount(plan) {
  const a = plan?.totalAmount ?? plan?.amount ?? null;
  return a === null || a === undefined ? null : Number(a);
}

async function loadPlans() {
  const qy = query(collection(db, COL_PLANS));
  const snap = await getDocs(qy);

  const plans = [];
  snap.forEach((d) => plans.push({ id: d.id, ...d.data() }));

  const activePlans = plans.filter((p) => p.isActive !== false);

  plansById = new Map(activePlans.map((p) => [p.id, p]));

  if ($.planId) {
    $.planId.innerHTML =
      `<option value="">Seleccionar…</option>` +
      activePlans
        .map((p) => {
          const amt = planAmount(p);
          const label = `${p.name || "Plan"} — ${fmtMoney(amt, p.currency || "CRC")}`;
          return `<option value="${p.id}">${label}</option>`;
        })
        .join("");
  }

  if ($.planMeta) $.planMeta.textContent = "";
}

$.planId?.addEventListener("change", () => {
  const p = plansById.get($.planId.value);
  if (!p) {
    if ($.planMeta) $.planMeta.textContent = "";
    return;
  }
  const parts = [];
  if (p.description) parts.push(p.description);
  const amt = planAmount(p);
  if (amt != null) parts.push(`Monto: ${fmtMoney(amt, p.currency || "CRC")}`);
  if ($.planMeta) $.planMeta.textContent = parts.join(" • ");
});

/* =========================
   Identity linking (Associate <-> Player)
========================= */
async function upsertAssociate({
  uid,
  email,
  firstName,
  lastName,
  birthDate,
  idType,
  idNumber,
  phone,
  residence,
  consents,
}) {
  const fullName = `${firstName} ${lastName}`.trim();

  let assocId = null;

  if (uid) {
    const qUid = query(collection(db, COL_ASSOC), where("uid", "==", uid), limit(1));
    const sUid = await getDocs(qUid);
    sUid.forEach((d) => (assocId = d.id));
  }

  if (!assocId && email) {
    const qEmail = query(collection(db, COL_ASSOC), where("email", "==", email), limit(1));
    const sEmail = await getDocs(qEmail);
    sEmail.forEach((d) => (assocId = d.id));
  }

  const payload = {
    active: true,
    email: email || null,
    fullName: fullName || null,
    phone: phone || null,
    type: idType || "other",
    idNumber: idNumber || null,

    uid: uid || null,
    playerId: null,

    profile: {
      firstName: firstName || null,
      lastName: lastName || null,
      birthDate: birthDate || null,
      idType: idType || null,
      idNumber: idNumber || null,
      residence: residence || null,
    },

    consents: consents || null,

    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  if (!assocId) {
    const ref = await addDoc(collection(db, COL_ASSOC), payload);
    assocId = ref.id;
  } else {
    await setDoc(doc(db, COL_ASSOC, assocId), payload, { merge: true });
  }

  const associateSnapshot = {
    id: assocId,
    fullName,
    email,
    phone: phone || null,
  };

  return { assocId, associateSnapshot };
}

async function findPlayerToLink({ uid, email, firstName, lastName, birthDate }) {
  if (uid) {
    const q1 = query(collection(db, COL_PLAYERS), where("uid", "==", uid), limit(1));
    const s1 = await getDocs(q1);
    let found = null;
    s1.forEach((d) => (found = { id: d.id, ...d.data() }));
    if (found) return found;
  }

  if (email) {
    const q2 = query(collection(db, COL_PLAYERS), where("email", "==", email), limit(1));
    const s2 = await getDocs(q2);
    let found = null;
    s2.forEach((d) => (found = { id: d.id, ...d.data() }));
    if (found) return found;
  }

  if (firstName && lastName && birthDate) {
    const qb = query(collection(db, COL_PLAYERS), where("birthday", "==", birthDate), limit(25));
    const sb = await getDocs(qb);

    const fn = firstName.trim().toLowerCase();
    const ln = lastName.trim().toLowerCase();

    const matches = [];
    sb.forEach((d) => {
      const p = d.data() || {};
      const pfn = (p.firstName || "").toString().trim().toLowerCase();
      const pln = (p.lastName || "").toString().trim().toLowerCase();
      if (pfn === fn && pln === ln) matches.push({ id: d.id, ...p });
    });

    if (matches.length === 1) return matches[0];
  }

  return null;
}

async function ensureLinkedPlayer({ assocId, uid, email, firstName, lastName, birthDate }) {
  let player = await findPlayerToLink({ uid, email, firstName, lastName, birthDate });

  const payload = {
    active: true,
    firstName: firstName || null,
    lastName: lastName || null,
    birthday: birthDate || null,

    associateId: assocId,
    uid: uid || null,
    email: email || null,

    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  if (!player) {
    const ref = await addDoc(collection(db, COL_PLAYERS), payload);
    return { playerId: ref.id, created: true };
  }

  await setDoc(doc(db, COL_PLAYERS, player.id), payload, { merge: true });
  return { playerId: player.id, created: false };
}

/* =========================
   Membership builders
========================= */
function buildPlanSnapshot(plan) {
  return {
    id: plan.id,
    name: plan.name || null,
    currency: plan.currency || "CRC",
    totalAmount: planAmount(plan),
    durationMonths: plan.durationMonths ?? 12,
    requiresValidation: plan.requiresValidation !== false,
    startPolicy: plan.startPolicy || "jan",
    allowPartial: !!plan.allowPartial,
    allowCustomAmount: !!plan.allowCustomAmount,
    benefits: plan.benefits || [],
    tags: plan.tags || [],
  };
}

async function createMembership({ assocId, associateSnapshot, plan, season, consents }) {
  const payCode = makePayCode(7);
  const planSnap = buildPlanSnapshot(plan);

  const payload = {
    associateId: assocId,
    associateSnapshot,

    planId: plan.id,
    planSnapshot: planSnap,

    currency: planSnap.currency,
    totalAmount: planSnap.totalAmount,
    season: season,

    status: "pending",

    payCode,
    payLinkEnabled: false,
    payLinkDisabledReason: "Pendiente de validación.",

    installmentsTotal: 0,
    installmentsPending: 0,
    installmentsSettled: 0,
    nextUnpaidDueDate: null,
    nextUnpaidN: null,

    consents: consents || null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, COL_MEMBERSHIPS), payload);
  return { membershipId: ref.id, payCode };
}

async function maybeCreateInstallments({ membershipId, plan, season }) {
  const count = Number(plan.installmentsCount || 0);
  if (!count || count < 2) return { installmentIds: [] };

  const total = planAmount(plan) || 0;
  const amount = Math.round((total / count) * 100) / 100;

  const dueDay = Number(plan.dueDay || 10);
  const startMonth = plan.startPolicy === "jan" ? 1 : Number(plan.startMonth || 1);

  const nowYear = Number(season);
  const ids = [];

  for (let i = 0; i < count; i++) {
    const m = startMonth + i;
    const mm = ((m - 1) % 12) + 1;
    const yy = nowYear + Math.floor((m - 1) / 12);

    const dueDate = `${yy}-${String(mm).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
    const dueMonthDay = dueDate.slice(5);

    const instRef = await addDoc(collection(db, COL_INSTALLMENTS), {
      amount,
      dueDate,
      dueMonthDay,
      membershipId,
      n: i + 1,
      planId: plan.id,
      season,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    ids.push(instRef.id);
  }

  await updateDoc(doc(db, COL_MEMBERSHIPS, membershipId), {
    installmentsTotal: count,
    installmentsPending: count,
    installmentsSettled: 0,
    nextUnpaidDueDate: ids.length
      ? `${nowYear}-${String(startMonth).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`
      : null,
    nextUnpaidN: ids.length ? 1 : null,
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  return { installmentIds: ids };
}

/* =========================
   Upload proof
========================= */
async function uploadProofFile({ uid, assocId, file }) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const safeExt = ext ? `.${ext}` : "";
  const path = `membership_submissions/${assocId || uid || "anonymous"}/${Date.now()}_proof${safeExt}`;

  const r = sRef(storage, path);
  const task = uploadBytesResumable(r, file, {
    contentType: file.type || "application/octet-stream",
  });

  await new Promise((resolve, reject) => {
    task.on("state_changed", null, reject, resolve);
  });

  const url = await getDownloadURL(task.snapshot.ref);
  return { filePath: path, fileUrl: url, fileType: file.type || null };
}

/* =========================
   Prefill from session
========================= */
function applyPrefillFromSession() {
  try {
    const raw = sessionStorage.getItem("prefill_register");
    if (!raw) return;
    const p = JSON.parse(raw);

    if ($.email && p.email) {
      $.email.value = p.email;
      $.email.readOnly = true;
    }

    if ($.firstName && $.lastName && p.fullName) {
      const parts = String(p.fullName).trim().split(/\s+/);
      if (!$.firstName.value) $.firstName.value = parts.shift() || "";
      if (!$.lastName.value) $.lastName.value = parts.join(" ");
    }

    if ($.phone && p.phone && !$.phone.value) {
      $.phone.value = p.phone;
    }
  } catch (e) {
    console.warn("prefill_register invalid", e);
  }
}

applyPrefillFromSession();

/* =========================
   Init
========================= */
async function init() {
  showLoader("Cargando…");
  try {
    fillProvinceCanton();
    await loadPlans();

    const cfg = await loadPublicRegConfig(); // 👈 AQUÍ

    if (!cfg.enableMembershipPayment) {
      const sec = document.getElementById("paymentSection");
      if (sec) sec.classList.add("d-none");
      updateSubmitState();
    }

  } catch (e) {
    console.warn(e);
    showAlert("No se pudo cargar la configuración. Refresca la página.");
  } finally {
    hideLoader();
    releaseUI();
    updateSubmitState();
    document.body.classList.remove("loading");
  }
}

init();

/* =========================
   Submit
========================= */
$.form?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  hideAlert();

  const user = auth.currentUser;

  if (!user?.uid) {
    showAlert("Primero ingresa con Google para completar el registro.");
    return;
  }

  const uid = user.uid;

  // Data
  const firstName = norm($.firstName?.value);
  const lastName = norm($.lastName?.value);
  const birthDate = norm($.birthDate?.value);

  const idType = normLower($.idType?.value);
  const idNumber = cleanIdNum($.idNumber?.value);

  const email = user.email
    ? String(user.email).toLowerCase()
    : normLower($.email?.value);

  const phone = norm($.phone?.value);

  const residence = {
    province: norm($.province?.value),
    canton: norm($.canton?.value),
  };

  const planId = norm($.planId?.value);
  const plan = plansById.get(planId);

  const file = $.proofFile?.files?.[0] || null;

  const payerName = norm($.payerName?.value) || `${firstName} ${lastName}`.trim();
  const method = normLower($.payMethod?.value) || "sinpe";

  // enforce config
  let cfg;
  try {
    cfg = await loadPublicRegConfig();
  } catch (e) {
    console.warn(e);
    showAlert("No se pudo cargar la configuración. Refresca la página.");
    return;
  }

  // Validate basics
  if (!firstName || !lastName || !birthDate || !idType || !idNumber || !email) {
    showAlert("Completa todos los campos obligatorios.");
    return;
  }
  if (!residence.province || !residence.canton) {
    showAlert("Selecciona provincia y cantón.");
    return;
  }

  //Validate if payments is enabled or not
  const paymentsEnabled = !!cfg.enableMembershipPayment;
  if (paymentsEnabled) {
    if (!planId || !plan) {
      showAlert("Selecciona un plan de pago válido.");
      return;
    }
    if (!file) {
      showAlert("Adjunta el comprobante de pago.");
      return;
    }
  }

  if (cfg.requireInfoDeclaration && !$.infoDeclaration?.checked) {
    showAlert("Debes aceptar la declaración de veracidad/uso de información.");
    return;
  }
  if (cfg.requireTerms && !$.termsAccepted?.checked) {
    showAlert("Debes aceptar los términos y condiciones.");
    return;
  }

  const consents = {
    requireInfoDeclaration: !!cfg.requireInfoDeclaration,
    infoDeclarationAccepted: cfg.requireInfoDeclaration ? true : null,
    requireTerms: !!cfg.requireTerms,
    termsAccepted: cfg.requireTerms ? true : null,
    termsUrl: cfg.termsUrl || null,
    acceptedAt: serverTimestamp(),
  };

  showLoader("Cargando…");
  await step("Ensure access role (user_roles/{uid})", () => ensureRole(uid));
  try {
    if (!uid) throw new Error("No hay uid (login incompleto).");

    // usuarios nuevos: garantizamos users/{uid} para que nada reviente después
    await step("Ensure users/{uid}", () => ensureUserDoc(uid, email));

    const { assocId, associateSnapshot } = await step("Upsert associate", () =>
      upsertAssociate({
        uid,
        email,
        firstName,
        lastName,
        birthDate,
        idType,
        idNumber,
        phone,
        residence,
        consents,
      })
    );

    const { playerId } = await step("Link/create club_player", () =>
      ensureLinkedPlayer({ assocId, uid, email, firstName, lastName, birthDate })
    );

    await step("Update associate.playerId", () =>
      setDoc(
        doc(db, COL_ASSOC, assocId),
        { playerId: playerId || null, updatedAt: serverTimestamp() },
        { merge: true }
      )
    );

    const paymentsEnabled = !!cfg.enableMembershipPayment;
    if (paymentsEnabled) {

        const proof = await step("Upload proof (Storage)", () =>
          uploadProofFile({ uid, assocId, file })
        );

        const season = plan.season || safeSeasonFromToday();

        const { membershipId } = await step("Create membership", () =>
          createMembership({
            assocId,
            associateSnapshot,
            plan: { id: planId, ...plan },
            season,
            consents,
          })
        );

        await step("Maybe create installments", () =>
          maybeCreateInstallments({ membershipId, plan: { id: planId, ...plan }, season })
        );

        await step("Create payment submission", () =>
          addDoc(collection(db, COL_SUBMISSIONS), {
            adminNote: null,
            note: null,

            amountReported: planAmount(plan),
            currency: plan.currency || "CRC",

            email,
            payerName: payerName || null,
            phone: phone || null,
            method: method || "sinpe",

            filePath: proof.filePath,
            fileType: proof.fileType,
            fileUrl: proof.fileUrl,

            installmentId: null,
            selectedInstallmentIds: [],

            membershipId,
            planId,
            season,

            status: "pending",
            userId: uid,

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
    }

    await step("Mark onboarding complete (users/{uid})", async () => {
      const uref = doc(db, "users", uid);
      const payload = {
        email: email || auth.currentUser?.email || null,

        onboardingComplete: true,

        associateId: assocId,
        playerId: playerId || null,

        firstName: firstName || null,
        lastName: lastName || null,
        birthDate: birthDate || null,
        phone: phone || null,

        updatedAt: serverTimestamp(),
      };
      return setDoc(uref, payload, { merge: true });
    });

    sessionStorage.removeItem("prefill_register");

    // desde /public/
    window.location.replace("../dashboard.html");
    return;
  } catch (e) {
    console.warn(e);
    showAlert(String(e.message || e), "danger");
  } finally {
    hideLoader();
  }
});

function wireUpFormCompleteness() {
  const els = [
    $.firstName, $.lastName, $.birthDate, $.idType, $.idNumber, $.email,
    $.province, $.canton, $.planId, $.proofFile,
    $.infoDeclaration, $.termsAccepted,
  ].filter(Boolean);

  // input para texto, change para selects/checkbox/file
  els.forEach((el) => {
    el.addEventListener("input", updateSubmitState);
    el.addEventListener("change", updateSubmitState);
  });

  // cuando cambia provincia, se repuebla cantón → recalculamos
  $.province?.addEventListener("change", () => setTimeout(updateSubmitState, 0));

  // estado inicial
  updateSubmitState();
}

wireUpFormCompleteness();