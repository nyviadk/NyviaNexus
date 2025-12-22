import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
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
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import { auth, db } from "../lib/firebase";
import { NexusItem, Profile, WorkspaceWindow } from "../types";
import { NexusService } from "../services/nexusService";

const ProfileManagerModal = ({
  profiles,
  onClose,
  activeProfile,
  setActiveProfile,
}: any) => {
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const addProfile = async () => {
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
    if (profiles.length <= 1) return alert("Mindst én profil.");
    if (confirm("Slet profil?")) {
      await deleteDoc(doc(db, "profiles", id));
      if (activeProfile === id) {
        const next = profiles.find((p: Profile) => p.id !== id);
        setActiveProfile(next?.id || "");
      }
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-white uppercase tracking-tight">
            Profiler
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Navn..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 transition"
          />
          <button
            onClick={addProfile}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition"
          >
            <PlusCircle size={20} />
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {profiles.map((p: Profile) => (
            <div
              key={p.id}
              className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-2xl border border-slate-800 group"
            >
              {editingId === p.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 bg-slate-700 border-none rounded px-2 py-1 text-sm outline-none"
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
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  <button
                    onClick={() => {
                      setEditingId(p.id);
                      setEditName(p.name);
                    }}
                    className="text-slate-500 hover:text-blue-400 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => removeProfile(p.id)}
                    className="text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
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
  const [isDraggingItem, setIsDraggingItem] = useState(false);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);

  const isPerformingAction = useRef(false);

  const applyState = useCallback(
    (state: any) => {
      if (isPerformingAction.current) return;
      if (state.profiles) {
        setProfiles(state.profiles);
        if (state.profiles.length > 0 && !activeProfile)
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

  useEffect(() => {
    if (
      activeMappings.length > 0 &&
      currentWindowId &&
      items.length > 0 &&
      !selectedWorkspace &&
      !isViewingInbox
    ) {
      const mapping = activeMappings.find(([id]) => id === currentWindowId);
      if (mapping) {
        const ws = items.find((i: any) => i.id === mapping[1].workspaceId);
        if (ws) {
          setSelectedWorkspace(ws);
          setSelectedWindowId(mapping[1].internalWindowId);
        }
      }
    }
  }, [
    activeMappings,
    currentWindowId,
    items,
    isViewingInbox,
    selectedWorkspace,
  ]);

  useEffect(() => {
    if (
      windows.length > 0 &&
      (!selectedWindowId || !windows.some((w) => w.id === selectedWindowId))
    )
      setSelectedWindowId(windows[0].id);
  }, [windows, selectedWindowId]);

  const onDropToRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("itemId");
    if (draggedId) {
      isPerformingAction.current = true;
      setItems((prev) =>
        prev.map((i) => (i.id === draggedId ? { ...i, parentId: "root" } : i))
      );
      await NexusService.moveItem(draggedId, "root");
      isPerformingAction.current = false;
    }
    setIsDragOverRoot(false);
    setIsDraggingItem(false);
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
    } finally {
      window.sessionStorage.removeItem("draggedTab");
      isPerformingAction.current = false;
    }
  };

  // --- TAB MANAGEMENT FUNKTIONER ---
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
    const currentTabs = isViewingInbox
      ? [...(inboxData?.tabs || [])]
      : [...(windows.find((w) => w.id === selectedWindowId)?.tabs || [])];
    const filtered = currentTabs.filter(
      (t: any) => !selectedUrls.includes(t.url)
    );

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

  const deleteWindowData = async () => {
    if (
      isSystemRestoring ||
      !selectedWindowId ||
      !selectedWorkspace ||
      !confirm("Slet ALT data for dette vindue?")
    )
      return;
    isPerformingAction.current = true;
    try {
      await deleteDoc(
        doc(
          db,
          `workspaces_data/${selectedWorkspace.id}/windows`,
          selectedWindowId
        )
      );
      setSelectedWindowId(null);
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

  const currentWindowData = windows.find((w) => w.id === selectedWindowId);
  const handleMoveTab = async (index: number, direction: "left" | "right") => {
    if (isSystemRestoring) return;
    isPerformingAction.current = true;
    const tabs = isViewingInbox
      ? [...(inboxData?.tabs || [])]
      : [...(currentWindowData?.tabs || [])];
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

  const TabCard = ({ tab, index }: { tab: any; index: number }) => (
    <div
      draggable
      onDragStart={() =>
        window.sessionStorage.setItem("draggedTab", JSON.stringify(tab))
      }
      className={`bg-slate-900/40 p-4 rounded-2xl border cursor-grab active:cursor-grabbing ${
        selectedUrls.includes(tab.url)
          ? "border-blue-500 bg-blue-500/5"
          : "border-slate-800"
      } flex flex-col gap-2 hover:bg-slate-900 transition group relative`}
    >
      <div
        className="absolute top-2 right-2 cursor-pointer text-slate-600 hover:text-blue-400"
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
          <CheckSquare size={16} className="text-blue-500" />
        ) : (
          <Square size={16} className="opacity-0 group-hover:opacity-100" />
        )}
      </div>
      <div
        className="flex items-center gap-3 cursor-pointer pr-6"
        onClick={() => chrome.tabs.create({ url: tab.url })}
      >
        <Globe
          size={14}
          className="text-slate-600 group-hover:text-blue-400 shrink-0"
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
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800/50">
        <div className="flex gap-1">
          <button
            onClick={() => handleMoveTab(index, "left")}
            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => handleMoveTab(index, "right")}
            className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-white"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <button
          onClick={() => {
            setSelectedUrls([tab.url]);
            deleteSelectedTabs();
          }}
          className="p-1 text-slate-600 hover:text-red-500"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );

  if (!user)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <LoginForm />
      </div>
    );
  const isViewingCurrent = activeMappings.some(
    ([id, m]: any) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans relative">
      {isSystemRestoring && (
        <div className="absolute inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
          <Loader2 size={48} className="text-blue-500 animate-spin" />
          <div className="text-xl font-bold text-white animate-pulse">
            Synkroniserer...
          </div>
        </div>
      )}

      <aside className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0 shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800 font-black text-white text-xl uppercase tracking-tighter flex items-center gap-3">
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
              className="flex-1 bg-slate-800 p-2 rounded-xl border border-slate-700 text-sm outline-none focus:ring-2 ring-blue-500/50 transition-all"
            >
              {profiles.map((p: Profile) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setModalType("profiles")}
              className="p-2 text-slate-500 hover:text-blue-400 bg-slate-800 rounded-xl border border-slate-700 transition shadow-sm active:scale-95"
            >
              <Settings size={18} />
            </button>
          </div>

          <nav className="space-y-4">
            {isDraggingItem && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOverRoot(true);
                }}
                onDragLeave={() => setIsDragOverRoot(false)}
                onDrop={onDropToRoot}
                className={`p-4 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 transition-all duration-300 ${
                  isDragOverRoot
                    ? "bg-blue-600/20 border-blue-400 scale-[1.02] text-blue-400 shadow-lg"
                    : "bg-slate-800/40 border-slate-700 text-slate-500"
                }`}
              >
                <ArrowUpCircle
                  size={20}
                  className={`${isDragOverRoot ? "animate-bounce" : ""}`}
                />
                <span className="text-xs font-bold uppercase tracking-widest">
                  Flyt til rod
                </span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Spaces
                <div className="flex gap-2">
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
                      onDragStateChange={(dragging) =>
                        setIsDraggingItem(dragging)
                      }
                    />
                  ))}
              </div>
            </div>
          </nav>

          <nav
            className="space-y-1"
            onDragOver={(e) => {
              e.preventDefault();
              setDropTargetWinId("global");
            }}
            onDrop={() => handleTabDrop("global")}
          >
            <label className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-2 block tracking-widest">
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
                  : "hover:bg-slate-800 text-slate-400"
              }`}
              onDragLeave={() => setDropTargetWinId(null)}
            >
              <InboxIcon size={16} />{" "}
              <span>Inbox ({inboxData?.tabs?.length || 0})</span>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col gap-3 text-sm font-medium">
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

      <main className="flex-1 flex flex-col bg-slate-950 relative">
        {selectedWorkspace || isViewingInbox ? (
          <>
            <header className="p-8 pb-4 flex justify-between items-end border-b border-slate-900 bg-slate-900/10">
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
                          setDropTargetWinId(win.id);
                        }}
                        onDrop={() => handleTabDrop(win.id)}
                        onDragLeave={() => setDropTargetWinId(null)}
                      >
                        <div className="relative group">
                          <button
                            onClick={() => setSelectedWindowId(win.id)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 ${
                              selectedWindowId === win.id ||
                              dropTargetWinId === win.id
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-110 ring-2 ring-blue-400"
                                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                            }`}
                          >
                            Vindue {idx + 1}{" "}
                            {activeMappings.some(
                              ([_, m]: any) => m.internalWindowId === win.id
                            ) && (
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            )}
                          </button>
                        </div>
                        <button
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
                          className="text-[9px] text-slate-500 hover:text-blue-400 font-bold uppercase"
                        >
                          Åbn dette
                        </button>
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
                      className="p-1 hover:text-blue-400 text-slate-500 transition mt-1"
                    >
                      <PlusCircle size={20} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mb-1">
                {(isViewingInbox
                  ? inboxData?.tabs?.length ?? 0
                  : currentWindowData?.tabs?.length ?? 0) > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className={`p-2.5 bg-slate-900 border rounded-xl transition ${
                      selectedUrls.length > 0 &&
                      selectedUrls.length ===
                        (isViewingInbox
                          ? inboxData?.tabs?.length ?? 0
                          : currentWindowData?.tabs?.length ?? 0)
                        ? "border-blue-500 text-blue-400"
                        : "border-slate-800 hover:text-blue-400"
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
                      title="Slet vindue data"
                      onClick={deleteWindowData}
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:text-red-500 transition"
                    >
                      <Trash2 size={20} />
                    </button>
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
                      className="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition"
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
                  : currentWindowData?.tabs || []
                ).map((tab: any, i: number) => (
                  <TabCard key={i} tab={tab} index={i} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4">
            <Monitor size={48} className="opacity-10" />
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
