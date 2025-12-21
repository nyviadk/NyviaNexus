import { useEffect, useState, useCallback } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import { CreateItemModal } from "../components/CreateItemModal";
import {
  LogOut,
  Globe,
  RotateCw,
  Activity,
  Monitor,
  PlusCircle,
  FolderPlus,
  X,
  Inbox as InboxIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { NexusItem, Profile, WorkspaceWindow } from "../types";

export const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [items, setItems] = useState<NexusItem[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<NexusItem | null>(
    null
  );
  const [modalType, setModalType] = useState<"folder" | "workspace" | null>(
    null
  );
  const [inboxData, setInboxData] = useState<any>(null);
  const [isViewingInbox, setIsViewingInbox] = useState(false);
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setupListeners();
        chrome.windows.getCurrent(
          (win) => win.id && setCurrentWindowId(win.id)
        );
      }
    });
  }, []);

  const setupListeners = useCallback(() => {
    onSnapshot(collection(db, "profiles"), (snap) => {
      const pList = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Profile)
      );
      setProfiles(pList);
      if (pList.length > 0 && !activeProfile) setActiveProfile(pList[0].id);
    });
    onSnapshot(collection(db, "items"), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NexusItem)))
    );
    onSnapshot(doc(db, "inbox_data", "global"), (snap) => {
      if (!isUpdating && snap.exists()) setInboxData(snap.data());
    });

    const int = setInterval(() => {
      chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_MAPPINGS" },
        (m) => m && setActiveMappings(m)
      );
    }, 1000);
    return () => clearInterval(int);
  }, [activeProfile, isUpdating]);

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
    if (!selectedWorkspace || isViewingInbox || isUpdating) return;
    return onSnapshot(
      collection(db, "workspaces_data", selectedWorkspace.id, "windows"),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as WorkspaceWindow)
        );
        setWindows(list);
        if (
          list.length > 0 &&
          (!selectedWindowId || !list.some((w) => w.id === selectedWindowId))
        ) {
          setSelectedWindowId(list[0].id);
        }
      }
    );
  }, [selectedWorkspace, isViewingInbox, isUpdating, selectedWindowId]);

  const handleMoveTab = async (index: number, direction: "left" | "right") => {
    setIsUpdating(true);
    const tabs = isViewingInbox
      ? [...inboxData.tabs]
      : [...(windows.find((w) => w.id === selectedWindowId)?.tabs || [])];
    const newIndex = direction === "left" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= tabs.length) {
      setIsUpdating(false);
      return;
    }
    [tabs[index], tabs[newIndex]] = [tabs[newIndex], tabs[index]];
    try {
      if (isViewingInbox) {
        await updateDoc(doc(db, "inbox_data", "global"), { tabs });
      } else if (selectedWorkspace && selectedWindowId) {
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
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTab = async (index: number, tabUrl: string) => {
    if (!confirm("Vil du slette denne tab?")) return;
    setIsUpdating(true);
    const currentTabs = isViewingInbox
      ? [...inboxData.tabs]
      : [...(windows.find((w) => w.id === selectedWindowId)?.tabs || [])];
    const updatedTabs = currentTabs.filter((_, i) => i !== index);
    try {
      if (!isViewingInbox && selectedWindowId) {
        chrome.runtime.sendMessage({
          type: "CLOSE_PHYSICAL_TAB",
          payload: { url: tabUrl, internalWindowId: selectedWindowId },
        });
      }
      if (isViewingInbox) {
        await updateDoc(doc(db, "inbox_data", "global"), { tabs: updatedTabs });
      } else if (selectedWorkspace && selectedWindowId) {
        await updateDoc(
          doc(
            db,
            "workspaces_data",
            selectedWorkspace.id,
            "windows",
            selectedWindowId
          ),
          { tabs: updatedTabs }
        );
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const TabCard = ({ tab, index }: { tab: any; index: number }) => (
    <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 flex flex-col gap-2 hover:border-blue-500/50 hover:bg-slate-900 transition group relative">
      <div
        className="flex items-center gap-3 cursor-pointer"
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
          onClick={() => handleDeleteTab(index, tab.url)}
          className="p-1 text-slate-600 hover:text-red-500 transition-colors"
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

  const currentWindowData = windows.find((w) => w.id === selectedWindowId);
  const isViewingCurrent = activeMappings.some(
    ([id, m]: any) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <aside className="w-72 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3 font-black text-white text-xl uppercase tracking-tighter">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg">
            N
          </div>{" "}
          NyviaNexus
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <select
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="w-full bg-slate-800 p-2 rounded border border-slate-700 text-sm outline-none"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <nav className="space-y-1">
            <div className="flex justify-between items-center px-2 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Dine Spaces
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
              <InboxIcon size={16} />
              <span>Inbox ({inboxData?.tabs?.length || 0})</span>
            </div>
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase tracking-tighter">
            <Activity size={12} className="animate-pulse" /> Live Sync Active
          </div>
          <button
            onClick={() => auth.signOut()}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition text-sm font-medium"
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
                    {windows.map((win, idx) => {
                      const isOpen = activeMappings.some(
                        ([_, m]: any) => m.internalWindowId === win.id
                      );
                      return (
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
                              {isOpen && (
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              )}
                            </button>
                            {!isOpen && (
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
                                },
                              })
                            }
                            className="text-[9px] text-slate-500 hover:text-blue-400 font-bold uppercase"
                          >
                            Åbn dette
                          </button>
                        </div>
                      );
                    })}
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
                      className="p-1 hover:text-blue-400 text-slate-500 transition self-start mt-1"
                    >
                      <PlusCircle size={20} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mb-1">
                {!isViewingInbox && (
                  <>
                    <button
                      onClick={() =>
                        chrome.runtime.sendMessage({
                          type: "FORCE_SYNC_ACTIVE_WINDOW",
                          payload: { windowId: currentWindowId },
                        })
                      }
                      className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:text-orange-400 transition"
                    >
                      <RotateCw size={20} />
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
      {modalType && (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId="root"
          onClose={() => setModalType(null)}
          onSuccess={() => setModalType(null)}
        />
      )}
    </div>
  );
};
