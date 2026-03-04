import { APP_CONFIG } from "../config/config.js";

export class Player {
  constructor(id, data = {}) {
    this.id = id;

    this.firstName = data.firstName ?? "";
    this.lastName = data.lastName ?? "";
    this.idNumber = data?.idNumber ?? null;
    this.number = data.number ?? null;
    this.gender = data.gender ?? null;
    this.birthday = data.birthday ?? null;
    this.active = data.active ?? true;

    // 🔥 role ahora es string libre pero validado
    this.role = data.role ?? this.getDefaultRole();
  }

  /* =========================
     ROLE LOGIC
  ========================= */

  getDefaultRole() {
    return APP_CONFIG?.playerRoles?.[0]?.id ?? "player";
  }

  get roleLabel() {
    const role = APP_CONFIG?.playerRoles?.find(r => r.id === this.role);
    return role?.label ?? "Player";
  }

  /* =========================
     DERIVED FIELDS
  ========================= */

  get fullName() {
    const name = `${this.firstName} ${this.lastName}`.trim();
    return name || "—";
  }

  get shortName() {
    return this.lastName
      ? `${this.firstName} ${this.lastName[0]}.`
      : this.firstName || "—";
  }

  /* =========================
     SERIALIZATION
  ========================= */

  toFirestore() {
    return {
      firstName: this.firstName,
      lastName: this.lastName,
      idNumber: this.idNumber,
      number: this.number,
      gender: this.gender,
      birthday: this.birthday,
      active: this.active,
      role: this.role
    };
  }

  static fromFirestore(doc) {
    return new Player(doc.id, doc.data());
  }
}
