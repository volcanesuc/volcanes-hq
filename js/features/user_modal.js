// /js/features/user_modal.js
import { db } from "../auth/firebase.js";
import { watchAuth } from "../auth/auth.js";
import { showLoader, hideLoader } from "../ui/loader.js";

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = "users";

/* =========================
   PARAMS
========================= */
const params = new URLSearchParams(window.location.search);
const uid = params.get("uid");

/* =========================
   UI
========================= */
const modalTitle = document.getElementById("modalTitle");
const userId = document.getElementById("userId");

const firstName = document.getElementById("firstName");
const lastName = document.getElementById("lastName");
const profileType = document.getElementById("type");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const idNumber = document.getElementById("idNumber");
const active = document.getElementById("active");
const role = document.getElementById("role");
const notes = document.getElementById("notes");

const btnClose = document.getElementById("btnClose");
const btnCancel = document.getElementById("btnCancel");
const btnSave = document.getElementById("btnSave");

/* =========================
   HELPERS
========================= */
function clean(s) {
  return (s || "").toString().trim();
}

function validateEmail(v) {
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function post(type, payload = {}) {
  window.parent.postMessage({ type, ...payload }, window.location.origin);
}

function close() {
  post("modal:close");
}

function sendSize() {
  const h = Math.ceil(document.documentElement.scrollHeight || 0);
  post("modal:resize", { height: h });
}

function scheduleSize() {
  requestAnimationFrame(sendSize);
  setTimeout(sendSize, 0);
  setTimeout(sendSize, 50);
  setTimeout(sendSize, 200);
}

function getDisplayName(fn, ln, fallbackEmail = "") {
  const full = `${clean(fn)} ${clean(ln)}`.trim();
  return full || fallbackEmail || null;
}

function buildPayload(existing = {}) {
  const fn = clean(firstName?.value);
  const ln = clean(lastName?.value);
  const mail = clean(email?.value).toLowerCase() || null;
  const phoneVal = clean(phone?.value) || null;
  const idNumberVal = clean(idNumber?.value) || null;
  const typeVal = clean(profileType?.value) || "other";
  const notesVal = clean(notes?.value) || null;

  return {
    email: mail,
    displayName: getDisplayName(fn, ln, mail),
    isActive: !!active?.checked,
    role: clean(role?.value) || existing.role || "viewer",
    notes: notesVal,
    profile: {
      ...(existing.profile || {}),
      firstName: fn || null,
      lastName: ln || null,
      fullName: getDisplayName(fn, ln, mail),
      type: typeVal,
      phone: phoneVal,
      idNumber: idNumberVal,
    },
    updatedAt: serverTimestamp()
  };
}

/* =========================
   EVENTS
========================= */
btnClose?.addEventListener("click", close);
btnCancel?.addEventListener("click", close);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});

window.addEventListener("resize", scheduleSize);

try {
  new ResizeObserver(() => sendSize()).observe(document.body);
} catch (_) {}

document.querySelectorAll('button[data-bs-toggle="tab"]').forEach((btn) => {
  btn.addEventListener("shown.bs.tab", () => scheduleSize());
});

/* =========================
   AUTH + LOAD
========================= */
let currentDoc = null;

watchAuth(async (user) => {
  if (!user) return;
  if (uid) await loadUser(uid);
  else prepareCreateMode();
  scheduleSize();
});

function prepareCreateMode() {
  currentDoc = null;

  if (modalTitle) modalTitle.textContent = "Nuevo miembro";
  if (userId) userId.value = "";

  if (firstName) firstName.value = "";
  if (lastName) lastName.value = "";
  if (profileType) profileType.value = "other";
  if (email) email.value = "";
  if (phone) phone.value = "";
  if (idNumber) idNumber.value = "";
  if (active) active.checked = true;
  if (role) role.value = "viewer";
  if (notes) notes.value = "";

  scheduleSize();
}

async function loadUser(id) {
  showLoader?.("Cargando usuario…");

  try {
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()) {
      alert("No se encontró el usuario.");
      return close();
    }

    const u = snap.data() || {};
    const profile = u.profile || {};
    currentDoc = { id: snap.id, ...u };

    if (userId) userId.value = snap.id;
    if (modalTitle) modalTitle.textContent = "Editar miembro";

    if (firstName) firstName.value = profile.firstName || "";
    if (lastName) lastName.value = profile.lastName || "";
    if (profileType) profileType.value = profile.type || "other";
    if (email) email.value = u.email || "";
    if (phone) phone.value = profile.phone || "";
    if (idNumber) idNumber.value = profile.idNumber || "";
    if (active) active.checked = u.isActive !== false;
    if (role) role.value = u.role || "viewer";
    if (notes) notes.value = u.notes || "";

    scheduleSize();
  } catch (e) {
    console.error(e);
    alert("Error cargando usuario.");
    close();
  } finally {
    hideLoader?.();
    scheduleSize();
  }
}

/* =========================
   SAVE
========================= */
btnSave?.addEventListener("click", async () => {
  const fn = clean(firstName?.value);
  const ln = clean(lastName?.value);
  const mail = clean(email?.value);

  if (!fn && !ln && !mail) {
    return alert("Completa al menos nombre o correo.");
  }

  if (mail && !validateEmail(mail)) {
    return alert("Email inválido.");
  }

  showLoader?.("Guardando…");
  btnSave.disabled = true;

  try {
    const existing = currentDoc || {};
    const payload = buildPayload(existing);

    if (!uid) {
      alert("Crear usuarios manualmente desde este modal no está habilitado todavía.");
      return;
    }

    await updateDoc(doc(db, COL, uid), payload);
    post("user:saved", { detail: { id: uid, mode: "update" } });
  } catch (e) {
    console.error(e);
    alert("❌ Error guardando: " + (e?.message || e));
    scheduleSize();
  } finally {
    btnSave.disabled = false;
    hideLoader?.();
    scheduleSize();
  }
});

scheduleSize();