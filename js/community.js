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
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { loadPartialOnce } from "/js/ui/loadPartial.js";
import { TX, txf } from "/js/strings/screens/community.js";
import {
  avatarHtml,
  extractYouTubeId,
  normalizePost,
  renderPostCard,
} from "/js/features/community/post_card.js";

const COL = APP_CONFIG.collections;
const COMMUNITY_COL = COL.communityPosts || "community_posts";

const state = {
  user: null,
  role: "viewer",
  posts: [],
  filteredPosts: [],
  type: "",
};

const $ = {
  feed: document.getElementById("communityFeed"),
  emptyState: document.getElementById("communityEmptyState"),
  typeChips: document.getElementById("communityTypeChips"),
  search: document.getElementById("communitySearch"),

  composerAvatar: document.getElementById("composerAvatar"),
  newPostBtn: document.getElementById("newPostBtn"),

  form: null,
  modalTitle: null,
  modalSubtitle: null,
  postId: null,
  title: null,
  type: null,
  summary: null,
  body: null,
  externalUrl: null,
  youtubeUrl: null,
  mediaType: null,
  mediaUrl: null,
  tags: null,
  visibility: null,
  pinned: null,
  saveBtn: null,
};

let postModal = null;
let authBootstrapped = false;

boot();

async function boot() {
  showLoader(TX.cargandoComunidad);

  try {
    const { cfg, redirected } = await guardPage("community");
    if (!redirected) {
      await loadHeader("community", cfg);
    }

    document.getElementById("logoutBtn")?.addEventListener("click", logout);

    await ensureCommunityModalPartial();
    bindEvents();
    
  watchAuth(async (user) => {
    showLoader(TX.cargandoComunidad);

    try {
      state.user = user || null;
      renderComposer();
      await resolveUserRole();
      await loadPosts();
      openFromUrl();
    } catch (err) {
      console.error("Error initializing community:", err);
    } finally {
      releaseUI();
      authBootstrapped = true;
    }
  });
  } catch (err) {
    console.error("Error booting community:", err);
    releaseUI();
  }
}

//init del modal partial
async function ensureCommunityModalPartial() {
  await loadPartialOnce("/partials/community_post_modal.html", "communityModalMount");

  $.form = document.getElementById("communityPostForm");
  $.modalTitle = document.getElementById("communityModalTitle");
  $.modalSubtitle = document.getElementById("communityModalSubtitle");
  $.postId = document.getElementById("communityPostId");
  $.title = document.getElementById("postTitle");
  $.type = document.getElementById("postType");
  $.summary = document.getElementById("postSummary");
  $.body = document.getElementById("postBody");
  $.externalUrl = document.getElementById("postExternalUrl");
  $.youtubeUrl = document.getElementById("postYouTubeUrl");
  $.mediaType = document.getElementById("postMediaType");
  $.mediaUrl = document.getElementById("postMediaUrl");
  $.tags = document.getElementById("postTags");
  $.visibility = document.getElementById("postVisibility");
  $.pinned = document.getElementById("postPinned");
  $.saveBtn = document.getElementById("savePostBtn");

  const modalEl = document.getElementById("communityPostModal");
  if (modalEl && window.bootstrap) {
    postModal = bootstrap.Modal.getOrCreateInstance(modalEl);
  }
}

function releaseUI() {
  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
  hideLoader();
}

function bindEvents() {
  $.search?.addEventListener("input", applyFilters);

  $.typeChips?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-type]");
    if (!chip) return;
    state.type = chip.dataset.type || "";
    $.typeChips.querySelectorAll("[data-type]").forEach((el) => el.classList.toggle("is-active", el === chip));
    applyFilters();
  });

  $.newPostBtn?.addEventListener("click", () => openComposer("opinion"));

  document.querySelectorAll("[data-compose]").forEach((btn) => {
    btn.addEventListener("click", () => openComposer(btn.dataset.compose));
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

function firstName() {
  const name = state.user?.displayName?.trim() || "";
  return name.split(/\s+/)[0] || "";
}

function renderComposer() {
  if ($.composerAvatar) {
    $.composerAvatar.innerHTML = avatarHtml(state.user?.displayName || state.user?.email, state.user?.photoURL);
  }
  if ($.newPostBtn) {
    const name = firstName();
    $.newPostBtn.textContent = name ? txf(TX.composerPlaceholder, { name }) : TX.composerPlaceholderAnon;
  }
}

// kind: opinion | video | photo | document | announcement
function openComposer(kind = "opinion") {
  resetForm();
  if (kind === "photo") {
    $.type.value = "media";
    $.mediaType.value = "image";
  } else if ($.type.querySelector(`option[value="${kind}"]`)) {
    $.type.value = kind;
  }
  syncFormByType();
  postModal?.show();
}

// community.html?new=1 (desde Mi perfil) abre el formulario; ?edit=<id> abre esa publicación.
function openFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (params.get("new")) openComposer("opinion");
  else if (editId) openEditPost(editId);
  if (params.has("new") || editId) {
    history.replaceState({}, "", window.location.pathname);
  }
}

async function resolveUserRole() {
  state.role = "viewer";

  if (!state.user?.uid) return;

  try {
    const userRef = doc(db, "users", state.user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const data = snap.data() || {};
    if (data?.active === false) return;
    state.role = data.role || "viewer";
  } catch (err) {
    console.error("Error resolving role:", err);
  }
}

async function loadPosts() {
  try {
    const q = query(
      collection(db, COMMUNITY_COL),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    state.posts = snap.docs.map((d) => ({
      id: d.id,
      ...normalizePost(d.data() || {}),
    }));

    applyFilters();
  } catch (err) {
    console.error("Error loading community posts:", err);
    state.posts = [];
    applyFilters();
  }
}

function applyFilters() {
  const term = norm($.search?.value || "").replace(/^#/, "");
  const type = state.type;

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

// Feed único: destacados primero, después por fecha.
function renderPosts() {
  const ordered = [
    ...state.filteredPosts.filter((p) => p.pinned),
    ...state.filteredPosts.filter((p) => !p.pinned),
  ];

  $.feed.innerHTML = ordered.map((post) => renderPostCard(post, { manage: canManagePost(post) })).join("");

  const filtering = !!(state.type || ($.search?.value || "").trim());
  $.emptyState.hidden = ordered.length > 0;
  $.emptyState.querySelector("[data-empty-filter]")?.remove();
  if (!ordered.length && filtering) {
    $.emptyState.hidden = false;
    $.emptyState.insertAdjacentHTML("beforeend", `<div class="small mt-2" data-empty-filter>${TX.sinResultados}</div>`);
  }
}

async function onSubmitForm(e) {
  e.preventDefault();

  if (!state.user?.uid) {
    alert(TX.necesitasIniciarSesionPara);
    return;
  }

  const payload = buildFormPayload();

  if (!payload.title && !payload.body && !payload.youtubeUrl && !payload.mediaUrl && !payload.externalUrl) {
    alert(TX.agregaTituloOContenido);
    return;
  }

  $.saveBtn.disabled = true;

  try {
    showLoader(TX.guardandoPost);

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
        authorId: state.user.uid,
        authorName: resolveAuthorName(),
        authorPhotoURL: state.user.photoURL || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    resetForm();
    postModal?.hide();
    await loadPosts();
  } catch (err) {
    console.error("Error saving post:", err);
    alert(TX.noSePudoGuardar);
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
  $.modalTitle.textContent = TX.nuevoPost;
  $.modalSubtitle.textContent = TX.compartiIdeasSesionesGrabadas;
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
  $.modalTitle.textContent = TX.editarPost;
  $.modalSubtitle.textContent = TX.actualizaContenidoLinksVisibilidad;

  syncFormByType();
  postModal?.show();
}

async function handleDeletePost(id) {
  const post = state.posts.find((x) => x.id === id);
  if (!post) return;
  if (!canManagePost(post)) return;

  const ok = window.confirm(txf(TX.eliminar2, { title: post.title }));
  if (!ok) return;

  try {
    showLoader(TX.eliminandoPost);
    await deleteDoc(doc(db, COMMUNITY_COL, id));
    await loadPosts();
  } catch (err) {
    console.error("Error deleting post:", err);
    alert(TX.noSePudoEliminar);
  } finally {
    hideLoader();
  }
}

function resolveAuthorName() {
  const email = state.user?.email || "";
  if (!email) return TX.miembroDelClub;

  const displayName = state.user?.displayName?.trim();
  if (displayName) return displayName;

  return email.split("@")[0];
}

function parseTags(raw) {
  return [...new Set(
    String(raw || "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
