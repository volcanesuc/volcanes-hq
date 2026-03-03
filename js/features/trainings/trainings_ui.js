export function renderPlaybookSelectors({
  pbTrainings,
  pbDrills,
  selectedPlaybookTrainingIds,
  selectedDrillIds,
  mountTrainingsEl,
  mountDrillsEl,
  searchTrainingTerm = "",
  searchDrillTerm = "",
  onTogglePlaybookTraining,
  onToggleDrill
}) {
  const norm = s => (s || "").toString().toLowerCase().trim();

  const tTerm = norm(searchTrainingTerm);
  const dTerm = norm(searchDrillTerm);

  const tFiltered = tTerm
    ? pbTrainings.filter(x => norm(x.name).includes(tTerm))
    : pbTrainings;

  const dFiltered = dTerm
    ? pbDrills.filter(x => (norm(x.name) + " " + norm(x.authorName)).includes(dTerm))
    : pbDrills;

  mountTrainingsEl.innerHTML = "";
  mountDrillsEl.innerHTML = "";

  tFiltered.forEach(t => {
    const checked = selectedPlaybookTrainingIds.includes(t.id);
    const el = document.createElement("label");
    el.className = "list-group-item d-flex gap-2 align-items-start";
    el.innerHTML = `
      <input class="form-check-input mt-1" type="checkbox" ${checked ? "checked" : ""} data-id="${t.id}">
      <div>
        <div class="fw-semibold">${escapeHtml(t.name || "—")}</div>
        <div class="text-muted small">${escapeHtml(fmtDate(t.date) || "—")}</div>
      </div>
    `;
    el.querySelector("input").addEventListener("change", () => onTogglePlaybookTraining(t.id));
    mountTrainingsEl.appendChild(el);
  });

  dFiltered.forEach(d => {
    const checked = selectedDrillIds.includes(d.id);
    const el = document.createElement("label");
    el.className = "list-group-item d-flex gap-2 align-items-start";
    el.innerHTML = `
      <input class="form-check-input mt-1" type="checkbox" ${checked ? "checked" : ""} data-id="${d.id}">
      <div>
        <div class="fw-semibold">${escapeHtml(d.name || "—")}</div>
        <div class="text-muted small">Autor: ${escapeHtml(d.authorName || "—")}</div>
      </div>
    `;
    el.querySelector("input").addEventListener("change", () => onToggleDrill(d.id));
    mountDrillsEl.appendChild(el);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(value) {
  if (!value) return "—";
  const d = value?.toDate?.() ?? (value instanceof Date ? value : new Date(value));
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("es-CR", { year: "numeric", month: "short", day: "2-digit" });
}