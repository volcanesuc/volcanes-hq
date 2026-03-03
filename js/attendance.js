// attendance.js
import { db } from "./auth/firebase.js";
import { watchAuth, logout } from "./auth/auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import { Player } from "./models/player.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";

// Header
const { cfg, redirected } = await guardPage("attendance");
if (!redirected) {
  await loadHeader("attendance", cfg);
}

/* ==========================
   COLLECTIONS (CONFIG)
========================== */
const PLAYERS_COL = APP_CONFIG?.club?.playersCollection || "club_players";
const TRAININGS_COL = APP_CONFIG?.club?.trainingsCollection || "trainings";

/* ==========================
   DOM
========================== */
const trainingsTable = document.getElementById("trainingsTable");
const playersTable = document.getElementById("playersTable");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const clearFilterBtn = document.getElementById("clearFilter");
const btnPdf = document.getElementById("btnPdf");

const trainingsCards = document.getElementById("trainingsCards"); // optional
const playersCards = document.getElementById("playersCards");     // optional
const playerSearch = document.getElementById("playerSearch");     // optional

const kpiAvgCard = document.getElementById("kpiAvgCard");
const chartPanel = document.getElementById("chartPanel");
const closeChartBtn = document.getElementById("closeChartBtn");

/* ==========================
   STATE
========================== */
let allTrainings = {};
let allPlayers = {};
let attendanceChart;

let filteredTrainings = [];
let filteredPlayersArr = [];


/* ==========================
   FILTERS START AND END DATE
========================== */

function yyyyMmDd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setDefaultRange() {
  if (!startDate || !endDate) return;
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);

  if (!startDate.value) startDate.value = yyyyMmDd(jan1);
  if (!endDate.value) endDate.value = yyyyMmDd(now);
}

function inRange(dateStr, startStr, endStr) {
  if (!dateStr) return false;
  if (startStr && dateStr < startStr) return false;
  if (endStr && dateStr > endStr) return false;
  return true;
}

setDefaultRange();

/* ==========================
   AUTH
========================== */
document.getElementById("logoutBtn")?.addEventListener("click", logout);

watchAuth(async () => {
  showLoader();
  try {
    await loadAttendance();
    applyFilter(); // render inicial
  } catch (e) {
    console.error(e);
  } finally {
    hideLoader();
  }
});

/* ==========================
   LOAD DATA
========================== */
async function loadAttendance() {
  allTrainings = {};
  allPlayers = {};

  // PLAYERS
  const playersSnap = await getDocs(collection(db, PLAYERS_COL));
  playersSnap.forEach(d => {
    const player = Player.fromFirestore(d);
    allPlayers[player.id] = { player, count: 0 };
  });

  // TRAININGS
  const trainingsSnap = await getDocs(collection(db, TRAININGS_COL));
  trainingsSnap.forEach(d => {
    const data = d.data();
    allTrainings[d.id] = {
      id: d.id,
      date: data.date, // "YYYY-MM-DD"
      attendees: data.attendees ?? [],
      count: 0
    };
  });

  console.log("Players:", Object.keys(allPlayers).length, `(${PLAYERS_COL})`);
  console.log("Trainings:", Object.keys(allTrainings).length, `(${TRAININGS_COL})`);
}

/* ==========================
   FILTER + COMPUTE
========================== */
function applyFilter() {
  const start = startDate?.value || "";
  const end = endDate?.value || "";

  // Validación simple (si end < start, no rompas todo)
  if (start && end && end < start) {
    // swap automático (más cómodo)
    const tmp = startDate.value;
    startDate.value = endDate.value;
    endDate.value = tmp;
  }

  const start2 = startDate?.value || "";
  const end2 = endDate?.value || "";

  filteredTrainings = Object.values(allTrainings).filter(t =>
    inRange(t.date, start2, end2)
  );

  // Si hay filtro y no hay entrenos:
  if ((start2 || end2) && filteredTrainings.length === 0) {
    if (trainingsTable) {
      trainingsTable.innerHTML =
        `<tr><td colspan="2" class="text-muted p-3">No hay entrenamientos en este rango.</td></tr>`;
    }

    if (playersTable) {
      playersTable.innerHTML =
        `<tr><td colspan="3" class="text-muted p-3">No hay datos para calcular asistencia.</td></tr>`;
    }

    trainingsCards && (trainingsCards.innerHTML = "");
    playersCards && (playersCards.innerHTML = "");

    updateKPIs([]);
    renderTopPlayers([], 0);

    const activeRoster = Object.values(allPlayers).filter(p => p.player.active !== false).length;
    renderChart([], activeRoster);

    return;
  }

  // reset counts
  filteredTrainings.forEach(t => (t.count = 0));
  Object.values(allPlayers).forEach(p => (p.count = 0));

  // compute counts
  filteredTrainings.forEach(training => {
    training.count = training.attendees.length;
    training.attendees.forEach(playerId => {
      if (allPlayers[playerId]) allPlayers[playerId].count++;
    });
  });

  const totalTrainings = filteredTrainings.length;

  filteredPlayersArr = Object.values(allPlayers).filter(p => p.player.active !== false)
    .map(p => ({
      ...p,
      pct: totalTrainings ? Math.round((p.count / totalTrainings) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // search
  const q = (playerSearch?.value || "").trim().toLowerCase();
  const playersToRender = q
    ? filteredPlayersArr.filter(({ player }) =>
        (player.fullName || "").toLowerCase().includes(q)
      )
    : filteredPlayersArr;

  // renders
  renderTrainings(filteredTrainings);
  renderPlayers(playersToRender);
  updateKPIs(filteredTrainings);
  renderTopPlayers(filteredPlayersArr, totalTrainings);

  const activeRoster = Object.values(allPlayers).filter(p => p.player.active !== false).length;
  renderChart(filteredTrainings, activeRoster);
}

/* ==========================
   PDF GENERATION
========================== */

async function generatePdf() {
  try {
    const start = startDate?.value || "";
    const end = endDate?.value || "";

    const trainingsInRange = Object.values(allTrainings)
      .filter(t => inRange(t.date, start, end))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    const totalTrainings = trainingsInRange.length;

    const activePlayers = Object.values(allPlayers)
      .map(p => p.player)
      .filter(pl => pl && pl.active !== false)
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

    const rows = activePlayers.map(pl => {
      let count = 0;
      for (const t of trainingsInRange) {
        if ((t.attendees || []).includes(pl.id)) count++;
      }
      const pct = totalTrainings ? Math.round((count / totalTrainings) * 100) : 0;
      return { name: pl.fullName || "—", count, total: totalTrainings, pct };
    });

    rows.sort((a, b) => (b.pct - a.pct) || (b.count - a.count) || a.name.localeCompare(b.name));

    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error("jsPDF no está cargado. Revisá el script CDN.");

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Reporte de Asistencia (CACUC)", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Rango: ${start || "—"} a ${end || "—"}`, 40, 70);
    doc.text(`Entrenamientos: ${totalTrainings} · Jugadores activos: ${rows.length}`, 40, 88);

    doc.autoTable({
      startY: 110,
      head: [["Jugador", "Asistencias", "Total entrenos", "% participación"]],
      body: rows.map(r => [r.name, String(r.count), String(r.total), `${r.pct}%`]),
      styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
      headStyles: { fillColor: [245, 245, 245], textColor: 20 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      margin: { left: 40, right: 40 }
    });

    const filename = `CACUC_Asistencia_${(start || "inicio").replaceAll("-", "")}_${(end || "hoy").replaceAll("-", "")}.pdf`;
    doc.save(filename);
  } catch (e) {
    console.error(e);
    alert(`No se pudo generar el PDF: ${e.message || e}`);
  }
}



/* ==========================
   RENDERS
========================== */
function renderTrainings(list) {
  const sorted = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // TABLE (desktop)
  if (trainingsTable) {
    trainingsTable.innerHTML = sorted
      .map(t => {
        const pillClass = t.count >= 12 ? "pill pill--good" : "pill pill--warn";
        return `
          <tr>
            <td>${t.date ?? "—"}</td>
            <td><span class="${pillClass}">👥 ${t.count ?? 0}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  // CARDS (mobile)
  if (trainingsCards) {
    trainingsCards.innerHTML = sorted
      .map(t => {
        const pillClass = t.count >= 12 ? "pill pill--good" : "pill pill--warn";
        return `
          <div class="mobile-card">
            <div class="mobile-card__title">${t.date ?? "—"}</div>
            <div class="mobile-card__row">
              <div class="mobile-card__sub">Asistencia</div>
              <span class="${pillClass}">👥 ${t.count ?? 0}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }
}

function renderPlayers(list) {
  const threshold = 66;

  // TABLE (desktop)
  if (playersTable) {
    playersTable.innerHTML = list
      .map(({ player, count, pct }) => {
        const pillClass = pct >= threshold ? "pill pill--good" : "pill pill--warn";
        const barColor = pct >= threshold ? "var(--theme-primary)" : "var(--theme-accent)";

        return `
          <tr>
            <td>${player.fullName ?? "—"}</td>
            <td>${count ?? 0}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <div class="progress slim flex-grow-1" style="min-width:120px;">
                  <div class="progress-bar" style="width:${pct}%; background:${barColor};"></div>
                </div>
                <span class="${pillClass}">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  // CARDS (mobile)
  if (playersCards) {
    playersCards.innerHTML = list
      .slice(0, 50)
      .map(({ player, count, pct }) => {
        const pillClass = pct >= threshold ? "pill pill--good" : "pill pill--warn";
        const barColor = pct >= threshold ? "var(--theme-primary)" : "var(--theme-accent)";

        return `
          <div class="mobile-card">
            <div class="mobile-card__title">${player.fullName ?? "—"}</div>
            <div class="mobile-card__sub">${count ?? 0} asistencias</div>

            <div class="mobile-card__row">
              <div class="progress slim flex-grow-1">
                <div class="progress-bar" style="width:${pct}%; background:${barColor};"></div>
              </div>
              <span class="${pillClass}">${pct}%</span>
            </div>
          </div>
        `;
      })
      .join("");
  }
}

function updateKPIs(trainings) {
  const totalTrainings = trainings.length;
  const totalAttendance = trainings.reduce((sum, t) => sum + (t.count || 0), 0);
  const avg = totalTrainings ? (totalAttendance / totalTrainings).toFixed(1) : "0";

  document.getElementById("kpiTrainings").textContent = totalTrainings;
  document.getElementById("kpiAttendance").textContent = totalAttendance;
  document.getElementById("kpiAverage").textContent = avg;
}

function renderTopPlayers(playersArr, totalTrainings) {
  const top = playersArr.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const maxCount = top[0]?.count || 1;

  const el = document.getElementById("topPlayers");
  if (!el) return;

  el.innerHTML = top
    .map(({ player, count, pct }, i) => {
      const w = Math.round(((count || 0) / maxCount) * 100);
      return `
        <div class="top3-card">
          <div class="top3-row">
            <div>
              <div class="top3-name">${medals[i]} ${player.fullName ?? "—"}</div>
              <div class="top3-meta">${count ?? 0} de ${totalTrainings} · ${pct ?? 0}%</div>
            </div>
            <span class="pill pill--good">${count ?? 0}</span>
          </div>
          <div class="mini-bar"><div style="width:${w}%"></div></div>
        </div>
      `;
    })
    .join("");
}

/* ==========================
   CHART
========================== */
function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function renderChart(trainings, activeRoster = 0) {
  const GREEN = cssVar("--theme-primary", "#19473f");
  const YELLOW = cssVar("--theme-accent", "#e8ce26");
  const GOOD = cssVar("--theme-primary-light", GREEN);
  const BORDER = cssVar("--border", "#e5e7eb");
  const TEXT = cssVar("--text", "#1f2328");
  const TEXT_SOFT = cssVar("--text-soft", "#6b7280");

  const canvas = document.getElementById("attendanceChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const threshold = 66;

  const sorted = [...trainings].sort((a, b) => (a.date || "").localeCompare(a.date || ""));
  const labels = sorted.map(t => t.date ?? "—");

  const values = sorted.map(t => {
    if (activeRoster > 0) return Math.round(((t.count || 0) / activeRoster) * 1000) / 10;
    return t.count || 0;
  });

  if (attendanceChart) attendanceChart.destroy();

  attendanceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: activeRoster > 0 ? "% Asistencia" : "Asistencia",
          data: values,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,

          borderColor: GREEN,

          pointBackgroundColor: (c) => {
            const v = c.raw ?? 0;
            if (activeRoster > 0) return v >= threshold ? GOOD : YELLOW;
            return GREEN;
          },

          segment: activeRoster > 0
            ? {
                borderColor: (seg) => {
                  const y0 = seg.p0.parsed.y ?? 0;
                  const y1 = seg.p1.parsed.y ?? 0;
                  const avg = (y0 + y1) / 2;
                  return avg >= threshold ? GOOD : YELLOW;
                }
              }
            : {}
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => (activeRoster > 0 ? `${c.raw}%` : `${c.raw}`) },
          titleColor: TEXT,
          bodyColor: TEXT,
          backgroundColor: cssVar("--card", "#ffffff"),
          borderColor: BORDER,
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: { color: TEXT_SOFT },
          grid: { color: BORDER }
        },
        y: {
          beginAtZero: true,
          suggestedMax: activeRoster > 0 ? 100 : undefined,
          ticks: { color: TEXT_SOFT, callback: (v) => (activeRoster > 0 ? `${v}%` : `${v}`) },
          grid: { color: BORDER }
        }
      }
    }
  });
}

/* ==========================
   UI EVENTS
========================== */
startDate?.addEventListener("change", applyFilter);
endDate?.addEventListener("change", applyFilter);
btnPdf?.addEventListener("click", generatePdf);

clearFilterBtn?.addEventListener("click", () => {
  // vuelve a default CACUC: Jan 1 -> hoy
  startDate.value = "";
  endDate.value = "";
  setDefaultRange();
  applyFilter();
});

playerSearch?.addEventListener("input", applyFilter);

function showChartPanel() {
  if (!chartPanel) return;
  chartPanel.classList.remove("d-none");
  const activeRoster = Object.values(allPlayers).filter(p => p.player.active !== false).length;
  renderChart(filteredTrainings, activeRoster);
}

function hideChartPanel() {
  chartPanel?.classList.add("d-none");
}

kpiAvgCard?.addEventListener("click", showChartPanel);
kpiAvgCard?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") showChartPanel();
});
closeChartBtn?.addEventListener("click", hideChartPanel);

/* ==========================
   VERSION
========================== */
const v = document.getElementById("appVersion");
if (v) v.textContent = `v${APP_CONFIG.version}`;
