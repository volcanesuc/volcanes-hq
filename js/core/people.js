// /js/core/people.js
// Personas y jugadores con el UID como identidad.
//
//   users/{uid}         la persona: profile, role, status.player, status.association
//   club_players/{uid}  su ficha de jugador (mismo id que el usuario)
//   club_players/p_xxx  jugador sin cuenta (menor, histórico); al reclamarlo pasa a {uid}
//
// La asistencia (trainings.attendees) y los rosters de torneo guardan el id de la ficha,
// que para alguien con cuenta es su uid.
import { db } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import {
  arrayRemove,
  arrayUnion,
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
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL = APP_CONFIG.collections;
const COL_USERS = COL.users;
const COL_PLAYERS = COL.club_players;
const COL_TRAININGS = COL.trainings;
const COL_TOURNAMENTS = COL.tournaments;

export const PLAYER_STATUS = ["", "pending", "active", "inactive", "rejected"];
export const ASSOCIATION_STATUS = ["", "pending", "active", "expired", "rejected"];

/* =========================
   Lectura
========================= */
// uid de la persona dueña de una ficha (null si todavía no tiene cuenta).
export function playerUidOf(cp = {}) {
  return cp?.uid || null;
}

export function isPlaceholderId(id) {
  return String(id || "").startsWith("p_");
}

export function profileOf(user = {}) {
  return user?.profile || {};
}

export function personName(user = {}) {
  const p = profileOf(user);
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return name || user?.displayName || user?.email || "";
}

// Nombre del jugador: el del perfil del usuario si tiene cuenta; si no, el de la ficha.
export function playerName(cp = {}, user = null) {
  const fromUser = user ? personName(user) : "";
  const fromCard = [cp?.firstName, cp?.lastName].filter(Boolean).join(" ").trim() || cp?.displayName || cp?.name || cp?.fullName || "";
  return fromUser || fromCard || "—";
}

export function playerFieldRole(cp = {}) {
  return cp?.fieldRole || cp?.role || cp?.position || "";
}

export function playerBirthDate(cp = {}, user = null) {
  return cp?.birthDate || cp?.birthday || profileOf(user || {}).birthDate || null;
}

export function playerIsActive(cp = {}) {
  return cp?.active !== false;
}

/* =========================
   Escritura: usuario
========================= */
// Documento de un usuario nuevo (al primer login).
export function newUserDoc(firebaseUser) {
  return {
    uid: firebaseUser.uid,
    email: (firebaseUser.email || "").toLowerCase() || null,
    displayName: firebaseUser.displayName || null,
    photoURL: firebaseUser.photoURL || null,
    profile: {},
    role: "viewer",
    status: { player: "", association: "" },
    onboardingComplete: false,
    canUsePickups: false,
    consents: {},
    membershipIds: [],
    currentMembership: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastSignInAt: serverTimestamp(),
  };
}

export function setPlayerStatus(uid, status) {
  return updateDoc(doc(db, COL_USERS, uid), { "status.player": status || "", updatedAt: serverTimestamp() });
}

export function setAssociationStatus(uid, status) {
  return updateDoc(doc(db, COL_USERS, uid), { "status.association": status || "", updatedAt: serverTimestamp() });
}

/* =========================
   Escritura: fichas de jugador
========================= */
function newPlaceholderId() {
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

// Ficha del usuario (club_players/{uid}). Crea o completa.
export async function ensurePlayerForUser(uid, data = {}) {
  await setDoc(
    doc(db, COL_PLAYERS, uid),
    { ...data, uid, active: data.active ?? true, updatedAt: serverTimestamp(), createdAt: data.createdAt || serverTimestamp() },
    { merge: true }
  );
  return uid;
}

// Ficha de alguien sin cuenta. Devuelve el id p_xxx.
export async function createPlaceholderPlayer(data = {}) {
  const id = newPlaceholderId();
  await setDoc(doc(db, COL_PLAYERS, id), {
    ...data,
    uid: null,
    active: data.active ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

// Desligar: la ficha del usuario queda inactiva (se conserva el historial).
export async function deactivatePlayer(uid) {
  const ref = doc(db, COL_PLAYERS, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { active: false, updatedAt: serverTimestamp() });
}

/**
 * Un usuario reclama una ficha sin cuenta (o una ficha vieja con id automático):
 * la ficha pasa a club_players/{uid} y la asistencia y los rosters de torneo se reescriben.
 */
export async function claimPlayer(oldId, uid) {
  if (!oldId || !uid || oldId === uid) return uid;

  const oldRef = doc(db, COL_PLAYERS, oldId);
  const oldSnap = await getDoc(oldRef);
  if (!oldSnap.exists()) throw new Error("La ficha de jugador ya no existe.");
  const data = oldSnap.data() || {};
  const owner = playerUidOf(data);
  if (owner && owner !== uid) throw new Error("Esa ficha ya pertenece a otra persona.");

  await setDoc(doc(db, COL_PLAYERS, uid), { ...data, uid, active: true, claimedFrom: oldId, updatedAt: serverTimestamp() }, { merge: true });

  // Asistencia: reemplazar el id viejo por el uid.
  const trainings = await getDocs(query(collection(db, COL_TRAININGS), where("attendees", "array-contains", oldId)));
  for (const t of trainings.docs) {
    await updateDoc(t.ref, { attendees: arrayRemove(oldId) });
    await updateDoc(t.ref, { attendees: arrayUnion(uid) });
  }

  // Rosters de torneo: el doc del roster usa el id de la ficha.
  const tournaments = await getDocs(collection(db, COL_TOURNAMENTS));
  for (const t of tournaments.docs) {
    const entryRef = doc(db, COL_TOURNAMENTS, t.id, "roster", oldId);
    const entry = await getDoc(entryRef);
    if (!entry.exists()) continue;
    const batch = writeBatch(db);
    batch.set(doc(db, COL_TOURNAMENTS, t.id, "roster", uid), {
      ...entry.data(),
      clubPlayerId: uid,
      playerId: uid,
      userId: uid,
      updatedAt: serverTimestamp(),
    });
    batch.delete(entryRef);
    await batch.commit();
  }

  await deleteDoc(oldRef);
  return uid;
}
