import { useEffect, useRef } from "react";
import { NexusItem, WorkspaceWindow } from "./types";

export const useDeepLinking = (
  items: NexusItem[],
  selectedWorkspaceId: string | null,
  activeWindows: WorkspaceWindow[],
  viewMode: "workspace" | "inbox" | "incognito",
  selectedWindowId: string | null,
  setViewMode: (mode: "workspace" | "inbox" | "incognito") => void,
  setSelectedWindowId: (id: string | null) => void,
  setNotesModalTarget: (target: { id: string; name: string } | null) => void,
  handleWorkspaceClick: (item: NexusItem, specificWindowId?: string) => void,
) => {
  const hasLoadedUrlParams = useRef(false);

  // --- URL PARAMS & DEEP LINKING LOGIC ---
  useEffect(() => {
    if (items.length > 0 && !hasLoadedUrlParams.current) {
      const params = new URLSearchParams(window.location.search);

      const wsId = params.get("workspaceId");
      const winId = params.get("windowId");
      const noteSpaceId = params.get("noteSpace");
      const viewParam = params.get("view");

      // 0. Håndter direkte genstart/restore af Inbox og Incognito
      if (viewParam === "inbox") setViewMode("inbox");
      if (viewParam === "incognito") setViewMode("incognito");

      // 1. Håndter Deep Link til Noter
      if (noteSpaceId) {
        if (noteSpaceId === "global") {
          setNotesModalTarget({ id: "global", name: "Inbox" });
        } else {
          const noteWs = items.find((i) => i.id === noteSpaceId);
          if (noteWs) {
            setNotesModalTarget({ id: noteWs.id, name: noteWs.name });
          }
        }
      }

      // 2. Håndter normal navigation til Workspaces
      if (wsId) {
        const targetWs = items.find((i) => i.id === wsId);
        if (targetWs && selectedWorkspaceId !== targetWs.id) {
          handleWorkspaceClick(targetWs, winId || undefined);
        }
      }

      // RYD URL STRAKS
      if (wsId || noteSpaceId || viewParam) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("noteSpace");
        newUrl.searchParams.delete("workspaceId");
        newUrl.searchParams.delete("windowId");
        newUrl.searchParams.delete("view");
        window.history.replaceState({}, "", newUrl.toString());
      }

      hasLoadedUrlParams.current = true;
    }
  }, [items, selectedWorkspaceId, handleWorkspaceClick]);

  // Denne effekt sikrer at vi vælger et standard vindue hvis intet er valgt
  useEffect(() => {
    if (
      selectedWorkspaceId &&
      viewMode === "workspace" &&
      activeWindows.length > 0 &&
      !selectedWindowId
    ) {
      if (!hasLoadedUrlParams.current) return;

      const params = new URLSearchParams(window.location.search);
      const preselect = params.get("windowId");

      if (preselect && activeWindows.some((w) => w.id === preselect))
        setSelectedWindowId(preselect);
      else if (activeWindows[0]?.id) setSelectedWindowId(activeWindows[0].id);
    }
  }, [activeWindows, selectedWorkspaceId, viewMode, selectedWindowId]);
};
