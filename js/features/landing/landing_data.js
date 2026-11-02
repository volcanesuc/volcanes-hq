// /js/features/landing/landing_data.js
// Datos del landing: docs de club_config (con cache en localStorage) y galería de fotos.
//
// club_config/landing = {
//   order: ["hero", "calendar", ...],
//   sections: {
//     calendar: { enabled, title, subtitle },
//     join:     { enabled, title, subtitle, steps: [{ title, text }], registerLabel, pickupsLabel },
//     stats:    { enabled, title, items: [{ value, label }] },
//     sponsors: { enabled, title, subtitle, items: [{ name, logoUrl, url }] },
//     gallery:  { enabled, title, subtitle, allowUploads },
//   },
//   seo: { title, description, imageUrl },
// }
import { db, storage, auth } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const COL_CLUB_CONFIG = APP_CONFIG.collections?.club_config || "club_config";
const COL_PHOTOS = APP_CONFIG.collections?.landingPhotos || "landing_photos";
const CLUB_ID = APP_CONFIG.club?.id || "default";
const CACHE_KEY = `club_landing:${APP_CONFIG.firebase?.projectId || "app"}`;

// Docs que usa el landing (los viejos se editan en Admin > Landing settings).
const DOC_IDS = ["index_settings", "hero", "social_links", "featured_activity", "events", "trainings", "honors", "uniforms", "landing"];

export const SECTION_IDS = ["hero", "calendar", "trainings", "join", "featured", "stats", "events", "honors", "gallery", "uniforms", "sponsors"];

// Secciones viejas: su switch vive en club_config/index_settings
export const LEGACY_TOGGLES = {
  featured: "show_featured_activity",
  events: "show_events",
  trainings: "show_trainings",
  honors: "show_honors",
  uniforms: "show_uniforms",
};

export const MAX_PHOTO_MB = 8;

/* =========================
   Config del landing
========================= */
function clean(data) {
  if (!data || typeof data !== "object") return {};
  const out = JSON.parse(JSON.stringify(data, (k, v) => (v && typeof v === "object" && typeof v.toMillis === "function" ? v.toMillis() : v)));
  delete out.updatedAt;
  return out;
}

export function readLandingCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return raw && raw.docs ? raw : null;
  } catch {
    return null;
  }
}

function writeLandingCache(value) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* sin storage */
  }
}

// { docs: { hero: {...}, ... }, photos: [...] }
export async function fetchLandingData() {
  const snaps = await Promise.all(
    DOC_IDS.map((id) => getDoc(doc(db, COL_CLUB_CONFIG, id)).catch(() => null))
  );
  const docs = {};
  DOC_IDS.forEach((id, i) => {
    docs[id] = snaps[i]?.exists?.() ? clean(snaps[i].data()) : {};
  });
  const photos = await listApprovedPhotos().catch(() => []);
  const data = { docs, photos };
  writeLandingCache(data);
  return data;
}

export function sectionOrder(landing = {}) {
  const saved = Array.isArray(landing.order) ? landing.order.filter((id) => SECTION_IDS.includes(id)) : [];
  return [...saved, ...SECTION_IDS.filter((id) => !saved.includes(id))];
}

export async function loadLandingConfig() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "landing"));
  return snap.exists() ? clean(snap.data()) : {};
}

export async function saveLandingConfig(patch) {
  await setDoc(doc(db, COL_CLUB_CONFIG, "landing"), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  localStorage.removeItem(CACHE_KEY);
}

export async function saveIndexToggles(patch) {
  await setDoc(doc(db, COL_CLUB_CONFIG, "index_settings"), patch, { merge: true });
  localStorage.removeItem(CACHE_KEY);
}

export async function loadIndexSettings() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "index_settings"));
  return snap.exists() ? snap.data() : {};
}

// Sube un archivo del club (logos, imagen para compartir) a clubs/{clubId}/landing/
export async function uploadClubAsset(file, prefix = "asset") {
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `clubs/${CLUB_ID}/landing/${prefix}_${Date.now()}.${ext}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || "image/png" });
  return getDownloadURL(r);
}

/* =========================
   Galería
========================= */
function photoFromSnap(d) {
  const data = d.data() || {};
  return { id: d.id, ...data, createdAtMs: data.createdAt?.toMillis?.() || 0 };
}

export async function listApprovedPhotos() {
  const snap = await getDocs(query(collection(db, COL_PHOTOS), where("status", "==", "approved")));
  return snap.docs.map(photoFromSnap).sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 60)
    .map(({ id, url, caption, uploaderName, createdAtMs }) => ({ id, url, caption, uploaderName, createdAtMs }));
}

export async function listPhotosByStatus(status) {
  const snap = await getDocs(query(collection(db, COL_PHOTOS), where("status", "==", status)));
  return snap.docs.map(photoFromSnap).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function listMyPhotos(uid) {
  const snap = await getDocs(query(collection(db, COL_PHOTOS), where("uploaderUid", "==", uid)));
  return snap.docs.map(photoFromSnap).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

// Usuarios: queda "pending" hasta que un admin la apruebe. Admins pueden subir aprobada.
export async function uploadGalleryPhoto(file, { caption = "", uploaderName = "", approved = false } = {}) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("auth-required");
  if (!/^image\//.test(file.type)) throw new Error("not-image");
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) throw new Error("too-big");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `clubs/${CLUB_ID}/gallery/${user.uid}/${Date.now()}.${ext}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type });
  const url = await getDownloadURL(r);

  return addDoc(collection(db, COL_PHOTOS), {
    url,
    storagePath: path,
    caption: String(caption || "").slice(0, 140),
    uploaderUid: user.uid,
    uploaderName: String(uploaderName || user.displayName || "").slice(0, 80),
    status: approved ? "approved" : "pending",
    createdAt: serverTimestamp(),
    reviewedAt: approved ? serverTimestamp() : null,
  });
}

export async function setPhotoStatus(id, status) {
  await updateDoc(doc(db, COL_PHOTOS, id), {
    status,
    reviewedAt: serverTimestamp(),
    reviewedByUid: auth.currentUser?.uid || null,
  });
  localStorage.removeItem(CACHE_KEY);
}

export async function deletePhoto(photo) {
  if (photo.storagePath) await deleteObject(storageRef(storage, photo.storagePath)).catch(() => null);
  await deleteDoc(doc(db, COL_PHOTOS, photo.id));
  localStorage.removeItem(CACHE_KEY);
}
