// /js/features/playbook/gym/gym_plan_page.js
import { db } from "/js/auth/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showLoader, hideLoader, updateLoaderMessage } from "/js/ui/loader.js";

const COL_PLANS = "gym_weeks";
const COL_ROUTINES = "gym_routines";

const $ = {
  planTitle: document.getElementById("planTitle"),
  planMeta: document.getElementById("planMeta"),
  planDesc: document.getElementById("planDesc"),
  sectionTitle: document.getElementById("planSectionTitle"),
  routinesList: document.getElementById("routinesList"),
  emptyState: document.getElementById("emptyState"),
  errorBox: document.getElementById("errorBox"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
};

/* =========================
   BOOT
========================= */
async function boot() {
  showLoader("Cargando plan…");

  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      showError("Falta ?id del plan.");
      return;
    }

    setupCopyLink();

    updateLoaderMessage("Leyendo plan…");
    const snap = await getDoc(doc(db, COL_PLANS, id));

    if (!snap.exists()) {
      showError("Este plan no existe.");
      return;
    }

    const plan = { id: snap.id, ...snap.data() };
    renderHeader(plan);

    // Preferimos slots (nuevo modelo)
    const slots = Array.isArray(plan.slots) ? plan.slots.slice() : [];
    if (slots.length) {
      $.sectionTitle && ($.sectionTitle.textContent = "Slots del plan");
      slots.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

      const routineIds = uniq(
        slots.map((s) => (s?.routineId || "").toString().trim()).filter(Boolean)
      );

      updateLoaderMessage("Cargando rutinas…");
      const routinesById = await fetchRoutinesById(routineIds);

      renderSlots(slots, routinesById);
      return;
    }

    // Fallback legacy: routineIds
    const routineIds = Array.isArray(plan.routineIds) ? plan.routineIds.filter(Boolean) : [];
    if (routineIds.length) {
      $.sectionTitle && ($.sectionTitle.textContent = "Rutinas del plan");

      updateLoaderMessage("Cargando rutinas…");
      const routinesById = await fetchRoutinesById(routineIds);

      renderRoutinesFlat(routineIds, routinesById);
      return;
    }

    $.emptyState?.classList.remove("d-none");
  } catch (e) {
    console.error(e);
    showError("No pude cargar el plan (error inesperado).");
  } finally {
    hideLoader(); // ✅ quita html.preload + overlay + body.loading
  }
}

/* =========================
   UI HELPERS
========================= */
function setupCopyLink() {
  $.copyLinkBtn?.classList.remove("d-none");
  $.copyLinkBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const old = $.copyLinkBtn.textContent;
      $.copyLinkBtn.textContent = "Copiado ✅";
      setTimeout(() => ($.copyLinkBtn.textContent = old), 1200);
    } catch (e) {
      console.error(e);
    }
  });
}

function renderHeader(plan) {
  const title =
    plan.title ||
    plan.name ||
    (plan.monthKey ? `Plan de gimnasio – Mes ${plan.monthKey}` : "Plan de gimnasio");

  if ($.planTitle) $.planTitle.textContent = title;

  const meta = [];
  if (plan.monthKey) meta.push(`Mes: ${plan.monthKey}`);
  if (plan.clubId) meta.push(`Club: ${plan.clubId}`);
  if (plan.isPublic === true) meta.push("🌐 Público");
  if ($.planMeta) $.planMeta.textContent = meta.join(" · ");

  if ($.planDesc) $.planDesc.textContent = (plan.description || "").toString().trim() || "—";
}

function showError(msg) {
  if (!$.errorBox) return;
  $.errorBox.textContent = msg;
  $.errorBox.classList.remove("d-none");
}

/* =========================
   DATA
========================= */
async function fetchRoutinesById(ids) {
  const snaps = await Promise.all(ids.map((rid) => getDoc(doc(db, COL_ROUTINES, rid))));

  const map = new Map();
  for (const rs of snaps) {
    if (!rs || !rs.exists()) continue;
    const r = { id: rs.id, ...rs.data() };
    if (r.isActive === false) continue;
    map.set(r.id, r);
  }
  return map;
}

/* =========================
   RENDER
========================= */
function renderSlots(slots, routinesById) {
  if (!$.routinesList) return;

  $.routinesList.innerHTML = "";
  $.emptyState?.classList.add("d-none");

  const wrapper = document.createElement("div");
  wrapper.className = "table-responsive";

  wrapper.innerHTML = `
    <table class="table table-sm align-middle">
      <thead class="table-light">
        <tr>
          <th style="width:60px;">#</th>
          <th style="width:220px;">Slot</th>
          <th>Rutina</th>
          <th style="width:160px;"></th>
        </tr>
      </thead>
      <tbody id="slotsTbody"></tbody>
    </table>
  `;

  $.routinesList.appendChild(wrapper);

  const tbody = wrapper.querySelector("#slotsTbody");
  tbody.innerHTML = "";

  for (const s of slots) {
    const rid = (s?.routineId || "").toString();
    const r = routinesById.get(rid) || null;

    const routineName = r?.name || (rid ? "Rutina (no accesible)" : "—");
    const label = (s?.label || "").toString().trim() || "—";
    const order = Number(s?.order ?? 0) || "";

    const isPublic = r?.isPublic === true;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(order)}</td>
      <td>${escapeHtml(label)}</td>
      <td>
        <div class="fw-semibold">${escapeHtml(routineName)}</div>
        ${r?.description ? `<div class="text-muted small">${escapeHtml(r.description)}</div>` : ``}
        ${!r && rid ? `<div class="text-muted small">ID: ${escapeHtml(rid)}</div>` : ``}
      </td>
      <td class="text-end">
        ${
          isPublic
            ? `<a class="btn btn-sm btn-outline-secondary" href="/gym_routine.html?id=${encodeURIComponent(
                r.id
              )}" target="_blank" rel="noopener">Ver rutina</a>`
            : `<span class="text-muted small">${r ? "🔒 Privada" : ""}</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function renderRoutinesFlat(orderIds, routinesById) {
  if (!$.routinesList) return;

  $.routinesList.innerHTML = "";

  const routines = orderIds.map((id) => routinesById.get(id)).filter(Boolean);

  if (!routines.length) {
    $.emptyState?.classList.remove("d-none");
    return;
  }
  $.emptyState?.classList.add("d-none");

  for (const r of routines) {
    const isPublic = r.isPublic === true;
    const row = document.createElement("div");
    row.className = "list-group-item";

    row.innerHTML = `
      <div class="d-flex justify-content-between gap-2 flex-wrap">
        <div>
          <div class="fw-semibold">${escapeHtml(r.name || "—")}</div>
          <div class="text-muted small">${isPublic ? "🌐 Pública" : "🔒 Privada"}</div>
          ${r.description ? `<div class="small mt-1">${escapeHtml(r.description)}</div>` : ``}
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${
            isPublic
              ? `<a class="btn btn-sm btn-outline-secondary" href="/gym_routine.html?id=${encodeURIComponent(
                  r.id
                )}" target="_blank" rel="noopener">Ver rutina</a>`
              : ``
          }
        </div>
      </div>
    `;
    $.routinesList.appendChild(row);
  }
}

/* =========================
   UTILS
========================= */
function uniq(arr) {
  return Array.from(new Set(arr));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   RUN
========================= */
boot();