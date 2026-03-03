// js/features/payment_modal.js
import { db } from "../auth/firebase.js";
import {
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { showLoader, hideLoader } from "../ui/loader.js";

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

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Open modal
   * @param {Object} opts
   * @param {string} opts.collectionPath - e.g. "tournaments/<id>/roster"
   * @param {string} opts.docId - e.g. playerRosterDocId
   * @param {string} opts.title
   * @param {string} opts.subtitle
   * @param {number|string} opts.suggestedAmount
   * @param {(ctx)=>void} opts.onSaved
   */
  function open(opts = {}) {
    const {
      collectionPath,
      docId,
      title,
      subtitle,
      suggestedAmount,
      onSaved
    } = opts;

    el.payPath.value = collectionPath || "";
    el.payDocId.value = docId || "";

    if (el.title) el.title.textContent = title || "Agregar pago";
    if (el.subtitle) el.subtitle.textContent = subtitle || "—";

    el.amount.value = suggestedAmount != null ? String(suggestedAmount) : "";
    el.date.value = todayISO();
    el.method.value = "sinpe";
    el.note.value = "";

    _onSaved = typeof onSaved === "function" ? onSaved : null;

    modal?.show();
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const collectionPath = (el.payPath.value || "").trim();
    const docId = (el.payDocId.value || "").trim();

    if (!collectionPath || !docId) {
      alert("Falta el destino del pago.");
      return;
    }

    const amount = Number(el.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Monto inválido.");
      return;
    }

    const date = (el.date.value || "").trim();
    if (!date) {
      alert("Fecha requerida.");
      return;
    }

    const payment = {
      amount,
      date,
      method: el.method.value || "sinpe",
      note: (el.note.value || "").trim()
    };

    showLoader();
    try {
      // collectionPath ejemplo: "tournaments/<id>/roster"
      const parts = collectionPath.split("/").filter(Boolean);
      const ref = doc(db, ...parts, docId);

      await updateDoc(ref, {
        payments: arrayUnion(payment),
        updatedAt: serverTimestamp()
      });

      modal?.hide();
      _onSaved?.({ collectionPath, docId, payment });
    } catch (err) {
      console.error(err);
      alert("Error guardando pago.");
    } finally {
      hideLoader();
    }
  });

  return { open };
}

/* helpers opcionales */
export function sumPayments(payments) {
  const list = Array.isArray(payments) ? payments : [];
  return list.reduce((acc, p) => acc + (Number(p?.amount) || 0), 0);
}
