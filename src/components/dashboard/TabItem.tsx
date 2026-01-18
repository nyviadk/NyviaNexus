import {
  CheckSquare,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Square,
  Tag,
  X,
} from "lucide-react";
import React from "react";
import {
  DraggedTabPayload,
  RuntimeTabData,
  TabItemProps,
} from "../../dashboard/types";
import { getCategoryStyle, getContrastYIQ } from "../../dashboard/utils";
import { UserCategory } from "../../types";

export const TabItem = React.memo(
  ({
    tab,
    isSelected,
    onSelect,
    onDelete,
    sourceWorkspaceId,
    onDragStart,
    userCategories = [],
    onShowReasoning,
    onOpenMenu,
    selectionCount = 0, // Ny prop: Antal valgte faner
  }: TabItemProps & { selectionCount?: number }) => {
    const aiData = tab.aiData || { status: "pending" };
    const isProcessing = aiData.status === "processing";
    const isPending = aiData.status === "pending";
    const categoryName = aiData.status === "completed" ? aiData.category : null;
    const isLocked = aiData.isLocked;

    const getBadgeStyle = () => {
      if (!categoryName) return {};
      const userCat = userCategories.find(
        (c: UserCategory) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (userCat) {
        return {
          backgroundColor: userCat.color,
          color: getContrastYIQ(userCat.color),
          borderColor: userCat.color,
          boxShadow: `0 2px 4px ${userCat.color}40`,
        };
      }
      return {};
    };

    const inlineStyle = getBadgeStyle();
    const classNameStyle =
      Object.keys(inlineStyle).length > 0
        ? ""
        : getCategoryStyle(categoryName || "");

    return (
      <div className="group relative w-full h-full">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(tab);
          }}
          className="absolute -top-2 -right-2 z-30 bg-slate-700 border border-slate-600 text-slate-300 hover:text-red-400 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow-xl cursor-pointer"
        >
          <X size={14} />
        </button>
        <div
          className="absolute top-2 left-2 cursor-pointer z-20 text-slate-500 hover:text-blue-400"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(tab);
          }}
        >
          {isSelected ? (
            <CheckSquare
              size={20}
              className="text-blue-500 bg-slate-900 rounded cursor-pointer"
            />
          ) : (
            <Square
              size={20}
              className="opacity-0 group-hover:opacity-100 bg-slate-900/50 rounded cursor-pointer"
            />
          )}
        </div>

        <div
          draggable={true}
          onDragStart={(e) => {
            // STOP MULTI-DRAG (Midlertidig beskyttelse inden fyraften)
            if (isSelected && selectionCount > 1) {
              e.preventDefault();
              e.stopPropagation();
              alert(
                "🚧 Multidrag er ikke implementeret endnu.\n\nVi arbejder på sagen! Flyt venligst én fane ad gangen for nu."
              );
              return;
            }

            e.dataTransfer.setData("nexus/tab", "true");

            // Safe cast to RuntimeTabData to check for runtime 'id'
            const runtimeTab = tab as RuntimeTabData;
            const runtimeId = runtimeTab.id;

            const tabData: DraggedTabPayload = {
              ...tab,
              id: runtimeId,
              uid: tab.uid || crypto.randomUUID(),
              sourceWorkspaceId: sourceWorkspaceId || "global",
            };
            console.log("🔥 [Drag Start]", tabData.title);
            window.sessionStorage.setItem(
              "draggedTab",
              JSON.stringify(tabData)
            );
            if (onDragStart) onDragStart();
          }}
          className={`bg-slate-800 p-4 rounded-2xl border cursor-default active:cursor-grabbing transform-gpu ${
            isSelected
              ? "border-blue-500 bg-slate-750 shadow-blue-900/20"
              : "border-slate-700 hover:border-slate-500"
          } flex flex-col h-full hover:bg-slate-800 transition group shadow-md pl-8 overflow-hidden`}
        >
          <div className="flex flex-col gap-2 min-w-0">
            <div
              className="flex flex-col gap-1 cursor-pointer group/link p-2 -ml-2 rounded-lg hover:bg-slate-700/50 transition-colors"
              onClick={async (e) => {
                e.stopPropagation();

                // Helper function til at fokusere en fundet fane
                const focusTab = async (t: chrome.tabs.Tab) => {
                  if (t.id && t.windowId) {
                    // Fokusér vinduet først (ellers ser man det ikke)
                    await chrome.windows.update(t.windowId, { focused: true });
                    // Gør fanen aktiv
                    await chrome.tabs.update(t.id, { active: true });
                  }
                };

                try {
                  // 1. GULD STANDARD: Forsøg specifikt ID først
                  const runtimeTab = tab as RuntimeTabData;
                  const runtimeId = runtimeTab.id;
                  if (runtimeId) {
                    const existing = await chrome.tabs
                      .get(runtimeId)
                      .catch(() => null);
                    if (existing) {
                      await focusTab(existing);
                      return;
                    }
                  }

                  // 2. SØLV STANDARD: Søg efter URL (Fall-back hvis ID er dødt/gammelt)
                  // Dette forhindrer dubletter. Vi finder alle med samme URL.
                  const matches = await chrome.tabs.query({ url: tab.url });

                  // Filtrer efter incognito-status, så vi ikke blander alm/incognito sammen
                  const exactMatches = matches.filter(
                    (t) => t.incognito === tab.isIncognito
                  );

                  if (exactMatches.length > 0) {
                    // Sortering: Prøv at finde en i DETTE vindue først (currentWindowId), ellers tag den første
                    const currentWin = await chrome.windows
                      .getCurrent()
                      .catch(() => null);
                    const bestMatch =
                      exactMatches.find((t) => t.windowId === currentWin?.id) ||
                      exactMatches[0];

                    await focusTab(bestMatch);
                    return;
                  }
                } catch (err) {
                  console.warn(
                    "Smart-focus failed, falling back to create:",
                    err
                  );
                }

                // 3. BRONZE: Intet fundet -> Åbn ny
                if (tab.isIncognito) {
                  chrome.windows.create({
                    url: tab.url,
                    incognito: true,
                    focused: true,
                  });
                } else {
                  chrome.tabs.create({ url: tab.url, active: true });
                }
              }}
            >
              <div className="flex items-center gap-3">
                <Globe
                  size={18}
                  className={`${
                    tab.isIncognito ? "text-purple-400" : "text-slate-500"
                  } group-hover/link:text-blue-400 shrink-0 transition-colors`}
                />
                <div className="truncate text-sm font-semibold text-slate-200 pointer-events-none w-full group-hover/link:text-blue-200 transition-colors">
                  {tab.title}
                </div>
                <ExternalLink
                  size={16}
                  className="text-blue-400 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0"
                />
              </div>

              <div className="truncate text-[10px] text-slate-500 italic font-mono pointer-events-none w-full pl-8 group-hover/link:text-blue-300/70">
                {tab.url}
              </div>
            </div>

            <div className="pl-8 flex flex-wrap gap-2 mt-1 min-h-6">
              {isProcessing && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-700/50 border border-slate-600/50 text-[10px] font-medium text-slate-400 animate-pulse w-fit cursor-wait">
                  <Loader2 size={10} className="animate-spin" />
                  AI sorterer...
                </div>
              )}

              {isPending && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-700/50 border border-slate-600/50 text-[10px] font-medium text-slate-400 w-fit cursor-help"
                  title="Analyseres næste gang ai kører"
                >
                  <Clock size={10} />I kø til AI
                </div>
              )}

              {categoryName && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (aiData.reasoning) {
                      onShowReasoning(aiData);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenMenu(e, tab);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide w-fit shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer ${classNameStyle}`}
                  style={inlineStyle}
                  title="Venstreklik: Info | Højreklik: Skift kategori"
                >
                  <Tag size={10} />
                  {categoryName}
                  {isLocked && <Lock size={8} className="ml-0.5 opacity-80" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.isSelected === next.isSelected &&
      prev.tab.url === next.tab.url &&
      prev.tab.title === next.tab.title &&
      prev.tab.uid === next.tab.uid &&
      prev.selectionCount === next.selectionCount && // Check for selection count change
      JSON.stringify(prev.tab.aiData) === JSON.stringify(next.tab.aiData) &&
      JSON.stringify(prev.userCategories) ===
        JSON.stringify(next.userCategories)
    );
  }
);
