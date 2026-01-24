import { getAuth } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import {
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
import React, { useEffect, useRef, useState } from "react";
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
}: Props) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [tabDropStatus, setTabDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Hvis item ikke findes i folderStates (f.eks. første gang), defaulter vi til true (åben)
  const isOpen = folderStates[item.id] ?? true;

  const dragCounter = useRef(0);
  const isFolder = item.type === "folder";
  const childItems = allItems.filter((i) => i.parentId === item.id);

  const draggedItem = activeDragId
    ? allItems.find((i) => i.id === activeDragId)
    : null;
  const isInvalidItemDrop =
    activeDragId === item.id || draggedItem?.parentId === item.id;

  // Reset drag state når drag stopper globalt
  useEffect(() => {
    if (!activeDragId) {
      if (!tabDropStatus) setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, [activeDragId]);

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

    // Vi tjekker kun lokale fysiske vinduer (går lynhurtigt)
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

    // --- BYG BESKEDEN ---
    let message = `Du er ved at slette "${item.name}".\n\n`;

    if (hasActiveWindows) {
      message += `⚠️ ADVARSEL: Dette space er åbent i browseren og vil blive lukket!\n`;
    }

    if (item.type === "workspace") {
      // Standard advarsel for alle workspaces - nemmere og mere sikkert
      message += `⚠️ BEMÆRK: Dette sletter også alt i Arkiv og Noter permanent.\n`;
    }

    if (item.type === "folder" && childItems.length > 0) {
      message += `⚠️ Denne mappe indeholder ${childItems.length} under-elementer som også vil blive slettet.\n`;
    }

    message += `\nSkriv navnet "${item.name}" herunder for at bekræfte:`;

    // --- PROMPT ---
    const userInput = prompt(message);

    if (userInput === item.name) {
      // Korrekt navn -> Slet
      setIsSyncing(true);
      try {
        await NexusService.deleteItem(item, allItems);
        // Lille delay så brugeren når at se loading spinner (UX)
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
      const tabData = JSON.parse(tabJson) as DraggedTabData;
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
      const tabData = JSON.parse(tabJson) as DraggedTabData;
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

  // --- STYLING LOGIK (OPDATERET TIL GRØN/EMERALD) ---
  let containerClasses =
    "relative z-10 flex items-center gap-2 p-2 rounded-xl mb-1 cursor-pointer transition-all border group ";

  if (tabDropStatus === "valid") {
    // GRØN: Validt sted at droppe en fane
    containerClasses +=
      "bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02]";
  } else if (tabDropStatus === "invalid") {
    // RØD: Invalidt sted (mappe eller kilde-space)
    containerClasses +=
      "bg-red-900/40 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] opacity-80 cursor-not-allowed";
  } else if (isDragOver) {
    // GRØN (Eller Rød): Dragging af en mappe/item
    containerClasses += isInvalidItemDrop
      ? "bg-red-900/40 border-red-400"
      : "bg-emerald-900/40 border-emerald-500/50 scale-[1.02]";
  } else {
    // STANDARD: Normal tilstand
    containerClasses +=
      "border-transparent hover:bg-slate-700/80 hover:border-slate-600 active:scale-[0.98]";
  }

  return (
    <div className="relative transition-all duration-200 select-none">
      <div
        className={`${containerClasses} ${
          isSyncing ? "pointer-events-none opacity-50" : ""
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
          if (isFolder) {
            onToggleFolder(item.id, !isOpen);
          } else if (onSelect) onSelect(item);
          else {
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
              className="cursor-pointer text-slate-400 transition-transform"
            />
          ) : (
            <ChevronRight
              size={18}
              className="cursor-pointer text-slate-400 transition-transform"
            />
          )
        ) : (
          <Layout
            size={20}
            className={`${
              tabDropStatus === "valid" ? "text-emerald-400" : "text-blue-300"
            } shrink-0 shadow-sm transition-colors`}
          />
        )}

        {isFolder && !isSyncing && (
          <Folder
            size={20}
            className={`${
              tabDropStatus === "valid" || (isDragOver && !isInvalidItemDrop)
                ? "text-emerald-400"
                : tabDropStatus === "invalid" ||
                    (isDragOver && isInvalidItemDrop)
                  ? "text-red-400"
                  : "text-amber-400"
            } shrink-0 fill-current transition-colors`}
          />
        )}

        <span
          className={`flex-1 truncate text-sm font-medium ${
            isSyncing
              ? "text-slate-400 italic"
              : "text-slate-200 group-hover:text-white"
          }`}
        >
          {item.name}
        </span>

        {!isSyncing && (
          <div className="flex gap-1 rounded-lg border border-slate-700/50 bg-slate-800/80 px-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {isFolder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Sørg for mappen er åben når vi tilføjer noget
                    if (!isOpen) onToggleFolder(item.id, true);
                    onAddChild?.(item.id, "folder");
                  }}
                  title="Ny mappe"
                  className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-blue-300"
                >
                  <FolderPlus size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Sørg for mappen er åben når vi tilføjer noget
                    if (!isOpen) onToggleFolder(item.id, true);
                    onAddChild?.(item.id, "workspace");
                  }}
                  title="Nyt space"
                  className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-blue-300"
                >
                  <Plus size={18} />
                </button>
              </>
            )}
            <button
              onClick={handleRename}
              title="Omdøb"
              className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-blue-300"
            >
              <Edit3 size={18} />
            </button>
            <button
              onClick={handleDelete}
              title="Slet"
              className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-600 hover:text-red-400"
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
                    className="absolute top-0 left-0 w-px bg-slate-400"
                    style={{ height: isLastChild ? "20px" : "100%" }}
                  />
                  <div className="absolute top-5 left-0 h-px w-4 bg-slate-400" />
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
                  />
                </div>
              );
            })
          ) : (
            <div className="relative pt-1 pl-4">
              <div className="absolute top-0 left-0 h-3.5 w-px bg-slate-600" />
              <div className="absolute top-3.5 left-0 h-px w-3 bg-slate-600" />
              <div className="pl-2 text-[10px] font-light tracking-wide text-slate-500 italic select-none">
                Tom
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
