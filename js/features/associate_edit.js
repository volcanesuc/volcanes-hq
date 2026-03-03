import { db } from "../auth/firebase.js";
import { watchAuth, logout } from "../auth/auth.js";
import { loadHeader } from "../components/header.js";
import { showLoader, hideLoader } from "../ui/loader.js";

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

loadHeader("association");
document.getElementById("logoutBtn")?.addEventListener("click", logout);

const COL = "associates";

/* =========================
   ELEMENTOS
========================= */
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const metaInfo = document.getElementById("metaInfo");

const associateId = document.getElementById("associateId");

const fullName = document.getElementById("fullName");
const type = document.getElementById("type");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const idNumber = document.getElementById("idNumber");
const active = document.getElementById("active");
const notes = document.getElementById("notes");

const btnSave = document.getElementById("btnSave");
const btnDeactivate = document.getElementById("btnDeactivate");
const btnBack = document.getElementById("btnBack");

/* =========================
   PARAMS
========================= */
const params = new URLSearchParams(window.location.search);
const aid = params.get("aid");
const returnTo = params.get("returnTo");

/* =========================
   HELPERS
========================= */
function clean(s){ return (s || "").toString().trim(); }

function validateEmail(v){
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

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
   NAVEGACIÓN CORRECTA BACK
========================= */
function goBack(){
  // si viene returnTo → vuelve EXACTO al tab/origen
  if (returnTo){
    window.location.replace(decodeURIComponent(returnTo));
    return;
  }

  // si hay historial real
  if (window.history.length > 1){
    window.history.back();
    return;
  }

  // fallback
  window.location.replace("association.html?tab=associates");
}

btnBack?.addEventListener("click", goBack);

/* =========================
   AUTH + LOAD
========================= */
watchAuth(async (user) => {
  if (!user) return;
  if (aid) await loadAssociate(aid);
});

async function loadAssociate(id){
  showLoader?.("Cargando asociado…");

  try{
    const ref = doc(db, COL, id);
    const snap = await getDoc(ref);

    if (!snap.exists()){
      alert("No se encontró el asociado.");
      goBack();
      return;
    }

    const a = snap.data();
    associateId.value = snap.id;

    pageTitle.textContent = "Editar asociado";
    pageSubtitle.textContent = "Actualizá los datos del asociado.";
    btnDeactivate.style.display = "inline-block";

    fullName.value = a.fullName || "";
    type.value = a.type || "other";
    email.value = a.email || "";
    phone.value = a.phone || "";
    idNumber.value = a.idNumber || "";
    active.checked = a.active !== false;
    notes.value = a.notes || "";

    metaInfo.textContent = `ID: ${snap.id}`;

  }catch(e){
    console.error(e);
    alert("Error cargando asociado");
    goBack();
  }finally{
    hideLoader?.();
  }
}

/* =========================
   SAVE
========================= */
btnSave?.addEventListener("click", async () => {
  const name = clean(fullName.value);
  if (!name) return alert("Falta el nombre completo.");

  const mail = clean(email.value);
  if (mail && !validateEmail(mail)) return alert("Email inválido.");

  showLoader?.("Guardando…");
  btnSave.disabled = true;

  try {
    const payload = buildPayload();

    // CREATE
    if (!aid){
      await addDoc(collection(db, COL), {
        ...payload,
        createdAt: serverTimestamp()
      });

      alert("✅ Asociado creado");
      goBack();
      return;
    }

    // UPDATE
    await updateDoc(doc(db, COL, aid), payload);
    alert("✅ Guardado");
    goBack();

  } catch (e) {
    console.error(e);
    alert("❌ Error guardando: " + (e?.message || e));
  } finally {
    btnSave.disabled = false;
    hideLoader?.();
  }
});

/* =========================
   DESACTIVAR
========================= */
btnDeactivate?.addEventListener("click", async () => {
  if (!aid) return;

  if (!confirm("¿Marcar este asociado como inactivo?")) return;

  showLoader?.("Actualizando…");
  btnDeactivate.disabled = true;

  try {
    await updateDoc(doc(db, COL, aid), {
      active: false,
      updatedAt: serverTimestamp()
    });

    active.checked = false;
    alert("✅ Marcado como inactivo");

  } catch (e) {
    console.error(e);
    alert("❌ Error: " + (e?.message || e));
  } finally {
    btnDeactivate.disabled = false;
    hideLoader?.();
  }
});
