// /js/features/membership_pay.js
import { db } from "../auth/firebase.js";

import {
  doc,
  getDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getStorage,
  ref as sRef,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { TX, txf } from "/js/strings/screens/membership_pay.js";

/* =========================
   Collections
========================= */
const COL_PUBLIC_LINKS = "membership_payment_links";
const COL_PUBLIC_SUBMISSIONS = "public_membership_payment_submissions";

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

const installmentsBox = document.getElementById("installmentsBox");
const installmentsBoxHint = document.getElementById("installmentsBoxHint");

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
let paymentLink = null;
let installments = [];
let _wired = false;

/* =========================
   Helpers
========================= */
function showAlert(msg, type = "warning") {
  if (!alertBox) return alert(msg);
  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = msg;
  alertBox.classList.remove("d-none");
}

function hideAlert() {
  alertBox?.classList.add("d-none");
}

function disableForm(disabled = true) {
  if (!payForm) return;
  if (disabled) payForm.classList.add("disabled-overlay");
  else payForm.classList.remove("disabled-overlay");
}

function fmtMoney(n, cur = "CRC") {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0
  }).format(v);
}

function safe(s) {
  return (s || "").toString().trim();
}

function buildDisplayName(firstName, lastName) {
  return [safe(firstName), safe(lastName)].filter(Boolean).join(" ").trim();
}

function getSnapshotDisplayName(snapshot = {}) {
  const firstName = snapshot?.firstName ?? "";
  const lastName = snapshot?.lastName ?? "";
  const joined = buildDisplayName(firstName, lastName);

  return (
    joined ||
    safe(snapshot?.displayName) ||
    safe(snapshot?.name) ||
    "—"
  );
}

function setProgress(pct, text) {
  progressWrap?.classList.remove("d-none");
  progressText?.classList.remove("d-none");
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressText) progressText.textContent = text || "";
}

function clearProgress() {
  progressWrap?.classList.add("d-none");
  progressText?.classList.add("d-none");
  if (progressBar) progressBar.style.width = "0%";
  if (progressText) progressText.textContent = "";
}

function inferCurrency() {
  return paymentLink?.plan?.currency || "CRC";
}

function isSettledInstallmentStatus(st) {
  const s = (st || "pending").toString().toLowerCase();
  return s === "validated" || s === "paid";
}

function getInstallmentKey(it, idx = 0) {
  if (it?.n !== undefined && it?.n !== null) return String(it.n);
  return String(idx + 1);
}

function getInstallmentByKey(key) {
  return installments.find((x, idx) => getInstallmentKey(x, idx) === String(key)) || null;
}

function getMemberSnapshot() {
  return paymentLink?.member || {};
}

function getSelectedInstallmentKeysFromUI() {
  const checked = [...document.querySelectorAll('input[name="installmentChk"]:checked')]
    .map((x) => x.value)
    .filter(Boolean);

  if (checked.length) return checked;

  const one = installmentSelect?.value || "";
  return one ? [one] : [];
}

function getSelectedInstallmentNsFromUI() {
  return getSelectedInstallmentKeysFromUI()
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
}

function sumSelectedInstallments(keys) {
  const cur = inferCurrency();
  let total = 0;

  for (const key of keys) {
    const it = getInstallmentByKey(key);
    if (it) total += Number(it.amount || 0);
  }

  return { total, cur };
}

function setPayDisabledUI(msg) {
  payForm?.classList.add("d-none");
  payDisabledCard?.classList.remove("d-none");
  if (payDisabledMsg) payDisabledMsg.textContent = msg || "";

  if (btnSubmit) btnSubmit.disabled = true;
  disableForm(true);

  if (pagePill) pagePill.textContent = TX.enRevision;
}

/* =========================
   Boot
========================= */
(async function boot() {
  if (midText) midText.textContent = mid || "—";

  if (!mid || !code) {
    if (pagePill) pagePill.textContent = TX.linkInvalido;
    disableForm(true);
    showAlert(TX.linkInvalidoAsegurateDe, "danger");
    return;
  }

  if (pagePill) pagePill.textContent = TX.cargando;
  disableForm(true);

  try {
    await loadPaymentLink();

    if (paymentLink?.enabled === false) {
      fillSummaryOnly();
      const reason =
        paymentLink?.disabledReason ||
        TX.esteLinkEstaDeshabilitado;
      setPayDisabledUI(reason);
      showAlert(reason, "warning");
      return;
    }

    fillUI();
    wireOnce();
    disableForm(false);
    if (pagePill) pagePill.textContent = TX.listo;
  } catch (e) {
    console.error(e);
    if (pagePill) pagePill.textContent = TX.noDisponible;
    disableForm(true);

    if (String(e?.message || e).includes("invalid_code")) {
      showAlert(TX.codigoInvalido, "danger");
    } else if (String(e?.message || e).includes("link_disabled")) {
      showAlert(TX.esteLinkEstaDeshabilitado2, "warning");
    } else {
      showAlert(TX.noSePudoCargar, "danger");
    }
  }
})();

/* =========================
   Load data
========================= */
async function loadPaymentLink() {
  const snap = await getDoc(doc(db, COL_PUBLIC_LINKS, mid));
  if (!snap.exists()) throw new Error("payment_link_not_found");

  paymentLink = { id: snap.id, ...snap.data() };

  if ((paymentLink.code || "") !== code) {
    throw new Error("invalid_code");
  }

  if (paymentLink.enabled === false) {
    throw new Error("link_disabled");
  }

  installments = Array.isArray(paymentLink.installments)
    ? paymentLink.installments.slice().sort((a, b) => (a.n || 0) - (b.n || 0))
    : [];
}

/* =========================
   UI fill
========================= */
function fillSummaryOnly() {
  hideAlert();

  const a = getMemberSnapshot();
  const p = paymentLink?.plan || {};
  const cur = inferCurrency();

  if (assocName) assocName.textContent = getSnapshotDisplayName(a);
  if (assocContact) assocContact.textContent = [a.email || null, a.phone || null].filter(Boolean).join(" • ") || "—";

  if (planName) planName.textContent = p.name || "—";

  const totalTxt = p.allowCustomAmount ? TX.montoEditable : fmtMoney(p.totalAmount, cur);
  if (planMeta) {
    planMeta.textContent = `${totalTxt} • ${p.allowPartial ? TX.permiteCuotas : TX.pagoUnico} • ${p.requiresValidation ? TX.validacionAdmin : TX.sinValidacion}`;
  }
}

function fillUI() {
  fillSummaryOnly();

  const a = getMemberSnapshot();
  const p = paymentLink?.plan || {};
  const cur = inferCurrency();

  if (payerName) payerName.value = getSnapshotDisplayName(a) === "—" ? "" : getSnapshotDisplayName(a);
  if (email) email.value = a.email || "";
  if (phone) phone.value = a.phone || "";

  if (amountHint) {
    amountHint.textContent = p.allowCustomAmount
      ? TX.estePlanPermiteMonto
      : TX.seleccionaCuotasSiAplica;
  }

  const pending = installments.filter((x) => !isSettledInstallmentStatus(x.status));

  if (installmentsBox) {
    if (!p.allowPartial || installments.length === 0) {
      installmentsBox.innerHTML = `<div class="text-muted">${TX.estePlanEsPago}</div>`;
      if (installmentsBoxHint) installmentsBoxHint.textContent = TX.podesEnviarUnPago;
    } else if (!pending.length) {
      installmentsBox.innerHTML = `<div class="text-muted">${TX.noHayCuotasPendientes}</div>`;
      if (installmentsBoxHint) installmentsBoxHint.textContent = TX.siNecesitasAdjuntarOtro;
    } else {
      installmentsBox.innerHTML = pending.map((it, idx) => {
        const due = it.dueDate || (it.dueMonthDay ? `${paymentLink.season}-${it.dueMonthDay}` : "—");
        const key = getInstallmentKey(it, idx);
        const label = txf(TX.cuotaVence, { key: it.n ?? key, due, cur: fmtMoney(it.amount, cur) });

        return `
          <label class="d-flex align-items-start gap-2 p-2 border rounded mb-2" style="cursor:pointer;">
            <input class="form-check-input mt-1" type="checkbox" name="installmentChk" value="${key}">
            <span>
              <div class="fw-bold">${label}</div>
              <div class="small text-muted">${txf(TX.estado, { value: it.status || "pending" })}</div>
            </span>
          </label>
        `;
      }).join("");

      if (installmentsBoxHint) {
        installmentsBoxHint.textContent = TX.podesMarcar1O;
      }
    }
  }

  if (installmentSelect && installmentHint) {
    const options = pending.map((x, idx) => {
      const due = x.dueDate || (x.dueMonthDay ? `${paymentLink.season}-${x.dueMonthDay}` : "—");
      const key = getInstallmentKey(x, idx);
      const label = txf(TX.cuotaVence2, { key: x.n ?? key, due, cur: fmtMoney(x.amount, cur), value: x.status || "pending" });
      return `<option value="${key}">${label}</option>`;
    }).join("");

    installmentSelect.innerHTML =
      `<option value="">${TX.pagoGeneralSinCuota}</option>` +
      (options || "");

    installmentHint.textContent = pending.length
      ? TX.podesElegirUnaCuota
      : TX.noHayCuotasPendientes2;
  }

  const syncAmountFromSelection = (opts = {}) => {
    const { force = false } = opts;

    if (p.allowPartial && installments.length) {
      const selectedKeys = getSelectedInstallmentKeysFromUI();

      if (selectedKeys.length) {
        const { total } = sumSelectedInstallments(selectedKeys);
        if (force || amount.value === "" || payForm?._autoAmount === true) {
          amount.value = String(total || "");
          payForm._autoAmount = true;
        }
        return;
      }

      const first = pending
        .slice()
        .sort((a, b) => (a.n || 0) - (b.n || 0))[0] || null;

      if (first) {
        if (force || amount.value === "" || payForm?._autoAmount === true) {
          amount.value = String(Number(first.amount || 0) || "");
          payForm._autoAmount = true;
        }
        return;
      }
    }

    const totalOneShot = p.totalAmount ?? null;
    if (totalOneShot !== null && totalOneShot !== undefined) {
      if (force || amount.value === "" || payForm?._autoAmount === true) {
        amount.value = String(Number(totalOneShot) || "");
        payForm._autoAmount = true;
      }
    }
  };

  if (payForm) {
    payForm._syncAmountFromSelection = syncAmountFromSelection;
    payForm._autoAmount = true;
  }

  payForm?._syncAmountFromSelection?.({ force: true });
}

/* =========================
   Wire once
========================= */
function wireOnce() {
  if (_wired) return;
  _wired = true;

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input[name="installmentChk"]')) {
      payForm?._syncAmountFromSelection?.({ force: true });
    }
  });

  if (installmentSelect) {
    installmentSelect.onchange = () => {
      const key = installmentSelect.value || "";
      if (!key) return;
      const it = getInstallmentByKey(key);
      if (it && it.amount !== undefined && it.amount !== null && amount.value === "") {
        amount.value = String(it.amount);
      }
    };
  }

  if (btnReset) {
    btnReset.onclick = () => {
      if (paymentLink?.enabled === false) return;

      document.querySelectorAll('input[name="installmentChk"]').forEach((x) => {
        x.checked = false;
      });

      if (installmentSelect) installmentSelect.value = "";

      amount.value = "";
      method.value = "sinpe";
      fileInput.value = "";
      note.value = "";
      clearProgress();
      hideAlert();
    };
  }

  if (payForm) payForm.onsubmit = onSubmit;
}

/* =========================
   Submit
========================= */
async function onSubmit(e) {
  e.preventDefault();
  hideAlert();

  if (paymentLink?.enabled === false) {
    const reason =
      paymentLink?.disabledReason ||
      TX.esteLinkEstaDeshabilitado;
    setPayDisabledUI(reason);
    showAlert(reason, "warning");
    return;
  }

  const cur = inferCurrency();
  const p = paymentLink?.plan || {};

  const payer = safe(payerName.value);
  if (!payer) return showAlert(TX.faltaElNombre, "warning");

  const amt = Number(amount.value);
  if (!amount.value || Number.isNaN(amt) || amt <= 0) {
    return showAlert(TX.montoInvalido, "warning");
  }

  const f = fileInput.files?.[0];
  if (!f) return showAlert(TX.adjuntaUnComprobanteImagen, "warning");

  const okType = f.type.startsWith("image/") || f.type === "application/pdf";
  if (!okType) return showAlert(TX.tipoDeArchivoNo, "warning");

  const MAX_MB = 10;
  if (f.size > MAX_MB * 1024 * 1024) {
    return showAlert(txf(TX.archivoMuyGrandeMaximo, { MAX_MB }), "warning");
  }

  btnSubmit.disabled = true;
  disableForm(true);
  clearProgress();
  setProgress(5, TX.preparandoSubida);

  try {
    const selectedInstallmentNs = getSelectedInstallmentNsFromUI();

    const storage = getStorage();
    const safeName = (f.name || "comprobante").replace(/[^\w.\-()]+/g, "_");
    const path = `membership_public_uploads/${mid}/${Date.now()}_${safeName}`;
    const fileRef = sRef(storage, path);

    const task = uploadBytesResumable(fileRef, f, { contentType: f.type || undefined });

    await new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          setProgress(Math.max(10, Math.min(90, pct)), txf(TX.subiendo, { pct }));
        },
        (err) => reject(err),
        () => resolve()
      );
    });

    setProgress(92, TX.finalizando);

    const url = await getDownloadURL(fileRef);

    await addDoc(collection(db, COL_PUBLIC_SUBMISSIONS), {
      membershipId: mid,
      code: code,

      season: paymentLink?.season || null,
      planId: p.id || null,

      payerName: payer,
      email: safe(email.value) || null,
      phone: safe(phone.value) || null,
      amountReported: amt,
      currency: cur,

      method: method.value || "other",
      note: safe(note.value) || null,
      selectedInstallmentNs: selectedInstallmentNs.length ? selectedInstallmentNs : [],

      fileUrl: url,
      filePath: path,
      fileType: f.type || "application/octet-stream",

      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    setProgress(100, TX.enviado);
    showAlert(TX.comprobanteEnviadoUnAdmin, "success");

    document.querySelectorAll('input[name="installmentChk"]').forEach((x) => {
      x.checked = false;
    });
    if (installmentSelect) installmentSelect.value = "";
    amount.value = "";
    fileInput.value = "";
    note.value = "";
  } catch (err) {
    console.error(err);

    const errCode = err?.code || "";
    const msg =
      errCode === "permission-denied"
        ? TX.permisosInsuficientesFirestoreRules
        : errCode === "storage/unauthorized"
          ? TX.noTenesPermisoPara
          : errCode === "storage/retry-limit-exceeded"
            ? TX.falloLaSubidaProba
            : errCode === "storage/canceled"
              ? TX.subidaCancelada
              : errCode === "storage/invalid-checksum"
                ? TX.elArchivoSeCorrompio
                : TX.ocurrioUnErrorSubiendo;

    showAlert(msg, "danger");
    clearProgress();
  } finally {
    btnSubmit.disabled = false;
    disableForm(false);
  }
}