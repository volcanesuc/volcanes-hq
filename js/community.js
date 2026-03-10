import { db } from "/js/auth/firebase.js";
import { watchAuth, logout } from "/js/auth/auth.js";
import { APP_CONFIG } from "/js/config/config.js";
import { guardPage } from "/js/page-guard.js";
import { loadHeader } from "/js/components/header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COMMUNITY_COL = COL.communityPosts || "community_posts";

const state = {
  user: null,
  role: "viewer",
  posts: [],
  filteredPosts: [],
};

const $ = {
  feed: document.getElementById("communityFeed"),
  featuredPosts: document.getElementById("featuredPosts"),
  featuredSection: document.getElementById("featuredSection"),
  emptyState: document.getElementById("communityEmptyState"),
  countLabel: document.getElementById("communityCountLabel"),

  kpiPosts: document.getElementById("kpiPosts"),
  kpiVideos: document.getElementById("kpiVideos"),
  kpiResources: document.getElementById("kpiResources"),

  search: document.getElementById("communitySearch"),
  typeFilter: document.getElementById("communityTypeFilter"),
  pinnedFilter: document.getElementById("communityPinnedFilter"),
  clearFiltersBtn: document.getElementById("clearCommunityFiltersBtn"),

  form: document.getElementById("communityPostForm"),
  modalTitle: document.getElementById("communityModalTitle"),
  postId: document.getElementById("communityPostId"),
  title: document.getElementById("postTitle"),
  type: document.getElementById("postType"),
  summary: document.getElementById("postSummary"),
  body: document.getElementById("postBody"),
  externalUrl: document.getElementById("postExternalUrl"),
  youtubeUrl: document.getElementById("postYouTubeUrl"),
  mediaType: document.getElementById("postMediaType"),
  mediaUrl: document.getElementById("postMediaUrl"),
  tags: document.getElementById("postTags"),
  visibility: document.getElementById("postVisibility"),
  pinned: document.getElementById("postPinned"),
  saveBtn: document.getElementById("savePostBtn"),
  newPostBtn: document.getElementById("newPostBtn"),
};

let postModal = null;

boot();

async function boot() {
  const { cfg, redirected } = await guardPage("community");
  if (!redirected) {
    await loadHeader("community", cfg);
  }

  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  const modalEl = document.getElementById("communityPostModal");
  if (modalEl && window.bootstrap) {
    postModal = new bootstrap.Modal(modalEl);
  }

  bindEvents();

  watchAuth(async (user) => {
    state.user = user || null;
    await resolveUserRole();
    await loadPosts();
    releaseUI();
  });
}

function releaseUI() {
  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
  hideLoader();
}

function bindEvents() {
  $.search?.addEventListener("input", applyFilters);
  $.typeFilter?.addEventListener("change", applyFilters);
  $.pinnedFilter?.addEventListener("change", applyFilters);

  $.clearFiltersBtn?.addEventListener("click", () => {
    $.search.value = "";
    $.typeFilter.value = "";
    $.pinnedFilter.value = "";
    applyFilters();
  });

  $.newPostBtn?.addEventListener("click", () => {
    resetForm();
    $.modalTitle.textContent = "Nuevo post";
  });

  $.type?.addEventListener("change", syncFormByType);

  $.form?.addEventListener("submit", onSubmitForm);

  document.addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-action='edit-post']");
    const deleteBtn = e.target.closest("[data-action='delete-post']");

    if (editBtn) {
      const id = editBtn.dataset.id;
      openEditPost(id);
      return;
    }

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      await handleDeletePost(id);
    }
  });
}

async function resolveUserRole() {
  state.role = "viewer";

  if (!state.user?.uid) return;

  try {
    const roleRef = doc(db, "user_roles", state.user.uid);
    const snap = await getDoc(roleRef);

    if (!snap.exists()) return;

    const data = snap.data() || {};
    if (data?.active === false) return;
    if (data?.clubId && data.clubId !== APP_CONFIG.club.id) return;

    state.role = data.role || "viewer";
  } catch (err) {
    console.error("Error resolving role:", err);
  }
}

async function loadPosts() {
  showLoader("Cargando comunidad...");

  try {
    const q = query(
      collection(db, COMMUNITY_COL),
      where("clubId", "==", APP_CONFIG.club.id),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    state.posts = snap.docs.map((d) => ({
      id: d.id,
      ...normalizePost(d.data() || {}),
    }));

    applyFilters();
    renderKPIs();
  } catch (err) {
    console.error("Error loading community posts:", err);
    state.posts = [];
    applyFilters();
    renderKPIs();
  } finally {
    hideLoader();
  }
}

function normalizePost(post) {
  return {
    clubId: post.clubId || APP_CONFIG.club.id,
    title: post.title || "Sin título",
    summary: post.summary || "",
    body: post.body || "",
    type: post.type || "opinion",
    externalUrl: post.externalUrl || "",
    youtubeUrl: post.youtubeUrl || "",
    youtubeId: post.youtubeId || extractYouTubeId(post.youtubeUrl || ""),
    mediaType: post.mediaType || "",
    mediaUrl: post.mediaUrl || "",
    authorId: post.authorId || "",
    authorName: post.authorName || "Miembro del club",
    visibility: post.visibility || "club",
    pinned: !!post.pinned,
    tags: Array.isArray(post.tags) ? post.tags : [],
    createdAt: post.createdAt || null,
    updatedAt: post.updatedAt || null,
  };
}

function applyFilters() {
  const term = norm($.search?.value || "");
  const type = $.typeFilter?.value || "";
  const pinnedFilter = $.pinnedFilter?.value || "";

  state.filteredPosts = state.posts.filter((post) => {
    const haystack = norm([
      post.title,
      post.summary,
      post.body,
      post.authorName,
      (post.tags || []).join(" "),
      post.type,
    ].join(" "));

    if (term && !haystack.includes(term)) return false;
    if (type && post.type !== type) return false;
    if (pinnedFilter === "pinned" && !post.pinned) return false;
    if (pinnedFilter === "not-pinned" && post.pinned) return false;

    if (post.visibility === "staff" && !canSeeStaffContent()) return false;

    return true;
  });

  renderPosts();
}

function canSeeStaffContent() {
  return ["admin", "coach", "staff"].includes(state.role);
}

function canManagePost(post) {
  if (!state.user?.uid) return false;
  if (["admin", "coach", "staff"].includes(state.role)) return true;
  return post.authorId === state.user.uid;
}

function renderPosts() {
  const featured = state.filteredPosts.filter((p) => p.pinned);
  const normal = state.filteredPosts.filter((p) => !p.pinned);

  $.featuredPosts.innerHTML = "";
  $.feed.innerHTML = "";

  $.featuredSection.hidden = featured.length === 0;
  $.emptyState.hidden = state.filteredPosts.length > 0;

  $.countLabel.textContent = `${state.filteredPosts.length} post${state.filteredPosts.length === 1 ? "" : "s"}`;

  for (const post of featured) {
    $.featuredPosts.insertAdjacentHTML("beforeend", renderPostCard(post));
  }

  for (const post of normal) {
    $.feed.insertAdjacentHTML("beforeend", renderPostCard(post));
  }
}

function renderKPIs() {
  const total = state.posts.length;
  const videos = state.posts.filter((p) => p.type === "video" || p.type === "session").length;
  const resources = state.posts.filter((p) => ["media", "document"].includes(p.type)).length;

  $.kpiPosts.textContent = String(total);
  $.kpiVideos.textContent = String(videos);
  $.kpiResources.textContent = String(resources);
}

function renderPostCard(post) {
  const typeMeta = getTypeMeta(post.type);
  const created = formatDate(post.createdAt);
  const youtubeId = post.youtubeId || extractYouTubeId(post.youtubeUrl);
  const manage = canManagePost(post);

  const tagsHtml = (post.tags || []).length
    ? `
      <div class="community-tags">
        ${post.tags.map((tag) => `<span class="community-tag">#${escapeHtml(tag)}</span>`).join("")}
      </div>
    `
    : "";

  const bodyHtml = post.body
    ? `<div class="community-card__text">${escapeHtml(post.body)}</div>`
    : "";

  const summaryHtml = post.summary
    ? `<div class="community-card__summary">${escapeHtml(post.summary)}</div>`
    : "";

  const youtubeHtml = youtubeId
    ? `
      <div class="community-embed ratio ratio-16x9">
        <iframe
          src="https://www.youtube.com/embed/${youtubeId}"
          title="${escapeHtml(post.title)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        ></iframe>
      </div>
    `
    : "";

  let mediaHtml = "";

  if (post.mediaType === "image" && post.mediaUrl) {
    mediaHtml = `
      <div class="community-media-preview">
        <img
          src="${escapeAttr(post.mediaUrl)}"
          alt="${escapeAttr(post.title)}"
          class="community-media-image"
          loading="lazy"
        />
      </div>
    `;
  } else if (post.mediaUrl) {
    mediaHtml = `
      <div class="community-link-box">
        <i class="bi bi-link-45deg me-1"></i>
        <a href="${escapeAttr(post.mediaUrl)}" target="_blank" rel="noopener noreferrer">
          Abrir recurso
        </a>
      </div>
    `;
  }

  const externalHtml = post.externalUrl
    ? `
      <div class="community-link-box">
        <i class="bi bi-box-arrow-up-right me-1"></i>
        <a href="${escapeAttr(post.externalUrl)}" target="_blank" rel="noopener noreferrer">
          Ver link relacionado
        </a>
      </div>
    `
    : "";

  return `
    <article class="community-card ${post.pinned ? "community-card--pinned" : ""}">
      <div class="community-card__body">
        <div class="community-card__top">
          <div class="community-card__meta">
            <div class="community-card__badges">
              <span class="community-type-badge">
                <i class="bi ${typeMeta.icon}"></i>
                ${typeMeta.label}
              </span>
              ${post.pinned ? `
                <span class="community-pin-badge">
                  <i class="bi bi-pin-angle-fill"></i>
                  Destacado
                </span>
              ` : ""}
            </div>

            <h3 class="community-card__title">${escapeHtml(post.title)}</h3>
            ${summaryHtml}

            <div class="community-card__author">
              por <strong>${escapeHtml(post.authorName)}</strong>
              ${created ? `· ${created}` : ""}
            </div>
          </div>

          <div class="community-card__actions">
            ${manage ? `
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                data-action="edit-post"
                data-id="${post.id}"
              >
                <i class="bi bi-pencil"></i> Editar
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-action="delete-post"
                data-id="${post.id}"
              >
                <i class="bi bi-trash"></i> Eliminar
              </button>
            ` : ""}
          </div>
        </div>

        <div class="community-card__content">
          ${bodyHtml}
          ${youtubeHtml}
          ${mediaHtml}
          ${externalHtml}
          ${tagsHtml}
        </div>

        <div class="community-footer">
          <div class="community-footer__left">
            <span><i class="bi bi-person-circle me-1"></i>${escapeHtml(post.authorName)}</span>
            <span><i class="bi bi-eye me-1"></i>${post.visibility === "staff" ? "Solo staff" : "Club"}</span>
          </div>

          <div class="community-footer__right">
            ${post.youtubeUrl ? `
              <a
                class="btn btn-sm btn-outline-primary"
                href="${escapeAttr(post.youtubeUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class="bi bi-youtube"></i> YouTube
              </a>
            ` : ""}

            ${post.externalUrl ? `
              <a
                class="btn btn-sm btn-outline-primary"
                href="${escapeAttr(post.externalUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class="bi bi-box-arrow-up-right"></i> Abrir
              </a>
            ` : ""}
          </div>
        </div>
      </div>
    </article>
  `;
}

async function onSubmitForm(e) {
  e.preventDefault();

  if (!state.user?.uid) {
    alert("Necesitás iniciar sesión para publicar.");
    return;
  }

  const payload = buildFormPayload();

  if (!payload.title) {
    alert("El título es obligatorio.");
    return;
  }

  if (!payload.body && !payload.youtubeUrl && !payload.mediaUrl && !payload.externalUrl) {
    alert("Agregá contenido, un link de YouTube, media o un link externo.");
    return;
  }

  $.saveBtn.disabled = true;

  try {
    showLoader("Guardando post...");

    const editId = $.postId.value?.trim();

    if (editId) {
      const ref = doc(db, COMMUNITY_COL, editId);
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, COMMUNITY_COL), {
        ...payload,
        clubId: APP_CONFIG.club.id,
        authorId: state.user.uid,
        authorName: resolveAuthorName(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    resetForm();
    postModal?.hide();
    await loadPosts();
  } catch (err) {
    console.error("Error saving post:", err);
    alert("No se pudo guardar el post.");
  } finally {
    $.saveBtn.disabled = false;
    hideLoader();
  }
}

function buildFormPayload() {
  const youtubeUrl = $.youtubeUrl.value.trim();
  const mediaUrl = $.mediaUrl.value.trim();
  const externalUrl = $.externalUrl.value.trim();

  return {
    title: $.title.value.trim(),
    type: $.type.value,
    summary: $.summary.value.trim(),
    body: $.body.value.trim(),
    externalUrl,
    youtubeUrl,
    youtubeId: extractYouTubeId(youtubeUrl),
    mediaType: $.mediaType.value,
    mediaUrl,
    visibility: $.visibility.value || "club",
    pinned: !!$.pinned.checked,
    tags: parseTags($.tags.value),
  };
}

function resetForm() {
  $.form.reset();
  $.postId.value = "";
  $.modalTitle.textContent = "Nuevo post";
  $.type.value = "opinion";
  $.visibility.value = "club";
  syncFormByType();
}

function syncFormByType() {
  const type = $.type.value;

  const wantsVideo = type === "video" || type === "session";
  const wantsMedia = type === "media" || type === "document";

  $.youtubeUrl.closest(".col-12")?.classList.toggle("opacity-75", !wantsVideo);
  $.mediaType.closest(".col-12")?.classList.toggle("opacity-75", !wantsMedia);
  $.mediaUrl.closest(".col-12")?.classList.toggle("opacity-75", !wantsMedia);
}

async function openEditPost(id) {
  const post = state.posts.find((x) => x.id === id);
  if (!post) return;
  if (!canManagePost(post)) return;

  $.postId.value = post.id;
  $.title.value = post.title || "";
  $.type.value = post.type || "opinion";
  $.summary.value = post.summary || "";
  $.body.value = post.body || "";
  $.externalUrl.value = post.externalUrl || "";
  $.youtubeUrl.value = post.youtubeUrl || "";
  $.mediaType.value = post.mediaType || "";
  $.mediaUrl.value = post.mediaUrl || "";
  $.tags.value = (post.tags || []).join(", ");
  $.visibility.value = post.visibility || "club";
  $.pinned.checked = !!post.pinned;
  $.modalTitle.textContent = "Editar post";

  syncFormByType();
  postModal?.show();
}

async function handleDeletePost(id) {
  const post = state.posts.find((x) => x.id === id);
  if (!post) return;
  if (!canManagePost(post)) return;

  const ok = window.confirm(`¿Eliminar "${post.title}"?`);
  if (!ok) return;

  try {
    showLoader("Eliminando post...");
    await deleteDoc(doc(db, COMMUNITY_COL, id));
    await loadPosts();
  } catch (err) {
    console.error("Error deleting post:", err);
    alert("No se pudo eliminar el post.");
  } finally {
    hideLoader();
  }
}

function resolveAuthorName() {
  const email = state.user?.email || "";
  if (!email) return "Miembro del club";

  const displayName = state.user?.displayName?.trim();
  if (displayName) return displayName;

  return email.split("@")[0];
}

function getTypeMeta(type) {
  switch (type) {
    case "video":
      return { label: "Video", icon: "bi-youtube" };
    case "session":
      return { label: "Sesión", icon: "bi-camera-video-fill" };
    case "media":
      return { label: "Media", icon: "bi-image" };
    case "document":
      return { label: "Documento", icon: "bi-file-earmark-text" };
    case "announcement":
      return { label: "Anuncio", icon: "bi-megaphone" };
    case "opinion":
    default:
      return { label: "Opinión", icon: "bi-chat-left-text" };
  }
}

function extractYouTubeId(url) {
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

function parseTags(raw) {
  return [...new Set(
    String(raw || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function formatDate(value) {
  const d = firestoreDateToDate(value);
  if (!d) return "";

  return new Intl.DateTimeFormat("es-CR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

function firestoreDateToDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  return null;
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}