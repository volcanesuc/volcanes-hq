// js/auth/role-routing.js
import { db } from "./firebase.js";
import { APP_CONFIG } from "../config/config.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const USERS_COL = COL.users;

function normalizePlayerStatus(data = {}) {
  const explicit = String(data.playerStatus || "").trim().toLowerCase();
  if (explicit) return explicit;

  if (data.isPlayerActive === true) {
    return "active";
  }

  return "";
}

function normalizeAssociationStatus(data = {}) {
  const explicit = String(data.associationStatus || "").trim().toLowerCase();

  if (explicit === "payment_validation_pending") return "pending";
  if (explicit === "associated_active") return "active";
  if (explicit === "associated_rejected") return "rejected";

  return explicit || "";
}

async function ensureUserDoc(firebaseUser) {
  const uid = firebaseUser?.uid;
  if (!uid) throw new Error("No hay firebaseUser.uid");

  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() || {};
    const patch = {};

    if (data.uid !== uid) patch.uid = uid;
    if ((data.email || null) !== (firebaseUser.email || null)) {
      patch.email = firebaseUser.email || null;
    }

    if ((data.displayName || null) !== (firebaseUser.displayName || null)) {
      patch.displayName = firebaseUser.displayName || null;
    }

    if ((data.photoURL || null) !== (firebaseUser.photoURL || null)) {
      patch.photoURL = firebaseUser.photoURL || null;
    }

    if (data.onboardingComplete === undefined) patch.onboardingComplete = false;

    if (data.isPlayerActive === undefined && data.isActive !== undefined) {
      patch.isPlayerActive = data.isActive === true;
    } else if (data.isPlayerActive === undefined) {
      patch.isPlayerActive = false;
    }

    if (data.playerStatus === undefined) patch.playerStatus = null;
    if (data.associationStatus === undefined) patch.associationStatus = null;

    if (data.role === undefined) patch.role = "viewer";

    if (data.playerId === undefined) patch.playerId = null;
    if (data.profile === undefined || data.profile === null) patch.profile = {};
    if (data.consents === undefined || data.consents === null) patch.consents = {};
    if (!Array.isArray(data.membershipIds)) patch.membershipIds = [];
    if (data.currentMembership === undefined) patch.currentMembership = null;

    patch.lastSignInAt = serverTimestamp();

    if (Object.keys(patch).length) {
      patch.updatedAt = serverTimestamp();
      await setDoc(ref, patch, { merge: true });
      return { created: false, data: { ...data, ...patch } };
    }

    return { created: false, data };
  }

  const payload = {
    uid,
    email: firebaseUser.email || null,
    displayName: firebaseUser.displayName || null,
    photoURL: firebaseUser.photoURL || null,

    onboardingComplete: false,
    isPlayerActive: false,
    isActive: false, // compat temporal
    playerStatus: null,
    associationStatus: null,
    role: "viewer",

    playerId: null,
    profile: {},
    consents: {},
    membershipIds: [],
    currentMembership: null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSignInAt: serverTimestamp()
  };

  await setDoc(ref, payload, { merge: true });
  return { created: true, data: payload };
}

export async function getUserAccess(uid) {
  if (!uid) return null;

  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data() || {};
  const playerStatus = normalizePlayerStatus(data);
  const associationStatus = normalizeAssociationStatus(data);

  return {
    isPlayerActive: playerStatus === "active",
    onboardingComplete: data.onboardingComplete === true,
    role: String(data.role || "viewer").trim().toLowerCase(),
    playerStatus,
    associationStatus,
    raw: data
  };
}

export async function routeAfterGoogleLogin(firebaseUser) {
  if (!firebaseUser?.uid) {
    window.location.href = "/public/register.html?error=nouser";
    return;
  }

  const ensured = await ensureUserDoc(firebaseUser);
  const createdFlag = ensured.created ? "1" : "0";

  const data = ensured.data || {};
  const onboardingDone = data.onboardingComplete === true;

  const playerStatus = normalizePlayerStatus(data);
  const associationStatus = normalizeAssociationStatus(data);
  const isPlayerActive = playerStatus === "active";

  if (!onboardingDone) {
    window.location.href = `/public/register.html?created=${createdFlag}`;
    return;
  }

  if (isPlayerActive) {
    window.location.href = "/dashboard.html";
    return;
  }

  if (
    associationStatus === "pending" ||
    associationStatus === "active" ||
    associationStatus === "rejected"
  ) {
    window.location.href = "/member_status.html";
    return;
  }

  if (playerStatus === "pending") {
    window.location.href = "/index.html?state=platform_pending";
    return;
  }

  window.location.href = "/index.html";
}