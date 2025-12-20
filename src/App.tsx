import { useEffect, useState } from "react";
import { auth, db } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";

import { LoginForm } from "./components/LoginForm";
import { SidebarItem } from "./components/SidebarItem";
import { Inbox } from "./components/Inbox";
import { IncognitoMove } from "./components/IncognitoMove";
import { CreateItemModal } from "./components/CreateItemModal";

import {
  RefreshCw,
  LogOut,
  FolderPlus,
  PlusCircle,
  RotateCw,
  LayoutDashboard,
} from "lucide-react";
import { NexusItem, Profile } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [items, setItems] = useState<NexusItem[]>([]);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState<"folder" | "workspace" | null>(
    null
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        fetchData();
        chrome.windows.getCurrent((win) => {
          if (win.id) setCurrentWindowId(win.id);
        });
      } else setLoading(false);
    });
    return unsub;
  }, [activeProfile]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const pSnap = await getDocs(collection(db, "profiles"));
      const pList = pSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Profile)
      );
      setProfiles(pList);
      if (pList.length > 0 && !activeProfile) setActiveProfile(pList[0].id);

      const iSnap = await getDocs(collection(db, "items"));
      const iList = iSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as NexusItem)
      );
      setItems(iList);

      chrome.runtime.sendMessage(
        { type: "GET_ACTIVE_MAPPINGS" },
        (mappings) => {
          if (mappings) {
            const formatted = mappings.map(([windowId, map]: any) => {
              const item = iList.find((i) => i.id === map.workspaceId);
              return { windowId, ...map, name: item?.name || "Ukendt" };
            });
            setActiveMappings(formatted);
          }
        }
      );
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: "dashboard.html" });
  };

  const handleForceSync = () => {
    if (currentWindowId) {
      chrome.runtime.sendMessage({
        type: "FORCE_SYNC_ACTIVE_WINDOW",
        payload: { windowId: currentWindowId },
      });
    }
  };

  if (!user) return <LoginForm />;
  const currentWindowMapping = activeMappings.find(
    (m) => m.windowId === currentWindowId
  );

  // Rettet Tailwind klasser til standard-shorthands (w-100, h-150)
  return (
    <div className="w-100 h-150 bg-slate-950 text-slate-200 flex flex-col font-sans overflow-hidden">
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex gap-2 items-center">
          <button
            onClick={openDashboard}
            className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition"
          >
            <LayoutDashboard size={18} />
          </button>
          <select
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="bg-slate-800 text-sm p-1 rounded border border-slate-700 outline-none"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 items-center">
          {currentWindowMapping && (
            <button
              onClick={handleForceSync}
              className="p-1 text-orange-400 hover:text-orange-300"
            >
              <RotateCw size={20} />
            </button>
          )}
          <button onClick={fetchData} className="p-1 hover:text-blue-400">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => auth.signOut()}
            className="p-1 hover:text-red-400"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-2 space-y-4">
        <IncognitoMove activeItems={activeMappings} />
        {currentWindowMapping && (
          <div className="px-2 py-1 bg-blue-600/10 border border-blue-500/20 rounded text-[10px] text-blue-400 flex justify-between items-center">
            <span>
              Aktivt: <strong>{currentWindowMapping.name}</strong>
            </span>
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
          </div>
        )}
        <section>
          <div className="flex justify-between items-center px-2 mb-2">
            <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              Workspaces
            </h2>
            <div className="flex gap-2 text-slate-500">
              <button
                onClick={() => setModalType("folder")}
                className="hover:text-white"
                title="Ny mappe"
              >
                <FolderPlus size={14} />
              </button>
              <button
                onClick={() => setModalType("workspace")}
                className="hover:text-white"
                title="Nyt workspace"
              >
                <PlusCircle size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {items
              .filter(
                (i) => i.profileId === activeProfile && i.parentId === "root"
              )
              .map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  allItems={items}
                  onRefresh={fetchData}
                />
              ))}
          </div>
        </section>
        <Inbox
          activeProfile={activeProfile}
          items={items}
          onRefresh={fetchData}
        />
      </main>

      {modalType && (
        <CreateItemModal
          type={modalType}
          activeProfile={activeProfile}
          parentId="root"
          onClose={() => setModalType(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
