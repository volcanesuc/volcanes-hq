// js/models/player.js

export const PLAYER_ROLES = {
  HANDLER: "handler",
  CUTTER: "cutter",
  HYBRID: "hybrid"
};


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
    this.role = data.role ?? PLAYER_ROLES.HYBRID;
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

  get roleLabel() {
    switch (this.role) {
      case PLAYER_ROLES.HANDLER:
        return "Handler";
      case PLAYER_ROLES.CUTTER:
        return "Cutter";
      default:
        return "Hybrid";
    }
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
