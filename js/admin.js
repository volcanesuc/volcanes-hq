import { db, storage } from "./auth/firebase.js";
import { APP_CONFIG } from "./config/config.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { loadAdminEditUserModal } from "./components/admin-edit-user-modal.js";
import { showLoader, hideLoader } from "./ui/loader.js";

import {
  collection,
  doc,
  getDocs,
  getDoc,
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
const COL_SYSTEM_CONFIG = COL.system_config || "system_config";

const $ = {
  alertBox: document.getElementById("alertBox"),

  // landing
  indexSettingsForm: document.getElementById("indexSettingsForm"),
  idxShowEvents: document.getElementById("idxShowEvents"),
  idxShowTrainings: document.getElementById("idxShowTrainings"),
  idxShowHonors: document.getElementById("idxShowHonors"),
  idxShowUniforms: document.getElementById("idxShowUniforms"),
  idxShowEventsState: document.getElementById("idxShowEventsState"),
  idxShowTrainingsState: document.getElementById("idxShowTrainingsState"),
  idxShowHonorsState: document.getElementById("idxShowHonorsState"),
  idxShowUniformsState: document.getElementById("idxShowUniformsState"),
  idxShowFeaturedActivity: document.getElementById("idxShowFeaturedActivity"),
  idxShowFeaturedActivityState: document.getElementById("idxShowFeaturedActivityState"),

  heroSettingsForm: document.getElementById("heroSettingsForm"),
  heroTitleInput: document.getElementById("heroTitleInput"),
  heroDescriptionInput: document.getElementById("heroDescriptionInput"),
  heroImageUrlInput: document.getElementById("heroImageUrlInput"),
  heroImageFileInput: document.getElementById("heroImageFileInput"),
  heroImagePreview: document.getElementById("heroImagePreview"),

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

  honorsSettingsForm: document.getElementById("honorsSettingsForm"),
  honorsTitle: document.getElementById("honorsTitle"),
  honorForm: document.getElementById("honorForm"),
  honorPosition: document.getElementById("honorPosition"),
  honorTournament: document.getElementById("honorTournament"),
  honorYear: document.getElementById("honorYear"),
  honorsTableBody: document.getElementById("honorsTableBody"),

  featuredActivitySettingsForm: document.getElementById("featuredActivitySettingsForm"),
  featuredActivityTitleInput: document.getElementById("featuredActivityTitleInput"),
  featuredActivitySubtitleInput: document.getElementById("featuredActivitySubtitleInput"),
  featuredActivityCtaEnabledInput: document.getElementById("featuredActivityCtaEnabledInput"),
  featuredActivityCtaTextInput: document.getElementById("featuredActivityCtaTextInput"),
  featuredActivityCtaUrlInput: document.getElementById("featuredActivityCtaUrlInput"),

  eventsSettingsForm: document.getElementById("eventsSettingsForm"),
  eventTitleInput: document.getElementById("eventTitleInput"),
  eventSubtitleInput: document.getElementById("eventSubtitleInput"),
  eventImage1Input: document.getElementById("eventImage1Input"),
  eventImage2Input: document.getElementById("eventImage2Input"),
  eventImage3Input: document.getElementById("eventImage3Input"),
  eventCtaEnabledInput: document.getElementById("eventCtaEnabledInput"),
  eventCtaTextInput: document.getElementById("eventCtaTextInput"),
  eventCtaUrlInput: document.getElementById("eventCtaUrlInput"),

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

  // users
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

  // permissions
  rolesPermissionsTableBody: document.getElementById("rolesPermissionsTableBody"),
  refreshRolesPermissionsBtn: document.getElementById("refreshRolesPermissionsBtn"),

  // register settings
  registerSettingsForm: document.getElementById("registerSettingsForm"),
  regEnableMembershipPayment: document.getElementById("regEnableMembershipPayment"),
  regRequireInfoDeclaration: document.getElementById("regRequireInfoDeclaration"),
  regRequireAssociationTerms: document.getElementById("regRequireAssociationTerms"),
  regRequireTerms: document.getElementById("regRequireTerms"),
  regTermsUrl: document.getElementById("regTermsUrl"),
  regAssocTermsUrl: document.getElementById("regAssocTermsUrl"),
  regInfoDeclarationText: document.getElementById("regInfoDeclarationText"),

  associationDetailsForm: document.getElementById("associationDetailsForm"),
  associationDetailsEnabled: document.getElementById("associationDetailsEnabled"),
  associationDetailsTitle: document.getElementById("associationDetailsTitle"),
  associationDetailsIntroHtml: document.getElementById("associationDetailsIntroHtml"),
  associationDetailsFeesTitle: document.getElementById("associationDetailsFeesTitle"),
  associationDetailsFeeParagraph1: document.getElementById("associationDetailsFeeParagraph1"),
  associationDetailsFeeParagraph2: document.getElementById("associationDetailsFeeParagraph2"),
  associationDetailsExceptionsText: document.getElementById("associationDetailsExceptionsText"),

  // approve modal
  approveUserForm: document.getElementById("approveUserForm"),
  approveUid: document.getElementById("approveUid"),
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

  // dynamic modal refs
  editUserForm: null,
  editUid: null,
  editEmail: null,
  editSystemRole: null,
  editAssociationStatus: null,
  editCanUsePickups: null,
  editIsPlayerActive: null,
  editPlayerMode: null,
  editExistingPlayerId: null,
  editExistingPlayerWrap: null,
  editNewPlayerWrap: null,
  editNewPlayerFirstName: null,
  editNewPlayerLastName: null,
  editNewPlayerBirthday: null,
  editNewPlayerFieldRole: null,
};

let approveModal = null;
let editUserModal = null;

let allUsers = [];
let allPlayers = [];
let pendingUsers = [];
let usersById = new Map();

let trainingsBlocks = [];
let honorsItems = [];
let uniformsItems = [];
let availableRoles = [];

function bindDynamicDomRefs() {
  $.editUserForm = document.getElementById("editUserForm");
  $.editUid = document.getElementById("editUid");
  $.editEmail = document.getElementById("editEmail");
  $.editSystemRole = document.getElementById("editSystemRole");
  $.editAssociationStatus = document.getElementById("editAssociationStatus");
  $.editCanUsePickups = document.getElementById("editCanUsePickups");
  $.editIsPlayerActive = document.getElementById("editIsPlayerActive");

  $.editPlayerMode = document.getElementById("editPlayerMode");
  $.editExistingPlayerId = document.getElementById("editExistingPlayerId");
  $.editExistingPlayerWrap = document.getElementById("editExistingPlayerWrap");
  $.editNewPlayerWrap = document.getElementById("editNewPlayerWrap");
  $.editNewPlayerFirstName = document.getElementById("editNewPlayerFirstName");
  $.editNewPlayerLastName = document.getElementById("editNewPlayerLastName");
  $.editNewPlayerBirthday = document.getElementById("editNewPlayerBirthday");
  $.editNewPlayerFieldRole = document.getElementById("editNewPlayerFieldRole");
}

function showAlert(msg, type = "danger") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.textContent = msg;
  $.alertBox.classList.remove("d-none");
}

function hideAlert() {
  $.alertBox?.classList.add("d-none");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function getUserProfile(user) {
  return user?.profile || {};
}

function getMembershipSummary(user) {
  const membership = user?.currentMembership || {};
  return {
    label: membership?.label || "—",
    status: membership?.status || "—",
  };
}

function renderStatusBadge(value, tone = "neutral") {
  return `<span class="admin-badge admin-badge--${esc(tone)}">${esc(value || "—")}</span>`;
}

function getRoleTone(role) {
  switch (String(role || "").trim().toLowerCase()) {
    case "admin":
      return "danger";
    case "coach":
      return "success";
    case "staff":
      return "info";
    case "viewer":
      return "neutral";
    case "accountability":
      return "warning";
    case "content_editor":
      return "primary";
    default:
      return "neutral";
  }
}

function getRoleRowClass(role) {
  switch (String(role || "").trim().toLowerCase()) {
    case "admin":
      return "admin-users-row admin-users-row--admin";
    case "coach":
      return "admin-users-row admin-users-row--coach";
    case "staff":
      return "admin-users-row admin-users-row--staff";
    case "viewer":
      return "admin-users-row admin-users-row--viewer";
    case "accountability":
      return "admin-users-row admin-users-row--accountability";
    case "content_editor":
      return "admin-users-row admin-users-row--content-editor";
    default:
      return "";
  }
}

function ensureUsersRoleStyles() {
  if (document.getElementById("adminUsersRoleStyles")) return;

  const style = document.createElement("style");
  style.id = "adminUsersRoleStyles";
  style.textContent = `
    .admin-users-row--admin > td { background: rgba(220, 53, 69, 0.06); }
    .admin-users-row--coach > td { background: rgba(25, 135, 84, 0.06); }
    .admin-users-row--staff > td { background: rgba(13, 202, 240, 0.06); }
    .admin-users-row--viewer > td { background: rgba(108, 117, 125, 0.04); }
    .admin-users-row--accountability > td { background: rgba(255, 193, 7, 0.08); }
    .admin-users-row--content-editor > td { background: rgba(13, 110, 253, 0.06); }
  `;
  document.head.appendChild(style);
}

function getFullUserName(user) {
  const profile = getUserProfile(user);

  return (
    profile.fullName ||
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    user?.displayName ||
    user?.email ||
    user?.id ||
    "—"
  );
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
  return getPlayerFullName(a).localeCompare(getPlayerFullName(b), "es", {
    sensitivity: "base",
  });
}

function isPendingUser(user) {
  const wantsPlayer = user?.registration?.wantsPlayer === true;
  const playerStatus = String(user?.playerStatus || "").trim().toLowerCase();
  return wantsPlayer && playerStatus === "pending";
}

/* =========================================================
   ROLES / PERMISSIONS
========================================================= */

function getDefaultRolePermissions(roleId = "") {
  const normalized = String(roleId || "").trim().toLowerCase();

  const defaults = {
    tabs: {
      admin: false,
      association: false,
      accountability: false,
    },
    adminSections: {
      users: false,
      landingSections: false,
      registerSettings: false,
    },
  };

  if (normalized === "admin") {
    defaults.tabs.admin = true;
    defaults.tabs.association = true;
    defaults.tabs.accountability = true;
    defaults.adminSections.users = true;
    defaults.adminSections.landingSections = true;
    defaults.adminSections.registerSettings = true;
  }

  return defaults;
}

function mergePermissions(base = {}, incoming = {}) {
  return {
    tabs: {
      ...(base.tabs || {}),
      ...(incoming.tabs || {}),
    },
    adminSections: {
      ...(base.adminSections || {}),
      ...(incoming.adminSections || {}),
    },
  };
}

function normalizeRoleDefinition(role = {}) {
  const base = getDefaultRolePermissions(role?.id);
  return {
    id: String(role?.id || "").trim(),
    label: role?.label || role?.id || "",
    permissions: mergePermissions(base, role?.permissions || {}),
  };
}

function mergeRolesWithFallback(firebaseRoles = [], fallbackRoles = []) {
  const byId = new Map();

  for (const role of fallbackRoles) {
    if (!role?.id) continue;
    const normalized = normalizeRoleDefinition({
      id: String(role.id),
      label: role.label || role.id,
      permissions: role.permissions || {},
    });
    byId.set(String(normalized.id), normalized);
  }

  for (const role of firebaseRoles) {
    if (!role?.id) continue;
    const previous = byId.get(String(role.id)) || { id: role.id, label: role.label || role.id };
    const normalized = normalizeRoleDefinition({
      ...previous,
      ...role,
      permissions: mergePermissions(previous.permissions || {}, role.permissions || {}),
    });
    byId.set(String(normalized.id), normalized);
  }

  return Array.from(byId.values());
}

async function loadRolesCatalog() {
  try {
    const snap = await getDoc(doc(db, COL_SYSTEM_CONFIG, "roles"));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const firebaseRoles = Array.isArray(data.roles) ? data.roles : [];
    const fallbackRoles = Array.isArray(APP_CONFIG.userRoles) ? APP_CONFIG.userRoles : [];

    availableRoles = mergeRolesWithFallback(firebaseRoles, fallbackRoles);
  } catch (err) {
    console.error("loadRolesCatalog error:", err);
    const fallbackRoles = Array.isArray(APP_CONFIG.userRoles) ? APP_CONFIG.userRoles : [];
    availableRoles = mergeRolesWithFallback([], fallbackRoles);
  }

  if (!availableRoles.length) {
    availableRoles = [
      normalizeRoleDefinition({ id: "admin", label: "Admin" }),
      normalizeRoleDefinition({ id: "coach", label: "Coach" }),
      normalizeRoleDefinition({ id: "staff", label: "Staff" }),
      normalizeRoleDefinition({ id: "viewer", label: "Viewer" }),
    ];
  }
}

function getRolesForSelect() {
  return Array.isArray(availableRoles) && availableRoles.length
    ? availableRoles
    : Array.isArray(APP_CONFIG.userRoles)
    ? mergeRolesWithFallback([], APP_CONFIG.userRoles)
    : [];
}

function getRolePermission(role, path, fallback = false) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cursor = role?.permissions || {};

  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || !(part in cursor)) {
      return fallback;
    }
    cursor = cursor[part];
  }

  return cursor === true;
}

function renderRolePermissionsTable() {
  if (!$.rolesPermissionsTableBody) return;

  const roles = getRolesForSelect();

  if (!roles.length) {
    $.rolesPermissionsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-muted">No hay roles configurados.</td>
      </tr>
    `;
    return;
  }

  $.rolesPermissionsTableBody.innerHTML = roles
    .map((role) => `
      <tr data-role-row="${esc(role.id)}">
        <td>
          <div class="d-flex flex-column">
            <strong>${esc(role.label || role.id)}</strong>
            <span class="small text-muted">${esc(role.id)}</span>
          </div>
        </td>

        <td class="text-center">
          <input
            type="checkbox"
            class="form-check-input"
            data-role-permission="${esc(role.id)}"
            data-permission-path="tabs.admin"
            ${getRolePermission(role, "tabs.admin") ? "checked" : ""}
          />
        </td>

        <td class="text-center">
          <input
            type="checkbox"
            class="form-check-input"
            data-role-permission="${esc(role.id)}"
            data-permission-path="tabs.association"
            ${getRolePermission(role, "tabs.association") ? "checked" : ""}
          />
        </td>

        <td class="text-center">
          <input
            type="checkbox"
            class="form-check-input"
            data-role-permission="${esc(role.id)}"
            data-permission-path="tabs.accountability"
            ${getRolePermission(role, "tabs.accountability") ? "checked" : ""}
          />
        </td>

        <td class="text-center">
          <input
            type="checkbox"
            class="form-check-input"
            data-role-permission="${esc(role.id)}"
            data-permission-path="adminSections.users"
            ${getRolePermission(role, "adminSections.users") ? "checked" : ""}
          />
        </td>

        <td class="text-center">
          <input
            type="checkbox"
            class="form-check-input"
            data-role-permission="${esc(role.id)}"
            data-permission-path="adminSections.landingSections"
            ${getRolePermission(role, "adminSections.landingSections") ? "checked" : ""}
          />
        </td>

        <td class="text-center">
          <input
            type="checkbox"
            class="form-check-input"
            data-role-permission="${esc(role.id)}"
            data-permission-path="adminSections.registerSettings"
            ${getRolePermission(role, "adminSections.registerSettings") ? "checked" : ""}
          />
        </td>

        <td class="text-end">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            data-save-role-permissions="${esc(role.id)}"
          >
            Guardar
          </button>
        </td>
      </tr>
    `)
    .join("");
}

async function loadRolesPermissionsAdmin() {
  if (!$.rolesPermissionsTableBody) return;

  $.rolesPermissionsTableBody.innerHTML = `
    <tr>
      <td colspan="8" class="text-muted">Cargando roles…</td>
    </tr>
  `;

  try {
    await loadRolesCatalog();
    fillStaticOptions();
    renderRolePermissionsTable();
  } catch (err) {
    console.error("loadRolesPermissionsAdmin error:", err);
    $.rolesPermissionsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-danger">No se pudo cargar la matriz de permisos.</td>
      </tr>
    `;
  }
}

async function saveRolePermissions(roleId) {
  const normalizedRoleId = String(roleId || "").trim();
  if (!normalizedRoleId) {
    showAlert("No se encontró el rol a guardar.");
    return;
  }

  const role = getRolesForSelect().find((item) => String(item.id) === normalizedRoleId);
  if (!role) {
    showAlert("No se encontró la definición del rol.");
    return;
  }

  const escapedRoleId = typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(normalizedRoleId)
    : normalizedRoleId.replace(/"/g, '\\"');

  const base = getDefaultRolePermissions(normalizedRoleId);

  const nextRole = normalizeRoleDefinition({
    ...role,
    permissions: mergePermissions(base, {
      tabs: {
        admin: !!document.querySelector(`[data-role-permission="${escapedRoleId}"][data-permission-path="tabs.admin"]`)?.checked,
        association: !!document.querySelector(`[data-role-permission="${escapedRoleId}"][data-permission-path="tabs.association"]`)?.checked,
        accountability: !!document.querySelector(`[data-role-permission="${escapedRoleId}"][data-permission-path="tabs.accountability"]`)?.checked,
      },
      adminSections: {
        users: !!document.querySelector(`[data-role-permission="${escapedRoleId}"][data-permission-path="adminSections.users"]`)?.checked,
        landingSections: !!document.querySelector(`[data-role-permission="${escapedRoleId}"][data-permission-path="adminSections.landingSections"]`)?.checked,
        registerSettings: !!document.querySelector(`[data-role-permission="${escapedRoleId}"][data-permission-path="adminSections.registerSettings"]`)?.checked,
      },
    }),
  });

  showLoader(`Guardando permisos de ${nextRole.label || nextRole.id}…`);

  try {
    const merged = getRolesForSelect().map((item) =>
      String(item.id) === normalizedRoleId ? nextRole : normalizeRoleDefinition(item)
    );

    await setDoc(
      doc(db, COL_SYSTEM_CONFIG, "roles"),
      {
        roles: merged.map((item) => normalizeRoleDefinition(item)),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    availableRoles = merged;
    fillStaticOptions();
    renderRolePermissionsTable();
    showAlert(`Permisos del rol ${nextRole.label || nextRole.id} guardados correctamente.`, "success");
  } catch (err) {
    console.error("saveRolePermissions error:", err);
    showAlert(err?.message || "No se pudieron guardar los permisos del rol.");
  } finally {
    hideLoader();
  }
}

function fillStaticOptions() {
  const roles = getRolesForSelect();

  if ($.approveSystemRole) {
    $.approveSystemRole.innerHTML = roles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
  }

  if ($.editSystemRole) {
    $.editSystemRole.innerHTML = roles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
  }

  if ($.newPlayerFieldRole) {
    $.newPlayerFieldRole.innerHTML = APP_CONFIG.playerRoles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
  }

  if ($.editNewPlayerFieldRole) {
    $.editNewPlayerFieldRole.innerHTML = APP_CONFIG.playerRoles
      .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
      .join("");
  }

  if ($.usersRoleFilter) {
    $.usersRoleFilter.innerHTML =
      `<option value="">Todos</option>` +
      roles
        .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
        .join("");
  }
}

async function loadCoreUsersPlayers() {
  const [usersSnap, playersSnap] = await Promise.all([
    getDocs(collection(db, COL_USERS)),
    getDocs(collection(db, COL_PLAYERS)),
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

  const playersById = new Map(allPlayers.map((p) => [p.id, p]));

  allUsers = usersSnap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      ...data,
      profile: data.profile || {},
      membership: getMembershipSummary(data),
      linkedPlayer: data.playerId ? playersById.get(data.playerId) || null : null,
    };
  });

  pendingUsers = allUsers
    .filter(isPendingUser)
    .sort((a, b) => normalizeText(getFullUserName(a)).localeCompare(normalizeText(getFullUserName(b)), "es"));
}

function renderUsersKpis() {
  if ($.usersKpiTotal) $.usersKpiTotal.textContent = String(allUsers.length);
  if ($.usersKpiPending) $.usersKpiPending.textContent = String(pendingUsers.length);
  if ($.usersKpiNoPlayer) $.usersKpiNoPlayer.textContent = String(allUsers.filter((u) => !u.playerId).length);
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
    const fullName = getFullUserName(u);
    const haystack = normalizeText([fullName, u.email || "", u.id || ""].join(" "));
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
    .sort((a, b) =>
      normalizeText(getFullUserName(a)).localeCompare(normalizeText(getFullUserName(b)), "es")
    )
    .map((u) => {
      const fullName = getFullUserName(u);
      const associationStatus = String(u.associationStatus || "").trim().toLowerCase();
      const membershipLabel = u.membership?.label || "—";
      const membershipStatus = u.membership?.status || "—";
      const pending = isPendingUser(u);
      const rowClass = getRoleRowClass(u.role);

      return `
        <tr class="${esc(rowClass)}">
          <td>
            <div class="d-flex flex-column">
              <strong>${esc(fullName)}</strong>
              <span class="small text-muted">${esc(u.email || "—")}</span>
              <span class="small text-muted">UID: ${esc(u.id || "—")}</span>
            </div>
          </td>

          <td>${renderStatusBadge(u.role || "viewer", getRoleTone(u.role))}</td>

          <td>
            ${
              u.isPlayerActive === true
                ? renderStatusBadge("Activo", "success")
                : pending
                ? renderStatusBadge("Pendiente", "warning")
                : renderStatusBadge("Sin acceso", "neutral")
            }
          </td>

          <td>
            ${
              u.playerId
                ? renderStatusBadge("Ligado", "success")
                : renderStatusBadge("Sin player", "neutral")
            }
          </td>

          <td>
            ${
              renderStatusBadge(
                u.associationStatus || "—",
                associationStatus === "active" ? "success" : "neutral"
              )
            }
          </td>

          <td>
            <div class="d-flex flex-column">
              <span>${esc(membershipLabel)}</span>
              <span class="small text-muted">${esc(membershipStatus)}</span>
            </div>
          </td>

          <td>
            ${
              u.canUsePickups === true
                ? renderStatusBadge("Sí", "success")
                : renderStatusBadge("No", "neutral")
            }
          </td>

          <td>${esc(formatDateTime(u.lastSignInAt))}</td>

          <td>
            <div class="d-flex gap-2 flex-wrap">
              <button
                class="btn btn-sm btn-outline-primary"
                type="button"
                data-edit-user="${esc(u.id)}"
              >
                Editar
              </button>

              ${
                pending
                  ? `
                    <button
                      class="btn btn-sm btn-primary"
                      type="button"
                      data-approve-user="${esc(u.id)}"
                    >
                      Aprobar
                    </button>
                    <button
                      class="btn btn-sm btn-outline-danger"
                      type="button"
                      data-deny-user="${esc(u.id)}"
                    >
                      Denegar
                    </button>
                  `
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadUsersAdminTable() {
  if ($.usersAdminTableBody) {
    $.usersAdminTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-muted">Cargando…</td>
      </tr>
    `;
  }

  try {
    await loadCoreUsersPlayers();
    renderUsersKpis();
    renderUsersAdminTable();
  } catch (err) {
    console.error("loadUsersAdminTable error:", err);
    if ($.usersAdminTableBody) {
      $.usersAdminTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="text-danger">No se pudo cargar la tabla de usuarios.</td>
        </tr>
      `;
    }
    showAlert("No se pudo cargar la tabla de usuarios.");
  }
}

function fillExistingPlayersSelect(currentUid = null, currentEmail = "") {
  if (!$.approveExistingPlayerId) return;

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

function fillEditExistingPlayersSelect(currentUid = null, currentEmail = "", currentPlayerId = "") {
  if (!$.editExistingPlayerId) return;

  const normalizedEmail = normalizeText(currentEmail);

  const availablePlayers = allPlayers.filter((p) => {
    const linkedUserId = p.userId || null;
    return !linkedUserId || linkedUserId === currentUid || p.id === currentPlayerId;
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

  $.editExistingPlayerId.innerHTML =
    `<option value="">Seleccionar…</option>` +
    availablePlayers
      .map((p) => {
        const name = getPlayerFullName(p) || p.id;
        const suffix = p.linkedUserEmail ? ` · ${p.linkedUserEmail}` : "";
        return `<option value="${esc(p.id)}">${esc(name + suffix)}</option>`;
      })
      .join("");
}

function syncEditPlayerModeUI() {
  const mode = $.editPlayerMode?.value || "none";

  if ($.editExistingPlayerWrap) {
    $.editExistingPlayerWrap.classList.toggle("d-none", mode !== "existing");
  }

  if ($.editNewPlayerWrap) {
    $.editNewPlayerWrap.classList.toggle("d-none", mode !== "new");
  }
}

async function unlinkUserFromCurrentPlayer(uid, currentPlayerId) {
  if (!uid || !currentPlayerId) return;

  const playerRef = doc(db, COL_PLAYERS, currentPlayerId);
  const snap = await getDoc(playerRef);
  if (!snap.exists()) return;

  const data = snap.data() || {};
  const linkedUserId = data.userId || data.uid || null;

  if (linkedUserId === uid) {
    await updateDoc(playerRef, {
      userId: null,
      updatedAt: serverTimestamp(),
    });
  }
}

function prefillEditNewPlayerFields(user) {
  const profile = getUserProfile(user);

  if ($.editNewPlayerFirstName) $.editNewPlayerFirstName.value = profile.firstName || "";
  if ($.editNewPlayerLastName) $.editNewPlayerLastName.value = profile.lastName || "";
  if ($.editNewPlayerBirthday) $.editNewPlayerBirthday.value = profile.birthDate || "";
  if ($.editNewPlayerFieldRole) $.editNewPlayerFieldRole.value = "";

  if (!$.editNewPlayerFirstName?.value && !$.editNewPlayerLastName?.value) {
    const displayName = String(user?.displayName || "").trim();
    if (displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        $.editNewPlayerFirstName.value = parts.slice(0, -1).join(" ");
        $.editNewPlayerLastName.value = parts.slice(-1).join(" ");
      } else if ($.editNewPlayerFirstName) {
        $.editNewPlayerFirstName.value = displayName;
      }
    }
  }
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
    showAlert("El modal de aprobación no está disponible.");
    return;
  }

  if (!allUsers.length || !allPlayers.length) {
    await loadCoreUsersPlayers();
  }

  const user = allUsers.find((u) => u.id === uid);
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

  if (!$.newPlayerFirstName?.value && !$.newPlayerLastName?.value) {
    const displayName = String(user.displayName || "").trim();
    if (displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        $.newPlayerFirstName.value = parts.slice(0, -1).join(" ");
        $.newPlayerLastName.value = parts.slice(-1).join(" ");
      } else if ($.newPlayerFirstName) {
        $.newPlayerFirstName.value = displayName;
      }
    }
  }

  syncApproveModeUI();
  approveModal.show();
}

function openEditUserModal(uid) {
  if (!editUserModal) {
    showAlert("El modal de edición no está disponible.");
    return;
  }

  const user = allUsers.find((u) => u.id === uid);
  if (!user) {
    showAlert("No se encontró el usuario.");
    return;
  }

  if ($.editUid) $.editUid.value = user.id || "";
  if ($.editEmail) $.editEmail.value = user.email || "";
  if ($.editSystemRole) $.editSystemRole.value = user.role || "viewer";
  if ($.editAssociationStatus) $.editAssociationStatus.value = user.associationStatus || "";
  if ($.editCanUsePickups) $.editCanUsePickups.checked = user.canUsePickups === true;
  if ($.editIsPlayerActive) $.editIsPlayerActive.checked = user.isPlayerActive === true;

  fillEditExistingPlayersSelect(user.id, user.email || "", user.playerId || "");
  prefillEditNewPlayerFields(user);

  if ($.editPlayerMode) {
    $.editPlayerMode.value = user.playerId ? "existing" : "none";
  }

  if ($.editExistingPlayerId) {
    $.editExistingPlayerId.value = user.playerId || "";
  }

  syncEditPlayerModeUI();
  editUserModal.show();
}

async function saveUserEditFlow(ev) {
  ev.preventDefault();
  hideAlert();

  const uid = $.editUid?.value;
  if (!uid) {
    showAlert("No se encontró el usuario a editar.");
    return;
  }

  showLoader("Guardando usuario…");

  try {
    const user = allUsers.find((u) => u.id === uid) || null;
    const currentPlayerId = user?.playerId || null;
    const playerMode = $.editPlayerMode?.value || "none";

    let finalPlayerId = null;

    if (playerMode === "none") {
      await unlinkUserFromCurrentPlayer(uid, currentPlayerId);
      finalPlayerId = null;
    }

    if (playerMode === "existing") {
      const selectedPlayerId = $.editExistingPlayerId?.value || null;
      if (!selectedPlayerId) {
        throw new Error("Selecciona un jugador existente.");
      }

      await assertPlayerCanBeLinked(selectedPlayerId, uid);

      if (currentPlayerId && currentPlayerId !== selectedPlayerId) {
        await unlinkUserFromCurrentPlayer(uid, currentPlayerId);
      }

      await linkExistingPlayer({ playerId: selectedPlayerId, uid });
      finalPlayerId = selectedPlayerId;
    }

    if (playerMode === "new") {
      const firstName = ($.editNewPlayerFirstName?.value || "").trim();
      const lastName = ($.editNewPlayerLastName?.value || "").trim();
      const birthDate = ($.editNewPlayerBirthday?.value || "").trim();
      const fieldRole = ($.editNewPlayerFieldRole?.value || "").trim() || null;

      if (!firstName || !lastName) {
        throw new Error("Completa nombre y apellido para crear el jugador.");
      }

      if (currentPlayerId) {
        await unlinkUserFromCurrentPlayer(uid, currentPlayerId);
      }

      const newPlayerRef = await addDoc(collection(db, COL_PLAYERS), {
        active: true,
        userId: uid,
        firstName,
        lastName,
        birthDate: birthDate || null,
        fieldRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      finalPlayerId = newPlayerRef.id;
    }

    const nextIsPlayerActive = !!$.editIsPlayerActive?.checked;

    let nextPlayerStatus = null;
    if (nextIsPlayerActive) {
      nextPlayerStatus = "active";
    } else if (finalPlayerId) {
      nextPlayerStatus = "pending";
    }

    await updateDoc(doc(db, COL_USERS, uid), {
      role: $.editSystemRole?.value || "viewer",
      associationStatus: ($.editAssociationStatus?.value || "").trim() || null,
      canUsePickups: !!$.editCanUsePickups?.checked,
      isPlayerActive: nextIsPlayerActive,
      playerStatus: nextPlayerStatus,
      playerId: finalPlayerId || null,
      updatedAt: serverTimestamp(),
    });

    editUserModal?.hide();
    await loadUsersAdminTable();
    showAlert("Usuario actualizado correctamente.", "success");
  } catch (err) {
    console.error("saveUserEditFlow error:", err);
    showAlert(err?.message || "No se pudo actualizar el usuario.");
  } finally {
    hideLoader();
  }
}

async function assertPlayerCanBeLinked(playerId, uid) {
  if (!playerId) throw new Error("Selecciona un jugador válido.");

  const snap = await getDoc(doc(db, COL_PLAYERS, playerId));
  if (!snap.exists()) throw new Error("El jugador seleccionado no existe.");

  const data = snap.data() || {};
  const currentUserId = data.userId || data.uid || null;

  if (currentUserId && currentUserId !== uid) {
    throw new Error("Ese jugador ya está ligado a otro usuario.");
  }

  return data;
}

async function getRequiredUserProfile(uid) {
  const snap = await getDoc(doc(db, COL_USERS, uid));
  if (!snap.exists()) throw new Error("El usuario no existe.");

  const user = snap.data() || {};
  const profile = getUserProfile(user);

  if (!profile.firstName || !profile.lastName) {
    throw new Error("El usuario no tiene nombre y apellido en su perfil.");
  }

  return { user, profile };
}

async function createPlayerForUser({ uid, fieldRole, gender = null, number = null }) {
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

  const uid = $.approveUid?.value;
  const systemRole = $.approveSystemRole?.value || "viewer";
  const mode = $.approveLinkMode?.value || "none";

  if (!uid) {
    showAlert("No se encontró el usuario a aprobar.");
    return;
  }

  showLoader("Aprobando cuenta…");

  try {
    let playerId = null;

    if (mode === "existing") {
      playerId = $.approveExistingPlayerId?.value || null;
      if (!playerId) throw new Error("Selecciona un jugador existente.");

      await assertPlayerCanBeLinked(playerId, uid);
      await linkExistingPlayer({ playerId, uid });
    }

    if (mode === "new") {
      await getRequiredUserProfile(uid);
      const fieldRole = $.newPlayerFieldRole?.value || null;
      playerId = await createPlayerForUser({ uid, fieldRole });
    }

    await updateDoc(doc(db, COL_USERS, uid), {
      isPlayerActive: true,
      role: systemRole,
      playerId: playerId || null,
      playerStatus: "active",
      updatedAt: serverTimestamp(),
    });

    approveModal?.hide();
    await loadUsersAdminTable();
    showAlert("Cuenta aprobada correctamente.", "success");
  } catch (err) {
    console.error(err);
    showAlert(err?.message || "No se pudo aprobar la cuenta.");
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

    await loadUsersAdminTable();
    showAlert("Ingreso a la plataforma denegado correctamente.", "success");
  } catch (err) {
    console.error(err);
    showAlert(err?.message || "No se pudo denegar el ingreso.");
  } finally {
    hideLoader();
  }
}

// =========================
// LANDING
// =========================
async function loadIndexSettingsAdmin() {
  if (!$.indexSettingsForm) return;

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

    await setDoc(doc(db, COL_CLUB_CONFIG, "index_settings"), payload, { merge: true });
    await refreshIndexToggleAvailability(false);
    showAlert("Visibilidad del landing guardada.", "success");
  } catch (err) {
    console.error("saveIndexSettings error:", err);
    showAlert("No se pudo guardar la visibilidad del landing.");
  }
}

async function loadHeroAdmin() {
  if (!$.heroTitleInput) return;

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

    if ($.heroImageUrlInput && uploadedUrl) $.heroImageUrlInput.value = uploadedUrl;

    if ($.heroImagePreview) {
      if (finalImageUrl) {
        $.heroImagePreview.src = finalImageUrl;
        $.heroImagePreview.classList.remove("d-none");
      } else {
        $.heroImagePreview.src = "";
        $.heroImagePreview.classList.add("d-none");
      }
    }

    if ($.heroImageFileInput) $.heroImageFileInput.value = "";

    showAlert("Hero guardado correctamente.", "success");
    await loadHeroAdmin();
  } catch (err) {
    console.error("saveHeroSettings error:", err);
    showAlert(err?.message || "No se pudo guardar el hero.");
  }
}

async function loadTrainingsAdmin() {
  if (!$.trainingsTableBody || !$.trainingsTitle) return;

  $.trainingsTableBody.innerHTML = `<tr><td colspan="5" class="text-muted">Cargando…</td></tr>`;

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
        title: ($.trainingsTitle?.value || "").trim() || "Entrenamientos y Juegos",
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

  const blockId = ($.trainingBlockId?.value || "").trim();
  const blockName = ($.trainingBlockName?.value || "").trim();
  const day = ($.trainingDay?.value || "").trim();
  const time = ($.trainingTime?.value || "").trim();

  if (!blockId || !blockName || !day || !time) {
    showAlert("Completa bloque, nombre, día y hora.");
    return;
  }

  try {
    const ref = doc(db, COL_CLUB_CONFIG, "trainings");
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const currentBlocks = Array.isArray(data.blocks) ? [...data.blocks] : [];
    const title = ($.trainingsTitle?.value || "").trim() || data.title || "Entrenamientos y Juegos";

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
        title: ($.trainingsTitle?.value || "").trim() || data.title || "Entrenamientos y Juegos",
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

async function loadSocialLinks() {
  if (!$.socialInstagram) return;

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
        instagram: safeUrl($.socialInstagram?.value),
        facebook: safeUrl($.socialFacebook?.value),
        tiktok: safeUrl($.socialTiktok?.value),
        youtube: safeUrl($.socialYoutube?.value),
        x: safeUrl($.socialX?.value),
        whatsappUrl: safeUrl($.socialWhatsapp?.value),
        whatsappLabel: ($.socialWhatsappLabel?.value || "").trim() || "WhatsApp",
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

async function loadFeaturedActivityAdmin() {
  if (!$.featuredActivityTitleInput) return;

  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "featured_activity")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  $.featuredActivityTitleInput.value = data.title || "";
  $.featuredActivitySubtitleInput.value = data.subtitle || "";
  $.featuredActivityCtaEnabledInput.checked = data.ctaEnabled === true;
  $.featuredActivityCtaTextInput.value = data.ctaText || "";
  $.featuredActivityCtaUrlInput.value = data.ctaUrl || "";
}

async function saveFeaturedActivitySettings(ev) {
  ev.preventDefault();
  hideAlert();

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "featured_activity"),
      {
        title: ($.featuredActivityTitleInput?.value || "").trim(),
        subtitle: ($.featuredActivitySubtitleInput?.value || "").trim(),
        ctaEnabled: !!$.featuredActivityCtaEnabledInput?.checked,
        ctaText: ($.featuredActivityCtaTextInput?.value || "").trim(),
        ctaUrl: safeUrl($.featuredActivityCtaUrlInput?.value),
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

async function loadEventsAdmin() {
  if (!$.eventTitleInput) return;

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
      safeUrl($.eventImage1Input?.value),
      safeUrl($.eventImage2Input?.value),
      safeUrl($.eventImage3Input?.value),
    ].filter(Boolean);

    await setDoc(
      doc(db, COL_CLUB_CONFIG, "events"),
      {
        title: ($.eventTitleInput?.value || "").trim(),
        subtitle: ($.eventSubtitleInput?.value || "").trim(),
        images,
        ctaEnabled: !!$.eventCtaEnabledInput?.checked,
        ctaText: ($.eventCtaTextInput?.value || "").trim(),
        ctaUrl: safeUrl($.eventCtaUrlInput?.value),
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

async function loadHonorsAdmin() {
  if (!$.honorsTableBody || !$.honorsTitle) return;

  $.honorsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">Cargando…</td></tr>`;

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
        title: ($.honorsTitle?.value || "").trim() || "Palmarés",
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

  const position = ($.honorPosition?.value || "").trim();
  const tournament = ($.honorTournament?.value || "").trim();
  const year = Number($.honorYear?.value || 0);

  if (!position || !tournament || !year) {
    showAlert("Completa posición, torneo y año.");
    return;
  }

  try {
    const ref = doc(db, COL_CLUB_CONFIG, "honors");
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const currentItems = Array.isArray(data.items) ? [...data.items] : [];
    const nextItems = [...currentItems, { position, tournament, year }]
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));

    await setDoc(
      ref,
      {
        title: ($.honorsTitle?.value || "").trim() || data.title || "Palmarés",
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
        title: ($.honorsTitle?.value || "").trim() || data.title || "Palmarés",
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

async function loadUniformsAdmin() {
  if (!$.uniformsTableBody || !$.uniformsTitle) return;

  $.uniformsTableBody.innerHTML = `<tr><td colspan="4" class="text-muted">Cargando…</td></tr>`;

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
        title: ($.uniformsTitle?.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle?.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel?.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl?.value),
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

  const name = ($.uniformName?.value || "").trim();
  const category = ($.uniformCategory?.value || "").trim();
  const image = ($.uniformImage?.value || "").trim();

  if (!name || !image) {
    showAlert("Completa al menos nombre e imagen.");
    return;
  }

  const nextItems = [
    ...uniformsItems,
    { id: `uniform_${Date.now()}`, name, category, image }
  ].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" })
  );

  try {
    await setDoc(
      doc(db, COL_CLUB_CONFIG, "uniforms"),
      {
        title: ($.uniformsTitle?.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle?.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel?.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl?.value),
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
        title: ($.uniformsTitle?.value || "").trim() || "Uniformes del Equipo",
        subtitle: ($.uniformsSubtitle?.value || "").trim() || "",
        ctaLabel: ($.uniformsCtaLabel?.value || "").trim() || "Comprar",
        orderUrl: safeUrl($.uniformsOrderUrl?.value),
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
// REGISTER SETTINGS
// =========================
async function loadRegisterSettingsAdmin() {
  if (!$.registerSettingsForm) return;

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

    if ($.regAssocTermsUrl) {
      $.regAssocTermsUrl.value = data.assocTermsUrl || "";
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
        assocTermsUrl: safeUrl($.regAssocTermsUrl?.value || ""),
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
// TOGGLES
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
  if (!$.indexSettingsForm) return;

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

    if (!availability.featuredActivity.ok && settings.show_featured_activity !== false) patch.show_featured_activity = false;
    if (!availability.events.ok && settings.show_events !== false) patch.show_events = false;
    if (!availability.trainings.ok && settings.show_trainings !== false) patch.show_trainings = false;
    if (!availability.honors.ok && settings.show_honors !== false) patch.show_honors = false;
    if (!availability.uniforms.ok && settings.show_uniforms !== false) patch.show_uniforms = false;

    if (syncToFirestore && Object.keys(patch).length) {
      await setDoc(
        doc(db, COL_CLUB_CONFIG, "index_settings"),
        { ...patch, updatedAt: serverTimestamp() },
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

    ensureUsersRoleStyles();

    await loadHeader("admin", cfg);
    await loadAdminEditUserModal();
    bindDynamicDomRefs();
    await loadRolesCatalog();
    fillStaticOptions();
    syncApproveModeUI();

    const approveModalEl = document.getElementById("approveUserModal");
    approveModal = approveModalEl ? new bootstrap.Modal(approveModalEl) : null;

    const editUserModalEl = document.getElementById("editUserModal");
    editUserModal = editUserModalEl ? new bootstrap.Modal(editUserModalEl) : null;

    await Promise.all([
      loadIndexSettingsAdmin(),
      loadHeroAdmin(),
      loadTrainingsAdmin(),
      loadSocialLinks(),
      loadHonorsAdmin(),
      loadFeaturedActivityAdmin(),
      loadEventsAdmin(),
      loadUniformsAdmin(),
      loadRegisterSettingsAdmin(),
      loadRolesPermissionsAdmin(),
      loadUsersAdminTable(),
      refreshIndexToggleAvailability(true),
    ]);

    $.indexSettingsForm?.addEventListener("submit", saveIndexSettings);
    $.heroSettingsForm?.addEventListener("submit", saveHeroSettings);
    $.trainingsSettingsForm?.addEventListener("submit", saveTrainingsTitle);
    $.trainingBlockForm?.addEventListener("submit", addTrainingRow);
    $.socialLinksForm?.addEventListener("submit", saveSocialLinks);
    $.honorsSettingsForm?.addEventListener("submit", saveHonorSettings);
    $.honorForm?.addEventListener("submit", addHonor);
    $.featuredActivitySettingsForm?.addEventListener("submit", saveFeaturedActivitySettings);
    $.eventsSettingsForm?.addEventListener("submit", saveEventsSettings);
    $.uniformSettingsForm?.addEventListener("submit", saveUniformSettings);
    $.uniformForm?.addEventListener("submit", addUniform);

    $.approveLinkMode?.addEventListener("change", syncApproveModeUI);
    $.approveUserForm?.addEventListener("submit", approveUserFlow);

    $.editPlayerMode?.addEventListener("change", syncEditPlayerModeUI);
    $.editUserForm?.addEventListener("submit", saveUserEditFlow);

    $.registerSettingsForm?.addEventListener("submit", saveRegisterSettings);
    $.associationDetailsForm?.addEventListener("submit", saveAssociationDetails);

    $.refreshUsersBtn?.addEventListener("click", loadUsersAdminTable);
    $.refreshRolesPermissionsBtn?.addEventListener("click", loadRolesPermissionsAdmin);

    $.usersSearchInput?.addEventListener("input", renderUsersAdminTable);
    $.usersRoleFilter?.addEventListener("change", renderUsersAdminTable);
    $.usersAssociationFilter?.addEventListener("change", renderUsersAdminTable);
    $.usersPickupsFilter?.addEventListener("change", renderUsersAdminTable);

    document.addEventListener("click", async (ev) => {
      const editUserBtn = ev.target.closest("[data-edit-user]");
      if (editUserBtn) {
        openEditUserModal(editUserBtn.getAttribute("data-edit-user"));
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

      const saveRoleBtn = ev.target.closest("[data-save-role-permissions]");
      if (saveRoleBtn) {
        await saveRolePermissions(saveRoleBtn.getAttribute("data-save-role-permissions"));
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