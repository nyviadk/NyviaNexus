import { useMemo, useState } from "react";
import { NexusItem } from "./types";

export const useSidebarDrag = (displayItems: NexusItem[]) => {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isSyncingRoot, setIsSyncingRoot] = useState(false);
  const [inboxDrag, setInboxDrag] = useState<{
    active: boolean;
    status: "valid" | "invalid" | null;
  }>({ active: false, status: null });
  const [isInboxSyncing, setIsInboxSyncing] = useState(false);

  const draggedItem = useMemo(
    () => (activeDragId ? displayItems.find((i) => i.id === activeDragId) : null),
    [activeDragId, displayItems],
  );
  const isAlreadyAtRoot = draggedItem?.parentId === "root";

  return {
    activeDragId,
    setActiveDragId,
    isDragOverRoot,
    setIsDragOverRoot,
    isSyncingRoot,
    setIsSyncingRoot,
    inboxDrag,
    setInboxDrag,
    isInboxSyncing,
    setIsInboxSyncing,
    draggedItem,
    isAlreadyAtRoot,
  };
};
