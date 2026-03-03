// js/ui/modal_host.js
let host, frame;

export function initModalHost(){
  host = document.getElementById("modalHost");
  frame = document.getElementById("modalFrame");
  if (!host || !frame) return;

  host.addEventListener("click", (e) => {
    if (e.target === host) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !host.classList.contains("d-none")) closeModal();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data || {};

    if (msg.type === "modal:close") closeModal();

    // ✅ AJUSTAR ALTO DEL IFRAME A CONTENIDO
    if (msg.type === "modal:resize" && typeof msg.height === "number") {
      const max = Math.floor(window.innerHeight * 0.90); // 90vh
      const h = Math.min(Math.max(msg.height, 240), max);
      frame.style.height = `${h}px`;
    }

    if (msg.type === "associate:saved"){
      closeModal();
      window.dispatchEvent(new CustomEvent("associate:saved", { detail: msg.detail || {} }));
    }
  });
}

export function openModal(url){
  if (!host || !frame) initModalHost();

  frame.style.height = `min(85vh, 900px)`; // fallback inicial
  frame.src = url;

  host.classList.remove("d-none");
  host.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

export function closeModal(){
  if (!host || !frame) return;
  host.classList.add("d-none");
  host.setAttribute("aria-hidden", "true");
  frame.src = "about:blank";
  frame.style.height = `min(85vh, 900px)`;
  document.body.style.overflow = "";
}
