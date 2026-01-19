import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { useCallback } from "react";
import { auth, db } from "../lib/firebase";
import { NexusService } from "../services/nexusService";

import { AiData, WinMapping } from "@/background/main";
import { DraggedTabPayload, RuntimeTabData } from "@/dashboard/types";
import { NexusItem, TabData } from "../types";

export const useTabActions = (
  activeMappings: [number, WinMapping][],
  viewMode: "workspace" | "inbox" | "incognito",
  selectedWorkspace: NexusItem | null,
  selectedWindowId: string | null,
  setIsProcessingMove: (val: boolean) => void,
  setIsInboxSyncing?: (val: boolean) => void
) => {
  /**
   * Helper til at nulstille AI data hvis vi flytter på tværs af spaces
   */
  const prepareTabData = (
    tab: DraggedTabPayload,
    sourceWorkspaceId: string,
    targetWorkspaceId: string
  ): DraggedTabPayload => {
    if (sourceWorkspaceId !== targetWorkspaceId) {
      console.log(
        `🧠 [AI Reset] Moving from ${sourceWorkspaceId} to ${targetWorkspaceId}. Resetting AI status.`
      );
      return {
        ...tab,
        aiData: { status: "pending" } as AiData,
      };
    }
    return tab;
  };

  const handleSidebarTabDrop = useCallback(
    async (targetItem: NexusItem | "global") => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const uid = currentUser.uid;

      const tabJson = window.sessionStorage.getItem("draggedTab");
      if (!tabJson) return;
      const draggedTab = JSON.parse(tabJson) as DraggedTabPayload;

      const targetWorkspaceId =
        targetItem === "global" ? "global" : targetItem.id;
      const sourceWorkspaceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWorkspace?.id || "global";
      const sourceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWindowId || "global";

      const tab = prepareTabData(
        draggedTab,
        sourceWorkspaceId,
        targetWorkspaceId
      );

      setIsProcessingMove(true);
      if (targetItem === "global" && setIsInboxSyncing) setIsInboxSyncing(true);

      try {
        let targetWinId: string | null = null;
        let targetPhysicalWindowId: number | null = null;

        // --- 1. FIND TARGET WINDOW ---
        if (targetWorkspaceId !== "global") {
          const winQuery = query(
            collection(
              db,
              "users",
              uid,
              "workspaces_data",
              targetWorkspaceId,
              "windows"
            ),
            orderBy("createdAt", "asc"),
            limit(1)
          );
          const winSnap = await getDocs(winQuery);
          targetWinId = winSnap.empty
            ? `win_${Date.now()}`
            : winSnap.docs[0].id;

          const mapping = activeMappings.find(
            ([_, m]) =>
              m.workspaceId === targetWorkspaceId &&
              m.internalWindowId === targetWinId
          );
          if (mapping) targetPhysicalWindowId = mapping[0];
        } else {
          targetWinId = "global";
        }

        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === sourceId
        );
        const batch = writeBatch(db);

        // --- 🧹 FORCE CLOSE PHYSICAL INBOX TABS ---
        // Hvis vi flytter FRA Inbox, skal vi ALTID sende lukkebesked hvis tab.id findes.
        // Dette gøres før scenarie-logikken for at undgå at Scenarie D (Storage->Storage) ignorerer fysiske faner.
        if (sourceWorkspaceId === "global") {
          console.log(
            `🗑️ Inbox Clean-up: Requesting close for tab ${tab.id} (UID: ${tab.uid})`
          );
          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: {
              uids: [tab.uid],
              tabIds: [Number(tab.id)],
              internalWindowId: "global",
            },
          });
        }

        // --- 2. EXECUTE MOVE LOGIC ---

        // SCENARIE A: Storage -> Active
        if (!sourceMapping && targetPhysicalWindowId) {
          console.log("🌟 Storage -> Active: Creating physical tab");
          await chrome.tabs.create({
            windowId: targetPhysicalWindowId,
            url: tab.url,
            active: false,
          });
          await NexusService.deleteTab(tab, sourceWorkspaceId, sourceId);
        }

        // SCENARIE B: Active -> Storage
        else if (sourceMapping && !targetPhysicalWindowId) {
          console.log(
            "📦 Active -> Storage: Closing physical & saving to Firestore"
          );

          // Kun send hvis ikke allerede håndteret af Inbox-fixet ovenfor
          if (sourceWorkspaceId !== "global") {
            chrome.runtime.sendMessage({
              type: "CLOSE_PHYSICAL_TABS",
              payload: {
                uids: [tab.uid],
                tabIds: tab.id ? [tab.id] : [],
                internalWindowId: sourceId,
              },
            });
          }

          const targetRef =
            targetWorkspaceId === "global"
              ? doc(db, "users", uid, "inbox_data", "global")
              : doc(
                  db,
                  "users",
                  uid,
                  "workspaces_data",
                  targetWorkspaceId,
                  "windows",
                  targetWinId!
                );

          const tSnap = await getDoc(targetRef);
          const cleanTab = { ...tab };
          delete (cleanTab as any).id;

          if (tSnap.exists()) {
            batch.update(targetRef, {
              tabs: [...(tSnap.data().tabs || []), cleanTab],
            });
          } else {
            batch.set(targetRef, {
              id: targetWinId,
              tabs: [cleanTab],
              isActive: false,
              createdAt: serverTimestamp(),
            });
          }

          const sourceRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            sourceWorkspaceId,
            "windows",
            sourceId
          );
          const sSnap = await getDoc(sourceRef);
          if (sSnap.exists()) {
            batch.update(sourceRef, {
              tabs: (sSnap.data().tabs || []).filter(
                (t: TabData) => t.uid !== tab.uid
              ),
            });
          }
          await batch.commit();
        }

        // SCENARIE C: Active -> Active
        else if (sourceMapping && targetPhysicalWindowId) {
          if (sourceId === targetWinId) return;

          console.log("🚀 Active -> Active: Move processing");

          if (sourceWorkspaceId !== targetWorkspaceId || !tab.id) {
            await chrome.tabs.create({
              windowId: targetPhysicalWindowId,
              url: tab.url,
              active: false,
            });

            if (sourceWorkspaceId !== "global") {
              chrome.runtime.sendMessage({
                type: "CLOSE_PHYSICAL_TABS",
                payload: { uids: [tab.uid], tabIds: tab.id ? [tab.id] : [] },
              });
            }
            await NexusService.deleteTab(tab, sourceWorkspaceId, sourceId);
          } else {
            await chrome.tabs.move(tab.id, {
              windowId: targetPhysicalWindowId,
              index: -1,
            });
            await NexusService.moveTabBetweenWindows(
              tab,
              sourceWorkspaceId,
              sourceId,
              targetWorkspaceId,
              targetWinId!
            );
          }
        }

        // SCENARIE D: Storage -> Storage
        else {
          console.log("☁️ Storage -> Storage: Batch update");
          const targetRef =
            targetWorkspaceId === "global"
              ? doc(db, "users", uid, "inbox_data", "global")
              : doc(
                  db,
                  "users",
                  uid,
                  "workspaces_data",
                  targetWorkspaceId,
                  "windows",
                  targetWinId!
                );

          const sourceRef =
            sourceWorkspaceId === "global"
              ? doc(db, "users", uid, "inbox_data", "global")
              : doc(
                  db,
                  "users",
                  uid,
                  "workspaces_data",
                  sourceWorkspaceId,
                  "windows",
                  sourceId
                );

          const [tSnap, sSnap] = await Promise.all([
            getDoc(targetRef),
            getDoc(sourceRef),
          ]);

          const cleanTab = { ...tab };
          delete (cleanTab as any).id;

          if (tSnap.exists()) {
            batch.update(targetRef, {
              tabs: [...(tSnap.data().tabs || []), cleanTab],
            });
          } else {
            batch.set(targetRef, {
              id: targetWinId,
              tabs: [cleanTab],
              createdAt: serverTimestamp(),
            });
          }

          if (sSnap.exists()) {
            batch.update(sourceRef, {
              tabs: (sSnap.data().tabs || []).filter(
                (t: TabData) => t.uid !== tab.uid
              ),
            });
          }
          await batch.commit();
        }
      } catch (error) {
        console.error("❌ Sidebar drop failed:", error);
      } finally {
        setIsProcessingMove(false);
        if (setIsInboxSyncing) setIsInboxSyncing(false);
        window.sessionStorage.removeItem("draggedTab");
      }
    },
    [
      activeMappings,
      viewMode,
      selectedWindowId,
      selectedWorkspace,
      setIsProcessingMove,
      setIsInboxSyncing,
    ]
  );

  const handleTabDrop = useCallback(
    async (targetWinId: string) => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const uid = currentUser.uid;

      const tabJson = window.sessionStorage.getItem("draggedTab");
      if (!tabJson) return;
      const draggedTab = JSON.parse(tabJson) as DraggedTabPayload;

      const sourceWorkspaceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWorkspace?.id || "global";
      const targetWorkspaceId = selectedWorkspace?.id || "global";
      const sourceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWindowId;

      if (!sourceId || sourceId === targetWinId) return;

      const tab = prepareTabData(
        draggedTab,
        sourceWorkspaceId,
        targetWorkspaceId
      );

      setIsProcessingMove(true);
      try {
        const targetMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === targetWinId
        );
        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === sourceId
        );

        // --- 🧹 FORCE CLOSE PHYSICAL INBOX TABS (GRID) ---
        if (sourceWorkspaceId === "global") {
          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: {
              uids: [tab.uid],
              tabIds: [Number(tab.id)],
              internalWindowId: "global",
            },
          });
        }

        // A: Storage -> Active
        if (!sourceMapping && targetMapping) {
          await chrome.tabs.create({
            windowId: targetMapping[0],
            url: tab.url,
            active: false,
          });
          await NexusService.deleteTab(tab, sourceWorkspaceId, sourceId);
        }
        // B: Active -> Storage
        else if (sourceMapping && !targetMapping) {
          const targetRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            targetWorkspaceId,
            "windows",
            targetWinId
          );
          const sourceRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            sourceWorkspaceId,
            "windows",
            sourceId
          );

          const [tSnap, sSnap] = await Promise.all([
            getDoc(targetRef),
            getDoc(sourceRef),
          ]);
          const batch = writeBatch(db);

          const cleanTab = { ...tab };
          delete (cleanTab as any).id;

          batch.update(targetRef, {
            tabs: [...(tSnap.data()?.tabs || []), cleanTab],
          });
          batch.update(sourceRef, {
            tabs: (sSnap.data()?.tabs || []).filter(
              (t: TabData) => t.uid !== tab.uid
            ),
          });

          if (sourceWorkspaceId !== "global") {
            chrome.runtime.sendMessage({
              type: "CLOSE_PHYSICAL_TABS",
              payload: { uids: [tab.uid], tabIds: tab.id ? [tab.id] : [] },
            });
          }

          await batch.commit();
        }
        // C: Active -> Active
        else if (sourceMapping && targetMapping) {
          console.log("🚀 Active -> Active (Window drop)");
          if (sourceWorkspaceId !== targetWorkspaceId || !tab.id) {
            await chrome.tabs.create({
              windowId: targetMapping[0],
              url: tab.url,
              active: false,
            });

            if (sourceWorkspaceId !== "global") {
              chrome.runtime.sendMessage({
                type: "CLOSE_PHYSICAL_TABS",
                payload: { uids: [tab.uid], tabIds: tab.id ? [tab.id] : [] },
              });
            }
            await NexusService.deleteTab(tab, sourceWorkspaceId, sourceId);
          } else {
            await chrome.tabs.move(tab.id, {
              windowId: targetMapping[0],
              index: -1,
            });
            await NexusService.moveTabBetweenWindows(
              tab,
              sourceWorkspaceId,
              sourceId,
              targetWorkspaceId,
              targetWinId
            );
          }
        }
        // D: Storage -> Storage
        else {
          const batch = writeBatch(db);
          const targetRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            targetWorkspaceId,
            "windows",
            targetWinId
          );
          const sourceRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            sourceWorkspaceId,
            "windows",
            sourceId
          );

          const [tSnap, sSnap] = await Promise.all([
            getDoc(targetRef),
            getDoc(sourceRef),
          ]);

          const cleanTab = { ...tab };
          delete (cleanTab as any).id;

          batch.update(targetRef, {
            tabs: [...(tSnap.data()?.tabs || []), cleanTab],
          });
          batch.update(sourceRef, {
            tabs: (sSnap.data()?.tabs || []).filter(
              (t: TabData) => t.uid !== tab.uid
            ),
          });
          await batch.commit();
        }
      } catch (error) {
        console.error("❌ Tab drop failed:", error);
      } finally {
        setIsProcessingMove(false);
        window.sessionStorage.removeItem("draggedTab");
      }
    },
    [
      activeMappings,
      viewMode,
      selectedWindowId,
      selectedWorkspace,
      setIsProcessingMove,
    ]
  );

  const handleTabDelete = useCallback(
    async (tab: TabData) => {
      if (confirm("Slet tab?")) {
        const sId =
          viewMode === "inbox" || viewMode === "incognito"
            ? "global"
            : selectedWindowId!;
        const runtimeTab = tab as RuntimeTabData;

        chrome.runtime.sendMessage({
          type: "CLOSE_PHYSICAL_TABS",
          payload: {
            uids: [tab.uid],
            internalWindowId: sId,
            tabIds: runtimeTab.id ? [runtimeTab.id] : [],
          },
        });
        await NexusService.deleteTab(
          tab,
          selectedWorkspace?.id || "global",
          sId
        );
      }
    },
    [viewMode, selectedWindowId, selectedWorkspace]
  );

  return { handleSidebarTabDrop, handleTabDrop, handleTabDelete };
};
