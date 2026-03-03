export class Training {
  constructor(id = null, data = {}) {
    this.id = id;

    this.clubId = data.clubId ?? "volcanes";

    this.date = data.date ?? "";
    this.month = data.month ?? (this.date ? this.date.slice(0, 7) : "");

    this.attendees = Array.isArray(data.attendees) ? data.attendees : [];

    // ✅ NUEVO: selecciones del playbook
    this.playbookTrainingIds = Array.isArray(data.playbookTrainingIds) ? data.playbookTrainingIds : [];
    this.drillIds = Array.isArray(data.drillIds) ? data.drillIds : [];

    // ✅ seguimos usando summary como texto libre principal
    this.summary = data.summary ?? "";
    this.notes = data.notes ?? "";

    this.active = data.active ?? true;

    this.createdAt = data.createdAt ?? Date.now();
    this.updatedAt = data.updatedAt ?? Date.now();
  }

  get count() {
    return this.attendees.length;
  }

  togglePlayer(playerId) {
    if (this.attendees.includes(playerId)) {
      this.attendees = this.attendees.filter(id => id !== playerId);
    } else {
      this.attendees.push(playerId);
    }
  }

  toFirestore() {
    return {
      clubId: this.clubId,
      date: this.date,
      month: this.month,
      attendees: this.attendees,

      playbookTrainingIds: this.playbookTrainingIds,
      drillIds: this.drillIds,

      summary: this.summary,
      notes: this.notes,

      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}