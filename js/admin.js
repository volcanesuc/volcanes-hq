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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { storage } from "./auth/firebase.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_ASSOC = COL.associates;
const COL_PLAYERS = COL.players;

const COL_CLUB_CONFIG = COL.club_config;

const $ = {
  alertBox: document.getElementById("alertBox"),

  indexSettingsForm: document.getElementById("indexSettingsForm"),
  idxShowEvents: document.getElementById("idxShowEvents"),
  idxShowTrainings: document.getElementById("idxShowTrainings"),
  idxShowHonors: document.getElementById("idxShowHonors"),
  idxShowUniforms: document.getElementById("idxShowUniforms"),

  idxShowEventsState: document.getElementById("idxShowEventsState"),
  idxShowTrainingsState: document.getElementById("idxShowTrainingsState"),
  idxShowHonorsState: document.getElementById("idxShowHonorsState"),
  idxShowUniformsState: document.getElementById("idxShowUniformsState"),

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

  playersSectionCollapse: document.getElementById("playersSectionCollapse"),
  playersCollapseToggle: document.getElementById("playersCollapseToggle"),

  existingPlayerWrap: document.getElementById("existingPlayerWrap"),
  newPlayerWrap: document.getElementById("newPlayerWrap"),

  newPlayerFirstName: document.getElementById("newPlayerFirstName"),
  newPlayerLastName: document.getElementById("newPlayerLastName"),
  newPlayerBirthday: document.getElementById("newPlayerBirthday"),
  newPlayerFieldRole: document.getElementById("newPlayerFieldRole"),

  approveSubmitBtn: document.getElementById("approveSubmitBtn"),

  trainingsSettingsForm: document.getElementById("trainingsSettingsForm"),
  trainingsTitle: document.getElementById("trainingsTitle"),
  trainingBlockForm: document.getElementById("trainingBlockForm"),
  trainingBlockId: document.getElementById("trainingBlockId"),
  trainingBlockName: document.getElementById("trainingBlockName"),
  trainingDay: document.getElementById("trainingDay"),
  trainingTime: document.getElementById("trainingTime"),
  trainingsTableBody: document.getElementById("trainingsTableBody"),

  socialLinksForm: document.getElementById("socialLinksForm"),
  socialInstagram: document.getElementById("socialInstagram"),
  socialFacebook: document.getElementById("socialFacebook"),
  socialTiktok: document.getElementById("socialTiktok"),
  socialYoutube: document.getElementById("socialYoutube"),
  socialX: document.getElementById("socialX"),
  socialWhatsapp: document.getElementById("socialWhatsapp"),
  socialWhatsappLabel: document.getElementById("socialWhatsappLabel"),

  heroSettingsForm: document.getElementById("heroSettingsForm"),
  heroTitleInput: document.getElementById("heroTitleInput"),
  heroDescriptionInput: document.getElementById("heroDescriptionInput"),
  heroImageUrlInput: document.getElementById("heroImageUrlInput"),
  heroImageFileInput: document.getElementById("heroImageFileInput"),
  heroImagePreview: document.getElementById("heroImagePreview"),

  eventsSettingsForm: document.getElementById("eventsSettingsForm"),
  eventTitleInput: document.getElementById("eventTitleInput"),
  eventSubtitleInput: document.getElementById("eventSubtitleInput"),
  eventImage1Input: document.getElementById("eventImage1Input"),
  eventImage2Input: document.getElementById("eventImage2Input"),
  eventImage3Input: document.getElementById("eventImage3Input"),
  eventCtaEnabledInput: document.getElementById("eventCtaEnabledInput"),
  eventCtaTextInput: document.getElementById("eventCtaTextInput"),
  eventCtaUrlInput: document.getElementById("eventCtaUrlInput"),

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

let trainingsBlocks = [];
let honorsItems = [];
let uniformsItems = [];

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

// INDEX SETTINGS
async function loadIndexSettingsAdmin() {
  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "index_settings"));
    const data = snap.exists() ? (snap.data() || {}) : {};

    if ($.idxShowEvents) $.idxShowEvents.checked = data.show_events !== false;
    if ($.idxShowTrainings) $.idxShowTrainings.checked = data.show_trainings !== false;
    if ($.idxShowHonors) $.idxShowHonors.checked = data.show_honors !== false;
    if ($.idxShowUniforms) $.idxShowUniforms.checked = data.show_uniforms !== false;
  } catch (err) {
    console.error("loadIndexSettingsAdmin error:", err);
    showAlert("No se pudo cargar la visibilidad del landing.");
  }
}

async function saveIndexSettings(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    const availability = await getLandingSectionAvailability();

    const payload = {
      show_events: availability.events.ok ? !!$.idxShowEvents?.checked : false,
      show_trainings: availability.trainings.ok ? !!$.idxShowTrainings?.checked : false,
      show_honors: availability.honors.ok ? !!$.idxShowHonors?.checked : false,
      show_uniforms: availability.uniforms.ok ? !!$.idxShowUniforms?.checked : false,
      updatedAt: serverTimestamp(),
    };

    await setDoc(
      doc(db, COL_CLUB_CONFIG, "index_settings"),
      payload,
      { merge: true }
    );

    await refreshIndexToggleAvailability(false);
    showAlert("Visibilidad del landing guardada.", "success");
  } catch (err) {
    console.error("saveIndexSettings error:", err);
    showAlert("No se pudo guardar la visibilidad del landing.");
  }
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

// HERO INFO
async function loadHeroAdmin() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "hero")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  $.heroTitleInput.value = data.title || "";
  $.heroDescriptionInput.value = data.description || "";
  $.heroImageUrlInput.value = data.imageUrl || "";

  if (data.imageUrl && $.heroImagePreview) {
    $.heroImagePreview.src = data.imageUrl;
    $.heroImagePreview.classList.remove("d-none");
  } else {
    $.heroImagePreview?.classList.add("d-none");
  }
}

async function saveHeroSettings(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    const uploadedUrl = await uploadHeroImageIfNeeded();
    const manualUrl = safeUrl($.heroImageUrlInput?.value || "");
    const finalImageUrl = uploadedUrl || manualUrl;

    await setDoc(
      doc(db, COL_CLUB_CONFIG, "hero"),
      {
        title: ($.heroTitleInput?.value || "").trim(),
        description: ($.heroDescriptionInput?.value || "").trim(),
        imageUrl: finalImageUrl,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    if ($.heroImageUrlInput && uploadedUrl) {
      $.heroImageUrlInput.value = uploadedUrl;
    }

    if ($.heroImagePreview) {
      if (finalImageUrl) {
        $.heroImagePreview.src = finalImageUrl;
        $.heroImagePreview.classList.remove("d-none");
      } else {
        $.heroImagePreview.src = "";
        $.heroImagePreview.classList.add("d-none");
      }
    }

    if ($.heroImageFileInput) {
      $.heroImageFileInput.value = "";
    }

    showAlert("Hero guardado correctamente.", "success");
    await loadHeroAdmin();
  } catch (err) {
    console.error("saveHeroSettings error:", err);
    showAlert(err?.message || "No se pudo guardar el hero.");
  }
}

async function uploadHeroImageIfNeeded() {
  const file = $.heroImageFileInput?.files?.[0];
  if (!file) return "";

  const clubId =
    APP_CONFIG?.clubId ||
    APP_CONFIG?.club?.id ||
    APP_CONFIG?.brand?.clubId ||
    "default";

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `clubs/${clubId}/landing/hero.${ext}`;
  const ref = storageRef(storage, path);

  await uploadBytes(ref, file, {
    contentType: file.type || "image/jpeg",
    cacheControl: "no-cache",
  });

  return await getDownloadURL(ref);
}

//TRAININGS INFO
async function loadTrainingsAdmin() {
  if ($.trainingsTableBody) {
    $.trainingsTableBody.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando…</td></tr>`;
  }

  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "trainings"));
    const data = snap.exists() ? (snap.data() || {}) : {};

    $.trainingsTitle.value = data.title || "Entrenamientos y Juegos";
    trainingsBlocks = Array.isArray(data.blocks) ? [...data.blocks] : [];

    const rows = trainingsBlocks.flatMap((block, blockIndex) => {
      const schedule = Array.isArray(block.schedule) ? block.schedule : [];

      if (!schedule.length) {
        return [`
          <tr>
            <td>${esc(block.id || "—")}</td>
            <td>${esc(block.name || "—")}</td>
            <td>—</td>
            <td>—</td>
            <td>
              <button class="btn btn-outline-danger btn-sm" type="button"
                data-delete-training-row="${blockIndex}:empty">
                Eliminar bloque vacío
              </button>
            </td>
          </tr>
        `];
      }

      return schedule.map((item, scheduleIndex) => `
        <tr>
          <td>${esc(block.id || "—")}</td>
          <td>${esc(block.name || "—")}</td>
          <td>${esc(item.day || "—")}</td>
          <td>${esc(item.time || "—")}</td>
          <td>
            <button class="btn btn-outline-danger btn-sm" type="button"
              data-delete-training-row="${blockIndex}:${scheduleIndex}">
              Eliminar
            </button>
          </td>
        </tr>
      `);
    });

    $.trainingsTableBody.innerHTML = rows.length
      ? rows.join("")
      : `<tr><td colspan="5" class="text-muted">No hay horarios registrados.</td></tr>`;
  } catch (err) {
    console.error("loadTrainingsAdmin error:", err);
    $.trainingsTableBody.innerHTML = `<tr><td colspan="5" class="text-danger">No se pudo cargar la sección.</td></tr>`;
  }
}

async function saveTrainingsTitle(ev) {
  ev.preventDefault();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "trainings"),
      {
        title: ($.trainingsTitle.value || "").trim() || "Entrenamientos y Juegos",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await refreshIndexToggleAvailability(true);
    showAlert("Título de entrenamientos guardado.", "success");
    await loadTrainingsAdmin();
  } catch (err) {
    console.error("saveTrainingsTitle error:", err);
    showAlert("No se pudo guardar el título.");
  }
}

async function addTrainingRow(ev) {
  ev.preventDefault();

  const blockId = ($.trainingBlockId.value || "").trim();
  const blockName = ($.trainingBlockName.value || "").trim();
  const day = ($.trainingDay.value || "").trim();
  const time = ($.trainingTime.value || "").trim();

  if (!blockId || !blockName || !day || !time) {
    showAlert("Completa bloque, nombre, día y hora.");
    return;
  }

  try {
    const ref = doc(db, COL_CLUB_CONFIG, "trainings");
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const currentBlocks = Array.isArray(data.blocks) ? [...data.blocks] : [];
    const title = ($.trainingsTitle.value || "").trim() || data.title || "Entrenamientos y Juegos";

    const idx = currentBlocks.findIndex((b) => b.id === blockId);

    if (idx >= 0) {
      const currentSchedule = Array.isArray(currentBlocks[idx].schedule)
        ? [...currentBlocks[idx].schedule]
        : [];

      currentBlocks[idx] = {
        ...currentBlocks[idx],
        name: blockName,
        schedule: [...currentSchedule, { day, time }],
      };
    } else {
      currentBlocks.push({
        id: blockId,
        name: blockName,
        schedule: [{ day, time }],
      });
    }

    await setDoc(
      ref,
      {
        title,
        blocks: currentBlocks,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    trainingsBlocks = currentBlocks;
    $.trainingBlockForm?.reset();
    $.trainingBlockId.value = "trainings";
    await loadTrainingsAdmin();
    await refreshIndexToggleAvailability(true);
    showAlert("Horario agregado.", "success");
  } catch (err) {
    console.error("addTrainingRow error:", err);
    showAlert("No se pudo agregar el horario.");
  }
}

async function deleteTrainingRow(pointer) {
  const [blockIndexRaw, scheduleIndexRaw] = String(pointer || "").split(":");
  const blockIndex = Number(blockIndexRaw);

  if (!Number.isInteger(blockIndex) || blockIndex < 0) return;

  try {
    const ref = doc(db, COL_CLUB_CONFIG, "trainings");
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const currentBlocks = Array.isArray(data.blocks) ? [...data.blocks] : [];
    if (blockIndex >= currentBlocks.length) return;

    if (scheduleIndexRaw === "empty") {
      currentBlocks.splice(blockIndex, 1);
    } else {
      const scheduleIndex = Number(scheduleIndexRaw);
      const block = { ...currentBlocks[blockIndex] };
      const schedule = Array.isArray(block.schedule) ? [...block.schedule] : [];

      if (!Number.isInteger(scheduleIndex) || scheduleIndex < 0 || scheduleIndex >= schedule.length) return;

      schedule.splice(scheduleIndex, 1);

      if (!schedule.length) {
        currentBlocks.splice(blockIndex, 1);
      } else {
        block.schedule = schedule;
        currentBlocks[blockIndex] = block;
      }
    }

    await setDoc(
      ref,
      {
        title: ($.trainingsTitle.value || "").trim() || data.title || "Entrenamientos y Juegos",
        blocks: currentBlocks,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    trainingsBlocks = currentBlocks;
    await loadTrainingsAdmin();
    await refreshIndexToggleAvailability(true);
    showAlert("Horario eliminado.", "success");
  } catch (err) {
    console.error("deleteTrainingRow error:", err);
    showAlert("No se pudo eliminar el horario.");
  }
}

//EVENTOS
async function loadEventsAdmin() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "events")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  const images = Array.isArray(data.images) ? data.images : [];

  $.eventTitleInput.value = data.title || "";
  $.eventSubtitleInput.value = data.subtitle || "";
  $.eventImage1Input.value = images[0] || "";
  $.eventImage2Input.value = images[1] || "";
  $.eventImage3Input.value = images[2] || "";
  $.eventCtaEnabledInput.checked = data.ctaEnabled === true;
  $.eventCtaTextInput.value = data.ctaText || "";
  $.eventCtaUrlInput.value = data.ctaUrl || "";
}

async function saveEventsSettings(ev) {
  ev.preventDefault();

  try {
    const images = [
      safeUrl($.eventImage1Input.value),
      safeUrl($.eventImage2Input.value),
      safeUrl($.eventImage3Input.value),
    ].filter(Boolean);

    await setDoc(
      doc(db, COL_CLUB_CONFIG, "events"),
      {
        title: ($.eventTitleInput.value || "").trim(),
        subtitle: ($.eventSubtitleInput.value || "").trim(),
        images,
        ctaEnabled: !!$.eventCtaEnabledInput.checked,
        ctaText: ($.eventCtaTextInput.value || "").trim(),
        ctaUrl: safeUrl($.eventCtaUrlInput.value),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await refreshIndexToggleAvailability(true);
    showAlert("Torneo guardado.", "success");
    await loadEventsAdmin();
  } catch (err) {
    console.error("saveEventsSettings error:", err);
    showAlert("No se pudo guardar la sección de torneo.");
  }
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
  $.socialWhatsapp.value = data.whatsappUrl || data.whatsapp || "";
  $.socialWhatsappLabel.value = data.whatsappLabel || "WhatsApp";
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
        whatsappUrl: safeUrl($.socialWhatsapp.value),
        whatsappLabel: ($.socialWhatsappLabel.value || "").trim() || "WhatsApp",
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
async function loadHonorsAdmin() {
  if ($.honorsTableBody) {
    $.honorsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">Cargando…</td></tr>`;
  }

  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "honors"));
    const data = snap.exists() ? (snap.data() || {}) : {};

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
  } catch (err) {
    console.error("loadHonorsAdmin error:", err);
    $.honorsTableBody.innerHTML = `<tr><td colspan="4" class="text-danger">No se pudo cargar el palmarés.</td></tr>`;
  }
}

async function saveHonorSettings(ev) {
  ev.preventDefault();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "honors"),
      {
        title: ($.honorsTitle.value || "").trim() || "Palmarés",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await refreshIndexToggleAvailability(true);
    showAlert("Título de palmarés guardado.", "success");
    await loadHonorsAdmin();
  } catch (err) {
    console.error("saveHonorSettings error:", err);
    showAlert("No se pudo guardar el título del palmarés.");
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

  try {
    const ref = doc(db, COL_CLUB_CONFIG, "honors");
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const currentItems = Array.isArray(data.items) ? [...data.items] : [];

    const nextItems = [
      ...currentItems,
      { position, tournament, year }
    ].sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

    await setDoc(
      ref,
      {
        title: ($.honorsTitle.value || "").trim() || data.title || "Palmarés",
        items: nextItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    honorsItems = nextItems;
    $.honorForm?.reset();
    await loadHonorsAdmin();
    await refreshIndexToggleAvailability(true);
    showAlert("Logro agregado.", "success");
  } catch (err) {
    console.error("addHonor error:", err);
    showAlert(err?.message || "No se pudo agregar el logro.");
  }
}

async function deleteHonor(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) return;

  try {
    const ref = doc(db, COL_CLUB_CONFIG, "honors");
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const currentItems = Array.isArray(data.items) ? [...data.items] : [];
    if (idx >= currentItems.length) return;

    const nextItems = currentItems.filter((_, i) => i !== idx);

    await setDoc(
      ref,
      {
        title: ($.honorsTitle.value || "").trim() || data.title || "Palmarés",
        items: nextItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    honorsItems = nextItems;
    await loadHonorsAdmin();
    await refreshIndexToggleAvailability(true);
    showAlert("Logro eliminado.", "success");
  } catch (err) {
    console.error("deleteHonor error:", err);
    showAlert(err?.message || "No se pudo eliminar el logro.");
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

    await refreshIndexToggleAvailability(true);
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

  const nextItems = [
    ...uniformsItems,
    {
      id: `uniform_${Date.now()}`,
      name,
      category,
      image,
    }
  ].sort((a, b) =>
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
        items: nextItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    uniformsItems = nextItems;
    $.uniformForm?.reset();
    await loadUniformsAdmin();
    await refreshIndexToggleAvailability(true);
    showAlert("Uniforme agregado.", "success");
  } catch (err) {
    console.error("addUniform error:", err);
    showAlert("No se pudo agregar el uniforme.");
  }
}

async function deleteUniform(index) {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= uniformsItems.length) return;

  const nextItems = uniformsItems.filter((_, i) => i !== idx);

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "uniforms"),
      {
        title: ($.uniformsTitle.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl.value),
        items: nextItems,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    uniformsItems = nextItems;
    await loadUniformsAdmin();
    await refreshIndexToggleAvailability(true);
    showAlert("Uniforme eliminado.", "success");
  } catch (err) {
    console.error("deleteUniform error:", err);
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

function bindCollapseCarets() {
  if (bindCollapseCarets._bound) return;
  bindCollapseCarets._bound = true;

  document.addEventListener("shown.bs.collapse", (e) => {
    const id = e.target?.id;
    if (!id) return;
    document.querySelectorAll(`[data-caret-for="${id}"]`).forEach((el) => {
      el.textContent = "▾";
    });
  });

  document.addEventListener("hidden.bs.collapse", (e) => {
    const id = e.target?.id;
    if (!id) return;
    document.querySelectorAll(`[data-caret-for="${id}"]`).forEach((el) => {
      el.textContent = "▸";
    });
  });
}

function setupPlayersCollapseByViewport() {
  if (!$.playersSectionCollapse) return;

  const collapse = bootstrap.Collapse.getOrCreateInstance($.playersSectionCollapse, {
    toggle: false,
  });

  collapse.hide();
  $.playersCollapseToggle?.setAttribute("aria-expanded", "false");
}

let adminResizeTimer = null;

function bindResponsiveUI() {
  setupPlayersCollapseByViewport();

  window.addEventListener("resize", () => {
    clearTimeout(adminResizeTimer);
    adminResizeTimer = setTimeout(() => {
      setupPlayersCollapseByViewport();
    }, 120);
  });
}

//MANAGE SWITCHES
function setToggleAvailability(inputEl, stateEl, ok, checked, message) {
  if (!inputEl) return;

  inputEl.disabled = !ok;
  inputEl.checked = ok ? !!checked : false;
  inputEl.title = ok ? "" : message;

  if (stateEl) {
    stateEl.textContent = ok ? "Listo" : message;
    stateEl.className = ok ? "ms-2 small text-success" : "ms-2 small text-danger";
  }
}

async function getLandingSectionAvailability() {
  const [
    eventsSnap,
    trainingsSnap,
    honorsSnap,
    uniformsSnap,
  ] = await Promise.all([
    getDoc(doc(db, COL_CLUB_CONFIG, "events")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "trainings")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "honors")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "uniforms")).catch(() => null),
  ]);

  const eventsData = eventsSnap?.exists?.() ? (eventsSnap.data() || {}) : {};
  const trainingsData = trainingsSnap?.exists?.() ? (trainingsSnap.data() || {}) : {};
  const honorsData = honorsSnap?.exists?.() ? (honorsSnap.data() || {}) : {};
  const uniformsData = uniformsSnap?.exists?.() ? (uniformsSnap.data() || {}) : {};

  const eventImages = Array.isArray(eventsData.images) ? eventsData.images.filter(Boolean) : [];
  const eventsMissing = [];
  if (!(eventsData.title || "").trim()) eventsMissing.push("falta título");
  if (!(eventsData.subtitle || "").trim()) eventsMissing.push("falta subtítulo");
  if (eventImages.length < 3) eventsMissing.push("faltan 3 imágenes");

  const trainingBlocks = Array.isArray(trainingsData.blocks) ? trainingsData.blocks : [];
  const hasTrainingRows = trainingBlocks.some(
    (b) => Array.isArray(b.schedule) && b.schedule.some((row) => (row?.day || "").trim() && (row?.time || "").trim())
  );
  const trainingsMissing = [];
  if (!(trainingsData.title || "").trim()) trainingsMissing.push("falta título");
  if (!hasTrainingRows) trainingsMissing.push("faltan horarios");

  const honorItems = Array.isArray(honorsData.items) ? honorsData.items : [];
  const honorsMissing = [];
  if (!(honorsData.title || "").trim()) honorsMissing.push("falta título");
  if (!honorItems.length) honorsMissing.push("faltan logros");

  const uniformItems = Array.isArray(uniformsData.items) ? uniformsData.items : [];
  const validUniforms = uniformItems.filter((x) => (x?.name || "").trim() && (x?.image || "").trim());
  const uniformsMissing = [];
  if (!(uniformsData.title || "").trim()) uniformsMissing.push("falta título");
  if (!(uniformsData.subtitle || "").trim()) uniformsMissing.push("falta subtítulo");
  if (!(uniformsData.ctaLabel || "").trim()) uniformsMissing.push("falta texto CTA");
  if (!safeUrl(uniformsData.orderUrl || "")) uniformsMissing.push("falta order URL");
  if (!validUniforms.length) uniformsMissing.push("faltan uniformes");

  return {
    events: {
      ok: eventsMissing.length === 0,
      message: eventsMissing.length ? eventsMissing.join(" · ") : "Listo",
    },
    trainings: {
      ok: trainingsMissing.length === 0,
      message: trainingsMissing.length ? trainingsMissing.join(" · ") : "Listo",
    },
    honors: {
      ok: honorsMissing.length === 0,
      message: honorsMissing.length ? honorsMissing.join(" · ") : "Listo",
    },
    uniforms: {
      ok: uniformsMissing.length === 0,
      message: uniformsMissing.length ? uniformsMissing.join(" · ") : "Listo",
    },
  };
}

async function refreshIndexToggleAvailability(syncToFirestore = true) {
  try {
    const [availability, settingsSnap] = await Promise.all([
      getLandingSectionAvailability(),
      getDoc(doc(db, COL_CLUB_CONFIG, "index_settings")).catch(() => null),
    ]);

    const settings = settingsSnap?.exists?.() ? (settingsSnap.data() || {}) : {};
    const patch = {};

    const eventsChecked = settings.show_events !== false;
    const trainingsChecked = settings.show_trainings !== false;
    const honorsChecked = settings.show_honors !== false;
    const uniformsChecked = settings.show_uniforms !== false;

    setToggleAvailability(
      $.idxShowEvents,
      $.idxShowEventsState,
      availability.events.ok,
      eventsChecked,
      availability.events.message
    );
    setToggleAvailability(
      $.idxShowTrainings,
      $.idxShowTrainingsState,
      availability.trainings.ok,
      trainingsChecked,
      availability.trainings.message
    );
    setToggleAvailability(
      $.idxShowHonors,
      $.idxShowHonorsState,
      availability.honors.ok,
      honorsChecked,
      availability.honors.message
    );
    setToggleAvailability(
      $.idxShowUniforms,
      $.idxShowUniformsState,
      availability.uniforms.ok,
      uniformsChecked,
      availability.uniforms.message
    );

    if (!availability.events.ok && settings.show_events !== false) {
      patch.show_events = false;
    }
    if (!availability.trainings.ok && settings.show_trainings !== false) {
      patch.show_trainings = false;
    }
    if (!availability.honors.ok && settings.show_honors !== false) {
      patch.show_honors = false;
    }
    if (!availability.uniforms.ok && settings.show_uniforms !== false) {
      patch.show_uniforms = false;
    }

    if (syncToFirestore && Object.keys(patch).length) {
      await setDoc(
        doc(db, COL_CLUB_CONFIG, "index_settings"),
        {
          ...patch,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("refreshIndexToggleAvailability error:", err);
  }
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
    bindCollapseCarets();
    bindResponsiveUI();

    await loadPendingUsers();
    await loadPlayers();
    try { await loadIndexSettingsAdmin(); } catch (e) { console.error("loadIndexSettingsAdmin", e); }
    try { await loadSocialLinks(); } catch (e) { console.error("loadSocialLinks", e); }
    try { await loadHonorsAdmin(); } catch (e) { console.error("loadHonorsAdmin", e); }
    try { await loadUniformsAdmin(); } catch (e) { console.error("loadUniformsAdmin", e); }
    try { await loadTrainingsAdmin(); } catch (e) { console.error("loadTrainingsAdmin", e); }
    try { await loadHeroAdmin(); } catch (e) { console.error("loadHeroAdmin", e); }
    try { await loadEventsAdmin(); } catch (e) { console.error("loadEventsAdmin", e); }
    try { await refreshIndexToggleAvailability(true); } catch (e) { console.error("refreshIndexToggleAvailability", e); }


    $.indexSettingsForm?.addEventListener("submit", saveIndexSettings);
    $.refreshPendingBtn?.addEventListener("click", loadPendingUsers);
    $.refreshPlayersBtn?.addEventListener("click", loadPlayers);
    $.playerSearchInput?.addEventListener("input", renderPlayersTable);
    $.playerRoleFilter?.addEventListener("change", renderPlayersTable);
    $.approveLinkMode?.addEventListener("change", syncApproveModeUI);
    $.approveUserForm?.addEventListener("submit", approveUserFlow);
    $.socialLinksForm?.addEventListener("submit", saveSocialLinks);
    $.heroSettingsForm?.addEventListener("submit", saveHeroSettings);
    $.eventsSettingsForm?.addEventListener("submit", saveEventsSettings);
    $.honorsSettingsForm?.addEventListener("submit", saveHonorSettings);
    $.honorForm?.addEventListener("submit", addHonor);
    $.uniformSettingsForm?.addEventListener("submit", saveUniformSettings);
    $.uniformForm?.addEventListener("submit", addUniform);
    $.trainingsSettingsForm?.addEventListener("submit", saveTrainingsTitle);
    $.trainingBlockForm?.addEventListener("submit", addTrainingRow);

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

      const deleteTrainingBtn = ev.target.closest("[data-delete-training-row]");
      if (deleteTrainingBtn) {
        await deleteTrainingRow(deleteTrainingBtn.getAttribute("data-delete-training-row"));
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
    showAlert(err?.message || "No se pudo cargar la pantalla de administración.");
  } finally {
    hideLoader();
    document.body.classList.remove("loading");
    document.documentElement.classList.remove("preload");
  }
}

boot();