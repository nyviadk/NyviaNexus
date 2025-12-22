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
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import { auth, db } from "../lib/firebase";
import { NexusItem, Profile, WorkspaceWindow } from "../types";

const ProfileManagerModal = ({
  profiles,
  onClose,
  activeProfile,
  setActiveProfile,
}: {
  profiles: Profile[];
  onClose: () => void;
  activeProfile: string;
  setActiveProfile: (id: string) => void;
}) => {
  const [newProfileName, setNewProfileName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const addProfile = async () => {
    if (!newProfileName.trim()) return;
    await addDoc(collection(db, "profiles"), { name: newProfileName });
    setNewProfileName("");
  };

  const saveEdit = async (id: string) => {
    await updateDoc(doc(db, "profiles", id), { name: editName });
    setEditingId(null);
  };

  const removeProfile = async (id: string) => {
    if (profiles.length <= 1) return alert("Du skal have mindst én profil.");
    if (confirm("Slet profil og alt tilhørende data?")) {
      await deleteDoc(doc(db, "profiles", id));
      if (activeProfile === id)
        setActiveProfile(profiles.find((p) => p.id !== id)?.id || "");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-8 shadow-2xl space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-white uppercase tracking-tight">
            Administrer Profiler
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Ny profil navn..."
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
          {profiles.map((p) => (
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
  const [inboxData, setInboxData] = useState<any>(null);
  const [isViewingInbox, setIsViewingInbox] = useState(false);
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSystemRestoring, setIsSystemRestoring] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

  const applyState = useCallback(
    (state: any) => {
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
      if (msg.type === "WORKSPACE_WINDOWS_UPDATED" && !isUpdating)
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
  }, [applyState, isUpdating]);

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
        const ws = items.find((i) => i.id === mapping[1].workspaceId);
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

  const currentWindowData = windows.find((w) => w.id === selectedWindowId);

  const handleMoveTab = async (index: number, direction: "left" | "right") => {
    if (isSystemRestoring) return;
    setIsUpdating(true);
    const tabs = isViewingInbox
      ? [...(inboxData?.tabs || [])]
      : [...(currentWindowData?.tabs || [])];
    const newIdx = direction === "left" ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= tabs.length) {
      setIsUpdating(false);
      return;
    }
    [tabs[index], tabs[newIdx]] = [tabs[newIdx], tabs[index]];
    try {
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
    } finally {
      setTimeout(() => setIsUpdating(false), 800);
    }
  };

  const deleteSelectedTabs = async () => {
    if (
      isSystemRestoring ||
      selectedUrls.length === 0 ||
      !confirm(`Slet ${selectedUrls.length} tabs?`)
    )
      return;
    setIsUpdating(true);
    const tabs = isViewingInbox
      ? [...(inboxData?.tabs || [])]
      : [...(currentWindowData?.tabs || [])];
    const filtered = tabs.filter((t) => !selectedUrls.includes(t.url));
    try {
      chrome.runtime.sendMessage({
        type: "CLOSE_PHYSICAL_TABS",
        payload: {
          urls: selectedUrls,
          internalWindowId: isViewingInbox ? "global" : selectedWindowId,
        },
      });
      if (isViewingInbox)
        await updateDoc(doc(db, "inbox_data", "global"), { tabs: filtered });
      else if (selectedWorkspace && selectedWindowId)
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
      setSelectedUrls([]);
    } finally {
      setTimeout(() => setIsUpdating(false), 800);
    }
  };

  const emptyInbox = async () => {
    if (!inboxData?.tabs?.length || !confirm("Vil du rydde hele din Inbox?"))
      return;
    setIsUpdating(true);
    try {
      chrome.runtime.sendMessage({
        type: "CLOSE_PHYSICAL_TABS",
        payload: {
          urls: inboxData.tabs.map((t: any) => t.url),
          internalWindowId: "global",
        },
      });
      await updateDoc(doc(db, "inbox_data", "global"), { tabs: [] });
    } finally {
      setTimeout(() => setIsUpdating(false), 800);
    }
  };

  const toggleSelectAll = () => {
    const list = isViewingInbox
      ? inboxData?.tabs || []
      : currentWindowData?.tabs || [];
    setSelectedUrls(
      selectedUrls.length === list.length ? [] : list.map((t: any) => t.url)
    );
  };

  const deleteWindowData = async () => {
    if (
      isSystemRestoring ||
      !selectedWindowId ||
      !selectedWorkspace ||
      !confirm("Slet ALT data?")
    )
      return;
    setIsUpdating(true);
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
      setTimeout(() => setIsUpdating(false), 800);
    }
  };

  const TabCard = ({ tab, index }: { tab: any; index: number }) => (
    <div
      className={`bg-slate-900/40 p-4 rounded-2xl border ${
        selectedUrls.includes(tab.url)
          ? "border-blue-500 bg-blue-500/5"
          : "border-slate-800"
      } flex flex-col gap-2 hover:bg-slate-900 transition group relative ${
        isSystemRestoring ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div
        className="absolute top-2 right-2 cursor-pointer text-slate-600 hover:text-blue-400"
        onClick={() =>
          setSelectedUrls((prev) =>
            prev.includes(tab.url)
              ? prev.filter((u) => u !== tab.url)
              : [...prev, tab.url]
          )
        }
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
            setTimeout(deleteSelectedTabs, 10);
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

      <aside className="w-72 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 font-black text-white text-xl uppercase tracking-tighter flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            N
          </div>{" "}
          NyviaNexus
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <div className="flex items-center gap-2">
            <select
              value={activeProfile}
              onChange={(e) => {
                // NY LOGIK: Nulstil view når profil skifter
                setActiveProfile(e.target.value);
                setSelectedWorkspace(null);
                setIsViewingInbox(false);
              }}
              className="flex-1 bg-slate-800 p-2 rounded-xl border border-slate-700 text-sm outline-none"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setModalType("profiles")}
              className="p-2 text-slate-500 hover:text-blue-400 bg-slate-800 rounded-xl border border-slate-700 transition"
            >
              <Settings size={18} />
            </button>
          </div>
          <nav className="space-y-1">
            <div className="flex justify-between items-center px-2 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Spaces
              <div className="flex gap-2">
                <FolderPlus
                  size={14}
                  className="cursor-pointer hover:text-white"
                  onClick={() => setModalType("folder")}
                />
                <PlusCircle
                  size={14}
                  className="cursor-pointer hover:text-white"
                  onClick={() => setModalType("workspace")}
                />
              </div>
            </div>
            {items
              .filter(
                (i) => i.profileId === activeProfile && i.parentId === "root"
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
                />
              ))}
          </nav>
          <nav className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-2 block tracking-widest">
              Opsamling
            </label>
            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setIsViewingInbox(true);
              }}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition ${
                isViewingInbox
                  ? "bg-orange-600/20 text-orange-400"
                  : "hover:bg-slate-800 text-slate-400"
              }`}
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
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition"
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
                      >
                        <div className="relative group">
                          <button
                            onClick={() => setSelectedWindowId(win.id)}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 ${
                              selectedWindowId === win.id
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
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
                          {!activeMappings.some(
                            ([_, m]: any) => m.internalWindowId === win.id
                          ) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Slet data?"))
                                  await deleteDoc(
                                    doc(
                                      db,
                                      `workspaces_data/${
                                        selectedWorkspace!.id
                                      }/windows`,
                                      win.id
                                    )
                                  );
                              }}
                              className="absolute -top-2 -right-2 bg-red-600 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition"
                            >
                              <X size={10} />
                            </button>
                          )}
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
      {modalType === "folder" || modalType === "workspace" ? (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId="root"
          onClose={() => setModalType(null)}
          onSuccess={() => setModalType(null)}
        />
      ) : null}
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
