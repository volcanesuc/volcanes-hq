// js/features/associate_modal.js
import { db } from "../auth/firebase.js";
import { watchAuth } from "../auth/auth.js";
import { showLoader, hideLoader } from "../ui/loader.js";

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = "associates";

/* =========================
   PARAMS
========================= */
const params = new URLSearchParams(window.location.search);
const aid = params.get("aid");

/* =========================
   UI
========================= */
const modalTitle = document.getElementById("modalTitle");
const associateId = document.getElementById("associateId");

const fullName = document.getElementById("fullName");
const type = document.getElementById("type");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const idNumber = document.getElementById("idNumber");
const active = document.getElementById("active");
const notes = document.getElementById("notes");

const btnClose = document.getElementById("btnClose");
const btnCancel = document.getElementById("btnCancel");
const btnSave = document.getElementById("btnSave");

/* =========================
   HELPERS
========================= */
function clean(s){ return (s || "").toString().trim(); }

function validateEmail(v){
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Post message to parent (modal host)
function post(type, payload = {}){
  window.parent.postMessage({ type, ...payload }, window.location.origin);
}

function close(){
  post("modal:close");
}

// --- iframe auto-resize ---
function sendSize(){
  // Use documentElement so it accounts for full page content
  const h = Math.ceil(document.documentElement.scrollHeight || 0);
  post("modal:resize", { height: h });
}

function scheduleSize(){
  // multiple ticks to catch bootstrap tab/layout transitions
  requestAnimationFrame(sendSize);
  setTimeout(sendSize, 0);
  setTimeout(sendSize, 50);
  setTimeout(sendSize, 200);
}

/* =========================
   EVENTS
========================= */
btnClose?.addEventListener("click", close);
btnCancel?.addEventListener("click", close);

// ESC inside iframe
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});

// Resize on viewport changes
window.addEventListener("resize", scheduleSize);

// Resize when layout changes (inputs, validation messages, etc.)
try {
  new ResizeObserver(() => sendSize()).observe(document.body);
} catch (_) {
  // older browsers: ignore
}

// Bootstrap tabs: resize after switch
document.querySelectorAll('button[data-bs-toggle="tab"]').forEach((btn) => {
  btn.addEventListener("shown.bs.tab", () => scheduleSize());
});

/* =========================
   PAYLOAD
========================= */
function buildPayload(){
  return {
    fullName: clean(fullName.value),
    type: type.value || "other",
    email: clean(email.value) || null,
    phone: clean(phone.value) || null,
    idNumber: clean(idNumber.value) || null,
    active: !!active.checked,
    notes: clean(notes.value) || null,
    updatedAt: serverTimestamp()
  };
}

/* =========================
   AUTH + LOAD
========================= */
watchAuth(async (user) => {
  if (!user) return;
  if (aid) await loadAssociate(aid);
  scheduleSize(); // ensure size is correct after auth/layout
});

async function loadAssociate(id){
  showLoader?.("Cargando asociado…");

  try{
    const snap = await getDoc(doc(db, COL, id));
    if (!snap.exists()){
      alert("No se encontró el asociado.");
      return close();
    }

    const a = snap.data();
    associateId.value = snap.id;

    modalTitle.textContent = "Editar asociado";

    fullName.value = a.fullName || "";
    type.value = a.type || "other";
    email.value = a.email || "";
    phone.value = a.phone || "";
    idNumber.value = a.idNumber || "";
    active.checked = a.active !== false;
    notes.value = a.notes || "";

    scheduleSize();
  } catch (e){
    console.error(e);
    alert("Error cargando asociado.");
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
  const name = clean(fullName.value);
  if (!name) return alert("Falta el nombre.");

  const mail = clean(email.value);
  if (mail && !validateEmail(mail)) return alert("Email inválido.");

  showLoader?.("Guardando…");
  btnSave.disabled = true;

  try{
    const payload = buildPayload();

    // CREATE
    if (!aid){
      const ref = await addDoc(collection(db, COL), {
        ...payload,
        createdAt: serverTimestamp()
      });

      post("associate:saved", { detail: { id: ref.id, mode: "create" } });
      return;
    }

    // UPDATE
    await updateDoc(doc(db, COL, aid), payload);
    post("associate:saved", { detail: { id: aid, mode: "update" } });

  } catch(e){
    console.error(e);
    alert("❌ Error guardando: " + (e?.message || e));
    scheduleSize();
  } finally{
    btnSave.disabled = false;
    hideLoader?.();
    scheduleSize();
  }
});

// Initial size (even before auth finishes)
scheduleSize();
