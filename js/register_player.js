import { db } from "./auth/firebase.js";
import { collection, addDoc, serverTimestamp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";

const COL = APP_CONFIG.collections;
const CLUB_PLAYERS_COL = COL.club_players;

function normalize(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getDefaultRole() {
  return APP_CONFIG?.playerRoles?.[0]?.id || "player";
}

function splitName(name) {
  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "", lastName: "" };

  const parts = clean.split(" ");
  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: ""
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.slice(-1).join("")
  };
}

const statusMsg = document.getElementById("statusMsg");

function showMessage(text, type = "success") {
  if (!statusMsg) return;

  statusMsg.innerHTML = `
    <div class="alert alert-${type}" role="alert">
      ${text}
    </div>
  `;
}

async function savePlayer() {
  const nameInput = document.getElementById("playerName");
  const numberInput = document.getElementById("playerNumber");
  const birthdayInput = document.getElementById("birthday");
  const roleInput = document.getElementById("playerRole");
  const genderInput = document.getElementById("playerGender");

  const rawName = nameInput?.value?.trim() || "";
  const numberRaw = numberInput?.value?.trim() || "";
  const birthday = birthdayInput?.value?.trim() || null;
  const role = (roleInput?.value || getDefaultRole()).trim();
  const gender = (genderInput?.value || "").trim() || null;

  const number = numberRaw === "" ? null : Number(numberRaw);

  if (!rawName || number == null || Number.isNaN(number)) {
    showMessage("❌ Nombre y número son obligatorios", "danger");
    return;
  }

  const { firstName, lastName } = splitName(rawName);
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || rawName;

  const player = {
    displayName,
    firstName,
    lastName,
    normalized: normalize(displayName),

    number,
    birthday,
    gender,
    role: role || getDefaultRole(),

    active: true,
    isActive: true,

    userId: null,
    linkedUserId: null,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, CLUB_PLAYERS_COL), player);

    showMessage("Jugador guardado ✅", "success");

    ["playerName", "playerNumber", "birthday", "playerRole", "playerGender"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  } catch (err) {
    console.error(err);
    showMessage("Error guardando jugador ❌", "danger");
  }
}

const saveBtn = document.getElementById("savePlayerBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", savePlayer);
}
