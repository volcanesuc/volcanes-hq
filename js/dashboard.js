// dashboard.js
// Dashboard principal: jugadores, entrenamientos, KPIs y alertas

import { db } from "./auth/firebase.js";
import { watchAuth, logout } from "./auth/auth.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";
import { showLoader, hideLoader } from "./ui/loader.js";

import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";

import { Player } from "./models/player.js";

/* =========================================================
   INIT
========================================================= */
const { cfg, redirected } = await guardPage("dashboard");
if (!redirected) {
  await loadHeader("home", cfg);
}


watchAuth(async () => {
  showLoader();
  try {
    await loadDashboard();
  } finally {
    hideLoader();
  }
});


function setNextTournamentLoading() {
  const dateEl = document.getElementById("nextTournamentDate");
  if (dateEl) dateEl.textContent = "Cargando…";

  const nameEl = document.getElementById("nextTournamentName");
  if (nameEl) nameEl.textContent = "—";
}

function setNextTournamentError(msg) {
  const dateEl = document.getElementById("nextTournamentDate");
  const nameEl = document.getElementById("nextTournamentName");
  if (dateEl) dateEl.textContent = "—";
  if (nameEl) nameEl.textContent = msg || "No se pudo cargar";
  setNextTournamentCardLink(null);
}


/* =========================================================
   DASHBOARD LOAD
========================================================= */

async function loadDashboard() {
  setNextTournamentLoading();

  const TOURNAMENTS_COL = APP_CONFIG?.club?.tournamentsCollection || "tournaments";

  // arrancamos todo en paralelo
  const playersP = getDocs(collection(db, "club_players"));
  const trainingsP = getDocs(collection(db, "trainings"));
  const tournamentsP = getDocs(collection(db, TOURNAMENTS_COL));

  const [playersRes, trainingsRes, tournamentsRes] = await Promise.allSettled([
    playersP,
    trainingsP,
    tournamentsP
  ]);

  // --- Players
  let players = [];
  if (playersRes.status === "fulfilled") {
    players = playersRes.value.docs.map(doc => Player.fromFirestore(doc));
  } else {
    console.error("Error cargando players:", playersRes.reason);
  }

  // --- Trainings
  let trainings = [];
  if (trainingsRes.status === "fulfilled") {
    trainings = trainingsRes.value.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } else {
    console.error("Error cargando trainings:", trainingsRes.reason);
  }

  // --- Tournaments
  if (tournamentsRes.status === "fulfilled") {
    const tournaments = tournamentsRes.value.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNextTournament(tournaments);
  } else {
    console.error("Error cargando torneos:", tournamentsRes.reason);
    // esto evita que se quede en "Cargando…"
    setNextTournamentError("Sin acceso a torneos");
  }

  // Render resto aunque torneos falle
  renderBirthdays(players);

  const kpis = calculateMonthlyKPIs({ players, trainings });
  renderKPIs(kpis);

  const alerts = calculateAlerts({ players, trainings });
  renderAlerts(alerts);
}



/* =========================================================
   TOURNAMENTS
========================================================= */

function toDateSafeAny(value) {
  if (!value) return null;

  // Firestore Timestamp
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return isNaN(d) ? null : d;
  }

  // JS Date
  if (value instanceof Date) {
    return isNaN(value) ? null : value;
  }

  // String YYYY-MM-DD (local)
  if (typeof value === "string") {
    const s = value.trim().replaceAll("/", "-");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      return new Date(y, mo, da);
    }
    // fallback: Date parse
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }

  return null;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatTournamentRangePretty(startDate, endDate) {
  if (!startDate) return "—";

  const start = startOfDay(startDate);
  const end = endDate ? startOfDay(endDate) : null;

  const monthFmt = new Intl.DateTimeFormat("es-CR", { month: "short" });
  const m1 = capitalize(monthFmt.format(start).replace(".", ""));
  const d1 = start.getDate();

  if (!end || (end.getTime() === start.getTime())) {
    return `${m1} ${d1}`;
  }

  const m2 = capitalize(monthFmt.format(end).replace(".", ""));
  const d2 = end.getDate();

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${m1} ${d1}–${d2}`;
  }

  return `${m1} ${d1} – ${m2} ${d2}`;
}

function pickNextTournament(tournaments) {
  const now = startOfDay(new Date());

  const parsed = (tournaments || [])
    .map(t => {
      const ds = toDateSafeAny(t.dateStart);
      const de = toDateSafeAny(t.dateEnd);
      return { ...t, _ds: ds, _de: de };
    })
    .filter(t => t._ds);

  // futuros (incluye hoy)
  const future = parsed
    .filter(t => startOfDay(t._ds) >= now)
    .sort((a, b) => a._ds - b._ds);

  if (future.length) return future[0];

  // si no hay futuros, agarrá el más reciente pasado
  parsed.sort((a, b) => b._ds - a._ds);
  return parsed[0] || null;
}

function renderNextTournament(tournaments) {
  const dateEl = document.getElementById("nextTournamentDate");
  const nameEl = document.getElementById("nextTournamentName");
  if (!dateEl || !nameEl) return;

  const t = pickNextTournament(tournaments);

  if (!t) {
    dateEl.textContent = "—";
    nameEl.textContent = "Sin torneos próximos";
    setNextTournamentCardLink(null);
    return;
  }

  const range = formatTournamentRangePretty(t._ds, t._de);

  dateEl.textContent = range;
  nameEl.textContent = t.name || "Torneo";
  setNextTournamentCardLink(t.id);
}

function tournamentRosterUrl(id) {
  return `pages/admin/tournament_roster.html?id=${encodeURIComponent(id)}`;
}

function setNextTournamentCardLink(tournamentId) {
  const card = document.getElementById("nextTournamentCard");
  if (!card) return;

  if (!tournamentId) {
    card.onclick = null;
    card.style.pointerEvents = "none";
    card.style.cursor = "default";
    return;
  }

  card.style.pointerEvents = "auto";
  card.style.cursor = "pointer";
  card.onclick = () => {
    window.location.href = tournamentRosterUrl(tournamentId);
  };
}




/* =========================================================
   BIRTHDAYS
========================================================= */

function toDateSafe(birthday) {
  if (!birthday) return null;

  // Firestore Timestamp
  if (typeof birthday === "object" && typeof birthday.toDate === "function") {
    const d = birthday.toDate();
    return isNaN(d) ? null : d;
  }

  // JS Date
  if (birthday instanceof Date) {
    return isNaN(birthday) ? null : birthday;
  }

  // String YYYY-MM-DD (LOCAL)
  if (typeof birthday === "string") {
    const s = birthday.trim().replaceAll("/", "-");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      return new Date(y, mo, da); // 👈 FIX timezone
    }
  }

  return null;
}


function renderBirthdays(players) {
  const birthdaysList = document.getElementById("birthdaysList");
  if (!birthdaysList) return;

  const today = new Date();
  const currentMonth = today.getMonth();

  const list = (players || [])
    .map(p => {
      const d = toDateSafe(p.birthday);
      if (!d) return null;
      return { player: p, month: d.getMonth(), day: d.getDate() };
    })
    .filter(Boolean)
    .filter(x => x.month === currentMonth)
    .sort((a, b) => a.day - b.day);

  if (!list.length) {
    birthdaysList.textContent = "No hay cumpleañeros este mes";
    return;
  }

  birthdaysList.innerHTML = list
    .map(({ player, day }) => {
      const isToday = day === today.getDate();
      return `
          <div class="birthday-item ${isToday ? "today" : ""}">
            <strong>${escapeHtml(player.fullName)}</strong>
            <span class="ms-2">${day}</span>
          </div>
        `;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   KPIs
========================================================= */

function calculateMonthlyKPIs({ players, trainings }) {
  const now = new Date();
  const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
  const since = new Date(now.getTime() - THIRTY_DAYS);

  // Entrenamientos de los últimos 30 días
  const recentTrainings = trainings.filter(t => {
    if (!t.date) return false;
    const d = t.date.toDate?.() ?? new Date(t.date);
    return d >= since && d <= now;
  });

  // Asistencia total
  const totalAttendance = recentTrainings.reduce(
    (sum, t) => sum + (t.attendees?.length ?? 0),
    0
  );

  const avgAttendance = recentTrainings.length
    ? Math.round(totalAttendance / recentTrainings.length)
    : 0;

  // IDs de jugadores activos en roster
  const activeRosterIds = new Set(
    players.filter(p => p.active).map(p => p.id)
  );

  // Jugadores activos que participaron al menos una vez
  const activeParticipants = new Set();

  recentTrainings.forEach(t => {
    (t.attendees || []).forEach(id => {
      if (activeRosterIds.has(id)) {
        activeParticipants.add(id);
      }
    });
  });

  return {
    activePlayers: activeParticipants.size, // activos que entrenaron en últimos 30 días
    avgAttendance,
    trainingsCount: recentTrainings.length
  };
}


function renderKPIs(kpis) {
  document.getElementById("kpiActivePlayers").textContent =
    kpis.activePlayers;

  document.getElementById("kpiAvgAttendance").textContent =
    kpis.avgAttendance;

  document.getElementById("kpiTrainingsCount").textContent =
    kpis.trainingsCount;
}

/* =========================================================
   ALERTAS
========================================================= */

function calculateAlerts({ players, trainings }) {
  const alerts = [];
  const now = new Date();
  const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
  const since = new Date(now.getTime() - THIRTY_DAYS_MS);

  // helpers
  const toDate = (v) => {
    if (!v) return null;
    if (typeof v === "object" && typeof v.toDate === "function") return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fmt = (d) =>
    d ? new Intl.DateTimeFormat("es-CR", { day: "2-digit", month: "short" }).format(d).replace(".", "") : "—";

  // index players
  const byId = new Map(players.map(p => [p.id, p]));
  const activeIds = new Set(players.filter(p => p.active).map(p => p.id));
  const activePlayers = players.filter(p => p.active);

  // only trainings in last 30 days (and active)
  const recentTrainings = (trainings || [])
    .map(t => ({ ...t, _d: toDate(t.date) }))
    .filter(t => t.active && t._d && startOfDay(t._d) >= startOfDay(since) && startOfDay(t._d) <= startOfDay(now))
    .sort((a, b) => a._d - b._d); // oldest -> newest

  // If no trainings in last 30 days, that's the only alert that makes sense (and it respects scope)
  if (!recentTrainings.length) {
    alerts.push({
      type: "warning",
      message: "No hay entrenamientos registrados en los últimos 30 días."
    });
    return alerts;
  }

  // Attendance stats per training + global stats
  const attendanceCounts = recentTrainings.map(t => (Array.isArray(t.attendees) ? t.attendees.length : 0));
  const avgAtt = attendanceCounts.reduce((a, b) => a + b, 0) / attendanceCounts.length;

  const lastTraining = recentTrainings[recentTrainings.length - 1];
  const lastAtt = Array.isArray(lastTraining.attendees) ? lastTraining.attendees.length : 0;

  // --- Per-player last attendance within last 30 days
  const lastAttendance = {}; // pid -> Date
  const attendCount30 = {};  // pid -> count (last 30 days)

  recentTrainings.forEach(t => {
    const d = t._d;
    const list = Array.isArray(t.attendees) ? t.attendees : [];

    list.forEach(pid => {
      attendCount30[pid] = (attendCount30[pid] || 0) + 1;
      if (!lastAttendance[pid] || d > lastAttendance[pid]) lastAttendance[pid] = d;
    });
  });

  // 🔴 Activos sin entrenar en los últimos 30 días (scope correcto)
  const inactive30 = activePlayers.filter(p => !lastAttendance[p.id]);
  if (inactive30.length) {
    alerts.push({
      type: "danger",
      message: `${inactive30.length} jugadores activos no entrenaron en los últimos 30 días.`
    });
  }

  // 🟠 Activos con muy baja participación (≤1 entreno en 30 días)
  const lowParticipation = activePlayers.filter(p => (attendCount30[p.id] || 0) <= 1 && lastAttendance[p.id]);
  if (lowParticipation.length) {
    alerts.push({
      type: "warning",
      message: `${lowParticipation.length} jugadores activos entrenaron 1 vez o menos en los últimos 30 días.`
    });
  }

  // 🟡 Participación de roster activo en el último entreno
  const lastAttIds = new Set(Array.isArray(lastTraining.attendees) ? lastTraining.attendees : []);
  const activeInLast = [...lastAttIds].filter(id => activeIds.has(id)).length;
  const activeRosterSize = activeIds.size || 1;
  const pctActiveInLast = Math.round((activeInLast / activeRosterSize) * 100);

  if (pctActiveInLast < 35) {
    alerts.push({
      type: "warning",
      message: `Baja participación: solo ${pctActiveInLast}% del roster activo asistió al último entreno (${fmt(lastTraining._d)}).`
    });
  }

  // 🟡 Drop fuerte vs promedio (último entreno)
  if (avgAtt >= 8 && lastAtt <= avgAtt * 0.6) {
    alerts.push({
      type: "warning",
      message: `Asistencia cayó: último entreno (${lastAtt}) está ${Math.round((1 - lastAtt / avgAtt) * 100)}% por debajo del promedio 30 días (${avgAtt.toFixed(1)}).`
    });
  }

  // 🟡 Entrenos con baja asistencia (umbral dinámico + mínimo)
  const lowAttThreshold = Math.max(8, Math.round(avgAtt * 0.6));
  const lowAttendanceTrainings = recentTrainings.filter(t => (t.attendees?.length || 0) < lowAttThreshold);

  if (lowAttendanceTrainings.length >= 2) {
    const worst = lowAttendanceTrainings
      .slice()
      .sort((a, b) => (a.attendees?.length || 0) - (b.attendees?.length || 0))[0];

    alerts.push({
      type: "warning",
      message: `${lowAttendanceTrainings.length} entrenos tuvieron asistencia baja (<${lowAttThreshold}) en los últimos 30 días. Peor caso: ${fmt(worst._d)} con ${(worst.attendees?.length || 0)}.`
    });
  }

  // 🟠 Pocos handlers en un entreno (últimos 30 días)
  const trainingsFewHandlers = [];
  recentTrainings.forEach(t => {
    const handlerCount = (t.attendees || []).reduce((acc, id) => {
      const p = byId.get(id);
      return acc + (p?.role === "handler" ? 1 : 0);
    }, 0);

    // umbral: mínimo 3 o 25% de asistentes (lo que sea mayor)
    const att = t.attendees?.length || 0;
    const minHandlers = Math.max(3, Math.ceil(att * 0.25));

    if (att >= 8 && handlerCount < minHandlers) {
      trainingsFewHandlers.push({ t, handlerCount, minHandlers });
    }
  });

  if (trainingsFewHandlers.length) {
    // mostramos solo el peor (para no spamear)
    trainingsFewHandlers.sort((a, b) => (a.handlerCount / (a.t.attendees?.length || 1)) - (b.handlerCount / (b.t.attendees?.length || 1)));
    const w = trainingsFewHandlers[0];
    alerts.push({
      type: "warning",
      message: `Pocos handlers: ${fmt(w.t._d)} hubo ${w.handlerCount} handlers (mín recomendado ${w.minHandlers}).`
    });
  }

  // 🟡 Desbalance de género en el último entreno (si hay data)
  const lastGender = { M: 0, F: 0, X: 0, NA: 0 };
  (lastTraining.attendees || []).forEach(id => {
    const g = byId.get(id)?.gender;
    if (g === "M" || g === "F" || g === "X") lastGender[g]++;
    else lastGender.NA++;
  });

  const knownGender = lastGender.M + lastGender.F + lastGender.X;
  if (knownGender >= 10) {
    const max = Math.max(lastGender.M, lastGender.F);
    const min = Math.min(lastGender.M, lastGender.F);
    // si uno es 2x el otro (o más)
    if (min > 0 && max / min >= 2) {
      alerts.push({
        type: "warning",
        message: `Desbalance de género en el último entreno (${fmt(lastTraining._d)}): ${lastGender.M} H vs ${lastGender.F} M.`
      });
    }
  }

  // 🟠 Entrenos con data incompleta (últimos 30 días)
  const incomplete = recentTrainings.filter(t => !Array.isArray(t.attendees) || !t.attendees.length);
  if (incomplete.length >= 2) {
    alerts.push({
      type: "warning",
      message: `${incomplete.length} entrenos en los últimos 30 días tienen asistencia vacía o no registrada.`
    });
  }

  // 🔴 “ausentes recurrentes” (activos con 0 o 1 asistencia) — ya cubierto,
  // pero si querés un highlight de nombres (máx 5) para acción rápida:
  const topAbsents = inactive30
    .map(p => p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (inactive30.length && topAbsents.length) {
    alerts.push({
      type: "danger",
      message: `Sin entrenar (30 días): ${topAbsents.join(", ")}${inactive30.length > topAbsents.length ? "…" : ""}`
    });
  }

  return alerts;
}

function renderAlerts(alerts) {
  const el = document.getElementById("alertsList");
  if (!el) return;

  if (!alerts.length) {
    el.innerHTML = `
      <div class="alert-item">
        <span class="alert-icon">✅</span>
        <div class="alert-text">Todo en orden</div>
      </div>`;
    return;
  }

  el.innerHTML = alerts
    .map(
      a => `
        <div class="alert-item alert-${a.type}">
          <span class="alert-icon">
            ${a.type === "danger" ? "❌" : "⚠️"}
          </span>
          <div class="alert-text">${a.message}</div>
        </div>
      `
    )
    .join("");
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/* =========================================================
   VERSION
========================================================= */

const appVer = document.getElementById("appVersion");
if (appVer) appVer.textContent = `v${APP_CONFIG.version}`;