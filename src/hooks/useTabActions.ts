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
  updateDoc,
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
  setIsInboxSyncing?: (val: boolean) => void,
) => {
  /**
   * Helper til at nulstille AI data hvis vi flytter på tværs af spaces
   */
  const prepareTabData = (
    tab: DraggedTabPayload,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
  ): DraggedTabPayload => {
    if (sourceWorkspaceId !== targetWorkspaceId) {
      console.log(
        `🧠 [AI Reset] Moving from ${sourceWorkspaceId} to ${targetWorkspaceId}. Resetting AI status.`,
      );
      return {
        ...tab,
        aiData: { status: "pending" } as AiData,
        isIncognito: false,
      };
    }
    return tab;
  };

  const getCleanData = (tab: DraggedTabPayload): TabData => {
    const { uid, title, url, favIconUrl, isIncognito, aiData } = tab;
    return {
      uid,
      title,
      url,
      favIconUrl: favIconUrl || "",
      isIncognito: !!isIncognito,
      aiData: aiData || { status: "pending" },
    };
  };

  const forceQueueIfMoving = (
    tab: DraggedTabPayload,
    sourceWorkspaceId: string,
    targetWorkspaceId: string,
    workspaceName?: string,
  ) => {
    if (sourceWorkspaceId !== targetWorkspaceId && tab.id) {
      chrome.runtime.sendMessage({
        type: "FORCE_QUEUE_TAB",
        payload: {
          uid: tab.uid,
          url: tab.url,
          title: tab.title,
          tabId: Number(tab.id),
          workspaceName: workspaceName || "Unknown",
        },
      });
    }
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
        targetWorkspaceId,
      );
      const cleanedTab = getCleanData(tab);

      setIsProcessingMove(true);
      if (targetItem === "global" && setIsInboxSyncing) setIsInboxSyncing(true);

      try {
        let targetWinId: string | null = null;
        let targetPhysicalWindowId: number | null = null;
        let targetWorkspaceName = "Inbox";

        // --- 1. FIND TARGET WINDOW ---
        if (targetWorkspaceId !== "global") {
          const winQuery = query(
            collection(
              db,
              "users",
              uid,
              "workspaces_data",
              targetWorkspaceId,
              "windows",
            ),
            orderBy("createdAt", "asc"),
            limit(1),
          );
          const winSnap = await getDocs(winQuery);
          targetWinId = winSnap.empty
            ? `win_${Date.now()}`
            : winSnap.docs[0].id;

          const mapping = activeMappings.find(
            ([_, m]) =>
              m.workspaceId === targetWorkspaceId &&
              m.internalWindowId === targetWinId,
          );
          if (mapping) {
            targetPhysicalWindowId = mapping[0];
            targetWorkspaceName = mapping[1].workspaceName;
          } else {
            // Hvis target er et workspace, men ikke åbent, find navnet
            if (typeof targetItem !== "string") {
              targetWorkspaceName = targetItem.name;
            }
          }
        } else {
          targetWinId = "global";
        }

        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === sourceId,
        );
        const batch = writeBatch(db);

        // Send FORCE AI besked hvis vi skifter workspace
        forceQueueIfMoving(
          draggedTab,
          sourceWorkspaceId,
          targetWorkspaceId,
          targetWorkspaceName,
        );

        // --- 🧹 FORCE CLOSE PHYSICAL INBOX TABS ---
        // Hvis vi flytter FRA Inbox, skal vi ALTID sende lukkebesked hvis tab.id findes.
        // Dette gøres før scenarie-logikken for at undgå at Scenarie D (Storage->Storage) ignorerer fysiske faner.

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
        // --- ⚡ QUICK-FLIP LOGIK (Incognito -> Inbox i Global) ---
        // Vi bruger updateDoc direkte for at undgå manglende metode i NexusService
        if (
          sourceWorkspaceId === "global" &&
          targetWorkspaceId === "global" &&
          draggedTab.isIncognito
        ) {
          setIsProcessingMove(true);
          try {
            const globalRef = doc(db, "users", uid, "inbox_data", "global");
            const snap = await getDoc(globalRef);
            if (snap.exists()) {
              const tabs = (snap.data().tabs || []) as TabData[];
              const updatedTabs = tabs.map((t) =>
                t.uid === draggedTab.uid ? { ...t, isIncognito: false } : t,
              );
              await updateDoc(globalRef, { tabs: updatedTabs });
            }
            return;
          } catch (e) {
            console.error("❌ Quick-flip failed:", e);
          } finally {
            setIsProcessingMove(false);
            window.sessionStorage.removeItem("draggedTab");
          }
          return;
        }
        // --- 2. EXECUTE MOVE LOGIC ---

        // SCENARIE A: Storage -> Active
        if (!sourceMapping && targetPhysicalWindowId) {
          await chrome.tabs.create({
            windowId: targetPhysicalWindowId,
            url: tab.url,
            active: false,
          });
          await NexusService.deleteTab(cleanedTab, sourceWorkspaceId, sourceId);
        }
        // SCENARIE B: Active -> Storage
        else if (sourceMapping && !targetPhysicalWindowId) {
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
                  targetWinId!,
                );
          const tSnap = await getDoc(targetRef);
          if (tSnap.exists()) {
            batch.update(targetRef, {
              tabs: [...(tSnap.data().tabs || []), cleanedTab],
            });
          } else {
            batch.set(targetRef, {
              id: targetWinId,
              tabs: [cleanedTab],
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
            sourceId,
          );
          const sSnap = await getDoc(sourceRef);
          if (sSnap.exists()) {
            batch.update(sourceRef, {
              tabs: (sSnap.data().tabs || []).filter(
                (t: TabData) => t.uid !== tab.uid,
              ),
            });
          }
          await batch.commit();
        }
        // SCENARIE C: Active -> Active
        else if (sourceMapping && targetPhysicalWindowId) {
          if (sourceId === targetWinId) return;
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
            await NexusService.deleteTab(
              cleanedTab,
              sourceWorkspaceId,
              sourceId,
            );
          } else {
            await chrome.tabs.move(tab.id, {
              windowId: targetPhysicalWindowId,
              index: -1,
            });
            await NexusService.moveTabBetweenWindows(
              cleanedTab,
              sourceWorkspaceId,
              sourceId,
              targetWorkspaceId,
              targetWinId,
            );
          }
        }
        // SCENARIE D: Storage -> Storage
        else {
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
                  targetWinId,
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
                  sourceId,
                );
          const [tSnap, sSnap] = await Promise.all([
            getDoc(targetRef),
            getDoc(sourceRef),
          ]);
          if (tSnap.exists()) {
            batch.update(targetRef, {
              tabs: [...(tSnap.data().tabs || []), cleanedTab],
            });
          } else {
            batch.set(targetRef, {
              id: targetWinId,
              tabs: [cleanedTab],
              createdAt: serverTimestamp(),
            });
          }
          if (sSnap.exists()) {
            batch.update(sourceRef, {
              tabs: (sSnap.data().tabs || []).filter(
                (t: TabData) => t.uid !== tab.uid,
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
    ],
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
        targetWorkspaceId,
      );
      const cleanedTab = getCleanData(tab);

      setIsProcessingMove(true);
      try {
        const targetMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === targetWinId,
        );
        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === sourceId,
        );

        let targetWorkspaceName = "Inbox";
        if (targetMapping) targetWorkspaceName = targetMapping[1].workspaceName;

        forceQueueIfMoving(
          draggedTab,
          sourceWorkspaceId,
          targetWorkspaceId,
          targetWorkspaceName,
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
          await NexusService.deleteTab(cleanedTab, sourceWorkspaceId, sourceId);
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
            targetWinId,
          );
          const sourceRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            sourceWorkspaceId,
            "windows",
            sourceId,
          );
          const [tSnap, sSnap] = await Promise.all([
            getDoc(targetRef),
            getDoc(sourceRef),
          ]);
          const batch = writeBatch(db);
          batch.update(targetRef, {
            tabs: [...(tSnap.data()?.tabs || []), cleanedTab],
          });
          batch.update(sourceRef, {
            tabs: (sSnap.data()?.tabs || []).filter(
              (t: TabData) => t.uid !== tab.uid,
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
            await NexusService.deleteTab(
              cleanedTab,
              sourceWorkspaceId,
              sourceId,
            );
          } else {
            await chrome.tabs.move(tab.id, {
              windowId: targetMapping[0],
              index: -1,
            });
            await NexusService.moveTabBetweenWindows(
              cleanedTab,
              sourceWorkspaceId,
              sourceId,
              targetWorkspaceId,
              targetWinId,
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
            targetWinId,
          );
          const sourceRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            sourceWorkspaceId,
            "windows",
            sourceId,
          );
          const [tSnap, sSnap] = await Promise.all([
            getDoc(targetRef),
            getDoc(sourceRef),
          ]);
          batch.update(targetRef, {
            tabs: [...(tSnap.data()?.tabs || []), cleanedTab],
          });
          batch.update(sourceRef, {
            tabs: (sSnap.data()?.tabs || []).filter(
              (t: TabData) => t.uid !== tab.uid,
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
    ],
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
          sId,
        );
      }
    },
    [viewMode, selectedWindowId, selectedWorkspace],
  );
  // --- Handle Consume (Open & Remove from List ONLY IF INBOX) ---
  const handleTabConsume = useCallback(
    async (tab: TabData) => {
      // 1. Tjek om vi er i Inbox (Global)
      const isInbox = viewMode === "inbox" || viewMode === "incognito";

      // Hvis vi IKKE er i inbox (dvs. vi er i et workspace), så skal vi IKKE slette fanen.
      // Den skal blive stående i listen som en gemt fane i workspacet.
      if (!isInbox) {
        return;
      }

      // 2. Hvis vi er i Inbox, så slet den fra listen (Consume)
      try {
        // For Inbox er både workspaceId og windowId "global"
        await NexusService.deleteTab(tab, "global", "global");
        console.log("✅ Tab consumed (removed from Inbox):", tab.title);
      } catch (err) {
        console.error("❌ Failed to consume tab:", err);
      }
    },
    [viewMode],
  );

  return {
    handleSidebarTabDrop,
    handleTabDrop,
    handleTabDelete,
    handleTabConsume,
  };
};
