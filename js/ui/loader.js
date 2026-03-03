// js/ui/loader.js
import { showLoaderOverlay, hideLoaderOverlay, setLoaderMessage } from "./loader.component.js";

export function showLoader(message = "Cargando…") {
  document.body.classList.add("loading");
  showLoaderOverlay(message);
}

export function hideLoader() {
  document.body.classList.remove("loading");
  document.documentElement.classList.remove("preload");
  hideLoaderOverlay();
}

export function updateLoaderMessage(message = "Cargando…") {
  setLoaderMessage(message);
}