import { WinMapping } from "@/background/main";
import { DraggedTabPayload, InboxData } from "@/dashboard/types";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { doc, writeBatch } from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpCircle,
  Eye,
  FolderPlus,
  Inbox as InboxIcon,
  LifeBuoy,
  Loader2,
  Monitor,
  PlusCircle,
  Save,
  Settings,
  Share2,
  VenetianMask,
  X,
  XCircle,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../../lib/firebase";
import { AiHealthStatus } from "../../services/aiService";
import { NexusService } from "../../services/nexusService";
import { NexusItem, Profile, TabData } from "../../types";
import { SidebarItem } from "../SidebarItem";
import { CustomProfileSelector } from "./CustomProfileSelector";
import { LogoutButton } from "./LogoutButton";

interface SidebarProps {
  profiles: Profile[];
  activeProfile: string;
  setActiveProfile: (id: string) => void;
  items: NexusItem[];
  chromeWindows: chrome.windows.Window[];
  currentWindowId: number | null;
  activeMappings: [number, WinMapping][];
  viewMode: "workspace" | "inbox" | "incognito";
  setViewMode: (mode: "workspace" | "inbox" | "incognito") => void;
  selectedWorkspace: NexusItem | null;
  setSelectedWorkspace: (ws: NexusItem | null) => void;
  setModalType: (
    type: "folder" | "workspace" | "settings" | "remote-access" | null,
  ) => void;
  setModalParentId: (id: string) => void;
  isLoading: boolean;
  activeDragId: string | null;
  setActiveDragId: (id: string | null) => void;
  handleSidebarTabDrop: (target: NexusItem | "global") => Promise<void>;
  handleWorkspaceClick: (item: NexusItem, specificWindowId?: string) => void;
  handleDeleteSuccess: (id: string) => void;
  inboxData: InboxData | null;
  selectedWindowId: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  profiles,
  activeProfile,
  setActiveProfile,
  items,
  chromeWindows,
  currentWindowId,
  activeMappings,
  viewMode,
  setViewMode,
  selectedWorkspace,
  setSelectedWorkspace,
  setModalType,
  setModalParentId,
  isLoading,
  activeDragId,
  setActiveDragId,
  handleSidebarTabDrop,
  handleWorkspaceClick,
  handleDeleteSuccess,
  inboxData,
  selectedWindowId,
}) => {
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isSyncingRoot, setIsSyncingRoot] = useState(false);
  const [isInboxDragOver, setIsInboxDragOver] = useState(false);
  const [inboxDropStatus, setInboxDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);
  const [isInboxSyncing, setIsInboxSyncing] = useState(false);
  const [aiHealth, setAiHealth] = useState<AiHealthStatus>("up");

  const [folderStates, setFolderStates] = useState<Record<string, boolean>>({});

  const [isReordering, setIsReordering] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [localItems, setLocalItems] = useState<NexusItem[]>([]);

  const [animationParent] = useAutoAnimate();

  useEffect(() => {
    if (!isReordering) {
      setLocalItems(items);
    }
  }, [items, isReordering]);

  useEffect(() => {
    chrome.storage.local.get("nexus_folder_states").then((result) => {
      if (result.nexus_folder_states) {
        setFolderStates(result.nexus_folder_states as Record<string, boolean>);
      }
    });
  }, []);

  const handleToggleFolder = useCallback((itemId: string, isOpen: boolean) => {
    setFolderStates((prev) => {
      const newState = { ...prev, [itemId]: isOpen };
      chrome.storage.local.set({ nexus_folder_states: newState });
      return newState;
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get("nexus_ai_health").then((res) => {
      if (res.nexus_ai_health)
        setAiHealth(res.nexus_ai_health as AiHealthStatus);
    });

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && changes.nexus_ai_health) {
        setAiHealth(changes.nexus_ai_health.newValue as AiHealthStatus);
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const handleToggleReordering = () => {
    if (isReordering) {
      setLocalItems(items);
      setIsReordering(false);
    } else {
      const sortedBeforeInit = [...items].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      );

      const initialized = sortedBeforeInit.map((item, idx) => ({
        ...item,
        order: idx,
      }));

      setLocalItems(initialized);
      setIsReordering(true);
    }
  };

  const handleSaveOrder = async () => {
    if (!auth.currentUser) return;
    setIsSavingOrder(true);
    try {
      const batch = writeBatch(db);
      localItems.forEach((item) => {
        const ref = doc(db, "users", auth.currentUser!.uid, "items", item.id);
        batch.update(ref, { order: item.order });
      });
      await batch.commit();
      setIsReordering(false);
    } catch (err) {
      console.error("Fejl ved gemning af rækkefølge:", err);
      alert("Kunne ikke gemme rækkefølgen.");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleMoveItem = (id: string, direction: "up" | "down") => {
    const itemsCopy = [...localItems];
    const targetItem = itemsCopy.find((i) => i.id === id);
    if (!targetItem) return;

    const siblings = itemsCopy
      .filter(
        (i) =>
          i.parentId === targetItem.parentId &&
          i.profileId === targetItem.profileId,
      )
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const currentIndex = siblings.findIndex((i) => i.id === id);
    if (currentIndex === -1) return;

    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) return;

    const swapSibling = siblings[swapIndex];
    const tempOrder = targetItem.order;
    targetItem.order = swapSibling.order;
    swapSibling.order = tempOrder;

    setLocalItems(itemsCopy);
  };

  const filteredRootItems = useMemo(
    () =>
      localItems
        .filter((i) => i.profileId === activeProfile && i.parentId === "root")
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [localItems, activeProfile],
  );

  const getFilteredInboxTabs = useCallback(
    (incognitoMode: boolean) => {
      if (!inboxData?.tabs) return [];
      return inboxData.tabs.filter((t: TabData) =>
        incognitoMode ? t.isIncognito : !t.isIncognito,
      );
    },
    [inboxData],
  );

  const draggedItem = useMemo(
    () => (activeDragId ? items.find((i) => i.id === activeDragId) : null),
    [activeDragId, items],
  );

  const isAlreadyAtRoot = draggedItem?.parentId === "root";

  const handleProfileChange = useCallback(
    (profileId: string) => {
      setActiveProfile(profileId);
      setSelectedWorkspace(null);
      setViewMode("workspace");
    },
    [setActiveProfile, setSelectedWorkspace, setViewMode],
  );

  return (
    <aside className="relative z-20 flex w-96 shrink-0 flex-col overflow-hidden border-r border-subtle bg-surface shadow-2xl">
      <div className="flex items-center gap-3 border-b border-subtle bg-surface-sunken/10 p-6 text-xl font-black tracking-tighter text-high uppercase backdrop-blur-sm">
        NyviaNexus
      </div>

      {chromeWindows.length > 0 && (
        <div className="border-b border-subtle bg-surface-sunken/20 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 px-1 text-[10px] font-bold tracking-widest text-low uppercase">
            Åbne Vinduer
          </div>
          <div className="space-y-1.5">
            {chromeWindows.map((cWin) => {
              const isCurrent = cWin.id === currentWindowId;
              const mappingEntry = activeMappings.find(
                ([wId]) => wId === cWin.id,
              );
              const mapping = mappingEntry ? mappingEntry[1] : null;

              let label = "Ukendt";
              let subLabel = "";

              const isInbox =
                !mapping ||
                (mapping && mapping.workspaceId === "global") ||
                cWin.type === "popup";

              if (isInbox) {
                label = cWin.incognito ? "Incognito Inbox" : "Inbox";
                subLabel = "Global";
              } else if (mapping) {
                const ws = items.find((i) => i.id === mapping.workspaceId);
                if (ws) {
                  label = ws.name;
                } else if (isLoading) {
                  label = "Indlæser...";
                } else {
                  label = "Slettet Space";
                }

                const customWindowName =
                  (mapping as any).windowName || (mapping as any).name;

                if (customWindowName) {
                  subLabel = label;
                  label = customWindowName;
                } else {
                  if (mapping.index !== undefined) {
                    if (mapping.index === 99) {
                      subLabel = "Opretter...";
                    } else {
                      subLabel = `Vindue ${mapping.index}`;
                    }
                  } else {
                    subLabel = "Indlæser...";
                  }
                }
              }

              let isContextMatch = false;
              if (isInbox) {
                if (cWin.incognito) {
                  isContextMatch = viewMode === "incognito";
                } else {
                  isContextMatch = viewMode === "inbox";
                }
              } else if (mapping && mapping.workspaceId) {
                const isSameWorkspace =
                  viewMode === "workspace" &&
                  selectedWorkspace?.id === mapping.workspaceId;

                const isSameWindow =
                  selectedWindowId === mapping.internalWindowId;

                isContextMatch = isSameWorkspace && isSameWindow;
              }

              return (
                <div
                  key={cWin.id}
                  onClick={() => {
                    if (!isCurrent && cWin.id) {
                      chrome.windows.update(cWin.id, { focused: true });
                    }
                  }}
                  className={`flex items-center justify-between rounded-lg p-2 text-xs transition-all duration-200 ${
                    isCurrent
                      ? "cursor-default border border-success/30 bg-success/10 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                      : "cursor-pointer border border-transparent bg-surface-elevated/30 hover:border-strong hover:bg-surface-hover"
                  }`}
                >
                  <div className="flex min-w-0 flex-col truncate">
                    <div className="flex items-center gap-2 truncate">
                      {isInbox ? (
                        cWin.incognito ? (
                          <VenetianMask
                            size={12}
                            className={
                              isCurrent ? "text-success" : "text-mode-incognito"
                            }
                          />
                        ) : (
                          <InboxIcon
                            size={12}
                            className={
                              isCurrent ? "text-success" : "text-mode-inbox"
                            }
                          />
                        )
                      ) : (
                        <Monitor
                          size={12}
                          className={
                            isCurrent ? "text-success" : "text-mode-workspace"
                          }
                        />
                      )}
                      <span
                        className={`truncate font-bold ${
                          isCurrent ? "text-success" : "text-medium"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {subLabel && (
                      <span className="pl-5 text-[10px] text-low">
                        {subLabel}
                      </span>
                    )}
                  </div>
                  {isCurrent && (
                    <div className="flex items-center gap-1.5">
                      {!isContextMatch && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isInbox) {
                              setSelectedWorkspace(null);
                              setViewMode(
                                cWin.incognito ? "incognito" : "inbox",
                              );
                            } else if (mapping?.workspaceId) {
                              const ws = items.find(
                                (i) => i.id === mapping.workspaceId,
                              );
                              if (ws) {
                                if (ws.profileId !== activeProfile) {
                                  setActiveProfile(ws.profileId);
                                }
                                handleWorkspaceClick(
                                  ws,
                                  mapping.internalWindowId,
                                );
                              }
                            }
                          }}
                          className="group flex cursor-pointer items-center justify-center rounded bg-surface-elevated/50 p-1 text-medium transition-all hover:bg-action hover:text-inverted"
                          title="Gå til dette space/vindue i Dashboardet"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                      <div className="ml-2 shrink-0 rounded bg-success/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-success uppercase shadow-[0_0_5px_rgba(34,197,94,0.2)]">
                        HER
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rulbar container */}
      <div className="scrollbar-thin scrollbar-thumb-strong scrollbar-track-transparent flex-1 space-y-6 overflow-y-auto p-4">
        {aiHealth === "down" && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 shadow-lg shadow-warning/20">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
            <div>
              <h4 className="text-xs font-bold tracking-wide text-warning uppercase">
                AI Service Offline
              </h4>
              <p className="mt-1 text-[10px] leading-relaxed text-warning/70">
                Automatisk sortering er sat på pause. Dine faner vil blive
                kategoriseret, så snart servicen er oppe igen.
              </p>
              <a
                className="mt-1 block text-[10px] leading-relaxed text-warning/70 underline hover:text-warning"
                href="https://statusgator.com/services/cerebras"
                target="_blank"
                rel="noreferrer"
              >
                https://statusgator.com/services/cerebras
              </a>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <CustomProfileSelector
            profiles={profiles}
            activeProfile={activeProfile}
            onSelect={handleProfileChange}
          />
          <button
            onClick={() => setModalType("settings")}
            className="cursor-pointer rounded-xl border border-strong bg-surface-elevated/50 p-2 text-medium transition-colors hover:border-strong hover:text-info"
          >
            <Settings size={22} />
          </button>
          <button
            onClick={() => setModalType("remote-access")}
            className="cursor-pointer rounded-xl border border-strong bg-surface-elevated/50 p-2 text-medium transition-colors hover:border-strong hover:text-mode-incognito"
          >
            <Share2 size={22} />
          </button>
        </div>

        <nav className="space-y-4">
          {activeDragId && !isAlreadyAtRoot && !isReordering && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => {
                setIsDragOverRoot(true);
              }}
              onDragLeave={(e) => {
                const currentTarget = e.currentTarget;
                const relatedTarget = e.relatedTarget as Node;
                if (currentTarget.contains(relatedTarget)) return;
                setIsDragOverRoot(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragOverRoot(false);
                const dId = e.dataTransfer.getData("itemId");
                if (dId) {
                  setIsSyncingRoot(true);
                  try {
                    await NexusService.moveItem(dId, "root");
                  } finally {
                    setIsSyncingRoot(false);
                    setActiveDragId(null);
                  }
                }
              }}
              className={`flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-4 transition-all ${
                isDragOverRoot
                  ? "scale-[1.02] border-action bg-action/10 text-action shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                  : "border-strong/50 bg-surface-elevated/20 text-low hover:border-strong"
              }`}
            >
              {isSyncingRoot ? (
                <Loader2 size={24} className="animate-spin text-action" />
              ) : (
                <ArrowUpCircle
                  size={24}
                  className={`pointer-events-none ${isDragOverRoot ? "animate-bounce" : ""}`}
                />
              )}
              <span className="pointer-events-none text-xs font-bold tracking-widest uppercase">
                {isSyncingRoot ? "Flytter..." : "Flyt til rod"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between px-2 text-[10px] font-bold tracking-widest text-medium uppercase">
              Spaces
              <div className="flex gap-2">
                {isReordering ? (
                  <>
                    <button
                      onClick={handleSaveOrder}
                      disabled={isSavingOrder}
                      className="cursor-pointer text-success transition-transform hover:scale-110 disabled:opacity-50"
                      title="Gem rækkefølge"
                    >
                      {isSavingOrder ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Save size={18} />
                      )}
                    </button>
                    <button
                      onClick={handleToggleReordering}
                      disabled={isSavingOrder}
                      className="cursor-pointer text-medium transition-transform hover:scale-110 hover:text-high disabled:opacity-50"
                      title="Annuller"
                    >
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        if (!auth.currentUser) return;
                        if (confirm("Nulstil hierarki?")) {
                          const b = writeBatch(db);
                          items
                            .filter(
                              (i) =>
                                i.profileId === activeProfile &&
                                i.parentId !== "root",
                            )
                            .forEach((it) =>
                              b.update(
                                doc(
                                  db,
                                  "users",
                                  auth.currentUser!.uid,
                                  "items",
                                  it.id,
                                ),
                                { parentId: "root" },
                              ),
                            );
                          await b.commit();
                        }
                      }}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      <LifeBuoy size={18} className="hover:text-danger" />
                    </button>
                    <button
                      onClick={handleToggleReordering}
                      className="cursor-pointer transition-transform hover:scale-110"
                      title="Sorter spaces og mapper"
                    >
                      <ArrowRightLeft
                        size={18}
                        className="rotate-90 hover:text-high"
                      />
                    </button>
                    <button
                      onClick={() => {
                        setModalParentId("root");
                        setModalType("folder");
                      }}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      <FolderPlus size={18} className="hover:text-high" />
                    </button>
                    <button
                      onClick={() => {
                        setModalParentId("root");
                        setModalType("workspace");
                      }}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      <PlusCircle size={18} className="hover:text-high" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div ref={animationParent} className="space-y-0.5">
              {filteredRootItems.map((item, index) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  allItems={localItems}
                  onRefresh={() => {}}
                  onSelect={handleWorkspaceClick}
                  onAddChild={(pid, type) => {
                    setModalParentId(pid);
                    setModalType(type);
                  }}
                  onDragStateChange={setActiveDragId}
                  onDragEndCleanup={() => {
                    setActiveDragId(null);
                    setIsDragOverRoot(false);
                  }}
                  activeDragId={activeDragId}
                  onTabDrop={handleSidebarTabDrop}
                  onDeleteSuccess={handleDeleteSuccess}
                  folderStates={folderStates}
                  onToggleFolder={handleToggleFolder}
                  isReordering={isReordering}
                  onMoveItem={handleMoveItem}
                  isFirst={index === 0}
                  isLast={index === filteredRootItems.length - 1}
                  activeWorkspaceId={selectedWorkspace?.id}
                />
              ))}
            </div>
          </div>
        </nav>

        {!isReordering && (
          <nav
            onDragOver={(e) => {
              e.preventDefault();
              if (activeDragId) {
                setInboxDropStatus("invalid");
                return;
              }
              const tJ = window.sessionStorage.getItem("draggedTab");
              if (tJ) {
                const tab = JSON.parse(tJ) as DraggedTabPayload;
                setInboxDropStatus(
                  tab.sourceWorkspaceId !== "global" || tab.isIncognito
                    ? "valid"
                    : "invalid",
                );
              }
            }}
            onDragEnter={() => {
              setIsInboxDragOver(true);
            }}
            onDragLeave={(e) => {
              const currentTarget = e.currentTarget;
              const relatedTarget = e.relatedTarget as Node;
              if (currentTarget.contains(relatedTarget)) return;
              setIsInboxDragOver(false);
              setInboxDropStatus(null);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              if (activeDragId) {
                setIsInboxDragOver(false);
                setInboxDropStatus(null);
                return;
              }
              const tJ = window.sessionStorage.getItem("draggedTab");
              setIsInboxDragOver(false);
              setInboxDropStatus(null);
              setIsInboxSyncing(true);
              try {
                if (tJ) {
                  const tab = JSON.parse(tJ) as DraggedTabPayload;
                  if (tab.sourceWorkspaceId !== "global" || tab.isIncognito) {
                    await handleSidebarTabDrop("global");
                  }
                } else {
                  await handleSidebarTabDrop("global");
                }
              } finally {
                setIsInboxSyncing(false);
              }
            }}
            className="group"
          >
            <label className="mb-2 block px-2 text-[10px] font-bold tracking-widest text-medium uppercase transition-colors group-hover:text-high">
              Opsamling
            </label>

            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setViewMode("inbox");
              }}
              className={`mb-2 flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm backdrop-blur-sm transition-all ${
                viewMode === "inbox"
                  ? "text-mode-inbox-high border-mode-inbox/50 bg-mode-inbox/10 shadow-lg"
                  : inboxDropStatus === "invalid" && isInboxDragOver
                    ? "scale-[0.98] border-danger/50 bg-danger/10 text-danger shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    : inboxDropStatus === "valid" && isInboxDragOver
                      ? "scale-[1.02] border-success/50 bg-success/20 text-success shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : isInboxDragOver
                        ? "border-strong bg-surface-elevated/50 text-high"
                        : "border-transparent text-medium hover:bg-surface-hover hover:text-high"
              }`}
            >
              {isInboxSyncing ? (
                <Loader2 size={20} className="animate-spin text-action" />
              ) : inboxDropStatus === "invalid" && isInboxDragOver ? (
                <XCircle
                  size={20}
                  className="pointer-events-none text-danger"
                />
              ) : (
                <InboxIcon
                  size={20}
                  className={`pointer-events-none ${viewMode === "inbox" ? "text-mode-inbox" : ""}`}
                />
              )}
              <span className="pointer-events-none font-medium">
                {inboxDropStatus === "invalid" && isInboxDragOver
                  ? `Kan ikke flytte ${
                      draggedItem?.type === "folder"
                        ? "mappe"
                        : draggedItem?.type === "workspace"
                          ? "Space"
                          : "Inbox fane"
                    } hertil`
                  : `Inbox (${getFilteredInboxTabs(false).length})`}
              </span>
            </div>

            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setViewMode("incognito");
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm backdrop-blur-sm transition-all ${
                viewMode === "incognito"
                  ? "text-mode-incognito-high border-mode-incognito/50 bg-mode-incognito/10 shadow-lg"
                  : inboxDropStatus === "invalid" && isInboxDragOver
                    ? "cursor-not-allowed opacity-30 grayscale"
                    : "border-transparent text-medium hover:bg-surface-hover hover:text-high"
              }`}
            >
              <VenetianMask
                size={20}
                className={`${viewMode === "incognito" ? "text-mode-incognito" : ""}`}
              />
              <span>Incognito ({getFilteredInboxTabs(true).length})</span>
            </div>
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-subtle bg-surface-sunken/30 p-4 text-sm backdrop-blur-md">
        <div className="flex items-center gap-2 text-[10px] font-bold text-success uppercase">
          <Activity size={14} className="animate-pulse" /> Live Sync
        </div>
        <button
          onClick={() => auth.signOut()}
          className="flex cursor-pointer items-center gap-2 text-low transition-colors hover:text-danger"
        >
          <LogoutButton activeMappings={activeMappings} />
        </button>
      </div>
    </aside>
  );
};
