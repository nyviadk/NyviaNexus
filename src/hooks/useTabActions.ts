import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { useCallback } from "react";
import { auth, db } from "../lib/firebase";
import { NexusService } from "../services/nexusService";

import { WinMapping } from "@/background/main";
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
  const handleSidebarTabDrop = useCallback(
    async (targetItem: NexusItem | "global") => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const uid = currentUser.uid;

      const tabJson = window.sessionStorage.getItem("draggedTab");
      if (!tabJson) return;
      const tab = JSON.parse(tabJson) as DraggedTabPayload;

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

      console.log(
        `🎯 [Action] Sidebar Move: From ${sourceWorkspaceId} to ${targetWorkspaceId}`
      );

      setIsProcessingMove(true);
      if (targetItem === "global" && setIsInboxSyncing) setIsInboxSyncing(true);

      try {
        let targetMapping: [number, WinMapping] | null | undefined = null;
        let targetWinId = "global";

        if (targetWorkspaceId !== "global") {
          const snap = await getDocs(
            collection(
              db,
              "users",
              uid,
              "workspaces_data",
              targetWorkspaceId,
              "windows"
            )
          );
          targetWinId = snap.docs[0]?.id || "unknown";
          targetMapping = activeMappings.find(
            ([_, m]) =>
              m.workspaceId === targetWorkspaceId &&
              m.internalWindowId === targetWinId
          );
        }

        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === sourceId
        );

        if (targetMapping && sourceMapping) {
          if (sourceWorkspaceId === targetWorkspaceId) {
            await NexusService.moveTabBetweenWindows(
              tab,
              sourceWorkspaceId,
              sourceId,
              targetWorkspaceId,
              targetWinId
            );
          } else {
            await NexusService.deleteTab(tab, sourceWorkspaceId, sourceId);
          }

          await chrome.tabs.create({
            windowId: targetMapping[0],
            url: tab.url,
            active: true,
          });
          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: {
              uids: [tab.uid],
              internalWindowId: sourceId,
              tabIds: tab.id ? [tab.id] : [],
            },
          });
        } else {
          const batch = writeBatch(db);
          if (!targetMapping) {
            if (targetWorkspaceId === "global") {
              const ref = doc(db, "users", uid, "inbox_data", "global");
              const snap = await getDoc(ref);
              const current = snap.exists() ? snap.data()?.tabs || [] : [];
              batch.set(ref, { tabs: [...current, tab] }, { merge: true });
            } else {
              const snap = await getDocs(
                collection(
                  db,
                  "users",
                  uid,
                  "workspaces_data",
                  targetWorkspaceId,
                  "windows"
                )
              );
              if (!snap.empty) {
                const current = snap.docs[0].data().tabs || [];
                batch.update(snap.docs[0].ref, { tabs: [...current, tab] });
              } else {
                const newWinId = `win_${Date.now()}`;
                const newWinRef = doc(
                  db,
                  "users",
                  uid,
                  "workspaces_data",
                  targetWorkspaceId,
                  "windows",
                  newWinId
                );
                batch.set(newWinRef, {
                  id: newWinId,
                  tabs: [tab],
                  isActive: false,
                  lastActive: serverTimestamp(),
                  createdAt: serverTimestamp(),
                });
              }
            }
          } else {
            await chrome.tabs.create({
              windowId: targetMapping[0],
              url: tab.url,
              active: true,
            });
          }

          if (sourceId === "global") {
            const ref = doc(db, "users", uid, "inbox_data", "global");
            const snap = await getDoc(ref);
            if (snap.exists()) {
              batch.update(ref, {
                tabs: (snap.data()?.tabs || []).filter(
                  (t: TabData) => t.uid !== tab.uid
                ),
              });
            }
          } else {
            const sourceRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              selectedWorkspace?.id || "",
              "windows",
              sourceId
            );
            const snap = await getDoc(sourceRef);
            if (snap.exists()) {
              batch.update(sourceRef, {
                tabs: (snap.data()?.tabs || []).filter(
                  (t: TabData) => t.uid !== tab.uid
                ),
              });
            }
          }
          await batch.commit();
          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: {
              uids: [tab.uid],
              internalWindowId: sourceId,
              tabIds: tab.id ? [tab.id] : [],
            },
          });
        }
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
      const tab = JSON.parse(tabJson) as DraggedTabPayload;

      const sourceWorkspaceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWorkspace?.id || "global";
      const sourceId =
        viewMode === "inbox" || viewMode === "incognito"
          ? "global"
          : selectedWindowId;
      if (!sourceId || sourceId === targetWinId) return;

      setIsProcessingMove(true);
      try {
        const targetMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === targetWinId
        );
        const sourceMapping = activeMappings.find(
          ([_, m]) => m.internalWindowId === sourceId
        );

        if (targetMapping && sourceMapping) {
          await NexusService.moveTabBetweenWindows(
            tab,
            sourceWorkspaceId,
            sourceId,
            selectedWorkspace?.id || "global",
            targetWinId
          );
          const tabs = await chrome.tabs.query({ windowId: sourceMapping[0] });
          const physicalTab = tabs.find(
            (t) => t.id === tab.id || t.url === tab.url
          );
          if (physicalTab?.id)
            await chrome.tabs.move(physicalTab.id, {
              windowId: targetMapping[0],
              index: -1,
            });
        } else {
          const batch = writeBatch(db);
          if (!targetMapping) {
            const targetRef = doc(
              db,
              "users",
              uid,
              "workspaces_data",
              selectedWorkspace?.id || "",
              "windows",
              targetWinId
            );
            const tSnap = await getDoc(targetRef);
            batch.update(targetRef, {
              tabs: [...(tSnap.data()?.tabs || []), tab],
            });
          } else {
            await chrome.tabs.create({
              windowId: targetMapping[0],
              url: tab.url,
              active: true,
            });
          }

          const sourceRef = doc(
            db,
            "users",
            uid,
            "workspaces_data",
            selectedWorkspace?.id || "",
            "windows",
            sourceId
          );
          const sSnap = await getDoc(sourceRef);
          batch.update(sourceRef, {
            tabs: (sSnap.data()?.tabs || []).filter(
              (t: TabData) => t.uid !== tab.uid
            ),
          });

          await batch.commit();
          if (!targetMapping)
            chrome.runtime.sendMessage({
              type: "CLOSE_PHYSICAL_TABS",
              payload: {
                uids: [tab.uid],
                internalWindowId: sourceId,
                tabIds: tab.id ? [tab.id] : [],
              },
            });
        }
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
        const tabIds = runtimeTab.id ? [runtimeTab.id] : [];

        chrome.runtime.sendMessage({
          type: "CLOSE_PHYSICAL_TABS",
          payload: {
            uids: [tab.uid],
            internalWindowId: sId,
            tabIds: tabIds,
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
