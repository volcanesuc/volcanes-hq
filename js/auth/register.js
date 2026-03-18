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

const CFG_DOC = doc(db, "club_config", "public_registration");

/* =========================
   DOM
========================= */
const $ = {
  alertBox: document.getElementById("alertBox"),
  form: document.getElementById("registerForm"),
  submitBtn: document.getElementById("submitBtn"),
  logoutBtn: document.getElementById("logoutBtn"),

  registerTypeRadios: document.querySelectorAll('input[name="registerType"]'),
  registerTypePickups: document.getElementById("registerTypePickups"),
  registerTypeVolcanes: document.getElementById("registerTypeVolcanes"),
  registerTypeAsovoca: document.getElementById("registerTypeAsovoca"),

  cardPickups: document.getElementById("card-pickups"),
  cardVolcanes: document.getElementById("card-volcanes"),
  cardAsovoca: document.getElementById("card-asovoca"),

  commonSection: document.getElementById("commonSection"),
  volcanesSection: document.getElementById("volcanesSection"),
  asovocaSection: document.getElementById("asovocaSection"),
  committeeFields: document.getElementById("committeeFields"),

  firstName: document.getElementById("firstName"),
  lastName: document.getElementById("lastName"),
  email: document.getElementById("email"),
  idType: document.getElementById("idType"),
  idNumber: document.getElementById("idNumber"),
  phone: document.getElementById("phone"),

  emergencyContactName: document.getElementById("emergencyContactName"),

  province: document.getElementById("province"),
  canton: document.getElementById("canton"),

  paymentSection: document.getElementById("paymentSection"),
  planId: document.getElementById("planId"),
  planMeta: document.getElementById("planMeta"),
  proofFile: document.getElementById("proofFile"),

  committeeInterest: document.getElementById("committeeInterest"),
  profession: document.getElementById("profession"),
  skills: document.getElementById("skills"),

  declarationWrap: document.getElementById("declarationWrap"),
  infoDeclaration: document.getElementById("infoDeclaration"),
  infoDeclarationLabel: document.getElementById("infoDeclarationLabel"),

  termsWrap: document.getElementById("termsWrap"),
  termsAccepted: document.getElementById("termsAccepted"),
  termsLink: document.getElementById("termsLink"),
};

let PUBLIC_CFG = {
  enableMembershipPayment: true,
  requireTerms: false,
  requireInfoDeclaration: false,
  termsUrl: null,
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

function getSelectedRegisterType() {
  const checked = [...$.registerTypeRadios].find((r) => r.checked);
  return checked?.value || "";
}

function isPickups() {
  return getSelectedRegisterType() === "pickups";
}

function isVolcanes() {
  return getSelectedRegisterType() === "volcanes";
}

function isAsovoca() {
  return getSelectedRegisterType() === "asovoca";
}

function requiresVolcanesExtraFields() {
  return isVolcanes() || isAsovoca();
}

function computeFormComplete() {
  const registerType = getSelectedRegisterType();
  if (!registerType) return false;

  const requiredEls = [
    $.firstName,
    $.lastName,
    $.phone,
    $.emergencyContactName,
  ];

  if (requiresVolcanesExtraFields()) {
    requiredEls.push($.email, $.idType, $.idNumber, $.province, $.canton);
  }

  if (isAsovoca() && PUBLIC_CFG.enableMembershipPayment) {
    requiredEls.push($.planId, $.proofFile);
  }

  if (PUBLIC_CFG.requireInfoDeclaration) requiredEls.push($.infoDeclaration);
  if (PUBLIC_CFG.requireTerms) requiredEls.push($.termsAccepted);

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

function normalizePlayerStatus(data) {
  const explicit = String(data?.playerStatus || "").trim().toLowerCase();
  if (explicit) return explicit;
  return data?.isPlayerActive === true ? "active" : "";
}

function normalizeAssociationStatus(data) {
  const explicit = String(data?.associationStatus || "").trim().toLowerCase();
  if (explicit === "associated_active") return "active";
  if (explicit === "associated_rejected") return "rejected";
  if (explicit === "payment_validation_pending") return "pending";
  if (explicit) return explicit;
  return "";
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
  return PUBLIC_CFG.enableMembershipPayment && isAsovoca();
}

function refreshRegisterTypeUI() {
  const type = getSelectedRegisterType();

  $.cardPickups?.classList.toggle("active", type === "pickups");
  $.cardVolcanes?.classList.toggle("active", type === "volcanes");
  $.cardAsovoca?.classList.toggle("active", type === "asovoca");

  if (!type) {
    $.commonSection?.classList.add("d-none");
    $.volcanesSection?.classList.add("d-none");
    $.asovocaSection?.classList.add("d-none");
    clearProofStatus();
    updateSubmitState();
    return;
  }

  $.commonSection?.classList.remove("d-none");
  $.volcanesSection?.classList.toggle("d-none", !requiresVolcanesExtraFields());
  $.asovocaSection?.classList.toggle("d-none", type !== "asovoca");

  refreshMembershipPaymentUI();
  refreshCommitteeUI();
  updateSubmitState();
}

function refreshCommitteeUI() {
  const show = isAsovoca() && !!$.committeeInterest?.checked;
  $.committeeFields?.classList.toggle("d-none", !show);
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
        isPlayerActive: false,
        role: "viewer",
        raw: null,
      };
    }

    const data = snap.data() || {};
    return {
      onboardingComplete: data.onboardingComplete === true,
      isPlayerActive: data.isPlayerActive === true,
      role: String(data.role || "viewer").trim().toLowerCase(),
      raw: data,
    };
  } catch (e) {
    console.warn("getUserAccessState failed:", e);
    return {
      onboardingComplete: false,
      isPlayerActive: false,
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
      isPlayerActive: false,
      canUsePickups: true,
      role: "viewer",

      playerStatus: null,
      associationStatus: null,

      playerId: null,
      memberId: null,
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
  if (data.memberId === undefined) updatePayload.memberId = null;
  if (data.playerStatus === undefined) updatePayload.playerStatus = null;
  if (data.associationStatus === undefined) updatePayload.associationStatus = null;
  if (data.isPlayerActive === undefined) updatePayload.isPlayerActive = false;
  if (data.canUsePickups !== true) updatePayload.canUsePickups = true;

  await setDoc(uref, updatePayload, { merge: true });
}

function buildUserProfile({
  firstName,
  lastName,
  idType,
  idNumber,
  phone,
  residence,
  emergencyContact,
  registerType,
  committeeInterest,
  profession,
  skills,
}) {
  return {
    firstName: firstName || null,
    lastName: lastName || null,
    idType: idType || null,
    idNumber: idNumber || null,
    phone: phone || null,
    residence: residence || null,
    emergencyContact: emergencyContact || null,
    registerType: registerType || null,
    committeeInterest: committeeInterest === true,
    profession: profession || null,
    skills: skills || null,
  };
}

async function saveUserProfileAndConsents({
  uid,
  email,
  firstName,
  lastName,
  idType,
  idNumber,
  phone,
  residence,
  emergencyContact,
  registerType,
  committeeInterest,
  profession,
  skills,
  consents,
}) {
  const user = auth.currentUser;

  const payload = {
    uid,
    email: email || user?.email || null,
    displayName: user?.displayName || null,
    photoURL: user?.photoURL || null,

    profile: buildUserProfile({
      firstName,
      lastName,
      idType,
      idNumber,
      phone,
      residence,
      emergencyContact,
      registerType,
      committeeInterest,
      profession,
      skills,
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
    "San José", "Escazú", "Desamparados", "Puriscal", "Tarrazú", "Aserrí", "Mora",
    "Goicoechea", "Santa Ana", "Alajuelita", "Vásquez de Coronado", "Acosta",
    "Tibás", "Moravia", "Montes de Oca", "Turrubares", "Dota", "Curridabat",
    "Pérez Zeledón", "León Cortés Castro",
  ],
  "Alajuela": [
    "Alajuela", "San Ramón", "Grecia", "San Mateo", "Atenas", "Naranjo",
    "Palmares", "Poás", "Orotina", "San Carlos", "Zarcero", "Sarchí", "Upala",
    "Los Chiles", "Guatuso", "Río Cuarto",
  ],
  "Cartago": [
    "Cartago", "Paraíso", "La Unión", "Jiménez", "Turrialba", "Alvarado",
    "Oreamuno", "El Guarco",
  ],
  "Heredia": [
    "Heredia", "Barva", "Santo Domingo", "Santa Bárbara", "San Rafael",
    "San Isidro", "Belén", "Flores", "San Pablo", "Sarapiquí",
  ],
  "Guanacaste": [
    "Liberia", "Nicoya", "Santa Cruz", "Bagaces", "Carrillo", "Cañas",
    "Abangares", "Tilarán", "Nandayure", "La Cruz", "Hojancha",
  ],
  "Puntarenas": [
    "Puntarenas", "Esparza", "Buenos Aires", "Montes de Oro", "Osa", "Quepos",
    "Golfito", "Coto Brus", "Parrita", "Corredores", "Garabito",
  ],
  "Limón": [
    "Limón", "Pococí", "Siquirres", "Talamanca", "Matina", "Guácimo",
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
      const registration = data.registration || {};
      const savedType = profile.registerType || registration.type || "";

      if ($.firstName && !$.firstName.value && profile.firstName) $.firstName.value = profile.firstName;
      if ($.lastName && !$.lastName.value && profile.lastName) $.lastName.value = profile.lastName;
      if ($.idType && !$.idType.value && profile.idType) $.idType.value = profile.idType;
      if ($.idNumber && !$.idNumber.value && profile.idNumber) $.idNumber.value = profile.idNumber;
      if ($.phone && !$.phone.value && (profile.phone || data.phone)) $.phone.value = profile.phone || data.phone;

      if ($.emergencyContactName && !$.emergencyContactName.value) {
        if (typeof emergencyContact === "string") {
          $.emergencyContactName.value = emergencyContact;
        } else if (emergencyContact.name) {
          $.emergencyContactName.value = emergencyContact.name;
        }
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

      if ($.committeeInterest && profile.committeeInterest === true) {
        $.committeeInterest.checked = true;
      }
      if ($.profession && profile.profession) $.profession.value = profile.profession;
      if ($.skills && profile.skills) $.skills.value = profile.skills;

      if (savedType === "pickups" && $.registerTypePickups) $.registerTypePickups.checked = true;
      if (savedType === "volcanes" && $.registerTypeVolcanes) $.registerTypeVolcanes.checked = true;
      if (savedType === "asovoca" && $.registerTypeAsovoca) $.registerTypeAsovoca.checked = true;

      refreshRegisterTypeUI();
      refreshCommitteeUI();
      updateSubmitState();
      return;
    }

    const playerStatus = normalizePlayerStatus(data);
    const associationStatus = normalizeAssociationStatus(data);
    const canUsePickupsFlag = data.canUsePickups === true;

    if (playerStatus === "active") {
      window.location.replace("/dashboard.html");
      return;
    }

    if (associationStatus === "pending" || associationStatus === "active") {
      window.location.replace("/member_status.html");
      return;
    }

    if (playerStatus === "pending") {
      window.location.replace("/index.html?state=platform_pending");
      return;
    }

    if (canUsePickupsFlag) {
      window.location.replace("/pickups_status.html");
      return;
    }

    window.location.replace("/index.html");
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

  PUBLIC_CFG = { enableMembershipPayment, requireTerms, requireInfoDeclaration, termsUrl };

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

  refreshMembershipPaymentUI();
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
async function createMembership({ uid, userSnapshot, plan, season, consents }) {
  const payCode = makePayCode(7);

  const payload = {
    userId: uid,
    userSnapshot,

    planId: plan.id,
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

function applyModeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  if (mode === "upgrade_player" && $.registerTypeVolcanes) {
    $.registerTypeVolcanes.checked = true;
  }

  if (mode === "upgrade_member" && $.registerTypeAsovoca) {
    $.registerTypeAsovoca.checked = true;
  }

  refreshRegisterTypeUI();
  refreshCommitteeUI();
  updateSubmitState();
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

    if ($.firstName && !$.firstName.value && p.firstName) {
      $.firstName.value = p.firstName;
    }

    if ($.lastName && !$.lastName.value && p.lastName) {
      $.lastName.value = p.lastName;
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
    applyModeFromQuery();
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
  const registerType = getSelectedRegisterType();

  if (!registerType) {
    showAlert("Selecciona un tipo de registro.");
    return;
  }

  const firstName = norm($.firstName?.value);
  const lastName = norm($.lastName?.value);
  const phone = norm($.phone?.value);
  const emergencyContactName = norm($.emergencyContactName?.value);

  const email = user.email
    ? String(user.email).toLowerCase()
    : normLower($.email?.value);

  const idType = normLower($.idType?.value);
  const idNumber = cleanIdNum($.idNumber?.value);

  const residence = requiresVolcanesExtraFields()
    ? {
        province: norm($.province?.value),
        canton: norm($.canton?.value),
      }
    : null;

  const emergencyContact = {
    name: emergencyContactName,
    relation: null,
    phone: null,
  };

  const committeeInterest = !!$.committeeInterest?.checked;
  const profession = norm($.profession?.value);
  const skills = norm($.skills?.value);

  const wantsPlayer = isVolcanes();
  const wantsMembershipPayment = isAsovoca() && PUBLIC_CFG.enableMembershipPayment;
  const canUsePickups = true;

  const planId = norm($.planId?.value);
  const plan = plansById.get(planId);
  const file = $.proofFile?.files?.[0] || null;

  let cfg;
  try {
    cfg = await loadPublicRegConfig();
  } catch (e) {
    console.warn(e);
    showAlert("No se pudo cargar la configuración. Refresca la página.");
    return;
  }

  if (!firstName || !lastName || !phone || !emergencyContactName) {
    showAlert("Completa nombre, apellido, teléfono y contacto de emergencia.");
    return;
  }

  if (requiresVolcanesExtraFields()) {
    if (!email || !idType || !idNumber) {
      showAlert("Debes completar correo, tipo de documento y número de documento.");
      return;
    }

    if (!residence?.province || !residence?.canton) {
      showAlert("Debes seleccionar provincia y cantón.");
      return;
    }
  }

  if (wantsMembershipPayment) {
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
        email: requiresVolcanesExtraFields() ? email : (user.email || null),
        firstName,
        lastName,
        idType: requiresVolcanesExtraFields() ? idType : null,
        idNumber: requiresVolcanesExtraFields() ? idNumber : null,
        phone,
        residence,
        emergencyContact,
        registerType,
        committeeInterest,
        profession: committeeInterest ? profession : null,
        skills: committeeInterest ? skills : null,
        consents,
      })
    );

    if (wantsMembershipPayment) {
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

          email: email || user.email || null,
          payerName: `${firstName} ${lastName}`.trim() || null,
          phone: phone || null,
          method: "sinpe",

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
        email: email || user.email || null,
        displayName: auth.currentUser?.displayName || null,
        photoURL: auth.currentUser?.photoURL || null,
        phone: phone || null,
        emergencyContact,
        onboardingComplete: true,
        canUsePickups,
        updatedAt: serverTimestamp(),
        lastSignInAt: serverTimestamp(),

        registration: {
          type: registerType,
          wantsPlayer: wantsPlayer === true,
          wantsMembershipPayment: wantsMembershipPayment === true,
          canUsePickups: true,
          committeeInterest: committeeInterest === true,
        },

        playerStatus: wantsPlayer ? "pending" : null,
        associationStatus: wantsMembershipPayment ? "pending" : null,
      };

      return setDoc(uref, payload, { merge: true });
    });

    sessionStorage.removeItem("prefill_register");

    if (wantsPlayer) {
      window.location.replace("/index.html?state=platform_pending");
      return;
    }

    if (wantsMembershipPayment) {
      window.location.replace("/member_status.html");
      return;
    }

    if (canUsePickups) {
      window.location.replace("/pickups_status.html");
      return;
    }

    window.location.replace("/index.html");
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
    ...$.registerTypeRadios,
    $.firstName,
    $.lastName,
    $.phone,
    $.email,
    $.idType,
    $.idNumber,
    $.emergencyContactName,
    $.province,
    $.canton,
    $.planId,
    $.proofFile,
    $.infoDeclaration,
    $.termsAccepted,
    $.committeeInterest,
    $.profession,
    $.skills,
  ].filter(Boolean);

  els.forEach((el) => {
    el.addEventListener("input", updateSubmitState);
    el.addEventListener("change", updateSubmitState);
  });

  $.registerTypeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      refreshRegisterTypeUI();
      refreshCommitteeUI();
      updateSubmitState();
    });
  });

  $.committeeInterest?.addEventListener("change", () => {
    refreshCommitteeUI();
    updateSubmitState();
  });

  $.province?.addEventListener("change", () => setTimeout(updateSubmitState, 0));
  updateSubmitState();
}

wireUpFormCompleteness();