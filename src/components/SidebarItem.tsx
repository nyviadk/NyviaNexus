import { useState, useRef, useEffect } from "react";
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Layout,
  Trash2,
  Edit3,
  Plus,
  FolderPlus,
  Loader2,
} from "lucide-react";
import { NexusItem } from "../types";
import { db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { NexusService } from "../services/nexusService";

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
  onDeleteSuccess?: (deletedId: string) => void; // NY PROP
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
  onDeleteSuccess, // Hent den nye prop
}: Props) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [tabDropStatus, setTabDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const dragCounter = useRef(0);
  const isFolder = item.type === "folder";
  const childItems = allItems.filter((i) => i.parentId === item.id);

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
  }, [activeDragId]);

  const isDescendant = (
    sourceId: string,
    targetId: string,
    items: NexusItem[]
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

    // 1. Tjek om space'et (eller mappen) har aktive vinduer
    let hasActiveWindows = false;
    try {
      const storage = await chrome.storage.local.get("nexus_active_windows");
      const mappings = (storage.nexus_active_windows || []) as any[];

      if (item.type === "workspace") {
        hasActiveWindows = mappings.some(
          ([_, map]: any) => map.workspaceId === item.id
        );
      } else {
        const childIds = allItems
          .filter((i) => i.parentId === item.id)
          .map((i) => i.id);
        hasActiveWindows = mappings.some(([_, map]: any) =>
          childIds.includes(map.workspaceId)
        );
      }
    } catch (err) {
      console.warn("Kunne ikke tjekke aktive vinduer:", err);
    }

    let message = `Slet "${item.name}"?`;
    if (hasActiveWindows) {
      message = `⚠️ ADVARSEL: "${item.name}" har åbne vinduer!\n\nHvis du sletter dette space, vil de tilhørende vinduer blive lukket øjeblikkeligt.\n\nEr du sikker på, du vil fortsætte?`;
    }

    if (confirm(message)) {
      setIsSyncing(true);
      await NexusService.deleteItem(item, allItems);
      await new Promise((r) => setTimeout(r, 500));
      setIsSyncing(false);
      onRefresh();

      // FIX: Fortæl Dashboard at dette ID er væk
      if (onDeleteSuccess) onDeleteSuccess(item.id);
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
    e.dataTransfer.setData("nexus/item-id", item.id);
    e.dataTransfer.setData("itemId", item.id);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => onDragStateChange(item.id), 50);
  };

  const onDragEnd = () => {
    dragCounter.current = 0;
    setIsDragOver(false);
    setTabDropStatus(null);
    onDragEndCleanup();
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;

    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (tabJson) {
      const tabData = JSON.parse(tabJson);
      const isSourceSpace = tabData.sourceWorkspaceId === item.id;

      if (isFolder || isSourceSpace) {
        setTabDropStatus("invalid");
      } else {
        setTabDropStatus("valid");
      }
      return;
    }

    if (isFolder) {
      setIsDragOver(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
      setTabDropStatus(null);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    setTabDropStatus(null);

    // --- TAB DROP HANDLER ---
    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (tabJson) {
      const tabData = JSON.parse(tabJson);
      if (isFolder || tabData.sourceWorkspaceId === item.id) {
        return;
      }

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

    // --- ITEM SORTING HANDLER ---
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
    "relative z-10 flex items-center gap-2 p-2 rounded-xl mb-1 cursor-grab active:cursor-grabbing transition-all border group ";

  if (tabDropStatus === "valid") {
    containerClasses +=
      "bg-blue-800/60 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)] scale-[1.02]";
  } else if (tabDropStatus === "invalid") {
    containerClasses +=
      "bg-red-900/40 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)] opacity-80";
  } else if (isDragOver) {
    containerClasses += isInvalidItemDrop
      ? "bg-red-900/40 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
      : "bg-blue-800/60 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)] scale-[1.02]";
  } else {
    containerClasses +=
      "border-transparent hover:bg-slate-700/80 hover:border-slate-600";
  }

  return (
    <div className="relative select-none transition-all duration-200">
      <div
        className={`${containerClasses} ${
          isSyncing ? "opacity-50 pointer-events-none" : ""
        }`}
        onDragEnter={onDragEnter}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={async (e) => {
          e.stopPropagation();
          if (isFolder) setIsOpen(!isOpen);
          else if (onSelect) onSelect(item);
          else {
            const winSnap = await getDocs(
              collection(db, "workspaces_data", item.id, "windows")
            );
            const windows = winSnap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
            }));
            chrome.runtime.sendMessage({
              type: "OPEN_WORKSPACE",
              payload: { workspaceId: item.id, windows, name: item.name },
            });
          }
        }}
        draggable={!isSyncing}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {isSyncing ? (
          <Loader2 size={18} className="animate-spin text-blue-300" />
        ) : isFolder ? (
          isOpen ? (
            <ChevronDown
              size={18}
              className="text-slate-400 transition-transform cursor-pointer"
            />
          ) : (
            <ChevronRight
              size={18}
              className="text-slate-400 transition-transform cursor-pointer"
            />
          )
        ) : (
          <Layout size={20} className="text-blue-300 shrink-0 shadow-sm" />
        )}

        {isFolder && !isSyncing && (
          <Folder
            size={20}
            className={`${
              tabDropStatus === "valid" || (isDragOver && !isInvalidItemDrop)
                ? "text-blue-300"
                : tabDropStatus === "invalid" ||
                  (isDragOver && isInvalidItemDrop)
                ? "text-red-400"
                : "text-amber-400"
            } fill-current transition-colors shrink-0`}
          />
        )}

        <span
          className={`flex-1 truncate text-sm font-medium ${
            isSyncing
              ? "italic text-slate-400"
              : "text-slate-200 group-hover:text-white"
          }`}
        >
          {item.name}
        </span>

        {!isSyncing && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800/50 rounded-lg px-1">
            {isFolder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    onAddChild?.(item.id, "folder");
                  }}
                  title="Ny mappe"
                  className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-blue-300 cursor-pointer"
                >
                  <FolderPlus size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    onAddChild?.(item.id, "workspace");
                  }}
                  title="Nyt space"
                  className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-blue-300 cursor-pointer"
                >
                  <Plus size={18} />
                </button>
              </>
            )}
            <button
              onClick={handleRename}
              title="Omdøb"
              className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-blue-300 cursor-pointer"
            >
              <Edit3 size={18} />
            </button>
            <button
              onClick={handleDelete}
              title="Slet"
              className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-red-400 cursor-pointer"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>

      {isFolder && isOpen && (
        <div className="ml-5">
          {childItems.length > 0 ? (
            childItems.map((child, index) => {
              const isLastChild = index === childItems.length - 1;
              return (
                <div key={child.id} className="relative pl-4">
                  <div
                    className="absolute left-0 top-0 w-px bg-slate-600"
                    style={{
                      height: isLastChild ? "20px" : "100%",
                    }}
                  />
                  <div className="absolute left-0 top-5 w-4 h-px bg-slate-600" />

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
                  />
                </div>
              );
            })
          ) : (
            <div className="relative pl-4 pt-1">
              <div className="absolute left-0 top-0 w-px h-3.5 bg-slate-600" />
              <div className="absolute left-0 top-3.5 w-3 h-px bg-slate-600" />
              <div className="text-[10px] text-slate-500 pl-2 italic font-light tracking-wide select-none">
                Tom
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
