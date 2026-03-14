// dashboard.js
// Dashboard principal: jugadores, entrenamientos, KPIs y alertas

import { db } from "./auth/firebase.js";
import { watchAuth } from "./auth/auth.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";
import { showLoader, hideLoader } from "./ui/loader.js";

import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";

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
   HELPERS: PLAYERS / USERS / ATTENDANCE
========================================================= */

function normalizeRoleId(role) {
  return String(role || "").trim().toLowerCase();
}

function normalizeClubPlayerActive(cp = {}) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  if (safeCp.active === false) return false;
  if (safeCp.isActive === false) return false;
  if (safeCp.status === "inactive") return false;
  return true;
}

function getClubPlayerUserId(cp = {}) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  return safeCp.userId || safeCp.linkedUserId || safeCp.uid || safeCp.userRefId || null;
}

function getUserProfile(userData = {}) {
  const safeUser = userData && typeof userData === "object" ? userData : {};
  const profile = safeUser.profile && typeof safeUser.profile === "object"
    ? safeUser.profile
    : {};

  return {
    firstName: safeUser.firstName ?? profile.firstName ?? "",
    lastName: safeUser.lastName ?? profile.lastName ?? "",
    fullName: safeUser.fullName ?? profile.fullName ?? "",
    displayName: safeUser.displayName ?? profile.displayName ?? "",
    name: safeUser.name ?? profile.name ?? "",
    email: safeUser.email ?? profile.email ?? "",
    gender: safeUser.gender ?? profile.gender ?? null,
    birthday: safeUser.birthday ?? safeUser.birthDate ?? profile.birthday ?? profile.birthDate ?? null,
    number: safeUser.number ?? profile.number ?? null,
    role: safeUser.role ?? profile.role ?? "",
    photoURL: safeUser.photoURL ?? profile.photoURL ?? profile.avatarUrl ?? ""
  };
}

function getUserDisplayName(userData = {}) {
  const u = getUserProfile(userData);

  const joinedName = [u.firstName, u.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    u.fullName ||
    u.displayName ||
    joinedName ||
    u.name ||
    u.email ||
    "—"
  );
}

function getClubPlayerName(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  return (
    safeCp.fullName ||
    safeCp.displayName ||
    safeCp.name ||
    getUserDisplayName(user || {}) ||
    "—"
  );
}

function getClubPlayerNumber(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  const v = safeCp.number ?? safeCp.jerseyNumber ?? u.number ?? null;
  return v == null ? null : v;
}

function getClubPlayerRole(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return normalizeRoleId(safeCp.role || safeCp.position || u.role || "");
}

function getClubPlayerGender(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return safeCp.gender || u.gender || null;
}

function getClubPlayerBirthday(cp = {}, user = null) {
  const safeCp = cp && typeof cp === "object" ? cp : {};
  const u = getUserProfile(user || {});
  return safeCp.birthday || safeCp.birthDate || u.birthday || null;
}

function buildPlayersFromClubData({ usersDocs = [], clubPlayersDocs = [] }) {
  const usersById = {};
  usersDocs.forEach((d) => {
    usersById[d.id] = { id: d.id, ...d.data() };
  });

  return clubPlayersDocs.map((d) => {
    const cp = d.data() || {};
    const id = d.id;
    const userId = getClubPlayerUserId(cp);
    const user = userId ? usersById[userId] : null;
    const userProfile = getUserProfile(user || {});

    const fullName = getClubPlayerName(cp, user);
    const split = fullName && fullName !== "—"
      ? fullName.split(" ")
      : [];

    return {
      id,
      clubPlayerId: id,
      userId,

      firstName:
        cp.firstName ??
        userProfile.firstName ??
        (split.length > 1 ? split.slice(0, -1).join(" ") : split[0] || ""),

      lastName:
        cp.lastName ??
        userProfile.lastName ??
        (split.length > 1 ? split.slice(-1).join("") : ""),

      displayName: cp.displayName ?? userProfile.displayName ?? fullName,
      fullName,
      shortName: fullName,

      idNumber: cp.idNumber ?? user?.idNumber ?? userProfile.idNumber ?? null,
      number: getClubPlayerNumber(cp, user),
      gender: getClubPlayerGender(cp, user),
      birthday: getClubPlayerBirthday(cp, user),
      active:
        cp && Object.keys(cp).length
          ? normalizeClubPlayerActive(cp)
          : (user?.isPlayerActive === true || user?.isActive === true),
      role: getClubPlayerRole(cp, user),

      rawClubPlayer: cp,
      rawUser: user || null
    };
  });
}

function resolveAttendancePlayerId(attendee, playersById, playersByUserId) {
  if (!attendee) return null;

  if (typeof attendee === "string") {
    if (playersById.has(attendee)) return attendee;
    if (playersByUserId.has(attendee)) return playersByUserId.get(attendee)?.id || null;
    return null;
  }

  if (typeof attendee === "object") {
    const clubPlayerId =
      attendee.clubPlayerId ||
      attendee.playerId ||
      attendee.id ||
      null;

    if (clubPlayerId && playersById.has(clubPlayerId)) {
      return clubPlayerId;
    }

    const userId =
      attendee.userId ||
      attendee.uid ||
      attendee.linkedUserId ||
      null;

    if (userId && playersByUserId.has(userId)) {
      return playersByUserId.get(userId)?.id || null;
    }
  }

  return null;
}

function getTrainingAttendeePlayerIds(training, playersById, playersByUserId) {
  const attendees = Array.isArray(training?.attendees) ? training.attendees : [];
  const ids = [];

  attendees.forEach((attendee) => {
    const resolved = resolveAttendancePlayerId(attendee, playersById, playersByUserId);
    if (resolved) ids.push(resolved);
  });

  return ids;
}

function getTrainingAttendeeCount(training, playersById, playersByUserId) {
  return getTrainingAttendeePlayerIds(training, playersById, playersByUserId).length;
}

/* =========================================================
   DASHBOARD LOAD
========================================================= */

async function loadDashboard() {
  setNextTournamentLoading();

  const COL = APP_CONFIG.collections;

  const CLUB_PLAYERS_COL = COL.club_players;
  const USERS_COL = COL.users;
  const TRAININGS_COL = COL.trainings;
  const TOURNAMENTS_COL = COL.tournaments;

  const clubPlayersP = getDocs(collection(db, CLUB_PLAYERS_COL));
  const usersP = getDocs(collection(db, USERS_COL));
  const trainingsP = getDocs(collection(db, TRAININGS_COL));
  const tournamentsP = getDocs(collection(db, TOURNAMENTS_COL));

  const [clubPlayersRes, usersRes, trainingsRes, tournamentsRes] = await Promise.allSettled([
    clubPlayersP,
    usersP,
    trainingsP,
    tournamentsP
  ]);

  // --- Players from club_players + users
  let players = [];
  if (clubPlayersRes.status === "fulfilled" && usersRes.status === "fulfilled") {
    players = buildPlayersFromClubData({
      usersDocs: usersRes.value.docs,
      clubPlayersDocs: clubPlayersRes.value.docs
    });
  } else {
    if (clubPlayersRes.status !== "fulfilled") {
      console.error("Error cargando club_players:", clubPlayersRes.reason);
    }
    if (usersRes.status !== "fulfilled") {
      console.error("Error cargando users:", usersRes.reason);
    }
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
    setNextTournamentError("Sin acceso a torneos");
  }

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

  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return isNaN(d) ? null : d;
  }

  if (value instanceof Date) {
    return isNaN(value) ? null : value;
  }

  if (typeof value === "string") {
    const s = value.trim().replaceAll("/", "-");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      return new Date(y, mo, da);
    }
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

  const future = parsed
    .filter(t => startOfDay(t._ds) >= now)
    .sort((a, b) => a._ds - b._ds);

  if (future.length) return future[0];

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

  if (typeof birthday === "object" && typeof birthday.toDate === "function") {
    const d = birthday.toDate();
    return isNaN(d) ? null : d;
  }

  if (birthday instanceof Date) {
    return isNaN(birthday) ? null : birthday;
  }

  if (typeof birthday === "string") {
    const s = birthday.trim().replaceAll("/", "-");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const da = Number(m[3]);
      return new Date(y, mo, da);
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

  const playersById = new Map(players.map(p => [p.id, p]));
  const playersByUserId = new Map(
    players
      .filter(p => p.userId)
      .map(p => [p.userId, p])
  );

  const recentTrainings = trainings.filter(t => {
    if (!t.date) return false;
    const d = toDateSafeAny(t.date);
    return d && d >= since && d <= now;
  });

  const totalAttendance = recentTrainings.reduce(
    (sum, t) => sum + getTrainingAttendeeCount(t, playersById, playersByUserId),
    0
  );

  const avgAttendance = recentTrainings.length
    ? Math.round(totalAttendance / recentTrainings.length)
    : 0;

  const activeRosterIds = new Set(
    players.filter(p => p.active).map(p => p.id)
  );

  const activeParticipants = new Set();

  recentTrainings.forEach(t => {
    const ids = getTrainingAttendeePlayerIds(t, playersById, playersByUserId);
    ids.forEach(id => {
      if (activeRosterIds.has(id)) {
        activeParticipants.add(id);
      }
    });
  });

  return {
    activePlayers: activeParticipants.size,
    avgAttendance,
    trainingsCount: recentTrainings.length
  };
}

function renderKPIs(kpis) {
  document.getElementById("kpiActivePlayers").textContent = kpis.activePlayers;
  document.getElementById("kpiAvgAttendance").textContent = kpis.avgAttendance;
  document.getElementById("kpiTrainingsCount").textContent = kpis.trainingsCount;
}

/* =========================================================
   ALERTAS
========================================================= */

function calculateAlerts({ players, trainings }) {
  const alerts = [];
  const now = new Date();
  const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
  const since = new Date(now.getTime() - THIRTY_DAYS_MS);

  const startOfDayLocal = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const fmt = (d) =>
    d
      ? new Intl.DateTimeFormat("es-CR", { day: "2-digit", month: "short" })
          .format(d)
          .replace(".", "")
      : "—";

  const byId = new Map(players.map(p => [p.id, p]));
  const byUserId = new Map(
    players
      .filter(p => p.userId)
      .map(p => [p.userId, p])
  );

  const activeIds = new Set(players.filter(p => p.active).map(p => p.id));
  const activePlayers = players.filter(p => p.active);

  const today = startOfDayLocal(now);
  const sinceDay = startOfDayLocal(since);

  const recentTrainings = (trainings || [])
    .map(t => ({ ...t, _d: toDateSafeAny(t.date) }))
    .filter(t => {
      const isActiveTraining = t.active !== false;
      if (!isActiveTraining || !t._d) return false;
      const td = startOfDayLocal(t._d);
      return td >= sinceDay && td <= today;
    })
    .sort((a, b) => a._d - b._d);

  if (!recentTrainings.length) {
    alerts.push({
      type: "warning",
      message: "No hay entrenamientos registrados en los últimos 30 días."
    });
    return alerts;
  }

  const attendanceCounts = recentTrainings.map(t =>
    getTrainingAttendeeCount(t, byId, byUserId)
  );

  const avgAtt = attendanceCounts.reduce((a, b) => a + b, 0) / attendanceCounts.length;

  const lastTraining = recentTrainings[recentTrainings.length - 1];
  const lastTrainingIds = getTrainingAttendeePlayerIds(lastTraining, byId, byUserId);
  const lastAtt = lastTrainingIds.length;

  const lastAttendance = {};
  const attendCount30 = {};

  recentTrainings.forEach(t => {
    const d = t._d;
    const ids = getTrainingAttendeePlayerIds(t, byId, byUserId);

    ids.forEach(pid => {
      attendCount30[pid] = (attendCount30[pid] || 0) + 1;
      if (!lastAttendance[pid] || d > lastAttendance[pid]) lastAttendance[pid] = d;
    });
  });

  const inactive30 = activePlayers.filter(p => !lastAttendance[p.id]);
  if (inactive30.length) {
    alerts.push({
      type: "danger",
      message: `${inactive30.length} jugadores activos no entrenaron en los últimos 30 días.`
    });
  }

  const lowParticipation = activePlayers.filter(
    p => (attendCount30[p.id] || 0) <= 1 && lastAttendance[p.id]
  );

  if (lowParticipation.length) {
    alerts.push({
      type: "warning",
      message: `${lowParticipation.length} jugadores activos entrenaron 1 vez o menos en los últimos 30 días.`
    });
  }

  const lastAttIds = new Set(lastTrainingIds);
  const activeInLast = [...lastAttIds].filter(id => activeIds.has(id)).length;
  const activeRosterSize = activeIds.size || 1;
  const pctActiveInLast = Math.round((activeInLast / activeRosterSize) * 100);

  if (pctActiveInLast < 35) {
    alerts.push({
      type: "warning",
      message: `Baja participación: solo ${pctActiveInLast}% del roster activo asistió al último entreno (${fmt(lastTraining._d)}).`
    });
  }

  if (avgAtt >= 8 && lastAtt <= avgAtt * 0.6) {
    alerts.push({
      type: "warning",
      message: `Asistencia cayó: último entreno (${lastAtt}) está ${Math.round((1 - lastAtt / avgAtt) * 100)}% por debajo del promedio 30 días (${avgAtt.toFixed(1)}).`
    });
  }

  const lowAttThreshold = Math.max(8, Math.round(avgAtt * 0.6));
  const lowAttendanceTrainings = recentTrainings.filter(t => {
    const att = getTrainingAttendeeCount(t, byId, byUserId);
    return att < lowAttThreshold;
  });

  if (lowAttendanceTrainings.length >= 2) {
    const worst = lowAttendanceTrainings
      .slice()
      .sort((a, b) =>
        getTrainingAttendeeCount(a, byId, byUserId) - getTrainingAttendeeCount(b, byId, byUserId)
      )[0];

    alerts.push({
      type: "warning",
      message: `${lowAttendanceTrainings.length} entrenos tuvieron asistencia baja (<${lowAttThreshold}) en los últimos 30 días. Peor caso: ${fmt(worst._d)} con ${getTrainingAttendeeCount(worst, byId, byUserId)}.`
    });
  }

  const trainingsFewHandlers = [];
  recentTrainings.forEach(t => {
    const ids = getTrainingAttendeePlayerIds(t, byId, byUserId);
    const handlerCount = ids.reduce((acc, id) => {
      const p = byId.get(id);
      return acc + (normalizeRoleId(p?.role) === "handler" ? 1 : 0);
    }, 0);

    const att = ids.length;
    const minHandlers = Math.max(3, Math.ceil(att * 0.25));

    if (att >= 8 && handlerCount < minHandlers) {
      trainingsFewHandlers.push({ t, handlerCount, minHandlers, att });
    }
  });

  if (trainingsFewHandlers.length) {
    trainingsFewHandlers.sort(
      (a, b) => (a.handlerCount / (a.att || 1)) - (b.handlerCount / (b.att || 1))
    );
    const w = trainingsFewHandlers[0];
    alerts.push({
      type: "warning",
      message: `Pocos handlers: ${fmt(w.t._d)} hubo ${w.handlerCount} handlers (mín recomendado ${w.minHandlers}).`
    });
  }

  const lastGender = { M: 0, F: 0, X: 0, NA: 0 };
  lastTrainingIds.forEach(id => {
    const gRaw = byId.get(id)?.gender;
    const g = String(gRaw || "").trim().toUpperCase();

    if (g === "M") lastGender.M++;
    else if (g === "F") lastGender.F++;
    else if (g === "X") lastGender.X++;
    else lastGender.NA++;
  });

  const knownGender = lastGender.M + lastGender.F + lastGender.X;
  if (knownGender >= 10) {
    const max = Math.max(lastGender.M, lastGender.F);
    const min = Math.min(lastGender.M, lastGender.F);

    if (min > 0 && max / min >= 2) {
      alerts.push({
        type: "warning",
        message: `Desbalance de género en el último entreno (${fmt(lastTraining._d)}): ${lastGender.M} H vs ${lastGender.F} M.`
      });
    }
  }

  const incomplete = recentTrainings.filter(t => {
    const raw = t.attendees;
    return !Array.isArray(raw) || raw.length === 0;
  });

  if (incomplete.length >= 2) {
    alerts.push({
      type: "warning",
      message: `${incomplete.length} entrenos en los últimos 30 días tienen asistencia vacía o no registrada.`
    });
  }

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