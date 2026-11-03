// js/auth/role-routing.js
import { db } from "./firebase.js";
import { APP_CONFIG } from "../config/config.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX } from "/js/strings/screens/role_routing.js";
import { ROUTES, destinationFor, loadAccess } from "/js/core/me.js";

const COL = APP_CONFIG.collections;
const USERS_COL = COL.users;

//HELPERS

function samePath(pathname) {
  return window.location.pathname === pathname;
}

function sameIndexState(state) {
  const url = new URL(window.location.href);
  return (
    (url.pathname === "/" || url.pathname.endsWith("/index.html")) &&
    url.searchParams.get("state") === state
  );
}

function goTo(url) {
  const target = new URL(url, window.location.origin);
  const current = new URL(window.location.href);

  if (
    current.pathname === target.pathname &&
    current.search === target.search &&
    current.hash === target.hash
  ) {
    return;
  }

  window.location.replace(target.pathname + target.search + target.hash);
}

async function ensureUserDoc(firebaseUser) {
  const uid = firebaseUser?.uid;
  if (!uid) throw new Error(TX.noHayFirebaseuserUid);

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
    if (data.isPlayerActive === undefined) patch.isPlayerActive = false;
    if (data.playerStatus === undefined) patch.playerStatus = null;
    if (data.associationStatus === undefined) patch.associationStatus = null;
    if (data.role === undefined) patch.role = "viewer";
    if (data.playerId === undefined) patch.playerId = null;
    if (data.memberId === undefined) patch.memberId = null;
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
    playerStatus: null,
    associationStatus: null,
    role: "viewer",

    playerId: null,
    memberId: null,
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

// Compatibilidad: mismo formato que antes, calculado por me.js.
export async function getUserAccess(uid) {
  if (!uid) return null;
  const access = await loadAccess(uid);
  if (!access.exists) return null;
  return {
    isPlayerActive: access.isPlayerActive,
    onboardingComplete: access.onboardingComplete,
    role: access.role,
    playerStatus: access.playerStatus,
    associationStatus: access.associationStatus,
    raw: access.userData,
  };
}

export async function routeAfterGoogleLogin(firebaseUser) {
  if (!firebaseUser?.uid) {
    goTo("/public/register.html?error=nouser");
    return;
  }

  const ensured = await ensureUserDoc(firebaseUser);
  const access = await loadAccess(firebaseUser.uid, { force: true });
  const dest = destinationFor(access);

  if (dest === ROUTES.register) {
    goTo(`${ROUTES.register}?created=${ensured.created ? "1" : "0"}`);
    return;
  }

  // En el inicio (index) quedarse si ese es su lugar.
  if (dest === ROUTES.landing && (samePath("/index.html") || window.location.pathname === "/")) return;
  if (dest === ROUTES.playerPending && sameIndexState("platform_pending")) return;

  goTo(dest);
}
