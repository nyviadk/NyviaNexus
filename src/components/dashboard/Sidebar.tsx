import React, {
  useRef,
  useState,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import {
  Activity,
  ArrowUpCircle,
  FolderPlus,
  Inbox as InboxIcon,
  LifeBuoy,
  Loader2,
  LogOut,
  Monitor,
  PlusCircle,
  Settings,
  Share2,
  VenetianMask,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import { SidebarItem } from "../SidebarItem";
import { NexusService } from "../../services/nexusService";
import { NexusItem, Profile, TabData } from "../../types";
import { DraggedTabPayload, InboxData } from "@/dashboard/types";
import { AiHealthStatus } from "../../services/aiService";
import { WinMapping } from "@/background/main";

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

  const rootDragCounter = useRef<number>(0);
  const inboxDragCounter = useRef<number>(0);

  // Lyt på AI Status ændringer fra storage
  useEffect(() => {
    // Initial load
    chrome.storage.local.get("nexus_ai_health").then((res) => {
      if (res.nexus_ai_health) {
        setAiHealth(res.nexus_ai_health as AiHealthStatus);
      }
    });

    // Listener
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && changes.nexus_ai_health) {
        setAiHealth(changes.nexus_ai_health.newValue as AiHealthStatus);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const filteredRootItems = useMemo(
    () =>
      items.filter(
        (i) => i.profileId === activeProfile && i.parentId === "root",
      ),
    [items, activeProfile],
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

  // Find det element der trækkes for at validere "Move to root" og fejlbeskeder
  const draggedItem = useMemo(
    () => (activeDragId ? items.find((i) => i.id === activeDragId) : null),
    [activeDragId, items],
  );

  const isAlreadyAtRoot = draggedItem?.parentId === "root";

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

                if (mapping.index !== undefined) {
                  if (isCurrent) {
                    console.log(
                      `🪟 Sidebar (Current Win ${cWin.id}):`,
                      mapping,
                    );
                  }
                  if (mapping.index === 99) {
                    subLabel = "Opretter...";
                  } else {
                    subLabel = `Vindue ${mapping.index}`;
                  }
                } else {
                  subLabel = "Indlæser...";
                }
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
                    <div className="ml-2 shrink-0 rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-green-500 uppercase shadow-[0_0_5px_rgba(34,197,94,0.2)]">
                      HER
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
                className="mt-1 text-[10px] leading-relaxed text-amber-200/70 underline hover:text-amber-200"
                href="https://statusgator.com/services/cerebras"
                target="_blank"
              >
                https://statusgator.com/services/cerebras
              </a>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <select
            value={activeProfile}
            onChange={(e) => {
              setActiveProfile(e.target.value);
              setSelectedWorkspace(null);
              setViewMode("workspace");
            }}
            className="flex-1 cursor-pointer rounded-xl border border-slate-600 bg-slate-800/50 p-2 text-sm text-white transition-colors outline-none hover:border-slate-500 focus:ring-2 focus:ring-blue-500/20"
          >
            {profiles.map((p: Profile) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
          {activeDragId && !isAlreadyAtRoot && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => {
                rootDragCounter.current++;
                setIsDragOverRoot(true);
              }}
              onDragLeave={() => {
                rootDragCounter.current--;
                if (rootDragCounter.current === 0) setIsDragOverRoot(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setIsDragOverRoot(false);
                rootDragCounter.current = 0;

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
                  className={isDragOverRoot ? "animate-bounce" : ""}
                />
              )}
              <span className="text-xs font-bold tracking-widest uppercase">
                {isSyncingRoot ? "Flytter..." : "Flyt til rod"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between px-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              Spaces
              <div className="flex gap-2">
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
              </div>
            </div>
            <div className="space-y-0.5">
              {filteredRootItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  allItems={items}
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
                    rootDragCounter.current = 0;
                  }}
                  activeDragId={activeDragId}
                  onTabDrop={handleSidebarTabDrop}
                  onDeleteSuccess={handleDeleteSuccess}
                />
              ))}
            </div>
          </div>
        </nav>

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
            inboxDragCounter.current++;
            setIsInboxDragOver(true);
          }}
          onDragLeave={() => {
            inboxDragCounter.current--;
            if (inboxDragCounter.current === 0) {
              setIsInboxDragOver(false);
              setInboxDropStatus(null);
            }
          }}
          onDrop={async (e) => {
            e.preventDefault();
            if (activeDragId) {
              setIsInboxDragOver(false);
              setInboxDropStatus(null);
              inboxDragCounter.current = 0;
              return;
            }
            const tJ = window.sessionStorage.getItem("draggedTab");
            setIsInboxDragOver(false);
            setInboxDropStatus(null);
            inboxDragCounter.current = 0;
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
              <XCircle size={20} className="text-red-500" />
            ) : (
              <InboxIcon size={20} />
            )}
            <span className="font-medium">
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
