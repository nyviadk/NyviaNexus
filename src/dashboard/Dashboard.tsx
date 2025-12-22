import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Activity,
  CheckSquare,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eraser,
  FolderPlus,
  Globe,
  Inbox as InboxIcon,
  Loader2,
  LogOut,
  Monitor,
  PlusCircle,
  Square,
  Trash2,
  X,
  Settings,
  ArrowUpCircle,
  LifeBuoy,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import { auth, db } from "../lib/firebase";
import { NexusItem, Profile, WorkspaceWindow } from "../types";
import { NexusService } from "../services/nexusService";

// --- Profile Manager Modal (NU MED DIALOG) ---
const ProfileManagerModal = ({
  profiles,
  onClose,
  activeProfile,
  setActiveProfile,
}: any) => {
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, []);

  const addProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newProfileName.trim()) return;
    await addDoc(collection(db, "profiles"), { name: newProfileName });
    setNewProfileName("");
  };

  const saveEdit = async (id: string) => {
    if (!id) return;
    await updateDoc(doc(db, "profiles", id), { name: editName });
    setEditingId(null);
  };
  const removeProfile = async (id: string) => {
    if (!id) return;
    if (profiles.length <= 1) return alert("Mindst én profil påkrævet.");
    if (confirm("Slet profil?")) {
      await deleteDoc(doc(db, "profiles", id));
      if (activeProfile === id)
        setActiveProfile(profiles.find((p: Profile) => p.id !== id)?.id || "");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95"
    >
      <div className="bg-slate-800 border border-slate-600 w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-white uppercase tracking-tight">
            Profiler
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white outline-none focus:ring-2 ring-blue-500 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={addProfile} className="flex gap-2">
          <input
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Navn..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 ring-blue-500/50 text-white"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition outline-none focus:ring-2 ring-blue-400"
          >
            <PlusCircle size={20} />
          </button>
        </form>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {profiles.map((p: Profile) => (
            <div
              key={p.id}
              className="flex items-center gap-2 p-3 bg-slate-700/50 rounded-2xl border border-slate-600 group"
            >
              {editingId === p.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(p.id)}
                    className="flex-1 bg-slate-600 border-none rounded px-2 py-1 text-sm outline-none text-white"
                  />
                  <button
                    onClick={() => saveEdit(p.id)}
                    className="text-green-500"
                  >
                    <Check size={18} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-slate-200">
                    {p.name}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditName(p.name);
                    }}
                    className="text-slate-400 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => removeProfile(p.id)}
                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
};

export const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [items, setItems] = useState<NexusItem[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<NexusItem | null>(
    null
  );
  const [modalType, setModalType] = useState<
    "folder" | "workspace" | "profiles" | null
  >(null);
  const [modalParentId, setModalParentId] = useState<string>("root");
  const [inboxData, setInboxData] = useState<any>(null);
  const [isViewingInbox, setIsViewingInbox] = useState(false);
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [isSystemRestoring, setIsSystemRestoring] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [dropTargetWinId, setDropTargetWinId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isSyncingRoot, setIsSyncingRoot] = useState(false);

  const isPerformingAction = useRef(false);
  const rootDragCounter = useRef(0);
  const hasLoadedPersistence = useRef(false);

  // --- PERSISTENCE LOGIC ---
  useEffect(() => {
    const lastProfile = localStorage.getItem("lastActiveProfileId");
    if (lastProfile) setActiveProfile(lastProfile);
  }, []);

  useEffect(() => {
    if (hasLoadedPersistence.current || items.length === 0 || !activeProfile)
      return;

    const lastWorkspaceId = localStorage.getItem("lastActiveWorkspaceId");
    if (lastWorkspaceId) {
      const ws = items.find((i) => i.id === lastWorkspaceId);
      if (ws && ws.profileId === activeProfile) {
        setSelectedWorkspace(ws);
      }
    }
    hasLoadedPersistence.current = true;
  }, [items, activeProfile]);

  useEffect(() => {
    if (activeProfile)
      localStorage.setItem("lastActiveProfileId", activeProfile);
  }, [activeProfile]);

  useEffect(() => {
    if (selectedWorkspace) {
      localStorage.setItem("lastActiveWorkspaceId", selectedWorkspace.id);
    } else if (isViewingInbox) {
      localStorage.removeItem("lastActiveWorkspaceId");
    }
  }, [selectedWorkspace, isViewingInbox]);

  const applyState = useCallback(
    (state: any) => {
      if (isPerformingAction.current) return;
      if (state.profiles) {
        setProfiles(state.profiles);
        if (
          state.profiles.length > 0 &&
          !activeProfile &&
          !localStorage.getItem("lastActiveProfileId")
        )
          setActiveProfile(state.profiles[0].id);
      }
      if (state.items) setItems(state.items);
      if (state.inbox) setInboxData(state.inbox);
    },
    [activeProfile]
  );

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        chrome.windows.getCurrent(
          (win) => win.id && setCurrentWindowId(win.id)
        );
        chrome.runtime.sendMessage({ type: "GET_LATEST_STATE" }, (state) => {
          if (state) applyState(state);
        });
      }
    });
    const messageListener = (msg: any) => {
      if (msg.type === "STATE_UPDATED") applyState(msg.payload);
      if (
        msg.type === "WORKSPACE_WINDOWS_UPDATED" &&
        !isPerformingAction.current
      )
        setWindows(msg.payload.windows);
    };
    chrome.runtime.onMessage.addListener(messageListener);
    const int = setInterval(() => {
      chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_MAPPINGS" },
        (m) => m && setActiveMappings(m)
      );
      chrome.runtime.sendMessage({ type: "GET_RESTORING_STATUS" }, (res) =>
        setIsSystemRestoring(res)
      );
    }, 1000);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      clearInterval(int);
    };
  }, [applyState]);

  useEffect(() => {
    if (selectedWorkspace)
      chrome.runtime.sendMessage({
        type: "WATCH_WORKSPACE",
        payload: selectedWorkspace.id,
      });
  }, [selectedWorkspace]);

  const emergencyRepairHierarchy = async () => {
    if (
      !confirm(
        "ADVARSEL: Dette vil flytte ALLE elementer ud til hovedmappen (Root) for at fikse ødelagte mapper/loops. Vil du fortsætte?"
      )
    )
      return;

    setIsSyncingRoot(true);
    try {
      const batch = writeBatch(db);
      const profileItems = items.filter((i) => i.profileId === activeProfile);

      profileItems.forEach((item) => {
        if (item.parentId !== "root") {
          const ref = doc(db, "items", item.id);
          batch.update(ref, { parentId: "root" });
        }
      });

      await batch.commit();
      alert("Hierarki nulstillet. Alle elementer ligger nu i roden.");
    } catch (e) {
      console.error(e);
      alert("Fejl under reparation.");
    } finally {
      setIsSyncingRoot(false);
    }
  };

  const onDropToRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverRoot(false);
    rootDragCounter.current = 0;
    const draggedId = e.dataTransfer.getData("itemId");
    if (draggedId) {
      isPerformingAction.current = true;
      setIsSyncingRoot(true);
      setItems((prev) =>
        prev.map((i) => (i.id === draggedId ? { ...i, parentId: "root" } : i))
      );
      try {
        await NexusService.moveItem(draggedId, "root");
        await new Promise((r) => setTimeout(r, 500));
      } finally {
        isPerformingAction.current = false;
        setIsSyncingRoot(false);
        setActiveDragId(null);
      }
    }
  };

  const handleTabDrop = async (targetWinId: string) => {
    setDropTargetWinId(null);
    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (!tabJson) return;
    const tab = JSON.parse(tabJson);
    const sourceWinId = isViewingInbox ? "global" : selectedWindowId;
    if (!sourceWinId || sourceWinId === targetWinId) return;
    isPerformingAction.current = true;
    try {
      const sourceMapping = activeMappings.find(
        ([_, m]) => m.internalWindowId === sourceWinId
      );
      const targetMapping = activeMappings.find(
        ([_, m]) => m.internalWindowId === targetWinId
      );
      if (sourceMapping && targetMapping) {
        const tabs = await chrome.tabs.query({ windowId: sourceMapping[0] });
        const targetTab = tabs.find((t) => t.url === tab.url);
        if (targetTab?.id)
          await chrome.tabs.move(targetTab.id, {
            windowId: targetMapping[0],
            index: -1,
          });
      } else {
        await NexusService.moveTabBetweenWindows(
          tab,
          selectedWorkspace?.id || "global",
          sourceWinId,
          selectedWorkspace?.id || "global",
          targetWinId
        );
        if (sourceMapping)
          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: { urls: [tab.url], internalWindowId: sourceWinId },
          });
      }
      await new Promise((r) => setTimeout(r, 500));
    } finally {
      window.sessionStorage.removeItem("draggedTab");
      isPerformingAction.current = false;
    }
  };

  const toggleSelectAll = () => {
    const list = isViewingInbox
      ? inboxData?.tabs || []
      : windows.find((w) => w.id === selectedWindowId)?.tabs || [];
    const allUrls = list.map((t: any) => t.url);
    setSelectedUrls(selectedUrls.length === allUrls.length ? [] : allUrls);
  };

  const deleteSelectedTabs = async () => {
    if (
      isSystemRestoring ||
      selectedUrls.length === 0 ||
      !confirm(`Slet ${selectedUrls.length} tabs?`)
    )
      return;
    isPerformingAction.current = true;
    const sourceWinId = isViewingInbox ? "global" : selectedWindowId;
    const list = isViewingInbox
      ? [...(inboxData?.tabs || [])]
      : [...(windows.find((w) => w.id === selectedWindowId)?.tabs || [])];
    const filtered = list.filter((t: any) => !selectedUrls.includes(t.url));
    try {
      chrome.runtime.sendMessage({
        type: "CLOSE_PHYSICAL_TABS",
        payload: { urls: selectedUrls, internalWindowId: sourceWinId },
      });
      if (isViewingInbox) {
        setInboxData({ ...inboxData, tabs: filtered });
        await updateDoc(doc(db, "inbox_data", "global"), { tabs: filtered });
      } else if (selectedWorkspace && selectedWindowId) {
        setWindows((prev) =>
          prev.map((w) =>
            w.id === selectedWindowId ? { ...w, tabs: filtered } : w
          )
        );
        await updateDoc(
          doc(
            db,
            "workspaces_data",
            selectedWorkspace.id,
            "windows",
            selectedWindowId
          ),
          { tabs: filtered }
        );
      }
      setSelectedUrls([]);
    } finally {
      isPerformingAction.current = false;
    }
  };

  const emptyInbox = async () => {
    if (!inboxData?.tabs?.length || !confirm("Vil du rydde hele din Inbox?"))
      return;
    isPerformingAction.current = true;
    try {
      chrome.runtime.sendMessage({
        type: "CLOSE_PHYSICAL_TABS",
        payload: {
          urls: inboxData.tabs.map((t: any) => t.url),
          internalWindowId: "global",
        },
      });
      setInboxData({ ...inboxData, tabs: [] });
      await updateDoc(doc(db, "inbox_data", "global"), { tabs: [] });
    } finally {
      isPerformingAction.current = false;
    }
  };

  const handleMoveTab = async (index: number, direction: "left" | "right") => {
    if (isSystemRestoring) return;
    isPerformingAction.current = true;
    const currentTabs = isViewingInbox
      ? inboxData?.tabs || []
      : windows.find((w) => w.id === selectedWindowId)?.tabs || [];
    const tabs = [...currentTabs];
    const newIdx = direction === "left" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= tabs.length) {
      isPerformingAction.current = false;
      return;
    }
    [tabs[index], tabs[newIdx]] = [tabs[newIdx], tabs[index]];
    if (isViewingInbox) setInboxData({ ...inboxData, tabs });
    else
      setWindows((prev) =>
        prev.map((w) => (w.id === selectedWindowId ? { ...w, tabs } : w))
      );
    if (isViewingInbox)
      await updateDoc(doc(db, "inbox_data", "global"), { tabs });
    else if (selectedWorkspace && selectedWindowId)
      await updateDoc(
        doc(
          db,
          "workspaces_data",
          selectedWorkspace.id,
          "windows",
          selectedWindowId
        ),
        { tabs }
      );
    isPerformingAction.current = false;
  };

  const isViewingCurrent = activeMappings.some(
    ([id, m]: any) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId
  );

  const TabCard = ({ tab, index }: { tab: any; index: number }) => (
    <div className="group relative">
      <button
        onClick={async () => {
          const sourceWinId = isViewingInbox ? "global" : selectedWindowId!;
          await NexusService.moveTabBetweenWindows(
            tab,
            selectedWorkspace?.id || "global",
            sourceWinId,
            "",
            "global"
          );
        }}
        className="absolute -top-2 -right-2 z-30 bg-slate-700 border border-slate-600 text-slate-300 hover:text-red-400 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow-xl"
      >
        <X size={12} />
      </button>

      {/* Select Box - Flyttet til venstre top */}
      <div
        className="absolute top-2 left-2 cursor-pointer z-20 text-slate-500 hover:text-blue-400"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedUrls((prev) =>
            prev.includes(tab.url)
              ? prev.filter((u) => u !== tab.url)
              : [...prev, tab.url]
          );
        }}
      >
        {selectedUrls.includes(tab.url) ? (
          <CheckSquare
            size={16}
            className="text-blue-500 bg-slate-900 rounded"
          />
        ) : (
          <Square
            size={16}
            className="opacity-0 group-hover:opacity-100 bg-slate-900/50 rounded"
          />
        )}
      </div>

      <div
        draggable
        onDragStart={() =>
          window.sessionStorage.setItem("draggedTab", JSON.stringify(tab))
        }
        className={`bg-slate-800/60 p-4 rounded-2xl border cursor-grab active:cursor-grabbing ${
          selectedUrls.includes(tab.url)
            ? "border-blue-500 bg-blue-500/10"
            : "border-slate-700 hover:border-slate-500"
        } flex flex-col gap-2 hover:bg-slate-800 transition group shadow-md pl-8`}
        /* Added pl-8 to make room for checkbox */
      >
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => chrome.tabs.create({ url: tab.url })}
        >
          <Globe
            size={14}
            className="text-slate-500 group-hover:text-blue-400 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-200">
              {tab.title}
            </div>
            <div className="truncate text-[10px] text-slate-500 italic font-mono">
              {tab.url}
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-700/50">
          <div className="flex gap-1">
            <button
              onClick={() => handleMoveTab(index, "left")}
              className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => handleMoveTab(index, "right")}
              className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!user)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900">
        <LoginForm />
      </div>
    );

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans relative">
      {isSystemRestoring && (
        <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
          <Loader2 size={48} className="text-blue-500 animate-spin" />
          <div className="text-xl font-bold text-white animate-pulse">
            Synkroniserer...
          </div>
        </div>
      )}
      <aside className="w-96 border-r border-slate-700 bg-slate-800 flex flex-col shrink-0 shadow-2xl z-20 transition-all">
        <div className="p-6 border-b border-slate-700 font-black text-white text-xl uppercase tracking-tighter flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-500/20">
            N
          </div>{" "}
          NyviaNexus
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <div className="flex items-center gap-2">
            <select
              value={activeProfile}
              onChange={(e) => {
                setActiveProfile(e.target.value);
                setSelectedWorkspace(null);
                setIsViewingInbox(false);
              }}
              className="flex-1 bg-slate-700 p-2 rounded-xl border border-slate-600 text-sm outline-none focus:ring-2 ring-blue-500/50 transition-all text-white"
            >
              {profiles.map((p: Profile) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setModalType("profiles")}
              className="p-2 text-slate-400 hover:text-blue-400 bg-slate-700 rounded-xl border border-slate-600 transition shadow-sm active:scale-95"
            >
              <Settings size={18} />
            </button>
          </div>
          <nav className="space-y-4">
            {activeDragId && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  rootDragCounter.current++;
                  setIsDragOverRoot(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  rootDragCounter.current--;
                  if (rootDragCounter.current === 0) setIsDragOverRoot(false);
                }}
                onDrop={onDropToRoot}
                className={`p-4 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 ${
                  isDragOverRoot
                    ? "bg-blue-600/20 border-blue-400 scale-[1.02] text-blue-400 shadow-lg ring-4 ring-blue-500/10"
                    : "bg-slate-700/40 border-slate-600 text-slate-500"
                }`}
              >
                {isSyncingRoot ? (
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                ) : (
                  <ArrowUpCircle
                    size={20}
                    className={`${isDragOverRoot ? "animate-bounce" : ""}`}
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
                    onClick={emergencyRepairHierarchy}
                    title="NØD REPARATION: Flyt alt til rod"
                    className="hover:text-red-400 text-slate-600 transition-colors mr-2"
                  >
                    <LifeBuoy size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setModalParentId("root");
                      setModalType("folder");
                    }}
                    title="Ny Mappe"
                  >
                    <FolderPlus
                      size={14}
                      className="hover:text-white transition-colors"
                    />
                  </button>
                  <button
                    onClick={() => {
                      setModalParentId("root");
                      setModalType("workspace");
                    }}
                    title="Nyt Space"
                  >
                    <PlusCircle
                      size={14}
                      className="hover:text-white transition-colors"
                    />
                  </button>
                </div>
              </div>
              <div className="space-y-0.5">
                {items
                  .filter(
                    (i) =>
                      i.profileId === activeProfile && i.parentId === "root"
                  )
                  .map((item) => (
                    <SidebarItem
                      key={item.id}
                      item={item}
                      allItems={items}
                      onRefresh={() => {}}
                      onSelect={(it: NexusItem) => {
                        setIsViewingInbox(false);
                        setSelectedWorkspace(it);
                      }}
                      onAddChild={(pid, type) => {
                        setModalParentId(pid);
                        setModalType(type);
                      }}
                      onDragStateChange={(id) => setActiveDragId(id)}
                      onDragEndCleanup={() => {
                        setActiveDragId(null);
                        setIsDragOverRoot(false);
                        rootDragCounter.current = 0;
                      }}
                      activeDragId={activeDragId}
                    />
                  ))}
              </div>
            </div>
          </nav>
          <nav
            className="space-y-1"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDropTargetWinId("global");
            }}
            onDrop={() => handleTabDrop("global")}
          >
            <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-2 block tracking-widest">
              Opsamling
            </label>
            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setIsViewingInbox(true);
              }}
              className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all ${
                isViewingInbox || dropTargetWinId === "global"
                  ? "bg-orange-600/20 text-orange-400 border border-orange-500/50 shadow-lg"
                  : "hover:bg-slate-700 text-slate-400"
              }`}
              onDragLeave={() => setDropTargetWinId(null)}
            >
              <InboxIcon size={16} />{" "}
              <span>Inbox ({inboxData?.tabs?.length || 0})</span>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-3 text-sm font-medium">
          <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase tracking-tighter">
            <Activity size={12} className="animate-pulse" /> Live Sync Active
          </div>
          <button
            onClick={() => auth.signOut()}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition active:scale-95"
          >
            <LogOut size={16} /> Log ud
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col bg-slate-900 relative">
        {selectedWorkspace || isViewingInbox ? (
          <>
            <header className="p-8 pb-4 flex justify-between items-end border-b border-slate-800 bg-slate-800/30">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-4xl font-bold text-white tracking-tight">
                    {isViewingInbox ? "Inbox" : selectedWorkspace?.name}
                  </h2>
                  {isViewingCurrent && (
                    <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-bold uppercase tracking-widest">
                      <Monitor size={10} className="inline mr-1" /> Dette Vindue
                    </span>
                  )}
                </div>
                {!isViewingInbox && (
                  <div className="flex gap-4 items-center">
                    {windows.map((win, idx) => (
                      <div
                        key={win.id}
                        className="flex flex-col gap-1 items-center"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTargetWinId(win.id);
                        }}
                        onDrop={() => handleTabDrop(win.id)}
                        onDragLeave={() => setDropTargetWinId(null)}
                      >
                        {/* Redesignet Vindue Card - NU MED TOGGLE LOGIK */}
                        <div
                          onClick={() =>
                            setSelectedWindowId(
                              selectedWindowId === win.id ? null : win.id
                            )
                          }
                          className={`relative group px-4 py-3 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                            selectedWindowId === win.id ||
                            dropTargetWinId === win.id
                              ? "bg-blue-600/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                              : "bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-800/80"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-300 group-hover:text-white uppercase tracking-wider">
                              Vindue {idx + 1}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {win.tabs.length} tabs
                            </span>
                          </div>

                          <div className="w-px h-6 bg-slate-700 mx-1"></div>

                          <div
                            className="flex gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              title="Åbn i nyt vindue"
                              onClick={() =>
                                chrome.runtime.sendMessage({
                                  type: "OPEN_SPECIFIC_WINDOW",
                                  payload: {
                                    workspaceId: selectedWorkspace?.id,
                                    windowData: win,
                                    name: selectedWorkspace?.name,
                                    index: idx + 1,
                                  },
                                })
                              }
                              className="p-1.5 hover:bg-blue-500/20 rounded-lg text-slate-400 hover:text-blue-400 transition"
                            >
                              <ExternalLink size={20} />
                            </button>
                          </div>

                          {/* Trash Icon moved to top right absolute, visible on hover */}
                          <button
                            title="Slet vindue"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (
                                confirm("Slet dette vindue fra gemt space?")
                              ) {
                                await deleteDoc(
                                  doc(
                                    db,
                                    `workspaces_data/${selectedWorkspace?.id}/windows`,
                                    win.id
                                  )
                                );
                              }
                            }}
                            className="absolute -top-2 -right-2 p-1.5 bg-slate-800 border border-slate-600 rounded-full text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                          >
                            <Trash2 size={12} />
                          </button>

                          {/* Active Indicator */}
                          {activeMappings.some(
                            ([_, m]: any) => m.internalWindowId === win.id
                          ) && (
                            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-slate-900 z-10" />
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        chrome.runtime.sendMessage({
                          type: "CREATE_NEW_WINDOW_IN_WORKSPACE",
                          payload: {
                            workspaceId: selectedWorkspace?.id,
                            name: selectedWorkspace?.name,
                          },
                        })
                      }
                      className="h-14 w-14 flex items-center justify-center rounded-xl border border-dashed border-slate-700 hover:border-blue-500/50 hover:bg-slate-800 text-slate-500 hover:text-blue-400 transition"
                      title="Tilføj tomt vindue"
                    >
                      <PlusCircle size={24} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mb-1">
                {(isViewingInbox
                  ? inboxData?.tabs?.length ?? 0
                  : windows.find((w) => w.id === selectedWindowId)?.tabs
                      ?.length ?? 0) > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className={`p-2.5 bg-slate-800 border rounded-xl transition ${
                      selectedUrls.length > 0
                        ? "border-blue-500 text-blue-400"
                        : "border-slate-700 hover:text-blue-400"
                    }`}
                    title="Marker alle"
                  >
                    <CheckSquare size={20} />
                  </button>
                )}
                {selectedUrls.length > 0 && (
                  <button
                    onClick={deleteSelectedTabs}
                    className="flex items-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
                  >
                    <Trash2 size={16} /> Slet ({selectedUrls.length})
                  </button>
                )}
                {isViewingInbox && (inboxData?.tabs?.length ?? 0) > 0 && (
                  <button
                    onClick={emptyInbox}
                    className="flex items-center gap-2 bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
                  >
                    <Eraser size={16} /> Ryd Inbox
                  </button>
                )}
                {!isViewingInbox && (
                  <>
                    <button
                      onClick={() =>
                        chrome.runtime.sendMessage({
                          type: "OPEN_WORKSPACE",
                          payload: {
                            workspaceId: selectedWorkspace?.id,
                            windows,
                            name: selectedWorkspace?.name,
                          },
                        })
                      }
                      className="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition text-white"
                    >
                      Åbn Space
                    </button>
                  </>
                )}
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(isViewingInbox
                  ? inboxData?.tabs || []
                  : windows.find((w) => w.id === selectedWindowId)?.tabs || []
                ).map((tab: any, i: number) => (
                  <TabCard key={i} tab={tab} index={i} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
            <Monitor size={48} className="opacity-20" />
            <p className="text-lg font-medium">Vælg et space i sidebaren</p>
          </div>
        )}
      </main>
      {(modalType === "folder" || modalType === "workspace") && (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId={modalParentId}
          onClose={() => {
            setModalType(null);
            setModalParentId("root");
          }}
          onSuccess={() => {
            setModalType(null);
            setModalParentId("root");
          }}
        />
      )}
      {modalType === "profiles" && (
        <ProfileManagerModal
          profiles={profiles}
          onClose={() => setModalType(null)}
          activeProfile={activeProfile}
          setActiveProfile={setActiveProfile}
        />
      )}
    </div>
  );
};
