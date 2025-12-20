import { db } from "../lib/firebase";
import { writeBatch, doc, collection, getDocs } from "firebase/firestore";
import { NexusItem } from "../types";

export const NexusService = {
  // Sletter et element og alle dets børn rekursivt (Batching)
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
      const currentItem = allItems.find((i) => i.id === id) || item;
      batch.delete(doc(db, "items", id));

      if (currentItem.type === "workspace") {
        const winSnap = await getDocs(
          collection(db, "workspaces_data", id, "windows")
        );
        winSnap.docs.forEach((winDoc) => {
          batch.delete(doc(db, "workspaces_data", id, "windows", winDoc.id));
        });
      }
    }
    await batch.commit();
  },

  // Opretter en mappe eller et workspace (Batching)
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
    const batch = writeBatch(db);
    batch.update(doc(db, "items", id), { name: newName });
    await batch.commit();
  },

  // Bruges til 'Claim Window' funktionen
  async createWorkspace(data: {
    id: string;
    name: string;
    parentId: string;
    profileId: string;
    internalWindowId: string;
    tabs: any[];
  }) {
    const batch = writeBatch(db);
    batch.set(doc(db, "items", data.id), {
      id: data.id,
      name: data.name,
      type: "workspace",
      parentId: data.parentId,
      profileId: data.profileId,
      createdAt: Date.now(),
    });
    batch.set(
      doc(db, "workspaces_data", data.id, "windows", data.internalWindowId),
      {
        tabs: data.tabs,
        lastActive: Date.now(),
        isActive: true,
      }
    );
    await batch.commit();
  },
};
