// js/auth/firebase.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { APP_CONFIG } from "../config/config.js";

/* =========================================
   Firebase config desde config.js
========================================= */
function getFirebaseConfig() {
  const cfg = APP_CONFIG?.firebase;

  if (!cfg?.apiKey || !cfg?.authDomain || !cfg?.projectId || !cfg?.appId) {
    throw new Error(
      "Falta APP_CONFIG.firebase. Revisá config.js"
    );
  }

  return cfg;
}

/* evita doble init */
const app = getApps().length ? getApps()[0] : initializeApp(getFirebaseConfig());

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export { app };