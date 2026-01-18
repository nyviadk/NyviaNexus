import React, { useRef, useState } from "react";
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
  VenetianMask,
} from "lucide-react";
import { auth, db } from "../../lib/firebase";
import { doc, writeBatch } from "firebase/firestore";
import { SidebarItem } from "../SidebarItem";
import { NexusService } from "../../services/nexusService";
import { NexusItem, Profile, TabData } from "../../types";
import { DraggedTabPayload, InboxData, WindowMapping } from "@/dashboard/types";
import { windowOrderCache } from "@/dashboard/utils";

interface SidebarProps {
  profiles: Profile[];
  activeProfile: string;
  setActiveProfile: (id: string) => void;
  items: NexusItem[];
  chromeWindows: chrome.windows.Window[];
  currentWindowId: number | null;
  activeMappings: [number, WindowMapping][];
  sortedWindows: any[]; // WorkspaceWindow[]
  selectedWorkspace: NexusItem | null;
  viewMode: "workspace" | "inbox" | "incognito";
  setViewMode: (mode: "workspace" | "inbox" | "incognito") => void;
  setSelectedWorkspace: (ws: NexusItem | null) => void;
  setModalType: (type: "folder" | "workspace" | "settings" | null) => void;
  setModalParentId: (id: string) => void;

  // Drag & Drop props
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
  sortedWindows,
  selectedWorkspace,
  viewMode,
  setViewMode,
  setSelectedWorkspace,
  setModalType,
  setModalParentId,
  activeDragId,
  setActiveDragId,
  handleSidebarTabDrop,
  handleWorkspaceClick,
  handleDeleteSuccess,
  inboxData,
}) => {
  // Lokal state til drag-over effekter (forbedrer performance ved at undgå re-renders i parent)
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isSyncingRoot, setIsSyncingRoot] = useState(false);
  const [isInboxDragOver, setIsInboxDragOver] = useState(false);
  const [inboxDropStatus, setInboxDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);

  // Lokal loading state for inbox sync - isolerer re-renders til denne komponent
  const [isInboxSyncing, setIsInboxSyncing] = useState(false);

  const rootDragCounter = useRef(0);
  const inboxDragCounter = useRef(0);

  const filteredRootItems = React.useMemo(
    () =>
      items.filter(
        (i) => i.profileId === activeProfile && i.parentId === "root"
      ),
    [items, activeProfile]
  );

  const getFilteredInboxTabs = React.useCallback(
    (incognitoMode: boolean) => {
      if (!inboxData?.tabs) return [];
      return inboxData.tabs.filter((t: TabData) =>
        incognitoMode ? t.isIncognito : !t.isIncognito
      );
    },
    [inboxData]
  );

  return (
    <aside className="w-96 border-r border-slate-700 bg-slate-800 flex flex-col shrink-0 shadow-2xl z-20">
      <div className="p-6 border-b border-slate-700 font-black text-white text-xl uppercase tracking-tighter flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
          N
        </div>{" "}
        NyviaNexus
      </div>

      {chromeWindows.length > 0 && (
        <div className="px-4 py-3 bg-slate-900/30 border-b border-slate-700/50">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">
            Åbne Vinduer
          </div>
          <div className="space-y-1.5">
            {chromeWindows.map((cWin) => {
              const isCurrent = cWin.id === currentWindowId;
              const mappingEntry = activeMappings.find(
                ([wId]) => wId === cWin.id
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
                label = ws ? ws.name : "Slettet Space";

                const cachedOrder = windowOrderCache.get(mapping.workspaceId);

                if (
                  cachedOrder &&
                  cachedOrder.indices[mapping.internalWindowId]
                ) {
                  subLabel = `Vindue ${
                    cachedOrder.indices[mapping.internalWindowId]
                  }`;
                } else if (
                  selectedWorkspace &&
                  mapping.workspaceId === selectedWorkspace.id
                ) {
                  const idx = sortedWindows.findIndex(
                    (w) => w.id === mapping.internalWindowId
                  );
                  if (idx !== -1) {
                    subLabel = `Vindue ${idx + 1}`;
                  } else {
                    subLabel = "Sletter...";
                  }
                }
              }

              return (
                <div
                  key={cWin.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                    isCurrent
                      ? "bg-green-500/10 border border-green-500/30"
                      : "bg-slate-700/30 border border-transparent"
                  }`}
                >
                  <div className="flex flex-col truncate min-w-0">
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
                        className={`font-bold truncate ${
                          isCurrent ? "text-green-400" : "text-slate-300"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {subLabel && (
                      <span className="text-[10px] text-slate-500 pl-5">
                        {subLabel}
                      </span>
                    )}
                  </div>
                  {isCurrent && (
                    <div className="text-[9px] font-black text-green-500 bg-green-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ml-2">
                      HER
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        <div className="flex items-center gap-2">
          <select
            value={activeProfile}
            onChange={(e) => {
              setActiveProfile(e.target.value);
              setSelectedWorkspace(null);
              setViewMode("workspace");
            }}
            className="flex-1 bg-slate-700 p-2 rounded-xl border border-slate-600 text-sm outline-none text-white cursor-pointer"
          >
            {profiles.map((p: Profile) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setModalType("settings")}
            className="p-2 text-slate-400 hover:text-blue-400 bg-slate-700 rounded-xl border border-slate-600 cursor-pointer"
          >
            <Settings size={22} />
          </button>
        </div>

        <nav className="space-y-4">
          {activeDragId && (
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
                  await NexusService.moveItem(dId, "root");
                  setIsSyncingRoot(false);
                  setActiveDragId(null);
                }
              }}
              className={`p-4 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 transition-all ${
                isDragOverRoot
                  ? "bg-blue-600/20 border-blue-400 scale-[1.02] text-blue-400"
                  : "bg-slate-700/40 border-slate-600 text-slate-500"
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
              <span className="text-xs font-bold uppercase tracking-widest">
                {isSyncingRoot ? "Flytter..." : "Flyt til rod"}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
                            i.parentId !== "root"
                        )
                        .forEach((it) =>
                          b.update(
                            doc(
                              db,
                              "users",
                              auth.currentUser!.uid,
                              "items",
                              it.id
                            ),
                            { parentId: "root" }
                          )
                        );
                      await b.commit();
                    }
                  }}
                  className="cursor-pointer"
                >
                  <LifeBuoy size={18} className="hover:text-red-400" />
                </button>
                <button
                  onClick={() => {
                    setModalParentId("root");
                    setModalType("folder");
                  }}
                  className="cursor-pointer"
                >
                  <FolderPlus size={18} className="hover:text-white" />
                </button>
                <button
                  onClick={() => {
                    setModalParentId("root");
                    setModalType("workspace");
                  }}
                  className="cursor-pointer"
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
            const tJ = window.sessionStorage.getItem("draggedTab");
            if (tJ) {
              const tab = JSON.parse(tJ);
              setInboxDropStatus(
                tab.sourceWorkspaceId !== "global" || tab.isIncognito
                  ? "valid"
                  : "invalid"
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
            const tJ = window.sessionStorage.getItem("draggedTab");

            setIsInboxDragOver(false);
            setInboxDropStatus(null);
            inboxDragCounter.current = 0;

            setIsInboxSyncing(true); // Start lokal loading

            try {
              if (tJ) {
                const tab = JSON.parse(tJ) as DraggedTabPayload;
                // Kun kør hvis det giver mening (ikke allerede i global, eller er incognito)
                if (tab.sourceWorkspaceId !== "global" || tab.isIncognito) {
                  await handleSidebarTabDrop("global");
                }
              } else {
                // Håndter eksterne drops (f.eks. links) - går altid til global inbox
                await handleSidebarTabDrop("global");
              }
            } finally {
              setIsInboxSyncing(false); // Stop lokal loading
            }
          }}
        >
          <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-2 block tracking-widest">
            Opsamling
          </label>
          <div
            onClick={() => {
              setSelectedWorkspace(null);
              setViewMode("inbox");
            }}
            className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all border mb-2 ${
              viewMode === "inbox"
                ? "bg-orange-600/20 text-orange-400 border-orange-500/50 shadow-lg"
                : inboxDropStatus === "valid"
                ? "bg-emerald-900/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02]"
                : isInboxDragOver
                ? "bg-slate-700 border-slate-500 text-slate-200"
                : "hover:bg-slate-700 text-slate-400 border-transparent"
            }`}
          >
            {isInboxSyncing ? (
              <Loader2 size={20} className="animate-spin text-blue-400" />
            ) : (
              <InboxIcon size={20} />
            )}
            <span>Inbox ({getFilteredInboxTabs(false).length})</span>
          </div>
          <div
            onClick={() => {
              setSelectedWorkspace(null);
              setViewMode("incognito");
            }}
            className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all border ${
              viewMode === "incognito"
                ? "bg-purple-900/40 text-purple-400 border-purple-500/50 shadow-lg"
                : "hover:bg-slate-700 text-slate-400 border-transparent"
            }`}
          >
            <VenetianMask size={20} />
            <span>Incognito ({getFilteredInboxTabs(true).length})</span>
          </div>
        </nav>
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase">
          <Activity size={14} className="animate-pulse" /> Live Sync
        </div>
        <button
          onClick={() => auth.signOut()}
          className="flex items-center gap-2 text-slate-500 hover:text-red-500 cursor-pointer"
        >
          <LogOut size={20} /> Log ud
        </button>
      </div>
    </aside>
  );
};
