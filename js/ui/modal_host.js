// js/ui/modal_host.js
let host = null;
let frame = null;
let initialized = false;
let lastFocusedElement = null;

function ensureElements() {
  host = document.getElementById("modalHost");
  frame = document.getElementById("modalFrame");
  return !!(host && frame);
}

function isOpen() {
  return !!host && !host.classList.contains("d-none");
}

function setFrameHeight(px) {
  if (!frame) return;
  const max = Math.floor(window.innerHeight * 0.9);
  const min = 240;
  const safe = Math.min(Math.max(Number(px) || min, min), max);
  frame.style.height = `${safe}px`;
}

function handleMessage(event) {
  if (event.origin !== window.location.origin) return;

  const msg = event?.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "modal:close") {
    closeModal();
    return;
  }

  if (msg.type === "modal:resize" && typeof msg.height === "number") {
    setFrameHeight(msg.height);
    return;
  }

  if (msg.type === "user:saved") {
    closeModal();
    window.dispatchEvent(
      new CustomEvent("user:saved", { detail: msg.detail || {} })
    );
  }
}

function handleBackdropClick(e) {
  if (e.target === host) closeModal();
}

function handleKeydown(e) {
  if (e.key === "Escape" && isOpen()) {
    closeModal();
  }
}

function handleWindowResize() {
  if (!isOpen() || !frame) return;

  const current = parseInt(frame.style.height || "0", 10);
  if (current > 0) setFrameHeight(current);
}

export function initModalHost() {
  if (initialized) return;
  if (!ensureElements()) return;

  host.addEventListener("click", handleBackdropClick);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("message", handleMessage);
  window.addEventListener("resize", handleWindowResize);

  initialized = true;
}

export function openModal(url) {
  if (!initialized) initModalHost();
  if (!ensureElements()) return;

  lastFocusedElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  frame.src = "about:blank";
  frame.style.width = "100%";
  setFrameHeight(Math.min(720, Math.floor(window.innerHeight * 0.85)));
  frame.src = url;

  host.classList.remove("d-none");
  host.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  // foco básico al iframe para accesibilidad
  try {
    frame.focus();
  } catch (_) {}
}

export function closeModal() {
  if (!ensureElements()) return;

  host.classList.add("d-none");
  host.setAttribute("aria-hidden", "true");

  frame.src = "about:blank";
  frame.style.height = "";
  frame.style.width = "";

  document.body.style.overflow = "";

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    try {
      lastFocusedElement.focus();
    } catch (_) {}
  }

  lastFocusedElement = null;
}
