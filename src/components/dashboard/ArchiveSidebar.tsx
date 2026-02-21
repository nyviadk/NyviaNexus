import { WinMapping } from "@/background/main";
import { ArchiveItem } from "@/types";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Link as LinkIcon,
  NotebookPen,
  Plus,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NexusService } from "../../services/nexusService";

interface ArchiveSidebarProps {
  workspaceId: string;
  items: ArchiveItem[];
  activeMappings: [number, WinMapping][];
  onOpenNotes: () => void;
}

type FilterType = "all" | "readLater" | "links";

export const ArchiveSidebar: React.FC<ArchiveSidebarProps> = ({
  workspaceId,
  items,
  activeMappings,
  onOpenNotes,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState<FilterType>("readLater");

  const hasInitialized = useRef(false);

  // --- SMART DEFAULT LOGIC ---
  useEffect(() => {
    // Kør kun når data er landet, og kun første gang
    if (items.length > 0 && !hasInitialized.current) {
      const hasReadLater = items.some((i) => i.readLater);
      // Hvis læseliste er tom, men vi har data -> Skift til links
      if (!hasReadLater) setFilter("links");

      hasInitialized.current = true;
    }
  }, [items]);

  // Nulstil init-flag hvis vi skifter workspace helt
  useEffect(() => {
    hasInitialized.current = false;
    setFilter("readLater");
  }, [workspaceId]);

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
      const asReadLater = filter === "readLater";
      await NexusService.addArchiveItem(workspaceId, inputValue, asReadLater);
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

  const handleToggleReadLater = async (
    e: React.MouseEvent,
    item: ArchiveItem,
  ) => {
    e.stopPropagation();
    await NexusService.updateArchiveItem(workspaceId, item.id, {
      readLater: !item.readLater,
    });
  };

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);
    if (filter === "all") return sorted;
    if (filter === "readLater") return sorted.filter((i) => i.readLater);
    return sorted.filter((i) => !i.readLater);
  }, [items, filter]);

  return (
    <div className="flex h-full w-80 flex-col border-l border-subtle bg-surface shadow-xl transition-all">
      {/* Header */}
      <div className="flex flex-col border-b border-subtle bg-surface">
        <div className="flex items-center justify-between p-4 pb-2">
          <div className="flex items-center gap-2 text-medium">
            <Archive size={18} className="text-action" />
            <h3 className="text-sm font-bold tracking-wider text-high uppercase">
              Arkiv
            </h3>
          </div>
          <button
            onClick={onOpenNotes}
            className="flex cursor-pointer items-center gap-1.5 rounded-md bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-medium transition-colors hover:bg-surface-hover hover:text-high"
          >
            <NotebookPen size={14} />
            <span>Noter</span>
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex px-4 pb-0">
          <button
            onClick={() => setFilter("readLater")}
            className={`flex-1 cursor-pointer border-b-2 pb-2 text-xs font-medium transition-colors ${
              filter === "readLater"
                ? "border-action text-action"
                : "border-transparent text-low hover:text-medium"
            }`}
          >
            Læseliste ({items.filter((i) => i.readLater).length})
          </button>
          <button
            onClick={() => setFilter("links")}
            className={`flex-1 cursor-pointer border-b-2 pb-2 text-xs font-medium transition-colors ${
              filter === "links"
                ? "border-action text-action"
                : "border-transparent text-low hover:text-medium"
            }`}
          >
            Links ({items.filter((i) => !i.readLater).length})
          </button>
          <button
            onClick={() => setFilter("all")}
            className={`flex-1 cursor-pointer border-b-2 pb-2 text-xs font-medium transition-colors ${
              filter === "all"
                ? "border-strong text-high"
                : "border-transparent text-low hover:text-medium"
            }`}
          >
            Alle
          </button>
        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 pb-2">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <div className="absolute left-3 text-low">
            {filter === "readLater" ? (
              <BookOpen size={14} />
            ) : (
              <LinkIcon size={14} />
            )}
          </div>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              filter === "readLater" ? "Gem til læseliste..." : "Gem link..."
            }
            className="w-full rounded-md border border-subtle bg-surface-sunken py-2 pr-8 pl-9 text-sm text-high placeholder-low focus:border-action focus:ring-1 focus:ring-action focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isAdding}
            className="absolute right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-surface-elevated text-medium hover:bg-action hover:text-inverted disabled:opacity-50"
          >
            <Plus size={14} />
          </button>
        </form>
      </div>

      {/* Scrollable List */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4 pt-2">
        {filteredItems.length === 0 && (
          <div className="mt-10 flex flex-col items-center justify-center text-center text-low">
            <p className="text-xs italic">Ingen items i denne visning</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item.url)}
              className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border border-subtle bg-surface-elevated/30 p-3 transition-colors hover:border-strong hover:bg-surface-elevated hover:shadow-md"
            >
              {/* Top Row: Icon + Title */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-sunken">
                  <img
                    src={getFaviconUrl(item.url)}
                    alt=""
                    className="h-3.5 w-3.5 transition-all"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium text-medium group-hover:text-high">
                    {item.title || item.url}
                  </span>
                  <span className="truncate text-[10px] text-low">
                    {new URL(item.url).hostname}
                  </span>
                </div>
              </div>

              {/* Bottom Row: Actions */}
              <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-subtle bg-surface p-1 opacity-0 shadow-sm transition-all group-hover:opacity-100">
                <button
                  onClick={(e) => handleToggleReadLater(e, item)}
                  title={item.readLater ? "Markér som læst" : "Læs senere"}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-medium hover:bg-surface-hover hover:text-high"
                >
                  {item.readLater ? (
                    <CheckCircle2 size={14} className="text-success" />
                  ) : (
                    <BookOpen size={14} />
                  )}
                </button>

                <button
                  onClick={(e) => handleDelete(e, item)}
                  title="Slet"
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-low hover:bg-danger/20 hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
