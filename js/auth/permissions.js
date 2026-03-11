// js/auth/permissions.js
import { auth } from "./firebase.js";
import { getUserAccess } from "./role-routing.js";

let cachedPermissions = null;
let cachedUid = null;

export async function getCurrentPermissions(force = false) {
  const uid = auth.currentUser?.uid || null;

  if (!uid) {
    return buildPermissions(null);
  }

  if (!force && cachedPermissions && cachedUid === uid) {
    return cachedPermissions;
  }

  const accessInfo = await getUserAccess(uid);
  const permissions = buildPermissions(accessInfo);

  cachedUid = uid;
  cachedPermissions = permissions;

  return permissions;
}

export function buildPermissions(accessInfo) {
  const active = accessInfo?.isActive === true;
  const role = active
    ? String(accessInfo?.role || "viewer").trim().toLowerCase()
    : "viewer";

  const isAdmin = ["admin", "owner"].includes(role);
  const isEditor = ["editor", "manager"].includes(role);
  const isViewer = role === "viewer";

  const canManageContent = isAdmin || isEditor;
  const canExportReports = isAdmin || isEditor;

  return {
    active,
    role,

    isAdmin,
    isEditor,
    isViewer,

    // generales
    canView: active,

    // capacidades base
    canManageContent,
    canExportReports,

    // torneos / roster
    canManageRoster: canManageContent,
    canEditTournament: canManageContent,
    canManagePayments: canManageContent,
    canCreateGuests: canManageContent,

    // asistencia
    canExportAttendancePdf: canExportReports,

    // futuro
    canEditTrainings: canManageContent,
    canEditPlaybook: canManageContent,
    canEditPlayers: canManageContent
  };
}

export function showIf(condition, ...elements) {
  elements.flat().forEach((el) => {
    if (!el) return;
    el.classList.toggle("d-none", !condition);
  });
}

export function hideIf(condition, ...elements) {
  elements.flat().forEach((el) => {
    if (!el) return;
    el.classList.toggle("d-none", !!condition);
  });
}

export function clearPermissionsCache() {
  cachedPermissions = null;
  cachedUid = null;
}

export function applyVisibilityByPermission(permissions, permissionKey, ...elements) {
  const allowed = !!permissions?.[permissionKey];

  elements.flat().forEach((el) => {
    if (!el) return;
    el.classList.toggle("d-none", !allowed);
  });

  return allowed;
}

export function applyDisabledByPermission(permissions, permissionKey, ...elements) {
  const allowed = !!permissions?.[permissionKey];

  elements.flat().forEach((el) => {
    if (!el) return;
    el.disabled = !allowed;
    el.classList.toggle("disabled", !allowed);
    el.setAttribute("aria-disabled", String(!allowed));
  });

  return allowed;
}

export function applyVisibilityMap(permissions, map) {
  if (!map || typeof map !== "object") return;

  Object.entries(map).forEach(([permissionKey, elements]) => {
    applyVisibilityByPermission(permissions, permissionKey, elements);
  });
}