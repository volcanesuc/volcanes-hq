import { db, auth, storage } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";

import {
  collection,
  doc,
  getDoc,
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

import {
  norm,
  safeSeasonFromToday,
  setProofStatus,
} from "./register_ui.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_MEMBERSHIPS = COL.memberships;
const COL_INSTALLMENTS = COL.membershipInstallments;
const COL_SUBMISSIONS = COL.membershipPaymentSubmissions;

/* =========================
   Generic helpers
========================= */
export function planAmount(plan) {
  const a = plan?.totalAmount ?? plan?.amount ?? null;
  return a === null || a === undefined ? null : Number(a);
}

export function makePayCode(len = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function normalizePlayerStatus(data) {
  const explicit = String(data?.playerStatus || "").trim().toLowerCase();
  if (explicit) return explicit;
  return data?.isPlayerActive === true ? "active" : "";
}

export function normalizeAssociationStatus(data) {
  const explicit = String(data?.associationStatus || "").trim().toLowerCase();
  if (explicit === "associated_active") return "active";
  if (explicit === "associated_rejected") return "rejected";
  if (explicit === "payment_validation_pending") return "pending";
  if (explicit) return explicit;
  return "";
}

/* =========================
   Error helpers
========================= */
export function firebaseErrMsg(e) {
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

export async function step(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    return result;
  } catch (e) {
    console.error(`❌ ${name}`, e);
    throw new Error(`${name}: ${firebaseErrMsg(e)}`);
  }
}

/* =========================
   User access / bootstrap
========================= */
export async function getUserAccessState(uid) {
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

export async function ensureUserDoc(uid, email, user = auth.currentUser) {
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

/* =========================
   User profile payloads
========================= */
export function buildUserProfile({
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

export async function saveUserProfileAndConsents({
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
      requireAssociationTerms: !!consents.requireAssociationTerms,
      associationTermsAccepted: consents.associationTermsAccepted === true,
      associationTermsUrl: consents.associationTermsUrl || null,
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
   Membership creation
========================= */
export async function createMembership({
  uid,
  userSnapshot,
  plan,
  season,
  consents,
}) {
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

export async function maybeCreateInstallments({
  membershipId,
  plan,
  season,
}) {
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

export async function syncUserMembershipSummary({
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

export async function createPaymentSubmission({
  uid,
  email,
  firstName,
  lastName,
  phone,
  plan,
  planId,
  season,
  membershipId,
  proof,
}) {
  return addDoc(collection(db, COL_SUBMISSIONS), {
    adminNote: null,
    note: null,
    amountReported: planAmount(plan),
    currency: plan.currency || "CRC",
    email: email || auth.currentUser?.email || null,
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
  });
}

export async function markUserOnboardingComplete({
  uid,
  email,
  phone,
  emergencyContact,
  registerType,
  wantsPlayer,
  wantsMembershipPayment,
  committeeInterest,
  canUsePickups = true,
}) {
  const uref = doc(db, COL_USERS, uid);

  const payload = {
    email: email || auth.currentUser?.email || null,
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
}

/* =========================
   Upload proof
========================= */
export function validateProofFile(file) {
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

export async function uploadProofFile({ uid, file }) {
  validateProofFile(file);

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const safeExt = ext ? `.${ext}` : "";
  const path = `membership_submissions/${uid || "anonymous"}/${Date.now()}_proof${safeExt}`;
  const r = sRef(storage, path);

  const task = uploadBytesResumable(r, file, {
    contentType: file.type || "application/octet-stream",
  });

  setProofStatus("Subiendo comprobante: 0%", "muted", true);

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
   Submit data helpers
========================= */
export function buildEmergencyContact(emergencyContactName) {
  return {
    name: norm(emergencyContactName),
    relation: null,
    phone: null,
  };
}

export function buildResidence({ province, canton }) {
  return {
    province: norm(province),
    canton: norm(canton),
  };
}

export function resolveSeason(plan) {
  return plan?.season || safeSeasonFromToday();
}