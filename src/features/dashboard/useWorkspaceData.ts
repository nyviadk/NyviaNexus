import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  db,
} from "@/lib/firebase";
import { useEffect, useMemo, useState } from "react";
import { ArchiveItem, WorkspaceWindow } from "./types";
import { windowOrderCache } from "./utils";
import { User } from "firebase/auth";

export const useWorkspaceData = (
  user: User | null,
  selectedWorkspaceId: string | null,
  viewMode: "workspace" | "inbox" | "incognito",
) => {
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([]);

  // --- Firestore: Window Sync ---
  useEffect(() => {
    if (!user || !selectedWorkspaceId) {
      setWindows([]);
      return;
    }
    const q = query(
      collection(
        db,
        "users",
        user.uid,
        "workspaces_data",
        selectedWorkspaceId,
        "windows",
      ),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(q, (snap) => {
      const w = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WorkspaceWindow[];
      setWindows(w);
    });
  }, [user, selectedWorkspaceId]);

  // --- Firestore: Archive Sync ---
  useEffect(() => {
    if (!user) return;

    let docRef;

    if (viewMode === "inbox" || viewMode === "incognito") {
      docRef = doc(
        db,
        "users",
        user.uid,
        "inbox_data",
        "global",
        "archive_data",
        "list",
      );
    } else if (viewMode === "workspace" && selectedWorkspaceId) {
      docRef = doc(
        db,
        "users",
        user.uid,
        "workspaces_data",
        selectedWorkspaceId,
        "archive_data",
        "list",
      );
    } else {
      setArchiveItems([]);
      return;
    }

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setArchiveItems((data.items || []) as ArchiveItem[]);
      } else {
        setArchiveItems([]);
      }
    });
    return () => unsubscribe();
  }, [user, selectedWorkspaceId, viewMode]);

  // --- Sortering ---
  const sortedWindows = useMemo(() => {
    const getTime = (timestamp: any) => {
      if (!timestamp) return 0;
      if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
      if (typeof timestamp.seconds === "number")
        return timestamp.seconds * 1000;
      return 0;
    };

    return [...windows].sort((a, b) => {
      const isPinnedA =
        (a as WorkspaceWindow & { isPinned?: boolean }).isPinned ??
        a.id === "win_uncategorized";
      const isPinnedB =
        (b as WorkspaceWindow & { isPinned?: boolean }).isPinned ??
        b.id === "win_uncategorized";

      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;

      const createA = getTime(a.createdAt);
      const createB = getTime(b.createdAt);
      return createA - createB;
    });
  }, [windows]);

  const activeWindows = useMemo(
    () => sortedWindows.filter((w) => !w.isArchived),
    [sortedWindows],
  );
  const archivedWindows = useMemo(
    () => sortedWindows.filter((w) => w.isArchived),
    [sortedWindows],
  );

  // --- Window Order Cache ---
  useEffect(() => {
    if (selectedWorkspaceId && activeWindows.length > 0) {
      const normalWindows = activeWindows.filter(
        (w) => w.id !== "win_uncategorized",
      );
      const wsId = selectedWorkspaceId;
      const signature = `${wsId}-${normalWindows.length}-${normalWindows.map((w) => w.id).join("")}`;

      const cached = windowOrderCache.get(wsId);
      if (!cached || cached.signature !== signature) {
        const indices: Record<string, number> = {};
        normalWindows.forEach((w, i) => {
          indices[w.id] = i + 1;
        });
        windowOrderCache.set(wsId, { signature, indices });
      }
    }
  }, [selectedWorkspaceId, activeWindows]);

  // --- Tab count ---
  const totalTabsInSpace = useMemo(
    () => activeWindows.reduce((acc, win) => acc + (win.tabs?.length || 0), 0),
    [activeWindows],
  );

  return {
    windows,
    setWindows,
    archiveItems,
    setArchiveItems,
    sortedWindows,
    activeWindows,
    archivedWindows,
    totalTabsInSpace,
  };
};
