import { useState } from "react";
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
  onDragStateChange?: (isDragging: boolean) => void;
}

export const SidebarItem = ({
  item,
  allItems,
  onRefresh,
  onSelect,
  onAddChild,
  onDragStateChange,
}: Props) => {
  // FIXED: Mapper er åbne som standard
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const isFolder = item.type === "folder";
  const childItems = allItems.filter((i) => i.parentId === item.id);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Slet "${item.name}"?`)) {
      setIsSyncing(true);
      await NexusService.deleteItem(item, allItems);
      await new Promise((r) => setTimeout(r, 500)); // Justeret satisfying delay
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

  const handleAdd = (e: React.MouseEvent, type: "folder" | "workspace") => {
    e.stopPropagation();
    setIsOpen(true);
    if (onAddChild) onAddChild(item.id, type);
  };

  const handleClick = async () => {
    if (isFolder) {
      setIsOpen(!isOpen);
    } else if (onSelect) {
      onSelect(item);
    } else {
      const winSnap = await getDocs(
        collection(db, "workspaces_data", item.id, "windows")
      );
      const windows = winSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      chrome.runtime.sendMessage({
        type: "OPEN_WORKSPACE",
        payload: { workspaceId: item.id, windows, name: item.name },
      });
    }
  };

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("itemId", item.id);
    e.dataTransfer.effectAllowed = "move";
    if (onDragStateChange) setTimeout(() => onDragStateChange(true), 50);
  };

  const onDragEnd = () => {
    if (onDragStateChange) onDragStateChange(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (isFolder) {
      e.preventDefault();
      if (!isDragOver) setIsDragOver(true);
    }
  };

  const onDrop = async (e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const draggedId = e.dataTransfer.getData("itemId");
    if (draggedId && draggedId !== item.id) {
      setIsSyncing(true);
      if (onDragStateChange) onDragStateChange(false);
      try {
        await NexusService.moveItem(draggedId, item.id);
        await new Promise((resolve) => setTimeout(resolve, 500)); // Justeret til 500ms
      } finally {
        setIsSyncing(false);
        onRefresh();
      }
    }
  };

  return (
    <div
      className={`select-none transition-all duration-200 rounded-xl mb-0.5 relative ${
        isDragOver
          ? "bg-blue-600/30 ring-2 ring-blue-500 scale-[1.02] shadow-xl z-10"
          : ""
      } ${isSyncing ? "opacity-50 pointer-events-none" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
    >
      <div
        onClick={handleClick}
        draggable={!isSyncing}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="group flex items-center gap-2 p-2 rounded-xl cursor-grab active:cursor-grabbing transition-colors hover:bg-slate-800/80 text-slate-300 hover:text-white"
      >
        {isSyncing ? (
          <Loader2 size={14} className="animate-spin text-blue-400" />
        ) : isFolder ? (
          isOpen ? (
            <ChevronDown size={14} className="text-slate-500" />
          ) : (
            <ChevronRight size={14} className="text-slate-500" />
          )
        ) : (
          <Layout size={16} className="text-blue-400 shrink-0 shadow-sm" />
        )}
        {isFolder && !isSyncing && (
          <Folder
            size={16}
            className="text-yellow-500 fill-current opacity-90 shrink-0"
          />
        )}
        <span
          className={`flex-1 truncate text-sm font-medium ${
            isSyncing ? "italic text-slate-500" : ""
          }`}
        >
          {item.name}
        </span>

        {!isSyncing && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {isFolder && (
              <>
                <button
                  onClick={(e) => handleAdd(e, "folder")}
                  title="Ny mappe"
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400"
                >
                  <FolderPlus size={14} />
                </button>
                <button
                  onClick={(e) => handleAdd(e, "workspace")}
                  title="Nyt space"
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400"
                >
                  <Plus size={14} />
                </button>
              </>
            )}
            <button
              onClick={handleRename}
              title="Omdøb"
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400"
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={handleDelete}
              title="Slet"
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {isFolder && isOpen && (
        <div className="ml-3 border-l-2 border-slate-800/60 pl-2 mt-0.5 space-y-0.5">
          {childItems.length > 0 ? (
            childItems.map((child) => (
              <SidebarItem
                key={child.id}
                item={child}
                allItems={allItems}
                onRefresh={onRefresh}
                onSelect={onSelect}
                onAddChild={onAddChild}
                onDragStateChange={onDragStateChange}
              />
            ))
          ) : (
            <div className="text-[10px] text-slate-600 p-2 italic font-light tracking-wide">
              Tom mappe
            </div>
          )}
        </div>
      )}
    </div>
  );
};
