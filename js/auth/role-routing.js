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
const USER_ROLES_COL = COL.userRoles;

async function ensureUserDoc(firebaseUser) {
  const uid = firebaseUser?.uid;
  if (!uid) throw new Error("No hay firebaseUser.uid");

  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() || {};
    const patch = {};

    if (data.uid !== uid) patch.uid = uid;
    if (data.email !== (firebaseUser.email || null)) patch.email = firebaseUser.email || null;

    if (data.displayName === undefined) patch.displayName = firebaseUser.displayName || null;
    if (data.photoURL === undefined) patch.photoURL = firebaseUser.photoURL || null;

    if (data.onboardingComplete === undefined) patch.onboardingComplete = false;
    if (data.isActive === undefined) patch.isActive = false;

    if (data.memberId === undefined) patch.memberId = null;
    if (data.associateId === undefined) patch.associateId = null;
    if (data.playerId === undefined) patch.playerId = null;

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
    isActive: false,
    memberId: null,
    associateId: null,
    playerId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, payload, { merge: true });
  return { created: true, data: payload };
}

export async function getUserRole(uid) {
  if (!uid) return null;

  const ref = doc(db, USER_ROLES_COL, uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  const data = snap.data() || {};

  return {
    active: data.active === true,
    role: String(data.role || "viewer").trim().toLowerCase(),
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

  if (!onboardingDone) {
    window.location.href = `/public/register.html?created=${createdFlag}`;
    return;
  }

  const roleInfo = await getUserRole(firebaseUser.uid);

  if (roleInfo?.active === true) {
    window.location.href = "/dashboard.html";
    return;
  }

  window.location.href = `/index.html?pending=1`;
}