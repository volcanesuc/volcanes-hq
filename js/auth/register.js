// /js/auth/register.js
import { db, auth, storage } from "./firebase.js";
import { logout } from "./auth.js";
import { loadHeader } from "../components/header.js";
import { APP_CONFIG } from "../config/config.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
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

releaseUI();

const url = new URL(location.href);
const created = url.searchParams.get("created");

if (created === "0" || created === "1") {
  releaseUI();
}

setTimeout(releaseUI, 2000);
window.addEventListener("error", releaseUI);
window.addEventListener("unhandledrejection", releaseUI);

/* =========================
   Config / Collections
========================= */
const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_PLANS = COL.subscriptionPlans;
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

  emergencyContactName: document.getElementById("emergencyContactName"),
  emergencyContactRelation: document.getElementById("emergencyContactRelation"),
  emergencyContactPhone: document.getElementById("emergencyContactPhone"),

  payerName: document.getElementById("payerName"),
  payMethod: document.getElementById("payMethod"),

  province: document.getElementById("province"),
  canton: document.getElementById("canton"),

  paymentSection: document.getElementById("paymentSection"),

  planId: document.getElementById("planId"),
  planMeta: document.getElementById("planMeta"),
  proofFile: document.getElementById("proofFile"),

  declarationWrap: document.getElementById("declarationWrap"),
  infoDeclaration: document.getElementById("infoDeclaration"),
  infoDeclarationLabel: document.getElementById("infoDeclarationLabel"),

  termsWrap: document.getElementById("termsWrap"),
  termsAccepted: document.getElementById("termsAccepted"),
  termsLink: document.getElementById("termsLink"),

  wantsPlayer: document.getElementById("wantsPlayer"),
  wantsMembershipPayment: document.getElementById("wantsMembershipPayment"),
};

let PUBLIC_CFG = {
  enableMembershipPayment: true,
  requireTerms: false,
  requireInfoDeclaration: false,
};

function isVisible(el) {
  if (!el) return false;
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
  $.submitBtn.classList.toggle("disabled", !enabled);
  $.submitBtn.classList.remove("btn-primary", "btn-success", "btn-secondary");
  $.submitBtn.classList.add(enabled ? "btn-success" : "btn-secondary");
}

function computeFormComplete() {
  const requiredEls = [
    $.firstName,
    $.lastName,
    $.birthDate,
    $.idType,
    $.idNumber,
    $.email,
    $.phone,
    $.emergencyContactName,
    $.emergencyContactRelation,
    $.emergencyContactPhone,
    $.province,
    $.canton,
  ];

  if (PUBLIC_CFG.requireInfoDeclaration) requiredEls.push($.infoDeclaration);
  if (PUBLIC_CFG.requireTerms) requiredEls.push($.termsAccepted);

  if (shouldEnableMembershipPaymentUI()) {
    requiredEls.push($.planId, $.proofFile);
  }

  return requiredEls
    .filter((el) => isVisible(el))
    .every((el) => hasValue(el));
}

function updateSubmitState() {
  setSubmitEnabled(computeFormComplete());
}

/* =========================
   Helpers
========================= */
function showAlert(msg, type = "danger") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.innerHTML = String(msg || "").replace(/\n/g, "<br>");
  $.alertBox.classList.remove("d-none");
}

function hideAlert() {
  $.alertBox?.classList.add("d-none");
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
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
  }).format(v);
}

function ensureProofStatusBox() {
  let el = document.getElementById("proofUploadStatus");
  if (el) return el;

  el = document.createElement("div");
  el.id = "proofUploadStatus";
  el.className = "small mt-2 d-none";

  $.proofFile?.insertAdjacentElement("afterend", el);
  return el;
}

function setProofStatus(message, type = "muted", withSpinner = false) {
  const el = ensureProofStatusBox();
  if (!el) return;

  const cls =
    type === "danger"
      ? "text-danger"
      : type === "success"
      ? "text-success"
      : type === "warning"
      ? "text-warning"
      : "text-muted";

  el.className = `small mt-2 ${cls}`;

  el.innerHTML = withSpinner
    ? `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${message}</span>
    `
    : `<span>${message}</span>`;

  el.classList.remove("d-none");
}

function clearProofStatus() {
  const el = document.getElementById("proofUploadStatus");
  if (!el) return;
  el.innerHTML = "";
  el.classList.add("d-none");
}

function setSubmittingState(isSubmitting, label = "Enviar registro") {
  if (!$.submitBtn) return;

  $.submitBtn.disabled = isSubmitting;

  if (isSubmitting) {
    $.submitBtn.dataset.originalHtml ||= $.submitBtn.innerHTML;
    $.submitBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ${label}
    `;
  } else if ($.submitBtn.dataset.originalHtml) {
    $.submitBtn.innerHTML = $.submitBtn.dataset.originalHtml;
  }

  if (!isSubmitting) {
    updateSubmitState();
  }
}

function makePayCode(len = 7) {
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

function toYmd(tsLike) {
  try {
    if (!tsLike) return null;
    if (typeof tsLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tsLike)) return tsLike;
    const d = typeof tsLike?.toDate === "function" ? tsLike.toDate() : new Date(tsLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function shouldEnableMembershipPaymentUI() {
  return PUBLIC_CFG.enableMembershipPayment && !!$.wantsMembershipPayment?.checked;
}

function refreshMembershipPaymentUI() {
  const enabled = shouldEnableMembershipPaymentUI();

  if (!enabled) {
    $.paymentSection?.classList.add("d-none");
    setEnabled($.planId, false);
    setEnabled($.proofFile, false);
    setRequired($.planId, false);
    setRequired($.proofFile, false);

    if ($.planId) $.planId.value = "";
    if ($.proofFile) $.proofFile.value = "";
    if ($.planMeta) $.planMeta.textContent = "";
    clearProofStatus();
  } else {
    $.paymentSection?.classList.remove("d-none");
    setEnabled($.planId, true);
    setEnabled($.proofFile, true);
    setRequired($.planId, true);
    setRequired($.proofFile, true);
  }

  updateSubmitState();
}

/* =========================
   Debug helpers
========================= */
function firebaseErrMsg(e) {
  const code = e?.code ? String(e.code) : "";
  const raw = e?.message ? String(e.message) : "Error desconocido.";

  if (code.includes("storage/unauthorized")) {
    return "No tienes permiso para subir el comprobante. Revisa las Storage Rules para membership_submissions/{uid}/...";
  }

  if (code.includes("storage/canceled")) {
    return "La subida del comprobante fue cancelada.";
  }

  if (code.includes("storage/retry-limit-exceeded")) {
    return "La subida tardó demasiado o falló por conexión. Intenta con una red más estable o un archivo más liviano.";
  }

  if (code.includes("storage/invalid-checksum")) {
    return "El archivo subido llegó corrupto. Intenta subirlo otra vez.";
  }

  if (code.includes("storage/quota-exceeded")) {
    return "El bucket de Storage superó su cuota.";
  }

  if (code.includes("storage/object-not-found")) {
    return "No se encontró el archivo en Storage.";
  }

  if (code.includes("permission-denied")) {
    return "Permisos insuficientes (rules).";
  }

  if (code.includes("unauthenticated")) {
    return "No hay sesión activa.";
  }

  if (code.includes("failed-precondition")) {
    return "Falta un índice o una precondición de Firestore.";
  }

  if (code.includes("invalid-argument")) {
    return "Hay un dato inválido en la solicitud.";
  }

  return raw;
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
   User / Access helpers
========================= */
async function getUserAccessState(uid) {
  try {
    const userRef = doc(db, COL_USERS, uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      return {
        onboardingComplete: false,
        isActive: false,
        role: "viewer",
        raw: null,
      };
    }

    const data = snap.data() || {};
    return {
      onboardingComplete: data.onboardingComplete === true,
      isActive: data.isActive === true,
      role: String(data.role || "viewer").trim().toLowerCase(),
      raw: data,
    };
  } catch (e) {
    console.warn("getUserAccessState failed:", e);
    return {
      onboardingComplete: false,
      isActive: false,
      role: "viewer",
      raw: null,
    };
  }
}

async function ensureUserDoc(uid, email, user = auth.currentUser) {
  const uref = doc(db, COL_USERS, uid);
  const usnap = await getDoc(uref).catch(() => null);

  if (!usnap?.exists?.()) {
    const createPayload = {
      uid,
      email: email || user?.email || null,
      displayName: user?.displayName || null,
      photoURL: user?.photoURL || null,

      onboardingComplete: false,
      isActive: false,
      role: "viewer",

      playerId: null,
      profile: {},
      consents: {},

      membershipIds: [],
      currentMembership: null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSignInAt: serverTimestamp(),
    };

    await setDoc(uref, createPayload, { merge: true });
    return;
  }

  const data = usnap.data() || {};
  const updatePayload = {
    updatedAt: serverTimestamp(),
    lastSignInAt: serverTimestamp(),
  };

  const nextEmail = email || user?.email || null;
  const nextDisplayName = user?.displayName || null;
  const nextPhotoURL = user?.photoURL || null;

  if ((data.email || null) !== nextEmail) updatePayload.email = nextEmail;
  if ((data.displayName || null) !== nextDisplayName) updatePayload.displayName = nextDisplayName;
  if ((data.photoURL || null) !== nextPhotoURL) updatePayload.photoURL = nextPhotoURL;

  if (data.onboardingComplete === undefined) updatePayload.onboardingComplete = false;
  if (data.profile === undefined || data.profile === null) updatePayload.profile = {};
  if (data.consents === undefined || data.consents === null) updatePayload.consents = {};
  if (!Array.isArray(data.membershipIds)) updatePayload.membershipIds = [];
  if (data.currentMembership === undefined) updatePayload.currentMembership = null;
  if (data.playerId === undefined) updatePayload.playerId = null;

  await setDoc(uref, updatePayload, { merge: true });
}

function buildUserProfile({
  firstName,
  lastName,
  birthDate,
  idType,
  idNumber,
  phone,
  residence,
  emergencyContact,
}) {
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    firstName: firstName || null,
    lastName: lastName || null,
    fullName: fullName || null,
    birthDate: birthDate || null,
    idType: idType || null,
    idNumber: idNumber || null,
    phone: phone || null,
    residence: residence || null,
    emergencyContact: emergencyContact || null,
  };
}

async function saveUserProfileAndConsents({
  uid,
  email,
  firstName,
  lastName,
  birthDate,
  idType,
  idNumber,
  phone,
  residence,
  emergencyContact,
  consents,
}) {
  const user = auth.currentUser;
  const fullName = `${firstName} ${lastName}`.trim();

  const payload = {
    uid,
    email: email || user?.email || null,
    displayName: user?.displayName || fullName || null,
    photoURL: user?.photoURL || null,

    profile: buildUserProfile({
      firstName,
      lastName,
      birthDate,
      idType,
      idNumber,
      phone,
      residence,
      emergencyContact,
    }),

    phone: phone || null,
    emergencyContact: emergencyContact || null,

    consents: {
      requireInfoDeclaration: !!consents.requireInfoDeclaration,
      infoDeclarationAccepted: consents.infoDeclarationAccepted === true,
      requireTerms: !!consents.requireTerms,
      termsAccepted: consents.termsAccepted === true,
      termsUrl: consents.termsUrl || null,
      acceptedAt: serverTimestamp(),
    },

    updatedAt: serverTimestamp(),
    lastSignInAt: serverTimestamp(),
  };

  await setDoc(doc(db, COL_USERS, uid), payload, { merge: true });

  return {
    uid,
    fullName,
    email,
    phone: phone || null,
    emergencyContact: emergencyContact || null,
  };
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
    "León Cortés Castro",
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
    "Río Cuarto",
  ],
  "Cartago": [
    "Cartago",
    "Paraíso",
    "La Unión",
    "Jiménez",
    "Turrialba",
    "Alvarado",
    "Oreamuno",
    "El Guarco",
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
    "Sarapiquí",
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
    "Hojancha",
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
    "Garabito",
  ],
  "Limón": [
    "Limón",
    "Pococí",
    "Siquirres",
    "Talamanca",
    "Matina",
    "Guácimo",
  ],
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
   Header
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

onAuthStateChanged(auth, async (user) => {
  showLoader("Cargando…");
  try {
    if (!user) {
      $.logoutBtn?.classList.add("d-none");
      if ($.email) $.email.readOnly = false;
      return;
    }

    const access = await getUserAccessState(user.uid);
    const data = access.raw || {};

    if (!access.onboardingComplete) {
      if (user.email && $.email) {
        $.email.value = user.email;
        $.email.readOnly = true;
        $.logoutBtn?.classList.remove("d-none");
      } else {
        if ($.email) $.email.readOnly = false;
        $.logoutBtn?.classList.add("d-none");
      }

      const profile = data.profile || {};
      const residence = profile.residence || {};
      const emergencyContact = profile.emergencyContact || data.emergencyContact || {};

      if ($.firstName && !$.firstName.value && profile.firstName) $.firstName.value = profile.firstName;
      if ($.lastName && !$.lastName.value && profile.lastName) $.lastName.value = profile.lastName;
      if ($.birthDate && !$.birthDate.value && profile.birthDate) $.birthDate.value = toYmd(profile.birthDate) || "";
      if ($.idType && !$.idType.value && profile.idType) $.idType.value = profile.idType;
      if ($.idNumber && !$.idNumber.value && profile.idNumber) $.idNumber.value = profile.idNumber;
      if ($.phone && !$.phone.value && (profile.phone || data.phone)) $.phone.value = profile.phone || data.phone;

      if ($.emergencyContactName && !$.emergencyContactName.value && emergencyContact.name) {
        $.emergencyContactName.value = emergencyContact.name;
      }
      if ($.emergencyContactRelation && !$.emergencyContactRelation.value && emergencyContact.relation) {
        $.emergencyContactRelation.value = emergencyContact.relation;
      }
      if ($.emergencyContactPhone && !$.emergencyContactPhone.value && emergencyContact.phone) {
        $.emergencyContactPhone.value = emergencyContact.phone;
      }

      if ($.province && !$.province.value && residence.province) {
        $.province.value = residence.province;
        $.province.dispatchEvent(new Event("change"));
      }
      if ($.canton && !$.canton.value && residence.canton) {
        if (!$.province.value && residence.province) {
          $.province.value = residence.province;
          $.province.dispatchEvent(new Event("change"));
        }
        $.canton.value = residence.canton;
      }

      updateSubmitState();
      return;
    }

    if (access.isActive) {
      window.location.replace("../dashboard.html");
      return;
    }

    window.location.replace("../index.html?pending=1");
  } catch (e) {
    console.warn("onAuthStateChanged handler failed:", e);
  } finally {
    hideLoader();
    releaseUI();
  }
});

/* =========================
   Config
========================= */
async function loadPublicRegConfig() {
  const snap = await getDoc(CFG_DOC);
  const cfg = snap.exists() ? snap.data() : {};

  const requireInfoDeclaration = cfg.requireInfoDeclaration === true;
  const infoDeclarationText = cfg.infoDeclarationText || null;
  const enableMembershipPayment = cfg.enableMembershipPayment !== false;
  const requireTerms = cfg.requireTerms === true;
  const termsUrl = cfg.termsUrl || null;

  PUBLIC_CFG = { enableMembershipPayment, requireTerms, requireInfoDeclaration };

  if (!enableMembershipPayment) {
    if ($.wantsMembershipPayment) {
      $.wantsMembershipPayment.checked = false;
      $.wantsMembershipPayment.disabled = true;
    }
  } else {
    if ($.wantsMembershipPayment) {
      $.wantsMembershipPayment.disabled = false;
    }
  }

  refreshMembershipPaymentUI();

  if (!requireInfoDeclaration) {
    setEnabled($.infoDeclaration, false);
    setRequired($.infoDeclaration, false);
  } else {
    setEnabled($.infoDeclaration, true);
    setRequired($.infoDeclaration, true);
  }

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

  updateSubmitState();

  return { requireInfoDeclaration, requireTerms, termsUrl, enableMembershipPayment };
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
  const snap = await getDocs(collection(db, COL_PLANS));
  const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
    updateSubmitState();
    return;
  }

  const parts = [];
  if (p.description) parts.push(p.description);

  const amt = planAmount(p);
  if (amt != null) parts.push(`Monto: ${fmtMoney(amt, p.currency || "CRC")}`);

  if ($.planMeta) $.planMeta.textContent = parts.join(" • ");
  updateSubmitState();
});

$.proofFile?.addEventListener("change", () => {
  const file = $.proofFile.files?.[0] || null;

  if (!file) {
    clearProofStatus();
    updateSubmitState();
    return;
  }

  try {
    validateProofFile(file);
    const kb = Math.round(file.size / 1024);
    setProofStatus(`Archivo listo: ${file.name} (${kb} KB)`, "muted", false);
  } catch (e) {
    setProofStatus(e.message || "Archivo inválido.", "danger", false);
  }

  updateSubmitState();
});

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

async function createMembership({ uid, userSnapshot, plan, season, consents }) {
  const payCode = makePayCode(7);
  const planSnap = buildPlanSnapshot(plan);

  const payload = {
    userId: uid,
    userSnapshot,

    planId: plan.id,
    planSnapshot: planSnap,

    currency: planSnap.currency,
    totalAmount: planSnap.totalAmount,
    season,

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

async function syncUserMembershipSummary({
  uid,
  membershipId,
  plan,
  season,
}) {
  const label = `${plan?.name || "Membresía"} ${season || ""}`.trim();

  await updateDoc(doc(db, COL_USERS, uid), {
    membershipIds: arrayUnion(membershipId),
    currentMembership: {
      membershipId,
      season: season || null,
      planId: plan?.id || null,
      label,
      status: "pending",
    },
    updatedAt: serverTimestamp(),
  });
}

/* =========================
   Upload proof
========================= */
function validateProofFile(file) {
  if (!file) {
    throw new Error("No seleccionaste ningún comprobante.");
  }

  const maxMb = 10;
  const maxBytes = maxMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new Error(`El comprobante pesa demasiado. Máximo permitido: ${maxMb} MB.`);
  }

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  if (file.type && !allowed.includes(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG, WEBP o PDF.");
  }
}

async function uploadProofFile({ uid, file }) {
  validateProofFile(file);

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const safeExt = ext ? `.${ext}` : "";
  const path = `membership_submissions/${uid || "anonymous"}/${Date.now()}_proof${safeExt}`;

  const r = sRef(storage, path);
  const task = uploadBytesResumable(r, file, {
    contentType: file.type || "application/octet-stream",
  });

  setProofStatus(`Subiendo comprobante: 0%`, "muted", true);

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const total = snapshot.totalBytes || 0;
        const transferred = snapshot.bytesTransferred || 0;
        const pct = total > 0 ? Math.round((transferred / total) * 100) : 0;
        setProofStatus(`Subiendo comprobante: ${pct}%`, "muted", true);
      },
      (error) => {
        console.error("uploadProofFile error:", error);
        setProofStatus(firebaseErrMsg(error), "danger", false);
        reject(error);
      },
      () => resolve()
    );
  });

  const fileUrl = await getDownloadURL(task.snapshot.ref);

  setProofStatus("Comprobante subido correctamente.", "success", false);

  return {
    filePath: path,
    fileUrl,
    fileType: file.type || null,
  };
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
  showLoader("Procesando registro…");
  setSubmittingState(true, "Enviando...");
  clearProofStatus();
  try {
    fillProvinceCanton();
    await loadPlans();
    await loadPublicRegConfig();
  } catch (e) {
    console.warn(e);
    showAlert("No se pudo cargar la configuración. Refresca la página.");
  } finally {
    setSubmittingState(false);
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

  const firstName = norm($.firstName?.value);
  const lastName = norm($.lastName?.value);
  const birthDate = norm($.birthDate?.value);

  const idType = normLower($.idType?.value);
  const idNumber = cleanIdNum($.idNumber?.value);

  const wantsPlayer = !!$.wantsPlayer?.checked;
  const wantsMembershipPayment = shouldEnableMembershipPaymentUI();

  const email = user.email
    ? String(user.email).toLowerCase()
    : normLower($.email?.value);

  const phone = norm($.phone?.value);

  const emergencyContact = {
    name: norm($.emergencyContactName?.value),
    relation: norm($.emergencyContactRelation?.value),
    phone: norm($.emergencyContactPhone?.value),
  };

  const residence = {
    province: norm($.province?.value),
    canton: norm($.canton?.value),
  };

  const planId = norm($.planId?.value);
  const plan = plansById.get(planId);

  const file = $.proofFile?.files?.[0] || null;

  const payerName = norm($.payerName?.value) || `${firstName} ${lastName}`.trim();
  const method = normLower($.payMethod?.value) || "sinpe";

  let cfg;
  try {
    cfg = await loadPublicRegConfig();
  } catch (e) {
    console.warn(e);
    showAlert("No se pudo cargar la configuración. Refresca la página.");
    return;
  }

  if (!firstName || !lastName || !birthDate || !idType || !idNumber || !email) {
    showAlert("Completa todos los campos obligatorios.");
    return;
  }

  if (!phone) {
    showAlert("Ingresa tu número de teléfono.");
    return;
  }

  if (!emergencyContact.name || !emergencyContact.relation || !emergencyContact.phone) {
    showAlert("Completa el contacto de emergencia: nombre, parentesco o relación, y teléfono.");
    return;
  }

  if (!residence.province || !residence.canton) {
    showAlert("Selecciona provincia y cantón.");
    return;
  }

  const paymentsEnabled = !!cfg.enableMembershipPayment && wantsMembershipPayment;
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

  try {
    await step("Ensure users/{uid}", () => ensureUserDoc(uid, email));

    const userSnapshot = await step("Save user profile + consents", () =>
      saveUserProfileAndConsents({
        uid,
        email,
        firstName,
        lastName,
        birthDate,
        idType,
        idNumber,
        phone,
        residence,
        emergencyContact,
        consents,
      })
    );

    if (paymentsEnabled) {
      const proof = await step("Upload proof (Storage)", () =>
        uploadProofFile({ uid, file })
      );

      const season = plan.season || safeSeasonFromToday();

      const { membershipId } = await step("Create membership", () =>
        createMembership({
          uid,
          userSnapshot,
          plan: { id: planId, ...plan },
          season,
          consents,
        })
      );

      await step("Maybe create installments", () =>
        maybeCreateInstallments({
          membershipId,
          plan: { id: planId, ...plan },
          season,
        })
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

          userId: uid,
          submittedByUid: uid,

          status: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );

      await step("Sync user membership summary", () =>
        syncUserMembershipSummary({
          uid,
          membershipId,
          plan: { id: planId, ...plan },
          season,
        })
      );
    }

    await step("Mark onboarding complete (users/{uid})", async () => {
      const uref = doc(db, COL_USERS, uid);

      const payload = {
        email: email || auth.currentUser?.email || null,
        displayName:
          auth.currentUser?.displayName || `${firstName} ${lastName}`.trim() || null,
        photoURL: auth.currentUser?.photoURL || null,
        phone: phone || null,
        emergencyContact,
        onboardingComplete: true,
        updatedAt: serverTimestamp(),
        lastSignInAt: serverTimestamp(),
        registration: {
          wantsPlayer: wantsPlayer === true,
          wantsMembershipPayment: wantsMembershipPayment === true,
        },
      };

      return setDoc(uref, payload, { merge: true });
    });

    sessionStorage.removeItem("prefill_register");
    window.location.replace("../index.html?pending=1");
  } catch (e) {
    console.warn(e);
    const msg = String(e?.message || e || "Ocurrió un error inesperado.");
    showAlert(msg, "danger");

    if (/upload proof|storage|comprobante/i.test(msg)) {
      setProofStatus(msg, "danger", false);
    }
  } finally {
    setSubmittingState(false);
    hideLoader();
  }
});

function wireUpFormCompleteness() {
  const els = [
    $.firstName,
    $.lastName,
    $.birthDate,
    $.idType,
    $.idNumber,
    $.email,
    $.phone,
    $.emergencyContactName,
    $.emergencyContactRelation,
    $.emergencyContactPhone,
    $.province,
    $.canton,
    $.planId,
    $.proofFile,
    $.infoDeclaration,
    $.termsAccepted,
    $.wantsPlayer,
    $.wantsMembershipPayment,
  ].filter(Boolean);

  els.forEach((el) => {
    el.addEventListener("input", updateSubmitState);
    el.addEventListener("change", updateSubmitState);
  });

  $.wantsMembershipPayment?.addEventListener("change", refreshMembershipPaymentUI);

  $.province?.addEventListener("change", () => setTimeout(updateSubmitState, 0));
  updateSubmitState();
}

wireUpFormCompleteness();