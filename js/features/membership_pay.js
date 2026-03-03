// js/features/membership_pay.js
import { db } from "../auth/firebase.js";

import {
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getStorage,
  ref as sRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { recomputeMembershipRollup } from "./membership_rollup.js";

/* =========================
   Collections
========================= */
const COL_MEMBERSHIPS = "memberships";
const COL_INSTALLMENTS = "membership_installments";
const COL_SUBMISSIONS = "membership_payment_submissions";

/* =========================
   DOM
========================= */
const pagePill = document.getElementById("pagePill");
const alertBox = document.getElementById("alertBox");

const assocName = document.getElementById("assocName");
const assocContact = document.getElementById("assocContact");
const planName = document.getElementById("planName");
const planMeta = document.getElementById("planMeta");

const payDisabledCard = document.getElementById("payDisabledCard");
const payDisabledMsg = document.getElementById("payDisabledMsg");

const payForm = document.getElementById("payForm");

// ✅ NUEVO: lista de cuotas multi-select (checkboxes)
const installmentsBox = document.getElementById("installmentsBox");
const installmentsBoxHint = document.getElementById("installmentsBoxHint");

// (si mantenés el select viejo, no pasa nada; no lo usamos)
const installmentSelect = document.getElementById("installmentSelect");
const installmentHint = document.getElementById("installmentHint");

const payerName = document.getElementById("payerName");
const amount = document.getElementById("amount");
const amountHint = document.getElementById("amountHint");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const method = document.getElementById("method");
const fileInput = document.getElementById("file");
const note = document.getElementById("note");

const btnSubmit = document.getElementById("btnSubmit");
const btnReset = document.getElementById("btnReset");

const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

const midText = document.getElementById("midText");

/* =========================
   Params
========================= */
const params = new URLSearchParams(window.location.search);
const mid = params.get("mid");
const code = params.get("code");

/* =========================
   State
========================= */
let membership = null;
let installments = [];
let _wired = false;

/* =========================
   Helpers
========================= */
function showAlert(msg, type = "warning"){
  if (!alertBox) return alert(msg);
  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove("d-none");
}
function hideAlert(){ alertBox?.classList.add("d-none"); }

function disableForm(disabled = true){
  if (!payForm) return;
  if (disabled) payForm.classList.add("disabled-overlay");
  else payForm.classList.remove("disabled-overlay");
}

function fmtMoney(n, cur="CRC"){
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", { style:"currency", currency: cur, maximumFractionDigits: 0 }).format(v);
}

function safe(s){ return (s || "").toString().trim(); }

function setProgress(pct, text){
  progressWrap?.classList.remove("d-none");
  progressText?.classList.remove("d-none");
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressText) progressText.textContent = text || "";
}

function clearProgress(){
  progressWrap?.classList.add("d-none");
  progressText?.classList.add("d-none");
  if (progressBar) progressBar.style.width = "0%";
  if (progressText) progressText.textContent = "";
}

function inferCurrency(){
  return membership?.currency || membership?.planSnapshot?.currency || "CRC";
}

function isSettledInstallmentStatus(st){
  const s = (st || "pending").toString().toLowerCase();
  return s === "validated" || s === "paid";
}

function getInstallmentById(id){
  return installments.find(x => x.id === id) || null;
}

function setPayDisabledUI(msg){
  payForm?.classList.add("d-none");
  payDisabledCard?.classList.remove("d-none");
  if (payDisabledMsg) payDisabledMsg.textContent = msg || "";

  btnSubmit && (btnSubmit.disabled = true);
  disableForm(true);

  if (pagePill) pagePill.textContent = "En revisión";
}

function sumSelectedInstallments(ids){
  const cur = inferCurrency();
  let total = 0;
  for (const id of ids){
    const it = getInstallmentById(id);
    if (it) total += Number(it.amount || 0);
  }
  return { total, cur };
}

function getSelectedInstallmentIdsFromUI(){
  // ✅ preferimos checkboxes
  const checked = [...document.querySelectorAll('input[name="installmentChk"]:checked')].map(x => x.value).filter(Boolean);
  if (checked.length) return checked;

  // fallback: si no existe UI nueva, intentamos con select (1)
  const one = installmentSelect?.value || "";
  return one ? [one] : [];
}

/* =========================
   Boot
========================= */
(async function boot(){
  if (midText) midText.textContent = mid || "—";

  if (!mid || !code){
    if (pagePill) pagePill.textContent = "Link inválido";
    disableForm(true);
    showAlert("Link inválido. Asegurate de abrir el enlace completo (mid y code).", "danger");
    return;
  }

  if (pagePill) pagePill.textContent = "Cargando…";
  disableForm(true);

  try {
    const auth = getAuth();
    if (!auth.currentUser) { // Si ya hay sesión, no re-auth
      await signInAnonymously(auth);
    }
    console.log("auth uid:", auth.currentUser?.uid, "anon:", auth.currentUser?.isAnonymous);
  } catch (e) {
    console.warn("Anonymous auth no disponible:", e);
  }

  try{
    await loadMembership();
    await loadInstallments();

    try { await recomputeMembershipRollup(mid); } catch (_) {}

    if (membership?.payLinkEnabled === false){
      fillSummaryOnly();
      const reason =
        membership?.payLinkDisabledReason ||
        "Este link está deshabilitado mientras el admin revisa el comprobante.";
      setPayDisabledUI(reason);
      showAlert(reason, "warning");
      return;
    }

    fillUI();
    wireOnce();
    disableForm(false);
    if (pagePill) pagePill.textContent = "Listo";

  }catch(e){
    console.error(e);
    if (pagePill) pagePill.textContent = "No disponible";
    disableForm(true);

    if (String(e?.message || e).includes("invalid_code")){
      showAlert("Código inválido.", "danger");
    } else {
      showAlert("No se pudo cargar la membresía. Revisá el link o contactá al club.", "danger");
    }
  }
})();

/* =========================
   Load data
========================= */
async function loadMembership(){
  const snap = await getDoc(doc(db, COL_MEMBERSHIPS, mid));
  if (!snap.exists()) throw new Error("membership_not_found");

  membership = { id: snap.id, ...snap.data() };

  if ((membership.payCode || "") !== code){
    throw new Error("invalid_code");
  }
}

async function loadInstallments(){
  const q = query(collection(db, COL_INSTALLMENTS), where("membershipId", "==", mid));
  const snap = await getDocs(q);

  installments = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a,b) => (a.n||0)-(b.n||0));
}

/* =========================
   UI fill
========================= */
function fillSummaryOnly(){
  hideAlert();

  const a = membership?.associateSnapshot || {};
  const p = membership?.planSnapshot || {};
  const cur = inferCurrency();

  assocName && (assocName.textContent = a.fullName || "—");
  assocContact && (assocContact.textContent = [a.email || null, a.phone || null].filter(Boolean).join(" • ") || "—");

  planName && (planName.textContent = p.name || "—");
  const totalTxt = p.allowCustomAmount ? "Monto editable" : fmtMoney(membership.totalAmount ?? p.totalAmount, cur);
  planMeta && (planMeta.textContent = `${totalTxt} • ${p.allowPartial ? "Permite cuotas" : "Pago único"} • ${p.requiresValidation ? "Validación admin" : "Sin validación"}`);
}

function fillUI(){
  fillSummaryOnly();

  const a = membership.associateSnapshot || {};
  payerName && (payerName.value = a.fullName || "");
  email && (email.value = a.email || "");
  phone && (phone.value = a.phone || "");

  const cur = inferCurrency();
  const p = membership.planSnapshot || {};

  // hint monto
  amountHint.textContent = p.allowCustomAmount
    ? "Este plan permite monto editable. Escribí el monto que pagaste."
    : "Seleccioná cuotas (si aplica) para sugerir el monto, o escribilo manualmente.";

  // cuotas pendientes
  const pending = installments.filter(x => !isSettledInstallmentStatus(x.status));

  // ✅ UI NUEVA: checkboxes
  if (installmentsBox){
    if (!p.allowPartial || installments.length === 0){
      installmentsBox.innerHTML = `<div class="text-muted">Este plan es pago único (sin cuotas).</div>`;
      installmentsBoxHint && (installmentsBoxHint.textContent = "Podés enviar un pago general.");
    } else if (!pending.length){
      installmentsBox.innerHTML = `<div class="text-muted">No hay cuotas pendientes.</div>`;
      installmentsBoxHint && (installmentsBoxHint.textContent = "Si necesitás adjuntar otro comprobante, enviá un pago general.");
    } else {
      installmentsBox.innerHTML = pending.map(it => {
        const due = it.dueDate || (it.dueMonthDay ? `${membership.season}-${it.dueMonthDay}` : "—");
        const label = `Cuota #${it.n} • vence ${due} • ${fmtMoney(it.amount, cur)}`;
        return `
          <label class="d-flex align-items-start gap-2 p-2 border rounded mb-2" style="cursor:pointer;">
            <input class="form-check-input mt-1" type="checkbox" name="installmentChk" value="${it.id}">
            <span>
              <div class="fw-bold">${label}</div>
              <div class="small text-muted">Estado: ${it.status || "pending"}</div>
            </span>
          </label>
        `;
      }).join("");

      installmentsBoxHint && (installmentsBoxHint.textContent =
        "Podés marcar 1 o varias cuotas. El monto se sugiere como suma (podés editarlo)."
      );
    }
  }

  // fallback UI vieja (si existe)
  if (installmentSelect && installmentHint){
    const options = pending.map(x => {
      const due = x.dueDate || (x.dueMonthDay ? `${membership.season}-${x.dueMonthDay}` : "—");
      const label = `Cuota #${x.n} • vence ${due} • ${fmtMoney(x.amount, cur)} • ${x.status || "pending"}`;
      return `<option value="${x.id}">${label}</option>`;
    }).join("");

    installmentSelect.innerHTML =
      `<option value="">Pago general (sin cuota específica)</option>` +
      (options || "");

    installmentHint.textContent = pending.length
      ? "Podés elegir una cuota pendiente o dejarlo como pago general."
      : "No hay cuotas pendientes (o este plan es pago único). Podés enviar pago general si aplica.";
  }

  // al cambiar selección de cuotas => sugerir monto
  const syncAmountFromSelection = (opts = {}) => {
    const { force = false } = opts;

    const cur = inferCurrency();
    const p = membership?.planSnapshot || {};

    // 1) Si es plan con cuotas:
    if (p.allowPartial && installments.length) {
      const selectedIds = getSelectedInstallmentIdsFromUI();

      // Si hay seleccionadas -> suma exacta de seleccionadas
      if (selectedIds.length) {
        const { total } = sumSelectedInstallments(selectedIds);
        if (force || amount.value === "" || payForm?._autoAmount === true) {
          amount.value = String(total || "");
          payForm._autoAmount = true;
        }
        return;
      }

      // Si NO hay seleccionadas -> sugerimos la PRIMERA cuota pendiente (recomendado)
      const pending = installments.filter(x => !isSettledInstallmentStatus(x.status));
      const first = pending.slice().sort((a,b)=> (a.n||0)-(b.n||0))[0] || null;

      if (first) {
        if (force || amount.value === "" || payForm?._autoAmount === true) {
          amount.value = String(Number(first.amount || 0) || "");
          payForm._autoAmount = true;
        }
        return;
      }

      // No hay cuotas pendientes -> no tocar
      return;
    }

    // 2) Pago único (sin cuotas)
    const totalOneShot =
      (membership?.totalAmount ?? null) ??
      (p.totalAmount ?? null) ??
      null;

    if (totalOneShot !== null && totalOneShot !== undefined) {
      if (force || amount.value === "" || payForm?._autoAmount === true) {
        amount.value = String(Number(totalOneShot) || "");
        payForm._autoAmount = true;
      }
    }
  };

  // listeners (idempotentes por wireOnce)
  payForm && (payForm._syncAmountFromSelection = syncAmountFromSelection);
  payForm && (payForm._autoAmount = true);
  payForm?._syncAmountFromSelection?.({ force: true });
}

/* =========================
   Wire once
========================= */
function wireOnce(){
  if (_wired) return;
  _wired = true;

  // cambio en checkboxes
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input[name="installmentChk"]')) {
      payForm?._syncAmountFromSelection?.({ force: true });
    }
  });

  // fallback: select
  installmentSelect && (installmentSelect.onchange = () => {
    const iid = installmentSelect.value || "";
    if (!iid) return;
    const it = getInstallmentById(iid);
    if (it && it.amount !== undefined && it.amount !== null && amount.value === ""){
      amount.value = String(it.amount);
    }
  });

  btnReset && (btnReset.onclick = () => {
    if (membership?.payLinkEnabled === false) return;

    // desmarcar checkboxes
    document.querySelectorAll('input[name="installmentChk"]').forEach(x => (x.checked = false));

    // reset fallback select
    if (installmentSelect) installmentSelect.value = "";

    amount.value = "";
    method.value = "sinpe";
    fileInput.value = "";
    note.value = "";
    clearProgress();
    hideAlert();
  });

  if (payForm) payForm.onsubmit = onSubmit;
}

/* =========================
   Submit
========================= */
async function onSubmit(e){
  e.preventDefault();
  hideAlert();

  if (membership?.payLinkEnabled === false){
    const reason =
      membership?.payLinkDisabledReason ||
      "Este link está deshabilitado mientras el admin revisa el comprobante.";
    setPayDisabledUI(reason);
    showAlert(reason, "warning");
    return;
  }

  const cur = inferCurrency();
  const p = membership.planSnapshot || {};

  const payer = safe(payerName.value);
  if (!payer) return showAlert("Falta el nombre.", "warning");

  const amt = Number(amount.value);
  if (!amount.value || Number.isNaN(amt) || amt <= 0){
    return showAlert("Monto inválido.", "warning");
  }

  const f = fileInput.files?.[0];
  if (!f) return showAlert("Adjuntá un comprobante (imagen o PDF).", "warning");

  const okType = f.type.startsWith("image/") || f.type === "application/pdf";
  if (!okType) return showAlert("Tipo de archivo no permitido. Usá imagen o PDF.", "warning");

  const MAX_MB = 10;
  if (f.size > MAX_MB * 1024 * 1024){
    return showAlert(`Archivo muy grande. Máximo ${MAX_MB}MB.`, "warning");
  }

  btnSubmit.disabled = true;
  disableForm(true);
  clearProgress();
  setProgress(5, "Preparando subida…");

  let sid = null;
  let path = null;

  try{
    // ✅ cuotas seleccionadas
    const selectedInstallmentIds = getSelectedInstallmentIdsFromUI();
    const installmentIdCompat = selectedInstallmentIds.length === 1 ? selectedInstallmentIds[0] : null;

    const auth = getAuth();
    const uid = auth.currentUser?.uid;

    if (!uid) {
      throw Object.assign(new Error("not_authenticated"), { code: "auth/not-authenticated" });
    }

    // 1) Crear submission (para usar sid en path)
    const submissionDoc = await addDoc(collection(db, COL_SUBMISSIONS), {
      membershipId: mid,
      userId: uid,
      // compat + multi
      installmentId: installmentIdCompat,
      selectedInstallmentIds: selectedInstallmentIds.length ? selectedInstallmentIds : [],

      season: membership.season || null,
      planId: membership.planId || (p.id || null),

      payerName: payer,
      email: safe(email.value) || null,
      phone: safe(phone.value) || null,
      amountReported: amt,
      currency: cur,

      method: method.value || "other",
      note: safe(note.value) || null,

      status: "pending",
      adminNote: null,

      fileUrl: null,
      filePath: null,
      fileType: f.type || null,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    sid = submissionDoc.id;

    // 2) Upload storage
    const storage = getStorage();
    const safeName = (f.name || "comprobante").replace(/[^\w.\-()]+/g, "_");
    path = `membership_submissions/${mid}/${sid}/${Date.now()}_${safeName}`;
    const fileRef = sRef(storage, path);

    const task = uploadBytesResumable(fileRef, f, { contentType: f.type || undefined });

    await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setProgress(Math.max(10, Math.min(90, pct)), `Subiendo… ${pct}%`);
        },
        (err) => reject(err),
        () => resolve()
      );
    });

    setProgress(92, "Finalizando…");

    const url = await getDownloadURL(fileRef);

    // 3) Save url/path
    await setDoc(doc(db, COL_SUBMISSIONS, sid), {
      fileUrl: url,
      filePath: path,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 4) ✅ Bloquear link + marcar membership como submitted (para lista "Validando")
    try{
      const currStatus = (membership?.status || "pending").toLowerCase();
      const nextStatus =
        (currStatus === "pending" || currStatus === "partial") ? "submitted" : currStatus;

      await updateDoc(doc(db, COL_MEMBERSHIPS, mid), {
        status: nextStatus,
        payLinkEnabled: false,
        payLinkDisabledReason: "Comprobante enviado. En revisión por el admin.",
        lastPaymentSubmissionId: sid,
        lastPaymentAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      // rollup se mantiene actualizado aunque el admin no haya abierto detalle
      try { await recomputeMembershipRollup(mid); } catch (_) {}

      membership.status = nextStatus;
      membership.payLinkEnabled = false;
      membership.payLinkDisabledReason = "Comprobante enviado. En revisión por el admin.";

      setProgress(100, "✅ Enviado");
      showAlert("✅ Comprobante enviado. Un admin lo revisará pronto.", "success");
      setPayDisabledUI(membership.payLinkDisabledReason);
      return;

    }catch (e){
      console.warn("No se pudo bloquear el link automáticamente (rules).", e?.code || e);
    }

    setProgress(100, "✅ Enviado");
    showAlert("✅ Comprobante enviado. Un admin lo revisará pronto.", "success");

    // limpiar (dejamos contacto)
    document.querySelectorAll('input[name="installmentChk"]').forEach(x => (x.checked = false));
    if (installmentSelect) installmentSelect.value = "";
    amount.value = "";
    fileInput.value = "";
    note.value = "";

  } catch (err){
    console.error(err);

    const code = err?.code || "";
    const msg =
      code === "auth/not-authenticated"
        ? "❌ No se pudo autenticar (sesión anónima). Recargá el link e intentá de nuevo."
      : code === "permission-denied"
        ? "❌ Permisos insuficientes (Firestore Rules)."
      : code === "storage/unauthorized"
        ? "❌ No tenés permiso para subir el archivo. (Revisá Storage Rules y Auth anónimo)."
      : code === "storage/retry-limit-exceeded"
        ? "❌ Falló la subida (reintentos agotados). Probá con otra red o un archivo más liviano."
      : code === "storage/canceled"
        ? "❌ Subida cancelada."
      : code === "storage/invalid-checksum"
        ? "❌ El archivo se corrompió al subir. Intentá otra vez."
      : "❌ Ocurrió un error subiendo el comprobante. Intentá de nuevo o contactá al club.";

    showAlert(msg, "danger");
    clearProgress();

    // marcar submission como error si existe
    if (sid){
      try{
        await setDoc(doc(db, COL_SUBMISSIONS, sid), {
          status: "error",
          adminNote: `Upload error: ${code || (err?.message || "unknown")}`,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }catch (e){
        console.warn("No se pudo marcar submission como error:", e);
      }
    }

  } finally {
    if (membership?.payLinkEnabled === false){
      btnSubmit.disabled = true;
      disableForm(true);
    } else {
      btnSubmit.disabled = false;
      disableForm(false);
    }
  }
}
