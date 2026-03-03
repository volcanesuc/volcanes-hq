import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const TrainingsService = {
  async list({ db, clubId }) {
    const qy = query(
      collection(db, "trainings"),
      where("clubId", "==", clubId),
      orderBy("date", "desc")
    );
    const snap = await getDocs(qy);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async create({ db, payload }) {
    payload.createdAt = serverTimestamp();
    payload.updatedAt = serverTimestamp();
    return await addDoc(collection(db, "trainings"), payload);
  },

  async update({ db, id, payload }) {
    payload.updatedAt = serverTimestamp();
    return await updateDoc(doc(db, "trainings", id), payload);
  }
};