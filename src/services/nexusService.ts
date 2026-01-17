import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { NexusItem } from "../types";

export const NexusService = {
  async deleteItem(item: NexusItem, allItems: NexusItem[]) {
    const batch = writeBatch(db);
    const itemsToDelete: string[] = [];

    // Rekursiv funktion til at finde alle børn (hvis man sletter en mappe)
    const findChildren = (parentId: string) => {
      itemsToDelete.push(parentId);
      const children = allItems.filter((i) => i.parentId === parentId);
      children.forEach((child) => findChildren(child.id));
    };

    findChildren(item.id);

    // FIX: Luk fysiske vinduer for alle workspaces der slettes
    for (const id of itemsToDelete) {
      const currentItem = allItems.find((i) => i.id === id);

      // Hvis vi sletter et workspace, skal vi bede baggrunds-scriptet om at lukke vinduerne
      if (currentItem?.type === "workspace") {
        try {
          chrome.runtime.sendMessage({
            type: "DELETE_WORKSPACE_WINDOWS",
            payload: { workspaceId: id },
          });
        } catch (e) {
          // Ignorer fejl hvis extension context er ugyldig (sker sjældent)
          console.warn(
            "Kunne ikke sende lukke-besked til background script",
            e
          );
        }

        // Slet windows-subcollection i Firestore
        const winSnap = await getDocs(
          collection(db, "workspaces_data", id, "windows")
        );
        winSnap.docs.forEach((winDoc) => {
          batch.delete(doc(db, "workspaces_data", id, "windows", winDoc.id));
        });
      }

      // Slet selve itemet
      batch.delete(doc(db, "items", id));
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

  async deleteTab(tab: any, workspaceId: string, windowId: string) {
    console.log(
      `🗑️ [NexusService] deleteTab: ${tab.title} (UID: ${tab.uid}) fra ${workspaceId}/${windowId}`
    );
    const ref =
      windowId === "global" ||
      windowId === "incognito" ||
      workspaceId === "global"
        ? doc(db, "inbox_data", "global")
        : doc(db, "workspaces_data", workspaceId, "windows", windowId);

    const snap = await getDoc(ref);
    if (snap.exists()) {
      const tabs = (snap.data().tabs || []).filter(
        (t: any) => t.uid !== tab.uid
      );
      await updateDoc(ref, { tabs });
      console.log("✅ [NexusService] Tab fjernet fra Firestore.");
    }
  },

  async moveTabBetweenWindows(
    tab: any,
    sourceWorkspaceId: string,
    sourceWindowId: string,
    targetWorkspaceId: string,
    targetWindowId: string
  ) {
    console.log(
      "🚀 [NexusService] START moveTabBetweenWindows (Samme Space logic)"
    );
    const getRef = (wsId: string, winId: string) => {
      if (winId === "global" || winId === "incognito" || wsId === "global") {
        return doc(db, "inbox_data", "global");
      }
      return doc(db, "workspaces_data", wsId, "windows", winId);
    };

    const sourceRef = getRef(sourceWorkspaceId, sourceWindowId);
    const targetRef = getRef(targetWorkspaceId, targetWindowId);

    const tabToMove = {
      ...tab,
      uid: tab.uid || crypto.randomUUID(),
    };

    const batch = writeBatch(db);

    const sourceSnap = await getDoc(sourceRef);
    if (sourceSnap.exists()) {
      const currentTabs = sourceSnap.data().tabs || [];
      const newSourceTabs = currentTabs.filter(
        (t: any) => t.uid !== tabToMove.uid
      );
      batch.update(sourceRef, { tabs: newSourceTabs });
    }

    batch.update(targetRef, { tabs: arrayUnion(tabToMove) });
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
    tabs: any[];
  }) {
    const batch = writeBatch(db);
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
      { tabs: tabsWithUid, lastActive: Date.now(), isActive: true }
    );
    return await batch.commit();
  },
};
