// js/auth/permissions.js
import { auth } from "./firebase.js";
import { getUserRole } from "./role-routing.js";

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

  const roleInfo = await getUserRole(uid);
  const permissions = buildPermissions(roleInfo);

  cachedUid = uid;
  cachedPermissions = permissions;

  return permissions;
}

export function buildPermissions(roleInfo) {
  const active = roleInfo?.active === true;
  const role = active
    ? String(roleInfo?.role || "viewer").toLowerCase()
    : "viewer";

  const isAdmin = ["admin", "owner"].includes(role);
  const isEditor = ["editor", "manager"].includes(role);
  const isViewer = role === "viewer";

  return {
    active,
    role,
    isAdmin,
    isEditor,
    isViewer,

    canView: true,
    canEditTournament: isAdmin || isEditor,
    canManageRoster: isAdmin || isEditor,
    canManagePayments: isAdmin || isEditor,
    canCreateGuests: isAdmin || isEditor
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