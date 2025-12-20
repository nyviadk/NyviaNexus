import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import {
  LogOut,
  Globe,
  RotateCw,
  Activity,
  Monitor,
  PlusCircle,
  X,
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
  const [windows, setWindows] = useState<WorkspaceWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);

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

  const setupListeners = () => {
    onSnapshot(collection(db, "profiles"), (snap) =>
      setProfiles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Profile)))
    );
    onSnapshot(collection(db, "items"), (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NexusItem)))
    );
    setInterval(() => {
      chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_MAPPINGS" },
        (m) => m && setActiveMappings(m)
      );
    }, 2000);
  };

  useEffect(() => {
    if (!selectedWorkspace) return;
    return onSnapshot(
      collection(db, "workspaces_data", selectedWorkspace.id, "windows"),
      (snap) => {
        const winList = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as WorkspaceWindow)
        );
        setWindows(winList);
        if (winList.length > 0 && !selectedWindowId)
          setSelectedWindowId(winList[0].id);
      }
    );
  }, [selectedWorkspace]);

  const deleteGhost = async (e: React.MouseEvent, winId: string) => {
    e.stopPropagation();
    if (confirm("Slet dette inaktive vindues data?")) {
      await deleteDoc(
        doc(db, "workspaces_data", selectedWorkspace!.id, "windows", winId)
      );
    }
  };

  if (!user)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <LoginForm />
      </div>
    );

  const currentWindowData = windows.find((w) => w.id === selectedWindowId);
  const isViewingCurrent = activeMappings.some(
    ([winId, map]: any) =>
      winId === currentWindowId && map.internalWindowId === selectedWindowId
  );

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <aside className="w-72 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white">
            N
          </div>
          <div className="font-black text-white text-xl uppercase tracking-tighter">
            NyviaNexus
          </div>
        </div>
        <div className="p-4 flex-1 overflow-y-auto space-y-6">
          <select
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="w-full bg-slate-800 p-2 rounded border border-slate-700 text-sm"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <nav className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-2 block">
              Spaces
            </label>
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
                  onSelect={setSelectedWorkspace}
                />
              ))}
          </nav>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase">
            <Activity size={12} className="animate-pulse" /> Live Sync Active
          </div>
          <button
            onClick={() => auth.signOut()}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition text-sm"
          >
            <LogOut size={16} /> Log ud
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-950">
        {selectedWorkspace ? (
          <>
            <header className="p-8 pb-4 flex justify-between items-end border-b border-slate-900">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-4xl font-bold text-white tracking-tight">
                    {selectedWorkspace.name}
                  </h2>
                  {isViewingCurrent && (
                    <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full border border-blue-500/20 font-bold uppercase">
                      <Monitor size={10} className="inline mr-1" /> Dette Vindue
                    </span>
                  )}
                </div>
                <div className="flex gap-4 items-center">
                  {windows.map((win, idx) => {
                    const isOpen = activeMappings.some(
                      ([_, map]: any) => map.internalWindowId === win.id
                    );
                    return (
                      <div key={win.id} className="relative group">
                        <button
                          onClick={() => setSelectedWindowId(win.id)}
                          className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 ${
                            selectedWindowId === win.id
                              ? "bg-blue-600 text-white shadow-lg"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          Vindue {idx + 1}{" "}
                          {isOpen && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          )}
                        </button>
                        {!isOpen && (
                          <button
                            onClick={(e) => deleteGhost(e, win.id)}
                            className="absolute -top-2 -right-2 bg-red-600 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() =>
                      chrome.runtime.sendMessage({
                        type: "CREATE_NEW_WINDOW_IN_WORKSPACE",
                        payload: {
                          workspaceId: selectedWorkspace.id,
                          name: selectedWorkspace.name,
                        },
                      })
                    }
                    className="p-1 hover:text-blue-400 text-slate-500 transition"
                  >
                    <PlusCircle size={20} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    chrome.runtime.sendMessage({
                      type: "FORCE_SYNC_ACTIVE_WINDOW",
                      payload: { windowId: currentWindowId },
                    })
                  }
                  className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:text-orange-400"
                >
                  <RotateCw size={20} />
                </button>
                <button
                  onClick={() =>
                    chrome.runtime.sendMessage({
                      type: "OPEN_WORKSPACE",
                      payload: {
                        workspaceId: selectedWorkspace.id,
                        windows,
                        name: selectedWorkspace.name,
                      },
                    })
                  }
                  className="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition"
                >
                  Åbn Space
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentWindowData?.tabs.map((tab, i) => (
                  <div
                    key={i}
                    className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 hover:border-blue-500/50 transition"
                  >
                    <Globe size={16} className="text-slate-600" />
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
                      {tab.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-700 italic">
            Vælg et space
          </div>
        )}
      </main>
    </div>
  );
};
