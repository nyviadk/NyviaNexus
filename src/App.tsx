import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChromeStorage } from "@/hooks/useChromeStorage";
import type { WinMapping } from "@/features/background/main";
import {
  Inbox,
  Keyboard,
  LayoutDashboard,
  Monitor,
  Search,
  VenetianMask,
} from "lucide-react";

// --- TYPES ---

interface WindowEntry {
  chromeWindowId: number;
  label: string;
  subLabel: string;
  type: "workspace" | "inbox" | "incognito";
  isCurrent: boolean;
}

// --- COMPONENT ---

export default function App() {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [chromeWindows, setChromeWindows] = useState<chrome.windows.Window[]>(
    [],
  );
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reaktive storage hooks — opdaterer automatisk på tværs af vinduer
  const [activeMappingsRaw] = useChromeStorage<[number, WinMapping][]>(
    "nexus_active_windows",
    [],
  );
  const [inboxWindowNames] = useChromeStorage<Record<number, string>>(
    "nexus_inbox_window_names",
    {},
  );

  // Eneste useEffect: Mount — hent vinduer + auto-fokus
  useEffect(() => {
    chrome.windows.getCurrent().then((w) => setCurrentWindowId(w.id ?? null));
    chrome.windows.getAll({ windowTypes: ["normal"] }).then(setChromeWindows);
    inputRef.current?.focus();
  }, []);

  // Byg liste over vinduer — samme label-logik som Sidebar
  const entries: WindowEntry[] = useMemo(() => {
    const mappings = new Map(activeMappingsRaw);

    return chromeWindows
      .filter((w) => w.id !== undefined)
      .map((w) => {
        const winId = w.id!;
        const mapping = mappings.get(winId);
        const isInbox =
          !mapping || mapping.workspaceId === "global" || w.type === "popup";
        const customName = isInbox ? inboxWindowNames[winId] : undefined;

        let label: string;
        let subLabel: string;
        let type: "workspace" | "inbox" | "incognito";

        if (isInbox) {
          type = w.incognito ? "incognito" : "inbox";
          if (customName) {
            label = customName;
            subLabel = w.incognito ? "Incognito" : "Inbox";
          } else {
            label = w.incognito ? "Incognito Inbox" : "Inbox";
            subLabel = "Global";
          }
        } else {
          type = "workspace";
          const customWindowName = mapping!.windowName;
          if (customWindowName) {
            label = customWindowName;
            subLabel = mapping!.workspaceName;
          } else {
            label = mapping!.workspaceName;
            subLabel =
              mapping!.index === 99
                ? "Opretter..."
                : `Vindue ${mapping!.index}`;
          }
        }

        return {
          chromeWindowId: winId,
          label,
          subLabel,
          type,
          isCurrent: winId === currentWindowId,
        };
      });
  }, [chromeWindows, activeMappingsRaw, inboxWindowNames, currentWindowId]);

  // Filtrering
  const filtered = useMemo(() => {
    // Sortér: nuværende vindue først
    const sorted = [...entries].sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return 0;
    });
    if (!query.trim()) return sorted;
    const q = query.toLowerCase();
    return sorted.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.subLabel.toLowerCase().includes(q),
    );
  }, [entries, query]);

  // Scroll aktivt element ind i view (kaldt direkte fra handlers, ingen useEffect)
  const scrollToIndex = useCallback((idx: number) => {
    const container = listRef.current;
    if (!container) return;
    const el = container.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  // Fokusér vindue og luk popup
  const focusWindow = useCallback((chromeWindowId: number) => {
    chrome.windows.update(chromeWindowId, { focused: true });
    window.close();
  }, []);

  const openDashboard = () => {
    chrome.tabs.create({ url: "dashboard.html", pinned: true });
  };

  // Keyboard handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = Math.min(selectedIndex + 1, filtered.length - 1);
        setSelectedIndex(next);
        scrollToIndex(next);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prev);
        scrollToIndex(prev);
        break;
      }
      case "Enter":
        e.preventDefault();
        if (filtered[selectedIndex]) {
          focusWindow(filtered[selectedIndex].chromeWindowId);
        }
        break;
    }
  };

  // Håndterer søgning + nulstiller markering inline (ingen useEffect)
  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  // Mode-farve helper — returnerer klasser der virker i alle temaer
  const modeColor = (type: WindowEntry["type"], isCurrent: boolean) => {
    if (isCurrent) return "text-success";
    switch (type) {
      case "incognito":
        return "text-mode-incognito";
      case "inbox":
        return "text-mode-inbox";
      case "workspace":
        return "text-mode-workspace";
    }
  };

  // Icon helper
  const typeIcon = (type: WindowEntry["type"], isCurrent: boolean) => {
    const cls = modeColor(type, isCurrent);
    switch (type) {
      case "incognito":
        return <VenetianMask size={14} className={cls} />;
      case "inbox":
        return <Inbox size={14} className={cls} />;
      case "workspace":
        return <Monitor size={14} className={cls} />;
    }
  };

  return (
    <div className="flex h-120 w-80 flex-col bg-background text-medium">
      {/* Søge-header */}
      <div className="relative shrink-0 border-b border-subtle bg-surface p-3">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-low"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Søg vinduer..."
          className="w-full rounded-lg border border-subtle bg-background py-2 pr-3 pl-8 text-sm text-high outline-none placeholder:text-low focus:border-action focus:ring-1 focus:ring-action/30"
        />
      </div>

      {/* Vindues-liste */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-low">
            {entries.length === 0 ? "Ingen vinduer fundet" : "Ingen match"}
          </div>
        ) : (
          filtered.map((entry, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={entry.chromeWindowId}
                onClick={() => focusWindow(entry.chromeWindowId)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-100 ${
                  isSelected
                    ? "border border-action/40 bg-action/20 shadow-sm"
                    : "border border-transparent hover:bg-surface-hover"
                }`}
              >
                <div className="flex shrink-0 items-center justify-center">
                  {typeIcon(entry.type, entry.isCurrent)}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm font-semibold ${
                      isSelected ? "text-high" : "text-medium"
                    }`}
                  >
                    {entry.label}
                  </div>
                  <div
                    className={`truncate text-[10px] ${isSelected ? "text-medium" : "text-low"}`}
                  >
                    {entry.subLabel}
                  </div>
                </div>

                {entry.isCurrent && (
                  <span className="shrink-0 rounded bg-success/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-success uppercase shadow-[0_0_5px_rgba(34,197,94,0.15)]">
                    HER
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 space-y-2 border-t border-subtle bg-surface p-3">
        <button
          onClick={openDashboard}
          className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-inverted transition-all hover:bg-action-hover active:scale-[0.98]"
        >
          <LayoutDashboard
            size={16}
            className="transition-transform group-hover:scale-110"
          />
          Åbn dashboard
        </button>

        <button
          onClick={() =>
            chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
          }
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1 text-[10px] text-low transition-colors hover:text-medium"
        >
          <Keyboard size={10} />
          Tilpas genvejstast
        </button>
      </div>
    </div>
  );
}
