import { useState } from "react";
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Layout,
  Trash2,
  Edit3,
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
}

export const SidebarItem = ({ item, allItems, onRefresh, onSelect }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const isFolder = item.type === "folder";
  const childItems = allItems.filter((i) => i.parentId === item.id);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Slet "${item.name}"?`)) {
      await NexusService.deleteItem(item, allItems);
      onRefresh();
    }
  };

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = prompt("Nyt navn:", item.name);
    if (newName && newName !== item.name) {
      await NexusService.renameItem(item.id, newName);
      onRefresh();
    }
  };

  const handleClick = async () => {
    if (isFolder) {
      setIsOpen(!isOpen);
    } else {
      // Hvis vi er i Dashboardet, kalder vi onSelect for at opdatere UI
      if (onSelect) {
        onSelect(item);
      } else {
        // Hvis vi er i popup'en, åbner vi vinduerne fysisk
        const winSnap = await getDocs(
          collection(db, "workspaces_data", item.id, "windows")
        );
        const windows = winSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        chrome.runtime.sendMessage({
          type: "OPEN_WORKSPACE",
          payload: { workspaceId: item.id, windows, name: item.name },
        });
      }
    }
  };

  return (
    <div className="select-none">
      <div
        onClick={handleClick}
        className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer group text-sm transition"
      >
        {isFolder ? (
          isOpen ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )
        ) : (
          <Layout size={16} className="text-blue-400" />
        )}
        {isFolder && (
          <Folder size={16} className="text-yellow-500 fill-yellow-500/20" />
        )}
        <span className="flex-1 truncate">{item.name}</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={handleRename} className="p-1 hover:text-blue-400">
            <Edit3 size={14} />
          </button>
          <button onClick={handleDelete} className="p-1 hover:text-red-500">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {isFolder && isOpen && (
        <div className="ml-4 border-l border-slate-800 pl-1 mt-1">
          {childItems.map((child) => (
            <SidebarItem
              key={child.id}
              item={child}
              allItems={allItems}
              onRefresh={onRefresh}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};
