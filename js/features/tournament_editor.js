// js/features/tournament_editor.js
import { db } from "../auth/firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  collection
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { APP_CONFIG } from "../config/config.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { TOURNAMENT_STRINGS } from "../strings.js";

const S = TOURNAMENT_STRINGS;
const TOURNAMENTS_COL = APP_CONFIG?.club?.tournamentsCollection || "tournaments";

/* =========================================================
   TOURNAMENT EDITOR (MODAL)
========================================================= */
export function createTournamentEditor() {
  const modalEl = document.getElementById("tournamentModal");
  const modal = modalEl ? new bootstrap.Modal(modalEl) : null;

  const form = document.getElementById("tournamentForm");
  const deleteBtn = document.getElementById("deleteTournamentBtn");

  const f = {
    id: document.getElementById("tournamentId"),
    name: document.getElementById("tournamentName"),
    dateStart: document.getElementById("dateStart"),
    dateEnd: document.getElementById("dateEnd"),
    type: document.getElementById("type"),
    age: document.getElementById("age"),
    venue: document.getElementById("venue"),
    location: document.getElementById("location"),
    officialUrl: document.getElementById("officialUrl"), // ✅ NUEVO
    teamFee: document.getElementById("teamFee"),
    playerFee: document.getElementById("playerFee"),
    notes: document.getElementById("notes"),
    confirmed: document.getElementById("confirmed"),

    title: document.getElementById("tournamentModalTitle"),
    subtitle: document.getElementById("tournamentModalSubtitle"),

    lblName: document.getElementById("lblName"),
    lblDateStart: document.getElementById("lblDateStart"),
    lblDateEnd: document.getElementById("lblDateEnd"),
    lblType: document.getElementById("lblType"),
    lblAge: document.getElementById("lblAge"),
    lblVenue: document.getElementById("lblVenue"),
    lblLocation: document.getElementById("lblLocation"),
    // lblOfficialUrl: opcional si lo agregás a strings/html
    lblTeamFee: document.getElementById("lblTeamFee"),
    lblPlayerFee: document.getElementById("lblPlayerFee"),
    lblNotes: document.getElementById("lblNotes"),
    lblConfirmed: document.getElementById("lblConfirmed"),

    btnCancel: document.getElementById("btnCancel"),
    btnSave: document.getElementById("btnSave")
  };

  applyStrings(f, deleteBtn);

  /* ==========================
     FORM HELPERS
  ========================== */
  function clearForm() {
    f.id.value = "";
    f.name.value = "";
    f.dateStart.value = "";
    f.dateEnd.value = "";
    f.type.value = "mixto";
    f.age.value = "open";
    f.venue.value = "outdoor";
    f.location.value = "";
    if (f.officialUrl) f.officialUrl.value = ""; // ✅ NUEVO
    f.teamFee.value = "";
    f.playerFee.value = "";
    f.notes.value = "";
    f.confirmed.checked = false;
  }

  function fillFormFromTournament(t) {
    f.id.value = t.id;
    f.name.value = t.name || "";
    f.dateStart.value = t.dateStart || "";
    f.dateEnd.value = t.dateEnd || "";
    f.type.value = t.type || "mixto";
    f.age.value = t.age || "open";
    f.venue.value = t.venue || "outdoor";
    f.location.value = t.location || "";
    if (f.officialUrl) f.officialUrl.value = t.officialUrl || ""; // ✅ NUEVO
    f.teamFee.value = t.teamFee ?? "";
    f.playerFee.value = t.playerFee ?? "";
    f.notes.value = t.notes || "";
    f.confirmed.checked = !!t.confirmed;
  }

  /* ==========================
     PUBLIC API
  ========================== */
  async function openNew() {
    clearForm();
    f.title.textContent = S.actions.add;
    f.subtitle.textContent = S.actions.add;
    if (deleteBtn) deleteBtn.style.display = "none";
    modal?.show();
  }

  async function openEditById(id) {
    if (!id) return;

    showLoader();
    try {
      const snap = await getDoc(doc(db, TOURNAMENTS_COL, id));
      if (!snap.exists()) {
        alert(S.messages?.errorLoad || "No se pudo cargar el torneo.");
        return;
      }

      const t = { id: snap.id, ...snap.data() };
      fillFormFromTournament(t);

      f.title.textContent = S.actions.edit;
      f.subtitle.textContent = S.actions.edit;
      if (deleteBtn) deleteBtn.style.display = "inline-block";

      modal?.show();
    } catch (e) {
      console.error(e);
      alert(S.messages?.errorLoad || "No se pudo cargar el torneo.");
    } finally {
      hideLoader();
    }
  }

  /* ==========================
     SAVE
  ========================== */
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showLoader();

    try {
      const payload = {
        name: f.name.value.trim(),
        dateStart: f.dateStart.value,
        dateEnd: f.dateEnd.value || "",
        type: f.type.value,
        age: f.age.value,
        venue: f.venue.value,
        location: (f.location.value || "").trim(),
        officialUrl: normalizeUrl(f.officialUrl?.value), // ✅ NUEVO
        teamFee: toNumberOrNull(f.teamFee.value),
        playerFee: toNumberOrNull(f.playerFee.value),
        notes: (f.notes.value || "").trim(),
        confirmed: !!f.confirmed.checked,
        updatedAt: serverTimestamp()
      };

      if (!payload.name || !payload.dateStart) {
        alert(S.messages?.missingRequired || "Faltan campos obligatorios.");
        return;
      }

      if (f.id.value) {
        await setDoc(doc(db, TOURNAMENTS_COL, f.id.value), payload, {
          merge: true
        });
      } else {
        await addDoc(collection(db, TOURNAMENTS_COL), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      modal?.hide();

      window.dispatchEvent(
        new CustomEvent("tournament:changed", {
          detail: { id: f.id.value || null }
        })
      );
    } catch (err) {
      console.error(err);
      alert(S.messages?.errorSave || "Error guardando torneo.");
    } finally {
      hideLoader();
    }
  });

  /* ==========================
     DELETE
  ========================== */
  deleteBtn?.addEventListener("click", async () => {
    const id = f.id.value;
    if (!id) return;

    const ok = confirm(S.actions?.confirmDelete || "¿Eliminar este torneo?");
    if (!ok) return;

    showLoader();
    try {
      await deleteDoc(doc(db, TOURNAMENTS_COL, id));
      modal?.hide();

      window.dispatchEvent(
        new CustomEvent("tournament:changed", {
          detail: { id, deleted: true }
        })
      );
    } catch (e) {
      console.error(e);
      alert(S.messages?.errorDelete || "Error eliminando torneo.");
    } finally {
      hideLoader();
    }
  });

  return { openNew, openEditById };
}

/* =========================================================
   STRINGS / HELPERS
========================================================= */
function applyStrings(f, deleteBtn) {
  if (!f?.lblName) return;

  f.lblName.textContent = S.fields.name.label;
  f.name.placeholder = S.fields.name.placeholder || "";

  f.lblDateStart.textContent = S.fields.dateStart.label;
  f.lblDateEnd.textContent = `${S.fields.dateEnd.label} (opcional)`;

  f.lblType.textContent = S.fields.type.label;
  f.lblAge.textContent = S.fields.age.label;
  f.lblVenue.textContent = S.fields.venue.label;

  f.lblLocation.textContent = `${S.fields.location.label} (opcional)`;
  f.location.placeholder = S.fields.location.placeholder || "";

  // ✅ Opcional: si querés strings para el label del sitio oficial
  // Si no, el label fijo del HTML se queda tal cual.
  if (S.fields?.officialUrl?.label && f.officialUrl) {
    const lbl = document.querySelector('label[for="officialUrl"]');
    if (lbl) lbl.textContent = S.fields.officialUrl.label;
  }

  f.lblTeamFee.textContent = S.fields.teamFee.label;
  f.lblPlayerFee.textContent = S.fields.playerFee.label;

  f.lblNotes.textContent = S.fields.notes.label;
  f.notes.placeholder = S.fields.notes.placeholder || "";

  f.lblConfirmed.textContent = S.fields.confirmed.label;

  f.btnCancel && (f.btnCancel.textContent = S.actions.cancel);
  f.btnSave && (f.btnSave.textContent = S.actions.save);
  deleteBtn && (deleteBtn.textContent = S.actions.delete);

  fillSelect(f.type, S.fields.type.options);
  fillSelect(f.age, S.fields.age.options);
  fillSelect(f.venue, S.fields.venue.options);
}

function fillSelect(selectEl, optionsObj) {
  if (!selectEl || !optionsObj) return;
  selectEl.innerHTML = Object.entries(optionsObj)
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
    )
    .join("");
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ✅ NUEVO: normaliza url para guardar consistente
function normalizeUrl(v) {
  const u = String(v || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
