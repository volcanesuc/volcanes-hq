// js/auth.js
import { auth } from "../auth/firebase.js";
import { db } from "../auth/firebase.js";

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

const provider = new GoogleAuthProvider();
const STORAGE_KEY = "google_login_paths";

/* =========================================================
   Google Login (POPUP)
   - Si users/{uid}.onboardingComplete === true => dashboard
   - Si no => public/register.html?google=1
========================================================= */
export async function loginWithGoogle(opts = {}) {
  const dashboardPath = opts.dashboardPath ?? "dashboard.html";
  const registerPath = opts.registerPath ?? "public/register.html?google=1";

  try {
    // (opcional) guardá paths por si querés usarlos igual
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dashboardPath, registerPath })
    );

    provider.setCustomParameters({ prompt: "select_account" });

    // ✅ POPUP
    const cred = await signInWithPopup(auth, provider);
    const user = cred?.user;
    if (!user) return null;

    // Prefill siempre
    sessionStorage.setItem(
      "prefill_register",
      JSON.stringify({
        fullName: user.displayName || "",
        email: user.email || "",
        phone: user.phoneNumber || "",
      })
    );

    // paths guardados (o defaults)
    const stored = safeJson(sessionStorage.getItem(STORAGE_KEY)) || {};
    const dash = stored.dashboardPath ?? dashboardPath;
    const reg = stored.registerPath ?? registerPath;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    const email = (user.email || "").toLowerCase();

    if (snap.exists()) {
      const data = snap.data() || {};
      const done = data.onboardingComplete === true;

      // mantener email actualizado
      if (email && data.email !== email) {
        await setDoc(
          userRef,
          { email, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      window.location.href = done ? dash : reg;
      return cred;
    }

    // no existe => crear doc mínimo y mandar a register
    await setDoc(
      userRef,
      {
        email: email || null,
        onboardingComplete: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    window.location.href = reg;
    return cred;

  } catch (err) {
    console.error("loginWithGoogle popup error:", err?.code, err?.message, err);

    // popup bloqueado
    if (err?.code === "auth/popup-blocked") {
      // si querés, podés mostrar UI inline en vez de alert
      // showToast("Permití popups e intentá de nuevo");
      return null;
    }

    // request anterior cancelada (normal si spamean click)
    if (err?.code === "auth/cancelled-popup-request") return null;

    // 🔥 NO alert en permission-denied (esto pasa por rules/bootstrapping)
    if (err?.code === "permission-denied") {
      // opcional: si querés mostrar algo NO intrusivo
      // showToast("No tenés permisos todavía. Intentá de nuevo o contactá al admin.");
      return null;
    }

    // en general: no alert (si querés, lo manejás con UI tipo banner)
    return null;
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/* =========================================================
   Guard / watchAuth
========================================================= */
export function watchAuth(onLoggedIn, opts = {}) {
  const redirectTo = opts.redirectTo ?? "/index.html";

  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace(redirectTo);
      return;
    }
    onLoggedIn?.(user);
  });
}

/* =========================================================
   Logout
========================================================= */
export async function logout(opts = {}) {
  const redirectTo = opts.redirectTo ?? "index.html";
  await signOut(auth);
  window.location.href = redirectTo;
}