// js/models/player.js
import { APP_CONFIG } from "../config/config.js";

function normalizeRoleId(role) {
  return String(role || "").trim().toLowerCase();
}

function toStartCase(value) {
  return String(value || "")
    .trim()
    .replaceAll(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getConfigRoles() {
  return Array.isArray(APP_CONFIG?.playerRoles) ? APP_CONFIG.playerRoles : [];
}

function getDefaultRole() {
  const roles = getConfigRoles();
  return roles?.[0]?.id || "player";
}

export const PLAYER_ROLES = {
  get DEFAULT() {
    return getDefaultRole();
  }
};

export class Player {
  constructor(id, data = {}) {
    this.id = id;

    this.firstName = data.firstName ?? "";
    this.lastName = data.lastName ?? "";
    this.displayName = data.displayName ?? "";

    this.idNumber = data?.idNumber ?? null;
    this.number = data.number ?? null;
    this.gender = data.gender ?? null;
    this.birthday = data.birthday ?? null;
    this.isPlayerActive = data.isPlayerActive ?? data.isPlayerActive ?? true;
    this.role = data.role ?? PLAYER_ROLES.DEFAULT;
  }

  /* =========================
     DERIVED FIELDS
  ========================= */

  get fullName() {
    const joined = `${this.firstName} ${this.lastName}`.trim();
    return this.displayName || joined || "—";
  }

  get shortName() {
    if (this.lastName) {
      return `${this.firstName} ${this.lastName[0]}.`.trim();
    }

    return this.firstName || this.displayName || "—";
  }

  get roleLabel() {
    return toStartCase(this.role || PLAYER_ROLES.DEFAULT);
  }

  /* =========================
     SERIALIZATION
  ========================= */

  toFirestore() {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      displayName: this.displayName,
      idNumber: this.idNumber,
      number: this.number,
      gender: this.gender,
      birthday: this.birthday,
      active: this.active,
      role: normalizeRoleId(this.role || PLAYER_ROLES.DEFAULT)
    };
  }

  static fromFirestore(doc) {
    return new Player(doc.id, doc.data());
  }
}