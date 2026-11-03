// js/auth/permissions.js
// Qué puede hacer el usuario actual dentro de una pantalla (editar, exportar…).
// La regla vive en /js/core/me.js; acá quedan los helpers para mostrar/ocultar elementos.
import { auth } from "./firebase.js";
import { capabilitiesFor, loadAccess, clearAccessCache } from "../core/me.js";

export async function getCurrentPermissions(force = false) {
  const access = await loadAccess(auth.currentUser?.uid, { force });
  return { ...access.caps, isPlayerActive: access.isPlayerActive };
}

// Compatibilidad: accessInfo = { role, isPlayerActive } (formato de getUserAccess).
export function buildPermissions(accessInfo) {
  return { ...capabilitiesFor(accessInfo?.role, { canView: accessInfo?.isPlayerActive === true }), isPlayerActive: accessInfo?.isPlayerActive === true };
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
  clearAccessCache();
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