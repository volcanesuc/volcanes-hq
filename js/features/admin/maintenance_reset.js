// /js/features/admin/maintenance_reset.js
// Ajustes › Mantenimiento: reinicio de los datos de personas para arrancar limpio con el modelo por uid.
// Primero cuenta (simulacro), después borra solo si el admin escribe la palabra de confirmación.
//
// Se borra: usuarios (menos admins), fichas de jugador, invitados, membresías y pagos,
// inscripciones a pickups, publicaciones, asistencias y rosters de torneos.
// Se conserva: configuración del club, planes, playbook/gimnasio, entrenamientos y torneos
// (sin personas), pickups (sin inscripciones) y contabilidad.
import { auth, db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { clearAccessCache } from "/js/core/me.js";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { defineStrings, fmt } from "/js/core/texts.js";

const COL = APP_CONFIG.collections;

const T = defineStrings("maintenance", "Ajustes: mantenimiento", {
  title: "Reiniciar datos de personas",
  intro: "Borra a las personas y todo lo que cuelga de ellas para empezar de cero con el modelo nuevo (el uid manda). La configuración y el contenido del club se conservan. No se puede deshacer: exportá un respaldo desde Firebase Console antes.",
  willDelete: "Se borra",
  willKeep: "Se conserva",
  count: "Contar",
  counting: "Contando…",
  confirmLabel: "Para confirmar escribí {word}",
  confirmWord: "REINICIAR",
  run: "Reiniciar datos",
  running: "Reiniciando…",
  done: "Listo. Recargá la página.",
  error: "Se detuvo con un error: {err}",
  needCount: "Primero tocá «Contar» para ver qué se va a borrar.",
  adminsKept: "Admins que se conservan: {names}",
  noAdmins: "No hay ningún admin: no se puede reiniciar sin perder el acceso.",
  docs: "{n} docs",
  logDeleted: "{label}: {n} borrados",
  logCleared: "{label}: {n} limpiados",
  logAdmins: "Admins normalizados: {n}",
  keepConfig: "Configuración del club (tema, textos, inicio, ajustes de pickups)",
  keepPlans: "Planes de membresía",
  keepContent: "Playbook, drills y gimnasio",
  keepEvents: "Entrenamientos y torneos (sin asistencias ni rosters)",
  keepPickups: "Pickups (sin inscripciones)",
  keepFinance: "Contabilidad (finance_movements); si querés borrarla, hacelo desde la consola",
  keepFiles: "Archivos subidos (comprobantes, fotos) en Storage",
  keepAuth: "Las cuentas de Google: al volver a entrar, cada persona se registra de nuevo",
  legacyNote: "Colecciones viejas que las reglas ya cierran (associates, rifa, live_games, club_attendance): borralas a mano desde la consola si existen.",
});

// Colecciones que se vacían por completo.
const WIPE = [
  { col: COL.club_players, label: "Fichas de jugador" },
  { col: COL.guests, label: "Invitados de torneos" },
  { col: COL.memberships, label: "Membresías" },
  { col: COL.membershipInstallments, label: "Cuotas de membresía" },
  { col: COL.membershipPaymentSubmissions, label: "Comprobantes de pago" },
  { col: "public_membership_payment_submissions", label: "Comprobantes por link público" },
  { col: "membership_payment_links", label: "Links de pago" },
  { col: COL.pickupRegistrations, label: "Inscripciones a pickups", sub: "private" },
  { col: COL.pickupRegKeys, label: "Links privados de pickups" },
  { col: COL.pickupRegClaims, label: "Accesos a links de pickups" },
  { col: COL.communityPosts, label: "Publicaciones de Comunidad" },
];

const LEGACY_USER_FIELDS = [
  "isPlayerActive", "isActive", "playerStatus", "associationStatus", "playerId", "memberId", "phone", "emergencyContact",
];

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let plan = null; // resultado del conteo

async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

async function buildPlan() {
  const [usersSnap, trainingsSnap, tournamentsSnap, ...wipeSnaps] = await Promise.all([
    getDocs(collection(db, COL.users)),
    getDocs(collection(db, COL.trainings)),
    getDocs(collection(db, COL.tournaments)),
    ...WIPE.map((w) => getDocs(collection(db, w.col)).catch(() => null)),
  ]);

  const me = auth.currentUser?.uid;
  const users = usersSnap.docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() }));
  const admins = users.filter((u) => String(u.role || "").toLowerCase() === "admin" || u.id === me);
  const others = users.filter((u) => !admins.includes(u));

  const rosterRefs = [];
  for (const t of tournamentsSnap.docs) {
    const r = await getDocs(collection(db, COL.tournaments, t.id, "roster")).catch(() => null);
    r?.docs.forEach((d) => rosterRefs.push(d.ref));
  }

  return {
    admins,
    others,
    trainingsWithAttendance: trainingsSnap.docs.filter((d) => (d.data().attendees || []).length),
    rosterRefs,
    wipe: WIPE.map((w, i) => ({ ...w, snap: wipeSnaps[i] })),
  };
}

function renderPlan(root) {
  const box = root.querySelector("[data-mt-plan]");
  if (!plan) {
    box.innerHTML = "";
    return;
  }
  const n = (x) => `<span class="ui-chip__n">${x}</span>`;
  const rows = [
    `<li>Usuarios que no son admin ${n(plan.others.length)}</li>`,
    ...plan.wipe.map((w) => `<li>${esc(w.label)} ${n(w.snap ? w.snap.size : "—")}</li>`),
    `<li>Asistencias de entrenamientos ${n(plan.trainingsWithAttendance.length)}</li>`,
    `<li>Rosters de torneos ${n(plan.rosterRefs.length)}</li>`,
  ];
  const adminNames = plan.admins.map((a) => a.email || a.displayName || a.id).join(", ");
  box.innerHTML = `
    <div class="${plan.admins.length ? "text-muted" : "text-danger fw-bold"} small mb-2">
      ${plan.admins.length ? esc(fmt(T.adminsKept, { names: adminNames })) : esc(T.noAdmins)}
    </div>
    <ul class="mt-list">${rows.join("")}</ul>`;
  root.querySelector("[data-mt-confirm-wrap]").classList.toggle("d-none", !plan.admins.length);
}

async function runReset(log) {
  // 1) Colecciones completas (con su subcolección privada si tiene)
  for (const w of plan.wipe) {
    if (!w.snap) continue;
    const refs = [];
    for (const d of w.snap.docs) {
      if (w.sub) {
        const sub = await getDocs(collection(d.ref, w.sub)).catch(() => null);
        sub?.docs.forEach((s) => refs.push(s.ref));
      }
      refs.push(d.ref);
    }
    await deleteRefs(refs);
    log(fmt(T.logDeleted, { label: w.label, n: w.snap.size }));
  }

  // 2) Rosters de torneos y asistencias (los torneos y entrenamientos quedan)
  await deleteRefs(plan.rosterRefs);
  log(fmt(T.logDeleted, { label: "Rosters de torneos", n: plan.rosterRefs.length }));

  for (let i = 0; i < plan.trainingsWithAttendance.length; i += 400) {
    const batch = writeBatch(db);
    plan.trainingsWithAttendance.slice(i, i + 400).forEach((d) => batch.update(d.ref, { attendees: [] }));
    await batch.commit();
  }
  log(fmt(T.logCleared, { label: "Asistencias", n: plan.trainingsWithAttendance.length }));

  // 3) Usuarios que no son admin
  await deleteRefs(plan.others.map((u) => u.ref));
  log(fmt(T.logDeleted, { label: "Usuarios", n: plan.others.length }));

  // 4) Admins: al modelo nuevo, sin campos viejos ni membresías
  const batch = writeBatch(db);
  for (const a of plan.admins) {
    const patch = {
      status: { player: "", association: "" },
      membershipIds: [],
      currentMembership: null,
      updatedAt: serverTimestamp(),
    };
    for (const f of LEGACY_USER_FIELDS) if (f in a) patch[f] = deleteField();
    batch.update(a.ref, patch);
  }
  await batch.commit();
  log(fmt(T.logAdmins, { n: plan.admins.length }));
}

export async function mount(container) {
  const keep = [T.keepConfig, T.keepPlans, T.keepContent, T.keepEvents, T.keepPickups, T.keepFinance, T.keepFiles, T.keepAuth];

  container.innerHTML = `
    <section class="te-card mt-card">
      <header class="te-card__head">
        <div>
          <h3 class="te-card__title">${esc(T.title)}</h3>
          <div class="te-card__hint">${esc(T.intro)}</div>
        </div>
      </header>
      <div class="p-3">
        <div class="row g-4">
          <div class="col-12 col-md-6">
            <div class="mt-heading mt-heading--del"><i class="bi bi-trash3"></i> ${esc(T.willDelete)}</div>
            <div data-mt-plan><div class="small text-muted">${esc(T.needCount)}</div></div>
            <button type="button" class="btn btn-outline-secondary btn-sm mt-2" data-mt-count>${esc(T.count)}</button>
          </div>
          <div class="col-12 col-md-6">
            <div class="mt-heading mt-heading--keep"><i class="bi bi-shield-check"></i> ${esc(T.willKeep)}</div>
            <ul class="mt-list">${keep.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>
            <div class="small text-muted">${esc(T.legacyNote)}</div>
          </div>
        </div>

        <div class="mt-confirm d-none" data-mt-confirm-wrap>
          <label class="form-label" for="mtConfirm">${esc(fmt(T.confirmLabel, { word: T.confirmWord }))}</label>
          <div class="d-flex gap-2 flex-wrap">
            <input id="mtConfirm" class="form-control" autocomplete="off" style="max-width: 16rem" />
            <button type="button" class="btn btn-danger" data-mt-run disabled>${esc(T.run)}</button>
          </div>
        </div>

        <pre class="mt-log d-none" data-mt-log></pre>
      </div>
    </section>`;

  const $ = (sel) => container.querySelector(sel);
  const logEl = $("[data-mt-log]");
  const log = (line) => {
    logEl.classList.remove("d-none");
    logEl.textContent += `${line}\n`;
  };

  $("[data-mt-count]").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = T.counting;
    try {
      plan = await buildPlan();
      renderPlan(container);
    } catch (err) {
      console.error("[maintenance] count", err);
      log(fmt(T.error, { err: err?.code || err?.message || err }));
    } finally {
      btn.disabled = false;
      btn.textContent = T.count;
    }
  });

  $("#mtConfirm").addEventListener("input", (ev) => {
    $("[data-mt-run]").disabled = ev.target.value.trim() !== T.confirmWord || !plan?.admins.length;
  });

  $("[data-mt-run]").addEventListener("click", async (ev) => {
    if (!plan?.admins.length || $("#mtConfirm").value.trim() !== T.confirmWord) return;
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = T.running;
    $("#mtConfirm").disabled = true;
    try {
      // contar de nuevo justo antes, por si algo cambió
      plan = await buildPlan();
      await runReset(log);
      clearAccessCache();
      log(T.done);
    } catch (err) {
      console.error("[maintenance] reset", err);
      log(fmt(T.error, { err: err?.code || err?.message || err }));
      btn.disabled = false;
      $("#mtConfirm").disabled = false;
    } finally {
      btn.textContent = T.run;
    }
  });
}
