import { WinMapping } from "@/background/main";
import { ArchiveItem } from "@/types";
import {
  Archive,
  Link as LinkIcon,
  NotebookPen,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { NexusService } from "../../services/nexusService";

interface ArchiveSidebarProps {
  workspaceId: string;
  items: ArchiveItem[];
  activeMappings: [number, WinMapping][];
  onOpenNotes: () => void; // Ny prop til at åbne modalen
}

export const ArchiveSidebar: React.FC<ArchiveSidebarProps> = ({
  workspaceId,
  items,
  activeMappings,
  onOpenNotes,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const getFaviconUrl = (url: string) => {
    try {
      const u = new URL(chrome.runtime.getURL("/_favicon/"));
      u.searchParams.set("pageUrl", url);
      u.searchParams.set("size", "32");
      return u.toString();
    } catch (e) {
      return "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setIsAdding(true);
    try {
      await NexusService.addArchiveItem(workspaceId, inputValue);
      setInputValue("");
    } catch (err) {
      console.error("Failed to add archive link", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleItemClick = async (url: string) => {
    const workspaceWindowIds = activeMappings
      .filter(([_, mapping]) => mapping.workspaceId === workspaceId)
      .map(([physId]) => physId);

    if (workspaceWindowIds.length === 0) {
      await chrome.tabs.create({ url, active: true });
      return;
    }

    let found = false;

    for (const winId of workspaceWindowIds) {
      const tabs = await chrome.tabs.query({ windowId: winId });
      const match = tabs.find(
        (t) => t.url && (t.url.includes(url) || url.includes(t.url)),
      );

      if (match && match.id) {
        await chrome.windows.update(winId, { focused: true });
        await chrome.tabs.update(match.id, { active: true });
        found = true;
        break;
      }
    }

    if (!found) {
      await chrome.tabs.create({ url, active: true });
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: ArchiveItem) => {
    e.stopPropagation();
    if (confirm("Slet dette link fra arkivet?")) {
      await NexusService.removeArchiveItem(workspaceId, item);
    }
  };

  const sortedItems = [...items].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex h-full w-80 flex-col border-l border-slate-800 bg-slate-900 shadow-xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div className="flex items-center gap-2 text-slate-200">
          <Archive size={18} className="text-blue-400" />
          <h3 className="text-sm font-bold tracking-wider uppercase">Arkiv</h3>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {items.length}
          </span>
        </div>

        {/* Noter Knap */}
        <button
          onClick={onOpenNotes}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
        >
          <NotebookPen size={14} />
          <span>Åbn noter</span>
        </button>
      </div>

      {/* Input Area */}
      <div className="p-4 pb-2">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute left-3 text-slate-500">
            <LinkIcon size={14} />
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Tilføj link..."
            className="w-full rounded-md border border-slate-700 bg-slate-800 py-2 pr-8 pl-9 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isAdding}
            className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded bg-slate-700 text-slate-300 hover:bg-blue-600 hover:text-white disabled:opacity-50"
          >
            <Plus size={14} />
          </button>
        </form>
      </div>

      {/* Scrollable List */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4 pt-2">
        {sortedItems.length === 0 && (
          <div className="mt-10 flex flex-col items-center justify-center text-center text-slate-600">
            <p className="text-xs italic">Ingen gemte links</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {sortedItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item.url)}
              className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border border-slate-800 bg-slate-800/30 p-3 transition-colors hover:border-slate-700 hover:bg-slate-800 hover:shadow-md"
            >
              {/* Top Row: Icon + Title */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800">
                  <img
                    src={getFaviconUrl(item.url)}
                    alt=""
                    className="h-3.5 w-3.5 transition-all"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium text-slate-300 group-hover:text-blue-400">
                    {item.title || item.url}
                  </span>
                  <span className="truncate text-[10px] text-slate-500">
                    {new URL(item.url).hostname}
                  </span>
                </div>
              </div>

              {/* Bottom Row: Actions (Only visible on hover) */}
              <div className="absolute top-0 right-0 flex items-center justify-start opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => handleDelete(e, item)}
                  className="flex cursor-pointer items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-slate-500 hover:bg-red-500/30 hover:text-red-400"
                >
                  <Trash2 size={16} />
                  Slet
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
