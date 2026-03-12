// /js/features/payment_modal.js
import { db } from "../auth/firebase.js";
import {
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { showLoader, hideLoader } from "../ui/loader.js";

function clean(v) {
  return (v || "").toString().trim();
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeMethod(v) {
  const value = clean(v).toLowerCase();
  return value || "sinpe";
}

export function createPaymentModal() {
  const modalEl = document.getElementById("paymentModal");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  const form = document.getElementById("paymentForm");

  const el = {
    payPath: document.getElementById("payPath"),
    payDocId: document.getElementById("payDocId"),
    title: document.getElementById("payTitle"),
    subtitle: document.getElementById("paySubtitle"),
    amount: document.getElementById("payAmount"),
    date: document.getElementById("payDate"),
    method: document.getElementById("payMethod"),
    note: document.getElementById("payNote")
  };

  let _onSaved = null;
  let _extraPaymentData = {};

  function resetForm() {
    if (el.payPath) el.payPath.value = "";
    if (el.payDocId) el.payDocId.value = "";
    if (el.amount) el.amount.value = "";
    if (el.date) el.date.value = todayISO();
    if (el.method) el.method.value = "sinpe";
    if (el.note) el.note.value = "";
    _onSaved = null;
    _extraPaymentData = {};
  }

  /**
   * Open modal
   * @param {Object} opts
   * @param {string} opts.collectionPath - e.g. "tournaments/<id>/roster"
   * @param {string} opts.docId - e.g. playerRosterDocId
   * @param {string} opts.title
   * @param {string} opts.subtitle
   * @param {number|string} opts.suggestedAmount
   * @param {Object} opts.extraPaymentData - campos extra a mergear en payment
   * @param {(ctx)=>void} opts.onSaved
   */
  function open(opts = {}) {
    const {
      collectionPath,
      docId,
      title,
      subtitle,
      suggestedAmount,
      extraPaymentData,
      onSaved
    } = opts;

    if (!modal) {
      console.warn("[payment_modal] paymentModal no existe en el DOM");
      return;
    }

    if (el.payPath) el.payPath.value = collectionPath || "";
    if (el.payDocId) el.payDocId.value = docId || "";

    if (el.title) el.title.textContent = title || "Agregar pago";
    if (el.subtitle) el.subtitle.textContent = subtitle || "—";

    if (el.amount) {
      el.amount.value =
        suggestedAmount !== null && suggestedAmount !== undefined
          ? String(suggestedAmount)
          : "";
    }

    if (el.date) el.date.value = todayISO();
    if (el.method) el.method.value = "sinpe";
    if (el.note) el.note.value = "";

    _extraPaymentData = extraPaymentData && typeof extraPaymentData === "object"
      ? { ...extraPaymentData }
      : {};

    _onSaved = typeof onSaved === "function" ? onSaved : null;

    modal.show();
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const collectionPath = clean(el.payPath?.value);
    const docId = clean(el.payDocId?.value);

    if (!collectionPath || !docId) {
      alert("Falta el destino del pago.");
      return;
    }

    const amount = Number(el.amount?.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Monto inválido.");
      return;
    }

    const date = clean(el.date?.value);
    if (!date) {
      alert("Fecha requerida.");
      return;
    }

    const payment = {
      amount,
      date,
      method: safeMethod(el.method?.value),
      note: clean(el.note?.value) || null,
      createdAt: new Date().toISOString(),
      ..._extraPaymentData
    };

    showLoader("Guardando pago…");
    try {
      const parts = collectionPath.split("/").filter(Boolean);
      const ref = doc(db, ...parts, docId);

      await updateDoc(ref, {
        payments: arrayUnion(payment),
        updatedAt: serverTimestamp()
      });

      modal?.hide();
      _onSaved?.({ collectionPath, docId, payment });
      resetForm();
    } catch (err) {
      console.error(err);
      alert("Error guardando pago.");
    } finally {
      hideLoader();
    }
  });

  modalEl?.addEventListener("hidden.bs.modal", () => {
    resetForm();
  });

  return { open };
}

/* helpers opcionales */
export function sumPayments(payments) {
  const list = Array.isArray(payments) ? payments : [];
  return list.reduce((acc, p) => acc + (Number(p?.amount) || 0), 0);
}