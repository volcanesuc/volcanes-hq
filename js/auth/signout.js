import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { mountLoader, showLoaderOverlay } from "../ui/loader.component.js";
import { TX } from "/js/strings/screens/signout.js";

async function forceSignOut() {
  try {
    mountLoader();
    showLoaderOverlay(TX.cerrandoSesion);

    // 🔥 Firebase sign out
    await signOut(auth);

    // 🧹 Limpieza extra si usás cosas locales
    localStorage.clear();
    sessionStorage.clear();

    // 🚀 Redirección segura
    window.location.replace("/login.html");
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    window.location.replace("/login.html");
  }
}

forceSignOut();