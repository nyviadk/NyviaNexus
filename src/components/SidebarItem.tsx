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
}: Props) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const dragCounter = useRef(0);
  const isFolder = item.type === "folder";
  const childItems = allItems.filter((i) => i.parentId === item.id);

  // Find det item der bliver trukket lige nu
  const draggedItem = activeDragId
    ? allItems.find((i) => i.id === activeDragId)
    : null;

  // Bestem om droppet er "ugyldigt" (RØD HIGHLIGHT)
  // Det er ugyldigt hvis:
  // 1. Man dropper på sig selv
  // 2. Man dropper i den mappe, man ALLEREDE ligger i (Parent drop = ingen ændring)
  const isInvalidDrop =
    activeDragId === item.id || draggedItem?.parentId === item.id;

  useEffect(() => {
    if (!activeDragId) {
      setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, [activeDragId]);

  // Hjælpefunktion: Tjek om 'target' faktisk er et barn/barnebarn af 'source'
  const isDescendant = (
    sourceId: string,
    targetId: string,
    items: NexusItem[]
  ) => {
    let current = items.find((i) => i.id === targetId);
    while (current && current.parentId !== "root") {
      if (current.parentId === sourceId) return true;
      current = items.find((i) => i.id === current?.parentId);
    }
    return false;
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Slet "${item.name}"?`)) {
      setIsSyncing(true);
      await NexusService.deleteItem(item, allItems);
      await new Promise((r) => setTimeout(r, 500));
      setIsSyncing(false);
      onRefresh();
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
    e.dataTransfer.setData("itemId", item.id);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => onDragStateChange(item.id), 50);
  };

  const onDragEnd = () => {
    dragCounter.current = 0;
    setIsDragOver(false);
    onDragEndCleanup();
  };

  const onDragEnter = (e: React.DragEvent) => {
    // Tillad drag-over selvom det er invalid, så vi kan vise den røde farve
    if (isFolder) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      setIsDragOver(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (isFolder) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) setIsDragOver(false);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    dragCounter.current = 0;
    setIsDragOver(false);

    // Hvis det ikke er en mappe, eller hvis droppet er ugyldigt (rødt), stop her.
    if (!isFolder || isInvalidDrop) {
      e.preventDefault();
      onDragEndCleanup();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    onDragEndCleanup();

    const draggedId = e.dataTransfer.getData("itemId");
    if (!draggedId) return;

    const sourceItem = allItems.find((i) => i.id === draggedId);
    if (!sourceItem) return;

    // Tjek for hierarki-konflikt (Hvis vi trækker Forælder ned i Barn)
    const isLoop = isDescendant(draggedId, item.id, allItems);

    setIsSyncing(true);
    try {
      if (isLoop) {
        // SMART MOVE: Byt rundt på parent/child forhold
        const sourceOldParentId = sourceItem.parentId;
        await NexusService.moveItem(item.id, sourceOldParentId);
        await NexusService.moveItem(sourceItem.id, item.id);
      } else {
        // NORMAL FLYTNING
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

  return (
    <div className="relative select-none transition-all duration-200">
      <div
        className={`relative z-10 flex items-center gap-2 p-2 rounded-xl mb-1 cursor-grab active:cursor-grabbing transition-all border ${
          isDragOver
            ? isInvalidDrop
              ? "bg-red-900/40 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]" // Rød highlight ved ugyldigt drop
              : "bg-blue-800/60 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)] scale-[1.02]" // Blå highlight ved gyldigt drop
            : "border-transparent hover:bg-slate-700/80 hover:border-slate-600"
        } ${isSyncing ? "opacity-50 pointer-events-none" : ""}`}
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
          <Loader2 size={14} className="animate-spin text-blue-300" />
        ) : isFolder ? (
          isOpen ? (
            <ChevronDown
              size={14}
              className="text-slate-400 transition-transform"
            />
          ) : (
            <ChevronRight
              size={14}
              className="text-slate-400 transition-transform"
            />
          )
        ) : (
          <Layout size={16} className="text-blue-300 shrink-0 shadow-sm" />
        )}

        {isFolder && !isSyncing && (
          <Folder
            size={16}
            className={`${
              isDragOver
                ? isInvalidDrop
                  ? "text-red-400"
                  : "text-blue-300" // Rødt ikon hvis ugyldig, blåt hvis gyldig
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
          <div className="flex gap-1 opacity-0 hover:opacity-100 transition-opacity bg-slate-800/50 rounded-lg px-1">
            {isFolder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    onAddChild?.(item.id, "folder");
                  }}
                  title="Ny mappe"
                  className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-blue-300"
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    onAddChild?.(item.id, "workspace");
                  }}
                  title="Nyt space"
                  className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-blue-300"
                >
                  <Plus size={14} />
                </button>
              </>
            )}
            <button
              onClick={handleRename}
              title="Omdøb"
              className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-blue-300"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={handleDelete}
              title="Slet"
              className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-red-400"
            >
              <Trash2 size={14} />
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
