// /js/features/pickups/pickups_services.js
// Acceso a Firestore / Storage para Pickups.
//
// Colecciones:
//   pickups/{id}                                  datos del juego
//   pickup_registrations/{id}                     inscripción (pública: nombre, tarifa, estado)
//   pickup_registrations/{id}/private/info        teléfono, cédula, comprobante (solo dueño + admin)
//   pickup_reg_keys/{token}                       link privado de invitados (nadie lo puede leer)
//   pickup_reg_claims/{regId}_{uid}               "este dispositivo abrió el link privado"
import { db, storage, auth } from "/js/auth/firebase.js";
import { APP_CONFIG } from "/js/config/config.js";
import { getPickupSettings } from "/js/features/pickups/pickups_settings.js";
import {
  PAYMENT_STATUS,
  PICKUP_STATUS,
  REG_STATUS,
  getCancelDeadline,
  personKeyFromId,
  regCashDue,
  regAmountDue,
} from "/js/features/pickups/pickups_shared.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  updateDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  deleteField,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const COL = APP_CONFIG.collections;
const COL_PICKUPS = COL.pickups;
const COL_REGS = COL.pickupRegistrations;
const COL_KEYS = COL.pickupRegKeys || "pickup_reg_keys";
const COL_CLAIMS = COL.pickupRegClaims || "pickup_reg_claims";
const COL_USERS = COL.users;
const COL_MOVEMENTS = COL.finance_movements;
const COL_MOVEMENTS_HISTORY = COL.finance_movements_history;

const MAX_PROOF_BYTES = 8 * 1024 * 1024;

const snapToList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const privateRef = (regId) => doc(db, COL_REGS, regId, "private", "info");

/* =========================
   Lecturas
========================= */
export async function loadPickupBySlug(slug) {
  const snap = await getDocs(query(
    collection(db, COL_PICKUPS),
    where("slug", "==", slug),
    where("isPublic", "==", true)
  ));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function loadPickup(id) {
  const snap = await getDoc(doc(db, COL_PICKUPS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function loadAllPickups() {
  const list = snapToList(await getDocs(collection(db, COL_PICKUPS)));
  return list.sort((a, b) => (b.startAt?.toMillis?.() || 0) - (a.startAt?.toMillis?.() || 0));
}

export async function loadPublicPickups() {
  const snap = await getDocs(query(collection(db, COL_PICKUPS), where("isPublic", "==", true)));
  return snapToList(snap).sort((a, b) => (a.startAt?.toMillis?.() || 0) - (b.startAt?.toMillis?.() || 0));
}

export async function loadRegsForPickup(pickupId) {
  return snapToList(await getDocs(query(collection(db, COL_REGS), where("pickupId", "==", pickupId))));
}

export async function loadAllRegs() {
  return snapToList(await getDocs(collection(db, COL_REGS)));
}

// Historial de una persona/pagador (para crédito y morosidad).
export async function loadRegsByPayer(payerKey, legacyUid = null) {
  const jobs = [getDocs(query(collection(db, COL_REGS), where("payerKey", "==", payerKey)))];
  if (legacyUid) {
    jobs.push(getDocs(query(collection(db, COL_REGS), where("ownerUid", "==", legacyUid))));
    jobs.push(getDocs(query(collection(db, COL_REGS), where("uid", "==", legacyUid)))); // aún sin migrar
  }
  const results = await Promise.all(jobs);
  const map = new Map();
  results.forEach((snap) => snapToList(snap).forEach((r) => map.set(r.id, r)));
  return [...map.values()];
}

export async function loadRegsByPersonKey(personKey) {
  return snapToList(await getDocs(query(collection(db, COL_REGS), where("personKey", "==", personKey))));
}

export async function loadRegsOwnedBy(uid) {
  return snapToList(await getDocs(query(collection(db, COL_REGS), where("ownerUid", "==", uid))));
}

export async function loadReg(regId) {
  const snap = await getDoc(doc(db, COL_REGS, regId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function loadRegPrivate(regId) {
  try {
    const snap = await getDoc(privateRef(regId));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// Solo admin: link privado de un invitado (para mandarlo por WhatsApp).
export async function loadGuestKey(regId) {
  try {
    const snap = await getDocs(query(collection(db, COL_KEYS), where("regId", "==", regId)));
    return snap.empty ? null : snap.docs[0].id;
  } catch {
    return null;
  }
}

export async function loadUserDoc(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, COL_USERS, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* =========================
   Comprobante
========================= */
export async function uploadProof(file, pickupId) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No hay sesión.");
  if (!file?.type?.startsWith("image/")) throw new Error("El comprobante debe ser una imagen.");
  if (file.size > MAX_PROOF_BYTES) throw new Error("La imagen es muy grande (máx. 8 MB).");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `pickups/${pickupId}/proofs/${uid}/${Date.now()}.${ext}`;
  const ref = storageRef(storage, path);

  await uploadBytes(ref, file, { contentType: file.type, cacheControl: "no-cache" });
  const downloadURL = await getDownloadURL(ref);
  return { storagePath: path, downloadURL, uploadedAt: Timestamp.now() };
}

/* =========================
   Inscripción (jugador)
   entries: [{ pub: {...campos públicos}, priv: {...campos privados} }]
========================= */
export async function createRegistrations({ pickup, entries, guestKey = null }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No hay sesión.");

  const batch = writeBatch(db);
  const ids = [];
  const base = Date.now() * 100;

  entries.forEach((entry, i) => {
    const ref = doc(collection(db, COL_REGS));
    ids.push(ref.id);

    batch.set(ref, {
      pickupId: pickup.id,
      ownerUid: uid,
      registrationStatus: REG_STATUS.ACTIVE,
      attendance: null,
      rejectReason: null,
      paidAmount: 0,
      reviewedAt: null,
      reviewedByUid: null,
      financeMovementId: null,
      creditRefunded: false,
      joinOrder: base + i,
      ...entry.pub,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(privateRef(ref.id), {
      ownerUid: uid,
      phone: null,
      idNumber: null,
      email: null,
      proof: null,
      ...entry.priv,
    });

    if (guestKey && i === 0) {
      batch.set(doc(db, COL_KEYS, guestKey), { regId: ref.id, pickupId: pickup.id, createdAt: serverTimestamp() });
    }
  });

  await batch.commit();
  return ids;
}

// Un invitado abrió su link privado en otro dispositivo.
export async function claimRegistration(regId, key) {
  const uid = auth.currentUser?.uid;
  if (!uid || !regId || !key) return false;
  try {
    await setDoc(doc(db, COL_CLAIMS, `${regId}_${uid}`), { regId, uid, key, createdAt: serverTimestamp() });
    return true;
  } catch (err) {
    console.warn("[pickups] link privado inválido:", err);
    return false;
  }
}

export async function submitProof(regId, proof) {
  const batch = writeBatch(db);
  batch.update(doc(db, COL_REGS, regId), {
    paymentStatus: PAYMENT_STATUS.SUBMITTED,
    paymentMethod: "sinpe",
    rejectReason: null,
    updatedAt: serverTimestamp(),
  });
  batch.set(privateRef(regId), { proof }, { merge: true });
  await batch.commit();
}

export async function leaveRegistration(regId) {
  await updateDoc(doc(db, COL_REGS, regId), {
    registrationStatus: REG_STATUS.CANCELLED,
    cancelledAt: serverTimestamp(),
    cancelledBy: "player",
    updatedAt: serverTimestamp(),
  });
}

/* =========================
   Admin: pickups
========================= */
export async function savePickup(id, data) {
  const deadline = getCancelDeadline(data);
  const payload = {
    ...data,
    cancelDeadlineAt: deadline ? Timestamp.fromDate(deadline) : null,
    // compat: pickups_status.js filtra por "active"
    active: data.status === PICKUP_STATUS.PUBLISHED && data.isPublic === true,
    updatedAt: serverTimestamp(),
  };

  if (id) {
    await updateDoc(doc(db, COL_PICKUPS, id), payload);
    return id;
  }
  const ref = await addDoc(collection(db, COL_PICKUPS), {
    ...payload,
    createdAt: serverTimestamp(),
    createdByUid: auth.currentUser?.uid || null,
  });
  return ref.id;
}

// Cancela el pickup: todas las inscripciones quedan canceladas; los pagos aprobados pasan a crédito.
export async function cancelPickup(pickup, regs = []) {
  const batch = writeBatch(db);
  batch.update(doc(db, COL_PICKUPS, pickup.id), {
    status: PICKUP_STATUS.CANCELLED,
    active: false,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  regs
    .filter((r) => r.registrationStatus !== REG_STATUS.CANCELLED)
    .forEach((r) => {
      batch.update(doc(db, COL_REGS, r.id), {
        registrationStatus: REG_STATUS.CANCELLED,
        cancelledAt: serverTimestamp(),
        cancelledBy: "pickup_cancelled",
        updatedAt: serverTimestamp(),
      });
    });
  await batch.commit();
}

/* =========================
   Admin: inscripciones
========================= */
export async function updateReg(regId, patch) {
  await updateDoc(doc(db, COL_REGS, regId), { ...patch, updatedAt: serverTimestamp() });
}

export async function addManualRegistration({ pickup, pub, priv }) {
  const ref = doc(collection(db, COL_REGS));
  const batch = writeBatch(db);
  batch.set(ref, {
    pickupId: pickup.id,
    ownerUid: auth.currentUser?.uid || null,
    registrationStatus: REG_STATUS.ACTIVE,
    attendance: null,
    rejectReason: null,
    paidAmount: 0,
    creditApplied: 0,
    reviewedAt: null,
    reviewedByUid: null,
    financeMovementId: null,
    creditRefunded: false,
    joinOrder: Date.now() * 100,
    ...pub,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(privateRef(ref.id), { ownerUid: null, phone: null, idNumber: null, email: null, proof: null, ...priv });
  await batch.commit();
  return ref.id;
}

export async function removeRegistration(regId) {
  await updateDoc(doc(db, COL_REGS, regId), {
    registrationStatus: REG_STATUS.CANCELLED,
    cancelledAt: serverTimestamp(),
    cancelledBy: "admin",
    updatedAt: serverTimestamp(),
  });
}

function adminInfo() {
  const u = auth.currentUser;
  return { uid: u?.uid || null, name: u?.displayName || u?.email || "Admin" };
}

async function createFinanceMovement({ type, amount, method, description, reg, pickup }) {
  const s = getPickupSettings();
  if (!s.postToFinance || !COL_MOVEMENTS || amount <= 0) return null;

  const admin = adminInfo();
  const payload = {
    type,
    category: s.financeCategory,
    subcategory: s.financeCategory,
    description,
    amount,
    currency: s.currencyCode,
    movementDate: new Date().toISOString().slice(0, 10),
    method: method || "sinpe",
    source: "pickup",
    sourceId: reg.id,
    relatedUserId: reg.linkedUid || null,
    relatedMembershipId: null,
    relatedSubmissionId: null,
    notes: `pickupId: ${pickup?.id || reg.pickupId}`,
    createdByUid: admin.uid,
    createdByName: admin.name,
    isVoided: false,
    voidedAt: null,
    voidedByUid: null,
    voidReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, COL_MOVEMENTS), payload);
  if (COL_MOVEMENTS_HISTORY) {
    await addDoc(collection(db, COL_MOVEMENTS_HISTORY), {
      movementId: ref.id,
      action: "create",
      snapshot: { ...payload, movementId: ref.id },
      changedByUid: admin.uid,
      changedByName: admin.name,
      changedAt: serverTimestamp(),
    });
  }
  return ref.id;
}

async function voidFinanceMovement(movementId, reason) {
  if (!movementId || !COL_MOVEMENTS) return;
  const admin = adminInfo();
  await updateDoc(doc(db, COL_MOVEMENTS, movementId), {
    isVoided: true,
    voidedAt: serverTimestamp(),
    voidedByUid: admin.uid,
    voidReason: reason,
    updatedAt: serverTimestamp(),
  });
  if (COL_MOVEMENTS_HISTORY) {
    await addDoc(collection(db, COL_MOVEMENTS_HISTORY), {
      movementId,
      action: "void",
      snapshot: { voidReason: reason },
      changedByUid: admin.uid,
      changedByName: admin.name,
      changedAt: serverTimestamp(),
    });
  }
}

// Aprobar comprobante o marcar como pagado (efectivo, etc.). Registra el ingreso en contabilidad.
export async function approvePayment(reg, pickup, method = null) {
  const admin = adminInfo();
  const finalMethod = method || reg.paymentMethod || "sinpe";
  const cash = regCashDue(reg);

  const movementId = reg.financeMovementId || await createFinanceMovement({
    type: "income",
    amount: cash,
    method: finalMethod === "credit" ? "otro" : finalMethod,
    description: `Pickup ${pickup?.title || ""} · ${reg.displayName || ""} · ${reg.tierLabel || ""}`.trim(),
    reg,
    pickup,
  });

  await updateReg(reg.id, {
    paymentStatus: PAYMENT_STATUS.APPROVED,
    paymentMethod: finalMethod,
    paidAmount: regAmountDue(reg),
    rejectReason: null,
    reviewedAt: serverTimestamp(),
    reviewedByUid: admin.uid,
    financeMovementId: movementId || null,
  });
}

export async function rejectPayment(reg, reason) {
  const admin = adminInfo();
  if (reg.financeMovementId) await voidFinanceMovement(reg.financeMovementId, "Comprobante rechazado");
  await updateReg(reg.id, {
    paymentStatus: PAYMENT_STATUS.REJECTED,
    paidAmount: 0,
    rejectReason: reason || null,
    reviewedAt: serverTimestamp(),
    reviewedByUid: admin.uid,
    financeMovementId: null,
  });
}

/* =========================
   Migración de datos de la versión anterior (solo admin, corre sola al abrir Pickups)
   - pickups: agrega cancellationHours / cancelDeadlineAt / active
   - inscripciones: pasa email, teléfono y comprobante a /private y quita esos datos
     de la lista pública; mapea registered/waitlist/attended al nuevo formato
========================= */
const LEGACY_REG_FIELDS = ["email", "phone", "paymentProof", "uid", "pricingTierId", "pricingTierLabel", "userCategory"];

export function needsMigration(pickups = [], regs = []) {
  return pickups.some((p) => p.startAt && !p.cancelDeadlineAt)
    || regs.some((r) => LEGACY_REG_FIELDS.some((f) => f in r));
}

export async function migrateLegacyData(pickups = [], regs = []) {
  const writes = [];

  for (const p of pickups.filter((x) => x.startAt && !x.cancelDeadlineAt)) {
    const hours = Number(p.cancellationHours ?? p.rules?.cancellationDeadlineHours ?? getPickupSettings().defaultCancellationHours);
    const data = { ...p, cancellationHours: hours };
    const deadline = getCancelDeadline(data);
    writes.push((b) => b.update(doc(db, COL_PICKUPS, p.id), {
      cancellationHours: hours,
      cancelDeadlineAt: deadline ? Timestamp.fromDate(deadline) : null,
      noShowMustPay: p.noShowMustPay ?? getPickupSettings().noShowMustPayByDefault,
      active: p.status === PICKUP_STATUS.PUBLISHED && p.isPublic === true,
    }));
  }

  const legacyRegs = regs.filter((x) => LEGACY_REG_FIELDS.some((f) => f in x));

  // clave de persona por cédula (igual que en la versión nueva) para que crédito y morosidad sigan a la persona
  const uids = [...new Set(legacyRegs.map((r) => r.ownerUid || r.uid).filter(Boolean))];
  const keyByUid = new Map(await Promise.all(uids.map(async (uid) => {
    const u = await loadUserDoc(uid).catch(() => null);
    return [uid, (await personKeyFromId(u?.profile?.idNumber || u?.idNumber)) || `uid:${uid}`];
  })));

  for (const r of legacyRegs) {
    const uid = r.ownerUid || r.uid || null;
    const key = keyByUid.get(uid) || r.id;
    const oldStatus = String(r.registrationStatus || "").toLowerCase();
    const attendance = oldStatus === "attended" ? "attended" : oldStatus === "no_show" ? "no_show" : (r.attendance ?? null);
    const approved = String(r.paymentStatus || "").toLowerCase() === PAYMENT_STATUS.APPROVED;

    writes.push((b) => b.set(privateRef(r.id), {
      ownerUid: uid,
      email: r.email || null,
      phone: r.phone || null,
      idNumber: null,
      proof: r.paymentProof?.downloadURL
        ? { storagePath: r.paymentProof.storagePath || null, downloadURL: r.paymentProof.downloadURL }
        : null,
    }, { merge: true }));

    writes.push((b) => b.update(doc(db, COL_REGS, r.id), {
      ownerUid: uid,
      linkedUid: r.linkedUid ?? uid,
      source: r.source || "user",
      personKey: r.personKey || key,
      payerKey: r.payerKey || key,
      tierId: r.tierId || r.pricingTierId || null,
      tierLabel: r.tierLabel || r.pricingTierLabel || null,
      registrationStatus: oldStatus === "cancelled" ? REG_STATUS.CANCELLED : REG_STATUS.ACTIVE,
      attendance,
      creditApplied: Number(r.creditApplied || 0),
      paidAmount: approved ? Number(r.paidAmount ?? r.amountDue ?? 0) : 0,
      email: deleteField(),
      phone: deleteField(),
      paymentProof: deleteField(),
      uid: deleteField(),
      pricingTierId: deleteField(),
      pricingTierLabel: deleteField(),
      userCategory: deleteField(),
      updatedAt: serverTimestamp(),
    }));
  }

  // Firestore permite 500 operaciones por batch
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(db);
    writes.slice(i, i + 400).forEach((w) => w(batch));
    await batch.commit();
  }
  return writes.length;
}

// El crédito de una inscripción cancelada se devolvió en dinero.
export async function refundCredit(reg, pickup, amount) {
  await createFinanceMovement({
    type: "expense",
    amount: Number(amount ?? reg.paidAmount ?? 0),
    method: "sinpe",
    description: `Devolución pickup ${pickup?.title || ""} · ${reg.displayName || ""}`.trim(),
    reg,
    pickup,
  });
  await updateReg(reg.id, { creditRefunded: true });
}
