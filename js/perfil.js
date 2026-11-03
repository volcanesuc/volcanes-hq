// js/perfil.js
// Mi perfil: ver y editar mis datos (users/{uid}.profile) y ver mis publicaciones de Comunidad.
import { auth, db } from "./auth/firebase.js";
import { APP_CONFIG } from "./config/config.js";
import { guardPage } from "./page-guard.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader } from "./ui/loader.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  avatarHtml,
  escapeHtml,
  firestoreDateToDate,
  normalizePost,
  renderPostCard,
} from "/js/features/community/post_card.js";
import { TX, txf } from "/js/strings/screens/perfil.js";

const COL = APP_CONFIG.collections;
const COMMUNITY_COL = COL.communityPosts || "community_posts";

const $ = (id) => document.getElementById(id);

const state = {
  uid: null,
  user: null, // users/{uid}
  posts: [],
};

/* =========================
   Encabezado
========================= */
function fullName(u) {
  const p = u?.profile || {};
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return name || u?.displayName || auth.currentUser?.displayName || u?.email || "—";
}

function roleLabel(roleId) {
  const role = (APP_CONFIG.userRoles || []).find((r) => r.id === roleId);
  return role?.label || roleId || "";
}

function statusPills(u) {
  const pills = [];
  const role = String(u?.role || "viewer").toLowerCase();
  if (role && role !== "viewer") pills.push(`<span class="pf-pill pf-pill--role"><i class="bi bi-shield-check"></i>${escapeHtml(roleLabel(role))}</span>`);

  const player = String(u?.playerStatus || (u?.isPlayerActive ? "active" : "")).toLowerCase();
  if (player === "active") pills.push(`<span class="pf-pill pf-pill--ok"><i class="bi bi-person-check"></i>${TX.jugadorActivo}</span>`);
  else if (player === "pending") pills.push(`<span class="pf-pill pf-pill--wait">${TX.jugadorPendiente}</span>`);

  const assoc = String(u?.associationStatus || "").toLowerCase();
  const label = u?.currentMembership?.label;
  if (assoc === "associated_active" || assoc === "active") {
    pills.push(`<span class="pf-pill pf-pill--ok"><i class="bi bi-award"></i>${escapeHtml(label || TX.asociadoActivo)}</span>`);
  } else if (assoc === "payment_validation_pending" || assoc === "pending") {
    pills.push(`<span class="pf-pill pf-pill--wait">${TX.asociacionPendiente}</span>`);
  } else if (assoc === "associated_rejected" || assoc === "rejected") {
    pills.push(`<span class="pf-pill pf-pill--bad">${TX.asociacionRechazada}</span>`);
  }
  return pills.join("");
}

function renderHero() {
  const u = state.user || {};
  const name = fullName(u);
  const photo = auth.currentUser?.photoURL || u.photoURL || "";
  $("pfAvatar").innerHTML = avatarHtml(name, photo, 96);
  $("pfComposerAvatar").innerHTML = avatarHtml(name, photo);
  $("pfName").textContent = name;
  $("pfEmail").textContent = u.email || auth.currentUser?.email || "";
  $("pfChips").innerHTML = statusPills(u);
}

/* =========================
   Mi información
========================= */
function fillForm() {
  const u = state.user || {};
  const p = u.profile || {};
  const em = p.emergencyContact || u.emergencyContact || {};
  const res = p.residence || {};

  $("pfFirstName").value = p.firstName || "";
  $("pfLastName").value = p.lastName || "";
  $("pfEmailInput").value = u.email || auth.currentUser?.email || "";
  $("pfIdNumber").value = [p.idType, p.idNumber].filter(Boolean).join(" · ") || "—";
  $("pfPhone").value = p.phone || u.phone || "";
  $("pfProvince").value = typeof res === "object" ? res.province || "" : String(res || "");
  $("pfCanton").value = typeof res === "object" ? res.canton || "" : "";
  $("pfEmName").value = typeof em === "object" ? em.name || "" : String(em || "");
  $("pfEmRelation").value = typeof em === "object" ? em.relation || "" : "";
  $("pfEmPhone").value = typeof em === "object" ? em.phone || "" : "";
  $("pfProfession").value = p.profession || "";
  $("pfSkills").value = p.skills || "";
}

function setAlert(msg, type = "info") {
  const el = $("pfAlert");
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.toggle("d-none", !msg);
}

async function onSave(e) {
  e.preventDefault();
  const v = (id) => $(id).value.trim();

  if (!v("pfFirstName") || !v("pfLastName")) {
    setAlert(TX.faltaNombre, "warning");
    return;
  }

  const emergencyContact = {
    name: v("pfEmName") || null,
    relation: v("pfEmRelation") || null,
    phone: v("pfEmPhone") || null,
  };

  // Solo campos que la persona puede cambiar; identificación, rol y estados no se tocan.
  const patch = {
    profile: {
      firstName: v("pfFirstName"),
      lastName: v("pfLastName"),
      phone: v("pfPhone") || null,
      residence: { province: v("pfProvince") || null, canton: v("pfCanton") || null },
      emergencyContact,
      profession: v("pfProfession") || null,
      skills: v("pfSkills") || null,
    },
    phone: v("pfPhone") || null,
    emergencyContact,
    updatedAt: serverTimestamp(),
  };

  const btn = $("pfSaveBtn");
  btn.disabled = true;
  showLoader(TX.guardando);
  try {
    await setDoc(doc(db, COL.users, state.uid), patch, { merge: true });
    state.user = {
      ...state.user,
      ...patch,
      profile: { ...(state.user?.profile || {}), ...patch.profile },
    };
    renderHero();
    setAlert(TX.guardado, "success");
  } catch (err) {
    console.error("[perfil] save", err);
    setAlert(txf(TX.noSePudoGuardar, { err: err?.message || String(err) }), "danger");
  } finally {
    btn.disabled = false;
    hideLoader();
  }
}

/* =========================
   Mis publicaciones
========================= */
async function loadMyPosts() {
  try {
    // Sin orderBy para no requerir índice compuesto; se ordena acá.
    const snap = await getDocs(query(collection(db, COMMUNITY_COL), where("authorId", "==", state.uid)));
    state.posts = snap.docs
      .map((d) => ({ id: d.id, ...normalizePost(d.data() || {}) }))
      .sort((a, b) => (firestoreDateToDate(b.createdAt)?.getTime() || 0) - (firestoreDateToDate(a.createdAt)?.getTime() || 0));
  } catch (err) {
    console.error("[perfil] posts", err);
    state.posts = [];
    $("pfPosts").innerHTML = `<div class="alert alert-warning">${TX.noSePudieronCargarPosts}</div>`;
    return;
  }
  renderPosts();
}

function renderPosts() {
  // Las publicaciones viejas pueden no tener foto guardada: usamos la de la cuenta.
  const photo = auth.currentUser?.photoURL || "";
  $("pfPosts").innerHTML = state.posts
    .map((p) => renderPostCard({ ...p, authorPhotoURL: p.authorPhotoURL || photo }, { manage: true }))
    .join("");
  $("pfPostsEmpty").hidden = state.posts.length > 0;
  $("pfPostsCount").textContent = String(state.posts.length);
}

async function onPostAction(e) {
  const edit = e.target.closest("[data-action='edit-post']");
  const del = e.target.closest("[data-action='delete-post']");
  if (edit) {
    window.location.href = `/community.html?edit=${encodeURIComponent(edit.dataset.id)}`;
    return;
  }
  if (!del || !window.confirm(TX.eliminarPost)) return;
  showLoader();
  try {
    await deleteDoc(doc(db, COMMUNITY_COL, del.dataset.id));
    state.posts = state.posts.filter((p) => p.id !== del.dataset.id);
    renderPosts();
  } catch (err) {
    console.error("[perfil] delete", err);
    alert(TX.noSePudoEliminar);
  } finally {
    hideLoader();
  }
}

/* =========================
   Tabs (#publicaciones / #informacion)
========================= */
function showTab(tab) {
  const isInfo = tab === "info";
  $("pfPostsPanel").hidden = isInfo;
  $("pfInfoPanel").hidden = !isInfo;
  document.querySelectorAll("[data-pf-tab]").forEach((a) => a.classList.toggle("is-active", a.dataset.pfTab === tab));
}

function tabFromHash() {
  return window.location.hash === "#informacion" ? "info" : "posts";
}

/* =========================
   Init
========================= */
showLoader(TX.cargandoPerfil);

const { cfg, redirected } = await guardPage("profile");

if (redirected) {
  hideLoader();
} else {
  try {
    await loadHeader("profile", cfg);
    state.uid = auth.currentUser?.uid || null;
    state.user = cfg?.userData || {};

    renderHero();
    fillForm();
    showTab(tabFromHash());

    $("pfTabs").addEventListener("click", (e) => {
      const a = e.target.closest("[data-pf-tab]");
      if (!a) return;
      e.preventDefault();
      history.replaceState({}, "", a.getAttribute("href"));
      showTab(a.dataset.pfTab);
    });
    window.addEventListener("hashchange", () => showTab(tabFromHash()));

    $("pfForm").addEventListener("submit", onSave);
    $("pfForm").addEventListener("reset", (e) => {
      e.preventDefault();
      fillForm();
      setAlert("");
    });
    $("pfPosts").addEventListener("click", onPostAction);

    await loadMyPosts();
  } finally {
    hideLoader();
  }
}
