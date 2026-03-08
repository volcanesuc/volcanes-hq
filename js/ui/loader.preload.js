// /js/ui/loader.preload.js
(function () {
  const OVERLAY_ID = "clubLoadingOverlay";
  const STYLE_ID = "clubPreloadLoaderStyles";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body.loading { overflow: hidden; }

      #${OVERLAY_ID}{
        position:fixed; inset:0;
        display:flex; align-items:center; justify-content:center;
        z-index:99999;
        background: rgba(0,0,0,0.88);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
      }
      #${OVERLAY_ID} .loader-card{
        display:flex; flex-direction:column; align-items:center; gap:14px;
        padding:18px 20px; border-radius:16px;
        background: rgba(10,10,12,0.38);
        box-shadow: 0 12px 34px rgba(0,0,0,0.46);
        border: 1px solid rgba(255,255,255,0.06);
        font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }
      #${OVERLAY_ID} .loader{ width:96px; height:96px; }
      #${OVERLAY_ID} svg{ width:100%; height:100%; }

      #${OVERLAY_ID} .disc{
        fill: var(--loader-primary, var(--theme-primary, #19473f));
      }

      #${OVERLAY_ID} .inner-ring{
        fill:none;
        stroke: var(--loader-ring, #fff);
        stroke-width:3;
        opacity:.92;
      }

      #${OVERLAY_ID} .star{
        fill: var(--loader-accent, var(--theme-accent, #e8ce26));
        transform-origin:32px 32px;
        animation: loader-spin 3s linear infinite;
      }

      @keyframes loader-spin { to { transform: rotate(360deg); } }

      #${OVERLAY_ID} .loader-text{
        font-size:.98rem; color: rgba(255,255,255,0.86);
        text-align:center; max-width:320px;
      }
    `;
    document.head.appendChild(style);
  }

  function overlayMarkup() {
    return `
      <div class="loader-card" role="status" aria-live="polite" aria-label="Cargando">
        <div class="loader" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" class="disc"></circle>
            <circle cx="32" cy="32" r="23" class="inner-ring"></circle>
            <path class="star"
              d="M32 18
                 L36 27
                 L46 28
                 L39 35
                 L41 45
                 L32 40
                 L23 45
                 L25 35
                 L18 28
                 L28 27 Z"></path>
          </svg>
        </div>
        <div class="loader-text" id="${OVERLAY_ID}Message">Cargando…</div>
      </div>
    `;
  }

  function ensureOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.setAttribute("aria-hidden", "false");
      overlay.innerHTML = overlayMarkup();
      document.body.appendChild(overlay);
    }
    overlay.classList.add("is-visible");
    document.body.classList.add("loading");
    return overlay;
  }

  function boot() {
    ensureStyles();
    const overlay = ensureOverlay();

    const release = () => {
      overlay.classList.remove("is-visible");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.display = "none";
      document.documentElement.classList.remove("preload");
      document.body.classList.remove("loading");
    };

    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(release, 0);
    } else {
      window.addEventListener("DOMContentLoaded", () => setTimeout(release, 0), { once: true });
    }

    setTimeout(release, 2000);
  }

  if (document.body) {
    boot();
  } else {
    const mo = new MutationObserver(() => {
      if (document.body) {
        mo.disconnect();
        boot();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
})();