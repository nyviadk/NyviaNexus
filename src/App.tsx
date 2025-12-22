import { useEffect, useState } from "react";
import { auth } from "./lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { LoginForm } from "./components/LoginForm";
import { SidebarItem } from "./components/SidebarItem";
import { Inbox } from "./components/Inbox";
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
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>("");
  const [items, setItems] = useState<NexusItem[]>([]);
  const [activeMappings, setActiveMappings] = useState<any[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [modalType, setModalType] = useState<"folder" | "workspace" | null>(
    null
  );

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        chrome.windows.getCurrent(
          (win) => win.id && setCurrentWindowId(win.id)
        );
        chrome.runtime.sendMessage({ type: "GET_LATEST_STATE" }, (state) => {
          if (state) {
            setProfiles(state.profiles);
            setItems(state.items);
            if (state.profiles.length > 0 && !activeProfile) {
              setActiveProfile(state.profiles[0].id);
            }
          }
        });
      }
    });

    const listener = (msg: any) => {
      if (msg.type === "STATE_UPDATED") {
        if (msg.payload.profiles) {
          setProfiles(msg.payload.profiles);
          if (msg.payload.profiles.length > 0 && !activeProfile) {
            setActiveProfile(msg.payload.profiles[0].id);
          }
        }
        if (msg.payload.items) setItems(msg.payload.items);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    const fetchMappings = () => {
      chrome.runtime.sendMessage({ type: "GET_ACTIVE_MAPPINGS" }, (m) => {
        if (m)
          setActiveMappings(
            m.map(([id, map]: any) => ({ windowId: id, ...map }))
          );
      });
    };
    fetchMappings();
    const interval = setInterval(fetchMappings, 2000);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      clearInterval(interval);
    };
  }, [activeProfile]);

  if (!user) return <LoginForm />;

  const currentMapping = activeMappings.find(
    (m) => m.windowId === currentWindowId
  );

  return (
    <div className="w-100 h-150 bg-slate-950 text-slate-200 flex flex-col font-sans overflow-hidden">
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => chrome.tabs.create({ url: "dashboard.html" })}
            className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 transition shadow-inner"
          >
            <LayoutDashboard size={18} />
          </button>
          <select
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="bg-slate-800 text-sm p-1 rounded border border-slate-700 outline-none"
          >
            {profiles.map((p: Profile) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-center">
          {currentMapping && (
            <button
              onClick={() =>
                chrome.runtime.sendMessage({
                  type: "FORCE_SYNC_ACTIVE_WINDOW",
                  payload: { windowId: currentWindowId },
                })
              }
              className="p-1 text-orange-400 hover:scale-110 transition"
            >
              <RotateCw size={20} />
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="p-1 hover:text-blue-400"
          >
            <RefreshCw size={18} />
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
        {currentMapping && (
          <div className="px-2 py-1 bg-blue-600/10 border border-blue-500/20 rounded text-[10px] text-blue-400 flex justify-between items-center">
            <span>
              Aktivt:{" "}
              <strong>
                {items.find((i) => i.id === currentMapping.workspaceId)?.name ||
                  "Space"}
              </strong>
            </span>
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
          </div>
        )}

        <section>
          <div className="flex justify-between items-center px-2 mb-2">
            <h2 className="text-xs font-bold uppercase text-slate-500">
              Workspaces
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setModalType("folder")}
                className="text-slate-500 hover:text-white"
              >
                <FolderPlus size={14} />
              </button>
              <button
                onClick={() => setModalType("workspace")}
                className="text-slate-500 hover:text-white"
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
                  onRefresh={() => {}}
                  onDragStateChange={() => {}}
                />
              ))}
          </div>
        </section>

        <Inbox
          activeProfile={activeProfile}
          items={items}
          onRefresh={() => {}}
        />
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
}
