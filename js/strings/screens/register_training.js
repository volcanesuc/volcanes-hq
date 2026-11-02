// /js/strings/screens/register_training.js
// Textos de register_training.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("register_training", "Registro de entrenamiento", {
  elegiUnaFecha: "Elegí una fecha",
  entrenoGuardadoPresentes: "Entreno guardado ✅ ({checkedCount} presentes)",
  errorGuardandoEntreno: "❌ Error guardando entreno",
});

export const txf = fmt;
