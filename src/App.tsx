import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import {
  FolderPlus,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateItemModal } from "./components/CreateItemModal";
import { Inbox } from "./components/Inbox";
import { LoginForm } from "./components/LoginForm";
import { SidebarItem } from "./components/SidebarItem";
import { auth, db } from "./lib/firebase";
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
  // Vi bruger disse dummies til SidebarItem da DnD er begrænset i popup
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Filtrer items baseret på profil
  const filteredRootItems = useMemo(
    () =>
      items.filter(
        (i) => i.profileId === activeProfile && i.parentId === "root"
      ),
    [items, activeProfile]
  );

  useEffect(() => {
    // 1. Auth Listener & Data Subscription
    const authUnsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Hent nuværende vindue ID
        chrome.windows.getCurrent((win) => {
          if (win.id) setCurrentWindowId(win.id);
        });

        // Hent Profiler (Live Sync fra users/{uid}/profiles)
        const profilesRef = collection(db, "users", u.uid, "profiles");
        const unsubProfiles = onSnapshot(profilesRef, (snap) => {
          const p = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Profile[];
          setProfiles(p);

          // Sæt default profil hvis ingen er valgt
          if (p.length > 0) {
            const savedProfile = localStorage.getItem("lastActiveProfileId");
            if (savedProfile && p.some((prof) => prof.id === savedProfile)) {
              setActiveProfile(savedProfile);
            } else if (!activeProfile) {
              setActiveProfile(p[0].id);
            }
          }
        });

        // Hent Items (Live Sync fra users/{uid}/items)
        const itemsRef = collection(db, "users", u.uid, "items");
        const unsubItems = onSnapshot(itemsRef, (snap) => {
          const i = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as NexusItem[];
          setItems(i);
        });

        return () => {
          unsubProfiles();
          unsubItems();
        };
      }
    });

    // 2. Mapping Polling (Henter data fra Background Script/Storage)
    const fetchMappings = () => {
      chrome.runtime.sendMessage({ type: "GET_ACTIVE_MAPPINGS" }, (m) => {
        if (m && Array.isArray(m)) {
          setActiveMappings(
            m.map(([id, map]: any) => ({ windowId: id, ...map }))
          );
        }
      });
    };

    fetchMappings();
    const interval = setInterval(fetchMappings, 2000); // Poll hvert 2. sekund

    return () => {
      authUnsub();
      clearInterval(interval);
    };
  }, []); // Kører ved mount

  // Gem aktiv profil når den ændres
  useEffect(() => {
    if (activeProfile) {
      localStorage.setItem("lastActiveProfileId", activeProfile);
    }
  }, [activeProfile]);

  if (!user) return <LoginForm />;

  const currentMapping = activeMappings.find(
    (m) => m.windowId === currentWindowId
  );

  return (
    <div className="w-96 h-150 bg-slate-950 text-slate-200 flex flex-col font-sans overflow-hidden border-l border-slate-800">
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center shrink-0">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => chrome.tabs.create({ url: "dashboard.html" })}
            className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 transition shadow-inner"
            title="Åbn Dashboard"
          >
            <LayoutDashboard size={18} />
          </button>
          <select
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="bg-slate-800 text-sm p-1.5 rounded-lg border border-slate-700 outline-none text-white focus:border-blue-500 transition-colors max-w-30"
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
              className="p-1 text-orange-400 hover:text-orange-300 hover:bg-orange-900/20 rounded transition"
              title="Tving Synkronisering"
            >
              <RotateCw size={18} />
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition"
            title="Genindlæs Popup"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => auth.signOut()}
            className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition"
            title="Log ud"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar">
        {currentMapping && (
          <div className="mx-1 px-3 py-2 bg-blue-600/10 border border-blue-500/20 rounded-xl text-xs text-blue-400 flex justify-between items-center shadow-sm">
            <span className="truncate pr-2">
              Aktivt Space:{" "}
              <strong className="text-blue-300">
                {items.find((i) => i.id === currentMapping.workspaceId)?.name ||
                  currentMapping.workspaceName ||
                  "Space"}
              </strong>
            </span>
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
          </div>
        )}

        <section>
          <div className="flex justify-between items-center px-2 mb-2">
            <h2 className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              Workspaces
            </h2>
            <div className="flex gap-1">
              <button
                onClick={() => setModalType("folder")}
                className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition"
                title="Ny Mappe"
              >
                <FolderPlus size={16} />
              </button>
              <button
                onClick={() => setModalType("workspace")}
                className="p-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition"
                title="Nyt Space"
              >
                <PlusCircle size={16} />
              </button>
            </div>
          </div>
          <div className="space-y-0.5">
            {filteredRootItems.length > 0 ? (
              filteredRootItems.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  allItems={items}
                  onRefresh={() => {}}
                  onSelect={() => {
                    // I popup åbner vi dashboardet/vinduet via SidebarItem's indbyggede onClick logic
                    // som sender OPEN_WORKSPACE message
                  }}
                  onAddChild={() => {}} // Disabled i popup for simpelhed
                  onDragStateChange={setActiveDragId}
                  onDragEndCleanup={() => setActiveDragId(null)}
                  activeDragId={activeDragId}
                  onTabDrop={async () => {}} // Disabled i popup
                  onDeleteSuccess={() => {}}
                />
              ))
            ) : (
              <div className="text-xs text-slate-600 italic px-4 py-2">
                Ingen spaces i denne profil.
              </div>
            )}
          </div>
        </section>

        {/* Inbox component antages at være tilpasset users/{uid} i sin egen fil, 
            men vi sender props med hvis den kræver det */}
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
