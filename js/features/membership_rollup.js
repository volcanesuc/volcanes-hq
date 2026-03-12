// /js/features/membership_rollup.js

import { db } from "../auth/firebase.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const COL_USERS = "users";
const COL_MEMBERSHIPS = "memberships";
const COL_INSTALLMENTS = "membership_installments";

function norm(s) {
  return (s || "").toString().toLowerCase().trim();
}

function isSettledStatus(st) {
  const s = norm(st || "pending");
  return s === "paid" || s === "validated";
}

function dueOf(it) {
  return it.dueDate || (it.dueMonthDay && it.season ? `${it.season}-${it.dueMonthDay}` : null);
}

async function syncUserMembershipRollup(membershipId, membershipData, rollup) {
  const uid = membershipData?.userId || membershipData?.userSnapshot?.uid || null;
  if (!uid) return;

  try {
    const userRef = doc(db, COL_USERS, uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const currentMembership = userSnap.data()?.currentMembership || null;
    if (!currentMembership || currentMembership.membershipId !== membershipId) return;

    await updateDoc(userRef, {
      currentMembership: {
        ...currentMembership,
        installmentsTotal: rollup.installmentsTotal,
        installmentsSettled: rollup.installmentsSettled,
        installmentsPending: rollup.installmentsPending,
        nextUnpaidN: rollup.nextUnpaidN,
        nextUnpaidDueDate: rollup.nextUnpaidDueDate,
      },
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.warn("No se pudo sincronizar rollup en users.currentMembership", e?.code || e);
  }
}

export async function recomputeMembershipRollup(mid) {
  const membershipRef = doc(db, COL_MEMBERSHIPS, mid);
  const membershipSnap = await getDoc(membershipRef);
  if (!membershipSnap.exists()) {
    throw new Error("membership_not_found");
  }

  const membershipData = membershipSnap.data() || {};

  const q = query(collection(db, COL_INSTALLMENTS), where("membershipId", "==", mid));
  const snap = await getDocs(q);

  const inst = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const total = inst.length;
  const settled = inst.filter((i) => isSettledStatus(i.status)).length;
  const pending = Math.max(0, total - settled);

  const next = inst
    .filter((i) => !isSettledStatus(i.status))
    .map((i) => ({ n: i.n ?? null, due: dueOf(i) }))
    .filter((x) => !!x.due)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))[0] || null;

  const rollup = {
    installmentsTotal: total,
    installmentsSettled: settled,
    installmentsPending: pending,
    nextUnpaidN: next?.n ?? null,
    nextUnpaidDueDate: next?.due ?? null,
    updatedAt: serverTimestamp()
  };

  await updateDoc(membershipRef, rollup);
  await syncUserMembershipRollup(mid, membershipData, {
    installmentsTotal: total,
    installmentsSettled: settled,
    installmentsPending: pending,
    nextUnpaidN: next?.n ?? null,
    nextUnpaidDueDate: next?.due ?? null,
  });

  return rollup;
}