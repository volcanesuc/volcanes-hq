// /js/public/training_plan_view.js
import { db } from "../auth/firebase.js";
import { showLoader, hideLoader } from "../ui/loader.js";
import { loadHeader } from "../components/header.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { openMediaViewerModal } from "../ui/media_viewer_modal.js";
import { TX } from "/js/strings/screens/training_plan_view.js";

const TRAININGS_COL = "playbook_trainings";
const DRILLS_COL = "drills";

const $ = (id) => document.getElementById(id);

const tvTitle = $("tvTitle");
const tvSubtitle = $("tvSubtitle");
const tvDate = $("tvDate");
const tvNotes = $("tvNotes");
const tvPublicState = $("tvPublicState");
const tvError = $("tvError");
const tvDrills = $("tvDrills");
const tvEmpty = $("tvEmpty");
const tvShareBtn = $("tvShareBtn");

function showError(msg) {
  if (!tvError) return;
  tvError.textContent = msg;
  tvError.classList.remove("d-none");
}

function formatNotes(text) {
  if (!text) return "—";

  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // **negrita**
    .replace(/\n/g, "<br>"); // saltos de linea
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function fmtDate(value) {
  if (!value) return "—";
  const d = value?.toDate?.() ?? new Date(value);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("es-CR", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function extractOrderedIds(training) {
  if (Array.isArray(training?.drillRefs) && training.drillRefs.length) {
    return training.drillRefs
      .map((r, idx) => ({
        id: String(r?.drillId || "").trim(),
        order: Number.isFinite(Number(r?.order)) ? Number(r.order) : (idx + 1),
      }))
      .filter(x => !!x.id)
      .sort((a, b) => a.order - b.order)
      .map(x => x.id);
  }

  if (Array.isArray(training?.drillIds) && training.drillIds.length) {
    return training.drillIds.map(x => String(x || "").trim()).filter(Boolean);
  }

  if (Array.isArray(training?.drills) && training.drills.length) {
    return training.drills.map(x => String(x || "").trim()).filter(Boolean);
  }

  return [];
}

async function fetchDrillsByIds(ids) {
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, DRILLS_COL, id));
        if (!snap.exists()) return null;

        const data = { id: snap.id, ...snap.data() };
        if (data.isPublic !== true) return null;

        return data;
      } catch (err) {
        console.warn("No se pudo leer drill:", id, err);
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

function drillCard(d) {
  const name = d?.name || "—";
  const tactical = safeUrl(d?.tacticalBoardUrl || "");
  const video = safeUrl(d?.teamVideoUrl || d?.videoUrl || "");
  const volume = (d?.volume || "—").toString().trim();
  const rest = (d?.restAfter || "—").toString().trim();

  const normalizedTags = Array.isArray(d?.tags) ? d.tags : [];

  const tagsHtml = normalizedTags.length
    ? `
      <div class="mt-2 d-flex flex-wrap gap-1">
        ${normalizedTags.map(tag => {
          const label = typeof tag === "string" ? tag : (tag?.label || TX.tag);
          const key = typeof tag === "string" ? tag : (tag?.key || label);
          const color = typeof tag === "string"
            ? colorFromString(key)
            : (tag?.color || colorFromString(key));

          return `
            <span
              class="badge rounded-pill"
              style="
                background: ${escapeHtml(color)};
                color: #fff;
                font-weight: 500;
              "
            >
              ${escapeHtml(label)}
            </span>
          `;
        }).join("")}
      </div>
    `
    : "";

  return `
    <div class="col-12 col-lg-6">
      <div class="card h-100 shadow-sm">
        <div class="card-body">

          <div class="d-flex justify-content-between align-items-start gap-2">
            <div class="fw-semibold">${escapeHtml(name)}</div>

            <div class="d-flex gap-2 flex-wrap">
              ${
                tactical
                  ? `<button
                      type="button"
                      class="btn btn-sm btn-outline-primary"
                      data-open-media="${escapeHtml(tactical)}"
                      data-open-title="${escapeHtml(name)}"
                    >
                      ${TX.ver}
                    </button>`
                  : ``
              }

              ${
                video
                  ? `<button
                      type="button"
                      class="btn btn-sm btn-outline-secondary"
                      data-open-media="${escapeHtml(video)}"
                      data-open-title="${escapeHtml(name)}"
                    >
                      ${TX.video}
                    </button>`
                  : ``
              }
            </div>
          </div>

          ${tagsHtml}

          <div class="row mt-3 g-2">
            <div class="col-6">
              <div class="small text-muted">${TX.volumen}</div>
              <div>${escapeHtml(volume)}</div>
            </div>
            <div class="col-6">
              <div class="small text-muted">${TX.descanso}</div>
              <div>${escapeHtml(rest)}</div>
            </div>
          </div>

          ${
            d?.objective
              ? `<div class="mt-3">
                   <div class="small text-muted">${TX.objetivo}</div>
                   <div class="text-muted">${escapeHtml(d.objective)}</div>
                 </div>`
              : ``
          }

        </div>
      </div>
    </div>
  `;
}

function colorFromString(str) {
  const s = String(str || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 55%)`;
}

function bindDrillMediaEvents() {
  if (!tvDrills || tvDrills.dataset.mediaBound === "1") return;

  tvDrills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-media]");
    if (!btn) return;

    e.preventDefault();

    const url = btn.getAttribute("data-open-media");
    const title = btn.getAttribute("data-open-title") || TX.vistaPrevia;

    if (!url) return;

    openMediaViewerModal(url, { title });
  });

  tvDrills.dataset.mediaBound = "1";
}

async function initHeader() {
  try {
    await loadHeader("home", {
      enabledTabs: {}
    });

    const brand = document.querySelector("#app-header .navbar-brand, #app-header .brand-text, #app-header .header-brand");
    if (brand) {
      brand.style.cursor = "pointer";
      brand.addEventListener("click", () => {
        window.location.href = "/pages/admin/dashboard.html";
      });
    }

    // Ocultar cualquier nav / botones extra y dejar solo la marca
    const selectorsToHide = [
      "#app-header .navbar-nav",
      "#app-header .nav",
      "#app-header .header-tabs",
      "#app-header .header-actions",
      "#app-header .logout-btn",
      "#app-header #logoutBtn",
      "#app-header .btn",
      "#app-header .dropdown",
      "#app-header .user-menu"
    ];

    selectorsToHide.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.display = "none";
      });
    });
  } catch (err) {
    console.warn("No se pudo cargar el header:", err);
  }
}

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = (params.get("id") || "").trim();

  if (!id) {
    showError(TX.faltaElParametroId);
    return;
  }

  showLoader();

  try {
    await initHeader();
    bindDrillMediaEvents();

    const snap = await getDoc(doc(db, TRAININGS_COL, id));
    if (!snap.exists()) {
      showError(TX.noSeEncontroEste);
      return;
    }

    const t = { id: snap.id, ...snap.data() };

    if (t.isPublic !== true) {
      showError(TX.estePlanDeEntrenamiento);
      return;
    }

    tvShareBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        tvShareBtn.textContent = TX.linkCopiado;
        setTimeout(() => (tvShareBtn.textContent = TX.compartir), 1200);
      } catch {
        alert(TX.noPudeCopiarEl);
      }
    });

    if (tvTitle) tvTitle.textContent = t.name || TX.planDeEntrenamiento;
    if (tvSubtitle) tvSubtitle.textContent = TX.planDeEntrenamiento;
    if (tvDate) tvDate.textContent = fmtDate(t.date);
    if (tvNotes) tvNotes.innerHTML = formatNotes(t.notes);
    if (tvPublicState) tvPublicState.textContent = TX.publico;

    const ids = extractOrderedIds(t);
    if (!ids.length) {
      tvEmpty?.classList.remove("d-none");
      return;
    }

    const drills = await fetchDrillsByIds(ids);

    tvDrills.innerHTML = drills.length
      ? drills.map(drillCard).join("")
      : "";

    tvEmpty?.classList.toggle("d-none", drills.length > 0);
  } catch (e) {
    console.error(e);
    showError(TX.errorCargandoElPlan);
  } finally {
    hideLoader();
  }
})();