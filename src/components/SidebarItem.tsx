import { getAuth } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Edit3,
  Folder,
  FolderPlus,
  Layout,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../lib/firebase";
import { NexusService } from "../services/nexusService";
import { NexusItem } from "../types";

// --- TYPES ---

interface DraggedTabData {
  sourceWorkspaceId: string;
}

interface WindowMappingLite {
  workspaceId: string;
}

interface Props {
  item: NexusItem;
  allItems: NexusItem[];
  onRefresh: () => void;
  onSelect?: (item: NexusItem) => void;
  onAddChild?: (parentId: string, type: "folder" | "workspace") => void;
  onDragStateChange: (id: string | null) => void;
  onDragEndCleanup: () => void;
  activeDragId: string | null;
  onTabDrop?: (targetItem: NexusItem) => Promise<void>;
  onDeleteSuccess?: (deletedId: string) => void;
  folderStates: Record<string, boolean>;
  onToggleFolder: (id: string, isOpen: boolean) => void;
  isReordering: boolean;
  onMoveItem: (id: string, direction: "up" | "down") => void;
  isFirst?: boolean;
  isLast?: boolean;
  activeWorkspaceId?: string | null;
}

export const SidebarItem = ({
  item,
  allItems,
  onRefresh,
  onSelect,
  onAddChild,
  onDragStateChange,
  onDragEndCleanup,
  activeDragId,
  onTabDrop,
  onDeleteSuccess,
  folderStates,
  onToggleFolder,
  isReordering,
  onMoveItem,
  isFirst = false,
  isLast = false,
  activeWorkspaceId = null,
}: Props) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [tabDropStatus, setTabDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- ANIMATION HOOK ---
  const [animationParent] = useAutoAnimate();

  const isOpen = folderStates[item.id] ?? true;
  const isActive = item.id === activeWorkspaceId;

  const dragCounter = useRef(0);
  const isFolder = item.type === "folder";

  // SORTERING AF BØRN
  const childItems = useMemo(() => {
    return allItems
      .filter((i) => i.parentId === item.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [allItems, item.id]);

  const draggedItem = activeDragId
    ? allItems.find((i) => i.id === activeDragId)
    : null;
  const isInvalidItemDrop =
    activeDragId === item.id || draggedItem?.parentId === item.id;

  useEffect(() => {
    if (!activeDragId) {
      if (!tabDropStatus) setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, [activeDragId, tabDropStatus]);

  const isDescendant = (
    sourceId: string,
    targetId: string,
    items: NexusItem[],
  ) => {
    let current = items.find((i) => i.id === targetId);
    while (current && current.parentId !== "root") {
      if (current.parentId === sourceId) return true;
      const parent = items.find((i) => i.id === current?.parentId);
      if (!parent) break;
      current = parent;
    }
    return false;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    let hasActiveWindows = false;
    try {
      const storage = await chrome.storage.local.get("nexus_active_windows");
      const mappings = (storage.nexus_active_windows || []) as [
        number,
        WindowMappingLite,
      ][];

      if (item.type === "workspace") {
        hasActiveWindows = mappings.some(
          ([_, map]) => map.workspaceId === item.id,
        );
      } else {
        const childIds = allItems
          .filter((i) => i.parentId === item.id)
          .map((i) => i.id);
        hasActiveWindows = mappings.some(([_, map]) =>
          childIds.includes(map.workspaceId),
        );
      }
    } catch (err) {
      console.warn("Kunne ikke tjekke aktive vinduer:", err);
    }

    let message = `Du er ved at slette "${item.name}".\n\n`;
    if (hasActiveWindows) {
      message += `⚠️ ADVARSEL: Dette space er åbent i browseren og vil blive lukket!\n`;
    }
    if (item.type === "workspace") {
      message += `⚠️ BEMÆRK: Dette sletter også alt i Arkiv og Noter permanent.\n`;
    }
    if (item.type === "folder" && childItems.length > 0) {
      message += `⚠️ Denne mappe indeholder ${childItems.length} under-elementer som også vil blive slettet.\n`;
    }
    message += `\nSkriv navnet "${item.name}" herunder for at bekræfte:`;

    const userInput = prompt(message);
    if (userInput === item.name) {
      setIsSyncing(true);
      try {
        await NexusService.deleteItem(item, allItems);
        await new Promise((r) => setTimeout(r, 500));
        onRefresh();
        if (onDeleteSuccess) onDeleteSuccess(item.id);
      } catch (error) {
        console.error("Delete failed", error);
        alert("Der skete en fejl under sletning.");
      } finally {
        setIsSyncing(false);
      }
    } else if (userInput !== null) {
      alert("Navnet matchede ikke. Sletning annulleret.");
    }
  };

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt("Nyt navn:", item.name);
    if (newName && newName !== item.name) {
      setIsSyncing(true);
      await NexusService.renameItem(item.id, newName);
      await new Promise((r) => setTimeout(r, 500));
      setIsSyncing(false);
      onRefresh();
    }
  };

  const onDragStart = (e: React.DragEvent) => {
    if (isReordering) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("nexus/item-id", item.id);
    e.dataTransfer.setData("itemId", item.id);
    e.dataTransfer.effectAllowed = "move";
    requestAnimationFrame(() => onDragStateChange(item.id));
  };

  const onDragEnd = () => {
    dragCounter.current = 0;
    setIsDragOver(false);
    setTabDropStatus(null);
    onDragEndCleanup();
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (isReordering) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;

    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (tabJson) {
      const tabData = JSON.parse(tabJson) as DraggedTabData;
      const isSourceSpace = tabData.sourceWorkspaceId === item.id;
      if (isFolder || isSourceSpace) {
        setTabDropStatus("invalid");
      } else {
        setTabDropStatus("valid");
      }
      setIsDragOver(true);
      return;
    }
    if (isFolder) setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (isReordering) return;
    e.preventDefault();
    e.stopPropagation();

    const currentTarget = e.currentTarget;
    const relatedTarget = e.relatedTarget as Node;
    if (currentTarget.contains(relatedTarget)) {
      return;
    }

    dragCounter.current--;
    setIsDragOver(false);
    setTabDropStatus(null);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (isReordering) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = async (e: React.DragEvent) => {
    if (isReordering) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    setTabDropStatus(null);

    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (tabJson) {
      const tabData = JSON.parse(tabJson) as DraggedTabData;
      if (isFolder || tabData.sourceWorkspaceId === item.id) return;

      if (onTabDrop) {
        setIsSyncing(true);
        try {
          await onTabDrop(item);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } finally {
          setIsSyncing(false);
        }
      }
      return;
    }

    if (!isFolder || isInvalidItemDrop) {
      onDragEndCleanup();
      return;
    }

    onDragEndCleanup();
    const draggedId =
      e.dataTransfer.getData("nexus/item-id") ||
      e.dataTransfer.getData("itemId");
    if (!draggedId) return;

    const sourceItem = allItems.find((i) => i.id === draggedId);
    if (!sourceItem) return;

    const isLoop = isDescendant(draggedId, item.id, allItems);

    setIsSyncing(true);
    try {
      if (isLoop) {
        const sourceOldParentId = sourceItem.parentId;
        await NexusService.moveItem(item.id, sourceOldParentId);
        await NexusService.moveItem(sourceItem.id, item.id);
      } else {
        if (draggedId !== item.id) {
          await NexusService.moveItem(draggedId, item.id);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error("Fejl ved flytning:", error);
      alert("Der skete en fejl ved flytning af mappen.");
    } finally {
      setIsSyncing(false);
      onRefresh();
    }
  };

  let containerClasses =
    "relative z-10 flex items-center gap-2 p-2 rounded-xl mb-1 transition-all border group ";

  if (isReordering) {
    containerClasses +=
      "cursor-default border-dashed border-strong bg-surface-elevated/40 ";
  } else {
    containerClasses += "cursor-pointer ";
    if (tabDropStatus === "valid") {
      containerClasses += "bg-success/20 border-success scale-[1.02]";
    } else if (tabDropStatus === "invalid") {
      containerClasses +=
        "bg-danger/20 border-danger opacity-80 cursor-not-allowed";
    } else if (isDragOver) {
      containerClasses += isInvalidItemDrop
        ? "bg-danger/20 border-danger"
        : "bg-success/20 border-success scale-[1.02]";
    } else if (isActive) {
      // AKTIV: Bruger nu action-tokens for at matche temaets accentfarve.
      containerClasses += "bg-action/10 border-action";
    } else {
      containerClasses +=
        "border-transparent hover:bg-surface-hover hover:border-strong active:scale-[0.98]";
    }
  }

  return (
    <div className="relative transition-all duration-200 select-none">
      <div
        className={`${containerClasses} ${
          isSyncing ? "pointer-events-none opacity-50" : ""
        }`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={async (e) => {
          e.stopPropagation();
          if (isFolder) {
            onToggleFolder(item.id, !isOpen);
          } else if (!isReordering && onSelect) {
            onSelect(item);
          } else if (!isReordering && !onSelect) {
            const auth = getAuth();
            const currentUser = auth.currentUser;
            if (!currentUser) return;
            try {
              const winSnap = await getDocs(
                collection(
                  db,
                  "users",
                  currentUser.uid,
                  "workspaces_data",
                  item.id,
                  "windows",
                ),
              );
              const windows = winSnap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }));
              chrome.runtime.sendMessage({
                type: "OPEN_WORKSPACE",
                payload: { workspaceId: item.id, windows, name: item.name },
              });
            } catch (err) {
              console.error("Fejl ved åbning af workspace:", err);
            }
          }
        }}
        draggable={!isSyncing && !isReordering}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {isSyncing ? (
          <Loader2
            size={18}
            className="pointer-events-none animate-spin text-action"
          />
        ) : isFolder ? (
          isOpen ? (
            <ChevronDown
              size={18}
              className={`pointer-events-none cursor-pointer transition-transform ${isActive ? "text-action" : "text-low group-hover:text-high"}`}
            />
          ) : (
            <ChevronRight
              size={18}
              className={`pointer-events-none cursor-pointer transition-transform ${isActive ? "text-action" : "text-low group-hover:text-high"}`}
            />
          )
        ) : (
          <Layout
            size={20}
            className={`${
              tabDropStatus === "valid"
                ? "text-success"
                : isActive
                  ? "text-action"
                  : "text-mode-workspace"
            } pointer-events-none shrink-0 transition-colors`}
          />
        )}

        {isFolder && !isSyncing && (
          <Folder
            size={20}
            className={`${
              tabDropStatus === "valid" || (isDragOver && !isInvalidItemDrop)
                ? "text-success"
                : tabDropStatus === "invalid" ||
                    (isDragOver && isInvalidItemDrop)
                  ? "text-danger"
                  : "text-warning"
            } pointer-events-none shrink-0 fill-current transition-colors`}
          />
        )}

        <span
          className={`pointer-events-none flex-1 truncate text-sm font-medium ${
            isSyncing
              ? "text-low italic"
              : isActive
                ? "text-high"
                : "text-medium group-hover:text-high"
          }`}
        >
          {item.name}
        </span>

        {!isSyncing && (
          <div
            className={`flex gap-1 rounded-lg border border-subtle bg-surface-elevated/80 px-1 shadow-sm backdrop-blur-sm transition-opacity ${
              isReordering ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            {isReordering ? (
              <>
                {!isFirst ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveItem(item.id, "up");
                    }}
                    className="cursor-pointer rounded p-1 text-low hover:bg-surface-hover hover:text-high"
                  >
                    <ArrowUp size={16} />
                  </button>
                ) : (
                  <div className="w-6.5" />
                )}
                {!isLast ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveItem(item.id, "down");
                    }}
                    className="cursor-pointer rounded p-1 text-low hover:bg-surface-hover hover:text-high"
                  >
                    <ArrowDown size={16} />
                  </button>
                ) : (
                  <div className="w-6.5" />
                )}
              </>
            ) : (
              <>
                {isFolder && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isOpen) onToggleFolder(item.id, true);
                        onAddChild?.(item.id, "folder");
                      }}
                      className="cursor-pointer rounded p-1 text-low hover:bg-surface-hover hover:text-action"
                    >
                      <FolderPlus size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isOpen) onToggleFolder(item.id, true);
                        onAddChild?.(item.id, "workspace");
                      }}
                      className="cursor-pointer rounded p-1 text-low hover:bg-surface-hover hover:text-action"
                    >
                      <Plus size={18} />
                    </button>
                  </>
                )}
                <button
                  onClick={handleRename}
                  className="cursor-pointer rounded p-1 text-low hover:bg-surface-hover hover:text-action"
                >
                  <Edit3 size={18} />
                </button>
                <button
                  onClick={handleDelete}
                  className="cursor-pointer rounded p-1 text-low hover:bg-surface-hover hover:text-danger"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isFolder && isOpen && (
        <div ref={animationParent} className="ml-5">
          {childItems.length > 0 ? (
            childItems.map((child, index) => {
              const isLastChild = index === childItems.length - 1;
              const isFirstChild = index === 0;

              return (
                <div key={child.id} className="relative pl-4">
                  <div
                    className="absolute top-0 left-0 w-px bg-strong"
                    style={{ height: isLastChild ? "20px" : "100%" }}
                  />
                  <div className="absolute top-5 left-0 h-px w-4 bg-strong" />
                  <SidebarItem
                    item={child}
                    allItems={allItems}
                    onRefresh={onRefresh}
                    onSelect={onSelect}
                    onAddChild={onAddChild}
                    onDragStateChange={onDragStateChange}
                    onDragEndCleanup={onDragEndCleanup}
                    activeDragId={activeDragId}
                    onTabDrop={onTabDrop}
                    onDeleteSuccess={onDeleteSuccess}
                    folderStates={folderStates}
                    onToggleFolder={onToggleFolder}
                    isReordering={isReordering}
                    onMoveItem={onMoveItem}
                    isFirst={isFirstChild}
                    isLast={isLastChild}
                    activeWorkspaceId={activeWorkspaceId}
                  />
                </div>
              );
            })
          ) : (
            <div className="relative pt-1 pl-4">
              <div className="absolute top-0 left-0 h-3.5 w-px bg-strong" />
              <div className="absolute top-3.5 left-0 h-px w-3 bg-strong" />
              <div className="pl-2 text-[10px] font-light tracking-wide text-low italic select-none">
                Tom
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
