import { auth, db } from "../auth/firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { APP_CONFIG } from "../config/config.js";

const provider = new GoogleAuthProvider();
const STORAGE_KEY = "google_login_paths";

const COL = APP_CONFIG.collections;

async function getUserAccessState(uid) {
  if (!uid) {
    return {
      exists: false,
      onboardingComplete: false,
      isActive: false,
      role: "viewer",
      userData: {},
    };
  }

  const userRef = doc(db, COL.users, uid);
  const userSnap = await getDoc(userRef).catch(() => null);
  const userData = userSnap?.exists?.() ? userSnap.data() || {} : {};

  return {
    exists: !!userSnap?.exists?.(),
    onboardingComplete: userData.onboardingComplete === true,
    isActive: userData.isActive === true,
    role: String(userData.role || "viewer").trim().toLowerCase(),
    userData,
  };
}

export async function loginWithGoogle(opts = {}) {
  const dashboardPath = opts.dashboardPath ?? "dashboard.html";
  const registerPath = opts.registerPath ?? "public/register.html?google=1";
  const landingPath = opts.landingPath ?? "index.html?pending=1";

  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dashboardPath, registerPath, landingPath })
    );

    provider.setCustomParameters({ prompt: "select_account" });

    const cred = await signInWithPopup(auth, provider);
    const user = cred?.user;
    if (!user) return null;

    sessionStorage.setItem(
      "prefill_register",
      JSON.stringify({
        fullName: user.displayName || "",
        email: user.email || "",
        phone: user.phoneNumber || "",
      })
    );

    const stored = safeJson(sessionStorage.getItem(STORAGE_KEY)) || {};
    const dash = stored.dashboardPath ?? dashboardPath;
    const reg = stored.registerPath ?? registerPath;
    const landing = stored.landingPath ?? landingPath;

    const userRef = doc(db, COL.users, user.uid);
    const snap = await getDoc(userRef);

    const email = (user.email || "").toLowerCase();

    if (snap.exists()) {
      const data = snap.data() || {};

      const patch = {};
      if (email && data.email !== email) patch.email = email;
      if ((data.displayName || null) !== (user.displayName || null)) {
        patch.displayName = user.displayName || null;
      }
      if ((data.photoURL || null) !== (user.photoURL || null)) {
        patch.photoURL = user.photoURL || null;
      }

      if (Object.keys(patch).length) {
        patch.updatedAt = serverTimestamp();
        await setDoc(userRef, patch, { merge: true });
      }

      const access = await getUserAccessState(user.uid);

      if (!access.onboardingComplete) {
        window.location.href = reg;
        return cred;
      }

      if (access.onboardingComplete && access.isActive) {
        window.location.href = dash;
        return cred;
      }

      window.location.href = landing;
      return cred;
    }

    await setDoc(
      userRef,
      {
        uid: user.uid,
        email: email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        onboardingComplete: false,
        isActive: false,
        role: "viewer",
        memberId: null,
        associateId: null,
        playerId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    window.location.href = reg;
    return cred;
  } catch (err) {
    console.error("loginWithGoogle popup error:", err?.code, err?.message, err);

    if (err?.code === "auth/popup-blocked") return null;
    if (err?.code === "auth/cancelled-popup-request") return null;
    if (err?.code === "permission-denied") return null;

    return null;
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function watchAuth(onLoggedIn, opts = {}) {
  const redirectTo = opts.redirectTo ?? "/index.html";
  const registerPath = opts.registerPath ?? "/public/register.html";
  const pendingPath = opts.pendingPath ?? "/index.html?pending=1";
  const requireActiveUser = opts.requireActiveUser !== false;

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace(redirectTo);
      return;
    }

    try {
      const access = await getUserAccessState(user.uid);

      if (!access.onboardingComplete) {
        window.location.replace(registerPath);
        return;
      }

      if (requireActiveUser && !access.isActive) {
        window.location.replace(pendingPath);
        return;
      }

      onLoggedIn?.(user, access);
    } catch (err) {
      console.error("watchAuth access check failed:", err);
      window.location.replace(redirectTo);
    }
  });
}

export async function logout(opts = {}) {
  const redirectTo = opts.redirectTo ?? "index.html";
  await signOut(auth);
  window.location.href = redirectTo;
}

export async function getCurrentUserAccess() {
  const uid = auth.currentUser?.uid;
  return getUserAccessState(uid);
}