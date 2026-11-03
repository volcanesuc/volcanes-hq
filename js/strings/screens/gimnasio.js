// /js/strings/screens/gimnasio.js
// Textos de Gimnasio (gimnasio.html) y Ejercicios (gym_ejercicios.html). Editables en Ajustes > Textos.
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("gimnasio", "Gimnasio", {
  // Gimnasio
  titulo: "Gimnasio",
  subtitulo: "Planes de gimnasio con sus rutinas y ejercicios.",
  verEjercicios: "Ver ejercicios",
  gestionarEjercicios: "Ejercicios",
  nuevaRutina: "Rutina",
  nuevoPlan: "Plan",
  buscarPlan: "Buscar plan o rutina…",
  cargando: "Cargando gimnasio…",
  sinPlanes: "Todavía no hay planes de gimnasio.",
  sinResultados: "No hay planes ni rutinas con esa búsqueda.",
  rutinasSueltas: "Rutinas sin plan",
  editar: "Editar",
  publico: "Público",
  nEjercicios: "{n} ejercicios",
  nRutinas: "{n} rutinas",
  rutinaSinEjercicios: "Esta rutina todavía no tiene ejercicios.",
  ejercicioBorrado: "Ejercicio borrado",
  descanso: "descanso {sec}s",
  video: "Video",
  verRutina: "Abrir rutina",
  verPlan: "Abrir plan",

  // Ejercicios
  ejerciciosTitulo: "Ejercicios",
  ejerciciosSub: "Todos los ejercicios del gimnasio, por músculo.",
  volver: "Gimnasio",
  buscarEjercicio: "Buscar ejercicio…",
  todos: "Todos",
  sinMusculo: "Sin músculo",
  todoEquipo: "Todo el equipo",
  nuevoEjercicio: "Ejercicio",
  importar: "Importar ejercicios base",
  importarNada: "Ya están todos los ejercicios base.",
  importarConfirm: "Se van a agregar {n} ejercicios base que todavía no están. ¿Seguir?",
  importando: "Importando…",
  importados: "Listo: se agregaron {n} ejercicios.",
  importarError: "No se pudieron importar: {err}",
  sinEjercicios: "No hay ejercicios con esos filtros.",
  nEjerciciosTotal: "{n} ejercicios",
});

export const txf = fmt;
