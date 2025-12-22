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

  // Tjek om droppet er ugyldigt (f.eks. drop i sig selv eller i egne børn)
  const isInvalidDrop =
    activeDragId === item.id ||
    (activeDragId &&
      allItems.find((i) => i.id === activeDragId)?.parentId === item.id);

  // Sikkerhedsnet: Hvis der ikke dragges noget globalt, så slå hover fra lokalt
  useEffect(() => {
    if (!activeDragId) {
      setIsDragOver(false);
      dragCounter.current = 0;
    }
  }, [activeDragId]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Slet "${item.name}"?`)) {
      setIsSyncing(true);
      await NexusService.deleteItem(item, allItems);
      // Lille kunstig pause for UX feel
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
    // Forsinkelse for at undgå at drag-elementet visuelt forsvinder med det samme
    setTimeout(() => onDragStateChange(item.id), 50);
  };

  const onDragEnd = () => {
    dragCounter.current = 0;
    setIsDragOver(false);
    onDragEndCleanup();
  };

  const onDragEnter = (e: React.DragEvent) => {
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
    // 1. Reset visuelle states med det samme
    dragCounter.current = 0;
    setIsDragOver(false);

    if (!isFolder || isInvalidDrop) {
      e.preventDefault();
      onDragEndCleanup();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    onDragEndCleanup();

    const draggedId = e.dataTransfer.getData("itemId");
    if (draggedId && draggedId !== item.id) {
      setIsSyncing(true);
      try {
        await NexusService.moveItem(draggedId, item.id);
        await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        setIsSyncing(false);
        onRefresh();
      }
    }
  };

  return (
    <div className="relative select-none transition-all duration-200">
      {/* Selve item rækken */}
      <div
        className={`relative z-10 flex items-center gap-2 p-2 rounded-xl mb-1 cursor-grab active:cursor-grabbing transition-all border border-transparent ${
          isDragOver
            ? isInvalidDrop
              ? "bg-red-900/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              : "bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)] scale-[1.02]"
            : "hover:bg-slate-800/80 hover:border-slate-700/50"
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
            // Hvis det er et workspace og vi ikke har onSelect (f.eks. i popup)
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
          <Loader2 size={14} className="animate-spin text-blue-400" />
        ) : isFolder ? (
          isOpen ? (
            <ChevronDown
              size={14}
              className="text-slate-500 transition-transform"
            />
          ) : (
            <ChevronRight
              size={14}
              className="text-slate-500 transition-transform"
            />
          )
        ) : (
          <Layout size={16} className="text-blue-400 shrink-0 shadow-sm" />
        )}

        {isFolder && !isSyncing && (
          <Folder
            size={16}
            className={`${
              isDragOver
                ? isInvalidDrop
                  ? "text-red-400"
                  : "text-blue-400"
                : "text-yellow-500/90"
            } fill-current transition-colors shrink-0`}
          />
        )}

        <span
          className={`flex-1 truncate text-sm font-medium ${
            isSyncing
              ? "italic text-slate-500"
              : "text-slate-300 group-hover:text-slate-200"
          }`}
        >
          {item.name}
        </span>

        {!isSyncing && (
          <div className="flex gap-0.5 opacity-0 hover:opacity-100 transition-opacity">
            {isFolder && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                    onAddChild?.(item.id, "folder");
                  }}
                  title="Ny mappe"
                  className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400"
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
                  className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400"
                >
                  <Plus size={14} />
                </button>
              </>
            )}
            <button
              onClick={handleRename}
              title="Omdøb"
              className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-blue-400"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={handleDelete}
              title="Slet"
              className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Børn Container (Recursive) */}
      {isFolder && isOpen && (
        <div className="ml-5">
          {" "}
          {/* Indrykning */}
          {childItems.length > 0 ? (
            childItems.map((child, index) => {
              const isLastChild = index === childItems.length - 1;
              return (
                <div key={child.id} className="relative pl-4">
                  {" "}
                  {/* Plads til linjerne */}
                  {/* Lodret linje */}
                  <div
                    className="absolute left-0 top-0 w-px bg-slate-800"
                    style={{
                      // Hvis det er sidste barn, stop linjen halvvejs nede (ca 20px nede passer til midt på rækken)
                      // Hvis det IKKE er sidste barn, kør linjen hele vejen ned (100%)
                      height: isLastChild ? "20px" : "100%",
                    }}
                  />
                  {/* Vandret linje (Connector) */}
                  <div className="absolute left-0 top-5 w-4 h-px bg-slate-800" />
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
            // Tom mappe indikator (med "L" linje for at lukke mappen af visuelt)
            <div className="relative pl-4 pt-1">
              <div className="absolute left-0 top-0 w-px h-3.5 bg-slate-800" />
              <div className="absolute left-0 top-3.5 w-3 h-px bg-slate-800" />
              <div className="text-[10px] text-slate-600 pl-2 italic font-light tracking-wide select-none">
                Tom
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
