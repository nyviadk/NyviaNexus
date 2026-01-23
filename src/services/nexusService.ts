import { getAuth } from "firebase/auth";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { ArchiveItem, NexusItem, Note, TabData } from "../types";

// Hjælpefunktion til at hente nuværende bruger ID sikkert
const getUid = () => {
  const auth = getAuth();
  if (!auth.currentUser) {
    throw new Error(
      "Critical: Ingen bruger logget ind ved database operation.",
    );
  }
  return auth.currentUser.uid;
};

// Hjælpefunktioner til at bestemme paths
const getArchiveListRef = (uid: string, workspaceId: string) => {
  if (workspaceId === "global") {
    return doc(
      db,
      "users",
      uid,
      "inbox_data",
      "global",
      "archive_data",
      "list",
    );
  }
  return doc(
    db,
    "users",
    uid,
    "workspaces_data",
    workspaceId,
    "archive_data",
    "list",
  );
};

const getNotesCollectionRef = (uid: string, workspaceId: string) => {
  if (workspaceId === "global") {
    return collection(db, "users", uid, "inbox_data", "global", "notes");
  }
  return collection(db, "users", uid, "workspaces_data", workspaceId, "notes");
};

const getNoteDocRef = (uid: string, workspaceId: string, noteId: string) => {
  if (workspaceId === "global") {
    return doc(db, "users", uid, "inbox_data", "global", "notes", noteId);
  }
  return doc(db, "users", uid, "workspaces_data", workspaceId, "notes", noteId);
};

export const NexusService = {
  // ... (deleteItem, createItem, renameItem, moveItem, deleteTab, moveTabBetweenWindows, createWorkspace forbliver uændrede) ...

  async deleteItem(item: NexusItem, allItems: NexusItem[]) {
    // (Behold eksisterende kode her)
    const uid = getUid();
    const batch = writeBatch(db);
    const itemsToDelete: string[] = [];
    const workspacesToClose: string[] = [];
    const findChildren = (parentId: string) => {
      itemsToDelete.push(parentId);
      const children = allItems.filter((i) => i.parentId === parentId);
      children.forEach((child) => findChildren(child.id));
    };
    findChildren(item.id);
    for (const id of itemsToDelete) {
      const currentItem = allItems.find((i) => i.id === id);
      if (currentItem?.type === "workspace") {
        workspacesToClose.push(id);
        const winSnap = await getDocs(
          collection(db, "users", uid, "workspaces_data", id, "windows"),
        );
        winSnap.docs.forEach((winDoc) => {
          batch.delete(
            doc(db, "users", uid, "workspaces_data", id, "windows", winDoc.id),
          );
        });
        batch.delete(
          doc(db, "users", uid, "workspaces_data", id, "archive_data", "list"),
        );
        const notesSnap = await getDocs(
          collection(db, "users", uid, "workspaces_data", id, "notes"),
        );
        notesSnap.docs.forEach((noteDoc) => {
          batch.delete(
            doc(db, "users", uid, "workspaces_data", id, "notes", noteDoc.id),
          );
        });
      }
      batch.delete(doc(db, "users", uid, "items", id));
    }
    await batch.commit();
    for (const wsId of workspacesToClose) {
      try {
        chrome.runtime.sendMessage({
          type: "DELETE_WORKSPACE_WINDOWS",
          payload: { workspaceId: wsId },
        });
      } catch (e) {
        console.warn(e);
      }
    }
  },

  async createItem(data: {
    name: string;
    type: "folder" | "workspace";
    parentId: string;
    profileId: string;
  }) {
    // (Behold eksisterende kode)
    const uid = getUid();
    const id = `${data.type === "folder" ? "fol" : "ws"}_${Date.now()}`;
    const batch = writeBatch(db);
    batch.set(doc(db, "users", uid, "items", id), {
      id,
      name: data.name,
      type: data.type,
      parentId: data.parentId,
      profileId: data.profileId,
      createdAt: Date.now(),
    });
    if (data.type === "workspace") {
      const winId = `win_${Date.now()}`;
      batch.set(
        doc(db, "users", uid, "workspaces_data", id, "windows", winId),
        {
          tabs: [],
          lastActive: Date.now(),
          createdAt: serverTimestamp(),
          isActive: false,
        },
      );
      batch.set(
        doc(db, "users", uid, "workspaces_data", id, "archive_data", "list"),
        { items: [] },
      );
    }
    await batch.commit();
    return id;
  },

  async renameItem(id: string, newName: string) {
    const uid = getUid();
    return await updateDoc(doc(db, "users", uid, "items", id), {
      name: newName,
    });
  },

  async moveItem(itemId: string, newParentId: string) {
    const uid = getUid();
    if (!itemId || itemId === newParentId) return Promise.resolve();
    return await updateDoc(doc(db, "users", uid, "items", itemId), {
      parentId: newParentId,
    });
  },

  async deleteTab(tab: TabData, workspaceId: string, windowId: string) {
    // (Behold eksisterende kode)
    const uid = getUid();
    const ref =
      windowId === "global" ||
      windowId === "incognito" ||
      workspaceId === "global"
        ? doc(db, "users", uid, "inbox_data", "global")
        : doc(
            db,
            "users",
            uid,
            "workspaces_data",
            workspaceId,
            "windows",
            windowId,
          );
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const tabs = (snap.data().tabs || []).filter(
        (t: TabData) => t.uid !== tab.uid,
      );
      await updateDoc(ref, { tabs });
    }
  },

  async moveTabBetweenWindows(
    tab: TabData,
    sourceWorkspaceId: string,
    sourceWindowId: string,
    targetWorkspaceId: string,
    targetWindowId: string,
  ) {
    // (Behold eksisterende kode)
    const uid = getUid();
    const getRef = (wsId: string, winId: string) => {
      if (winId === "global" || winId === "incognito" || wsId === "global")
        return doc(db, "users", uid, "inbox_data", "global");
      return doc(db, "users", uid, "workspaces_data", wsId, "windows", winId);
    };
    const sourceRef = getRef(sourceWorkspaceId, sourceWindowId);
    const targetRef = getRef(targetWorkspaceId, targetWindowId);
    const tabToMove = { ...tab, uid: tab.uid || crypto.randomUUID() };
    const batch = writeBatch(db);
    const sourceSnap = await getDoc(sourceRef);
    if (sourceSnap.exists()) {
      const currentTabs = sourceSnap.data().tabs || [];
      const newSourceTabs = currentTabs.filter(
        (t: TabData) => t.uid !== tabToMove.uid,
      );
      batch.update(sourceRef, { tabs: newSourceTabs });
    }
    batch.set(targetRef, { tabs: arrayUnion(tabToMove) }, { merge: true });
    return await batch.commit();
  },

  async createWorkspace(data: {
    id: string;
    name: string;
    parentId: string;
    profileId: string;
    internalWindowId: string;
    tabs: TabData[];
  }) {
    // (Behold eksisterende kode)
    const uid = getUid();
    const batch = writeBatch(db);
    const tabsWithUid = data.tabs.map((t) => ({
      ...t,
      uid: t.uid || crypto.randomUUID(),
    }));
    batch.set(doc(db, "users", uid, "items", data.id), {
      id: data.id,
      name: data.name,
      type: "workspace",
      parentId: data.parentId,
      profileId: data.profileId,
    });
    batch.set(
      doc(
        db,
        "users",
        uid,
        "workspaces_data",
        data.id,
        "windows",
        data.internalWindowId,
      ),
      {
        tabs: tabsWithUid,
        lastActive: Date.now(),
        createdAt: serverTimestamp(),
        isActive: true,
      },
    );
    batch.set(
      doc(db, "users", uid, "workspaces_data", data.id, "archive_data", "list"),
      { items: [] },
    );
    return await batch.commit();
  },

  // --- ARCHIVE METHODS (OPDATERET MED DEDUPE) ---
  async addArchiveItem(
    workspaceId: string,
    url: string,
    readLater: boolean = false,
    title?: string,
  ) {
    const uid = getUid();
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http")) cleanUrl = `https://${cleanUrl}`;

    const docRef = getArchiveListRef(uid, workspaceId);

    // 1. Hent eksisterende
    const snap = await getDoc(docRef);
    let items: ArchiveItem[] = [];
    if (snap.exists()) {
      items = (snap.data().items || []) as ArchiveItem[];
    }

    // 2. Tjek for duplikat
    const existingIndex = items.findIndex((i) => i.url === cleanUrl);

    if (existingIndex !== -1) {
      // Findes allerede
      const existing = items[existingIndex];

      // Hvis vi prøver at tilføje som ReadLater, og den ikke er det -> Opdater
      // Hvis vi bare tilføjer som link (readLater=false), gør vi intet hvis den allerede findes
      if (readLater && !existing.readLater) {
        items[existingIndex] = {
          ...existing,
          readLater: true,
          createdAt: Date.now(), // Bump to top
        };
        return await updateDoc(docRef, { items });
      }
      // Ellers gør ingenting (den er der allerede)
      return;
    }

    // 3. Tilføj ny hvis ikke fundet
    const newItem: ArchiveItem = {
      id: crypto.randomUUID(),
      url: cleanUrl,
      createdAt: Date.now(),
      title: title || cleanUrl,
      readLater: readLater,
    };

    return await setDoc(
      docRef,
      { items: arrayUnion(newItem) },
      { merge: true },
    );
  },

  async updateArchiveItem(
    workspaceId: string,
    itemId: string,
    updates: Partial<ArchiveItem>,
  ) {
    const uid = getUid();
    const docRef = getArchiveListRef(uid, workspaceId);

    try {
      const snap = await getDoc(docRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const items = (data.items || []) as ArchiveItem[];

      const updatedItems = items.map((item) => {
        if (item.id === itemId) {
          return { ...item, ...updates };
        }
        return item;
      });

      await updateDoc(docRef, { items: updatedItems });
    } catch (err) {
      console.error("Failed to update archive item:", err);
    }
  },

  async removeArchiveItem(workspaceId: string, item: ArchiveItem) {
    const uid = getUid();
    const docRef = getArchiveListRef(uid, workspaceId);
    return await updateDoc(docRef, {
      items: arrayRemove(item),
    });
  },

  // --- NOTES METHODS (Uændret) ---
  subscribeToNotes(
    workspaceId: string,
    onUpdate: (notes: Note[], fromLocal: boolean) => void,
  ) {
    const uid = getUid();
    const q = query(
      getNotesCollectionRef(uid, workspaceId),
      orderBy("createdAt", "desc"),
    );
    console.log(
      `📡 [NexusService] Connecting to notes listener... (WS: ${workspaceId})`,
    );
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const notes = snapshot.docs.map((d) => d.data() as Note);
        const fromLocal = snapshot.metadata.hasPendingWrites;
        onUpdate(notes, fromLocal);
      },
      (error) => console.error("🔥 [NexusService] SNAPSHOT ERROR:", error),
    );
  },

  async saveNote(workspaceId: string, note: Note) {
    const uid = getUid();
    const noteRef = getNoteDocRef(uid, workspaceId, note.id);
    await setDoc(noteRef, note, { merge: true });
  },

  async deleteNote(workspaceId: string, noteId: string) {
    const uid = getUid();
    const noteRef = getNoteDocRef(uid, workspaceId, noteId);
    await deleteDoc(noteRef);
  },
};
