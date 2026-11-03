import { newUserDoc } from "../core/people.js";
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
import { ROUTES, destinationFor, loadAccess } from "../core/me.js";

const provider = new GoogleAuthProvider();
const STORAGE_KEY = "google_login_paths";

const COL = APP_CONFIG.collections;

// Formato de siempre (onLoggedIn recibe esto), calculado por me.js.
async function getUserAccessState(uid) {
  const access = await loadAccess(uid);
  return { ...access, exists: access.exists };
}

export async function loginWithGoogle(opts = {}) {
  const dashboardPath = opts.dashboardPath ?? "/dashboard.html";
  const registerPath = opts.registerPath ?? "/public/register.html?google=1";
  const memberStatusPath = opts.memberStatusPath ?? "/member_status.html";
  const landingPath = opts.landingPath ?? "/index.html?state=platform_pending";

  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dashboardPath, registerPath, memberStatusPath, landingPath })
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
    const memberStatus = stored.memberStatusPath ?? memberStatusPath;
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

      const access = await loadAccess(user.uid, { force: true });
      const dest = destinationFor(access);
      const byRoute = {
        [ROUTES.dashboard]: dash,
        [ROUTES.register]: reg,
        [ROUTES.memberStatus]: memberStatus,
        [ROUTES.playerPending]: landing,
      };
      window.location.href = byRoute[dest] || dest;
      return cred;
    }

    await setDoc(userRef, newUserDoc(user), { merge: true });

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
  const pendingPath = opts.pendingPath ?? "/index.html?state=platform_pending";
  const memberStatusPath = opts.memberStatusPath ?? "/member_status.html";
  const requireActiveUser = opts.requireActiveUser !== false;

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace(redirectTo);
      return;
    }

    try {
      const access = await getUserAccessState(user.uid);
      const dest = destinationFor(access);

      if (requireActiveUser && dest !== ROUTES.dashboard) {
        const byRoute = {
          [ROUTES.register]: registerPath,
          [ROUTES.memberStatus]: memberStatusPath,
          [ROUTES.playerPending]: pendingPath,
          [ROUTES.landing]: redirectTo,
        };
        window.location.replace(byRoute[dest] || dest);
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
  const redirectTo = opts.redirectTo ?? "/index.html";
  await signOut(auth);
  window.location.href = redirectTo;
}

export async function getCurrentUserAccess() {
  const uid = auth.currentUser?.uid;
  return getUserAccessState(uid);
}