// js/ui/loader.component.js
import { APP_CONFIG } from "../config/config.js";

const OVERLAY_ID = "clubLoadingOverlay"; 
const STYLE_ID = "loaderStyles";

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.loading { overflow: hidden; }

    /* Overlay: fade con opacity + visibility */
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      display: flex;               /* siempre flex, controlamos con clases */
      align-items: center;
      justify-content: center;
      z-index: 99999;

      background: rgba(0,0,0,0.88); /* más oscuro */
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);

      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 220ms ease, visibility 0ms linear 220ms;
    }

    #${OVERLAY_ID}.is-visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition: opacity 220ms ease, visibility 0ms linear 0ms;
    }

    #${OVERLAY_ID} .loader-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 18px 20px;
      border-radius: 16px;
      background: rgba(10,10,12,0.38);
      box-shadow: 0 12px 34px rgba(0,0,0,0.46);
      border: 1px solid rgba(255,255,255,0.06);

      transform: translateY(6px) scale(0.98);
      opacity: 0;
      transition: transform 220ms ease, opacity 220ms ease;
    }

    #${OVERLAY_ID}.is-visible .loader-card {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    /* Loader */
    #${OVERLAY_ID} .loader { width: 96px; height: 96px; }
    #${OVERLAY_ID} svg { width: 100%; height: 100%; }

    /* Colores desde APP_CONFIG vía CSS vars */
    #${OVERLAY_ID} .disc { fill: var(--loader-primary); }

    /* Aro interno blanco configurable */
    #${OVERLAY_ID} .inner-ring {
      fill: none;
      stroke: var(--loader-ring);
      stroke-width: 3;
      opacity: 0.92;

      /* micro-anim */
      transform-origin: 32px 32px;
      animation: ring-pulse 1.6s ease-in-out infinite;
    }

    /* Estrella (más lento) */
    #${OVERLAY_ID} .star {
      fill: var(--loader-accent);
      transform-origin: 32px 32px;
      animation: loader-spin 3s linear infinite;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
    }

    /* Texto */
    #${OVERLAY_ID} .loader-text {
      font-size: 0.98rem;
      color: rgba(255,255,255,0.86);
      letter-spacing: 0.2px;
      text-align: center;
      max-width: 320px;
    }

    @keyframes loader-spin {
      to { transform: rotate(360deg); }
    }

    /* Pulse sutil del aro: leve "respirar" */
    @keyframes ring-pulse {
      0%, 100% { opacity: 0.78; transform: scale(1); }
      50%      { opacity: 0.98; transform: scale(1.02); }
    }

    /* Respeta reduce motion */
    @media (prefers-reduced-motion: reduce) {
      #${OVERLAY_ID}, #${OVERLAY_ID} .loader-card { transition: none !important; }
      #${OVERLAY_ID} .star, #${OVERLAY_ID} .inner-ring { animation: none !important; }
    }
  `;
  document.head.appendChild(style);
}

function readCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyThemeVars() {
  const root = document.documentElement;

  const cssPrimary = readCssVar("--loader-primary") || readCssVar("--theme-primary");
  const cssAccent  = readCssVar("--loader-accent")  || readCssVar("--theme-accent");
  const cssRing    = readCssVar("--loader-ring"); // si no existe, blanco

  const colors = APP_CONFIG?.theme?.colors || {};
  const primary = cssPrimary || colors.primary || "#19473f";
  const accent  = cssAccent  || colors.accent  || "#e8ce26";
  const ring    = cssRing || "#ffffff";

  root.style.setProperty("--loader-primary", primary);
  root.style.setProperty("--loader-accent", accent);
  root.style.setProperty("--loader-ring", ring);
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    document.body.appendChild(overlay);
  }
  return overlay;
}

export function mountLoader() {
  ensureStyles();
  applyThemeVars();
  return ensureOverlay();
}

export function setLoaderMessage(message = "Cargando…") {
  const msg = document.getElementById(`${OVERLAY_ID}Message`);
  if (msg) msg.textContent = message;
}
/**
 * show: prende clase is-visible (fade-in)
 */
export function showLoaderOverlay(message = "Cargando…") {
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
  ov.style.display = "none";
}