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
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_ASSOC = COL.associates;
const COL_PLAYERS = COL.players;

const COL_CLUB_CONFIG = COL.club_config;

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

  socialLinksForm: document.getElementById("socialLinksForm"),
  socialInstagram: document.getElementById("socialInstagram"),
  socialFacebook: document.getElementById("socialFacebook"),
  socialTiktok: document.getElementById("socialTiktok"),
  socialYoutube: document.getElementById("socialYoutube"),
  socialX: document.getElementById("socialX"),
  socialWhatsapp: document.getElementById("socialWhatsapp"),

  honorsSettingsForm: document.getElementById("honorsSettingsForm"),
  honorsTitle: document.getElementById("honorsTitle"),
  honorForm: document.getElementById("honorForm"),
  honorPosition: document.getElementById("honorPosition"),
  honorTournament: document.getElementById("honorTournament"),
  honorYear: document.getElementById("honorYear"),
  honorsTableBody: document.getElementById("honorsTableBody"),

  uniformSettingsForm: document.getElementById("uniformSettingsForm"),
  uniformsTitle: document.getElementById("uniformsTitle"),
  uniformsSubtitle: document.getElementById("uniformsSubtitle"),
  uniformsCtaLabel: document.getElementById("uniformsCtaLabel"),
  uniformsOrderUrl: document.getElementById("uniformsOrderUrl"),

  uniformForm: document.getElementById("uniformForm"),
  uniformName: document.getElementById("uniformName"),
  uniformCategory: document.getElementById("uniformCategory"),
  uniformImage: document.getElementById("uniformImage"),
  uniformsTableBody: document.getElementById("uniformsTableBody"),
};

let approveModal = null;
let allPlayers = [];
let pendingUsers = [];
let usersById = new Map();

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
    `<option value="">Todos los roles</option>` +
    `<option value="__unassigned__">Sin asignar</option>` +
    APP_CONFIG.userRoles
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

  const [playersSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, COL_PLAYERS)),
    getDocs(collection(db, COL_USERS)),
  ]);

  usersById = new Map(
    usersSnap.docs.map((d) => [d.id, d.data() || {}])
  );

  allPlayers = playersSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const user = data.uid ? usersById.get(data.uid) : null;
      const hasUserAssigned = Boolean(data.uid && user);

      return {
        id: d.id,
        ...data,
        hasUserAssigned,
        systemRole: user?.role || "",
      };
    })
    .sort((a, b) => {
      if (a.hasUserAssigned !== b.hasUserAssigned) {
        return a.hasUserAssigned ? -1 : 1;
      }

      return comparePlayersByName(a, b);
    });

  renderPlayersTable();
}

function renderPlayersTable() {
  const term = ($.playerSearchInput.value || "").trim().toLowerCase();
  const roleFilter = $.playerRoleFilter.value || "";

  const filtered = allPlayers.filter((p) => {
    const fullName = getPlayerFullName(p).toLowerCase();
    const email = String(p.email || "").toLowerCase();
    const systemRole = String(p.systemRole || "").toLowerCase();

    const textOk = !term || fullName.includes(term) || email.includes(term);

    let roleOk = true;
    if (roleFilter === "__unassigned__") {
      roleOk = !p.systemRole;
    } else if (roleFilter) {
      roleOk = p.systemRole === roleFilter;
    }

    return textOk && roleOk;
  });

  if (!filtered.length) {
    $.playersTable.innerHTML = `<tr><td colspan="5" class="text-muted">No hay jugadores.</td></tr>`;
    return;
  }

  $.playersTable.innerHTML = filtered
    .map((p) => `
      <tr>
        <td>${esc(getPlayerFullName(p) || "—")}</td>
        <td>${esc(p.email || "—")}</td>
        <td>${esc(p.systemRole || "Sin asignar")}</td>
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

function getPlayerFullName(player) {
  return `${player.firstName || ""} ${player.lastName || ""}`.trim();
}

function comparePlayersByName(a, b) {
  return getPlayerFullName(a).localeCompare(
    getPlayerFullName(b),
    "es",
    { sensitivity: "base" }
  );
}

//REDES SOCIALES
async function loadSocialLinks() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "social_links")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  $.socialInstagram.value = data.instagram || "";
  $.socialFacebook.value = data.facebook || "";
  $.socialTiktok.value = data.tiktok || "";
  $.socialYoutube.value = data.youtube || "";
  $.socialX.value = data.x || "";
  $.socialWhatsapp.value = data.whatsapp || "";
}

async function saveSocialLinks(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "social_links"),
      {
        instagram: safeUrl($.socialInstagram.value),
        facebook: safeUrl($.socialFacebook.value),
        tiktok: safeUrl($.socialTiktok.value),
        youtube: safeUrl($.socialYoutube.value),
        x: safeUrl($.socialX.value),
        whatsapp: safeUrl($.socialWhatsapp.value),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showAlert("Redes sociales guardadas.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudieron guardar las redes sociales.");
  }
}

//HONORS / PALMARES

async function loadHonorSettings() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "honors_settings")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};
  $.honorsTitle.value = data.title || "Palmarés";
}

async function saveHonorSettings(ev) {
  ev.preventDefault();

  try {
    await setDoc(doc(db, COL_CLUB_CONFIG, "honors_settings"), {
      title: ($.honorsTitle.value || "").trim() || "Palmarés",
      updatedAt: serverTimestamp(),
    }, { merge: true });

    showAlert("Título de palmarés guardado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo guardar el título de palmarés.");
  }
}

async function loadHonorsAdmin() {
  if ($.honorsTableBody) {
    $.honorsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">Cargando…</td></tr>`;
  }

  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "honors")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  $.honorsTitle.value = data.title || "Palmarés";

  honorsItems = Array.isArray(data.items) ? [...data.items] : [];
  honorsItems.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

  if (!honorsItems.length) {
    $.honorsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">No hay logros registrados.</td></tr>`;
    return;
  }

  $.honorsTableBody.innerHTML = honorsItems
    .map((item, index) => `
      <tr>
        <td>${esc(item.position || "—")}</td>
        <td>${esc(item.tournament || "—")}</td>
        <td>${esc(item.year || "—")}</td>
        <td>
          <button class="btn btn-outline-danger btn-sm" type="button" data-delete-honor="${index}">
            Eliminar
          </button>
        </td>
      </tr>
    `)
    .join("");
}

async function saveHonorSettings(ev) {
  ev.preventDefault();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "honors"),
      {
        title: ($.honorsTitle.value || "").trim() || "Palmarés",
        items: honorsItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showAlert("Palmarés guardado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo guardar el palmarés.");
  }
}

async function addHonor(ev) {
  ev.preventDefault();

  const position = ($.honorPosition.value || "").trim();
  const tournament = ($.honorTournament.value || "").trim();
  const year = Number($.honorYear.value || 0);

  if (!position || !tournament || !year) {
    showAlert("Completa posición, torneo y año.");
    return;
  }

  honorsItems.push({ position, tournament, year });
  honorsItems.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "honors"),
      {
        title: ($.honorsTitle.value || "").trim() || "Palmarés",
        items: honorsItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    $.honorForm.reset();
    await loadHonorsAdmin();
    showAlert("Logro agregado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo agregar el logro.");
  }
}

async function deleteHonor(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= honorsItems.length) return;

  honorsItems.splice(idx, 1);

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "honors"),
      {
        title: ($.honorsTitle.value || "").trim() || "Palmarés",
        items: honorsItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await loadHonorsAdmin();
    showAlert("Logro eliminado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo eliminar el logro.");
  }
}

//UNIFORMS
async function loadUniformsAdmin() {
  if ($.uniformsTableBody) {
    $.uniformsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">Cargando…</td></tr>`;
  }

  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "uniforms")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  $.uniformsTitle.value = data.title || "Uniformes del Equipo";
  $.uniformsSubtitle.value = data.subtitle || "Compra tu indumentaria oficial del club";
  $.uniformsCtaLabel.value = data.ctaLabel || "Comprar";
  $.uniformsOrderUrl.value = data.orderUrl || "";

  uniformsItems = Array.isArray(data.items) ? [...data.items] : [];
  uniformsItems.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" })
  );

  if (!uniformsItems.length) {
    $.uniformsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">No hay uniformes registrados.</td></tr>`;
    return;
  }

  $.uniformsTableBody.innerHTML = uniformsItems
    .map((item, index) => `
      <tr>
        <td>${esc(item.name || "—")}</td>
        <td>${esc(item.category || "—")}</td>
        <td class="text-truncate" style="max-width:240px">${esc(item.image || "—")}</td>
        <td>
          <button class="btn btn-outline-danger btn-sm" type="button" data-delete-uniform="${index}">
            Eliminar
          </button>
        </td>
      </tr>
    `)
    .join("");
}

async function saveUniformSettings(ev) {
  ev.preventDefault();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "uniforms"),
      {
        title: ($.uniformsTitle.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl.value),
        items: uniformsItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showAlert("Configuración de uniformes guardada.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo guardar la configuración de uniformes.");
  }
}

async function addUniform(ev) {
  ev.preventDefault();

  const name = ($.uniformName.value || "").trim();
  const category = ($.uniformCategory.value || "").trim();
  const image = ($.uniformImage.value || "").trim();

  if (!name || !image) {
    showAlert("Completa al menos nombre e imagen.");
    return;
  }

  uniformsItems.push({
    id: `uniform_${Date.now()}`,
    name,
    category,
    image,
  });

  uniformsItems.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" })
  );

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "uniforms"),
      {
        title: ($.uniformsTitle.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl.value),
        items: uniformsItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    $.uniformForm.reset();
    await loadUniformsAdmin();
    showAlert("Uniforme agregado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo agregar el uniforme.");
  }
}

async function deleteUniform(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= uniformsItems.length) return;

  uniformsItems.splice(idx, 1);

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "uniforms"),
      {
        title: ($.uniformsTitle.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl.value),
        items: uniformsItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await loadUniformsAdmin();
    showAlert("Uniforme eliminado.", "success");
  } catch (err) {
    console.error(err);
    showAlert("No se pudo eliminar el uniforme.");
  }
}


//HELPERS
function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

//BOOT
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
    try { await loadSocialLinks(); } catch (e) { console.error("loadSocialLinks", e); }
    try { await loadHonorSettings(); } catch (e) { console.error("loadHonorSettings", e); }
    try { await loadHonorsAdmin(); } catch (e) { console.error("loadHonorsAdmin", e); }
    try { await loadUniformSettings(); } catch (e) { console.error("loadUniformSettings", e); }
    try { await loadUniformsAdmin(); } catch (e) { console.error("loadUniformsAdmin", e); }


    $.refreshPendingBtn?.addEventListener("click", loadPendingUsers);
    $.refreshPlayersBtn?.addEventListener("click", loadPlayers);
    $.playerSearchInput?.addEventListener("input", renderPlayersTable);
    $.playerRoleFilter?.addEventListener("change", renderPlayersTable);
    $.approveLinkMode?.addEventListener("change", syncApproveModeUI);
    $.approveUserForm?.addEventListener("submit", approveUserFlow);
    $.socialLinksForm?.addEventListener("submit", saveSocialLinks);
    $.honorsSettingsForm?.addEventListener("submit", saveHonorSettings);
    $.honorForm?.addEventListener("submit", addHonor);
    $.uniformSettingsForm?.addEventListener("submit", saveUniformSettings);
    $.uniformForm?.addEventListener("submit", addUniform)

    document.addEventListener("click", async (ev) => {
      const approveBtn = ev.target.closest("[data-approve-user]");
      if (approveBtn) {
        await openApproveModal(approveBtn.getAttribute("data-approve-user"));
        return;
      }

      const deleteHonorBtn = ev.target.closest("[data-delete-honor]");
      if (deleteHonorBtn) {
        await deleteHonor(deleteHonorBtn.getAttribute("data-delete-honor"));
        return;
      }

      const deleteUniformBtn = ev.target.closest("[data-delete-uniform]");
      if (deleteUniformBtn) {
        await deleteUniform(deleteUniformBtn.getAttribute("data-delete-uniform"));
        return;
      }
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