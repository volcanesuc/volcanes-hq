/* ================= IMPORTS ================= */

import { db } from "./auth/firebase.js";

import {
  collection,
  getDocs,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================= DOM ================= */

const tableBody = document.getElementById("playersTable");
const sortNameBtn = document.getElementById("sortName");
const sortNumberBtn = document.getElementById("sortNumber");

const attendanceText = document.getElementById("attendanceText");
const processBtn = document.getElementById("processBtn");

const saveBtn = document.getElementById("saveBtn");
const trainingDateInput = document.getElementById("trainingDate");

/* ================= STATE ================= */

let players = [];
let sortState = { field: "name", asc: true };

/* ================= HELPERS ================= */

function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
}

/* ================= LOAD PLAYERS ================= */

async function loadPlayers() {
  const snapshot = await getDocs(collection(db, "club_players"));

  players = snapshot.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  renderTable();
}

/* ================= RENDER ================= */

function renderTable() {
  tableBody.innerHTML = "";

  const sorted = [...players].sort((a, b) => {
    let A = a[sortState.field];
    let B = b[sortState.field];

    if (sortState.field === "name") {
      A = A.toLowerCase();
      B = B.toLowerCase();
    }

    return sortState.asc ? (A > B ? 1 : -1) : (A < B ? 1 : -1);
  });

  sorted.forEach(p => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><input type="checkbox"
        data-player-id="${p.id}"
        data-player-name="${p.name}"></td>
      <td>${p.name}</td>
      <td>${p.number}</td>
    `;

    tableBody.appendChild(tr);
  });
}

/* ================= SORT ================= */

sortNameBtn.onclick = () => toggleSort("name");
sortNumberBtn.onclick = () => toggleSort("number");

function toggleSort(field) {
  sortState.field === field
    ? (sortState.asc = !sortState.asc)
    : (sortState = { field, asc: true });

  renderTable();
}

/* ================= TEXT MATCH ================= */

processBtn.onclick = () => {
  const tokens = normalize(attendanceText.value)
    .split(/\s+|\n|,/)
    .filter(t => t.length >= 3);

  document
    .querySelectorAll("input[type=checkbox][data-player-name]")
    .forEach(cb => {
      const name = normalize(cb.dataset.playerName);
      if (tokens.some(t => name.includes(t))) cb.checked = true;
    });
};

/* ================= SAVE TRAINING ================= */

saveBtn.onclick = async () => {
  const date = trainingDateInput.value;
  if (!date) return alert("Elegí una fecha");

  saveBtn.disabled = true;

  try {
    // 1️⃣ entreno
    await setDoc(
      doc(db, "club_trainings", date),
      { date, createdAt: serverTimestamp() },
      { merge: true }
    );

    // 2️⃣ borrar asistencia previa
    const prev = await getDocs(
      query(
        collection(db, "club_attendance"),
        where("trainingId", "==", date)
      )
    );

    for (const d of prev.docs) {
      await deleteDoc(d.ref);
    }

    // 3️⃣ guardar presentes
    const checked = document.querySelectorAll(
      "input[type=checkbox][data-player-id]:checked"
    );

    for (const cb of checked) {
      await addDoc(collection(db, "club_attendance"), {
        trainingId: date,
        playerId: cb.dataset.playerId,
        present: true
      });
    }

    alert(`Entreno guardado ✅ (${checked.length} presentes)`);

  } catch (e) {
    console.error(e);
    alert("❌ Error guardando entreno");
  } finally {
    saveBtn.disabled = false;
  }
};

/* ================= INIT ================= */

loadPlayers();
