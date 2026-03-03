// js/ui/loadPartial.js
export async function loadPartialOnce(url, mountId = "modalMount") {
  const mount = document.getElementById(mountId);
  if (!mount) throw new Error(`No existe el mount #${mountId} en el HTML`);

  // ya está cargado?
  const already = mount.querySelector(`[data-partial-url="${cssEscape(url)}"]`);
  if (already) return already;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);

  const html = await res.text();

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();

  const el = wrapper.firstElementChild;
  if (!el) throw new Error(`El partial ${url} vino vacío`);

  // marcamos el root del partial con una key segura
  el.setAttribute("data-partial-url", url);

  mount.appendChild(el);
  return el;
}

// helper para que funcione en selector aunque tenga puntos o slashes
function cssEscape(str) {
  // CSS.escape no siempre existe en navegadores viejos, fallback simple
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(str);
  return String(str).replace(/"/g, '\\"');
}
