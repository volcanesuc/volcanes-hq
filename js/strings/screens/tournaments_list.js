// /js/strings/screens/tournaments_list.js
// Textos de tournaments.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("tournaments_list", "Torneos (lista)", {
  enCurso: "En curso",
  torneosQueEstanActivos: "Torneos que están activos ahora",
  proximos: "Próximos",
  torneosQueVienenMas: "Torneos que vienen más adelante",
  finalizados: "Finalizados",
  torneosQueYaTerminaron: "Torneos que ya terminaron",
  noHayTorneosEn: "No hay torneos en esta sección.",
  editar: "Editar",
  sitioOficial: "Sitio oficial",
  roster: "Roster",
  torneosActivosAhora: "Torneos activos ahora",
  torneosQueVienen: "Torneos que vienen",
  torneosAnteriores: "Torneos anteriores",
  buscar: "Buscar",
  team: "Team",
  player: "Player",
});

export const txf = fmt;
