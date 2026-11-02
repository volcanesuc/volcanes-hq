// js/strings/playbook.js
import { defineStrings } from "/js/core/texts.js";

export const PLAYBOOK_STRINGS = defineStrings("playbook", "Playbook", {
  ui: {
    loading: "Cargando Playbook…",
    subtitleAdmin: "Biblioteca de ejercicios y estructuras de práctica",
    subtitleViewer: "Modo: Solo lectura | Biblioteca de ejercicios y estructuras de práctica",
  },
  ok: {
    drillCreated: "Drill guardado.",
    drillUpdated: "Drill actualizado.",
    drillArchived: "Drill archivado.",
    drillReactivated: "Drill reactivado.",
    trainingCreated: "Plan de entrenamiento creado.",
    trainingSaved: "Plan de entrenamiento guardado.",
  },
  errors: {
    generic: "Ocurrió un error. Intentá de nuevo.",
    required: "Completá los campos obligatorios.",
    noTrainingSelected: "Primero seleccioná un Plan de entrenamiento.",
    drillNotFound: "No encontré ese drill. Seleccionalo desde la lista.",
    drillAlreadyAdded: "Ese drill ya está agregado a este Plan de entrenamiento.",
  }
});
