// /js/core/me.js
// Identidad, estados y permisos del usuario actual: UNA sola fuente para toda la app.
// La persona es users/{uid}. Todo lo que antes estaba copiado en header, page-guard,
// role-routing, permissions, auth, index, register y pickups_status sale de acá.
//
// Estados: users.status.player y users.status.association.
import { auth, db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_SYSTEM_CONFIG = COL.system_config || "system_config";

export const ROUTES = {
  landing: "/index.html",
  register: "/public/register.html",
  dashboard: "/dashboard.html",
  memberStatus: "/member_status.html",
  playerPending: "/index.html?state=platform_pending",
  pickupsOnly: "/pickups_status.html",
};

/* =========================
   Estados
========================= */
export function normalizeRole(role) {
  return String(role || "viewer").trim().toLowerCase() || "viewer";
}

// "active" | "pending" | "rejected" | ""
export function playerStatusOf(data = {}) {
  const raw = String(data?.status?.player ?? "").trim().toLowerCase();
  return ["active", "pending", "rejected", "inactive"].includes(raw) ? raw : "";
}

// "active" | "pending" | "rejected" | "expired" | ""
export function associationStatusOf(data = {}) {
  const raw = String(data?.status?.association ?? "").trim().toLowerCase();
  return ["active", "pending", "rejected", "expired"].includes(raw) ? raw : "";
}

/* =========================
   Permisos
========================= */
// Tabs y secciones de Ajustes por rol (editable en Ajustes › Usuarios › Permisos por rol).
export function defaultRolePermissions(roleId = "") {
  const role = normalizeRole(roleId);
  const isAdmin = role === "admin";
  return {
    tabs: {
      admin: isAdmin,
      association: isAdmin,
      accountability: isAdmin || role === "accountability",
    },
    adminSections: {
      users: isAdmin,
      landingSections: isAdmin,
      registerSettings: isAdmin,
    },
  };
}

export function mergePermissions(base = {}, incoming = {}) {
  return {
    tabs: { ...(base.tabs || {}), ...(incoming.tabs || {}) },
    adminSections: { ...(base.adminSections || {}), ...(incoming.adminSections || {}) },
  };
}

export function roleDefinition(role = {}) {
  const id = normalizeRole(role?.id);
  return {
    id,
    label: role?.label || role?.id || "",
    permissions: mergePermissions(defaultRolePermissions(id), role?.permissions || {}),
  };
}

let catalogPromise = null;

// Roles de config.js + lo que el admin guardó en system_config/roles.
export function loadRolesCatalog({ force = false } = {}) {
  if (catalogPromise && !force) return catalogPromise;
  catalogPromise = (async () => {
    const byId = new Map();
    for (const role of APP_CONFIG.userRoles || []) {
      if (role?.id) byId.set(normalizeRole(role.id), roleDefinition(role));
    }
    try {
      const snap = await getDoc(doc(db, COL_SYSTEM_CONFIG, "roles"));
      const saved = snap.exists() && Array.isArray(snap.data()?.roles) ? snap.data().roles : [];
      for (const role of saved) {
        if (!role?.id) continue;
        const prev = byId.get(normalizeRole(role.id)) || roleDefinition({ id: role.id });
        byId.set(
          normalizeRole(role.id),
          roleDefinition({ ...prev, ...role, permissions: mergePermissions(prev.permissions, role.permissions || {}) })
        );
      }
    } catch (err) {
      console.warn("[me] no se pudo leer system_config/roles:", err?.code || err);
    }
    return [...byId.values()];
  })();
  return catalogPromise;
}

// Qué puede hacer cada rol dentro de las pantallas (botones de editar, exportar, etc.).
const CAPABILITIES = {
  admin: ["content", "reports", "roster", "tournaments", "payments", "guests", "trainings", "playbook", "players"],
  coach: ["reports", "roster", "tournaments", "guests", "trainings", "playbook", "players"],
  staff: ["reports", "roster", "tournaments", "guests", "trainings", "playbook", "players"],
  content_editor: ["content", "playbook"],
  accountability: ["reports", "payments"],
  viewer: [],
};

export function capabilitiesFor(role, { canView = true } = {}) {
  const r = normalizeRole(role);
  const can = new Set(CAPABILITIES[r] || []);
  return {
    role: r,
    isAdmin: r === "admin",
    isEditor: ["coach", "staff", "content_editor"].includes(r),
    isViewer: r === "viewer",
    canView,

    canManageContent: can.has("content"),
    canExportReports: can.has("reports"),

    canManageRoster: can.has("roster"),
    canEditTournament: can.has("tournaments"),
    canManagePayments: can.has("payments"),
    canCreateGuests: can.has("guests"),

    canExportAttendancePdf: can.has("reports"),

    canEditTrainings: can.has("trainings"),
    canEditPlaybook: can.has("playbook"),
    canEditPlayers: can.has("players"),
  };
}

/* =========================
   Acceso
========================= */
// Puede usar la app completa: jugador activo, asociado activo o cualquier rol distinto de viewer.
export function hasFullAccess({ role, playerStatus, associationStatus, permissions } = {}) {
  const tabs = permissions?.tabs || {};
  return (
    playerStatus === "active" ||
    associationStatus === "active" ||
    normalizeRole(role) !== "viewer" ||
    tabs.admin === true ||
    tabs.association === true ||
    tabs.accountability === true
  );
}

function buildAccess(uid, data, exists, roleDef) {
  const role = normalizeRole(data.role);
  const playerStatus = playerStatusOf(data);
  const associationStatus = associationStatusOf(data);
  const permissions = roleDef?.permissions || defaultRolePermissions(role);
  const onboardingComplete = data.onboardingComplete === true;
  const full = !!uid && hasFullAccess({ role, playerStatus, associationStatus, permissions });

  return {
    uid,
    exists,
    userData: data,
    role,
    isAdmin: role === "admin",
    playerStatus,
    associationStatus,
    isPlayerActive: playerStatus === "active",
    onboardingComplete,
    canUsePickups: data.canUsePickups === true,
    permissions,
    hasFullPlatformAccess: full,
    caps: capabilitiesFor(role, { canView: full }),
  };
}

const accessCache = new Map(); // uid -> Promise<access>

// Estado completo de una persona. Se cachea por página (una sola lectura de users/{uid}).
export function loadAccess(uid = auth.currentUser?.uid, { force = false } = {}) {
  if (!uid) return Promise.resolve(buildAccess(null, {}, false, null));
  if (!force && accessCache.has(uid)) return accessCache.get(uid);

  const p = (async () => {
    try {
      const [snap, roles] = await Promise.all([getDoc(doc(db, COL.users, uid)), loadRolesCatalog()]);
      const data = snap.exists() ? snap.data() || {} : {};
      const role = normalizeRole(data.role);
      const roleDef = roles.find((r) => r.id === role) || roleDefinition({ id: role });
      return buildAccess(uid, data, snap.exists(), roleDef);
    } catch (err) {
      console.warn("[me] no se pudo leer el usuario:", err?.code || err);
      accessCache.delete(uid);
      return buildAccess(uid, {}, false, null);
    }
  })();

  accessCache.set(uid, p);
  return p;
}

export function clearAccessCache() {
  accessCache.clear();
}

// A dónde pertenece esta persona. Una sola regla para login, guard, registro e inicio.
export function destinationFor(access) {
  if (!access?.uid) return ROUTES.landing;
  if (access.hasFullPlatformAccess) return ROUTES.dashboard;
  if (!access.onboardingComplete) return ROUTES.register;
  if (["pending", "rejected", "expired"].includes(access.associationStatus)) return ROUTES.memberStatus;
  if (access.playerStatus === "pending") return ROUTES.playerPending;
  if (access.canUsePickups) return ROUTES.pickupsOnly;
  return ROUTES.landing;
}
