import { db } from "./auth/firebase.js";
import { collection, addDoc } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function savePlayer() {
  const name = document.getElementById("playerName").value.trim();
  const number = Number(document.getElementById("playerNumber").value);
  const birthdayInput = document.getElementById("birthday");
  const birthday = birthdayInput ? birthdayInput.value : null;

  if (!name || !number) {
    showMessage("❌ Nombre y número son obligatorios", "danger");
    return;
  }

  const player = {
    name,
    normalized: normalize(name),
    number,
    active: true
  };

  if (birthday) {
  player.birthday = birthday;
  }

  try {
    await addDoc(collection(db, "club_players"), player);
    showMessage("Jugador guardado ✅", "success");

    ["playerName", "playerNumber", "birthday"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  } catch (err) {
    console.error(err);
    showMessage("Error guardando jugador ❌", "danger");
  }
}

const statusMsg = document.getElementById("statusMsg");

function showMessage(text, type = "success") {
  statusMsg.innerHTML = `
    <div class="alert alert-${type}" role="alert">
      ${text}
    </div>
  `;
}

const saveBtn = document.getElementById("savePlayerBtn");
if (saveBtn) {
  saveBtn.addEventListener("click", savePlayer);
}
