import { loadHeaderTabsConfig, isTabEnabled } from "./remote-config.js";
import { PAGE_CONFIG, HOME_HREF } from "./config/page-config.js";
import { APP_CONFIG } from "./config/config.js";

import { db } from "./auth/firebase.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_SYSTEM_CONFIG = COL.system_config || "system_config";

function waitForAuthReady() {
  const auth = getAuth();

  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

function normalizeRole(role) {
  return String(role || "viewer").trim().toLowerCase();
}

function normalizePlayerStatus(data = {}) {
  const explicit = String(data.playerStatus || "").trim().toLowerCase();

  if (explicit === "active" || explicit === "approved") return "active";
  if (["pending", "submitted", "validating"].includes(explicit)) return "pending";
  if (["rejected", "denied"].includes(explicit)) return "rejected";

  if (data.isPlayerActive === true || data.isActive === true) {
    return "active";
  }

  return "";
}

function normalizeAssociationStatus(data = {}) {
  const explicit = String(data.associationStatus || "").trim().toLowerCase();

  if (explicit === "payment_validation_pending") return "pending";
  if (explicit === "associated_active") return "active";
  if (explicit === "associated_rejected") return "rejected";

  return explicit || "";
}

function getDefaultRolePermissions(roleId = "") {
  const role = normalizeRole(roleId);

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

  if (role === "admin") {
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
    id: normalizeRole(role?.id),
    label: role?.label || role?.id || "",
    permissions: mergePermissions(base, role?.permissions || {}),
  };
}

function mergeRolesWithFallback(firebaseRoles = [], fallbackRoles = []) {
  const byId = new Map();

  for (const role of fallbackRoles || []) {
    if (!role?.id) continue;
    const normalized = normalizeRoleDefinition(role);
    byId.set(normalized.id, normalized);
  }

  for (const role of firebaseRoles || []) {
    if (!role?.id) continue;
    const prev = byId.get(normalizeRole(role.id)) || normalizeRoleDefinition({ id: role.id, label: role.label });
    const normalized = normalizeRoleDefinition({
      ...prev,
      ...role,
      permissions: mergePermissions(prev.permissions || {}, role.permissions || {}),
    });
    byId.set(normalized.id, normalized);
  }

  return Array.from(byId.values());
}

async function loadRolesCatalog() {
  try {
    const snap = await getDoc(doc(db, COL_SYSTEM_CONFIG, "roles"));
    const data = snap.exists() ? (snap.data() || {}) : {};
    const firebaseRoles = Array.isArray(data.roles) ? data.roles : [];
    const fallbackRoles = Array.isArray(APP_CONFIG.userRoles) ? APP_CONFIG.userRoles : [];
    return mergeRolesWithFallback(firebaseRoles, fallbackRoles);
  } catch (err) {
    console.warn("No se pudo cargar system_config/roles:", err);
    const fallbackRoles = Array.isArray(APP_CONFIG.userRoles) ? APP_CONFIG.userRoles : [];
    return mergeRolesWithFallback([], fallbackRoles);
  }
}

function hasFullPlatformAccess(data = {}, permissions = {}) {
  const associationStatus = normalizeAssociationStatus(data);
  const playerStatus = normalizePlayerStatus(data);

  return (
    associationStatus === "active" ||
    playerStatus === "active" ||
    data.isPlayerActive === true ||
    permissions?.tabs?.admin === true ||
    permissions?.tabs?.association === true ||
    permissions?.tabs?.accountability === true
  );
}

async function loadUserRoleIntoCfg(cfg) {
  const user = getAuth().currentUser;

  if (!user) {
    return {
      ...cfg,
      role: "viewer",
      isAdmin: false,
      isPlayerActive: false,
      onboardingComplete: false,
      playerStatus: "",
      associationStatus: "",
      permissions: getDefaultRolePermissions("viewer"),
    };
  }

  try {
    const [snap, roles] = await Promise.all([
      getDoc(doc(db, COL.users, user.uid)),
      loadRolesCatalog(),
    ]);

    if (!snap.exists()) {
      return {
        ...cfg,
        role: "viewer",
        isAdmin: false,
        isPlayerActive: false,
        onboardingComplete: false,
        playerStatus: "",
        associationStatus: "",
        permissions: getDefaultRolePermissions("viewer"),
      };
    }

    const data = snap.data() || {};
    const role = normalizeRole(data.role || "viewer");
    const onboardingComplete = data.onboardingComplete === true;

    const playerStatus = normalizePlayerStatus(data);
    const associationStatus = normalizeAssociationStatus(data);
    const isPlayerActive = playerStatus === "active";
    const roleDef =
      roles.find((r) => normalizeRole(r.id) === role) ||
      normalizeRoleDefinition({ id: role });

    const permissions = roleDef.permissions || getDefaultRolePermissions(role);

    return {
      ...cfg,
      userData: data,
      role,
      isAdmin: role === "admin",
      isPlayerActive,
      onboardingComplete,
      playerStatus,
      associationStatus,
      permissions,
      hasFullPlatformAccess: hasFullPlatformAccess(data, permissions),
    };
  } catch (err) {
    console.warn("No se pudo cargar rol/permisos:", err);
    return {
      ...cfg,
      role: "viewer",
      isAdmin: false,
      isPlayerActive: false,
      onboardingComplete: false,
      playerStatus: "",
      associationStatus: "",
      permissions: getDefaultRolePermissions("viewer"),
      hasFullPlatformAccess: false,
    };
  }
}

function canAccessPageByPermissions(pageKey, cfg) {
  const tabs = cfg?.permissions?.tabs || {};

  if (pageKey === "admin") return tabs.admin === true;
  if (pageKey === "association") return tabs.association === true;
  if (pageKey === "accountability") return tabs.accountability === true;

  return true;
}

export async function guardPage(pageKey) {
  let cfg = await loadHeaderTabsConfig();

  await waitForAuthReady();
  cfg = await loadUserRoleIntoCfg(cfg);

  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  if (cfg.onboardingComplete !== true && cfg.hasFullPlatformAccess !== true) {
    window.location.href = "/public/register.html";
    return { cfg, redirected: true };
  }

  if (cfg.hasFullPlatformAccess !== true) {
    if (
      cfg.associationStatus === "pending" ||
      cfg.associationStatus === "active" ||
      cfg.associationStatus === "rejected"
    ) {
      window.location.href = "/member_status.html";
      return { cfg, redirected: true };
    }

    if (cfg.isPlayerActive !== true) {
      if (cfg.playerStatus === "pending") {
        window.location.href = "/index.html?state=platform_pending";
      } else {
        window.location.href = HOME_HREF;
      }
      return { cfg, redirected: true };
    }
  }

  const page = PAGE_CONFIG[pageKey];
  if (!page) return { cfg, redirected: false };

  if (!isTabEnabled(page.tabId, cfg)) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  if (!canAccessPageByPermissions(pageKey, cfg)) {
    window.location.href = HOME_HREF;
    return { cfg, redirected: true };
  }

  return { cfg, redirected: false };
}