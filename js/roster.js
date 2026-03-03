//js\roster.js
/*************************************************
 * IMPORTS
 *************************************************/
import { db } from "./auth/firebase.js";
import { watchAuth, logout } from "./auth/auth.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";

import { showLoader, hideLoader } from "./ui/loader.js";
import { Player } from "./models/player.js";

/*************************************************
 * INIT
 *************************************************/

// Header del dashboard
const { cfg, redirected } = await guardPage("roster");
if (!redirected) {
  await loadHeader("roster", cfg);
}


// Logout
document.getElementById("logoutBtn")?.addEventListener("click", logout);

// DOM
const table = document.getElementById("playersTable");
const modal = new bootstrap.Modal("#playerModal");
const form = document.getElementById("playerForm");

// Campos del formulario
const fields = {
  id: document.getElementById("playerId"),
  firstName: document.getElementById("firstName"),
  lastName: document.getElementById("lastName"),
  idNumber: document.getElementById("idNumber"),
  number: document.getElementById("number"),
  gender: document.getElementById("gender"),
  birthday: document.getElementById("birthday"),
  role: document.getElementById("role"),
  active: document.getElementById("active")
};

// Array plano de jugadores (clave para sorting)
let players = [];

/*************************************************
 * SORT STATE
 *************************************************/

let currentSort = {
  key: "name",
  direction: "asc"
};

/*************************************************
 * LOAD DATA
 *************************************************/

async function loadPlayers() {
  const snap = await getDocs(collection(db, "club_players"));

  players = snap.docs.map(d =>
    Player.fromFirestore(d)
  );

  applySort();
  render();
  updateSortIndicators();
}

/*************************************************
 * SORTING
 *************************************************/

function applySort() {
  const dir = currentSort.direction === "asc" ? 1 : -1;

  players.sort((a, b) => {
    // 1️⃣ PRIORIDAD ABSOLUTA: activos primero
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    // 2️⃣ Si ambos son activos o ambos inactivos → aplicar sort normal
    let valA, valB;

    switch (currentSort.key) {
      case "name":
        valA = `${a.firstName} ${a.lastName}`.toLowerCase();
        valB = `${b.firstName} ${b.lastName}`.toLowerCase();
        break;

      case "number":
        valA = a.number ?? 999;
        valB = b.number ?? 999;
        break;

      case "role":
        valA = a.role ?? "";
        valB = b.role ?? "";
        break;

      case "gender":
        valA = a.gender ?? "";
        valB = b.gender ?? "";
        break;

      case "birthday":
        valA = a.birthday ?? "";
        valB = b.birthday ?? "";
        break;

      case "active":
        // si clickean "Estado", igual se mantiene la regla
        valA = a.active ? 1 : 0;
        valB = b.active ? 1 : 0;
        break;

      default:
        return 0;
    }

    return valA > valB ? dir : valA < valB ? -dir : 0;
  });
}


/*************************************************
 * RENDER
 *************************************************/

function render() {
  table.innerHTML = players
    .map(
      p => `
      <tr data-id="${p.id}" class="player-row" style="cursor:pointer">
        <td class="fw-semibold">${p.fullName}</td>
        <td>
          <span class="badge bg-info text-dark">
            ${p.roleLabel}
          </span>
        </td>
        <td>${p.number ?? "—"}</td>
        <td>${p.gender ?? "—"}</td>
        <td>${p.birthday ?? "—"}</td>
        <td>
          <span class="badge ${p.active ? "bg-success" : "bg-secondary"}">
            ${p.active ? "Activo" : "Inactivo"}
          </span>
        </td>
      </tr>
    `
    )
    .join("");
    updateRosterStats(); //muestra contadores
    renderMobileCards();
}

function renderMobileCards() {
  const container = document.getElementById("playersCards");
  if (!container) return;

  container.innerHTML = players.map(p => `
    <div class="card mb-2 player-card" data-id="${p.id}">
      <div class="card-body p-3">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="fw-semibold">${p.fullName}</div>
            <div class="text-muted small">
              ${p.roleLabel} · #${p.number ?? "—"}
            </div>
          </div>
          <span class="badge ${p.active ? "bg-success" : "bg-secondary"}">
            ${p.active ? "Activo" : "Inactivo"}
          </span>
        </div>

        <div class="mt-2 small text-muted">
          ${p.gender ?? "—"} · ${p.birthday ?? "—"}
        </div>
      </div>
    </div>
  `).join("");
}

//Contadores
function calculateAge(birthday) {
  if (!birthday) return null;

  const birth = new Date(birthday);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

function updateRosterStats() {
  const list = Object.values(players);
  const activeList = list.filter(p => p.active);

  const total = list.length;
  const active = activeList.length;
  const inactive = total - active;

  const men = activeList.filter(p => p.gender === "M" ).length;
  const women = activeList.filter(p => p.gender === "F").length;

  let masterH = 0;
  let masterM = 0;
  let u24H = 0;
  let u24M = 0;

  activeList.forEach(p => {
    const age = calculateAge(p.birthday);
    if (age === null || !p.gender) return;

    // MASTER
    if (p.gender === "M" && age >= 33) masterH++;
    if (p.gender === "F" && age >= 30) masterM++;

    // U24
    if (age < 24) {
      if (p.gender === "M") u24H++;
      if (p.gender === "F") u24M++;
    }
  });

  document.getElementById("statActive").textContent = `${active} activos`;
  document.getElementById("statInactive").textContent = `${inactive} inactivos`;

  document.getElementById("statMen").textContent = men;
  document.getElementById("statWomen").textContent = women;

  document.getElementById("statMasterH").textContent = masterH;
  document.getElementById("statMasterM").textContent = masterM;

  document.getElementById("statU24H").textContent = u24H;
  document.getElementById("statU24M").textContent = u24M;
}


/*************************************************
 * CLICK EN FILA (EDITAR)
 *************************************************/

table.onclick = e => {
  const row = e.target.closest(".player-row");
  if (!row) return;

  const id = row.dataset.id;
  const p = players.find(pl => pl.id === id);
  if (!p) return;

  fields.id.value = p.id;
  fields.firstName.value = p.firstName;
  fields.lastName.value = p.lastName;
  fields.idNumber.value = p.idNumber ?? "";
  fields.number.value = p.number ?? "";
  fields.gender.value = p.gender ?? "";
  fields.birthday.value = p.birthday ?? "";
  fields.role.value = p.role ?? "cutter";
  fields.active.checked = p.active;

  modal.show();
};

/*************************************************
 * CLICK EN CARD (MOBILE)
 *************************************************/

document.getElementById("playersCards").onclick = e => {
  const card = e.target.closest(".player-card");
  if (!card) return;

  const p = players.find(pl => pl.id === card.dataset.id);
  if (!p) return;

  fields.id.value = p.id;
  fields.firstName.value = p.firstName;
  fields.lastName.value = p.lastName;
  fields.number.value = p.number ?? "";
  fields.gender.value = p.gender ?? "";
  fields.birthday.value = p.birthday ?? "";
  fields.role.value = p.role ?? "cutter";
  fields.active.checked = p.active;

  modal.show();
};

/*************************************************
 * CLICK EN HEADERS (SORT)
 *************************************************/

document.querySelectorAll("th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;

    if (currentSort.key === key) {
      currentSort.direction =
        currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.key = key;
      currentSort.direction = "asc";
    }

    applySort();
    render();
    updateSortIndicators();
  });
});

function updateSortIndicators() {
  document.querySelectorAll("th.sortable").forEach(th => {
    th.classList.remove("sorted-asc", "sorted-desc");

    if (th.dataset.sort === currentSort.key) {
      th.classList.add(
        currentSort.direction === "asc"
          ? "sorted-asc"
          : "sorted-desc"
      );
    }
  });
}

/*************************************************
 * NUEVO JUGADOR
 *************************************************/

document.getElementById("addPlayerBtn").onclick = () => {
  form.reset();
  fields.id.value = "";
  fields.idNumber.value = "";
  fields.active.checked = true;
  modal.show();
};

/*************************************************
 * SAVE FORM
 *************************************************/

form.onsubmit = async e => {
  e.preventDefault();

  const data = {
    firstName: fields.firstName.value.trim(),
    lastName: fields.lastName.value.trim(),
    idNumber: (fields.idNumber.value || "").trim() || null,
    number: Number(fields.number.value) || null,
    gender: fields.gender.value || null,
    birthday: fields.birthday.value || null,
    role: fields.role.value,
    active: fields.active.checked
  };

  if (!data.idNumber) {
    alert("Ingresa la cédula.");
    return;
  }

  if (fields.id.value) {
    await updateDoc(
      doc(db, "club_players", fields.id.value),
      new Player(null, data).toFirestore()
    );
  } else {
    await setDoc(
      doc(collection(db, "club_players")),
      new Player(null, data).toFirestore()
    );
  }

  modal.hide();
  loadPlayers();
};

/*************************************************
 * AUTH FLOW
 *************************************************/

watchAuth(async () => {
  showLoader();
  try {
    await loadPlayers();
  } finally {
    hideLoader();
  }
});
