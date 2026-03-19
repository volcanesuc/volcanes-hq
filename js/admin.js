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

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_PLAYERS = COL.club_players;
const COL_CLUB_CONFIG = COL.club_config;

const $ = {
  alertBox: document.getElementById("alertBox"),

  // users tab
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

  // register settings
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
};

let approveModal = null;
let allUsers = [];
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

  if ($.usersRoleFilter) {
    $.usersRoleFilter.innerHTML =
      `<option value="">Todos</option>` +
      APP_CONFIG.userRoles
        .map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`)
        .join("");
  }
}

async function loadCoreData() {
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
  if ($.usersKpiTotal) {
    $.usersKpiTotal.textContent = String(allUsers.length);
  }

  if ($.usersKpiPending) {
    $.usersKpiPending.textContent = String(pendingUsers.length);
  }

  if ($.usersKpiNoPlayer) {
    $.usersKpiNoPlayer.textContent = String(allUsers.filter((u) => !u.playerId).length);
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
                data-view-user="${esc(u.id)}"
              >
                Ver
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
    await loadCoreData();
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
    await loadCoreData();
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
      playerStatus: "approved",
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

  const ok = window.confirm(
    "¿Seguro que deseas denegar el ingreso a la plataforma para este usuario?"
  );
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

    await Promise.all([
      loadRegisterSettingsAdmin(),
      loadUsersAdminTable(),
    ]);

    $.approveLinkMode?.addEventListener("change", syncApproveModeUI);
    $.approveUserForm?.addEventListener("submit", approveUserFlow);

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
        const user = allUsers.find((u) => u.id === uid);
        if (user) {
          console.log("Detalle usuario:", user);
          showAlert(`Detalle no implementado todavía para: ${getFullUserName(user)}`, "warning");
        }
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