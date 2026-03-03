import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const PlaybookService = {
  async listDrills({ db, clubId }) {
    const qy = query(
      collection(db, "drills"),
      where("clubId", "==", clubId),
      where("isActive", "==", true)
    );
    const snap = await getDocs(qy);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async listPlaybookTrainings({ db, clubId }) {
    const qy = query(
      collection(db, "playbook_trainings"),
      where("clubId", "==", clubId)
    );
    const snap = await getDocs(qy);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};