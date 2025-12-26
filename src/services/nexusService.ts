import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { NexusItem } from "../types";

export const NexusService = {
  async deleteItem(item: NexusItem, allItems: NexusItem[]) {
    const batch = writeBatch(db);
    const itemsToDelete: string[] = [];
    const findChildren = (parentId: string) => {
      itemsToDelete.push(parentId);
      const children = allItems.filter((i) => i.parentId === parentId);
      children.forEach((child) => findChildren(child.id));
    };
    findChildren(item.id);
    for (const id of itemsToDelete) {
      batch.delete(doc(db, "items", id));
      const currentItem = allItems.find((i) => i.id === id);
      if (currentItem?.type === "workspace") {
        const winSnap = await getDocs(
          collection(db, "workspaces_data", id, "windows")
        );
        winSnap.docs.forEach((winDoc) => {
          batch.delete(doc(db, "workspaces_data", id, "windows", winDoc.id));
        });
      }
    }
    return await batch.commit();
  },

  async createItem(data: {
    name: string;
    type: "folder" | "workspace";
    parentId: string;
    profileId: string;
  }) {
    const id = `${data.type === "folder" ? "fol" : "ws"}_${Date.now()}`;
    const batch = writeBatch(db);
    batch.set(doc(db, "items", id), {
      id,
      name: data.name,
      type: data.type,
      parentId: data.parentId,
      profileId: data.profileId,
      createdAt: Date.now(),
    });
    if (data.type === "workspace") {
      const winId = `win_${Date.now()}`;
      batch.set(doc(db, "workspaces_data", id, "windows", winId), {
        tabs: [],
        lastActive: Date.now(),
        isActive: false,
      });
    }
    await batch.commit();
    return id;
  },

  async renameItem(id: string, newName: string) {
    return await updateDoc(doc(db, "items", id), { name: newName });
  },

  async moveItem(itemId: string, newParentId: string) {
    if (!itemId || itemId === newParentId) return Promise.resolve();
    return await updateDoc(doc(db, "items", itemId), { parentId: newParentId });
  },

  async moveTabBetweenWindows(
    tab: any,
    sourceWorkspaceId: string,
    sourceWindowId: string,
    targetWorkspaceId: string,
    targetWindowId: string
  ) {
    // Helper to resolve reference
    const getRef = (wsId: string, winId: string) => {
      if (winId === "global" || winId === "incognito") {
        return doc(db, "inbox_data", "global");
      }
      return doc(db, "workspaces_data", wsId, "windows", winId);
    };

    const sourceRef = getRef(sourceWorkspaceId, sourceWindowId);
    const targetRef = getRef(targetWorkspaceId, targetWindowId);

    // Sikr at tab har en UID (hvis det er gamle data)
    const tabToMove = {
      ...tab,
      uid: tab.uid || crypto.randomUUID(),
    };

    const batch = writeBatch(db);

    // BEMÆRK: arrayRemove virker KUN hvis objektet matcher 100%.
    // Hvis 'tab' objektet fra frontend mangler felter som DB har, fejler det.
    // Den mest robuste måde er at læse arrayet, filtrere og skrive tilbage.

    // MEN for performance bruger vi arrayRemove, men vi stoler på at frontend sender det komplette objekt.
    // Hvis source er DB-baseret, bør objektet være identisk.

    // Hvis vi flytter TIL SAMME LISTE (reorder), skal vi håndtere det anderledes,
    // men her flytter vi mellem vinduer.

    batch.update(sourceRef, { tabs: arrayRemove(tab) }); // Fjern originalen (uden evt ny UID hvis den manglede)

    // Tilføj til target (med UID)
    batch.update(targetRef, { tabs: arrayUnion(tabToMove) });

    return await batch.commit();
  },

  async createWorkspace(data: {
    id: string;
    name: string;
    parentId: string;
    profileId: string;
    internalWindowId: string;
    tabs: any[];
  }) {
    const batch = writeBatch(db);

    // Sikr UIDs på alle tabs
    const tabsWithUid = data.tabs.map((t) => ({
      ...t,
      uid: t.uid || crypto.randomUUID(),
    }));

    batch.set(doc(db, "items", data.id), {
      id: data.id,
      name: data.name,
      type: "workspace" as const,
      parentId: data.parentId,
      profileId: data.profileId,
      createdAt: Date.now(),
    });
    batch.set(
      doc(db, "workspaces_data", data.id, "windows", data.internalWindowId),
      {
        tabs: tabsWithUid,
        lastActive: Date.now(),
        isActive: true,
      }
    );
    return await batch.commit();
  },
};
