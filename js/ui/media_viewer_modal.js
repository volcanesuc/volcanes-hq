// /js/ui/media_viewer_modal.js

let modalReady = false;

export function openMediaViewerModal(rawUrl, options = {}) {
  ensureMediaViewerModal();

  const cleanUrl = safeUrl(rawUrl);
  if (!cleanUrl) {
    window.open(rawUrl, "_blank", "noopener");
    return;
  }

  const title = options?.title || "Media";

  const titleEl = document.getElementById("mediaViewerModalTitle");
  const box = document.getElementById("mediaViewerContainer");
  const openNewTab = document.getElementById("mediaViewerOpenNewTab");
  const modalEl = document.getElementById("mediaViewerModal");

  if (!box || !modalEl) return;

  if (titleEl) titleEl.textContent = title;
  if (openNewTab) openNewTab.href = cleanUrl;

  const mediaType = detectMediaType(cleanUrl);
  box.innerHTML = renderMediaContent(mediaType, cleanUrl, title);

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function ensureMediaViewerModal() {
  if (modalReady && document.getElementById("mediaViewerModal")) return;

  const existing = document.getElementById("mediaViewerModal");
  if (existing) {
    modalReady = true;
    return;
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal fade" id="mediaViewerModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="mediaViewerModalTitle">Media</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>

          <div class="modal-body">
            <div id="mediaViewerContainer"></div>
          </div>

          <div class="modal-footer justify-content-between">
            <a
              id="mediaViewerOpenNewTab"
              class="btn btn-outline-secondary"
              href="#"
              target="_blank"
              rel="noopener"
            >
              Abrir en pestaña nueva
            </a>
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap.firstElementChild);

  const modalEl = document.getElementById("mediaViewerModal");
  modalEl?.addEventListener("hidden.bs.modal", () => {
    const box = document.getElementById("mediaViewerContainer");
    if (box) box.innerHTML = "";
  });

  modalReady = true;
}

function detectMediaType(url) {
  const lower = url.toLowerCase();

  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|#|$)/i.test(lower)) {
    return "image";
  }

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (
      host.includes("gstatic.com") ||
      host.includes("googleusercontent.com") ||
      host.includes("imgur.com") ||
      host.includes("cloudinary.com")
    ) {
      return "image";
    }

    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host === "vimeo.com" ||
      host === "player.vimeo.com"
    ) {
      return "video";
    }
  } catch {}

  return "unknown";
}

function renderMediaContent(type, rawUrl, title = "Media") {
  if (type === "image") {
    return `
      <div class="text-center">
        <img
          src="${escapeHtml(rawUrl)}"
          alt="${escapeHtml(title)}"
          class="img-fluid rounded"
          style="max-height:80vh; width:auto;"
        />
      </div>
    `;
  }

  if (type === "video") {
    const embedUrl = toEmbeddableVideoUrl(rawUrl);

    if (embedUrl) {
      return `
        <div style="position:relative;width:100%;height:80vh;background:#000;border-radius:.5rem;overflow:hidden;">
          <iframe
            src="${escapeHtml(embedUrl)}"
            title="${escapeHtml(title)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            referrerpolicy="strict-origin-when-cross-origin"
            style="position:absolute;inset:0;width:100%;height:100%;border:0;"
          ></iframe>
        </div>
      `;
    }
  }

  return `
    <div>
      <div style="position:relative;width:100%;height:80vh;background:#f8f9fa;border-radius:.5rem;overflow:hidden;">
        <iframe
          src="${escapeHtml(rawUrl)}"
          title="${escapeHtml(title)}"
          style="position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;"
          referrerpolicy="strict-origin-when-cross-origin"
        ></iframe>
      </div>
      <div class="text-muted small mt-2">
        Si no carga aquí, abrilo en pestaña nueva.
      </div>
    </div>
  `;
}

function toEmbeddableVideoUrl(url) {
  const clean = safeUrl(url);
  if (!clean) return "";

  try {
    const u = new URL(clean);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${encodeURIComponent(v)}`;

      if (u.pathname.startsWith("/embed/")) return clean;

      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      }
    }

    if (host === "youtu.be") {
      const id = u.pathname.replace("/", "").trim();
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }

    if (host === "vimeo.com") {
      const id = u.pathname.replace(/\//g, "").trim();
      if (id) return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    }

    if (host === "player.vimeo.com" && u.pathname.startsWith("/video/")) {
      return clean;
    }

    if (host === "youtube-nocookie.com") {
      return clean;
    }

    return "";
  } catch {
    return "";
  }
}

function safeUrl(url) {
  const u = (url || "").toString().trim();
  if (!u) return "";

  if (!/^https?:\/\//i.test(u)) {
    try {
      return new URL(`https://${u}`).toString();
    } catch {
      return "";
    }
  }

  try {
    return new URL(u).toString();
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}