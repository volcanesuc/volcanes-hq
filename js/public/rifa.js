// js\public/rifa.js
import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { APP_CONFIG } from "../config/config.js";
import { showLoader, hideLoader } from "../ui/loader.js";

showLoader();

let loaderHidden = false;
const RAFFLE_ID = "raffle_march";
const NUMBERS_COL_PATH = `raffles/${RAFFLE_ID}/numbers`;
const TOTAL_NUMBERS = 100;

const firebaseConfig = {
  apiKey: "AIzaSyABSy5kImaF9VyNisu2vkihm2y4mfYGodw",
  authDomain: "rifavolcanes.firebaseapp.com",
  projectId: "rifavolcanes",
};

const ADMIN_PASSWORD = "sub20.";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const loginBtn = document.getElementById("loginBtn");
const adminPass = document.getElementById("adminPass");

const contadorVendidos = document.getElementById("contadorVendidos");
const contadorDisponibles = document.getElementById("contadorDisponibles");
const contadorPendientes = document.getElementById("contadorPendientes");

let isAdmin = false;
const estadoNumeros = {};   // { i: { vendido, nombre, btn } }

function renderNumero(i) {
  const estado = estadoNumeros[i];
  const btn = estado.btn;

  btn.classList.remove(
    "btn-outline-secondary",
    "btn-danger",
    "btn-warning",
    "vendido",
    "pendiente"
  );

  if (estado.vendido) {
    const pendiente = estado.nombre.toLowerCase().includes("(p)");
    btn.classList.add(pendiente ? "btn-warning" : "btn-success");

    if (isAdmin && estado.nombre) {
      btn.innerText = `${i}\n${estado.nombre}`;
      btn.title = `Asignado a: ${estado.nombre}`;
    } else {
      btn.innerText = i;
      btn.title = "Número vendido";
    }
  } else {
    btn.classList.add("btn-outline-secondary");
    btn.innerText = i;
    btn.title = "";
  }
}

loginBtn.onclick = () => {
  if (adminPass.value !== ADMIN_PASSWORD) {
    alert("Clave incorrecta");
    return;
  }

  isAdmin = true;
  status.innerText = "Modo admin (puedes marcar vendidos)";
  status.classList.replace("text-secondary", "text-success");

  Object.keys(estadoNumeros).forEach(i => {
    estadoNumeros[i].btn.classList.remove("disabled");
    renderNumero(i);
  });
};

for (let i = 0; i < TOTAL_NUMBERS; i++) {
  const btn = document.createElement("button");
  btn.className = "number btn btn-outline-secondary w-100 disabled";
  btn.innerText = i;

  btn.onclick = async () => {
    if (!isAdmin) return;

    const actual = estadoNumeros[i]?.nombre || "";
    const nombre = prompt(`Asignar / editar nombre para el número ${i}:`, actual);
    if (!nombre) return;

    await setDoc(
      doc(db, NUMBERS_COL_PATH, i.toString()),
      { vendido: true, nombre },
      { merge: true }
    );
  };

  const col = document.createElement("div");
  col.appendChild(btn);
  grid.appendChild(col);

  estadoNumeros[i] = { vendido: false, nombre: "", btn };

  onSnapshot(doc(db, NUMBERS_COL_PATH, i.toString()), (snap) => {
    let vendido = false;
    let nombre = "";

    if (!loaderHidden) { //spinner
      hideLoader();
      loaderHidden = true;
    }

    if (snap.exists() && snap.data().vendido) {
      vendido = true;
      nombre = snap.data().nombre || "";
    }

    estadoNumeros[i].vendido = vendido;
    estadoNumeros[i].nombre = nombre;

    renderNumero(i);

    // contadores
    const vendidos = Object.values(estadoNumeros).filter(n => n.vendido);
    const pendientes = vendidos.filter(n =>
      n.nombre.toLowerCase().includes("(p)")
    );

    contadorVendidos.innerText = vendidos.length;
    contadorDisponibles.innerText = 100 - vendidos.length;
    contadorPendientes.innerText = pendientes.length;
  });
}

/* ================= VERSION ================= */
const versionEl = document.getElementById("appVersion");

if (versionEl) {
  versionEl.textContent = `v${APP_CONFIG.version}`;
}
