// /js/strings/screens/membership_assign.js
// Textos de membership_assignment_manual.js (editables en Ajustes > Textos).
import { defineStrings, fmt } from "/js/core/texts.js";

export const TX = defineStrings("membership_assign", "Asociación: asignar membresía", {
  montoEditable: "Monto editable",
  cuotaS: " • {cuotas} cuota(s)",
  plan: "Plan",
  t12Meses: "12 meses",
  t6Meses: "6 meses",
  t1Mes: "1 mes",
  fechaDePago: "fecha de pago",
  cubreInicio: "Cubre {dur}. Inicio: {start}.",
  cargando: "Cargando…",
  seleccionaUnPlan: "Seleccioná un plan…",
  id: "ID: {idNumber}",
  noHayResultados: "No hay resultados.",
  seleccionado: "Seleccionado: {value}",
  ahoraLasMembresiasSe: "Ahora las membresías se crean sobre usuarios existentes. Primero crea/aprueba el usuario en Admin.",
  ningunoSeleccionado: "Ninguno seleccionado",
  linkCopiado: "✅ Link copiado",
  copiaElLink: "Copiá el link:",
  permiteCuotas: "Permite cuotas",
  pagoUnico: "Pago único",
  requiereValidacion: "Requiere validación",
  sinValidacion: "Sin validación",
  editable: "Editable",
  sinCuotasPagoUnico: "Sin cuotas (pago único)",
  temporadaInvalidaUsaUn: "Temporada inválida. Usá un año válido, por ejemplo 2026.",
  seleccionaUnUsuario: "Seleccioná un usuario.",
  seleccionaUnPlan2: "Seleccioná un plan.",
  verificando: "Verificando…",
  yaExisteUnaMembresia: "⚠️ Ya existe una membresía para este usuario en {season}.\n\n",
  seUsaraLaExistente: "Se usará la existente: {id}\n",
  estado: "Estado: {value}\n\n",
  siNecesitasCambiarPlan: "Si necesitás cambiar plan o corregir datos, abrí el detalle.",
  creandoMembresia: "Creando membresía…",
  membresia: "Membresía",
  membresiaCreada: "✅ Membresía creada",
  error: "❌ Error: ",
});

export const txf = fmt;
