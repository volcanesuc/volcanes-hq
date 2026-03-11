import { db } from "./auth/firebase.js";
import { APP_CONFIG } from "./config/config.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader } from "./ui/loader.js";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_ASSOC = COL.associates;
const COL_PLAYERS = COL.players;

const $ = {
  alertBox: document.getElementById("alertBox"),

  pendingUsersTable: document.querySelector("#pendingUsersTable tbody"),
  refreshPendingBtn: document.getElementById("refreshPendingBtn"),

  playersTable: document.querySelector("#playersTable tbody"),
  playerSearchInput: document.getElementById("playerSearchInput"),
  playerRoleFilter: document.getElementById("playerRoleFilter"),
  refreshPlayersBtn: document.getElementById("refreshPlayersBtn"),

  approveUserForm: document.getElementById("approveUserForm"),
  approveUid: document.getElementById("approveUid"),
  approveAssociateId: document.getElementById("approveAssociateId"),
  approveEmail: document.getElementById("approveEmail"),
  approveSystemRole: document.getElementById("approveSystemRole"),
  approveLinkMode: document.getElementById("approveLinkMode"),
  approveExistingPlayerId: document.getElementById("approveExistingPlayerId"),

  existingPlayerWrap: document.getElementById("existingPlayerWrap"),
  newPlayerWrap: document.getElementById("newPlayerWrap"),

  newPlayerFirstName: document.getElementById("newPlayerFirstName"),
  newPlayerLastName: document.getElementById("newPlayerLastName"),
  newPlayerBirthday: document.getElementById("newPlayerBirthday"),
  newPlayerFieldRole: document.getElementById("newPlayerFieldRole"),

  approveSubmitBtn: document.getElementById("approveSubmitBtn"),
};

let approveModal = null;
let allPlayers = [];
let pendingUsers = [];

function showAlert(msg, type = "danger") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.textContent = msg;
  $.alertBox.classList.remove("d-none");
}

function hideAlert() {
  $.alertBox?.classList.add("d-none");
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fillStaticOptions() {
  $.approveSystemRole.innerHTML = APP_CONFIG.userRoles
    .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
    .join("");

  $.newPlayerFieldRole.innerHTML = APP_CONFIG.playerRoles
    .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
    .join("");

  $.playerRoleFilter.innerHTML =
    `<option value="">Todos los perfiles</option>` +
    APP_CONFIG.playerRoles
      .filter((r) => r.id)
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
}

async function getAssociateData(associateId) {
  if (!associateId) return null;

  const snap = await getDoc(doc(db, COL_ASSOC, associateId)).catch(() => null);
  if (!snap?.exists?.()) return null;

  return snap.data() || null;
}

async function loadPendingUsers() {
  $.pendingUsersTable.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando…</td></tr>`;

  const qy = query(
    collection(db, COL_USERS),
    where("onboardingComplete", "==", true),
    where("isActive", "==", false)
  );

  const snap = await getDocs(qy);
  pendingUsers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!pendingUsers.length) {
    $.pendingUsersTable.innerHTML = `<tr><td colspan="5" class="text-muted">No hay cuentas pendientes.</td></tr>`;
    return;
  }

  $.pendingUsersTable.innerHTML = pendingUsers
    .map((u) => `
      <tr>
        <td>${esc(u.email || "—")}</td>
        <td>${esc(u.displayName || "—")}</td>
        <td>${esc(u.associateId || "—")}</td>
        <td>${esc(u.playerId || "—")}</td>
        <td>
          <button class="btn btn-sm btn-primary" type="button" data-approve-user="${esc(u.id)}">
            Aprobar
          </button>
        </td>
      </tr>
    `)
    .join("");
}

async function loadPlayers() {
  $.playersTable.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando…</td></tr>`;

  const snap = await getDocs(collection(db, COL_PLAYERS));
  allPlayers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  renderPlayersTable();
}

function renderPlayersTable() {
  const term = ($.playerSearchInput.value || "").trim().toLowerCase();
  const roleFilter = $.playerRoleFilter.value || "";

  const filtered = allPlayers.filter((p) => {
    const fullName = `${p.firstName || ""} ${p.lastName || ""}`.trim().toLowerCase();
    const email = String(p.email || "").toLowerCase();
    const fieldRole = String(p.fieldRole || "");
    const textOk = !term || fullName.includes(term) || email.includes(term);
    const roleOk = !roleFilter || fieldRole === roleFilter;
    return textOk && roleOk;
  });

  if (!filtered.length) {
    $.playersTable.innerHTML = `<tr><td colspan="5" class="text-muted">No hay jugadores.</td></tr>`;
    return;
  }

  $.playersTable.innerHTML = filtered
    .map((p) => `
      <tr>
        <td>${esc(`${p.firstName || ""} ${p.lastName || ""}`.trim() || "—")}</td>
        <td>${esc(p.email || "—")}</td>
        <td>${esc(p.fieldRole || "—")}</td>
        <td>${esc(p.associateId || "—")}</td>
        <td>${esc(p.uid || "—")}</td>
      </tr>
    `)
    .join("");
}

function fillExistingPlayersSelect(currentUid = null) {
  const availablePlayers = allPlayers.filter((p) => {
    const linkedUid = p.uid || null;
    return !linkedUid || linkedUid === currentUid;
  });

  $.approveExistingPlayerId.innerHTML =
    `<option value="">Seleccionar…</option>` +
    availablePlayers
      .map((p) => {
        const name =
          `${p.firstName || ""} ${p.lastName || ""}`.trim() ||
          p.email ||
          p.id;

        return `<option value="${esc(p.id)}">${esc(name)}</option>`;
      })
      .join("");
}

function syncApproveModeUI() {
  const mode = $.approveLinkMode.value;
  $.existingPlayerWrap.classList.toggle("d-none", mode !== "existing");
  $.newPlayerWrap.classList.toggle("d-none", mode !== "new");
}

async function openApproveModal(uid) {
  const user = pendingUsers.find((u) => u.id === uid);
  if (!user) return;

  $.approveUid.value = user.id;
  $.approveAssociateId.value = user.associateId || "";
  $.approveEmail.value = user.email || "";
  $.approveSystemRole.value = user.role || "viewer";
  $.approveLinkMode.value = user.playerId ? "existing" : "none";

  fillExistingPlayersSelect(uid);
  $.approveExistingPlayerId.value = user.playerId || "";

  $.newPlayerFirstName.value = "";
  $.newPlayerLastName.value = "";
  $.newPlayerBirthday.value = "";
  $.newPlayerFieldRole.value = "";

  const assoc = await getAssociateData(user.associateId);
  if (assoc?.profile) {
    $.newPlayerFirstName.value = assoc.profile.firstName || "";
    $.newPlayerLastName.value = assoc.profile.lastName || "";
    $.newPlayerBirthday.value = assoc.profile.birthDate || "";
  }

  syncApproveModeUI();
  approveModal.show();
}

async function assertPlayerCanBeLinked(playerId, uid) {
  if (!playerId) {
    throw new Error("Selecciona un jugador válido.");
  }

  const snap = await getDoc(doc(db, COL_PLAYERS, playerId));
  if (!snap.exists()) {
    throw new Error("El jugador seleccionado no existe.");
  }

  const data = snap.data() || {};
  const currentUid = data.uid || null;

  if (currentUid && currentUid !== uid) {
    throw new Error("Ese jugador ya está ligado a otro usuario.");
  }

  return data;
}

async function createPlayerForUser({
  uid,
  email,
  associateId,
  firstName,
  lastName,
  birthday,
  fieldRole,
}) {
  const ref = await addDoc(collection(db, COL_PLAYERS), {
    active: true,
    firstName: firstName || null,
    lastName: lastName || null,
    birthday: birthday || null,
    fieldRole: fieldRole || null,
    associateId: associateId || null,
    uid: uid || null,
    email: email || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

async function linkExistingPlayer({ playerId, uid, email, associateId }) {
  await updateDoc(doc(db, COL_PLAYERS, playerId), {
    uid: uid || null,
    email: email || null,
    associateId: associateId || null,
    updatedAt: serverTimestamp(),
  });
}

async function approveUserFlow(ev) {
  ev.preventDefault();
  hideAlert();

  const uid = $.approveUid.value;
  const associateId = $.approveAssociateId.value || null;
  const email = $.approveEmail.value || null;
  const systemRole = $.approveSystemRole.value || "viewer";
  const mode = $.approveLinkMode.value;

  if (!uid) {
    showAlert("No se encontró el usuario a aprobar.");
    return;
  }

  showLoader("Aprobando cuenta…");

  try {
    let playerId = null;

    if (mode === "existing") {
      playerId = $.approveExistingPlayerId.value || null;
      if (!playerId) throw new Error("Selecciona un jugador existente.");

      await assertPlayerCanBeLinked(playerId, uid);

      await linkExistingPlayer({
        playerId,
        uid,
        email,
        associateId,
      });
    }

    if (mode === "new") {
      const firstName = $.newPlayerFirstName.value.trim();
      const lastName = $.newPlayerLastName.value.trim();
      const birthday = $.newPlayerBirthday.value || null;
      const fieldRole = $.newPlayerFieldRole.value || null;

      if (!firstName || !lastName) {
        throw new Error("Completa nombre y apellido para crear el jugador.");
      }

      playerId = await createPlayerForUser({
        uid,
        email,
        associateId,
        firstName,
        lastName,
        birthday,
        fieldRole,
      });
    }

    await updateDoc(doc(db, COL_USERS, uid), {
      isActive: true,
      role: systemRole,
      playerId: playerId || null,
      updatedAt: serverTimestamp(),
    });

    if (associateId) {
      await updateDoc(doc(db, COL_ASSOC, associateId), {
        playerId: playerId || null,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    approveModal.hide();
    await loadPendingUsers();
    await loadPlayers();
    showAlert("Cuenta aprobada correctamente.", "success");
  } catch (err) {
    console.error(err);
    showAlert(err.message || "No se pudo aprobar la cuenta.");
  } finally {
    hideLoader();
  }
}

async function boot() {
  showLoader("Cargando administración…");

  try {
    const { cfg, redirected } = await guardPage("admin");
    if (redirected) return;

    if (!cfg.isAdmin) {
      window.location.href = "/dashboard.html";
      return;
    }

    await loadHeader("admin", cfg);

    approveModal = new bootstrap.Modal(document.getElementById("approveUserModal"));

    fillStaticOptions();
    syncApproveModeUI();

    await loadPendingUsers();
    await loadPlayers();

    $.refreshPendingBtn?.addEventListener("click", loadPendingUsers);
    $.refreshPlayersBtn?.addEventListener("click", loadPlayers);
    $.playerSearchInput?.addEventListener("input", renderPlayersTable);
    $.playerRoleFilter?.addEventListener("change", renderPlayersTable);
    $.approveLinkMode?.addEventListener("change", syncApproveModeUI);
    $.approveUserForm?.addEventListener("submit", approveUserFlow);

    document.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-approve-user]");
      if (!btn) return;
      await openApproveModal(btn.getAttribute("data-approve-user"));
    });
  } catch (err) {
    console.error(err);
    showAlert("No se pudo cargar la pantalla de administración.");
  } finally {
    hideLoader();
    document.body.classList.remove("loading");
    document.documentElement.classList.remove("preload");
  }
}

boot();