import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  Activity,
  ArrowUpCircle,
  Check,
  CheckSquare,
  Edit2,
  Eraser,
  ExternalLink,
  FolderPlus,
  Globe,
  Inbox as InboxIcon,
  LifeBuoy,
  Loader2,
  LogOut,
  Monitor,
  PlusCircle,
  Settings,
  Square,
  Trash2,
  VenetianMask,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CreateItemModal } from "../components/CreateItemModal";
import { LoginForm } from "../components/LoginForm";
import { SidebarItem } from "../components/SidebarItem";
import { auth, db } from "../lib/firebase";
import { NexusService } from "../services/nexusService";
import { NexusItem, Profile, WorkspaceWindow } from "../types";

// --- Profile Manager Modal ---
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
      className="bg-transparent p-0 backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm open:animate-in open:fade-in open:zoom-in-95 m-auto"
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

  // INBOX STATES
  const [inboxData, setInboxData] = useState<any>(null);
  const [isViewingInbox, setIsViewingInbox] = useState(false);
  const [isViewingIncognito, setIsViewingIncognito] = useState(false);

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
  const [isProcessingMove, setIsProcessingMove] = useState(false);
  const [isInboxDragOver, setIsInboxDragOver] = useState(false);
  const [inboxDropStatus, setInboxDropStatus] = useState<
    "valid" | "invalid" | null
  >(null);
  const [isInboxSyncing, setIsInboxSyncing] = useState(false);

  const rootDragCounter = useRef(0);
  const inboxDragCounter = useRef(0);

  // --- PERSISTENCE & INIT ---
  useEffect(() => {
    const lastProfile = localStorage.getItem("lastActiveProfileId");
    if (lastProfile) setActiveProfile(lastProfile);
  }, []);

  useEffect(() => {
    if (activeProfile)
      localStorage.setItem("lastActiveProfileId", activeProfile);
  }, [activeProfile]);

  const applyState = useCallback((state: any) => {
    if (state.profiles) setProfiles(state.profiles);
    if (state.items) setItems(state.items);
    if (state.inbox) setInboxData(state.inbox);
  }, []);

  // --- AUTO-OPEN WORKSPACE FROM URL PARAMS ---
  useEffect(() => {
    // Dette tjekker om dashboardet blev åbnet med ?workspaceId=XYZ
    if (items.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const wsId = params.get("workspaceId");
      const winId = params.get("windowId"); // Intern ID

      if (wsId) {
        const targetWs = items.find((i) => i.id === wsId);
        if (targetWs && selectedWorkspace?.id !== targetWs.id) {
          handleWorkspaceClick(targetWs);
          // Hvis vi også har et specifikt window ID, sæt det (når windows er loadet)
          if (winId) {
            // Bemærk: Vi sætter dette i en separat useEffect eller venter på windows load
            // Men vi gemmer det i session storage eller state midlertidigt
            setSelectedWindowId(winId);
          }
        }
      }
    }
  }, [items]); // Kører når items er loadet

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        chrome.windows.getCurrent(
          (win) => win.id && setCurrentWindowId(win.id)
        );
        chrome.runtime.sendMessage(
          { type: "GET_LATEST_STATE" },
          (state) => state && applyState(state)
        );
      }
    });

    const messageListener = (msg: any) => {
      if (msg.type === "STATE_UPDATED") applyState(msg.payload);
      if (msg.type === "WORKSPACE_WINDOWS_UPDATED") {
        if (
          selectedWorkspace &&
          msg.payload.workspaceId === selectedWorkspace.id
        ) {
          setWindows(msg.payload.windows);
        }
      }
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
  }, [applyState, selectedWorkspace]);

  useEffect(() => {
    if (selectedWorkspace) {
      chrome.runtime.sendMessage({
        type: "WATCH_WORKSPACE",
        payload: selectedWorkspace.id,
      });
    }
  }, [selectedWorkspace]);

  useEffect(() => {
    if (
      selectedWorkspace &&
      !isViewingInbox &&
      !isViewingIncognito &&
      windows.length > 0 &&
      !selectedWindowId
    ) {
      // Tjek URL params igen for safety, hvis den ikke blev sat før
      const params = new URLSearchParams(window.location.search);
      const preselect = params.get("windowId");

      if (preselect && windows.some((w) => w.id === preselect)) {
        setSelectedWindowId(preselect);
      } else {
        const sorted = [...windows].sort(
          (a: any, b: any) => (a.index || 0) - (b.index || 0)
        );
        if (sorted[0]?.id) setSelectedWindowId(sorted[0].id);
      }
    }
  }, [
    windows,
    selectedWorkspace,
    isViewingInbox,
    isViewingIncognito,
    selectedWindowId,
  ]);

  // --- FILTERED DATA HELPERS ---
  const getFilteredInboxTabs = (incognitoMode: boolean) => {
    if (!inboxData?.tabs) return [];
    return inboxData.tabs.filter((t: any) =>
      incognitoMode ? t.isIncognito : !t.isIncognito
    );
  };

  // --- ACTIONS ---
  const handleWorkspaceClick = (item: NexusItem) => {
    if (selectedWorkspace?.id === item.id) return;
    setIsViewingInbox(false);
    setIsViewingIncognito(false);
    setSelectedWindowId(null);
    setWindows([]);
    setSelectedWorkspace(item);
  };

  const handleSidebarTabDrop = async (targetItem: NexusItem | "global") => {
    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (!tabJson) return;
    const tab = JSON.parse(tabJson);

    // Strict source
    const strictSourceId =
      isViewingInbox || isViewingIncognito
        ? "global"
        : selectedWindowId || "global";

    const targetWorkspaceId =
      targetItem === "global" ? "global" : targetItem.id;

    // RETTET GUARD: Tillad global -> global HVIS status ændres (Incognito -> Inbox)
    if (strictSourceId === "global" && targetWorkspaceId === "global") {
      // Hvis vi trækker Incognito -> Inbox (Global), så fortsæt.
      // Hvis begge er "Inbox" (normal), så stop.
      if (!tab.isIncognito) return;
    }

    setIsProcessingMove(true);
    if (targetItem === "global") setIsInboxSyncing(true);

    try {
      const cleanTab = {
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        isIncognito: false, // Always remove incognito flag when moving to workspace/inbox
      };

      let targetPhysicalWindowId = null;

      if (targetWorkspaceId === "global") {
        // Drop to Inbox (always becomes normal inbox tab)
        const snap = await getDoc(doc(db, "inbox_data", "global"));
        const currentTabs = snap.exists() ? snap.data().tabs || [] : [];

        // Simpel dublet check på URL
        if (
          !currentTabs.some(
            (t: any) => t.url === cleanTab.url && !t.isIncognito
          )
        ) {
          await setDoc(
            doc(db, "inbox_data", "global"),
            { tabs: [...currentTabs, cleanTab], lastUpdate: serverTimestamp() },
            { merge: true }
          );
        }
      } else {
        // Drop to Workspace
        const snap = await getDocs(
          collection(db, "workspaces_data", targetWorkspaceId, "windows")
        );
        let targetInternalId = "";

        if (!snap.empty) {
          const firstWin = snap.docs[0];
          targetInternalId = firstWin.id;
          await updateDoc(firstWin.ref, {
            tabs: [...(firstWin.data().tabs || []), cleanTab],
          });
        } else {
          const newRef = doc(
            collection(db, "workspaces_data", targetWorkspaceId, "windows")
          );
          targetInternalId = newRef.id;
          await setDoc(newRef, {
            id: newRef.id,
            tabs: [cleanTab],
            isActive: false,
            lastActive: serverTimestamp(),
          });
        }

        const mapping = activeMappings.find(
          ([_id, mapData]: any) =>
            mapData.workspaceId === targetWorkspaceId &&
            mapData.internalWindowId === targetInternalId
        );

        if (mapping) {
          targetPhysicalWindowId = mapping[0];
          await chrome.tabs.create({
            windowId: targetPhysicalWindowId,
            url: cleanTab.url,
            active: false,
          });
        }
      }

      // Source Removal
      if (strictSourceId === "global") {
        const snap = await getDoc(doc(db, "inbox_data", "global"));
        if (snap.exists()) {
          // Remove exact match (url + isIncognito)
          const filtered = (snap.data().tabs || []).filter(
            (t: any) =>
              t.url !== tab.url ||
              (t.isIncognito || false) !== (tab.isIncognito || false)
          );
          await updateDoc(doc(db, "inbox_data", "global"), { tabs: filtered });
        }
      } else if (selectedWorkspace && selectedWindowId) {
        const winRef = doc(
          db,
          "workspaces_data",
          selectedWorkspace.id,
          "windows",
          selectedWindowId
        );
        const snap = await getDoc(winRef);
        if (snap.exists()) {
          const filtered = (snap.data().tabs || []).filter(
            (t: any) => t.url !== cleanTab.url
          );
          await updateDoc(winRef, { tabs: filtered });
        }
      }

      // Hvis vi trækker FRA incognito, skal vi lukke den fysiske fane hvis den findes
      chrome.runtime.sendMessage({
        type: "CLOSE_PHYSICAL_TABS",
        payload: { urls: [cleanTab.url], internalWindowId: strictSourceId },
      });
    } finally {
      setIsProcessingMove(false);
      setIsInboxSyncing(false);
      window.sessionStorage.removeItem("draggedTab");
    }
  };

  const handleTabDrop = async (targetWinId: string) => {
    setDropTargetWinId(null);
    const tabJson = window.sessionStorage.getItem("draggedTab");
    if (!tabJson) return;
    const tab = JSON.parse(tabJson);

    const strictSourceId =
      isViewingInbox || isViewingIncognito ? "global" : selectedWindowId;

    if (!strictSourceId || strictSourceId === targetWinId) return;

    setIsProcessingMove(true);
    try {
      const sourceMapping = activeMappings.find(
        ([_, m]) => m.internalWindowId === strictSourceId
      );
      const targetMapping = activeMappings.find(
        ([_, m]) => m.internalWindowId === targetWinId
      );

      // Clean incognito flag when moving to workspace window
      const cleanTab = { ...tab, isIncognito: false };

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
          cleanTab,
          selectedWorkspace?.id || "global",
          strictSourceId,
          selectedWorkspace?.id || "global",
          targetWinId
        );
        if (sourceMapping)
          chrome.runtime.sendMessage({
            type: "CLOSE_PHYSICAL_TABS",
            payload: { urls: [tab.url], internalWindowId: strictSourceId },
          });
      }
    } finally {
      window.sessionStorage.removeItem("draggedTab");
      setIsProcessingMove(false);
    }
  };

  const isViewingCurrent = activeMappings.some(
    ([id, m]: any) =>
      id === currentWindowId && m.internalWindowId === selectedWindowId
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

      <aside className="w-96 border-r border-slate-700 bg-slate-800 flex flex-col shrink-0 shadow-2xl z-20">
        <div className="p-6 border-b border-slate-700 font-black text-white text-xl uppercase tracking-tighter flex items-center gap-3">
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
                setActiveProfile(e.target.value);
                setSelectedWorkspace(null);
                setIsViewingInbox(false);
                setIsViewingIncognito(false);
              }}
              className="flex-1 bg-slate-700 p-2 rounded-xl border border-slate-600 text-sm outline-none text-white"
            >
              {profiles.map((p: Profile) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setModalType("profiles")}
              className="p-2 text-slate-400 hover:text-blue-400 bg-slate-700 rounded-xl border border-slate-600"
            >
              <Settings size={18} />
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
                  <Loader2 size={20} className="animate-spin text-blue-400" />
                ) : (
                  <ArrowUpCircle
                    size={20}
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
                      if (confirm("Nulstil hierarki?")) {
                        const b = writeBatch(db);
                        items
                          .filter(
                            (i) =>
                              i.profileId === activeProfile &&
                              i.parentId !== "root"
                          )
                          .forEach((it) =>
                            b.update(doc(db, "items", it.id), {
                              parentId: "root",
                            })
                          );
                        await b.commit();
                      }
                    }}
                  >
                    <LifeBuoy size={14} className="hover:text-red-400" />
                  </button>
                  <button
                    onClick={() => {
                      setModalParentId("root");
                      setModalType("folder");
                    }}
                  >
                    <FolderPlus size={14} className="hover:text-white" />
                  </button>
                  <button
                    onClick={() => {
                      setModalParentId("root");
                      setModalType("workspace");
                    }}
                  >
                    <PlusCircle size={14} className="hover:text-white" />
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
                // Valid hvis ikke global, ELLER hvis global incognito (for at flytte til normal inbox)
                const isValid =
                  tab.sourceWorkspaceId !== "global" || tab.isIncognito;
                setInboxDropStatus(isValid ? "valid" : "invalid");
              } else setDropTargetWinId("global");
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
                setDropTargetWinId(null);
              }
            }}
            onDrop={(e) => {
              const tJ = window.sessionStorage.getItem("draggedTab");
              if (tJ) {
                e.preventDefault();
                setIsInboxDragOver(false);
                setInboxDropStatus(null);
                inboxDragCounter.current = 0;

                const tab = JSON.parse(tJ);
                if (tab.sourceWorkspaceId !== "global" || tab.isIncognito)
                  handleSidebarTabDrop("global");
              } else handleTabDrop("global");
            }}
          >
            <label className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-2 block tracking-widest">
              Opsamling
            </label>

            {/* STANDARD INBOX */}
            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setIsViewingIncognito(false);
                setIsViewingInbox(true);
              }}
              className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all border mb-2 ${
                isViewingInbox
                  ? "bg-orange-600/20 text-orange-400 border-orange-500/50 shadow-lg"
                  : inboxDropStatus === "valid"
                  ? "bg-blue-600/20 border-blue-400 text-blue-400 scale-[1.02]"
                  : isInboxDragOver
                  ? "bg-slate-700 border-slate-500 text-slate-200"
                  : "hover:bg-slate-700 text-slate-400 border-transparent"
              }`}
            >
              {isInboxSyncing ? (
                <Loader2 size={16} className="animate-spin text-blue-400" />
              ) : (
                <InboxIcon size={16} />
              )}
              <span>Inbox ({getFilteredInboxTabs(false).length})</span>
            </div>

            {/* INCOGNITO VIEW */}
            <div
              onClick={() => {
                setSelectedWorkspace(null);
                setIsViewingInbox(false);
                setIsViewingIncognito(true);
              }}
              className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-sm transition-all border ${
                isViewingIncognito
                  ? "bg-purple-900/40 text-purple-400 border-purple-500/50 shadow-lg"
                  : "hover:bg-slate-700 text-slate-400 border-transparent"
              }`}
            >
              <VenetianMask size={16} />
              <span>Incognito ({getFilteredInboxTabs(true).length})</span>
            </div>
          </nav>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 uppercase">
            <Activity size={12} className="animate-pulse" /> Live Sync
          </div>
          <button
            onClick={() => auth.signOut()}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500"
          >
            <LogOut size={16} /> Log ud
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-900 relative">
        {isProcessingMove && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-500" size={48} />
          </div>
        )}

        {selectedWorkspace || isViewingInbox || isViewingIncognito ? (
          <>
            <header className="p-8 pb-4 flex justify-between items-end border-b border-slate-800 bg-slate-800/30">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-4xl font-bold text-white tracking-tight flex items-center gap-3">
                    {isViewingIncognito ? (
                      <>
                        <VenetianMask size={36} className="text-purple-500" />
                        <span>Incognito</span>
                      </>
                    ) : isViewingInbox ? (
                      "Inbox"
                    ) : (
                      selectedWorkspace?.name
                    )}
                  </h2>
                  {isViewingCurrent &&
                    !isViewingInbox &&
                    !isViewingIncognito && (
                      <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20 font-bold uppercase tracking-widest">
                        <Monitor size={10} className="inline mr-1" /> Dette
                        Vindue
                      </span>
                    )}
                </div>
                {!isViewingInbox && !isViewingIncognito && (
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
                        <div
                          onClick={() =>
                            setSelectedWindowId(
                              selectedWindowId === win.id ? null : win.id
                            )
                          }
                          className={`relative group px-4 py-3 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                            selectedWindowId === win.id ||
                            dropTargetWinId === win.id
                              ? "bg-blue-600/10 border-blue-500/50 shadow-lg"
                              : "bg-slate-800 border-slate-700 hover:border-slate-500"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-300">
                              Vindue {idx + 1}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {win.tabs?.length || 0} tabs
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              chrome.runtime.sendMessage({
                                type: "OPEN_SPECIFIC_WINDOW",
                                payload: {
                                  workspaceId: selectedWorkspace?.id,
                                  windowData: win,
                                  name: selectedWorkspace?.name,
                                  index: idx + 1,
                                },
                              });
                            }}
                            className="p-1.5 hover:bg-blue-500/20 rounded-lg text-slate-400 hover:text-blue-400"
                          >
                            <ExternalLink size={20} />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm("Slet vindue?"))
                                await deleteDoc(
                                  doc(
                                    db,
                                    `workspaces_data/${selectedWorkspace?.id}/windows`,
                                    win.id
                                  )
                                );
                            }}
                            className="absolute -top-2 -right-2 p-1.5 bg-slate-800 border border-slate-600 rounded-full text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                          >
                            <Trash2 size={12} />
                          </button>
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
                      className="h-14 w-14 flex items-center justify-center rounded-xl border border-dashed border-slate-700 hover:border-blue-500 text-slate-500 transition"
                    >
                      <PlusCircle size={24} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mb-1">
                <button
                  onClick={() => {
                    let list = [];
                    if (isViewingIncognito) list = getFilteredInboxTabs(true);
                    else if (isViewingInbox) list = getFilteredInboxTabs(false);
                    else
                      list =
                        windows.find((w) => w.id === selectedWindowId)?.tabs ||
                        [];

                    const allU = list.map((t: any) => t.url);
                    setSelectedUrls(
                      selectedUrls.length === allU.length ? [] : allU
                    );
                  }}
                  className={`p-2.5 bg-slate-800 border rounded-xl transition ${
                    selectedUrls.length > 0
                      ? "border-blue-500 text-blue-400"
                      : "border-slate-700 hover:text-blue-400"
                  }`}
                >
                  <CheckSquare size={20} />
                </button>
                {selectedUrls.length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm(`Slet ${selectedUrls.length} tabs?`)) {
                        const sId =
                          isViewingInbox || isViewingIncognito
                            ? "global"
                            : selectedWindowId;

                        // Physical Delete
                        chrome.runtime.sendMessage({
                          type: "CLOSE_PHYSICAL_TABS",
                          payload: {
                            urls: selectedUrls,
                            internalWindowId: sId,
                          },
                        });

                        // DB Delete
                        if (isViewingInbox || isViewingIncognito) {
                          const f = inboxData.tabs.filter(
                            (t: any) => !selectedUrls.includes(t.url)
                          );
                          await updateDoc(doc(db, "inbox_data", "global"), {
                            tabs: f,
                          });
                        } else if (selectedWorkspace && selectedWindowId) {
                          const w = windows.find(
                            (win) => win.id === selectedWindowId
                          );
                          if (w) {
                            const f = w.tabs.filter(
                              (t: any) => !selectedUrls.includes(t.url)
                            );
                            await updateDoc(
                              doc(
                                db,
                                "workspaces_data",
                                selectedWorkspace.id,
                                "windows",
                                selectedWindowId
                              ),
                              { tabs: f }
                            );
                          }
                        }
                        setSelectedUrls([]);
                      }
                    }}
                    className="flex items-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
                  >
                    <Trash2 size={16} /> Slet ({selectedUrls.length})
                  </button>
                )}

                {/* Ryd Inbox (Normal) */}
                {isViewingInbox && getFilteredInboxTabs(false).length > 0 && (
                  <button
                    onClick={async () => {
                      if (confirm("Ryd Inbox?")) {
                        const normalTabs = getFilteredInboxTabs(false);
                        const incognitoTabs = getFilteredInboxTabs(true); // Keep these

                        chrome.runtime.sendMessage({
                          type: "CLOSE_PHYSICAL_TABS",
                          payload: {
                            urls: normalTabs.map((t: any) => t.url),
                            internalWindowId: "global",
                          },
                        });

                        await updateDoc(doc(db, "inbox_data", "global"), {
                          tabs: incognitoTabs, // Restore only incognito tabs
                        });
                      }
                    }}
                    className="flex items-center gap-2 bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
                  >
                    <Eraser size={16} /> Ryd Inbox
                  </button>
                )}

                {/* Ryd Incognito */}
                {isViewingIncognito &&
                  getFilteredInboxTabs(true).length > 0 && (
                    <button
                      onClick={async () => {
                        if (confirm("Ryd Incognito liste?")) {
                          const normalTabs = getFilteredInboxTabs(false); // Keep these
                          const incognitoTabs = getFilteredInboxTabs(true);

                          chrome.runtime.sendMessage({
                            type: "CLOSE_PHYSICAL_TABS",
                            payload: {
                              urls: incognitoTabs.map((t: any) => t.url),
                              internalWindowId: "global",
                            },
                          });

                          await updateDoc(doc(db, "inbox_data", "global"), {
                            tabs: normalTabs, // Restore only normal tabs
                          });
                        }
                      }}
                      className="flex items-center gap-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
                    >
                      <Eraser size={16} /> Ryd Incognito
                    </button>
                  )}

                {!isViewingInbox && !isViewingIncognito && (
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
                    className="bg-blue-600 hover:bg-blue-500 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-600/20 text-white active:scale-95 transition"
                  >
                    Åbn Space
                  </button>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {(isViewingInbox
                  ? getFilteredInboxTabs(false)
                  : isViewingIncognito
                  ? getFilteredInboxTabs(true)
                  : windows.find((w) => w.id === selectedWindowId)?.tabs || []
                ).map((tab: any, i: number) => (
                  <div key={i} className="group relative">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm("Slet tab?")) {
                          const sId =
                            isViewingInbox || isViewingIncognito
                              ? "global"
                              : selectedWindowId!;

                          await NexusService.moveTabBetweenWindows(
                            tab,
                            selectedWorkspace?.id || "global",
                            sId,
                            "",
                            "global"
                          );

                          if (isViewingInbox || isViewingIncognito) {
                            const currentList = inboxData.tabs || [];
                            const f = currentList.filter(
                              (t2: any) =>
                                t2.url !== tab.url ||
                                (t2.isIncognito || false) !==
                                  (tab.isIncognito || false)
                            );
                            await updateDoc(doc(db, "inbox_data", "global"), {
                              tabs: f,
                            });

                            chrome.runtime.sendMessage({
                              type: "CLOSE_PHYSICAL_TABS",
                              payload: {
                                urls: [tab.url],
                                internalWindowId: "global",
                              },
                            });
                          }
                        }
                      }}
                      className="absolute -top-2 -right-2 z-30 bg-slate-700 border border-slate-600 text-slate-300 hover:text-red-400 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow-xl cursor-pointer"
                    >
                      <X size={12} />
                    </button>
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
                      draggable={true} // ENABLED DRAG
                      onDragStart={(e) => {
                        e.dataTransfer.setData("nexus/tab", "true");
                        window.sessionStorage.setItem(
                          "draggedTab",
                          JSON.stringify({
                            ...tab,
                            sourceWorkspaceId:
                              isViewingInbox || isViewingIncognito
                                ? "global"
                                : selectedWorkspace?.id,
                          })
                        );
                      }}
                      className={`bg-slate-800/60 p-4 rounded-2xl border cursor-grab active:cursor-grabbing ${
                        selectedUrls.includes(tab.url)
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-slate-700 hover:border-slate-500"
                      } flex flex-col gap-2 hover:bg-slate-800 transition group shadow-md pl-8`}
                    >
                      <div
                        className="flex items-center gap-3 cursor-pointer select-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Opens as standard tab (converted to normal)
                          chrome.tabs.create({ url: tab.url, active: true });
                        }}
                      >
                        <Globe
                          size={14}
                          className={`${
                            tab.isIncognito
                              ? "text-purple-400"
                              : "text-slate-500"
                          } group-hover:text-blue-400 shrink-0`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-200 pointer-events-none">
                            {tab.title}
                          </div>
                          <div className="truncate text-[10px] text-slate-500 italic font-mono pointer-events-none">
                            {tab.url}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
            <Monitor size={48} className="opacity-20" />
            <p className="text-lg font-medium">Vælg et space</p>
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
