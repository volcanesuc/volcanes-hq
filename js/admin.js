import { db, storage } from "./auth/firebase.js";
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

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_PLAYERS = COL.club_players;
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

  idxShowFeaturedActivity: document.getElementById("idxShowFeaturedActivity"),
  idxShowFeaturedActivityState: document.getElementById("idxShowFeaturedActivityState"),

  featuredActivitySettingsForm: document.getElementById("featuredActivitySettingsForm"),
  featuredActivityTitleInput: document.getElementById("featuredActivityTitleInput"),
  featuredActivitySubtitleInput: document.getElementById("featuredActivitySubtitleInput"),
  featuredActivityCtaEnabledInput: document.getElementById("featuredActivityCtaEnabledInput"),
  featuredActivityCtaTextInput: document.getElementById("featuredActivityCtaTextInput"),
  featuredActivityCtaUrlInput: document.getElementById("featuredActivityCtaUrlInput"),

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

    // ADMIN MAIN TABS
  adminMainTabs: document.getElementById("adminMainTabs"),

  // USERS TAB
  usersSearchInput: document.getElementById("usersSearchInput"),
  usersRoleFilter: document.getElementById("usersRoleFilter"),
  usersAssociationFilter: document.getElementById("usersAssociationFilter"),
  usersPickupsFilter: document.getElementById("usersPickupsFilter"),
  refreshUsersBtn: document.getElementById("refreshUsersBtn"),
  usersAdminTableBody: document.querySelector("#usersAdminTable tbody"),
  usersKpiTotal: document.getElementById("usersKpiTotal"),
  usersKpiPending: document.getElementById("usersKpiPending"),
  usersKpiNoPlayer: document.getElementById("usersKpiNoPlayer"),
  usersKpiPickups: document.getElementById("usersKpiPickups"),

  // REGISTER SETTINGS
  registerSettingsForm: document.getElementById("registerSettingsForm"),
  regEnableMembershipPayment: document.getElementById("regEnableMembershipPayment"),
  regRequireInfoDeclaration: document.getElementById("regRequireInfoDeclaration"),
  regRequireAssociationTerms: document.getElementById("regRequireAssociationTerms"),
  regRequireTerms: document.getElementById("regRequireTerms"),
  regTermsUrl: document.getElementById("regTermsUrl"),
  regInfoDeclarationText: document.getElementById("regInfoDeclarationText"),

  associationDetailsForm: document.getElementById("associationDetailsForm"),
  associationDetailsEnabled: document.getElementById("associationDetailsEnabled"),
  associationDetailsTitle: document.getElementById("associationDetailsTitle"),
  associationDetailsIntroHtml: document.getElementById("associationDetailsIntroHtml"),
  associationDetailsFeesTitle: document.getElementById("associationDetailsFeesTitle"),
  associationDetailsFeeParagraph1: document.getElementById("associationDetailsFeeParagraph1"),
  associationDetailsFeeParagraph2: document.getElementById("associationDetailsFeeParagraph2"),
  associationDetailsExceptionsText: document.getElementById("associationDetailsExceptionsText"),
};

let approveModal = null;
let allUsers = [];
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
  if ($.approveSystemRole) {
    $.approveSystemRole.innerHTML = APP_CONFIG.userRoles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
  }

  if ($.newPlayerFieldRole) {
    $.newPlayerFieldRole.innerHTML = APP_CONFIG.playerRoles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
  }

  if ($.playerRoleFilter) {
    $.playerRoleFilter.innerHTML =
      `<option value="">Todos los roles</option>` +
      `<option value="__unassigned__">Sin asignar</option>` +
      APP_CONFIG.userRoles
        .filter((r) => r.id)
        .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
        .join("");
  }

  if ($.usersRoleFilter) {
    $.usersRoleFilter.innerHTML =
      `<option value="">Todos</option>` +
      APP_CONFIG.userRoles
        .filter((r) => r.id)
        .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
        .join("");
  }
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function getUserProfile(user) {
  return user?.profile || {};
}

function getPlayerUser(player) {
  const userId = player?.userId || player?.uid || null;
  return userId ? usersById.get(userId) || null : null;
}

function getPlayerFullName(player) {
  const user = getPlayerUser(player);
  const profile = getUserProfile(user);

  const fromUser =
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    user?.displayName ||
    "";

  const legacy =
    `${player?.firstName || ""} ${player?.lastName || ""}`.trim() ||
    "";

  return (fromUser || legacy).trim();
}

function comparePlayersByName(a, b) {
  return getPlayerFullName(a).localeCompare(
    getPlayerFullName(b),
    "es",
    { sensitivity: "base" }
  );
}

// =========================
// PENDING USERS / PLAYERS
// =========================
async function loadUsersAdminTable() {
  if ($.usersAdminTableBody) {
    $.usersAdminTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-muted">Cargando…</td>
      </tr>
    `;
  }

  try {
    const [usersSnap, playersSnap] = await Promise.all([
      getDocs(collection(db, COL_USERS)),
      getDocs(collection(db, COL_PLAYERS)),
    ]);

    const playersById = new Map(
      playersSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() || {}) }])
    );

    allUsers = usersSnap.docs.map((d) => {
      const data = d.data() || {};
      const profile = data.profile || {};
      const membership = getMembershipSummary(data);
      const linkedPlayer = data.playerId ? playersById.get(data.playerId) || null : null;

      return {
        id: d.id,
        ...data,
        profile,
        membership,
        linkedPlayer,
      };
    });

    fillUsersRoleFilter();
    renderUsersAdminTable();
    renderUsersKpis();
  } catch (err) {
    console.error("loadUsersAdminTable error:", err);
    if ($.usersAdminTableBody) {
      $.usersAdminTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-danger">No se pudo cargar la tabla de usuarios.</td>
        </tr>
      `;
    }
  }
}

function fillUsersRoleFilter() {
  if (!$.usersRoleFilter) return;

  $.usersRoleFilter.innerHTML =
    `<option value="">Todos</option>` +
    APP_CONFIG.userRoles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
}

function renderUsersKpis() {
  if ($.usersKpiTotal) {
    $.usersKpiTotal.textContent = String(allUsers.length);
  }

  if ($.usersKpiPending) {
    $.usersKpiPending.textContent = String(
      allUsers.filter((u) => String(u.playerStatus || "").toLowerCase() === "pending").length
    );
  }

  if ($.usersKpiNoPlayer) {
    $.usersKpiNoPlayer.textContent = String(
      allUsers.filter((u) => !u.playerId).length
    );
  }

  if ($.usersKpiPickups) {
    $.usersKpiPickups.textContent = String(
      allUsers.filter((u) => u.canUsePickups === true).length
    );
  }
}

function renderUsersAdminTable() {
  if (!$.usersAdminTableBody) return;

  const term = normalizeText($.usersSearchInput?.value || "");
  const roleFilter = $.usersRoleFilter?.value || "";
  const associationFilter = $.usersAssociationFilter?.value || "";
  const pickupsFilter = $.usersPickupsFilter?.value || "";

  const filtered = allUsers.filter((u) => {
    const profile = u.profile || {};
    const fullName =
      `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
      profile.fullName ||
      u.displayName ||
      "";

    const haystack = normalizeText(
      [fullName, u.email || "", u.id || ""].join(" ")
    );

    const roleOk = !roleFilter || String(u.role || "") === roleFilter;

    let associationOk = true;
    const associationStatus = String(u.associationStatus || "").trim().toLowerCase();

    if (associationFilter === "active") {
      associationOk = associationStatus === "active";
    } else if (associationFilter === "inactive") {
      associationOk = associationStatus === "inactive";
    } else if (associationFilter === "none") {
      associationOk = !associationStatus;
    }

    let pickupsOk = true;
    if (pickupsFilter === "true") {
      pickupsOk = u.canUsePickups === true;
    } else if (pickupsFilter === "false") {
      pickupsOk = u.canUsePickups !== true;
    }

    return (!term || haystack.includes(term)) && roleOk && associationOk && pickupsOk;
  });

  if (!filtered.length) {
    $.usersAdminTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-muted">No hay usuarios para mostrar.</td>
      </tr>
    `;
    return;
  }

  $.usersAdminTableBody.innerHTML = filtered
    .sort((a, b) => {
      const aName = normalizeText(
        a?.profile?.fullName ||
        `${a?.profile?.firstName || ""} ${a?.profile?.lastName || ""}`.trim() ||
        a.displayName ||
        a.email ||
        a.id
      );

      const bName = normalizeText(
        b?.profile?.fullName ||
        `${b?.profile?.firstName || ""} ${b?.profile?.lastName || ""}`.trim() ||
        b.displayName ||
        b.email ||
        b.id
      );

      return aName.localeCompare(bName, "es");
    })
    .map((u) => {
      const profile = u.profile || {};
      const fullName =
        profile.fullName ||
        `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
        u.displayName ||
        "—";

      const membershipLabel = u.membership?.label || "—";
      const membershipStatus = u.membership?.status || "—";

      return `
        <tr>
          <td>
            <div class="d-flex flex-column">
              <strong>${esc(fullName)}</strong>
              <span class="small text-muted">${esc(u.email || "—")}</span>
              <span class="small text-muted">UID: ${esc(u.id || "—")}</span>
            </div>
          </td>

          <td>${renderStatusBadge(u.role || "viewer", "primary")}</td>

          <td>
            ${u.isPlayerActive === true
              ? renderStatusBadge("Activo", "success")
              : renderStatusBadge("Sin acceso", "warning")}
          </td>

          <td>
            ${u.playerId
              ? renderStatusBadge("Ligado", "success")
              : renderStatusBadge("Sin player", "neutral")}
          </td>

          <td>
            ${renderStatusBadge(u.associationStatus || "—", u.associationStatus === "active" ? "success" : "neutral")}
          </td>

          <td>
            <div class="d-flex flex-column">
              <span>${esc(membershipLabel)}</span>
              <span class="small text-muted">${esc(membershipStatus)}</span>
            </div>
          </td>

          <td>
            ${u.canUsePickups === true
              ? renderStatusBadge("Sí", "success")
              : renderStatusBadge("No", "neutral")}
          </td>

          <td>${esc(formatDateTime(u.lastSignInAt))}</td>

          <td>
            <button
              class="btn btn-sm btn-outline-primary"
              type="button"
              data-view-user="${esc(u.id)}"
            >
              Ver
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadPendingUsers() {
  $.pendingUsersTable.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando…</td></tr>`;

  const qy = query(
    collection(db, COL_USERS),
    where("onboardingComplete", "==", true),
    where("isPlayerActive", "==", false)
  );

  const snap = await getDocs(qy);

  pendingUsers = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => {
      const wantsPlayer = u?.registration?.wantsPlayer === true;
      const playerStatus = String(u?.playerStatus || "").trim().toLowerCase();
      return wantsPlayer && playerStatus === "pending";
    })
    .sort((a, b) => {
      const aName = normalizeText(
        a?.profile?.firstName && a?.profile?.lastName
          ? `${a.profile.firstName} ${a.profile.lastName}`
          : a.displayName || a.email || a.id
      );
      const bName = normalizeText(
        b?.profile?.firstName && b?.profile?.lastName
          ? `${b.profile.firstName} ${b.profile.lastName}`
          : b.displayName || b.email || b.id
      );
      return aName.localeCompare(bName, "es");
    });

  if (!pendingUsers.length) {
    $.pendingUsersTable.innerHTML = `<tr><td colspan="5" class="text-muted">No hay cuentas pendientes.</td></tr>`;
    return;
  }

  $.pendingUsersTable.innerHTML = pendingUsers
    .map((u) => {
      const profile = getUserProfile(u);
      const name =
        `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
        u.displayName ||
        "—";

      return `
        <tr>
          <td>${esc(u.email || "—")}</td>
          <td>${esc(name)}</td>
          <td>${esc(u.playerId || "—")}</td>
          <td>${esc(u.role || "viewer")}</td>
          <td>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-sm btn-primary" type="button" data-approve-user="${esc(u.id)}">
                Aprobar
              </button>
              <button class="btn btn-sm btn-outline-danger" type="button" data-deny-user="${esc(u.id)}">
                Denegar
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadPlayers() {
  $.playersTable.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando…</td></tr>`;

  const [playersSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, COL_PLAYERS)),
    getDocs(collection(db, COL_USERS)),
  ]);

  usersById = new Map(
    usersSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() || {}) }])
  );

  allPlayers = playersSnap.docs
    .map((d) => {
      const data = d.data() || {};
      const userId = data.userId || data.uid || null;
      const user = userId ? usersById.get(userId) : null;
      const profile = getUserProfile(user);
      const hasUserAssigned = Boolean(userId && user);

      return {
        id: d.id,
        ...data,
        userId,
        hasUserAssigned,
        systemRole: user?.role || "",
        linkedUserEmail: user?.email || "",
        linkedUserName:
          `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
          user?.displayName ||
          "",
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
  const term = normalizeText($.playerSearchInput?.value || "");
  const roleFilter = $.playerRoleFilter?.value || "";

  const filtered = allPlayers.filter((p) => {
    const fullName = normalizeText(getPlayerFullName(p));
    const email = normalizeText(p.linkedUserEmail || "");
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
        <td>${esc(p.linkedUserEmail || "—")}</td>
        <td>${esc(p.systemRole || "Sin asignar")}</td>
        <td>${esc(p.userId || "—")}</td>
        <td>${esc(p.id || "—")}</td>
      </tr>
    `)
    .join("");
}

function fillExistingPlayersSelect(currentUid = null, currentEmail = "") {
  const normalizedEmail = normalizeText(currentEmail);

  const availablePlayers = allPlayers.filter((p) => {
    const linkedUserId = p.userId || null;
    return !linkedUserId || linkedUserId === currentUid;
  });

  availablePlayers.sort((a, b) => {
    const aName = normalizeText(getPlayerFullName(a));
    const bName = normalizeText(getPlayerFullName(b));

    const aEmail = normalizeText(a.linkedUserEmail || "");
    const bEmail = normalizeText(b.linkedUserEmail || "");

    const aMatch = normalizedEmail && aEmail === normalizedEmail ? 1 : 0;
    const bMatch = normalizedEmail && bEmail === normalizedEmail ? 1 : 0;

    if (aMatch !== bMatch) return bMatch - aMatch;
    return aName.localeCompare(bName, "es");
  });

  $.approveExistingPlayerId.innerHTML =
    `<option value="">Seleccionar…</option>` +
    availablePlayers
      .map((p) => {
        const name = getPlayerFullName(p) || p.id;
        const suffix = p.linkedUserEmail ? ` · ${p.linkedUserEmail}` : "";
        return `<option value="${esc(p.id)}">${esc(name + suffix)}</option>`;
      })
      .join("");
}

function syncApproveModeUI() {
  if (!$.approveLinkMode) return;

  const mode = $.approveLinkMode.value;

  if ($.existingPlayerWrap) {
    $.existingPlayerWrap.classList.toggle("d-none", mode !== "existing");
  }

  if ($.newPlayerWrap) {
    $.newPlayerWrap.classList.toggle("d-none", mode !== "new");
  }
}

async function openApproveModal(uid) {
  if (!approveModal) {
    showAlert("El modal de aprobación no está disponible en esta vista.");
    return;
  }

  const user = pendingUsers.find((u) => u.id === uid);
  if (!user) return;

  const profile = getUserProfile(user);

  if ($.approveUid) $.approveUid.value = user.id;
  if ($.approveEmail) $.approveEmail.value = user.email || "";
  if ($.approveSystemRole) $.approveSystemRole.value = user.role || "viewer";
  if ($.approveLinkMode) $.approveLinkMode.value = user.playerId ? "existing" : "none";

  fillExistingPlayersSelect(uid, user.email || "");
  if ($.approveExistingPlayerId) {
    $.approveExistingPlayerId.value = user.playerId || "";
  }

  if ($.newPlayerFirstName) $.newPlayerFirstName.value = profile.firstName || "";
  if ($.newPlayerLastName) $.newPlayerLastName.value = profile.lastName || "";
  if ($.newPlayerBirthday) $.newPlayerBirthday.value = profile.birthDate || "";
  if ($.newPlayerFieldRole) $.newPlayerFieldRole.value = "";

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
  const currentUserId = data.userId || data.uid || null;

  if (currentUserId && currentUserId !== uid) {
    throw new Error("Ese jugador ya está ligado a otro usuario.");
  }

  return data;
}

async function getRequiredUserProfile(uid) {
  const snap = await getDoc(doc(db, COL_USERS, uid));
  if (!snap.exists()) {
    throw new Error("El usuario no existe.");
  }

  const user = snap.data() || {};
  const profile = getUserProfile(user);

  if (!profile.firstName || !profile.lastName) {
    throw new Error("El usuario no tiene nombre y apellido en su perfil.");
  }

  return { user, profile };
}

async function createPlayerForUser({
  uid,
  fieldRole,
  gender = null,
  number = null,
}) {
  const ref = await addDoc(collection(db, COL_PLAYERS), {
    active: true,
    userId: uid || null,
    fieldRole: fieldRole || null,
    gender,
    number,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

async function linkExistingPlayer({ playerId, uid }) {
  await updateDoc(doc(db, COL_PLAYERS, playerId), {
    userId: uid || null,
    updatedAt: serverTimestamp(),
  });
}

async function approveUserFlow(ev) {
  ev.preventDefault();
  hideAlert();

  const uid = $.approveUid.value;
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
      });
    }

    if (mode === "new") {
      await getRequiredUserProfile(uid);

      const fieldRole = $.newPlayerFieldRole.value || null;

      playerId = await createPlayerForUser({
        uid,
        fieldRole,
      });
    }

    await updateDoc(doc(db, COL_USERS, uid), {
      isPlayerActive: true,
      role: systemRole,
      playerId: playerId || null,
      updatedAt: serverTimestamp(),
    });

    approveModal.hide();
    await Promise.all([loadPendingUsers(), loadPlayers()]);
    showAlert("Cuenta aprobada correctamente.", "success");
  } catch (err) {
    console.error(err);
    showAlert(err.message || "No se pudo aprobar la cuenta.");
  } finally {
    hideLoader();
  }
}

async function denyUserFlow(uid) {
  if (!uid) {
    showAlert("No se encontró el usuario a denegar.");
    return;
  }

  const ok = window.confirm("¿Seguro que deseas denegar el ingreso a la plataforma para este usuario?");
  if (!ok) return;

  showLoader("Denegando ingreso…");
  hideAlert();

  try {
    await updateDoc(doc(db, COL_USERS, uid), {
      isPlayerActive: false,
      playerStatus: "rejected",
      role: "viewer",
      playerId: null,
      updatedAt: serverTimestamp(),
    });

    await loadPendingUsers();
    showAlert("Ingreso a la plataforma denegado correctamente.", "success");
  } catch (err) {
    console.error(err);
    showAlert(err?.message || "No se pudo denegar el ingreso.");
  } finally {
    hideLoader();
  }
}

// =========================
// INDEX SETTINGS
// =========================
async function loadIndexSettingsAdmin() {
  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "index_settings"));
    const data = snap.exists() ? (snap.data() || {}) : {};

    if ($.idxShowEvents) $.idxShowEvents.checked = data.show_events !== false;
    if ($.idxShowTrainings) $.idxShowTrainings.checked = data.show_trainings !== false;
    if ($.idxShowHonors) $.idxShowHonors.checked = data.show_honors !== false;
    if ($.idxShowUniforms) $.idxShowUniforms.checked = data.show_uniforms !== false;
    if ($.idxShowFeaturedActivity) $.idxShowFeaturedActivity.checked = data.show_featured_activity !== false;
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
      show_featured_activity: availability.featuredActivity.ok ? !!$.idxShowFeaturedActivity?.checked : false,
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

// =========================
// HERO
// =========================
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

// =========================
// TRAININGS
// =========================
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
    if ($.trainingBlockId) $.trainingBlockId.value = "trainings";

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

// =========================
// EVENTS
// =========================
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

// =========================
// SOCIAL
// =========================
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

// =========================
// EVENTS (SMALL)
// =========================
async function saveFeaturedActivitySettings(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "featured_activity"),
      {
        title: ($.featuredActivityTitleInput.value || "").trim(),
        subtitle: ($.featuredActivitySubtitleInput.value || "").trim(),
        ctaEnabled: !!$.featuredActivityCtaEnabledInput.checked,
        ctaText: ($.featuredActivityCtaTextInput.value || "").trim(),
        ctaUrl: safeUrl($.featuredActivityCtaUrlInput.value),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await refreshIndexToggleAvailability(true);
    showAlert("Actividad destacada guardada.", "success");
    await loadFeaturedActivityAdmin();
  } catch (err) {
    console.error("saveFeaturedActivitySettings error:", err);
    showAlert("No se pudo guardar la actividad destacada.");
  }
}

async function loadFeaturedActivityAdmin() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "featured_activity")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  $.featuredActivityTitleInput.value = data.title || "";
  $.featuredActivitySubtitleInput.value = data.subtitle || "";
  $.featuredActivityCtaEnabledInput.checked = data.ctaEnabled === true;
  $.featuredActivityCtaTextInput.value = data.ctaText || "";
  $.featuredActivityCtaUrlInput.value = data.ctaUrl || "";
}

// =========================
// HONORS
// =========================
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

// =========================
// UNIFORMS
// =========================
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

// =========================
// DATE HELPERS
// =========================
function formatDateTime(value) {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : value instanceof Date
        ? value
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("es-CR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return "—";
  }
}

function getMembershipSummary(user) {
  const membership = user?.currentMembership || {};
  const label = membership?.label || "—";
  const status = membership?.status || "—";
  return { label, status };
}

function renderStatusBadge(value, tone = "neutral") {
  const safe = esc(value || "—");
  return `<span class="admin-badge admin-badge--${esc(tone)}">${safe}</span>`;
}
// =========================
// UI HELPERS
// =========================
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

// =========================
// LOAD SETTINGS
// =========================

async function loadRegisterSettingsAdmin() {
  try {
    const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "public_registration"));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const associationDetails = data.association_details || {};

    if ($.regEnableMembershipPayment) {
      $.regEnableMembershipPayment.checked = data.enableMembershipPayment === true;
    }

    if ($.regRequireInfoDeclaration) {
      $.regRequireInfoDeclaration.checked = data.requireInfoDeclaration === true;
    }

    if ($.regRequireAssociationTerms) {
      $.regRequireAssociationTerms.checked = data.requireAssociationTerms === true;
    }

    if ($.regRequireTerms) {
      $.regRequireTerms.checked = data.requireTerms === true;
    }

    if ($.regTermsUrl) {
      $.regTermsUrl.value = data.termsUrl || "";
    }

    if ($.regInfoDeclarationText) {
      $.regInfoDeclarationText.value = data.infoDeclarationText || "";
    }

    if ($.associationDetailsEnabled) {
      $.associationDetailsEnabled.checked = associationDetails.enabled !== false;
    }

    if ($.associationDetailsTitle) {
      $.associationDetailsTitle.value = associationDetails.title || "";
    }

    if ($.associationDetailsIntroHtml) {
      $.associationDetailsIntroHtml.value = associationDetails.introHtml || "";
    }

    if ($.associationDetailsFeesTitle) {
      $.associationDetailsFeesTitle.value = associationDetails.feesTitle || "";
    }

    if ($.associationDetailsFeeParagraph1) {
      $.associationDetailsFeeParagraph1.value = associationDetails.feeParagraph1 || "";
    }

    if ($.associationDetailsFeeParagraph2) {
      $.associationDetailsFeeParagraph2.value = associationDetails.feeParagraph2 || "";
    }

    if ($.associationDetailsExceptionsText) {
      $.associationDetailsExceptionsText.value = associationDetails.exceptionsText || "";
    }
  } catch (err) {
    console.error("loadRegisterSettingsAdmin error:", err);
    showAlert("No se pudo cargar la configuración de registro.");
  }
}

async function saveRegisterSettings(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "public_registration"),
      {
        enableMembershipPayment: !!$.regEnableMembershipPayment?.checked,
        requireInfoDeclaration: !!$.regRequireInfoDeclaration?.checked,
        requireAssociationTerms: !!$.regRequireAssociationTerms?.checked,
        requireTerms: !!$.regRequireTerms?.checked,
        termsUrl: safeUrl($.regTermsUrl?.value || ""),
        infoDeclarationText: ($.regInfoDeclarationText?.value || "").trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showAlert("Configuración de registro guardada.", "success");
  } catch (err) {
    console.error("saveRegisterSettings error:", err);
    showAlert("No se pudo guardar la configuración de registro.");
  }
}

async function saveAssociationDetails(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "public_registration"),
      {
        association_details: {
          enabled: !!$.associationDetailsEnabled?.checked,
          title: ($.associationDetailsTitle?.value || "").trim(),
          introHtml: ($.associationDetailsIntroHtml?.value || "").trim(),
          feesTitle: ($.associationDetailsFeesTitle?.value || "").trim(),
          feeParagraph1: ($.associationDetailsFeeParagraph1?.value || "").trim(),
          feeParagraph2: ($.associationDetailsFeeParagraph2?.value || "").trim(),
          exceptionsText: ($.associationDetailsExceptionsText?.value || "").trim(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    showAlert("Association details guardado correctamente.", "success");
  } catch (err) {
    console.error("saveAssociationDetails error:", err);
    showAlert("No se pudo guardar association details.");
  }
}

// =========================
// LANDING TOGGLES
// =========================
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
    featuredActivitySnap,
    eventsSnap,
    trainingsSnap,
    honorsSnap,
    uniformsSnap,
  ] = await Promise.all([
    getDoc(doc(db, COL_CLUB_CONFIG, "featured_activity")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "events")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "trainings")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "honors")).catch(() => null),
    getDoc(doc(db, COL_CLUB_CONFIG, "uniforms")).catch(() => null),
  ]);

  const featuredActivityData = featuredActivitySnap?.exists?.() ? (featuredActivitySnap.data() || {}) : {};
  const eventsData = eventsSnap?.exists?.() ? (eventsSnap.data() || {}) : {};
  const trainingsData = trainingsSnap?.exists?.() ? (trainingsSnap.data() || {}) : {};
  const honorsData = honorsSnap?.exists?.() ? (honorsSnap.data() || {}) : {};
  const uniformsData = uniformsSnap?.exists?.() ? (uniformsSnap.data() || {}) : {};

  const featuredActivityMissing = [];
  if (!(featuredActivityData.title || "").trim()) featuredActivityMissing.push("falta título");
  if (!(featuredActivityData.subtitle || "").trim()) featuredActivityMissing.push("falta subtítulo");
  if (featuredActivityData.ctaEnabled === true) {
    if (!(featuredActivityData.ctaText || "").trim()) featuredActivityMissing.push("falta texto CTA");
    if (!safeUrl(featuredActivityData.ctaUrl || "")) featuredActivityMissing.push("falta URL CTA");
  }

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
    featuredActivity: {
      ok: featuredActivityMissing.length === 0,
      message: featuredActivityMissing.length ? featuredActivityMissing.join(" · ") : "Listo",
    },
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

    const featuredActivityChecked = settings.show_featured_activity !== false;
    const eventsChecked = settings.show_events !== false;
    const trainingsChecked = settings.show_trainings !== false;
    const honorsChecked = settings.show_honors !== false;
    const uniformsChecked = settings.show_uniforms !== false;

    setToggleAvailability(
      $.idxShowFeaturedActivity,
      $.idxShowFeaturedActivityState,
      availability.featuredActivity.ok,
      featuredActivityChecked,
      availability.featuredActivity.message
    );

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

    if (!availability.featuredActivity.ok && settings.show_featured_activity !== false) {
      patch.show_featured_activity = false;
    }
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

// =========================
// BOOT
// =========================
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

    const approveModalEl = document.getElementById("approveUserModal");
    approveModal = approveModalEl ? new bootstrap.Modal(approveModalEl) : null;

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
    try { await loadFeaturedActivityAdmin(); } catch (e) { console.error("loadFeaturedActivityAdmin", e); }
    try { await loadEventsAdmin(); } catch (e) { console.error("loadEventsAdmin", e); }
    try { await refreshIndexToggleAvailability(true); } catch (e) { console.error("refreshIndexToggleAvailability", e); }
    try { await loadRegisterSettingsAdmin(); } catch (e) { console.error("loadRegisterSettingsAdmin", e); }
    try { await loadUsersAdminTable(); } catch (e) { console.error("loadUsersAdminTable", e); }

    $.indexSettingsForm?.addEventListener("submit", saveIndexSettings);
    $.refreshPendingBtn?.addEventListener("click", loadPendingUsers);
    $.refreshPlayersBtn?.addEventListener("click", loadPlayers);
    $.playerSearchInput?.addEventListener("input", renderPlayersTable);
    $.playerRoleFilter?.addEventListener("change", renderPlayersTable);
    $.approveLinkMode?.addEventListener("change", syncApproveModeUI);
    $.approveUserForm?.addEventListener("submit", approveUserFlow);
    $.socialLinksForm?.addEventListener("submit", saveSocialLinks);
    $.heroSettingsForm?.addEventListener("submit", saveHeroSettings);
    $.featuredActivitySettingsForm?.addEventListener("submit", saveFeaturedActivitySettings);
    $.eventsSettingsForm?.addEventListener("submit", saveEventsSettings);
    $.honorsSettingsForm?.addEventListener("submit", saveHonorSettings);
    $.honorForm?.addEventListener("submit", addHonor);
    $.uniformSettingsForm?.addEventListener("submit", saveUniformSettings);
    $.uniformForm?.addEventListener("submit", addUniform);
    $.trainingsSettingsForm?.addEventListener("submit", saveTrainingsTitle);
    $.trainingBlockForm?.addEventListener("submit", addTrainingRow);

    $.registerSettingsForm?.addEventListener("submit", saveRegisterSettings);
    $.associationDetailsForm?.addEventListener("submit", saveAssociationDetails);

    $.refreshUsersBtn?.addEventListener("click", loadUsersAdminTable);
    $.usersSearchInput?.addEventListener("input", renderUsersAdminTable);
    $.usersRoleFilter?.addEventListener("change", renderUsersAdminTable);
    $.usersAssociationFilter?.addEventListener("change", renderUsersAdminTable);
    $.usersPickupsFilter?.addEventListener("change", renderUsersAdminTable);

    document.addEventListener("click", async (ev) => {
      const viewUserBtn = ev.target.closest("[data-view-user]");
      if (viewUserBtn) {
        const uid = viewUserBtn.getAttribute("data-view-user");
        console.log("Abrir detalle de usuario:", uid);
        return;
      }

      const approveBtn = ev.target.closest("[data-approve-user]");
      if (approveBtn) {
        await openApproveModal(approveBtn.getAttribute("data-approve-user"));
        return;
      }

      const denyBtn = ev.target.closest("[data-deny-user]");
      if (denyBtn) {
        await denyUserFlow(denyBtn.getAttribute("data-deny-user"));
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