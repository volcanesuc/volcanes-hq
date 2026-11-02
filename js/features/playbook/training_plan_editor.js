// /js/features/playbook/training_plan_editor.js
import { db } from "../../auth/firebase.js";
import { showLoader, hideLoader } from "../../ui/loader.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX } from "/js/strings/screens/training_plan_editor.js";

const TRAININGS_COL = "playbook_trainings";
const DRILLS_COL = "drills";

function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

export function createTrainingEditor() {
  const modalEl = $("trainingEditorModal");
  if (!modalEl) throw new Error(TX.faltaTrainingeditormodalPartialNo);

  const modal = new bootstrap.Modal(modalEl);

  const titleEl = $("trainingEditorTitle");
  const hintEl = $("trainingEditorHint");
  const errEl = $("trainingEditorError");

  const formEl = $("trainingEditorForm");
  const saveBtn = $("teSaveBtn");

  const teName = $("teName");
  const teNotes = $("teNotes");
  const teIsPublic = $("teIsPublic");

  const teDrillSearch = $("teDrillSearch");
  const teDrillResults = $("teDrillResults");
  const teDrillResultsEmpty = $("teDrillResultsEmpty");

  const teSelectedDrills = $("teSelectedDrills");
  const teSelectedEmpty = $("teSelectedEmpty");
  const teSelectedCount = $("teSelectedCount");

  let _mode = "new"; // new | edit
  let _id = null;

  let allDrills = [];
  let selectedIds = [];

  function setError(msg) {
    if (!errEl) return;
    if (!msg) {
      errEl.classList.add("d-none");
      errEl.textContent = "";
      return;
    }
    errEl.textContent = msg;
    errEl.classList.remove("d-none");
  }

  async function loadAllDrills() {
    const snap = await getDocs(collection(db, DRILLS_COL));

    allDrills = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .map(d => ({
        id: d.id,
        name: (d.name || "").trim(),
        author: (d.authorName || d.author || "").trim(),
        objective: (d.objective || "").trim(),
        isPublic: d.isPublic === true,
        isActive: d.isActive !== false,
        archived: d.archived === true
      }))
      .filter(d => !d.archived && d.isActive && d.name)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
  }

  function renderResults() {
    const q = norm(teDrillSearch?.value);
    let list = allDrills;

    if (q) {
      list = list.filter(d =>
        `${d.name} ${d.author} ${d.objective}`.toLowerCase().includes(q)
      );
    }

    const selectedSet = new Set(selectedIds);
    list = list.filter(d => !selectedSet.has(d.id));

    if (teDrillResults) {
      teDrillResults.innerHTML = list.length
        ? list.map(d => `
            <button
              type="button"
              class="list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-3"
              data-add-drill="${escapeHtml(d.id)}"
            >
              <div class="text-start">
                <div class="fw-semibold">${escapeHtml(d.name)}</div>
                <div class="text-muted small">
                  ${escapeHtml(d.objective || TX.sinDescripcion)}
                </div>
                <div class="text-muted small">
                  ${escapeHtml(d.author || "—")}${d.isPublic ? TX.publico : ""}
                </div>
              </div>
              <span class="btn btn-sm btn-outline-primary flex-shrink-0">${TX.agregar}</span>
            </button>
          `).join("")
        : "";

      teDrillResultsEmpty?.classList.toggle("d-none", list.length > 0);
    }

    teDrillResults?.querySelectorAll("[data-add-drill]")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-add-drill");
        if (!id) return;
        selectedIds.push(id);
        renderSelected();
        renderResults();
      });
    });
  }

  function renderSelected() {
    const map = new Map(allDrills.map(d => [d.id, d]));
    const list = selectedIds.map(id => map.get(id)).filter(Boolean);

    if (teSelectedCount) teSelectedCount.textContent = String(list.length);

    if (teSelectedDrills) {
      teSelectedDrills.innerHTML = list.length
        ? list.map((d, idx) => `
          <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
            <div class="flex-grow-1">
              <div class="fw-semibold">${escapeHtml(d.name)}</div>
              <div class="text-muted small">${escapeHtml(d.objective || TX.sinDescripcion)}</div>
              <div class="text-muted small">${escapeHtml(d.author || "—")}${d.isPublic ? TX.publico : ""}</div>
            </div>

            <div class="d-flex gap-1 flex-shrink-0">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                title="${TX.subir}"
                data-up="${escapeHtml(d.id)}"
                ${idx === 0 ? "disabled" : ""}
              >
                ↑
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                title="${TX.bajar}"
                data-down="${escapeHtml(d.id)}"
                ${idx === list.length - 1 ? "disabled" : ""}
              >
                ↓
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                title="${TX.quitar}"
                data-remove="${escapeHtml(d.id)}"
              >
                ✕
              </button>
            </div>
          </div>
        `).join("")
        : "";
    }

    teSelectedEmpty?.classList.toggle("d-none", list.length > 0);

    teSelectedDrills?.querySelectorAll("[data-remove]")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove");
        selectedIds = selectedIds.filter(x => x !== id);
        renderSelected();
        renderResults();
      });
    });

    teSelectedDrills?.querySelectorAll("[data-up]")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-up");
        const i = selectedIds.indexOf(id);
        if (i > 0) {
          [selectedIds[i - 1], selectedIds[i]] = [selectedIds[i], selectedIds[i - 1]];
          renderSelected();
        }
      });
    });

    teSelectedDrills?.querySelectorAll("[data-down]")?.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-down");
        const i = selectedIds.indexOf(id);
        if (i >= 0 && i < selectedIds.length - 1) {
          [selectedIds[i], selectedIds[i + 1]] = [selectedIds[i + 1], selectedIds[i]];
          renderSelected();
        }
      });
    });
  }

  async function openNew() {
    _mode = "new";
    _id = null;
    setError("");

    if (titleEl) titleEl.textContent = TX.crearTemplateDeEntrenamiento;
    if (hintEl) hintEl.textContent = TX.elegiLosDrillsY;

    formEl?.reset?.();

    selectedIds = [];
    if (teIsPublic) teIsPublic.checked = true;

    showLoader();
    try {
      await loadAllDrills();
      renderSelected();
      renderResults();
      modal.show();
    } finally {
      hideLoader();
    }
  }

  async function openEditById(id) {
    _mode = "edit";
    _id = id;
    setError("");

    if (titleEl) titleEl.textContent = TX.editarTemplateDeEntrenamiento;
    if (hintEl) hintEl.textContent = TX.modificaNombreVisibilidadY;

    showLoader();
    try {
      await loadAllDrills();

      const snap = await getDoc(doc(db, TRAININGS_COL, id));
      if (!snap.exists()) throw new Error(TX.noSeEncontroEl);

      const t = snap.data() || {};

      if (teName) teName.value = t.name || "";
      if (teNotes) teNotes.value = t.notes || "";
      if (teIsPublic) teIsPublic.checked = t.isPublic === true;

      if (Array.isArray(t.drillRefs) && t.drillRefs.length) {
        selectedIds = t.drillRefs
          .slice()
          .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0))
          .map(x => String(x?.drillId || "").trim())
          .filter(Boolean);
      } else if (Array.isArray(t.drillIds)) {
        selectedIds = [...t.drillIds];
      } else {
        selectedIds = [];
      }

      renderSelected();
      renderResults();

      modal.show();
    } catch (e) {
      console.error(e);
      setError(e?.message || TX.errorAbriendoEditor);
    } finally {
      hideLoader();
    }
  }

  async function save() {
    setError("");

    const name = (teName?.value || "").trim();
    const notes = (teNotes?.value || "").trim();
    const isPublic = teIsPublic?.checked === true;

    if (!name) return setError(TX.nombreRequerido);

    const drillRefs = selectedIds.map((drillId, idx) => ({
      drillId,
      order: idx + 1
    }));

    const payload = {
      name,
      notes: notes || "",
      isPublic,
      drillIds: [...selectedIds],
      drillRefs,
      updatedAt: serverTimestamp()
    };

    showLoader();
    try {
      let id = _id;

      if (_mode === "new") {
        id = doc(collection(db, TRAININGS_COL)).id;
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, TRAININGS_COL, id), payload, { merge: true });

      window.dispatchEvent(new CustomEvent("playbookTraining:changed", {
        detail: { id }
      }));

      modal.hide();
    } catch (e) {
      console.error(e);
      setError(TX.errorGuardandoVerConsola);
    } finally {
      hideLoader();
    }
  }

  saveBtn?.addEventListener("click", save);
  teDrillSearch?.addEventListener("input", renderResults);

  return {
    openNew,
    openEditById
  };
}