// js/ui/loader.component.js
import { TX } from "/js/strings/screens/loader.js";

const OVERLAY_ID = "clubLoadingOverlay"; 
const STYLE_ID = "loaderStyles";

function ensureStyles() {
  if (document.getElementById(STYLE_ID) || document.getElementById("clubPreloadLoaderStyles")) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
      body.loading { overflow: hidden; }

      /* Loader de pantalla: fondo claro translúcido + aro con el color del club */
      #${OVERLAY_ID}{
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, #f6f6f9 80%, transparent);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 180ms ease, visibility 0ms linear 180ms;
      }

      #${OVERLAY_ID}.is-visible{
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition: opacity 180ms ease, visibility 0ms linear 0ms;
      }

      #${OVERLAY_ID} .loader-card{
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      }

      #${OVERLAY_ID} .loader-ring{
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 4px solid color-mix(in srgb, var(--theme-primary, #19473f) 18%, transparent);
        border-top-color: var(--theme-primary, #19473f);
        animation: club-loader-spin .8s linear infinite;
      }

      #${OVERLAY_ID} .loader-text{
        font-size: .9rem;
        font-weight: 600;
        color: rgba(0, 0, 0, .55);
        text-align: center;
        max-width: 320px;
      }

      @keyframes club-loader-spin { to { transform: rotate(360deg); } }

      @media (prefers-reduced-motion: reduce){
        #${OVERLAY_ID}{ transition: none !important; }
        #${OVERLAY_ID} .loader-ring{ animation-duration: 2s; }
      }
  `;
  document.head.appendChild(style);
}

function overlayMarkup() {
  return `
    <div class="loader-card" role="status" aria-live="polite" aria-label="${TX.cargando}">
      <div class="loader-ring" aria-hidden="true"></div>
      <div class="loader-text" id="${OVERLAY_ID}Message">${TX.cargando2}</div>
    </div>
  `;
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = overlayMarkup();
    document.body.appendChild(overlay);
  } else if (!overlay.querySelector(".loader-card")) {
    overlay.innerHTML = overlayMarkup();
  }
  return overlay;
}

export function mountLoader() {
  ensureStyles();
  return ensureOverlay();
}

export function setLoaderMessage(message = TX.cargando2) {
  const msg = document.getElementById(`${OVERLAY_ID}Message`);
  if (msg) msg.textContent = message;
}
/**
 * show: prende clase is-visible (fade-in)
 */
export function showLoaderOverlay(message = TX.cargando2) {
  const ov = document.getElementById(OVERLAY_ID);
  if (!ov) return;
  ov.style.display = "";
  ov.classList.add("is-visible");
  ov.setAttribute("aria-hidden", "false");
  setLoaderMessage(message);
}

/**
 * hide: quita is-visible (fade-out)
 */
export function hideLoaderOverlay() {
  const ov = document.getElementById(OVERLAY_ID);
  if (!ov) return;
  ov.classList.remove("is-visible");
  ov.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    if (!ov.classList.contains("is-visible")) {
      ov.style.display = "none";
    }
  }, 220);
}