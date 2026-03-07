// js/auth/role-routing.js
import { db } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const USERS_COL = "users";
const USER_ROLES_COL = "user_roles";

async function ensureUserDoc(firebaseUser) {
  const uid = firebaseUser?.uid;
  if (!uid) throw new Error("No hay firebaseUser.uid");

  const ref = doc(db, USERS_COL, uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() || {};

    if (data.onboardingComplete === undefined) {
      const patch = {
        onboardingComplete: false,
        updatedAt: serverTimestamp()
      };
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
    phoneNumber: firebaseUser.phoneNumber || null,
    providerId: firebaseUser.providerData?.[0]?.providerId || "google",
    onboardingComplete: false,
    isActive: true,
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

/**
 * Regla:
 * 1) Asegura users/{uid}
 * 2) Si onboardingComplete !== true -> register
 * 3) Si onboardingComplete === true y user_roles/{uid}.active === true -> dashboard
 * 4) Si onboardingComplete === true pero no tiene rol activo -> register?norole=1
 */
export async function routeAfterGoogleLogin(firebaseUser) {
  if (!firebaseUser?.uid) {
    window.location.href = "/public/register.html?error=nouser";
    return;
  }

  const ensured = await ensureUserDoc(firebaseUser);
  const createdFlag = ensured.created ? "1" : "0";

  const data = ensured.data || {};
  const onboardingDone = data.onboardingComplete === true;

  // No ha terminado onboarding
  if (!onboardingDone) {
    window.location.href = `/public/register.html?created=${createdFlag}`;
    return;
  }

  // Ya terminó onboarding -> revisar rol
  const roleInfo = await getUserRole(firebaseUser.uid);

  if (roleInfo?.active === true) {
    window.location.href = "/dashboard.html";
    return;
  }

  // Terminó onboarding pero no tiene rol activo
  window.location.href = `/public/register.html?created=${createdFlag}&norole=1`;
}