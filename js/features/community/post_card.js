// /js/features/community/post_card.js
// Tarjeta de publicación estilo feed (Comunidad y Mi perfil).
import { Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { TX } from "/js/strings/screens/community.js";

export function normalizePost(post) {
  return {
    title: post.title || "",
    summary: post.summary || "",
    body: post.body || "",
    type: post.type || "opinion",
    externalUrl: post.externalUrl || "",
    youtubeUrl: post.youtubeUrl || "",
    youtubeId: post.youtubeId || extractYouTubeId(post.youtubeUrl || ""),
    mediaType: post.mediaType || "",
    mediaUrl: post.mediaUrl || "",
    authorId: post.authorId || "",
    authorName: post.authorName || TX.miembroDelClub,
    authorPhotoURL: post.authorPhotoURL || "",
    visibility: post.visibility || "club",
    pinned: !!post.pinned,
    tags: Array.isArray(post.tags) ? post.tags : [],
    createdAt: post.createdAt || null,
    updatedAt: post.updatedAt || null,
  };
}

export function getTypeMeta(type) {
  switch (type) {
    case "video":
      return { label: TX.video, icon: "bi-youtube" };
    case "session":
      return { label: TX.sesion, icon: "bi-camera-video-fill" };
    case "media":
      return { label: TX.media, icon: "bi-image" };
    case "document":
      return { label: TX.documento, icon: "bi-file-earmark-text" };
    case "announcement":
      return { label: TX.anuncio, icon: "bi-megaphone" };
    case "opinion":
    default:
      return { label: TX.opinion, icon: "bi-chat-left-text" };
  }
}

export function avatarHtml(name, photoURL, size = 40) {
  if (photoURL) {
    return `<img class="feed-avatar" src="${escapeAttr(photoURL)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer" loading="lazy" />`;
  }
  const initial = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  return `<span class="feed-avatar feed-avatar--empty" style="width:${size}px;height:${size}px">${escapeHtml(initial)}</span>`;
}

// manage: muestra el menú Editar / Eliminar (los botones usan data-action, el feed los escucha).
export function renderPostCard(post, { manage = false } = {}) {
  const typeMeta = getTypeMeta(post.type);
  const when = timeAgo(post.createdAt);
  const youtubeId = post.youtubeId || extractYouTubeId(post.youtubeUrl);

  const youtubeHtml = youtubeId
    ? `
      <div class="feed-post__media ratio ratio-16x9">
        <iframe
          src="https://www.youtube.com/embed/${escapeAttr(youtubeId)}"
          title="${escapeAttr(post.title)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          loading="lazy"
          allowfullscreen
        ></iframe>
      </div>`
    : "";

  let mediaHtml = "";
  if (post.mediaType === "image" && post.mediaUrl) {
    mediaHtml = `
      <div class="feed-post__media">
        <img src="${escapeAttr(post.mediaUrl)}" alt="${escapeAttr(post.title)}" loading="lazy" />
      </div>`;
  } else if (post.mediaUrl) {
    mediaHtml = linkBox(post.mediaUrl, "bi-paperclip", TX.abrirRecurso);
  }

  const externalHtml = post.externalUrl ? linkBox(post.externalUrl, "bi-box-arrow-up-right", TX.verLinkRelacionado) : "";

  const tagsHtml = post.tags.length
    ? `<div class="feed-post__tags">${post.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";

  const menuHtml = manage
    ? `
      <div class="dropdown">
        <button class="feed-post__menu" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="${escapeAttr(TX.opciones)}">
          <i class="bi bi-three-dots"></i>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <li><button class="dropdown-item" type="button" data-action="edit-post" data-id="${escapeAttr(post.id)}"><i class="bi bi-pencil me-2"></i>${TX.editar}</button></li>
          <li><button class="dropdown-item text-danger" type="button" data-action="delete-post" data-id="${escapeAttr(post.id)}"><i class="bi bi-trash me-2"></i>${TX.eliminar}</button></li>
        </ul>
      </div>`
    : "";

  return `
    <article class="feed-post ${post.pinned ? "feed-post--pinned" : ""}" data-post-id="${escapeAttr(post.id)}">
      ${post.pinned ? `<div class="feed-post__pin"><i class="bi bi-pin-angle-fill"></i> ${TX.destacado}</div>` : ""}
      <header class="feed-post__head">
        ${avatarHtml(post.authorName, post.authorPhotoURL)}
        <div class="feed-post__who">
          <div class="feed-post__author">${escapeHtml(post.authorName)}</div>
          <div class="feed-post__meta">
            ${when ? `<span title="${escapeAttr(formatDate(post.createdAt))}">${escapeHtml(when)}</span> · ` : ""}
            <i class="bi ${post.visibility === "staff" ? "bi-lock-fill" : "bi-people-fill"}" title="${escapeAttr(post.visibility === "staff" ? TX.soloStaff : TX.club)}"></i>
            <span class="feed-post__type"><i class="bi ${typeMeta.icon}"></i> ${escapeHtml(typeMeta.label)}</span>
          </div>
        </div>
        ${menuHtml}
      </header>

      <div class="feed-post__body">
        ${post.title ? `<h3 class="feed-post__title">${escapeHtml(post.title)}</h3>` : ""}
        ${post.summary ? `<p class="feed-post__summary">${escapeHtml(post.summary)}</p>` : ""}
        ${post.body ? `<div class="feed-post__text">${escapeHtml(post.body)}</div>` : ""}
      </div>

      ${youtubeHtml}
      ${mediaHtml}
      ${externalHtml || tagsHtml ? `<div class="feed-post__extra">${externalHtml}${tagsHtml}</div>` : ""}
    </article>
  `;
}

function linkBox(url, icon, label) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  return `
    <a class="feed-post__link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
      <i class="bi ${icon}"></i>
      <span><strong>${escapeHtml(label)}</strong>${host ? `<small>${escapeHtml(host)}</small>` : ""}</span>
    </a>`;
}

export function extractYouTubeId(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").trim();
    }

    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) {
        return u.searchParams.get("v").trim();
      }

      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) {
        return parts[embedIdx + 1].trim();
      }

      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) {
        return parts[shortsIdx + 1].trim();
      }
    }
  } catch (_) {
    return "";
  }

  return "";
}

export function firestoreDateToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  return null;
}

export function formatDate(value) {
  const d = firestoreDateToDate(value);
  if (!d) return "";

  return new Intl.DateTimeFormat("es-CR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

// "hace 5 min", "hace 3 h", "hace 2 días"; más de una semana: la fecha.
export function timeAgo(value) {
  const d = firestoreDateToDate(value);
  if (!d) return "";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return TX.ahora;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (sec < 3600) return rtf.format(-Math.round(sec / 60), "minute");
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), "hour");
  if (sec < 7 * 86400) return rtf.format(-Math.round(sec / 86400), "day");
  return formatDate(value);
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttr(str) {
  return escapeHtml(str);
}
