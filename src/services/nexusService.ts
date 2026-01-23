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

// Hjælpefunktioner til at bestemme paths baseret på context (Global vs Workspace)
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
  async deleteItem(item: NexusItem, allItems: NexusItem[]) {
    const uid = getUid();
    const batch = writeBatch(db);
    const itemsToDelete: string[] = [];
    const workspacesToClose: string[] = [];

    // Rekursiv funktion til at finde alle børn
    const findChildren = (parentId: string) => {
      itemsToDelete.push(parentId);
      const children = allItems.filter((i) => i.parentId === parentId);
      children.forEach((child) => findChildren(child.id));
    };

    findChildren(item.id);

    // 1. FORBERED SLETNING I FIRESTORE
    for (const id of itemsToDelete) {
      const currentItem = allItems.find((i) => i.id === id);

      if (currentItem?.type === "workspace") {
        workspacesToClose.push(id);

        // A. Slet windows-subcollection
        const winSnap = await getDocs(
          collection(db, "users", uid, "workspaces_data", id, "windows"),
        );
        winSnap.docs.forEach((winDoc) => {
          batch.delete(
            doc(db, "users", uid, "workspaces_data", id, "windows", winDoc.id),
          );
        });

        // B. Slet archive_data subcollection
        batch.delete(
          doc(db, "users", uid, "workspaces_data", id, "archive_data", "list"),
        );

        // C. Slet notes subcollection (Hent dem først, da man ikke kan slette en collection direkte)
        const notesSnap = await getDocs(
          collection(db, "users", uid, "workspaces_data", id, "notes"),
        );
        notesSnap.docs.forEach((noteDoc) => {
          batch.delete(
            doc(db, "users", uid, "workspaces_data", id, "notes", noteDoc.id),
          );
        });
      }

      // Slet selve itemet fra users/{uid}/items
      batch.delete(doc(db, "users", uid, "items", id));
    }

    // 2. COMMIT TIL DATABASEN
    await batch.commit();
    console.log("✅ Data slettet succesfuldt fra Firestore");

    // 3. LUK FYSISKE VINDUER
    for (const wsId of workspacesToClose) {
      try {
        chrome.runtime.sendMessage({
          type: "DELETE_WORKSPACE_WINDOWS",
          payload: { workspaceId: wsId },
        });
      } catch (e) {
        console.warn(
          "Kunne ikke sende lukke-besked til background script (måske allerede lukket)",
          e,
        );
      }
    }
  },

  async createItem(data: {
    name: string;
    type: "folder" | "workspace";
    parentId: string;
    profileId: string;
  }) {
    const uid = getUid();
    const id = `${data.type === "folder" ? "fol" : "ws"}_${Date.now()}`;
    const batch = writeBatch(db);

    // Opret item i users/{uid}/items
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
      // Opret workspace data i users/{uid}/workspaces_data
      batch.set(
        doc(db, "users", uid, "workspaces_data", id, "windows", winId),
        {
          tabs: [],
          lastActive: Date.now(),
          createdAt: serverTimestamp(),
          isActive: false,
        },
      );
      // Opret tomt arkiv dokument
      batch.set(
        doc(db, "users", uid, "workspaces_data", id, "archive_data", "list"),
        {
          items: [],
        },
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
    const uid = getUid();
    console.log(
      `🗑️ [NexusService] deleteTab: ${tab.title} (UID: ${tab.uid}) fra ${workspaceId}/${windowId}`,
    );

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
      console.log("✅ [NexusService] Tab fjernet fra Firestore.");
    }
  },

  async moveTabBetweenWindows(
    tab: TabData,
    sourceWorkspaceId: string,
    sourceWindowId: string,
    targetWorkspaceId: string,
    targetWindowId: string,
  ) {
    const uid = getUid();
    console.log(
      "🚀 [NexusService] START moveTabBetweenWindows (Samme Space logic)",
    );

    const getRef = (wsId: string, winId: string) => {
      if (winId === "global" || winId === "incognito" || wsId === "global") {
        return doc(db, "users", uid, "inbox_data", "global");
      }
      return doc(db, "users", uid, "workspaces_data", wsId, "windows", winId);
    };

    const sourceRef = getRef(sourceWorkspaceId, sourceWindowId);
    const targetRef = getRef(targetWorkspaceId, targetWindowId);

    const tabToMove = {
      ...tab,
      uid: tab.uid || crypto.randomUUID(),
    };

    const batch = writeBatch(db);

    // Håndter kilden (fjern fane)
    const sourceSnap = await getDoc(sourceRef);
    if (sourceSnap.exists()) {
      const currentTabs = sourceSnap.data().tabs || [];
      const newSourceTabs = currentTabs.filter(
        (t: TabData) => t.uid !== tabToMove.uid,
      );
      batch.update(sourceRef, { tabs: newSourceTabs });
    }

    // Håndter målet (tilføj fane) - Brug SET med merge for robusthed
    batch.set(targetRef, { tabs: arrayUnion(tabToMove) }, { merge: true });

    const result = await batch.commit();
    console.log("✅ [NexusService] Flytning færdiggjort i Firestore.");
    return result;
  },

  async createWorkspace(data: {
    id: string;
    name: string;
    parentId: string;
    profileId: string;
    internalWindowId: string;
    tabs: TabData[];
  }) {
    const uid = getUid();
    const batch = writeBatch(db);
    const tabsWithUid = data.tabs.map((t) => ({
      ...t,
      uid: t.uid || crypto.randomUUID(),
    }));

    // Opret item
    batch.set(doc(db, "users", uid, "items", data.id), {
      id: data.id,
      name: data.name,
      type: "workspace" as const,
      parentId: data.parentId,
      profileId: data.profileId,
    });

    // Opret initial window data
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

    // Opret tomt arkiv
    batch.set(
      doc(db, "users", uid, "workspaces_data", data.id, "archive_data", "list"),
      { items: [] },
    );

    return await batch.commit();
  },

  // --- ARCHIVE METHODS ---
  async addArchiveItem(workspaceId: string, url: string) {
    const uid = getUid();
    // Normaliser URL
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith("http")) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const newItem: ArchiveItem = {
      id: crypto.randomUUID(),
      url: cleanUrl,
      createdAt: Date.now(),
      title: cleanUrl,
    };

    const docRef = getArchiveListRef(uid, workspaceId);

    // Brug set med merge for at være sikker på dokumentet findes (især for inbox)
    return await setDoc(
      docRef,
      {
        items: arrayUnion(newItem),
      },
      { merge: true },
    );
  },

  async removeArchiveItem(workspaceId: string, item: ArchiveItem) {
    const uid = getUid();
    const docRef = getArchiveListRef(uid, workspaceId);
    return await updateDoc(docRef, {
      items: arrayRemove(item),
    });
  },

  // --- NOTES METHODS ---

  // 1. SUBSCRIBE (LOGGING OPTIMIZED)
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

        console.log(
          `📥 [NexusService] Notes Snapshot: ${notes.length} items. Source: ${fromLocal ? "Local (Pending)" : "Server"}`,
        );

        onUpdate(notes, fromLocal);
      },
      (error) => {
        console.error("🔥 [NexusService] SNAPSHOT ERROR:", error);
      },
    );
  },

  // 2. SAVE (LOGGING OPTIMIZED)
  async saveNote(workspaceId: string, note: Note) {
    const uid = getUid();
    const noteRef = getNoteDocRef(uid, workspaceId, note.id);

    // Log for debugging
    console.log(
      `💾 [NexusService] Saving note ${note.id} to ${workspaceId}...`,
    );

    await setDoc(noteRef, note, { merge: true });
    console.log(`✅ [NexusService] Note saved.`);
  },

  async deleteNote(workspaceId: string, noteId: string) {
    const uid = getUid();
    console.log(
      `🗑️ [NexusService] Deleting note: ${noteId} from ${workspaceId}`,
    );
    const noteRef = getNoteDocRef(uid, workspaceId, noteId);
    await deleteDoc(noteRef);
  },
};
