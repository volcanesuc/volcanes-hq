// js/ui/modal_host.js
let host = null;
let shell = null;
let frame = null;
let initialized = false;
let lastFocusedElement = null;

function ensureElements() {
  host = document.getElementById("modalHost");
  shell = host?.querySelector(".mh-shell") || null;
  frame = document.getElementById("modalFrame");
  return !!(host && shell && frame);
}

function isOpen() {
  return !!host && !host.classList.contains("d-none");
}

function setFrameHeight(px) {
  if (!frame || !host) return;

  if (host.classList.contains("mh-fullscreen")) {
    frame.style.height = "100%";
    return;
  }

  const max = Math.floor(window.innerHeight * 0.9);
  const min = 240;
  const safe = Math.min(Math.max(Number(px) || min, min), max);
  frame.style.height = `${safe}px`;
}

function resetHostState() {
  if (!host || !shell || !frame) return;

  host.classList.remove("mh-fullscreen");
  shell.classList.remove("mh-shell-fullscreen");

  frame.style.height = "";
  frame.style.width = "";
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

  if (host?.classList.contains("mh-fullscreen")) {
    frame.style.height = "100%";
    return;
  }

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

export function openModal(url, options = {}) {
  if (!initialized) initModalHost();
  if (!ensureElements()) return;

  const { fullscreen = false } = options;

  lastFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  resetHostState();

  if (fullscreen) {
    host.classList.add("mh-fullscreen");
    shell.classList.add("mh-shell-fullscreen");
    frame.style.width = "100%";
    frame.style.height = "100%";
  } else {
    frame.style.width = "100%";
    setFrameHeight(Math.min(720, Math.floor(window.innerHeight * 0.85)));
  }

  frame.src = "about:blank";
  frame.src = url;

  host.classList.remove("d-none");
  host.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  try {
    frame.focus();
  } catch (_) {}
}

export function closeModal() {
  if (!ensureElements()) return;

  host.classList.add("d-none");
  host.setAttribute("aria-hidden", "true");

  frame.src = "about:blank";
  document.body.style.overflow = "";

  resetHostState();

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    try {
      lastFocusedElement.focus();
    } catch (_) {}
  }

  lastFocusedElement = null;
}
