// /js/strings/screens/training_plan_editor.js
// Textos de training_plan_editor.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("training_plan_editor", "Playbook: editor de plan", {
  faltaTrainingeditormodalPartialNo: "Falta #trainingEditorModal (partial no montado)",
  sinDescripcion: "Sin descripción",
  publico: " · Público",
  agregar: "Agregar",
  subir: "Subir",
  bajar: "Bajar",
  quitar: "Quitar",
  crearTemplateDeEntrenamiento: "Crear template de entrenamiento",
  elegiLosDrillsY: "Elegí los drills y guardá el template.",
  editarTemplateDeEntrenamiento: "Editar template de entrenamiento",
  modificaNombreVisibilidadY: "Modificá nombre, visibilidad y drills.",
  noSeEncontroEl: "No se encontró el entrenamiento.",
  errorAbriendoEditor: "Error abriendo editor.",
  nombreRequerido: "Nombre requerido.",
  errorGuardandoVerConsola: "Error guardando. Ver consola.",
});

export const txf = fmt;
