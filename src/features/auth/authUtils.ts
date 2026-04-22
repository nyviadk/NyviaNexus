import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  addDoc,
  db,
} from "@/lib/firebase";

/**
 * Tjekker om brugeren har den nødvendige start-data (Inbox og Profil).
 * Opretter det, hvis det mangler.
 * Kaster fejl (f.eks. permission-denied), hvis sikkerhedsreglerne mangler.
 */
export const bootstrapUserData = async (uid: string) => {
  try {
    // 1. Bootstrap global Inbox
    const inboxRef = doc(db, "users", uid, "inbox_data", "global");
    const inboxSnap = await getDoc(inboxRef);
    if (!inboxSnap.exists()) {
      await setDoc(inboxRef, {
        tabs: [],
        lastUpdate: serverTimestamp(),
      });
    }

    // Bootstrap Profiler
    const profilesCollection = collection(db, "users", uid, "profiles");
    const profilesSnap = await getDocs(profilesCollection);
    if (profilesSnap.empty) {
      await addDoc(profilesCollection, {
        name: "Privat",
        createdAt: serverTimestamp(),
      });
    }

    return true;
  } catch (error) {
    console.error("Fejl under bootstrapping af brugerdata:", error);
    throw error;
  }
};
