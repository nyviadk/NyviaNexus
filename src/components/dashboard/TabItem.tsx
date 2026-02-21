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
import { TabData, UserCategory } from "../../types";

type ExtendedTabItemProps = TabItemProps & {
  selectionCount?: number;
  onConsume?: (tab: TabData) => Promise<void> | void;
};

export const TabItem = React.memo(
  ({
    tab,
    isSelected,
    onSelect,
    onDelete,
    onConsume,
    sourceWorkspaceId,
    onDragStart,
    userCategories = [],
    onShowReasoning,
    onOpenMenu,
    selectionCount = 0,
  }: ExtendedTabItemProps) => {
    const aiData = tab.aiData || { status: "pending" };
    const isProcessing = aiData.status === "processing";
    const isPending = aiData.status === "pending";
    const categoryName = aiData.status === "completed" ? aiData.category : null;
    const isLocked = aiData.isLocked;

    const getBadgeStyle = () => {
      if (!categoryName) return {};
      const userCat = userCategories.find(
        (c: UserCategory) =>
          c.name.toLowerCase() === categoryName.toLowerCase(),
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
      <div className="group relative h-full w-full min-w-65">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(tab);
          }}
          className="absolute -top-2 -right-2 z-30 cursor-pointer rounded-full border border-strong bg-surface-elevated p-1.5 text-medium opacity-0 shadow-xl transition group-hover:opacity-100 hover:text-danger"
        >
          <X size={14} />
        </button>

        <div
          className="absolute -top-2 -left-2 z-20 cursor-pointer text-low hover:text-action"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(tab);
          }}
        >
          {isSelected ? (
            <CheckSquare
              size={20}
              className="cursor-pointer rounded bg-surface text-action shadow-md"
            />
          ) : (
            <Square
              size={20}
              className="cursor-pointer rounded border border-subtle bg-surface text-low opacity-0 shadow-md group-hover:opacity-100"
            />
          )}
        </div>

        <div
          draggable={true}
          onDragStart={(e) => {
            if (isSelected && selectionCount > 1) {
              e.preventDefault();
              e.stopPropagation();
              alert(
                "🚧 Multidrag er ikke implementeret endnu.\n\nFlyt venligst én fane ad gangen.",
              );
              return;
            }

            e.dataTransfer.setData("nexus/tab", "true");
            const runtimeTab = tab as RuntimeTabData;
            const tabData: DraggedTabPayload = {
              ...tab,
              id: runtimeTab.id || undefined,
              uid: tab.uid,
              sourceWorkspaceId: sourceWorkspaceId || "global",
            };

            window.sessionStorage.setItem(
              "draggedTab",
              JSON.stringify(tabData),
            );
            if (onDragStart) onDragStart();
          }}
          className={`group flex h-full transform-gpu cursor-default flex-col overflow-hidden rounded-2xl border pt-2 pr-2 pb-4 pl-4 transition-all active:cursor-grabbing ${
            isSelected
              ? "border-action bg-action/10 shadow-lg"
              : "border-subtle bg-surface-elevated shadow-sm hover:border-action/50 hover:bg-surface-hover hover:shadow-md"
          }`}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <div
              className="group/link -ml-2 flex cursor-pointer flex-col gap-1 rounded-lg p-2 transition-colors hover:bg-surface/50"
              onClick={async (e) => {
                e.stopPropagation();
                const focusTab = async (t: chrome.tabs.Tab) => {
                  if (t.id && t.windowId) {
                    await chrome.windows.update(t.windowId, { focused: true });
                    await chrome.tabs.update(t.id, { active: true });
                  }
                };

                try {
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
                  const matches = await chrome.tabs.query({ url: tab.url });
                  const exactMatches = matches.filter(
                    (t) => t.incognito === tab.isIncognito,
                  );
                  if (exactMatches.length > 0) {
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
                  console.warn("Smart-focus failed:", err);
                }

                if (onConsume) {
                  try {
                    await onConsume(tab);
                  } catch (consumeErr) {
                    console.error(
                      "Failed to consume tab before opening:",
                      consumeErr,
                    );
                  }
                }

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
                    tab.isIncognito ? "text-mode-incognito" : "text-low"
                  } shrink-0 transition-colors group-hover/link:text-action`}
                />
                <div className="pointer-events-none w-full truncate text-sm font-semibold text-high transition-colors group-hover/link:text-high">
                  {tab.title}
                </div>
                <ExternalLink
                  size={16}
                  className="shrink-0 text-action opacity-0 transition-opacity group-hover/link:opacity-100"
                />
              </div>

              <div className="pointer-events-none w-full truncate pl-8 font-mono text-[10px] text-low italic transition-colors group-hover/link:text-medium">
                {tab.url}
              </div>
            </div>

            <div className="mt-1 flex min-h-6 flex-wrap gap-2 pl-8">
              {isProcessing && (
                <div className="inline-flex w-fit animate-pulse cursor-wait items-center gap-1.5 rounded-full border border-strong bg-surface px-2.5 py-0.5 text-[10px] font-medium text-medium">
                  <Loader2 size={10} className="animate-spin" />
                  AI sorterer...
                </div>
              )}

              {isPending && (
                <div
                  className="inline-flex w-fit cursor-help items-center gap-1.5 rounded-full border border-strong bg-surface px-2.5 py-0.5 text-[10px] font-medium text-medium"
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
                  className={`inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-105 active:scale-95 ${classNameStyle}`}
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
      prev.selectionCount === next.selectionCount &&
      JSON.stringify(prev.tab.aiData) === JSON.stringify(next.tab.aiData) &&
      JSON.stringify(prev.userCategories) ===
        JSON.stringify(next.userCategories)
    );
  },
);
