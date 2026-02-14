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
  LogOut,
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
  handleWorkspaceClick: (item: NexusItem) => void;
  handleDeleteSuccess: (id: string) => void;
  inboxData: InboxData | null;
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

  // --- REORDERING STATE ---
  const [isReordering, setIsReordering] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [localItems, setLocalItems] = useState<NexusItem[]>([]);

  // --- ANIMATION HOOK ---
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
      // Sorter items først, så nye items (order=0/undefined) bliver lagt først i arrayet.
      // Dette sikrer, at når vi tildeler index, så beholder de deres "Nr 1" plads.
      const sortedBeforeInit = [...items].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      );

      const initialized = sortedBeforeInit.map((item, idx) => ({
        ...item,
        order: idx, // Tildel fast rækkefølge baseret på den visuelle sortering
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
    <aside className="relative z-20 flex w-96 shrink-0 flex-col overflow-hidden border-r border-slate-700/50 bg-linear-to-b from-slate-900 via-slate-800/60 to-slate-900 shadow-2xl">
      <div className="flex items-center gap-3 border-b border-slate-700/30 bg-slate-900/10 p-6 text-xl font-black tracking-tighter text-white uppercase backdrop-blur-sm">
        NyviaNexus
      </div>

      {chromeWindows.length > 0 && (
        <div className="border-b border-slate-700/30 bg-slate-900/20 px-4 py-3 backdrop-blur-sm">
          <div className="mb-2 px-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase">
            Åbne Vinduer
          </div>
          <div className="space-y-1.5">
            {chromeWindows.map((cWin) => {
              const isCurrent = cWin.id === currentWindowId;
              const mappingEntry = activeMappings.find(
                ([wId]) => wId === cWin.id,
              );
              const mapping = mappingEntry ? mappingEntry[1] : null;

              // --- LABEL LOGIK ---
              let label = "Ukendt"; // Dette er som udgangspunkt Space Navnet
              let subLabel = ""; // Dette er som udgangspunkt Vindues Indeks/Code

              const isInbox =
                !mapping ||
                (mapping && mapping.workspaceId === "global") ||
                cWin.type === "popup";

              // 1. Bestem Space Navn (Basic Label)
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

                // 2. Tjek for Custom Window Name
                const customWindowName =
                  (mapping as any).windowName || (mapping as any).name;

                // 3. PRIORITERING LOGIK:
                // Hvis der er et Custom Name, skal det være "Main Headline" (label),
                // og Space Navnet rykkes ned som "Sub Headline" (subLabel).
                if (customWindowName) {
                  subLabel = label; // Space navnet bliver sekundært
                  label = customWindowName; // Custom navnet bliver primært (stor grøn)
                } else {
                  // Standard adfærd: Ingen custom navn -> Vis indeks
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

              // Logic to determine if Dashboard View matches Physical Window Context
              let isContextMatch = false;
              if (isInbox) {
                if (cWin.incognito) {
                  isContextMatch = viewMode === "incognito";
                } else {
                  isContextMatch = viewMode === "inbox";
                }
              } else if (mapping && mapping.workspaceId) {
                isContextMatch =
                  viewMode === "workspace" &&
                  selectedWorkspace?.id === mapping.workspaceId;
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
                      ? "cursor-default border border-green-500/30 bg-green-500/10 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                      : "cursor-pointer border border-transparent bg-slate-700/30 hover:border-slate-600 hover:bg-slate-700/50"
                  }`}
                >
                  <div className="flex min-w-0 flex-col truncate">
                    <div className="flex items-center gap-2 truncate">
                      {isInbox ? (
                        cWin.incognito ? (
                          <VenetianMask
                            size={12}
                            className={
                              isCurrent ? "text-green-400" : "text-purple-400"
                            }
                          />
                        ) : (
                          <InboxIcon
                            size={12}
                            className={
                              isCurrent ? "text-green-400" : "text-orange-400"
                            }
                          />
                        )
                      ) : (
                        <Monitor
                          size={12}
                          className={
                            isCurrent ? "text-green-400" : "text-blue-400"
                          }
                        />
                      )}
                      <span
                        className={`truncate font-bold ${
                          isCurrent ? "text-green-400" : "text-slate-300"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {subLabel && (
                      <span className="pl-5 text-[10px] text-slate-500">
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
                                handleWorkspaceClick(ws);
                              }
                            }
                          }}
                          className="group flex cursor-pointer items-center justify-center rounded bg-slate-700/50 p-1 text-slate-300 transition-all hover:bg-blue-500 hover:text-white"
                          title="Gå til dette space i Dashboardet"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                      <div className="ml-2 shrink-0 rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-green-500 uppercase shadow-[0_0_5px_rgba(34,197,94,0.2)]">
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

      <div className="scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent flex-1 space-y-6 overflow-y-auto p-4">
        {aiHealth === "down" && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-lg shadow-amber-900/20">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-500"
            />
            <div>
              <h4 className="text-xs font-bold tracking-wide text-amber-500 uppercase">
                AI Service Offline
              </h4>
              <p className="mt-1 text-[10px] leading-relaxed text-amber-200/70">
                Automatisk sortering er sat på pause. Dine faner vil blive
                kategoriseret, så snart servicen er oppe igen.
              </p>
              <a
                className="mt-1 block text-[10px] leading-relaxed text-amber-200/70 underline hover:text-amber-200"
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
            className="cursor-pointer rounded-xl border border-slate-600 bg-slate-800/50 p-2 text-slate-400 transition-colors hover:border-slate-500 hover:text-blue-400"
          >
            <Settings size={22} />
          </button>
          <button
            onClick={() => setModalType("remote-access")}
            className="cursor-pointer rounded-xl border border-slate-600 bg-slate-800/50 p-2 text-slate-400 transition-colors hover:border-slate-500 hover:text-purple-400"
          >
            <Share2 size={22} />
          </button>
        </div>

        <nav className="space-y-4">
          {activeDragId && !isAlreadyAtRoot && !isReordering && (
            <div
              onDragOver={(e) => e.preventDefault()}
              // Robust hover logic - tjek relatedTarget
              onDragEnter={() => {
                setIsDragOverRoot(true);
              }}
              onDragLeave={(e) => {
                const currentTarget = e.currentTarget;
                const relatedTarget = e.relatedTarget as Node;
                // Hvis musen går ind i et child element, så tæl det ikke som leave
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
                  ? "scale-[1.02] border-blue-400 bg-blue-600/20 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                  : "border-slate-600/50 bg-slate-700/20 text-slate-500 hover:border-slate-500"
              }`}
            >
              {isSyncingRoot ? (
                <Loader2 size={24} className="animate-spin text-blue-400" />
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
            <div className="flex items-center justify-between px-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Spaces
              <div className="flex gap-2">
                {isReordering ? (
                  <>
                    <button
                      onClick={handleSaveOrder}
                      disabled={isSavingOrder}
                      className="cursor-pointer text-green-400 transition-transform hover:scale-110 disabled:opacity-50"
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
                      className="cursor-pointer text-slate-400 transition-transform hover:scale-110 hover:text-white disabled:opacity-50"
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
                      <LifeBuoy size={18} className="hover:text-red-400" />
                    </button>
                    <button
                      onClick={handleToggleReordering}
                      className="cursor-pointer transition-transform hover:scale-110"
                      title="Sorter spaces og mapper"
                    >
                      <ArrowRightLeft
                        size={18}
                        className="rotate-90 hover:text-white"
                      />
                    </button>
                    <button
                      onClick={() => {
                        setModalParentId("root");
                        setModalType("folder");
                      }}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      <FolderPlus size={18} className="hover:text-white" />
                    </button>
                    <button
                      onClick={() => {
                        setModalParentId("root");
                        setModalType("workspace");
                      }}
                      className="cursor-pointer transition-transform hover:scale-110"
                    >
                      <PlusCircle size={18} className="hover:text-white" />
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
            // Robust hover logic for Inbox
            onDragEnter={() => {
              setIsInboxDragOver(true);
            }}
            onDragLeave={(e) => {
              const currentTarget = e.currentTarget;
              const relatedTarget = e.relatedTarget as Node;
              // Hvis musen går ind i et child element (som ikonet), så tæl det ikke som leave
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
            <label className="mb-2 block px-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase transition-colors group-hover:text-slate-300">
              Opsamling
            </label>

            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setViewMode("inbox");
              }}
              className={`mb-2 flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm backdrop-blur-sm transition-all ${
                viewMode === "inbox"
                  ? "border-orange-500/50 bg-orange-600/20 text-orange-400 shadow-lg"
                  : inboxDropStatus === "invalid" && isInboxDragOver
                    ? "scale-[0.98] border-red-500/50 bg-red-900/20 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    : inboxDropStatus === "valid" && isInboxDragOver
                      ? "scale-[1.02] border-emerald-500/50 bg-emerald-900/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : isInboxDragOver
                        ? "border-slate-500 bg-slate-700/50 text-slate-200"
                        : "border-transparent text-slate-400 hover:bg-slate-700/30 hover:text-slate-200"
              }`}
            >
              {isInboxSyncing ? (
                <Loader2 size={20} className="animate-spin text-blue-400" />
              ) : inboxDropStatus === "invalid" && isInboxDragOver ? (
                <XCircle
                  size={20}
                  className="pointer-events-none text-red-500"
                />
              ) : (
                <InboxIcon size={20} className="pointer-events-none" />
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
                  ? "border-purple-500/50 bg-purple-900/40 text-purple-400 shadow-lg"
                  : inboxDropStatus === "invalid" && isInboxDragOver
                    ? "cursor-not-allowed opacity-30 grayscale"
                    : "border-transparent text-slate-400 hover:bg-slate-700/30 hover:text-slate-200"
              }`}
            >
              <VenetianMask size={20} />
              <span>Incognito ({getFilteredInboxTabs(true).length})</span>
            </div>
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-700/30 bg-slate-900/30 p-4 text-sm backdrop-blur-md">
        <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase">
          <Activity size={14} className="animate-pulse" /> Live Sync
        </div>
        <button
          onClick={() => auth.signOut()}
          className="flex cursor-pointer items-center gap-2 text-slate-500 transition-colors hover:text-red-500"
        >
          <LogOut size={20} /> Log ud
        </button>
      </div>
    </aside>
  );
};
